package com.infinitecanvas.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class VideoTaskEvent {
    private Long id;
    private Long taskId;
    private String fromStatus;
    private String toStatus;
    private String source;
    private String detail;
    private LocalDateTime createdAt;
}
