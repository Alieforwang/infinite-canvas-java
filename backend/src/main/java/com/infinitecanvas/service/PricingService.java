package com.infinitecanvas.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.entity.VideoModel;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class PricingService {

    private final ObjectMapper objectMapper;

    public PricingService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public Map<String, BigDecimal> resolutionFactors(VideoModel model) {
        try {
            return objectMapper.readValue(model.getResolutionFactors(), new TypeReference<LinkedHashMap<String, BigDecimal>>() {
            });
        } catch (Exception ex) {
            return Map.of("480p", BigDecimal.ONE, "720p", BigDecimal.valueOf(1.5), "1080p", BigDecimal.valueOf(2));
        }
    }

    public boolean hasPricingRules(VideoModel model) {
        return model.getPricingRules() != null && !model.getPricingRules().isBlank()
                && !"[]".equals(model.getPricingRules().trim());
    }

    public boolean supportsVideoSpecification(VideoModel model, int seconds, String resolution) {
        if (hasPricingRules(model)) {
            return exactPrice(model, resolution, seconds) != null;
        }
        return resolutionFactors(model).containsKey(resolution);
    }

    public long quote(VideoModel model, int seconds, String resolution, boolean audio) {
        BigDecimal exact = exactPrice(model, resolution, seconds);
        BigDecimal audioFactor = audio && model.getAudioFactor() != null ? model.getAudioFactor() : BigDecimal.ONE;
        BigDecimal raw;
        if (exact != null) {
            raw = exact.multiply(audioFactor);
        } else {
            BigDecimal base = model.getCreditsPerSecond() == null ? BigDecimal.TEN : model.getCreditsPerSecond();
            BigDecimal factor = resolutionFactors(model).getOrDefault(resolution, BigDecimal.ONE);
            raw = base.multiply(factor).multiply(audioFactor).multiply(BigDecimal.valueOf(seconds));
        }
        return applyMinimum(model, raw);
    }

    public boolean supportsImageSpecification(VideoModel model, String size) {
        return size != null && !size.isBlank() && exactPrice(model, size, null) != null;
    }

    public long quoteImage(VideoModel model, String resolution) {
        BigDecimal exact = exactPrice(model, resolution, null);
        if (exact == null) {
            exact = model.getCreditsPerSecond() == null ? BigDecimal.TEN : model.getCreditsPerSecond();
        }
        return applyMinimum(model, exact);
    }

    private BigDecimal exactPrice(VideoModel model, String resolution, Integer seconds) {
        if (model.getPricingRules() == null || model.getPricingRules().isBlank()) {
            return null;
        }
        try {
            List<Map<String, Object>> rules = objectMapper.readValue(model.getPricingRules(),
                    new TypeReference<List<Map<String, Object>>>() {
                    });
            for (Map<String, Object> rule : rules) {
                if (!resolution.equals(String.valueOf(rule.get("resolution")))) {
                    continue;
                }
                if (seconds != null) {
                    Object value = rule.get("seconds");
                    if (value == null || new BigDecimal(String.valueOf(value)).intValue() != seconds) {
                        continue;
                    }
                }
                Object credits = rule.get("credits");
                return credits == null ? null : new BigDecimal(String.valueOf(credits));
            }
        } catch (Exception ignored) {
            return null;
        }
        return null;
    }

    private long applyMinimum(VideoModel model, BigDecimal raw) {
        long quoted = raw.setScale(0, RoundingMode.CEILING).longValue();
        long min = model.getMinChargeCredits() == null ? 1L : model.getMinChargeCredits();
        return Math.max(min, quoted);
    }
}
