package com.infinitecanvas.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class VideoModel {
    private Long id;
    private Long channelId;
    private String modelKey;
    private Integer routeWeight;
    private String upstreamModel;
    private String displayName;
    private String capability;
    private Integer enabled;
    private Integer sort;
    private BigDecimal creditsPerSecond;
    private String pricingRules;
    private String resolutionFactors;
    private String resolutionDefault;
    private BigDecimal audioFactor;
    private Long minChargeCredits;
    private String supportedSeconds;
    private String supportedSizes;
    private String supportedRatios;
    private Integer supportsAudio;
    private Integer supportsWatermark;
    private Integer supportsFirstLastFrame;
    private Integer supportsReferenceImages;
    private Integer maxReferenceImages;
    private String extraRequestParams;
    // ---- Phase 1: 成本感知路由 ----
    /** 从 upstream_price 同步来的上游单位成本（人民币内部记账单位），quota_type=1 为按次、2 为按秒 */
    private BigDecimal costPerUnit;
    /** 上游计费类型：0=token, 1=按次, 2=按秒 */
    private Integer costQuotaType;
    /** 成本同步时间 */
    private LocalDateTime costSyncedAt;
    /** 当前并发数，用于负载均衡 */
    private Integer currentLoad;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
