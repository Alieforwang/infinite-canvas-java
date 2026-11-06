package com.infinitecanvas.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Data
@Configuration
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private Jwt jwt = new Jwt();
    private Crypto crypto = new Crypto();
    private Storage storage = new Storage();
    private Cors cors = new Cors();
    private Security security = new Security();
    private Poller poller = new Poller();
    private Upstream upstream = new Upstream();
    private Admin admin = new Admin();

    @Data
    public static class Jwt {
        private String issuer = "infinite-canvas";
        private String secret;
        private long accessTtlMinutes = 120;
        private long refreshTtlDays = 30;
    }

    @Data
    public static class Crypto {
        private String keyEncSecret;
        private String downloadTokenSecret;
    }

    @Data
    public static class Storage {
        private String root = "./storage";
        private String provider = "local";
    }

    @Data
    public static class Cors {
        private List<String> allowedOrigins = List.of("http://localhost:3000", "http://localhost:3001");
    }

    @Data
    public static class Security {
        private boolean allowPrivateUpstream = false;
        private boolean allowHttpUpstream = false;
    }

    @Data
    public static class Poller {
        private boolean enabled = true;
        private long intervalMs = 1000;
        private int batchSize = 20;
        private int leaseSeconds = 60;
        private int timeoutMinutes = 30;
    }

    @Data
    public static class Upstream {
        private int connectTimeoutMs = 5000;
        private int queryTimeoutMs = 20000;
        private int createTimeoutMs = 90000;
        private int downloadTimeoutMs = 900000;
    }

    @Data
    public static class Admin {
        private String initUsername = "admin";
        private String initPassword = "Admin@123456";
    }
}
