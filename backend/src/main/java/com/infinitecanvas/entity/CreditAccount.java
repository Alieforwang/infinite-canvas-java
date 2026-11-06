package com.infinitecanvas.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class CreditAccount {
    private Long userId;
    private Long available;
    private Long frozen;
    private Long totalConsumed;
    private Long totalRecharged;
    private LocalDateTime updatedAt;
}
