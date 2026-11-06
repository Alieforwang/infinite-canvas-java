package com.infinitecanvas.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class UpstreamCallLog {
    private Long id;
    private Long taskId;
    private String taskNo;
    private String action;
    private Integer attempt;
    private Integer httpStatus;
    private Integer latencyMs;
    private String upstreamRequestId;
    private String errorCode;
    private String responseSnippet;
    private String responseHeaders;
    private LocalDateTime createdAt;
}
