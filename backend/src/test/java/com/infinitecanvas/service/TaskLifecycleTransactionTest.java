package com.infinitecanvas.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.entity.*;
import com.infinitecanvas.gateway.OpenAiCompatVideoAdapter;
import com.infinitecanvas.mapper.*;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TaskLifecycleTransactionTest {
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"llm", "unknown", "image"})
    void reclassifiedQueuedVideoRefundsExactlyOnceWithoutUpstreamDispatch(String capability) {
        try (var store = new LifecycleStore()) {
            store.jdbc.update("UPDATE lifecycle_task SET status = 'CREATED'");
            var route = new VideoModel(); route.setId(1L); route.setCapability(capability); route.setEnabled(1);
            var channel = new Channel(); channel.setId(2L); channel.setEnabled(1);
            when(store.models.selectById(1L)).thenReturn(route);
            when(store.channels.selectById(2L)).thenReturn(channel);
            var stale = store.tasks.selectById(10L);
            store.video.process(stale);
            store.video.process(stale);
            store.assertRefunded("FAILED", 1);
            verifyNoInteractions(store.videoAdapter);
        }
    }

    @Test
    void videoSuccessRollsBackStateLoadReferenceAndSettlementWhenEventFails() {
        try (var store = new LifecycleStore()) {
            doThrow(new IllegalStateException("event unavailable")).when(store.events).insert(any());

            assertThrows(IllegalStateException.class, () -> store.video.finalizeSuccess(10L, 20L));

            store.assertActiveHold();
        }
    }

    @Test
    void videoSuccessSettlesAndDecrementsOnlyOnceEvenWithStaleFailure() {
        try (var store = new LifecycleStore()) {
            VideoTask stale = store.tasks.selectById(10L);
            store.video.finalizeSuccess(10L, 20L);
            store.video.finalizeSuccess(10L, 20L);
            store.video.fail(stale, "UPSTREAM_ERROR", "late failure");
            assertEquals("SUCCEEDED", store.state());
            assertEquals(0, store.number("SELECT current_load FROM lifecycle_model"));
            assertEquals(1, store.number("SELECT ref_count FROM lifecycle_file"));
            assertEquals(0, store.number("SELECT frozen FROM lifecycle_account"));
            assertEquals(10, store.number("SELECT consumed FROM lifecycle_account"));
            assertEquals(1, store.number("SELECT COUNT(*) FROM lifecycle_ledger"));
            assertEquals(1, store.number("SELECT COUNT(*) FROM lifecycle_event"));
            verify(store.files, times(1)).updateById(any());
        }
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"CANCELLED", "CREATED", "SUBMITTING", "SUBMIT_UNKNOWN"})
    void losingVideoSuccessDoesNotReferenceItsResultFile(String status) {
        try (var store = new LifecycleStore()) {
            store.jdbc.update("UPDATE lifecycle_task SET status = ?", status);
            store.video.finalizeSuccess(10L, 20L);
            assertEquals(status, store.state());
            assertEquals(0, store.number("SELECT ref_count FROM lifecycle_file"));
            assertEquals(0, store.number("SELECT COUNT(*) FROM lifecycle_ledger"));
            assertEquals(0, store.number("SELECT COUNT(*) FROM lifecycle_event"));
            verify(store.files, never()).updateById(any());
        }
    }

    @Test
    void videoFailureRollsBackStateLoadAndRefundWhenEventFails() {
        try (var store = new LifecycleStore()) {
            doThrow(new IllegalStateException("event unavailable")).when(store.events).insert(any());
            assertThrows(IllegalStateException.class, () -> store.video.fail(store.tasks.selectById(10L), "EXPIRED", "timeout"));
            store.assertActiveHold();
        }
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"UPSTREAM_ERROR,FAILED", "EXPIRED,EXPIRED"})
    void videoFailureAndExpiryRefundAndDecrementExactlyOnce(String code, String expected) {
        try (var store = new LifecycleStore()) {
            VideoTask stale = store.tasks.selectById(10L);
            store.video.fail(stale, code, "failed");
            store.video.fail(stale, code, "failed");
            store.video.finalizeSuccess(10L, 20L);
            assertEquals(expected, store.state());
            assertEquals(0, store.number("SELECT current_load FROM lifecycle_model"));
            assertEquals(0, store.number("SELECT ref_count FROM lifecycle_file"));
            assertEquals(100, store.number("SELECT available FROM lifecycle_account"));
            assertEquals(0, store.number("SELECT frozen FROM lifecycle_account"));
            assertEquals(1, store.number("SELECT COUNT(*) FROM lifecycle_ledger WHERE biz_type = 'REFUND'"));
            assertEquals(1, store.number("SELECT COUNT(*) FROM lifecycle_event"));
        }
    }

    @Test
    void userCancellationRefundsOnceAndPreservesOwnershipAndCapabilityChecks() {
        try (var store = new LifecycleStore()) {
            assertThrows(com.infinitecanvas.common.BizException.class, () -> store.video.cancel(8L, "task-10"));
            store.assertActiveHold();
            store.video.cancel(7L, "task-10");
            assertThrows(com.infinitecanvas.common.BizException.class, () -> store.video.cancel(7L, "task-10"));
            store.assertRefunded("CANCELLED", 1);
            verify(store.tasks).cancelActive(eq(10L), any(), eq(false), anyList());
        }
    }

    @Test
    void administratorCancelsImagesThroughSharedLifecycleAndAuditsOnlyOnce() {
        try (var store = new LifecycleStore()) {
            store.jdbc.update("UPDATE lifecycle_task SET params_json = '{\"capability\":\"image\"}', status = 'RUNNING'");
            assertThrows(com.infinitecanvas.common.BizException.class, () -> store.video.cancel(7L, "task-10"));
            AdminTaskService admin = store.admin();
            admin.cancel("task-10", 99L);
            assertThrows(com.infinitecanvas.common.BizException.class, () -> admin.cancel("task-10", 99L));
            store.assertRefunded("CANCELLED", 1);
            verify(store.audit).record(eq("ADMIN"), eq(99L), eq("TASK_CANCEL"), eq("TASK"), eq("task-10"), eq("{}"), eq(""), nullable(String.class));
            verify(store.tasks).cancelActive(eq(10L), any(), eq(true), anyList());
            verify(store.events).insert(argThat(event -> "ADMIN".equals(event.getSource())));
        }
    }

    @Test
    void administratorAuditFailureRollsBackCancellationRefundLoadAndEvent() {
        try (var store = new LifecycleStore()) {
            doThrow(new IllegalStateException("audit unavailable")).when(store.audit)
                    .record(anyString(), anyLong(), anyString(), anyString(), anyString(), anyString(), anyString(), nullable(String.class));
            assertThrows(IllegalStateException.class, () -> store.admin().cancel("task-10", 99L));
            store.assertActiveHold();
        }
    }

    @Test
    void cancellationEventFailureRollsBackAllEarlierEffects() {
        try (var store = new LifecycleStore()) {
            doThrow(new IllegalStateException("event unavailable")).when(store.events).insert(any());
            assertThrows(IllegalStateException.class, () -> store.video.cancel(7L, "task-10"));
            store.assertActiveHold();
        }
    }

    @org.junit.jupiter.api.RepeatedTest(3)
    void concurrentSuccessAndCancellationHaveExactlyOneTerminalWinner() throws Exception {
        try (var store = new LifecycleStore()) {
            var start = new java.util.concurrent.CountDownLatch(1);
            var executor = java.util.concurrent.Executors.newFixedThreadPool(2);
            VideoTask stale = store.tasks.selectById(10L);
            try {
                var success = executor.submit(() -> { start.await(); store.video.finalizeSuccess(10L, 20L); return null; });
                var cancel = executor.submit(() -> {
                    start.await();
                    try { store.video.cancelTask(stale, true); }
                    catch (com.infinitecanvas.common.BizException ex) { assertEquals(409, ex.getHttpStatus()); }
                    return null;
                });
                start.countDown();
                success.get(5, java.util.concurrent.TimeUnit.SECONDS);
                cancel.get(5, java.util.concurrent.TimeUnit.SECONDS);
                boolean succeeded = "SUCCEEDED".equals(store.state());
                assertTrue(succeeded || "CANCELLED".equals(store.state()));
                assertEquals(0, store.number("SELECT current_load FROM lifecycle_model"));
                assertEquals(succeeded ? 1 : 0, store.number("SELECT ref_count FROM lifecycle_file"));
                assertEquals(0, store.number("SELECT frozen FROM lifecycle_account"));
                assertEquals(succeeded ? 10 : 0, store.number("SELECT consumed FROM lifecycle_account"));
                assertEquals(1, store.number("SELECT COUNT(*) FROM lifecycle_ledger"));
                assertEquals(1, store.number("SELECT COUNT(*) FROM lifecycle_event"));
            } finally { executor.shutdownNow(); }
        }
    }

    @Test
    void imageSuccessAndIdempotencyIncrementAndDecrementOnlyForNewWork() throws Exception {
        try (var store = new LifecycleStore()) {
            ImageTaskService image = store.images();
            image.create(7L, imageCommand(), "image-key", "", "request");
            image.create(7L, imageCommand(), "image-key", "", "request");
            assertEquals("SUCCEEDED", store.state());
            assertEquals(0, store.number("SELECT current_load FROM lifecycle_model"));
            assertEquals(1, store.number("SELECT ref_count FROM lifecycle_file"));
            assertEquals(10, store.number("SELECT consumed FROM lifecycle_account"));
            assertEquals(2, store.number("SELECT COUNT(*) FROM lifecycle_ledger"));
            verify(store.models, times(1)).incrementLoad(1L);
            verify(store.models, times(1)).decrementLoad(1L);
            verify(store.imageAdapter, times(1)).generate(any(), anyLong(), anyString(), anyString(), anyString(), anyString(), anyList());
        }
    }

    @Test
    void imageFailureRefundsAndReleasesLoadOnlyOnceAcrossIdempotentRetry() throws Exception {
        try (var store = new LifecycleStore()) {
            ImageTaskService image = store.images();
            doThrow(new IllegalStateException("upstream unavailable")).when(store.imageAdapter)
                    .generate(any(), anyLong(), anyString(), anyString(), anyString(), anyString(), anyList());
            image.create(7L, imageCommand(), "image-key", "", "");
            image.create(7L, imageCommand(), "image-key", "", "");
            store.assertRefunded("FAILED", 2);
            verify(store.models, times(1)).incrementLoad(1L);
            verify(store.models, times(1)).decrementLoad(1L);
        }
    }

    @Test
    void imageCompletionFailureRollsBackFileSettlementAndLoadBeforeRefunding() throws Exception {
        try (var store = new LifecycleStore()) {
            ImageTaskService image = store.images();
            doAnswer(inv -> {
                VideoTaskEvent event = inv.getArgument(0, VideoTaskEvent.class);
                if ("SUCCEEDED".equals(event.getToStatus())) throw new IllegalStateException("success event unavailable");
                return store.jdbc.update("INSERT INTO lifecycle_event VALUES (?)", event.getToStatus());
            }).when(store.events).insert(any());
            image.create(7L, imageCommand(), "image-key", "", "");
            store.assertRefunded("FAILED", 2);
            assertEquals(0, store.number("SELECT ref_count FROM lifecycle_file"));
            assertEquals(0, store.number("SELECT COUNT(*) FROM lifecycle_ledger WHERE biz_type = 'SETTLE'"));
            assertEquals(0, store.number("SELECT COUNT(*) FROM lifecycle_event WHERE to_status = 'SUCCEEDED'"));
        }
    }

    @Test
    void imagePreparationFailureRollsBackTaskHoldAndLoad() throws Exception {
        try (var store = new LifecycleStore()) {
            ImageTaskService image = store.images();
            doThrow(new IllegalStateException("initial event unavailable")).when(store.events).insert(any());
            assertThrows(IllegalStateException.class, () -> image.create(7L, imageCommand(), "image-key", "", ""));
            assertEquals(0, store.number("SELECT COUNT(*) FROM lifecycle_task"));
            assertEquals(0, store.number("SELECT current_load FROM lifecycle_model"));
            assertEquals(100, store.number("SELECT available FROM lifecycle_account"));
            assertEquals(0, store.number("SELECT frozen FROM lifecycle_account"));
            assertEquals(0, store.number("SELECT COUNT(*) FROM lifecycle_ledger"));
        }
    }

    @Test
    void interruptedImageTimeoutRefundsAndDecrementsOnlyOnce() throws Exception {
        try (var store = new LifecycleStore()) {
            ImageTaskService image = store.images();
            doThrow(new AssertionError("worker stopped")).when(store.imageAdapter)
                    .generate(any(), anyLong(), anyString(), anyString(), anyString(), anyString(), anyList());
            assertThrows(AssertionError.class, () -> image.create(7L, imageCommand(), "image-key", "", ""));
            assertEquals(1, store.number("SELECT current_load FROM lifecycle_model"));
            when(store.tasks.selectExpiredImages(any(), eq(100))).thenAnswer(inv -> {
                VideoTask task = store.tasks.selectById(10L);
                return "RUNNING".equals(task.getStatus()) ? List.of(task) : List.of();
            });
            image.expireInterruptedTasks(); image.expireInterruptedTasks();
            store.assertRefunded("FAILED", 2);
            verify(store.models, times(1)).decrementLoad(1L);
        }
    }

    @Test
    void imageCancellationDuringUpstreamPreventsLateResultReferenceAndSettlement() throws Exception {
        try (var store = new LifecycleStore()) {
            ImageTaskService image = store.images();
            doAnswer(inv -> {
                store.video.cancelTask(store.tasks.selectById(10L), true);
                return store.imageResponse;
            }).when(store.imageAdapter).generate(any(), anyLong(), anyString(), anyString(), anyString(), anyString(), anyList());
            image.create(7L, imageCommand(), "image-key", "", "");
            store.assertRefunded("CANCELLED", 2);
            assertEquals(0, store.number("SELECT ref_count FROM lifecycle_file"));
            verify(store.files, never()).updateById(any());
            verify(store.storage, never()).writeBytes(anyLong(), any(), anyString(), anyString(), anyString(), anyLong());
        }
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"success", "failure", "cancel"})
    void duplicateFinalizeLedgerRollsBackEveryTerminalSideEffect(String terminal) {
        try (var store = new LifecycleStore()) {
            store.jdbc.update("INSERT INTO lifecycle_ledger VALUES ('finalize:task-10', 'REFUND')");
            assertThrows(IllegalStateException.class, () -> {
                switch (terminal) {
                    case "success" -> store.video.finalizeSuccess(10L, 20L);
                    case "failure" -> store.video.fail(store.tasks.selectById(10L), "UPSTREAM_ERROR", "failure");
                    default -> store.video.cancel(7L, "task-10");
                }
            });
            store.assertActiveHold(1);
        }
    }

    private static ImageTaskService.CreateCommand imageCommand() {
        return new ImageTaskService.CreateCommand("image-basic", "draw", "1024x1024", List.of());
    }

    /** JDBC-backed mapper doubles share a real DataSourceTransactionManager and real BillingService. */
    private static final class LifecycleStore implements AutoCloseable {
        final JdbcTemplate jdbc;
        final DataSourceTransactionManager manager;
        final VideoTaskMapper tasks = mock(VideoTaskMapper.class);
        final VideoModelMapper models = mock(VideoModelMapper.class);
        final ChannelMapper channels = mock(ChannelMapper.class);
        final FileObjectMapper files = mock(FileObjectMapper.class);
        final VideoTaskEventMapper events = mock(VideoTaskEventMapper.class);
        final CreditAccountMapper accounts = mock(CreditAccountMapper.class);
        final CreditTransactionMapper transactions = mock(CreditTransactionMapper.class);
        final SettingService settings = mock(SettingService.class);
        final FileStorageService storage = mock(FileStorageService.class);
        final ObjectMapper json = new ObjectMapper();
        final AuditService audit = mock(AuditService.class);
        final OpenAiCompatVideoAdapter videoAdapter = mock(OpenAiCompatVideoAdapter.class);
        final com.infinitecanvas.gateway.OpenAiCompatImageAdapter imageAdapter = mock(com.infinitecanvas.gateway.OpenAiCompatImageAdapter.class);
        com.fasterxml.jackson.databind.JsonNode imageResponse;
        final BillingService billing;
        final VideoTaskService video;

        LifecycleStore() {
            var ds = new JdbcDataSource();
            ds.setURL("jdbc:h2:mem:lifecycle_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=5000");
            jdbc = new JdbcTemplate(ds);
            manager = new DataSourceTransactionManager(ds);
            jdbc.execute("CREATE TABLE lifecycle_task (id BIGINT PRIMARY KEY, task_no VARCHAR(64), user_id BIGINT, "
                    + "model_id BIGINT, channel_id BIGINT, status VARCHAR(24), held_credits BIGINT, file_id BIGINT, "
                    + "params_json VARCHAR(4000), request_hash VARCHAR(128), idempotency_key VARCHAR(128))");
            jdbc.execute("CREATE TABLE lifecycle_model (id BIGINT PRIMARY KEY, current_load INT)");
            jdbc.execute("CREATE TABLE lifecycle_file (id BIGINT PRIMARY KEY, ref_count INT)");
            jdbc.execute("CREATE TABLE lifecycle_account (user_id BIGINT PRIMARY KEY, available BIGINT, frozen BIGINT, consumed BIGINT)");
            jdbc.execute("CREATE TABLE lifecycle_ledger (idempotency_key VARCHAR(128) PRIMARY KEY, biz_type VARCHAR(24))");
            jdbc.execute("CREATE TABLE lifecycle_event (to_status VARCHAR(24))");
            jdbc.update("INSERT INTO lifecycle_task VALUES (10, 'task-10', 7, 1, 2, 'DOWNLOADING', 10, NULL, '{}', '', NULL)");
            jdbc.update("INSERT INTO lifecycle_model VALUES (1, 1)");
            jdbc.update("INSERT INTO lifecycle_file VALUES (20, 0)");
            jdbc.update("INSERT INTO lifecycle_account VALUES (7, 90, 10, 0)");

            when(tasks.selectById(anyLong())).thenAnswer(inv -> find("id = ?", inv.getArgument(0, Long.class)));
            when(tasks.selectByTaskNo(anyString())).thenAnswer(inv -> find("task_no = ?", inv.getArgument(0, String.class)));
            when(tasks.selectByTaskNoAndUser(anyString(), anyLong())).thenAnswer(inv ->
                    find("task_no = ? AND user_id = ?", inv.getArgument(0, String.class), inv.getArgument(1, Long.class)));
            when(tasks.selectByUserAndIdempotencyKey(anyLong(), anyString())).thenAnswer(inv ->
                    find("user_id = ? AND idempotency_key = ?", inv.getArgument(0, Long.class), inv.getArgument(1, String.class)));
            when(tasks.finalizeSuccess(anyLong(), anyLong(), any())).thenAnswer(inv -> jdbc.update(
                    "UPDATE lifecycle_task SET status = 'SUCCEEDED', file_id = ? WHERE id = ? "
                            + "AND status IN ('DOWNLOADING','RUNNING','QUEUED')",
                    inv.getArgument(1, Long.class), inv.getArgument(0, Long.class)));
            when(tasks.failActive(anyLong(), anyString(), anyString(), anyString(), any(), anyList())).thenAnswer(inv -> {
                VideoTask task = tasks.selectById(inv.getArgument(0));
                List<String> active = inv.getArgument(5);
                return task != null && active.contains(task.getStatus()) ? jdbc.update(
                        "UPDATE lifecycle_task SET status = ? WHERE id = ? AND status = ?",
                        inv.getArgument(1, String.class), task.getId(), task.getStatus()) : 0;
            });
            when(tasks.cancelActive(anyLong(), any(), anyBoolean(), anyList())).thenAnswer(inv -> {
                VideoTask task = tasks.selectById(inv.getArgument(0));
                List<String> active = inv.getArgument(3);
                return task != null && active.contains(task.getStatus()) ? jdbc.update(
                        "UPDATE lifecycle_task SET status = 'CANCELLED' WHERE id = ? AND status = ?",
                        task.getId(), task.getStatus()) : 0;
            });
            when(models.incrementLoad(anyLong())).thenAnswer(inv -> jdbc.update(
                    "UPDATE lifecycle_model SET current_load = current_load + 1 WHERE id = ?", inv.getArgument(0, Long.class)));
            when(models.decrementLoad(anyLong())).thenAnswer(inv -> jdbc.update(
                    "UPDATE lifecycle_model SET current_load = GREATEST(0, current_load - 1) WHERE id = ?", inv.getArgument(0, Long.class)));
            when(files.selectById(anyLong())).thenAnswer(inv -> {
                List<FileObject> rows = jdbc.query("SELECT * FROM lifecycle_file WHERE id = ?", (rs, row) -> {
                    FileObject file = new FileObject(); file.setId(rs.getLong("id")); file.setRefCount(rs.getInt("ref_count"));
                    return file;
                }, inv.getArgument(0, Long.class));
                return rows.isEmpty() ? null : rows.get(0);
            });
            when(files.updateById(any())).thenAnswer(inv -> {
                FileObject file = inv.getArgument(0);
                return jdbc.update("UPDATE lifecycle_file SET ref_count = ? WHERE id = ?", file.getRefCount(), file.getId());
            });
            when(events.insert(any())).thenAnswer(inv -> {
                VideoTaskEvent event = inv.getArgument(0);
                return jdbc.update("INSERT INTO lifecycle_event VALUES (?)", event.getToStatus());
            });
            when(accounts.selectForUpdate(anyLong())).thenAnswer(inv -> jdbc.queryForObject(
                    "SELECT * FROM lifecycle_account WHERE user_id = ? FOR UPDATE", (rs, row) -> {
                        CreditAccount account = new CreditAccount(); account.setUserId(rs.getLong("user_id"));
                        account.setAvailable(rs.getLong("available")); account.setFrozen(rs.getLong("frozen"));
                        account.setTotalConsumed(rs.getLong("consumed")); return account;
                    }, inv.getArgument(0, Long.class)));
            when(accounts.hold(anyLong(), anyLong())).thenAnswer(inv -> jdbc.update(
                    "UPDATE lifecycle_account SET available = available - ?, frozen = frozen + ? WHERE user_id = ?",
                    inv.getArgument(1, Long.class), inv.getArgument(1, Long.class), inv.getArgument(0, Long.class)));
            when(accounts.settle(anyLong(), anyLong(), anyLong())).thenAnswer(inv -> jdbc.update(
                    "UPDATE lifecycle_account SET available = available + ? - ?, frozen = frozen - ?, consumed = consumed + ? WHERE user_id = ?",
                    inv.getArgument(1, Long.class), inv.getArgument(2, Long.class), inv.getArgument(1, Long.class),
                    inv.getArgument(2, Long.class), inv.getArgument(0, Long.class)));
            when(accounts.refund(anyLong(), anyLong())).thenAnswer(inv -> jdbc.update(
                    "UPDATE lifecycle_account SET available = available + ?, frozen = frozen - ? WHERE user_id = ?",
                    inv.getArgument(1, Long.class), inv.getArgument(1, Long.class), inv.getArgument(0, Long.class)));
            when(transactions.insert(any())).thenAnswer(inv -> {
                CreditTransaction transaction = inv.getArgument(0);
                return jdbc.update("INSERT INTO lifecycle_ledger VALUES (?, ?)", transaction.getIdempotencyKey(), transaction.getBizType());
            });
            billing = new BillingService(accounts, transactions, settings);
            video = new VideoTaskService(tasks, events, models, channels, files, new PricingService(json), billing,
                    settings, storage, videoAdapter, mock(SsrfGuard.class), json, manager);
        }

        AdminTaskService admin() {
            var service = new AdminTaskService(tasks, mock(UserMapper.class), events, mock(UpstreamCallLogMapper.class),
                    transactions, video, billing, audit, json);
            var factory = new org.springframework.aop.framework.ProxyFactory(service);
            factory.addAdvice(new org.springframework.transaction.interceptor.TransactionInterceptor(manager,
                    new org.springframework.transaction.annotation.AnnotationTransactionAttributeSource()));
            return (AdminTaskService) factory.getProxy();
        }

        ImageTaskService images() throws Exception {
            jdbc.update("DELETE FROM lifecycle_task");
            jdbc.update("UPDATE lifecycle_model SET current_load = 0");
            jdbc.update("UPDATE lifecycle_account SET available = 100, frozen = 0");
            VideoModel model = new VideoModel(); model.setId(1L); model.setChannelId(2L); model.setEnabled(1);
            model.setCapability("image"); model.setModelKey("image-basic"); model.setUpstreamModel("image-upstream");
            model.setDisplayName("Image"); model.setPricingRules("[{\"resolution\":\"1024x1024\",\"credits\":10}]");
            Channel channel = new Channel(); channel.setId(2L); channel.setEnabled(1); channel.setCapabilities("[\"image\"]");
            when(models.selectById(1L)).thenReturn(model);
            when(models.selectCanonicalByModelKey("image-basic", "image")).thenReturn(model);
            when(models.selectEnabledByModelKey("image-basic", "image")).thenReturn(List.of(model));
            when(channels.selectById(2L)).thenReturn(channel);
            when(settings.get(anyString(), anyString())).thenAnswer(inv -> inv.getArgument(1, String.class));
            when(settings.get("routing.strategy", "profit_first")).thenReturn("weighted_only");
            when(settings.getLong(anyString(), anyLong())).thenAnswer(inv -> inv.getArgument(1, Long.class));
            when(tasks.insert(any())).thenAnswer(inv -> {
                VideoTask task = inv.getArgument(0, VideoTask.class); task.setId(10L);
                return jdbc.update("INSERT INTO lifecycle_task VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)",
                        task.getId(), task.getTaskNo(), task.getUserId(), task.getModelId(), task.getChannelId(),
                        task.getStatus(), task.getHeldCredits(), task.getParamsJson(), task.getRequestHash(), task.getIdempotencyKey());
            });
            when(tasks.updateById(any())).thenAnswer(inv -> {
                VideoTask task = inv.getArgument(0, VideoTask.class);
                return jdbc.update("UPDATE lifecycle_task SET held_credits = ? WHERE id = ?", task.getHeldCredits(), task.getId());
            });
            var bytes = new java.io.ByteArrayOutputStream();
            javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(2, 3, java.awt.image.BufferedImage.TYPE_INT_RGB), "png", bytes);
            imageResponse = json.valueToTree(java.util.Map.of("data", List.of(java.util.Map.of("b64_json",
                    java.util.Base64.getEncoder().encodeToString(bytes.toByteArray())))));
            when(imageAdapter.generate(any(), anyLong(), anyString(), anyString(), anyString(), anyString(), anyList()))
                    .thenAnswer(inv -> {
                        assertFalse(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive());
                        assertEquals(1, number("SELECT current_load FROM lifecycle_model"));
                        return imageResponse;
                    });
            when(storage.writeBytes(anyLong(), any(), anyString(), anyString(), anyString(), anyLong())).thenAnswer(inv -> {
                assertTrue(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive());
                return files.selectById(20L);
            });
            return new ImageTaskService(tasks, models, channels, files, events, new PricingService(json), billing,
                    settings, storage, imageAdapter, mock(VideoTaskService.class), json, manager);
        }

        void assertRefunded(String expectedState, int ledgerCount) {
            assertEquals(expectedState, state());
            assertEquals(0, number("SELECT current_load FROM lifecycle_model"));
            assertEquals(100, number("SELECT available FROM lifecycle_account"));
            assertEquals(0, number("SELECT frozen FROM lifecycle_account"));
            assertEquals(0, number("SELECT consumed FROM lifecycle_account"));
            assertEquals(ledgerCount, number("SELECT COUNT(*) FROM lifecycle_ledger"));
            assertEquals(1, number("SELECT COUNT(*) FROM lifecycle_ledger WHERE biz_type = 'REFUND'"));
            assertEquals(1, number("SELECT COUNT(*) FROM lifecycle_event WHERE to_status IN ('FAILED','CANCELLED','EXPIRED')"));
        }

        VideoTask find(String predicate, Object... args) {
            List<VideoTask> rows = jdbc.query("SELECT * FROM lifecycle_task WHERE " + predicate, this::readTask, args);
            return rows.isEmpty() ? null : rows.get(0);
        }

        private VideoTask readTask(ResultSet rs, int row) throws SQLException {
            VideoTask task = new VideoTask(); task.setId(rs.getLong("id")); task.setTaskNo(rs.getString("task_no"));
            task.setUserId(rs.getLong("user_id")); task.setModelId(rs.getLong("model_id"));
            task.setChannelId(rs.getLong("channel_id")); task.setStatus(rs.getString("status"));
            task.setHeldCredits(rs.getLong("held_credits")); task.setParamsJson(rs.getString("params_json"));
            task.setRequestHash(rs.getString("request_hash")); task.setIdempotencyKey(rs.getString("idempotency_key"));
            task.setFileId(rs.getObject("file_id", Long.class)); return task;
        }

        int number(String sql) { return jdbc.queryForObject(sql, Integer.class); }
        String state() { return jdbc.queryForObject("SELECT status FROM lifecycle_task WHERE id = 10", String.class); }

        void assertActiveHold() { assertActiveHold(0); }

        void assertActiveHold(int ledgerCount) {
            assertEquals("DOWNLOADING", state());
            assertEquals(1, number("SELECT current_load FROM lifecycle_model"));
            assertEquals(0, number("SELECT ref_count FROM lifecycle_file"));
            assertEquals(90, number("SELECT available FROM lifecycle_account"));
            assertEquals(10, number("SELECT frozen FROM lifecycle_account"));
            assertEquals(0, number("SELECT consumed FROM lifecycle_account"));
            assertEquals(ledgerCount, number("SELECT COUNT(*) FROM lifecycle_ledger"));
            assertEquals(0, number("SELECT COUNT(*) FROM lifecycle_event"));
        }

        @Override public void close() { jdbc.execute("SHUTDOWN"); }
    }
}
