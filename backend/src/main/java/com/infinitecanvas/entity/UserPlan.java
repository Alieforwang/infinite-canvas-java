package com.infinitecanvas.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class UserPlan {
    private Long id;
    private Long userId;
    private Long planId;
    private Long orderId;
    private Long creditsTotal;
    private Long creditsUsed;
    private LocalDateTime startedAt;
    private LocalDateTime expiresAt;
    private String status;
    private LocalDateTime createdAt;
}
