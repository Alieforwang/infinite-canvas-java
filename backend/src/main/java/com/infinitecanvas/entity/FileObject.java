package com.infinitecanvas.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class FileObject {
    private Long id;
    private String fileNo;
    private Long userId;
    private String kind;
    private String storageProvider;
    private String storageKey;
    private String originalName;
    private String contentType;
    private Long bytes;
    private String sha256;
    private Integer width;
    private Integer height;
    private Integer durationMs;
    private Integer refCount;
    private String status;
    private Long sourceTaskId;
    private LocalDateTime createdAt;
    private LocalDateTime deletedAt;
}
