package com.infinitecanvas.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class RedeemCode {
    private Long id;
    private String code;
    private String batchNo;
    private String prefix;
    private Long credits;
    private Long planId;
    private String status;
    private Long usedByUserId;
    private LocalDateTime usedAt;
    private LocalDateTime expiresAt;
    private Long createdByAdminId;
    private LocalDateTime createdAt;
}
