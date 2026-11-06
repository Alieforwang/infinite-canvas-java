package com.infinitecanvas.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class CanvasProject {
    private Long id;
    private String projectNo;
    private Long userId;
    private String title;
    private String documentJson;
    private Integer nodeCount;
    private Integer fileCount;
    private Integer documentBytes;
    private Integer version;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime deletedAt;
}
