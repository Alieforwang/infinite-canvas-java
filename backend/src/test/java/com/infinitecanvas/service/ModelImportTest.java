package com.infinitecanvas.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.common.BizException;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.entity.VideoModel;
import com.infinitecanvas.gateway.UpstreamClient;
import com.infinitecanvas.mapper.ChannelMapper;
import com.infinitecanvas.mapper.VideoModelMapper;
import com.infinitecanvas.mapper.VideoTaskMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.AdditionalAnswers.delegatesTo;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ModelImportTest {
    // Keep ID-only fixtures concise while the production discovery seam also carries capability metadata.
    private final UpstreamClient upstream = mock(UpstreamClient.class, invocation -> {
        if ("discoverModels".equals(invocation.getMethod().getName())) {
            List<String> ids = ((UpstreamClient) invocation.getMock()).listModels(invocation.getArgument(0), invocation.getArgument(1));
            return ids == null ? List.of() : ids.stream().map(id -> new UpstreamClient.DiscoveredModel(id,
                    com.infinitecanvas.gateway.ModelCapabilityClassifier.classify(id))).toList();
        }
        return RETURNS_DEFAULTS.answer(invocation);
    });
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void repeatedImportSkipsDuplicateBlankAndOversizedIdsWithoutChangingExistingRoute() throws Exception {
        try (var store = new ImportStore("[\"video\"]")) {
            String longestId = "x".repeat(128);
            when(upstream.listModels(any(Channel.class), isNull())).thenReturn(
                    Arrays.asList(" clip ", "clip", null, " ", "x".repeat(129), longestId));
            ChannelService service = service(store);

            var first = store.transaction.execute(status -> service.syncModels(7L, null));
            assertTrue(first.ok());
            assertTrue(first.message().contains("新增线路 2 条"));
            VideoModel existing = store.models.selectByChannelAndUpstream(7L, "clip");
            existing.setRouteWeight(37);
            existing.setEnabled(0);
            existing.setDisplayName("Administrator's name");
            existing.setSupportedSeconds("[\"4\",\"12\"]");
            store.models.updateById(existing);

            var second = store.transaction.execute(status -> service.syncModels(7L, null));
            assertTrue(second.ok());
            assertTrue(second.message().contains("新增线路 0 条"));
            List<VideoModel> routes = store.models.selectAllSorted();
            assertEquals(2, routes.size());
            assertTrue(routes.stream().anyMatch(model -> longestId.equals(model.getUpstreamModel())));
            VideoModel preserved = store.models.selectByChannelAndUpstream(7L, "clip");
            assertEquals(existing.getId(), preserved.getId());
            assertEquals(37, preserved.getRouteWeight());
            assertEquals(0, preserved.getEnabled());
            assertEquals("Administrator's name", preserved.getDisplayName());
            assertEquals("[\"4\",\"12\"]", preserved.getSupportedSeconds());
            verify(store.models, times(2)).insert(any(VideoModel.class));
        }
    }

    @ParameterizedTest
    @CsvSource({
            "image,opaque-42,unknown",
            "image,veo-video-42,video",
            "mixed,opaque-42,unknown",
            "mixed,flux-pro,image",
            "video,dall-e-3,image",
            "mixed,gpt-4o,llm",
            "image,claude-sonnet-4-5,llm",
            "video,deepseek-chat,llm",
            "video,openai/gpt-4.1,llm",
            "mixed,gpt-image-1,image",
            "mixed,gemini-2.5-flash-image,image",
            "mixed,qwen-image,image",
            "mixed,qwen3-235b,llm",
            "mixed,gemini-2.5-pro,llm",
            "mixed,sora-2,video",
            "mixed,veo-3.1,video",
            "mixed,kling-v2,video",
            "mixed,stable-diffusion-xl,image",
            "mixed,embedding-3,unknown",
            "mixed,custom-alias,unknown"
    })
    void discoveredCapabilityUsesConservativeModelIdentityInsteadOfChannelDefaults(String capabilities, String name, String expected) throws Exception {
        String channelCapabilities = json.writeValueAsString("mixed".equals(capabilities)
                ? List.of("image", "video") : List.of(capabilities));
        try (var store = new ImportStore(channelCapabilities)) {
            when(upstream.listModels(any(Channel.class), isNull())).thenReturn(List.of(name));
            var result = store.transaction.execute(status -> service(store).syncModels(7L, null));

            assertTrue(result.ok());
            VideoModel imported = store.models.selectByChannelAndUpstream(7L, name);
            assertEquals(expected, imported.getCapability());
            assertEquals("video".equals(expected) ? "[\"8\"]" : "[]", imported.getSupportedSeconds());
            assertEquals("image".equals(expected) ? "1024x1024" : "video".equals(expected) ? "720p" : "", imported.getResolutionDefault());
            assertEquals("unknown".equals(expected) ? 0 : 1, imported.getEnabled());
            if ("unknown".equals(expected) || "llm".equals(expected)) {
                assertEquals("[]", imported.getPricingRules());
                assertEquals("[]", imported.getSupportedSizes());
                assertEquals(0, imported.getSupportsReferenceImages());
            }
        }
    }

    @Test
    void discoveryStillLocksTheLatestChannelWithoutUsingItsCapabilitiesAsModelEvidence() throws Exception {
        try (var store = new ImportStore("[\"video\"]")) {
            when(upstream.listModels(any(Channel.class), isNull())).thenAnswer(call -> {
                store.externalUpdate("UPDATE channel SET capabilities = '[\"image\"]' WHERE id = 7");
                return List.of("opaque-42");
            });

            var result = store.transaction.execute(status -> service(store).syncModels(7L, null));

            assertTrue(result.ok());
            assertEquals("unknown", store.models.selectByChannelAndUpstream(7L, "opaque-42").getCapability());
            var order = inOrder(upstream, store.channels);
            order.verify(store.channels).selectById(7L);
            order.verify(upstream).listModels(any(Channel.class), isNull());
            order.verify(store.channels).selectByIdForUpdate(7L);
        }
    }

    @Test
    void inheritsCanonicalLogicalPriceWithinCapabilityWithoutCopyingRouteSpecsOrCosts() throws Exception {
        try (var store = new ImportStore("[\"image\"]")) {
            store.jdbc.update("INSERT INTO channel (id, capabilities) VALUES (8, '[\"image\",\"video\"]')");
            VideoModel wrongCapability = new VideoModel();
            wrongCapability.setChannelId(8L);
            wrongCapability.setModelKey("opaque-42");
            wrongCapability.setUpstreamModel("video-supplier-id");
            wrongCapability.setDisplayName("Video name must not leak");
            wrongCapability.setCapability("video");
            wrongCapability.setPricingRules("[{\"resolution\":\"720p\",\"seconds\":8,\"credits\":999}]");
            store.models.insert(wrongCapability);

            VideoModel canonical = new VideoModel();
            canonical.setChannelId(8L);
            canonical.setModelKey("opaque-42");
            canonical.setUpstreamModel("supplier-image-id");
            canonical.setDisplayName("Shared image name");
            canonical.setCapability("image");
            canonical.setPricingRules("[{\"resolution\":\"1024x1024\",\"credits\":91}]");
            canonical.setCreditsPerSecond(new BigDecimal("7.25"));
            canonical.setResolutionFactors("{\"1024x1024\":1.25}");
            canonical.setAudioFactor(new BigDecimal("1.75"));
            canonical.setMinChargeCredits(17L);
            canonical.setResolutionDefault("2048x2048");
            canonical.setSupportedSeconds("[\"12\"]");
            canonical.setSupportedSizes("[\"2048x2048\"]");
            canonical.setSupportedRatios("[\"16:9\"]");
            canonical.setSupportsAudio(1);
            canonical.setSupportsWatermark(1);
            canonical.setSupportsFirstLastFrame(1);
            canonical.setMaxReferenceImages(8);
            canonical.setExtraRequestParams("{\"supplier\":\"private\"}");
            canonical.setRouteWeight(3);
            canonical.setEnabled(0);
            canonical.setSort(9);
            canonical.setCurrentLoad(13);
            canonical.setCostPerUnit(new BigDecimal("5.5"));
            canonical.setCostQuotaType(1);
            canonical.setCostSyncedAt(LocalDateTime.of(2026, 11, 7, 0, 0));
            store.models.insert(canonical);
            when(upstream.discoverModels(any(Channel.class), isNull())).thenReturn(
                    List.of(new UpstreamClient.DiscoveredModel("opaque-42", "image")));

            var result = store.transaction.execute(status -> service(store).syncModels(7L, null));

            assertTrue(result.ok());
            VideoModel imported = store.models.selectByChannelAndUpstream(7L, "opaque-42");
            assertEquals("opaque-42", imported.getModelKey());
            assertEquals("opaque-42", imported.getUpstreamModel());
            assertEquals("Shared image name", imported.getDisplayName());
            assertEquals("image", imported.getCapability());
            assertEquals(canonical.getPricingRules(), imported.getPricingRules());
            assertEquals(0, canonical.getCreditsPerSecond().compareTo(imported.getCreditsPerSecond()));
            assertEquals(canonical.getResolutionFactors(), imported.getResolutionFactors());
            assertEquals(0, canonical.getAudioFactor().compareTo(imported.getAudioFactor()));
            assertEquals(17L, imported.getMinChargeCredits());
            assertEquals(7L, imported.getChannelId());
            assertEquals(100, imported.getRouteWeight());
            assertEquals(1, imported.getEnabled());
            assertEquals(0, imported.getSort());
            assertEquals("1024x1024", imported.getResolutionDefault());
            assertEquals("[]", imported.getSupportedSeconds());
            assertEquals("[\"1024x1024\"]", imported.getSupportedSizes());
            assertNull(imported.getSupportedRatios());
            assertEquals(0, imported.getSupportsAudio());
            assertEquals(0, imported.getSupportsWatermark());
            assertEquals(0, imported.getSupportsFirstLastFrame());
            assertEquals(1, imported.getMaxReferenceImages());
            assertNull(imported.getExtraRequestParams());
            assertEquals(0, imported.getCurrentLoad());
            assertNull(imported.getCostPerUnit());
            assertNull(imported.getCostQuotaType());
            assertNull(imported.getCostSyncedAt());
            verify(store.models).selectCanonicalByModelKeyForUpdate("opaque-42", "image");
            verify(store.models, never()).selectCanonicalByModelKey(anyString(), anyString());
            verify(store.models, never()).updateLogicalPricing(any());
            VideoModel unchanged = store.models.selectById(canonical.getId());
            assertEquals("[\"2048x2048\"]", unchanged.getSupportedSizes());
            assertEquals(13, unchanged.getCurrentLoad());
            assertEquals(0, new BigDecimal("5.5").compareTo(unchanged.getCostPerUnit()));
        }
    }

    @Test
    void upstreamFailureDoesNotAcquireChannelLockOrImportAnyRoutes() throws Exception {
        try (var store = new ImportStore("[\"video\"]")) {
            when(upstream.listModels(any(Channel.class), eq("https://supplier.example/models")))
                    .thenThrow(new IllegalStateException("upstream unavailable"));

            var result = store.transaction.execute(status -> service(store).syncModels(7L, "https://supplier.example/models"));

            assertFalse(result.ok());
            assertTrue(result.message().contains("upstream unavailable"));
            assertTrue(result.models().isEmpty());
            verify(store.channels, never()).selectByIdForUpdate(anyLong());
            verifyNoInteractions(store.models);
            assertTrue(store.models.selectAllSorted().isEmpty());
        }
    }

    @Test
    void channelDeletedDuringFetchCannotImportOrphanRoutes() throws Exception {
        try (var store = new ImportStore("[\"video\"]")) {
            when(upstream.listModels(any(Channel.class), isNull())).thenAnswer(call -> {
                store.externalUpdate("DELETE FROM channel WHERE id = 7");
                return List.of("opaque-42");
            });

            BizException failure = assertThrows(BizException.class,
                    () -> store.transaction.execute(status -> service(store).syncModels(7L, null)));

            assertEquals(404, failure.getHttpStatus());
            verifyNoInteractions(store.models);
            assertTrue(store.models.selectAllSorted().isEmpty());
        }
    }

    @Test
    void concurrentImportsContendOnChannelLockAndCreateOnlyOneRoute() throws Exception {
        try (var store = new ImportStore("[\"image\"]")) {
            var bothFetched = new CountDownLatch(2);
            var secondLockAttempted = new CountDownLatch(1);
            var lockAttempts = new AtomicInteger();
            when(upstream.discoverModels(any(Channel.class), isNull())).thenAnswer(call -> {
                bothFetched.countDown();
                assertTrue(bothFetched.await(5, TimeUnit.SECONDS), "both imports must finish fetching before locking");
                return List.of(new UpstreamClient.DiscoveredModel("opaque-42", "image"),
                        new UpstreamClient.DiscoveredModel("opaque-42", "image"));
            });
            doAnswer(call -> {
                int attempt = lockAttempts.incrementAndGet();
                if (attempt == 2) secondLockAttempted.countDown();
                Channel locked = store.databaseChannels.selectByIdForUpdate(call.getArgument(0));
                if (attempt == 1) {
                    assertTrue(secondLockAttempted.await(5, TimeUnit.SECONDS),
                            "the second import must attempt its lock while the first holds it");
                }
                return locked;
            }).when(store.channels).selectByIdForUpdate(7L);
            ChannelService service = service(store);
            var workers = Executors.newFixedThreadPool(2);
            try {
                var first = workers.submit(() -> store.transaction.execute(status -> service.syncModels(7L, null)));
                var second = workers.submit(() -> store.transaction.execute(status -> service.syncModels(7L, null)));
                var firstResult = first.get(15, TimeUnit.SECONDS);
                var secondResult = second.get(15, TimeUnit.SECONDS);
                assertTrue(firstResult.ok());
                assertTrue(secondResult.ok());
                var messages = List.of(firstResult.message(), secondResult.message());
                assertTrue(messages.stream().anyMatch(message -> message.contains("新增线路 1 条")));
                assertTrue(messages.stream().anyMatch(message -> message.contains("新增线路 0 条")));
                List<VideoModel> routes = store.models.selectAllSorted();
                assertEquals(1, routes.size());
                assertEquals("opaque-42", routes.get(0).getUpstreamModel());
                assertEquals("image", routes.get(0).getCapability());
                verify(store.channels, times(2)).selectByIdForUpdate(7L);
                verify(store.models, times(1)).insert(any(VideoModel.class));
            } finally {
                workers.shutdownNow();
                assertTrue(workers.awaitTermination(5, TimeUnit.SECONDS), "all import transactions must finish");
            }
        }
    }

    @Test
    void staleRouteEditCannotOverwriteCurrentLogicalPricingCostOrLoad() throws Exception {
        try (var store = new ImportStore("[\"video\"]")) {
            VideoModel seed = pricedRoute(7L, "shared-video", "video", 10);
            store.models.insert(seed);
            VideoModel stale = store.models.selectById(seed.getId());

            store.models.updateLogicalPricing(pricedRoute(7L, "shared-video", "video", 44));
            LocalDateTime syncedAt = LocalDateTime.of(2026, 11, 7, 1, 2, 3);
            store.models.updateCost(seed.getId(), new BigDecimal("22.5"), 2, syncedAt);
            store.models.incrementLoad(seed.getId());
            VideoModel current = store.models.selectById(seed.getId());
            stale.setRouteWeight(37);

            store.models.updateById(stale);

            VideoModel actual = store.models.selectById(seed.getId());
            current.setRouteWeight(37);
            assertEquals(current, actual, "a stale route edit must only change the supplied route configuration");
            assertEquals(0, new BigDecimal("44").compareTo(actual.getCreditsPerSecond()));
            assertEquals(0, new BigDecimal("22.5").compareTo(actual.getCostPerUnit()));
            assertEquals(syncedAt, actual.getCostSyncedAt());
            assertEquals(3, actual.getCurrentLoad());
        }
    }

    @Test
    void logicalPricingUpdateChangesAllFiveFieldsOnlyWithinMatchingKeyAndCapability() throws Exception {
        try (var store = new ImportStore("[\"video\",\"image\"]")) {
            store.jdbc.update("INSERT INTO channel (id, capabilities) VALUES (8, '[\"video\"]')");
            var matchingFirst = pricedRoute(7L, "shared", "video", 10);
            var matchingOtherChannel = pricedRoute(8L, "shared", "video", 11);
            var differentCapability = pricedRoute(7L, "shared", "image", 12);
            var differentKey = pricedRoute(7L, "other", "video", 13);
            var routes = List.of(matchingFirst, matchingOtherChannel, differentCapability, differentKey);
            for (var route : routes) store.models.insert(route);
            var original = routes.stream().map(route -> store.models.selectById(route.getId())).toList();
            VideoModel changed = pricedRoute(999L, "shared", "video", 42);
            changed.setRouteWeight(1);
            changed.setSupportedSizes("[\"do-not-copy\"]");
            changed.setCostPerUnit(new BigDecimal("999"));
            changed.setCurrentLoad(999);

            store.models.updateLogicalPricing(changed);

            for (int i = 0; i < routes.size(); i++) {
                VideoModel expected = original.get(i);
                if (i < 2) {
                    expected.setPricingRules(changed.getPricingRules());
                    expected.setCreditsPerSecond(changed.getCreditsPerSecond().setScale(10));
                    expected.setResolutionFactors(changed.getResolutionFactors());
                    expected.setAudioFactor(changed.getAudioFactor().setScale(10));
                    expected.setMinChargeCredits(changed.getMinChargeCredits());
                }
                assertEquals(expected, store.models.selectById(routes.get(i).getId()),
                        "only matching logical group prices may change; route specifications and costs must remain");
            }
        }
    }

    private VideoModel pricedRoute(Long channelId, String modelKey, String capability, int price) {
        var route = new VideoModel();
        route.setChannelId(channelId);
        route.setModelKey(modelKey);
        route.setUpstreamModel(modelKey + "-" + capability + "-" + channelId);
        route.setDisplayName(modelKey);
        route.setCapability(capability);
        route.setRouteWeight(100);
        route.setEnabled(1);
        route.setPricingRules("[{\"resolution\":\"720p\",\"seconds\":8,\"credits\":" + price + "}]");
        route.setCreditsPerSecond(BigDecimal.valueOf(price));
        route.setResolutionFactors("{\"720p\":" + price + "}");
        route.setAudioFactor(BigDecimal.valueOf(price));
        route.setMinChargeCredits((long) price);
        route.setResolutionDefault("720p");
        route.setSupportedSeconds("[\"8\"]");
        route.setSupportedSizes("[\"1280x720\"]");
        route.setCostPerUnit(BigDecimal.valueOf(price));
        route.setCostQuotaType(1);
        route.setCostSyncedAt(LocalDateTime.of(2026, 11, 7, 0, 0));
        route.setCurrentLoad(2);
        return route;
    }

    private ChannelService service(ImportStore store) {
        return new ChannelService(store.channels, store.models, mock(VideoTaskMapper.class),
                mock(CryptoService.class), mock(BaseUrlNormalizer.class), mock(SsrfGuard.class), upstream, json);
    }

    /** Real mapper XML and database transactions; no uniqueness constraint masks missing import locks. */
    static final class ImportStore implements AutoCloseable {
        final DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:imports_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=5000", "sa", "");
        final JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        final TransactionTemplate transaction = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        private final ChannelMapper databaseChannels;
        final ChannelMapper channels;
        final VideoModelMapper models;

        ImportStore(String capabilities) throws Exception {
            jdbc.execute("""
                    CREATE TABLE channel (
                        id BIGINT PRIMARY KEY, name VARCHAR(128), protocol VARCHAR(64), capabilities VARCHAR(128),
                        base_url VARCHAR(512), normalized_base_url VARCHAR(512), api_key_cipher VARBINARY(1024),
                        api_key_mask VARCHAR(128), auth_type VARCHAR(32), auth_header VARCHAR(128), extra_headers VARCHAR(2048),
                        connect_timeout_ms INT, read_timeout_ms INT, max_concurrency INT, enabled INT,
                        last_test_at TIMESTAMP(9), last_test_ok INT, last_test_message VARCHAR(1024),
                        created_at TIMESTAMP(9), updated_at TIMESTAMP(9))
                    """);
            jdbc.execute("""
                    CREATE TABLE `model` (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY, channel_id BIGINT, model_key VARCHAR(128), route_weight INT,
                        upstream_model VARCHAR(128), display_name VARCHAR(256), capability VARCHAR(32), enabled INT, sort INT,
                        credits_per_second DECIMAL(24,10), pricing_rules VARCHAR(4096), resolution_factors VARCHAR(2048),
                        resolution_default VARCHAR(128), audio_factor DECIMAL(24,10), min_charge_credits BIGINT,
                        supported_seconds VARCHAR(2048), supported_sizes VARCHAR(2048), supported_ratios VARCHAR(2048),
                        supports_audio INT, supports_watermark INT, supports_first_last_frame INT,
                        supports_reference_images INT, max_reference_images INT, extra_request_params VARCHAR(4096),
                        cost_per_unit DECIMAL(24,10), cost_quota_type INT, cost_synced_at TIMESTAMP(9), current_load INT,
                        created_at TIMESTAMP(9), updated_at TIMESTAMP(9))
                    """);
            jdbc.update("INSERT INTO channel (id, capabilities) VALUES (7, ?)", capabilities);
            var factory = new SqlSessionFactoryBean();
            factory.setDataSource(dataSource);
            factory.setMapperLocations(new ClassPathResource("mapper/ChannelMapper.xml"),
                    new ClassPathResource("mapper/VideoModelMapper.xml"));
            var sessions = new SqlSessionTemplate(factory.getObject());
            databaseChannels = sessions.getMapper(ChannelMapper.class);
            channels = mock(ChannelMapper.class, delegatesTo(databaseChannels));
            models = mock(VideoModelMapper.class, delegatesTo(sessions.getMapper(VideoModelMapper.class)));
        }

        private void externalUpdate(String sql) throws Exception {
            // Bypass the thread-bound Spring connection to emulate a separately committed admin change.
            try (var connection = dataSource.getConnection(); var statement = connection.createStatement()) {
                statement.executeUpdate(sql);
            }
        }

        @Override
        public void close() {
            jdbc.execute("SHUTDOWN");
        }
    }
}
