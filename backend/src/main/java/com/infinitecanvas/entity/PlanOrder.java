package com.infinitecanvas.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class PlanOrder {
    private Long id;
    private String orderNo;
    private Long userId;
    private Long planId;
    private String type;
    private String payMethod;
    private BigDecimal amount;
    private Long credits;
    private String status;
    private Long operatorAdminId;
    private String remark;
    private LocalDateTime paidAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
