package com.infinitecanvas.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.common.BizException;
import com.infinitecanvas.dto.TaskDtos;
import com.infinitecanvas.entity.*;
import com.infinitecanvas.gateway.OpenAiCompatImageAdapter;
import com.infinitecanvas.gateway.UpstreamException;
import com.infinitecanvas.mapper.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ImageTaskServiceTest {
    private final ObjectMapper json = new ObjectMapper();
    private final VideoTaskMapper tasks = mock(VideoTaskMapper.class);
    private final VideoModelMapper models = mock(VideoModelMapper.class);
    private final ChannelMapper channels = mock(ChannelMapper.class);
    private final FileObjectMapper files = mock(FileObjectMapper.class);
    private final VideoTaskEventMapper events = mock(VideoTaskEventMapper.class);
    private final BillingService billing = mock(BillingService.class);
    private final SettingService settings = mock(SettingService.class);
    private final FileStorageService storage = mock(FileStorageService.class);
    private final OpenAiCompatImageAdapter adapter = mock(OpenAiCompatImageAdapter.class);
    private final VideoTaskService views = mock(VideoTaskService.class);
    private final PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
    private final AtomicReference<VideoTask> persisted = new AtomicReference<>();
    private ImageTaskService service;
    private VideoModel model;
    private Channel channel;
    private static final Long USER = 7L;

    @BeforeEach void setup() throws Exception {
        when(manager.getTransaction(any())).thenAnswer(invocation -> new SimpleTransactionStatus());
        model = new VideoModel(); model.setId(1L); model.setChannelId(2L); model.setEnabled(1);
        model.setCapability("image"); model.setModelKey("gpt-image-2"); model.setUpstreamModel("image-upstream");
        model.setPricingRules("[{\"resolution\":\"1024x1024\",\"credits\":10}]");
        model.setDisplayName("Image Two");
        channel = new Channel(); channel.setId(2L); channel.setEnabled(1); channel.setCapabilities("[\"image\"]");
        when(models.selectCanonicalByModelKey("gpt-image-2", "image")).thenReturn(model);
        when(models.selectEnabledByModelKey("gpt-image-2", "image")).thenReturn(List.of(model));
        when(channels.selectById(2L)).thenReturn(channel);
        when(settings.getLong("task.max_concurrency_per_user", 2)).thenReturn(2L);
        when(tasks.insert(any())).thenAnswer(invocation -> {
            VideoTask task = invocation.getArgument(0); task.setId(10L); persisted.set(task); return 1;
        });
        when(tasks.selectById(10L)).thenAnswer(invocation -> persisted.get());
        when(tasks.selectByTaskNoAndUser(anyString(), eq(USER))).thenAnswer(invocation -> persisted.get());
        when(tasks.selectByUserAndIdempotencyKey(eq(USER), anyString())).thenAnswer(invocation -> persisted.get());
        when(tasks.finalizeSuccess(eq(10L), anyLong(), any())).thenAnswer(invocation -> {
            persisted.get().setStatus("SUCCEEDED"); persisted.get().setFileId(invocation.getArgument(1)); return 1;
        });
        when(tasks.failActive(eq(10L), eq("FAILED"), anyString(), anyString(), any(), anyList())).thenAnswer(invocation -> {
            if (!"RUNNING".equals(persisted.get().getStatus())) return 0;
            persisted.get().setStatus("FAILED"); persisted.get().setErrorCode(invocation.getArgument(2)); return 1;
        });
        when(billing.settle(USER, 10L, "unused", 10, 10)).thenReturn(true);
        when(billing.settle(eq(USER), eq(10L), anyString(), eq(10L), eq(10L))).thenReturn(true);
        when(billing.refund(eq(USER), eq(10L), anyString(), eq(10L), anyString())).thenReturn(true);
        VideoTaskService realViews = new VideoTaskService(tasks, events, models, channels, files,
                new PricingService(json), billing, settings, storage, null, null, json, manager);
        when(models.selectById(1L)).thenReturn(model);
        when(views.toView(any())).thenAnswer(invocation -> realViews.toView(invocation.getArgument(0)));
        when(adapter.generate(any(), anyLong(), anyString(), anyString(), anyString(), anyString(), anyList()))
                .thenReturn(json.readTree("{\"data\":[{\"b64_json\":\"" + Base64.getEncoder().encodeToString(png()) + "\"}]}"));
        FileObject generated = new FileObject(); generated.setId(44L);
        when(files.selectById(44L)).thenReturn(generated);
        when(storage.toView(generated)).thenReturn(new TaskDtos.FileView("file_fixture", "/api/files/file_fixture/content?sig=fixture",
                "image/png", 64L, 2, 3, null));
        when(storage.writeBytes(eq(USER), any(), eq("image/png"), anyString(), anyString(), eq(10L))).thenReturn(generated);
        service = new ImageTaskService(tasks, models, channels, files, events, new PricingService(json), billing,
                settings, storage, adapter, views, json, manager);
    }

    @Test void storesGeneratedImageAndSettlesOnlyAfterNetworkOutsideTransaction() {
        TaskDtos.TaskView view = service.create(USER, command(), "key", "", "req");
        assertEquals("succeeded", view.status()); assertTrue(view.taskNo().startsWith("img_"));
        assertEquals(26, view.taskNo().length()); assertEquals("image", view.params().get("capability"));
        assertNotNull(view.file()); assertEquals("image/png", view.file().contentType());
        assertTrue(view.file().url().startsWith("/api/files/"));
        assertEquals("1024x1024", view.params().get("size"));
        assertNull(persisted.get().getNextPollAt());
        var order = inOrder(manager, billing, adapter, storage, tasks);
        order.verify(manager).getTransaction(any()); order.verify(billing).lockAccount(USER);
        order.verify(tasks).insert(any()); order.verify(billing).hold(USER, 10L, view.taskNo(), 10L, "req");
        order.verify(manager).commit(any());
        order.verify(adapter).generate(eq(channel), eq(10L), eq(view.taskNo()), eq("image-upstream"), eq("draw"), eq("1024x1024"), eq(List.of()));
        order.verify(manager).getTransaction(any()); order.verify(billing).lockAccount(USER);
        order.verify(storage).writeBytes(eq(USER), any(), eq("image/png"), anyString(), anyString(), eq(10L));
        order.verify(billing).settle(USER, 10L, view.taskNo(), 10L, 10L); order.verify(manager).commit(any());
        verify(billing, never()).refund(any(), any(), anyString(), anyLong(), anyString());
    }

    @Test void upstreamFailurePersistsFailedAndRefundsWithoutSettlement() {
        when(adapter.generate(any(), anyLong(), anyString(), anyString(), anyString(), anyString(), anyList()))
                .thenThrow(new UpstreamException("UPSTREAM_BALANCE", "余额不足", 502, ""));
        TaskDtos.TaskView view = service.create(USER, command(), "key", "", "req");
        assertEquals("failed", view.status()); assertEquals("UPSTREAM_BALANCE", view.errorCode());
        verify(billing).refund(USER, 10L, view.taskNo(), 10L, "图片任务失败退款");
        verify(billing, never()).settle(any(), any(), anyString(), anyLong(), anyLong());
        verifyNoInteractions(storage);
    }

    @Test void duplicateRetryReturnsExistingWithoutSecondUpstreamCallOrHold() {
        var first = service.create(USER, command(), "key", "", "req");
        var retry = service.create(USER, command(), "key", "", "req");
        assertEquals(first.taskNo(), retry.taskNo());
        verify(adapter, times(1)).generate(any(), anyLong(), anyString(), anyString(), anyString(), anyString(), anyList());
        verify(billing, times(1)).hold(any(), any(), anyString(), anyLong(), anyString());
    }

    @Test void inFlightRetryReturnsRunningAndDoesNotGenerate() {
        service.create(USER, command(), "key", "", "req");
        persisted.get().setStatus("RUNNING"); clearInvocations(adapter, billing);
        assertEquals("running", service.create(USER, command(), "key", "", "req").status());
        verifyNoInteractions(adapter); verify(billing, never()).hold(any(), any(), anyString(), anyLong(), anyString());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"video", "llm", "unknown"})
    void crossCapabilityModelAndUnknownSizeAreRejectedBeforeCharging(String capability) {
        model.setCapability(capability);
        assertThrows(BizException.class, () -> service.create(USER, command(), "key", "", ""));
        model.setCapability("image");
        assertThrows(BizException.class, () -> service.create(USER,
                new ImageTaskService.CreateCommand("gpt-image-2", "draw", "2048x2048", List.of()), "key", "", ""));
        verify(billing, never()).hold(any(), any(), anyString(), anyLong(), anyString()); verifyNoInteractions(adapter);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"video", "llm", "unknown"})
    void classificationChangedAfterPreparationRefundsWithoutImageDispatch(String capability) {
        doAnswer(invocation -> { model.setCapability(capability); return 1; }).when(models).incrementLoad(1L);
        var view = service.create(USER, command(), "key", "", "req");
        assertEquals("failed", view.status());
        assertEquals("MODEL_CAPABILITY_CHANGED", view.errorCode());
        verifyNoInteractions(adapter, storage);
        verify(billing).refund(eq(USER), eq(10L), anyString(), eq(10L), anyString());
        verify(billing, never()).settle(any(), any(), anyString(), anyLong(), anyLong());
    }

    @Test void videoOnlyChannelIsRejected() {
        channel.setCapabilities("[\"video\"]");
        assertThrows(BizException.class, () -> service.create(USER, command(), "key", "", ""));
        verifyNoInteractions(adapter);
    }

    @Test void invalidBase64PayloadRefunds() throws Exception {
        when(adapter.generate(any(), anyLong(), anyString(), anyString(), anyString(), anyString(), anyList()))
                .thenReturn(json.readTree("{\"data\":[{\"b64_json\":\"bm90IGFuIGltYWdl\"}]}"));
        assertEquals("failed", service.create(USER, command(), "key", "", "").status());
        verify(billing).refund(eq(USER), eq(10L), anyString(), eq(10L), anyString());
    }

    @Test void reaperRefundsInterruptedImageOnlyOnce() {
        service.create(USER, command(), "key", "", ""); persisted.get().setStatus("RUNNING");
        when(tasks.selectExpiredImages(any(), eq(100))).thenReturn(List.of(persisted.get()));
        service.expireInterruptedTasks(); service.expireInterruptedTasks();
        verify(billing, times(1)).refund(eq(USER), eq(10L), anyString(), eq(10L), anyString());
    }

    @Test void imageAndVideoDetailCannotCrossCapabilities() {
        service.create(USER, command(), "key", "", "");
        var video = new VideoTaskService(tasks, events, models, channels, files, new PricingService(json),
                billing, settings, storage, null, null, json, manager);
        assertThrows(BizException.class, () -> video.detail(USER, persisted.get().getTaskNo()));
        persisted.get().setParamsJson("{\"capability\":\"video\"}");
        assertThrows(BizException.class, () -> service.get(USER, persisted.get().getTaskNo()));
    }

    @Test void publicImageCatalogReturnsExactPricingAndRequiresImageChannel() {
        when(models.selectEnabledByCapabilitySorted("image")).thenReturn(List.of(model));
        var catalog = new ModelService(models, channels, tasks, json);
        var result = catalog.listModels("image");
        assertEquals(1, result.size()); assertEquals("image", result.get(0).capability());
        assertEquals(List.of(Map.of("resolution", "1024x1024", "credits", 10)), result.get(0).pricing().get("rules"));
        channel.setCapabilities("[\"video\"]"); assertTrue(catalog.listModels("image").isEmpty());
    }

    @Test void storageFailureRefundsImmediately() {
        when(storage.writeBytes(eq(USER), any(), anyString(), anyString(), anyString(), eq(10L)))
                .thenThrow(new IllegalStateException("disk unavailable"));
        assertEquals("failed", service.create(USER, command(), "key", "", "").status());
        verify(billing).refund(eq(USER), eq(10L), anyString(), eq(10L), anyString());
        verify(billing, never()).settle(any(), any(), anyString(), anyLong(), anyLong());
    }

    @Test void urlResponseIsDownloadedAndStored() throws Exception {
        when(adapter.generate(any(), anyLong(), anyString(), anyString(), anyString(), anyString(), anyList()))
                .thenReturn(json.readTree("{\"data\":[{\"url\":\"https://images.example/result.png\"}]}"));
        when(adapter.download(eq("https://images.example/result.png"), eq(10L), anyString()))
                .thenReturn(new OpenAiCompatImageAdapter.ImageDownload(png(), "image/png"));
        assertEquals("succeeded", service.create(USER, command(), "key", "", "").status());
        verify(storage).writeBytes(eq(USER), any(), eq("image/png"), anyString(), anyString(), eq(10L));
    }

    @Test void foreignOrDeletedReferenceIsRejectedBeforeHold() {
        model.setSupportsReferenceImages(1); model.setMaxReferenceImages(1);
        assertThrows(BizException.class, () -> service.create(USER,
                new ImageTaskService.CreateCommand("gpt-image-2", "edit", "1024x1024", List.of("other-users-file")), "key", "", ""));
        verifyNoInteractions(adapter); verify(billing, never()).hold(any(), any(), anyString(), anyLong(), anyString());
    }

    @Test void changedPromptCannotReuseIdempotencyKey() {
        service.create(USER, command(), "key", "", "");
        assertThrows(BizException.class, () -> service.create(USER,
                new ImageTaskService.CreateCommand("gpt-image-2", "different", "1024x1024", List.of()), "key", "", ""));
        verify(billing, times(1)).hold(any(), any(), anyString(), anyLong(), anyString());
    }

    @Test void disabledCanonicalWithEnabledAlternateRouteRemainsDiscoverableAndGenerates() {
        model.setEnabled(0);
        VideoModel alternate = new VideoModel(); alternate.setId(3L); alternate.setChannelId(2L);
        alternate.setEnabled(1); alternate.setCapability("image"); alternate.setModelKey("gpt-image-2");
        alternate.setUpstreamModel("alternate-upstream"); alternate.setPricingRules(model.getPricingRules());
        when(models.selectEnabledByCapabilitySorted("image")).thenReturn(List.of(alternate));
        when(models.selectById(3L)).thenReturn(alternate);
        when(models.selectEnabledByModelKey("gpt-image-2", "image")).thenReturn(List.of(alternate));
        var catalog = new ModelService(models, channels, tasks, json).listModels("image");
        assertEquals(1, catalog.size()); assertEquals("Image Two", catalog.get(0).displayName());
        assertEquals(List.of(Map.of("resolution", "1024x1024", "credits", 10)), catalog.get(0).pricing().get("rules"));
        assertEquals("succeeded", service.create(USER, command(), "key", "", "").status());
        verify(adapter).generate(eq(channel), eq(10L), anyString(), eq("alternate-upstream"), eq("draw"), eq("1024x1024"), eq(List.of()));
    }

    private static ImageTaskService.CreateCommand command() {
        return new ImageTaskService.CreateCommand("gpt-image-2", "draw", "1024x1024", List.of());
    }
    private static byte[] png() throws Exception {
        var out = new ByteArrayOutputStream(); ImageIO.write(new BufferedImage(2, 3, BufferedImage.TYPE_INT_RGB), "png", out); return out.toByteArray();
    }
}
