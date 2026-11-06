package com.infinitecanvas.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.dto.AdminDtos;
import com.infinitecanvas.dto.ModelDtos;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.entity.VideoModel;
import com.infinitecanvas.mapper.ChannelMapper;
import com.infinitecanvas.mapper.VideoModelMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.HashSet;
import java.util.Set;

@Service
public class ModelService {

    private final VideoModelMapper modelMapper;
    private final ChannelMapper channelMapper;
    private final ObjectMapper objectMapper;

    public ModelService(VideoModelMapper modelMapper, ChannelMapper channelMapper, ObjectMapper objectMapper) {
        this.modelMapper = modelMapper;
        this.channelMapper = channelMapper;
        this.objectMapper = objectMapper;
    }

    public List<ModelDtos.ModelView> listVideoModels() {
        return listModels("video");
    }

    public List<ModelDtos.ModelView> listModels(String requestedCapability) {
        String capability = requestedCapability == null || requestedCapability.isBlank()
                ? "video" : normalizeCapability(requestedCapability);
        List<ModelDtos.ModelView> result = new ArrayList<>();
        Set<String> seenModelKeys = new HashSet<>();
        List<VideoModel> models = modelMapper.selectEnabledByCapabilitySorted(capability);
        for (VideoModel model : models) {
            Channel channel = channelMapper.selectById(model.getChannelId());
            String modelKey = logicalModelKey(model);
            if (channel == null || channel.getEnabled() == null || channel.getEnabled() != 1
                    || !readChannelCapabilities(channel.getCapabilities()).contains(capability)
                    || !seenModelKeys.add(modelKey.toLowerCase(Locale.ROOT))) {
                continue;
            }
            VideoModel canonical = modelMapper.selectCanonicalByModelKey(modelKey, capability);
            if (canonical != null) {
                result.add(toView(canonical));
            }
        }
        return result;
    }

    public ModelDtos.ModelView toView(VideoModel model) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("seconds", readList(model.getSupportedSeconds()));
        params.put("sizes", readList(model.getSupportedSizes()));
        params.put("resolutions", pricingResolutions(model));
        params.put("ratios", readList(model.getSupportedRatios()));
        params.put("supportsAudio", model.getSupportsAudio() != null && model.getSupportsAudio() == 1);
        params.put("supportsWatermark", model.getSupportsWatermark() != null && model.getSupportsWatermark() == 1);
        params.put("supportsFirstLastFrame", model.getSupportsFirstLastFrame() != null && model.getSupportsFirstLastFrame() == 1);
        params.put("supportsReferenceImages", model.getSupportsReferenceImages() != null && model.getSupportsReferenceImages() == 1);
        params.put("maxReferenceImages", model.getMaxReferenceImages());
        params.put("resolutionDefault", model.getResolutionDefault());
        Map<String, Object> pricing = new LinkedHashMap<>();
        pricing.put("creditsPerSecond", model.getCreditsPerSecond());
        pricing.put("rules", readPricingRules(model.getPricingRules()));
        pricing.put("resolutionFactors", readMap(model.getResolutionFactors()));
        pricing.put("audioFactor", model.getAudioFactor());
        pricing.put("minChargeCredits", model.getMinChargeCredits());
        return new ModelDtos.ModelView(logicalModelKey(model), model.getDisplayName(),
                model.getCapability(), params, pricing);
    }

    public List<ModelDtos.ModelAdminView> adminList() {
        List<ModelDtos.ModelAdminView> result = new ArrayList<>();
        for (VideoModel model : modelMapper.selectAllSorted()) {
            Channel channel = channelMapper.selectById(model.getChannelId());
            result.add(toAdminView(model, channel));
        }
        return result;
    }

    public ModelDtos.ModelAdminView create(AdminDtos.ModelRequest request) {
        VideoModel model = new VideoModel();
        apply(model, request, true);
        modelMapper.insert(model);
        return toAdminView(model, channelMapper.selectById(model.getChannelId()));
    }

    public ModelDtos.ModelAdminView update(Long id, AdminDtos.ModelRequest request) {
        VideoModel model = requireVideoModel(id);
        apply(model, request, false);
        modelMapper.updateById(model);
        return toAdminView(model, channelMapper.selectById(model.getChannelId()));
    }

    public void delete(Long id) {
        VideoModel model = requireVideoModel(id);
        model.setEnabled(0);
        modelMapper.updateById(model);
    }

    public ModelDtos.ModelAdminView toAdminView(VideoModel model, Channel channel) {
        return new ModelDtos.ModelAdminView(model.getId(), model.getChannelId(),
                channel == null ? "" : channel.getName(), logicalModelKey(model), model.getRouteWeight(),
                model.getUpstreamModel(), model.getDisplayName(),
                model.getCapability(), model.getEnabled(), model.getSort(), model.getCreditsPerSecond(),
                model.getPricingRules(), model.getResolutionFactors(), model.getResolutionDefault(), model.getAudioFactor(),
                model.getMinChargeCredits(), model.getSupportedSeconds(), model.getSupportedSizes(),
                model.getSupportedRatios(), model.getSupportsAudio(), model.getSupportsWatermark(),
                model.getSupportsFirstLastFrame(), model.getSupportsReferenceImages(),
                model.getMaxReferenceImages(), model.getCreatedAt());
    }

    private void apply(VideoModel model, AdminDtos.ModelRequest request, boolean create) {
        if (create) {
            if (request.channelId() == null || channelMapper.selectById(request.channelId()) == null) {
                throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40001, "渠道不存在");
            }
            if (request.upstreamModel() == null || request.upstreamModel().isBlank()) {
                throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40001, "上游模型名不能为空");
            }
            if (request.displayName() == null || request.displayName().isBlank()) {
                throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40001, "展示名不能为空");
            }
        }
        if (request.channelId() != null) {
            if (channelMapper.selectById(request.channelId()) == null) {
                throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40001, "渠道不存在");
            }
            model.setChannelId(request.channelId());
        }
        if (request.upstreamModel() != null && !request.upstreamModel().isBlank()) {
            model.setUpstreamModel(request.upstreamModel().trim());
        }
        String modelKey = request.modelKey();
        if (modelKey == null && create) {
            modelKey = model.getUpstreamModel();
        }
        if (modelKey != null) {
            modelKey = modelKey.trim();
            if (modelKey.isBlank() || modelKey.length() > 128) {
                throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40001,
                        "逻辑模型标识不能为空且不能超过 128 个字符");
            }
            model.setModelKey(modelKey);
        }
        if (request.routeWeight() != null) {
            if (request.routeWeight() <= 0 || request.routeWeight() > 1_000_000) {
                throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40001,
                        "线路权重必须在 1 到 1000000 之间");
            }
            model.setRouteWeight(request.routeWeight());
        } else if (create) {
            model.setRouteWeight(100);
        }
        if (request.displayName() != null && !request.displayName().isBlank()) {
            model.setDisplayName(request.displayName().trim());
        }
        String capability = request.capability() == null || request.capability().isBlank()
                ? (create ? "video" : model.getCapability()) : normalizeCapability(request.capability());
        model.setCapability(capability);
        if (request.enabled() != null) {
            model.setEnabled(request.enabled() ? 1 : 0);
        } else if (create) {
            model.setEnabled(1);
        }
        model.setSort(request.sort() == null ? (create ? 0 : model.getSort()) : request.sort());
        model.setCreditsPerSecond(request.creditsPerSecond() == null
                ? (create ? new java.math.BigDecimal("10") : model.getCreditsPerSecond()) : request.creditsPerSecond());
        model.setPricingRules(orDefaultPricingRules(request.pricingRules(), model.getPricingRules(), create, capability));
        model.setResolutionFactors(orDefaultJson(request.resolutionFactors(),
                "image".equals(capability) ? "{}" : "{\"480p\":1.0,\"720p\":1.5,\"1080p\":2.0}",
                model.getResolutionFactors(), create, "分辨率系数"));
        model.setResolutionDefault(request.resolutionDefault() == null || request.resolutionDefault().isBlank()
                ? (create ? ("image".equals(capability) ? "1024x1024" : "720p") : model.getResolutionDefault()) : request.resolutionDefault());
        model.setAudioFactor(request.audioFactor() == null
                ? (create ? java.math.BigDecimal.ONE : model.getAudioFactor()) : request.audioFactor());
        model.setMinChargeCredits(request.minChargeCredits() == null
                ? (create ? 1L : model.getMinChargeCredits()) : request.minChargeCredits());
        model.setSupportedSeconds(orDefaultJson(request.supportedSeconds(),
                "image".equals(capability) ? "[]" : "[\"4\",\"8\",\"12\"]",
                model.getSupportedSeconds(), create, "时长枚举"));
        model.setSupportedSizes(orDefaultJson(request.supportedSizes(),
                "image".equals(capability) ? "[\"1024x1024\"]" : "[\"1280x720\",\"720x1280\"]",
                model.getSupportedSizes(), create, "尺寸枚举"));
        model.setSupportedRatios(request.supportedRatios() == null ? model.getSupportedRatios()
                : validateJson(request.supportedRatios(), "宽高比枚举"));
        model.setSupportsAudio(request.supportsAudio() == null
                ? (create ? 0 : model.getSupportsAudio()) : request.supportsAudio());
        model.setSupportsWatermark(request.supportsWatermark() == null
                ? (create ? 0 : model.getSupportsWatermark()) : request.supportsWatermark());
        model.setSupportsFirstLastFrame(request.supportsFirstLastFrame() == null
                ? (create ? 0 : model.getSupportsFirstLastFrame()) : request.supportsFirstLastFrame());
        model.setSupportsReferenceImages(request.supportsReferenceImages() == null
                ? (create ? 1 : model.getSupportsReferenceImages()) : request.supportsReferenceImages());
        model.setMaxReferenceImages(request.maxReferenceImages() == null
                ? (create ? 1 : model.getMaxReferenceImages()) : request.maxReferenceImages());

        Channel channel = channelMapper.selectById(model.getChannelId());
        if (channel == null || !readChannelCapabilities(channel.getCapabilities()).contains(capability)) {
            throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40001,
                    "所选渠道不支持" + ("image".equals(capability) ? "图片" : "视频") + "能力");
        }
    }

    private String logicalModelKey(VideoModel model) {
        return model.getModelKey() == null || model.getModelKey().isBlank()
                ? model.getUpstreamModel() : model.getModelKey();
    }

    private String normalizeCapability(String capability) {
        if (!"image".equals(capability) && !"video".equals(capability)) {
            throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40001,
                    "模型类型仅支持 image 或 video");
        }
        return capability;
    }

    private String orDefaultPricingRules(String value, String current, boolean create, String capability) {
        if (value == null || value.isBlank()) {
            return create ? "[]" : current;
        }
        try {
            JsonNode rules = objectMapper.readTree(value);
            if (!rules.isArray()) {
                throw new IllegalArgumentException();
            }
            Set<String> seen = new HashSet<>();
            for (JsonNode rule : rules) {
                if (!rule.isObject() || rule.path("resolution").asText().isBlank()
                        || !rule.has("credits") || rule.path("credits").decimalValue().signum() <= 0
                        || ("video".equals(capability) && rule.path("seconds").asInt(0) <= 0)) {
                    throw new IllegalArgumentException();
                }
                String key = rule.path("resolution").asText() + ("video".equals(capability)
                        ? "|" + rule.path("seconds").asInt() : "");
                if (!seen.add(key)) {
                    throw new IllegalArgumentException();
                }
            }
            return objectMapper.writeValueAsString(rules);
        } catch (Exception ex) {
            throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40001,
                    "规格价格格式不合法");
        }
    }

    private List<String> readChannelCapabilities(String json) {
        List<String> capabilities = readList(json);
        return capabilities.isEmpty() ? List.of("video") : capabilities;
    }

    private List<String> pricingResolutions(VideoModel model) {
        List<String> resolutions = new ArrayList<>();
        for (Map<String, Object> rule : readPricingRules(model.getPricingRules())) {
            Object resolution = rule.get("resolution");
            if (resolution != null && !resolutions.contains(String.valueOf(resolution))) {
                resolutions.add(String.valueOf(resolution));
            }
        }
        if (resolutions.isEmpty()) {
            resolutions.addAll(readMap(model.getResolutionFactors()).keySet());
        }
        return resolutions;
    }

    private List<Map<String, Object>> readPricingRules(String json) {
        try {
            return json == null ? List.of() : objectMapper.readValue(json,
                    new TypeReference<List<Map<String, Object>>>() {
                    });
        } catch (Exception ex) {
            return List.of();
        }
    }

    private String orDefaultJson(String value, String defaultValue, String current, boolean create, String field) {
        if (value == null || value.isBlank()) {
            return create ? defaultValue : current;
        }
        return validateJson(value, field);
    }

    private String validateJson(String value, String field) {
        try {
            objectMapper.readTree(value);
            return value;
        } catch (Exception ex) {
            throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40001,
                    field + " 必须是合法 JSON");
        }
    }

    public VideoModel requireVideoModel(Long id) {
        VideoModel model = modelMapper.selectById(id);
        if (model == null) {
            throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40003, "模型不存在");
        }
        return model;
    }

    private List<String> readList(String json) {
        try {
            return json == null ? List.of() : objectMapper.readValue(json, new TypeReference<List<String>>() {
            });
        } catch (Exception ex) {
            return List.of();
        }
    }

    private Map<String, Object> readMap(String json) {
        try {
            return json == null ? Map.of() : objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {
            });
        } catch (Exception ex) {
            return Map.of();
        }
    }
}
