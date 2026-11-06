package com.infinitecanvas.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AuditLog {
    private Long id;
    private String actorType;
    private Long actorId;
    private String action;
    private String targetType;
    private String targetId;
    private String detailJson;
    private String ip;
    private String requestId;
    private LocalDateTime createdAt;
}
