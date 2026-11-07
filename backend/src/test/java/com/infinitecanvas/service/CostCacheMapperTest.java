package com.infinitecanvas.service;

import com.infinitecanvas.entity.VideoModel;
import com.infinitecanvas.mapper.VideoModelMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class CostCacheMapperTest {
    @ParameterizedTest
    @ValueSource(strings = { "channel_id = 8", "upstream_model = 'new-model'", "capability = 'image'" })
    void staleSyncCannotPublishOrClearCostsAfterRouteIdentityChanges(String identityChange) throws Exception {
        try (var store = new Store()) {
            VideoModel oldIdentity = store.identity();
            store.jdbc.update("UPDATE `model` SET " + identityChange + ", cost_per_unit = 99 WHERE id = 1");
            assertEquals(0, store.mapper.updateCostIfRouteMatches(oldIdentity, BigDecimal.TEN, 2, LocalDateTime.now()));
            assertEquals(0, store.mapper.updateCostIfRouteMatches(oldIdentity, null, null, null));
            assertEquals(0, new BigDecimal("99").compareTo(store.cost()));
        }
    }

    @Test
    void matchingIdentityCanPublishValidZeroAndClearWithdrawnCost() throws Exception {
        try (var store = new Store()) {
            LocalDateTime syncedAt = LocalDateTime.of(2026, 11, 7, 0, 0);
            assertEquals(1, store.mapper.updateCostIfRouteMatches(store.identity(), BigDecimal.ZERO, 1, syncedAt));
            assertEquals(0, BigDecimal.ZERO.compareTo(store.cost()));
            assertEquals(syncedAt, store.jdbc.queryForObject("SELECT cost_synced_at FROM `model`", LocalDateTime.class));
            assertEquals(1, store.mapper.updateCostIfRouteMatches(store.identity(), null, null, null));
            assertNull(store.cost());
            assertNull(store.jdbc.queryForObject("SELECT cost_quota_type FROM `model`", Integer.class));
            assertNull(store.jdbc.queryForObject("SELECT cost_synced_at FROM `model`", LocalDateTime.class));
        }
    }

    @Test
    void changingChannelSourceClearsOnlyItsOwnRoutes() throws Exception {
        try (var store = new Store()) {
            store.jdbc.update("INSERT INTO `model` VALUES (2, 8, 'other', 'image', 88, 1, NULL)");
            assertEquals(1, store.mapper.clearCostsByChannel(7L));
            assertNull(store.jdbc.queryForObject("SELECT cost_per_unit FROM `model` WHERE id = 1", BigDecimal.class));
            assertNull(store.jdbc.queryForObject("SELECT cost_quota_type FROM `model` WHERE id = 1", Integer.class));
            assertEquals(0, new BigDecimal("88").compareTo(store.jdbc.queryForObject(
                    "SELECT cost_per_unit FROM `model` WHERE id = 2", BigDecimal.class)));
        }
    }

    @Test
    void connectionTestCannotRestoreAnOldChannelSource() throws Exception {
        try (var store = new Store()) {
            store.jdbc.execute("CREATE TABLE channel(id BIGINT PRIMARY KEY, base_url VARCHAR(128),"
                    + " last_test_at TIMESTAMP, last_test_ok BOOLEAN, last_test_message VARCHAR(128))");
            store.jdbc.update("INSERT INTO channel VALUES(7, 'https://new.example', NULL, NULL, NULL)");
            var stale = new com.infinitecanvas.entity.Channel();
            stale.setId(7L);
            stale.setBaseUrl("https://old.example");
            stale.setLastTestOk(true);
            stale.setLastTestMessage("ok");
            assertEquals(1, store.channels.updateTestResult(stale));
            assertEquals("https://new.example", store.jdbc.queryForObject("SELECT base_url FROM channel", String.class));
            assertEquals("ok", store.jdbc.queryForObject("SELECT last_test_message FROM channel", String.class));
        }
    }

    private static final class Store implements AutoCloseable {
        private final DriverManagerDataSource dataSource = new DriverManagerDataSource("jdbc:h2:mem:cache_"
                + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        private final JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        private final VideoModelMapper mapper;
        private final com.infinitecanvas.mapper.ChannelMapper channels;

        private Store() throws Exception {
            jdbc.execute("CREATE TABLE `model` (id BIGINT PRIMARY KEY, channel_id BIGINT, upstream_model VARCHAR(128),"
                    + " capability VARCHAR(16), cost_per_unit DECIMAL(24,10), cost_quota_type INT, cost_synced_at TIMESTAMP)");
            jdbc.update("INSERT INTO `model` VALUES (1, 7, 'call', 'video', 9, 1, NULL)");
            var factory = new SqlSessionFactoryBean();
            factory.setDataSource(dataSource);
            factory.setMapperLocations(new ClassPathResource("mapper/VideoModelMapper.xml"),
                    new ClassPathResource("mapper/ChannelMapper.xml"));
            var session = new SqlSessionTemplate(factory.getObject());
            mapper = session.getMapper(VideoModelMapper.class);
            channels = session.getMapper(com.infinitecanvas.mapper.ChannelMapper.class);
        }

        private VideoModel identity() {
            var route = new VideoModel();
            route.setId(1L);
            route.setChannelId(7L);
            route.setUpstreamModel("call");
            route.setCapability("video");
            return route;
        }

        private BigDecimal cost() { return jdbc.queryForObject("SELECT cost_per_unit FROM `model`", BigDecimal.class); }
        @Override public void close() { jdbc.execute("SHUTDOWN"); }
    }
}
