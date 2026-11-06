package com.infinitecanvas.dto;

import java.util.Map;

public final class AccountDtos {

    private AccountDtos() {
    }

    public record AccountView(long available, long frozen, long totalConsumed, long totalRecharged,
                              long exchangePerYuan, long concurrencyLimit, long running,
                              Map<String, Object> currentPlan) {
    }

    public record TransactionView(Long id, String bizType, String bizLabel, long amount, long balanceAfter,
                                  String taskNo, String remark, String createdAt) {
    }

    public record RedeemRequest(String code) {
    }

    public record RedeemResult(long credits, String planName) {
    }
}
