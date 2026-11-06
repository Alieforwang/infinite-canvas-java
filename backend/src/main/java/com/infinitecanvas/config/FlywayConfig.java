package com.infinitecanvas.config;

import org.flywaydb.core.Flyway;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;

/**
 * 显式装配 Flyway（替代 Spring Boot 自动配置）。
 *
 * <p>原因：Flyway 9+ 的社区版不再支持 MySQL 5.7（划归 Teams 版），
 * 本项目固定使用 Flyway 8.5.13 社区版，并在 application.yml 中
 * 通过 {@code spring.autoconfigure.exclude} 关闭 Boot 自带的 Flyway 自动配置。
 *
 * <p>启动时自动执行 classpath:db/migration 下的 V1/V2 迁移：
 * 空库会自动建表 + 种子数据；已迁移过的库会自动跳过（记录在 flyway_schema_history）。
 * 想手改表结构：新增 V3__xxx.sql 即可，Flyway 会按版本号顺序执行。
 */
@Configuration
public class FlywayConfig {

    @Bean(initMethod = "migrate")
    public Flyway flyway(DataSource dataSource) {
        return Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .baselineOnMigrate(true)
                .load();
    }
}
