package com.infinitecanvas.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

import java.math.BigDecimal;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** H2/MySQL compatibility check, not a substitute for a real MySQL migration rehearsal. */
class RmbMigrationTest {
    private DriverManagerDataSource dataSource() {
        var source = new DriverManagerDataSource("jdbc:h2:mem:rmb-" + UUID.randomUUID()
                + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "sa", "");
        var jdbc = new JdbcTemplate(source);
        jdbc.execute("CREATE TABLE system_setting (setting_key VARCHAR(64) PRIMARY KEY, setting_value VARCHAR(500), "
                + "value_type VARCHAR(16), description VARCHAR(255))");
        jdbc.execute("CREATE TABLE model (id BIGINT PRIMARY KEY, cost_per_unit DECIMAL(24,10), cost_quota_type INT, "
                + "cost_synced_at TIMESTAMP, credits_per_second BIGINT, min_charge_credits BIGINT)");
        jdbc.execute("CREATE TABLE plan (code VARCHAR(64) PRIMARY KEY, name VARCHAR(100), description VARCHAR(500), "
                + "credits BIGINT, bonus_credits BIGINT, price_amount DECIMAL(18,4))");
        jdbc.execute("CREATE TABLE credit_account (user_id BIGINT PRIMARY KEY, available BIGINT, frozen BIGINT, "
                + "total_consumed BIGINT, total_recharged BIGINT)");
        jdbc.execute("CREATE TABLE credit_transaction (id BIGINT PRIMARY KEY, available_delta BIGINT, balance_after BIGINT)");
        jdbc.update("INSERT INTO model VALUES (1, 7.2, 1, CURRENT_TIMESTAMP, 80, 10)");
        jdbc.update("INSERT INTO plan VALUES ('pack_10', '体验包 1000 积分', '适合首次体验', 1000, 0, 10)");
        jdbc.update("INSERT INTO plan VALUES ('pack_50', '标准包 5500 积分', '含 500 赠送积分', 5000, 500, 50)");
        jdbc.update("INSERT INTO plan VALUES ('plan_pro', '自定义专业套餐', '我的说明', 20000, 0, 200)");
        jdbc.update("INSERT INTO credit_account VALUES (1, 12345, 80, 1000, 13425)");
        jdbc.update("INSERT INTO credit_transaction VALUES (1, -80, 12345)");
        return source;
    }

    @ParameterizedTest
    @CsvSource({"100,100,false", "1000,100,true", "100,1000,true", "100,100.0,true"})
    void preservesMoneyAndOnlyInvalidatesCostsWhenConversionMayDiffer(String walletRate, String oldCostRate,
                                                                   boolean invalidateCost) {
        var source = dataSource();
        var jdbc = new JdbcTemplate(source);
        jdbc.update("INSERT INTO system_setting VALUES ('credit.exchange_per_yuan', ?, 'INT', 'legacy')", walletRate);
        jdbc.update("INSERT INTO system_setting VALUES ('pricing.credits_per_yuan', ?, 'NUMBER', 'legacy')", oldCostRate);

        var migration = new ResourceDatabasePopulator(new ClassPathResource("db/migration/V8__rmb_presentation.sql"));
        migration.setSqlScriptEncoding("UTF-8");
        migration.execute(source);

        assertEquals(walletRate, jdbc.queryForObject("SELECT setting_value FROM system_setting "
                + "WHERE setting_key = 'credit.exchange_per_yuan'", String.class));
        assertEquals(12345L, jdbc.queryForObject("SELECT available FROM credit_account", Long.class));
        assertEquals(80L, jdbc.queryForObject("SELECT frozen FROM credit_account", Long.class));
        assertEquals(1000L, jdbc.queryForObject("SELECT total_consumed FROM credit_account", Long.class));
        assertEquals(13425L, jdbc.queryForObject("SELECT total_recharged FROM credit_account", Long.class));
        assertEquals(-80L, jdbc.queryForObject("SELECT available_delta FROM credit_transaction", Long.class));
        assertEquals(12345L, jdbc.queryForObject("SELECT balance_after FROM credit_transaction", Long.class));
        assertEquals(80L, jdbc.queryForObject("SELECT credits_per_second FROM model", Long.class));
        assertEquals(10L, jdbc.queryForObject("SELECT min_charge_credits FROM model", Long.class));
        assertEquals(5000L, jdbc.queryForObject("SELECT credits FROM plan WHERE code = 'pack_50'", Long.class));
        assertEquals(500L, jdbc.queryForObject("SELECT bonus_credits FROM plan WHERE code = 'pack_50'", Long.class));
        assertEquals(0, new BigDecimal("50").compareTo(jdbc.queryForObject(
                "SELECT price_amount FROM plan WHERE code = 'pack_50'", BigDecimal.class)));
        assertEquals("体验充值包", jdbc.queryForObject("SELECT name FROM plan WHERE code = 'pack_10'", String.class));
        assertEquals("含赠送余额", jdbc.queryForObject("SELECT description FROM plan WHERE code = 'pack_50'", String.class));
        assertEquals("自定义专业套餐", jdbc.queryForObject("SELECT name FROM plan WHERE code = 'plan_pro'", String.class));
        BigDecimal cost = jdbc.queryForObject("SELECT cost_per_unit FROM model", BigDecimal.class);
        if (invalidateCost) {
            assertNull(cost);
            assertNull(jdbc.queryForObject("SELECT cost_synced_at FROM model", Object.class));
            assertNull(jdbc.queryForObject("SELECT cost_quota_type FROM model", Object.class));
        } else {
            assertEquals(0, new BigDecimal("7.2").compareTo(cost));
            assertNotNull(jdbc.queryForObject("SELECT cost_synced_at FROM model", Object.class));
        }
    }

    @Test
    void suppliesTheHistoricalDefaultWithoutChangingExistingAmounts() {
        var source = dataSource();
        var jdbc = new JdbcTemplate(source);

        var migration = new ResourceDatabasePopulator(new ClassPathResource("db/migration/V8__rmb_presentation.sql"));
        migration.setSqlScriptEncoding("UTF-8");
        migration.execute(source);

        assertEquals("100", jdbc.queryForObject("SELECT setting_value FROM system_setting "
                + "WHERE setting_key = 'credit.exchange_per_yuan'", String.class));
        assertEquals(12345L, jdbc.queryForObject("SELECT available FROM credit_account", Long.class));
        assertNull(jdbc.queryForObject("SELECT cost_per_unit FROM model", BigDecimal.class));
    }
}
