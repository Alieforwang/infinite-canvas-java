package com.infinitecanvas.dto;

import java.time.LocalDateTime;
import java.util.Map;

public final class ModelDtos {

    private ModelDtos() {
    }

    public record ClassificationSuggestion(Long id, String currentCapability, String suggestedCapability,
                                           String upstreamModel, String modelKey) {}

    public record ClassificationApplyRequest(java.util.List<ClassificationSuggestion> items) {}

    public record ClassificationApplyResult(int updated) {}

    public record ModelView(String id, String displayName, String capability,
                            Map<String, Object> params, Map<String, Object> pricing) {
    }

    public record ModelAdminView(long id, Long channelId, String channelName, String modelKey,
                                 Integer routeWeight, String upstreamModel,
                                 String displayName, String capability, Integer enabled, Integer sort,
                                 java.math.BigDecimal creditsPerSecond, String pricingRules, String resolutionFactors,
                                 String resolutionDefault, java.math.BigDecimal audioFactor,
                                 Long minChargeCredits, String supportedSeconds, String supportedSizes,
                                 String supportedRatios, Integer supportsAudio, Integer supportsWatermark,
                                 Integer supportsFirstLastFrame, Integer supportsReferenceImages,
                                 Integer maxReferenceImages, LocalDateTime createdAt,
                                 java.math.BigDecimal costPerUnit, Integer costQuotaType,
                                 LocalDateTime costSyncedAt, Integer currentLoad) {
    }
}
