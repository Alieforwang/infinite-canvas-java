package com.infinitecanvas.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.common.BizException;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.entity.UpstreamPrice;
import com.infinitecanvas.entity.VideoModel;
import com.infinitecanvas.mapper.ChannelMapper;
import com.infinitecanvas.mapper.UpstreamPriceMapper;
import com.infinitecanvas.mapper.VideoModelMapper;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class UpstreamPriceServiceTest {
    private final ChannelMapper channels = mock(ChannelMapper.class);
    private final UpstreamPriceMapper prices = mock(UpstreamPriceMapper.class);
    private final CryptoService crypto = mock(CryptoService.class);
    private final VideoModelMapper models = mock(VideoModelMapper.class);
    private final SettingService settings = mock(SettingService.class);
    private final UpstreamPriceService service = new UpstreamPriceService(channels, prices, new ObjectMapper(),
            mock(TransactionTemplate.class), crypto, models, settings);

    private static Channel channel(String url) {
        Channel channel = new Channel();
        channel.setId(7L);
        channel.setNormalizedBaseUrl(url);
        return channel;
    }

    @Test
    void springCreatesServiceUsingProductionConstructor() {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.registerBean(ChannelMapper.class, () -> channels);
            context.registerBean(UpstreamPriceMapper.class, () -> prices);
            context.registerBean(ObjectMapper.class, () -> new ObjectMapper());
            context.registerBean(TransactionTemplate.class, () -> mock(TransactionTemplate.class));
            context.registerBean(CryptoService.class, () -> mock(CryptoService.class));
            context.registerBean(VideoModelMapper.class, () -> models);
            context.registerBean(SettingService.class, () -> settings);
            context.register(UpstreamPriceService.class);
            context.refresh();

            when(channels.selectById(7L)).thenReturn(channel("https://duoyuanx.com"));
            assertEquals("no_cost", context.getBean(UpstreamPriceService.class).get(7L).status());
            verify(prices).selectSnapshot(7L);
        }
    }

    @Test
    void mapperXmlParses() throws Exception {
        var configuration = new Configuration();
        String resource = "mapper/UpstreamPriceMapper.xml";
        try (var input = getClass().getClassLoader().getResourceAsStream(resource)) {
            assertNotNull(input);
            new XMLMapperBuilder(input, configuration, resource, configuration.getSqlFragments()).parse();
        }
        assertNotNull(configuration.getMappedStatement("com.infinitecanvas.mapper.UpstreamPriceMapper.selectSnapshot"));
    }

    @Test
    void requiresExactTrustedHttpsHostname() {
        assertTrue(UpstreamPriceService.isDuoyuanx(channel("https://duoyuanx.com/v1")));
        assertFalse(UpstreamPriceService.isDuoyuanx(channel("https://duoyuanx.com.evil.test")));
        assertFalse(UpstreamPriceService.isDuoyuanx(channel("http://duoyuanx.com")));
        assertFalse(UpstreamPriceService.isDuoyuanx(channel("https://duoyuanx.com:444")));
        when(channels.selectById(7L)).thenReturn(channel("https://duoyuanx.com.evil.test"));
        assertThrows(BizException.class, () -> service.get(7L));
        verifyNoInteractions(prices);
    }

    @Test
    void parsesRequestAndSecondRatesWithoutConvertingTokenRatio() throws Exception {
        var parsed = service.parse("""
                {"pricing_version":"v42","group_ratio":{"default":1,"gc-video":0.85},
                "data":[{"model_name":"call-model","quota_type":1,"model_price":"2.50","enable_groups":"default,gc-video"},
                {"model_name":"time-model","quota_type":2,"model_price":0.1,"enable_groups":["default"]},
                {"model_name":"token-model","quota_type":0,"model_price":0,"model_ratio":2,"enable_groups":"gemini-优质"}]}
                """);
        assertEquals("v42", parsed.version());
        assertEquals(3, parsed.prices().size());
        assertEquals(new BigDecimal("1"), parsed.prices().get(0).getGroupRatio());
        assertEquals(new BigDecimal("2.50"), parsed.prices().get(0).getModelPrice());
        assertEquals(0, parsed.prices().get(2).getQuotaType());
        assertNull(parsed.prices().get(2).getGroupRatio());
    }

    @Test
    void rejectsPartialAndDuplicatePayloads() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> service.parse("{\"data\":[]}"));
        assertThrows(IllegalArgumentException.class, () -> service.parse("""
                {"data":[{"model_name":"x","quota_type":1,"model_price":1},
                {"model_name":"x","quota_type":2,"model_price":2}]}
                """));
        assertThrows(IllegalArgumentException.class, () -> service.parse("""
                {"data":[{"model_name":"x","quota_type":1,"model_price":-1}]}
                """));
        assertThrows(IllegalArgumentException.class, () -> service.parse("""
                {"success":false,"group_ratio":{"default":1},"data":[{"model_name":"x","quota_type":1,"model_price":1,"enable_groups":"default"}]}
                """));
        var excluded = service.parse("""
                {"group_ratio":{"default":1},"data":[{"model_name":"x","quota_type":1,"model_price":1,"enable_groups":"gemini-优质"}]}
                """);
        assertNull(excluded.prices().get(0).getGroupRatio());
    }

    @Test
    void failedFetchLeavesExistingSnapshotAndCostsUntouched() throws Exception {
        try (var store = syncStore()) {
            HttpClient http = mock(HttpClient.class);
            when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                    .thenThrow(new IOException("upstream unavailable"));
            BizException failure = assertThrows(BizException.class, () -> syncService(store, http).sync(7L));
            assertEquals(502, failure.getHttpStatus());
            assertOriginalState(store);
            verifyNoInteractions(prices, models, settings);
        }
    }

    @Test
    void successfulSyncCommitsSnapshotAndConvertedRequestSecondAndZeroCosts() throws Exception {
        try (var store = syncStore()) {
            store.addModel(2L, 7L, "seconds");
            store.addModel(3L, 7L, "free");
            var view = syncService(store, successfulFetch("""
                    {"pricing_version":"new","group_ratio":{"default":1.5},"data":[
                    {"model_name":"call","quota_type":1,"model_price":0.25,"enable_groups":"default"},
                    {"model_name":"seconds","quota_type":2,"model_price":0.1,"enable_groups":"default"},
                    {"model_name":"free","quota_type":1,"model_price":0,"enable_groups":"default"}]}
                    """)).sync(7L);

            assertEquals("new", view.pricingVersion());
            assertEquals("fresh", view.status());
            assertEquals(3, view.prices().size());
            assertEquals(0, new BigDecimal("270").compareTo(store.cost(1L)));
            assertEquals(0, new BigDecimal("108").compareTo(store.cost(2L)));
            assertEquals(0, BigDecimal.ZERO.compareTo(store.cost(3L)));
            assertEquals(1, store.quota(1L));
            assertEquals(2, store.quota(2L));
            assertEquals(1, store.quota(3L));
            for (long id : List.of(1L, 2L, 3L)) {
                assertEquals(view.syncedAt(), store.syncedAt(id));
            }
            assertTrue(view.prices().stream().allMatch(price -> "fresh".equals(price.status())));
            verify(models, never()).updateById(any());
        }
    }

    @Test
    void zeroDefaultGroupRatioIsAFreshFreeCost() throws Exception {
        try (var store = syncStore()) {
            var view = syncService(store, successfulFetch("""
                    {"pricing_version":"free","group_ratio":{"default":0},"data":[
                    {"model_name":"call","quota_type":2,"model_price":12,"enable_groups":"default"}]}
                    """)).sync(7L);

            assertEquals(0, BigDecimal.ZERO.compareTo(store.cost(1L)));
            assertEquals(2, store.quota(1L));
            assertEquals(view.syncedAt(), store.syncedAt(1L));
            assertEquals("fresh", view.prices().get(0).status());
            assertEquals(0, BigDecimal.ZERO.compareTo(view.prices().get(0).groupCost()));
        }
    }

    @Test
    void successfulSyncClearsRemovedUnsupportedAndUnavailableQuotesOnlyInTargetChannel() throws Exception {
        try (var store = syncStore()) {
            store.addModel(2L, 7L, "token");
            store.addModel(3L, 7L, "unsupported");
            store.addModel(4L, 7L, "unpriced");
            store.addModel(5L, 7L, "excluded");
            store.addModel(6L, 8L, "token");
            syncService(store, successfulFetch("""
                    {"pricing_version":"withdrawn","group_ratio":{"default":1},"data":[
                    {"model_name":"token","quota_type":0,"model_price":1,"enable_groups":"default"},
                    {"model_name":"unsupported","quota_type":3,"model_price":1,"enable_groups":"default"},
                    {"model_name":"unpriced","quota_type":1,"enable_groups":"default"},
                    {"model_name":"excluded","quota_type":2,"model_price":1,"enable_groups":"other"}]}
                    """)).sync(7L);

            for (long id : List.of(1L, 2L, 3L, 4L, 5L)) {
                assertNull(store.cost(id), "old cost must be cleared for route " + id);
                assertNull(store.quota(id));
                assertNull(store.syncedAt(id));
            }
            assertEquals(0, new BigDecimal("9").compareTo(store.cost(6L)));
            assertEquals(1, store.quota(6L));
            assertEquals(OLD_SYNCED_AT, store.syncedAt(6L));
        }
    }

    @ParameterizedTest
    @ValueSource(strings = { "missing", "changed", "credentials", "protocol", "authType", "authHeader", "extraHeaders" })
    void channelDeletedOrReconfiguredDuringFetchCannotPublishOldSourcePrices(String change) throws Exception {
        try (var store = syncStore()) {
            Channel current = channel("https://duoyuanx.com/v1");
            switch (change) {
                case "missing" -> current = null;
                case "changed" -> current = channel("https://different-provider.example/v1");
                case "credentials" -> current.setApiKeyCipher(new byte[]{1, 2, 3});
                case "protocol" -> current.setProtocol("changed");
                case "authType" -> current.setAuthType("none");
                case "authHeader" -> current.setAuthHeader("X-New-Auth");
                case "extraHeaders" -> current.setExtraHeaders("{\"X-Group\":\"new\"}");
            }
            when(channels.selectByIdForUpdate(7L)).thenReturn(current);
            var synchronizer = syncService(store, successfulFetch("""
                    {"pricing_version":"new","group_ratio":{"default":1},"data":[
                    {"model_name":"call","quota_type":1,"model_price":0.25,"enable_groups":"default"}]}
                    """));
            BizException failure = assertThrows(BizException.class, () -> synchronizer.sync(7L));
            assertEquals("missing".equals(change) ? 404 : 422, failure.getHttpStatus());
            assertOriginalState(store);
            verifyNoInteractions(prices, models);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = { "call", "unrelated" })
    void staleRouteSnapshotCannotPublishOrClearCostForAnEditedIdentity(String quotedModel) throws Exception {
        try (var store = syncStore()) {
            List<VideoModel> staleRoutes = models.selectAllSorted();
            when(models.selectAllSorted()).thenAnswer(call -> {
                store.jdbc.update("UPDATE route_cost SET channel_id = 8, cost = 99 WHERE id = 1");
                return staleRoutes;
            });
            syncService(store, successfulFetch("""
                    {"pricing_version":"new","group_ratio":{"default":1},"data":[
                    {"model_name":"%s","quota_type":1,"model_price":0.25,"enable_groups":"default"}]}
                    """.formatted(quotedModel))).sync(7L);
            assertEquals(0, new BigDecimal("99").compareTo(store.cost(1L)));
            assertEquals(OLD_SYNCED_AT, store.syncedAt(1L));
            assertEquals("new", store.jdbc.queryForObject("SELECT version FROM price_snapshot", String.class));
            verify(models).updateCostIfRouteMatches(argThat(route -> route.getId() == 1L && route.getChannelId() == 7L),
                    nullable(BigDecimal.class), nullable(Integer.class), nullable(LocalDateTime.class));
        }
    }

    @Test
    void costRefreshFailureRollsBackSnapshotPricesAndEarlierCostWrites() throws Exception {
        try (var store = syncStore()) {
            store.addModel(2L, 7L, "seconds");
            doThrow(new IllegalStateException("cost write failed")).when(models)
                    .updateCostIfRouteMatches(argThat(route -> route.getId() == 2L), nullable(BigDecimal.class), nullable(Integer.class), nullable(LocalDateTime.class));
            var synchronizer = syncService(store, successfulFetch("""
                    {"pricing_version":"new","group_ratio":{"default":1},"data":[
                    {"model_name":"call","quota_type":1,"model_price":0.25,"enable_groups":"default"},
                    {"model_name":"seconds","quota_type":2,"model_price":0.1,"enable_groups":"default"}]}
                    """));

            assertThrows(IllegalStateException.class, () -> synchronizer.sync(7L));
            assertOriginalState(store);
            assertEquals(0, new BigDecimal("9").compareTo(store.cost(2L)));
            assertEquals(OLD_SYNCED_AT, store.syncedAt(2L));
        }
    }

    @ParameterizedTest
    @MethodSource("invalidConversionSettings")
    void invalidConversionSettingsPreserveExistingSnapshotAndCosts(String key, double value) throws Exception {
        try (var store = syncStore()) {
            when(settings.getDouble(eq(key), anyDouble())).thenReturn(value);
            var synchronizer = syncService(store, successfulFetch("""
                    {"pricing_version":"new","group_ratio":{"default":1},"data":[
                    {"model_name":"call","quota_type":1,"model_price":0.25,"enable_groups":"default"}]}
                    """));

            BizException failure = assertThrows(BizException.class, () -> synchronizer.sync(7L));
            assertEquals(422, failure.getHttpStatus());
            assertTrue(failure.getMessage().contains(key));
            assertOriginalState(store);
            verifyNoInteractions(prices, models);
        }
    }

    private static Stream<Arguments> invalidConversionSettings() {
        return Stream.of("pricing.usd_to_yuan")
                .flatMap(key -> Stream.of(0.0, -1.0, Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY)
                        .map(value -> Arguments.of(key, value)));
    }

    @ParameterizedTest
    @ValueSource(longs = {1, 100, 1000})
    void costsUseTheSameHistoricPrecisionAsTheWallet(long unitsPerYuan) throws Exception {
        try (var store = syncStore()) {
            when(settings.getLong(MoneyAmounts.UNITS_PER_YUAN_SETTING, 100)).thenReturn(unitsPerYuan);
            // A divergent legacy cost-only setting must never revalue route costs.
            when(settings.getDouble("pricing.credits_per_yuan", 100)).thenReturn(37.0);
            var synchronizer = syncService(store, successfulFetch("""
                    {"pricing_version":"new","group_ratio":{"default":1},"data":[
                    {"model_name":"call","quota_type":1,"model_price":0.25,"enable_groups":"default"}]}
                    """));

            synchronizer.sync(7L);

            BigDecimal expected = new BigDecimal("1.8").multiply(BigDecimal.valueOf(unitsPerYuan));
            assertEquals(0, expected.compareTo(store.cost(1L)));
            verify(settings, never()).getDouble("pricing.credits_per_yuan", 100);
        }
    }

    private static final LocalDateTime OLD_SYNCED_AT = LocalDateTime.of(2026, 1, 1, 0, 0);

    private UpstreamPriceService syncService(SyncStore store, HttpClient http) {
        return new UpstreamPriceService(channels, prices, new ObjectMapper(), store.transaction,
                crypto, models, settings, http);
    }

    @SuppressWarnings("unchecked")
    private HttpClient successfulFetch(String body) throws Exception {
        HttpClient http = mock(HttpClient.class);
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(body);
        when(http.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(response);
        return http;
    }

    private SyncStore syncStore() {
        var store = new SyncStore();
        when(channels.selectById(7L)).thenReturn(channel("https://duoyuanx.com/v1"));
        when(channels.selectByIdForUpdate(7L)).thenReturn(channel("https://duoyuanx.com/v1"));
        when(settings.getDouble("pricing.usd_to_yuan", 7.2)).thenReturn(7.2);
        when(settings.getLong(MoneyAmounts.UNITS_PER_YUAN_SETTING, 100)).thenReturn(100L);
        doAnswer(call -> {
            store.jdbc.update("MERGE INTO price_snapshot (channel_id, version, synced_at) KEY(channel_id) VALUES (?, ?, ?)",
                    call.getArgument(0), call.getArgument(1), call.getArgument(2));
            return null;
        }).when(prices).upsertSnapshot(anyLong(), any(), any());
        doAnswer(call -> {
            store.jdbc.update("DELETE FROM quoted_price WHERE channel_id = ?", (Long) call.getArgument(0));
            return null;
        }).when(prices).deletePrices(anyLong());
        doAnswer(call -> {
            UpstreamPrice price = call.getArgument(0);
            store.jdbc.update("INSERT INTO quoted_price VALUES (?, ?, ?, ?, ?, ?)",
                    price.getChannelId(), price.getUpstreamModel(), price.getQuotaType(), price.getModelPrice(),
                    price.getGroupRatio(), price.getSyncedAt());
            return null;
        }).when(prices).insertPrice(any());
        when(prices.selectSnapshot(7L)).thenAnswer(call -> store.jdbc.queryForObject(
                "SELECT channel_id, version, synced_at FROM price_snapshot WHERE channel_id = 7",
                (row, index) -> new UpstreamPriceMapper.Snapshot(row.getLong(1), row.getString(2),
                        row.getObject(3, LocalDateTime.class))));
        when(prices.selectPrices(7L)).thenAnswer(call -> store.jdbc.query(
                "SELECT * FROM quoted_price WHERE channel_id = 7 ORDER BY model_name", (row, index) -> {
                    var price = new UpstreamPrice();
                    price.setChannelId(row.getLong("channel_id"));
                    price.setUpstreamModel(row.getString("model_name"));
                    price.setQuotaType(row.getInt("quota"));
                    price.setModelPrice(row.getBigDecimal("price"));
                    price.setGroupRatio(row.getBigDecimal("ratio"));
                    price.setSyncedAt(row.getObject("synced_at", LocalDateTime.class));
                    return price;
                }));
        when(models.selectAllSorted()).thenAnswer(call -> store.jdbc.query(
                "SELECT id, channel_id, model_name FROM route_cost ORDER BY id", (row, index) -> {
                    var model = new VideoModel();
                    model.setId(row.getLong(1));
                    model.setChannelId(row.getLong(2));
                    model.setUpstreamModel(row.getString(3));
                    model.setCapability("video");
                    return model;
                }));
        when(models.updateCostIfRouteMatches(any(VideoModel.class), nullable(BigDecimal.class), nullable(Integer.class), nullable(LocalDateTime.class)))
                .thenAnswer(call -> {
                    VideoModel route = call.getArgument(0);
                    return store.jdbc.update(
                            "UPDATE route_cost SET cost = ?, quota = ?, synced_at = ? WHERE id = ? AND channel_id = ? AND model_name = ?",
                            call.getArgument(1), call.getArgument(2), call.getArgument(3),
                            route.getId(), route.getChannelId(), route.getUpstreamModel());
                });
        return store;
    }

    private void assertOriginalState(SyncStore store) {
        assertEquals("old", store.jdbc.queryForObject("SELECT version FROM price_snapshot", String.class));
        assertEquals(OLD_SYNCED_AT, store.jdbc.queryForObject("SELECT synced_at FROM price_snapshot", LocalDateTime.class));
        assertEquals(1, store.jdbc.queryForObject("SELECT COUNT(*) FROM quoted_price", Integer.class));
        assertEquals("old-price", store.jdbc.queryForObject("SELECT model_name FROM quoted_price", String.class));
        assertEquals(0, new BigDecimal("2").compareTo(
                store.jdbc.queryForObject("SELECT price FROM quoted_price", BigDecimal.class)));
        assertEquals(0, new BigDecimal("9").compareTo(store.cost(1L)));
        assertEquals(1, store.quota(1L));
        assertEquals(OLD_SYNCED_AT, store.syncedAt(1L));
    }

    /** JDBC-backed mapper doubles exercise the service's real Spring transaction boundary. */
    private static final class SyncStore implements AutoCloseable {
        private final DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:prices_" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1", "sa", "");
        private final JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        private final TransactionTemplate transaction = new TransactionTemplate(new DataSourceTransactionManager(dataSource));

        private SyncStore() {
            jdbc.execute("CREATE TABLE price_snapshot (channel_id BIGINT PRIMARY KEY, version VARCHAR(64), synced_at TIMESTAMP(9))");
            jdbc.execute("CREATE TABLE quoted_price (channel_id BIGINT, model_name VARCHAR(128), quota INT, price DECIMAL(24,10), ratio DECIMAL(24,10), synced_at TIMESTAMP(9))");
            jdbc.execute("CREATE TABLE route_cost (id BIGINT PRIMARY KEY, channel_id BIGINT, model_name VARCHAR(128), cost DECIMAL(24,10), quota INT, synced_at TIMESTAMP(9))");
            jdbc.update("INSERT INTO price_snapshot VALUES (7, 'old', ?)", OLD_SYNCED_AT);
            jdbc.update("INSERT INTO quoted_price VALUES (7, 'old-price', 1, 2, 1, ?)", OLD_SYNCED_AT);
            addModel(1L, 7L, "call");
        }

        private void addModel(long id, long channelId, String name) {
            jdbc.update("INSERT INTO route_cost VALUES (?, ?, ?, 9, 1, ?)", id, channelId, name, OLD_SYNCED_AT);
        }

        private BigDecimal cost(long id) {
            return jdbc.queryForObject("SELECT cost FROM route_cost WHERE id = ?", BigDecimal.class, id);
        }

        private Integer quota(long id) {
            return jdbc.queryForObject("SELECT quota FROM route_cost WHERE id = ?", Integer.class, id);
        }

        private LocalDateTime syncedAt(long id) {
            return jdbc.queryForObject("SELECT synced_at FROM route_cost WHERE id = ?", LocalDateTime.class, id);
        }

        @Override
        public void close() {
            jdbc.execute("SHUTDOWN");
        }
    }

    @Test
    void pricesBecomeStaleAfterMissedRefreshWindow() {
        when(channels.selectById(7L)).thenReturn(channel("https://duoyuanx.com"));
        var price = new com.infinitecanvas.entity.UpstreamPrice();
        price.setUpstreamModel("video");
        price.setQuotaType(1);
        price.setModelPrice(BigDecimal.ONE);
        price.setGroupRatio(BigDecimal.ONE);
        when(prices.selectPrices(7L)).thenReturn(List.of(price));
        when(prices.selectSnapshot(7L)).thenReturn(new UpstreamPriceMapper.Snapshot(7L, "v42",
                LocalDateTime.now(ZoneOffset.UTC).minusHours(6)));
        assertEquals("fresh", service.get(7L).prices().get(0).status());
        when(prices.selectSnapshot(7L)).thenReturn(new UpstreamPriceMapper.Snapshot(7L, "v42",
                LocalDateTime.now(ZoneOffset.UTC).minusHours(8)));
        assertEquals("stale", service.get(7L).prices().get(0).status());
    }

    @Test
    void staleAndMissingCostAreVisibleWithoutPublishingPrices() {
        when(channels.selectById(7L)).thenReturn(channel("https://duoyuanx.com"));
        var synced = LocalDateTime.now(ZoneOffset.UTC).minusDays(2);
        when(prices.selectSnapshot(7L)).thenReturn(new UpstreamPriceMapper.Snapshot(7L, "v42", synced));
        var token = new com.infinitecanvas.entity.UpstreamPrice();
        token.setUpstreamModel("token");
        token.setQuotaType(0);
        token.setModelPrice(BigDecimal.ONE);
        token.setGroupRatio(BigDecimal.ONE);
        token.setSyncedAt(synced);
        when(prices.selectPrices(7L)).thenReturn(List.of(token));
        var view = service.get(7L);
        assertTrue(view.stale());
        assertEquals("no_cost", view.prices().get(0).status());
        assertNull(view.prices().get(0).groupCost());
        verify(prices, never()).insertPrice(any());
    }
}
