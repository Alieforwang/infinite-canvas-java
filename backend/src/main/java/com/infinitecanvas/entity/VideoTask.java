package com.infinitecanvas.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class VideoTask {
    private Long id;
    private String taskNo;
    private Long userId;
    private Long channelId;
    private Long modelId;
    private String status;
    private String idempotencyKey;
    private String requestHash;
    private String prompt;
    private String paramsJson;
    private String referencesJson;
    private String upstreamTaskId;
    private String upstreamStatus;
    private String upstreamRequestId;
    private String upstreamResultUrl;
    private LocalDateTime resultExpiresAt;
    private Integer progress;
    private Long fileId;
    private Long heldCredits;
    private Long settledCredits;
    private String errorCode;
    private String errorMessage;
    private Integer attemptCount;
    private Integer pollCount;
    private LocalDateTime nextPollAt;
    private LocalDateTime deadlineAt;
    private LocalDateTime submittedAt;
    private LocalDateTime finishedAt;
    private String clientIp;
    private String clientRequestId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
