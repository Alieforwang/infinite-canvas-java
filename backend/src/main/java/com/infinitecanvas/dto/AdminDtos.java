package com.infinitecanvas.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public final class AdminDtos {

    private AdminDtos() {
    }

    // ---------- channel ----------
    public record ChannelView(Long id, String name, String protocol, List<String> capabilities,
                              String baseUrl, String normalizedBaseUrl,
                              String apiKeyMask, String authType, Integer enabled, Integer maxConcurrency,
                              Boolean lastTestOk, String lastTestMessage, LocalDateTime lastTestAt,
                              LocalDateTime createdAt, int modelCount) {
    }

    public record ChannelRequest(String name, String protocol, List<String> capabilities,
                                 String baseUrl, String apiKey,
                                 String authType, String authHeader, Integer maxConcurrency, Boolean enabled,
                                 Integer connectTimeoutMs, Integer readTimeoutMs) {
    }

    public record ChannelTestResult(boolean ok, long latencyMs, List<String> models, String message) {
    }

    // ---------- model ----------
    public record ModelRequest(Long channelId, String modelKey, Integer routeWeight,
                               String upstreamModel, String displayName, String capability,
                               Boolean enabled, Integer sort, BigDecimal creditsPerSecond,
                               String pricingRules, String resolutionFactors, String resolutionDefault, BigDecimal audioFactor,
                               Long minChargeCredits, String supportedSeconds, String supportedSizes,
                               String supportedRatios, Integer supportsAudio, Integer supportsWatermark,
                               Integer supportsFirstLastFrame, Integer supportsReferenceImages,
                               Integer maxReferenceImages) {
    }

    // ---------- user ----------
    public record AdminUserView(Long id, String email, String displayName, String status,
                                long available, long frozen, long totalConsumed, long taskCount,
                                LocalDateTime createdAt, LocalDateTime lastLoginAt) {
    }

    public record UserStatusRequest(String status, String reason) {
    }

    public record CreditAdjustRequest(Long amount, String reason) {
    }

    public record RechargeRequest(Long amount, String remark) {
    }

    public record PlanGrantRequest(Long planId, String reason) {
    }

    // ---------- plan ----------
    public record PlanRequest(String code, String name, String type, BigDecimal priceAmount, Long credits,
                              Long bonusCredits, Integer validDays, String description, Integer sort, Boolean enabled) {
    }

    // ---------- redeem ----------
    public record RedeemGenerateRequest(Integer count, Long credits, Long planId, String prefix, Integer validDays) {
    }

    public record RedeemCodeView(Long id, String codeMask, String batchNo, String prefix, Long credits,
                                 Long planId, String status, String usedByEmail, LocalDateTime usedAt,
                                 LocalDateTime expiresAt, LocalDateTime createdAt) {
    }

    public record RedeemGenerateResult(String batchNo, List<String> codes) {
    }

    // ---------- task ----------
    public record AdminTaskView(TaskDtos.TaskView task, Long userId, String userEmail) {
    }

    public record AdminTaskDetail(TaskDtos.TaskView task, Long userId, String userEmail,
                                  List<Map<String, Object>> events, List<Map<String, Object>> upstreamCalls,
                                  List<Map<String, Object>> transactions) {
    }

    // ---------- dashboard / settings ----------
    public record DashboardView(long users, long todayNewUsers, long tasksToday, long tasksTotal, long running,
                                long failedToday, double successRate, long creditsConsumedToday,
                                long creditsGrantedToday, List<Map<String, Object>> trend,
                                List<Map<String, Object>> channels) {
    }

    public record SettingView(String key, String value, String type, String description) {
    }
}
