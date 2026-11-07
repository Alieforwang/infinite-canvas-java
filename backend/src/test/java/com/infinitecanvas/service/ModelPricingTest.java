package com.infinitecanvas.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.dto.AdminDtos;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.entity.VideoModel;
import com.infinitecanvas.mapper.ChannelMapper;
import com.infinitecanvas.mapper.VideoModelMapper;
import com.infinitecanvas.mapper.VideoTaskMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class ModelPricingTest {
    private final VideoModelMapper models = mock(VideoModelMapper.class);
    private final ChannelMapper channels = mock(ChannelMapper.class);
    private final ObjectMapper json = new ObjectMapper();
    private final VideoTaskMapper tasks = mock(VideoTaskMapper.class);
    private final ModelService service = new ModelService(models, channels, tasks, json);

    @Test
    void pricingEditUpdatesWholeLogicalModelAndExposesRouteCost() {
        VideoModel route = route(2L, "veo");
        route.setCostPerUnit(new BigDecimal("25.5"));
        route.setCostQuotaType(2);
        route.setCostSyncedAt(LocalDateTime.of(2026, 11, 7, 0, 0));
        route.setCurrentLoad(3);
        stubRoute(route);

        var view = service.update(2L, request(Map.of("pricingRules",
                "[{\"resolution\":\"720p\",\"seconds\":8,\"credits\":100}]")));

        verify(models).updateLogicalPricing(route);
        assertEquals("veo", route.getModelKey());
        assertEquals(100, jsonRulesCredits(route));
        assertEquals(new BigDecimal("25.5"), view.costPerUnit());
        assertEquals(3, view.currentLoad());
        verify(models, never()).updateCost(any(), any(), any(), any());
    }

    @Test
    void routeOnlyEditDoesNotOverwriteLogicalPrices() {
        VideoModel route = route(2L, "veo");
        stubRoute(route);
        service.update(2L, request(Map.of("routeWeight", 50)));
        verify(models, never()).updateLogicalPricing(any());
    }

    @Test
    void joiningExistingGroupInheritsPriceAndPreservesRouteSpecification() {
        VideoModel route = route(2L, "old");
        VideoModel canonical = route(1L, "veo");
        canonical.setPricingRules("[{\"resolution\":\"720p\",\"seconds\":8,\"credits\":130}]");
        canonical.setMinChargeCredits(7L);
        route.setSupportedSeconds("[\"8\"]");
        stubRoute(route);
        when(models.selectCanonicalByModelKeyForUpdate("veo", "video")).thenReturn(canonical);

        service.update(2L, request(Map.of("modelKey", "veo")));

        assertEquals(130, jsonRulesCredits(route));
        assertEquals(7L, route.getMinChargeCredits());
        assertEquals("[\"8\"]", route.getSupportedSeconds());
        verify(models).updateLogicalPricing(route);
    }

    @Test
    void changingUpstreamIdentityInvalidatesOldCost() {
        VideoModel route = route(2L, "veo");
        route.setCostPerUnit(BigDecimal.ONE);
        route.setCostQuotaType(1);
        stubRoute(route);
        var view = service.update(2L, request(Map.of("upstreamModel", "veo-new")));
        verify(models).updateCost(eq(2L), isNull(), isNull(), isNull());
        assertNull(view.costPerUnit());
        assertNull(view.costQuotaType());
    }

    @Test
    void partialPriceEditMergesLockedLatestFieldsInsteadOfStaleRouteValues() {
        VideoModel stale = route(2L, "veo");
        VideoModel latest = route(1L, "veo");
        latest.setPricingRules("[{\"resolution\":\"720p\",\"seconds\":8,\"credits\":130}]");
        latest.setCreditsPerSecond(new BigDecimal("17"));
        latest.setResolutionFactors("{\"720p\":2}");
        latest.setAudioFactor(new BigDecimal("1.5"));
        latest.setMinChargeCredits(20L);
        stubRoute(stale);
        when(models.selectCanonicalByModelKeyForUpdate("veo", "video")).thenReturn(latest);

        service.update(2L, request(Map.of("minChargeCredits", 50L)));

        assertEquals(130, jsonRulesCredits(stale));
        assertEquals(new BigDecimal("17"), stale.getCreditsPerSecond());
        assertEquals("{\"720p\":2}", stale.getResolutionFactors());
        assertEquals(new BigDecimal("1.5"), stale.getAudioFactor());
        assertEquals(50L, stale.getMinChargeCredits());
        assertEquals("[\"8\"]", stale.getSupportedSeconds());
        verify(models).updateLogicalPricing(stale);
    }

    @Test
    void manualRouteCreationInheritsCanonicalPriceButKeepsItsOwnSpecs() {
        VideoModel canonical = route(1L, "veo");
        canonical.setPricingRules("[{\"resolution\":\"720p\",\"seconds\":8,\"credits\":130}]");
        canonical.setMinChargeCredits(7L);
        stubRoute(canonical);
        when(models.selectCanonicalByModelKeyForUpdate("veo", "video")).thenReturn(canonical);
        doAnswer(call -> {
            VideoModel created = call.getArgument(0);
            created.setId(9L);
            return 1;
        }).when(models).insert(any());

        var created = service.create(request(Map.of("channelId", 7L, "modelKey", "veo",
                "upstreamModel", "another-upstream", "displayName", "Veo alternate",
                "supportedSeconds", "[\"4\"]")));

        assertEquals(7L, created.minChargeCredits());
        assertEquals("[\"4\"]", created.supportedSeconds());
        verify(models).updateLogicalPricing(argThat(model -> model.getId() == 9L
                && jsonRulesCredits(model) == 130 && "[\"4\"]".equals(model.getSupportedSeconds())));
    }

    @Test
    void duplicateRouteIsRejectedBeforeAnInsertOrGroupPriceWrite() {
        VideoModel existing = route(1L, "veo");
        stubRoute(existing);
        when(models.selectByChannelAndUpstream(7L, "veo-upstream")).thenReturn(existing);
        assertThrows(com.infinitecanvas.common.BizException.class, () -> service.create(request(Map.of(
                "channelId", 7L, "upstreamModel", "veo-upstream", "displayName", "Duplicate"))));
        verify(models, never()).insert(any());
        verify(models, never()).updateLogicalPricing(any());
    }

    @Test
    void adminLoadReadsActualTasksInsteadOfLegacyCounter() {
        VideoModel route = route(2L, "veo");
        route.setCurrentLoad(999);
        stubRoute(route);
        when(models.selectAllSorted()).thenReturn(List.of(route));
        when(tasks.countActiveByModel(2L)).thenReturn(3L);
        assertEquals(3, service.adminList().get(0).currentLoad());
    }

    @Test
    void capabilityChangeInvalidatesCachedCostAndUnit() {
        VideoModel route = route(2L, "veo");
        route.setCostPerUnit(BigDecimal.TEN);
        route.setCostQuotaType(2);
        stubRoute(route);
        channels.selectById(7L).setCapabilities("[\"video\",\"image\"]");
        var changed = service.update(2L, request(Map.of("capability", "image")));
        assertNull(changed.costPerUnit());
        assertNull(changed.costQuotaType());
        verify(models).updateCost(2L, null, null, null);
    }

    @Test
    void zeroWeightedRoutesDoNotAdvertiseAnUnavailableLogicalModel() {
        VideoModel disabledWeight = route(2L, "veo");
        disabledWeight.setRouteWeight(0);
        stubRoute(disabledWeight);
        channels.selectById(7L).setEnabled(1);
        when(models.selectEnabledByCapabilitySorted("video")).thenReturn(List.of(disabledWeight));
        assertTrue(service.listVideoModels().isEmpty());
        verify(models, never()).selectCanonicalByModelKey(anyString(), anyString());
    }

    private int jsonRulesCredits(VideoModel model) {
        try { return json.readTree(model.getPricingRules()).get(0).get("credits").asInt(); }
        catch (Exception ex) { throw new AssertionError(ex); }
    }

    private void stubRoute(VideoModel route) {
        when(models.selectById(route.getId())).thenReturn(route);
        Channel channel = new Channel();
        channel.setId(7L);
        channel.setCapabilities("[\"video\"]");
        when(channels.selectById(7L)).thenReturn(channel);
        when(channels.selectByIdForUpdate(7L)).thenReturn(channel);
    }

    private AdminDtos.ModelRequest request(Map<String, Object> values) {
        return json.convertValue(values, AdminDtos.ModelRequest.class);
    }

    private VideoModel route(Long id, String key) {
        VideoModel route = new VideoModel();
        route.setId(id);
        route.setChannelId(7L);
        route.setModelKey(key);
        route.setUpstreamModel("veo-upstream");
        route.setCapability("video");
        route.setDisplayName(key);
        route.setEnabled(1);
        route.setSort(0);
        route.setRouteWeight(100);
        route.setCreditsPerSecond(BigDecimal.TEN);
        route.setResolutionFactors("{\"720p\":1}");
        route.setResolutionDefault("720p");
        route.setAudioFactor(BigDecimal.ONE);
        route.setSupportedSeconds("[\"8\"]");
        route.setSupportedSizes("[\"1280x720\"]");
        route.setSupportsAudio(0);
        route.setSupportsWatermark(0);
        route.setSupportsFirstLastFrame(0);
        route.setSupportsReferenceImages(1);
        route.setMaxReferenceImages(1);
        route.setPricingRules("[]");
        route.setMinChargeCredits(1L);
        return route;
    }
}
