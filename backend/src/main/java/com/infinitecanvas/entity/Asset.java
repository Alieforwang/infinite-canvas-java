package com.infinitecanvas.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class Asset {
    private Long id;
    private String assetNo;
    private Long userId;
    private String kind;
    private String title;
    private Long fileId;
    private Long coverFileId;
    private String textContent;
    private String tags;
    private String source;
    private String note;
    private String metadata;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime deletedAt;
}
