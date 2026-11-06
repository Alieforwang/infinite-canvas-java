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
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
