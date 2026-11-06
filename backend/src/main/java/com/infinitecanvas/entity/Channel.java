package com.infinitecanvas.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class Channel {
    private Long id;
    private String name;
    private String protocol;
    private String capabilities;
    private String baseUrl;
    private String normalizedBaseUrl;
    private byte[] apiKeyCipher;
    private String apiKeyMask;
    private String authType;
    private String authHeader;
    private String extraHeaders;
    private Integer connectTimeoutMs;
    private Integer readTimeoutMs;
    private Integer maxConcurrency;
    private Integer enabled;
    private LocalDateTime lastTestAt;
    private Boolean lastTestOk;
    private String lastTestMessage;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
