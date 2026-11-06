package com.infinitecanvas.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class CreditTransaction {
    private Long id;
    private Long userId;
    private String bizType;
    private Long availableDelta;
    private Long frozenDelta;
    private Long balanceAfter;
    private Long taskId;
    private Long orderId;
    private Long redeemCodeId;
    private String idempotencyKey;
    private Long operatorAdminId;
    private String remark;
    private String requestId;
    private LocalDateTime createdAt;
}
