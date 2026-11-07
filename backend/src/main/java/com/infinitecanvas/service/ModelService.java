package com.infinitecanvas.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.dto.AdminDtos;
import com.infinitecanvas.dto.ModelDtos;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.entity.VideoModel;
import com.infinitecanvas.common.BizException;
import com.infinitecanvas.mapper.ChannelMapper;
import com.infinitecanvas.mapper.VideoModelMapper;
import com.infinitecanvas.mapper.VideoTaskMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
    private final VideoTaskMapper taskMapper;
    private final ObjectMapper objectMapper;

    public ModelService(VideoModelMapper modelMapper, ChannelMapper channelMapper,
                        VideoTaskMapper taskMapper, ObjectMapper objectMapper) {
        this.modelMapper = modelMapper;
        this.channelMapper = channelMapper;
        this.taskMapper = taskMapper;
        this.objectMapper = objectMapper;
    }

    public List<ModelDtos.ModelView> listVideoModels() {
        return listModels("video");
    }

    public List<ModelDtos.ModelView> listModels(String requestedCapability) {
        String capability = requestedCapability == null || requestedCapability.isBlank()
                ? "video" : normalizeCapability(requestedCapability);
        if (!"image".equals(capability) && !"video".equals(capability)) {
            throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40001,
                    "生成接口仅支持 image 或 video");
        }
        List<ModelDtos.ModelView> result = new ArrayList<>();
        Set<String> seenModelKeys = new HashSet<>();
        List<VideoModel> models = modelMapper.selectEnabledByCapabilitySorted(capability);
        for (VideoModel model : models) {
            Channel channel = channelMapper.selectById(model.getChannelId());
            String modelKey = logicalModelKey(model);
            if (channel == null || channel.getEnabled() == null || channel.getEnabled() != 1
                    || model.getRouteWeight() != null && model.getRouteWeight() <= 0
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
        return adminList(null);
    }

    public List<ModelDtos.ModelAdminView> adminList(String requestedCapability) {
        String capability = requestedCapability == null || requestedCapability.isBlank()
                ? null : normalizeCapability(requestedCapability);
        List<ModelDtos.ModelAdminView> result = new ArrayList<>();
        for (VideoModel model : modelMapper.selectAllSorted()) {
            if (capability != null && !capability.equals(model.getCapability())) continue;
            model.setCurrentLoad((int) Math.min(Integer.MAX_VALUE, Math.max(0, taskMapper.countActiveByModel(model.getId()))));
            Channel channel = channelMapper.selectById(model.getChannelId());
            result.add(toAdminView(model, channel));
        }
        return result;
    }

    public List<ModelDtos.ClassificationSuggestion> classificationPreview() {
        List<VideoModel> inventory = modelMapper.selectAllSorted();
        Map<Long, String> suggested = new LinkedHashMap<>();
        for (VideoModel model : inventory) {
            String next = com.infinitecanvas.gateway.ModelCapabilityClassifier.classify(model.getUpstreamModel());
            if (!"unknown".equals(next) && !next.equals(model.getCapability())) suggested.put(model.getId(), next);
        }
        List<ModelDtos.ClassificationSuggestion> result = new ArrayList<>();
        for (VideoModel model : inventory) {
            String next = suggested.get(model.getId());
            if (next != null && compatibleClassificationPricing(model, next, inventory, suggested)) {
                result.add(new ModelDtos.ClassificationSuggestion(model.getId(), model.getCapability(), next,
                        model.getUpstreamModel(), logicalModelKey(model)));
            }
        }
        return result;
    }

    @Transactional
    public ModelDtos.ClassificationApplyResult classificationApply(ModelDtos.ClassificationApplyRequest request) {
        if (request == null || request.items() == null) {
            throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40001,
                    "缺少已确认的分类预览");
        }
        Map<Long, ModelDtos.ClassificationSuggestion> changes = new java.util.TreeMap<>();
        for (var item : request.items()) {
            if (item == null || item.id() == null || changes.putIfAbsent(item.id(), item) != null) throw classificationConflict();
        }
        if (changes.isEmpty()) return new ModelDtos.ClassificationApplyResult(0);
        // This rare administrator operation locks inventory in ascending id order, including all target pricing groups.
        List<VideoModel> inventory = modelMapper.selectAllForUpdate();
        Map<Long, VideoModel> current = new LinkedHashMap<>();
        Map<Long, String> suggested = new LinkedHashMap<>();
        for (VideoModel model : inventory) current.put(model.getId(), model);
        for (var item : changes.values()) {
            VideoModel model = current.get(item.id());
            if (model == null || !java.util.Objects.equals(model.getCapability(), item.currentCapability())
                    || !java.util.Objects.equals(model.getUpstreamModel(), item.upstreamModel())
                    || !java.util.Objects.equals(logicalModelKey(model), item.modelKey())) throw classificationConflict();
            String next = com.infinitecanvas.gateway.ModelCapabilityClassifier.classify(model.getUpstreamModel());
            if ("unknown".equals(next) || next.equals(model.getCapability()) || !next.equals(item.suggestedCapability())) {
                throw classificationConflict();
            }
            suggested.put(model.getId(), next);
        }
        // Validate the entire batch before the first write; never silently inherit a target group's different sale prices.
        for (var item : changes.values()) {
            if (!compatibleClassificationPricing(current.get(item.id()), item.suggestedCapability(), inventory, suggested)) {
                throw classificationConflict();
            }
        }
        for (var item : changes.values()) {
            if (modelMapper.updateCapabilityIfUnchanged(current.get(item.id()), item.suggestedCapability()) != 1) {
                throw classificationConflict();
            }
        }
        return new ModelDtos.ClassificationApplyResult(changes.size());
    }

    private boolean compatibleClassificationPricing(VideoModel candidate, String target, List<VideoModel> inventory,
                                                      Map<Long, String> suggested) {
        for (VideoModel other : inventory) {
            if (java.util.Objects.equals(candidate.getId(), other.getId())) continue;
            if (logicalModelKey(candidate).equalsIgnoreCase(logicalModelKey(other))
                    && (target.equals(other.getCapability()) || target.equals(suggested.get(other.getId())))
                    && !sameSalePricing(candidate, other)) return false;
        }
        return true;
    }

    private boolean sameSalePricing(VideoModel first, VideoModel second) {
        return samePricingJson(first.getPricingRules(), second.getPricingRules())
                && samePricingJson(first.getResolutionFactors(), second.getResolutionFactors())
                && samePricingDecimal(first.getCreditsPerSecond(), second.getCreditsPerSecond())
                && samePricingDecimal(first.getAudioFactor(), second.getAudioFactor())
                && java.util.Objects.equals(first.getMinChargeCredits(), second.getMinChargeCredits());
    }

    private boolean samePricingDecimal(java.math.BigDecimal first, java.math.BigDecimal second) {
        return first == null ? second == null : second != null && first.compareTo(second) == 0;
    }

    private boolean samePricingJson(String first, String second) {
        if (java.util.Objects.equals(first, second)) return true;
        if (first == null || second == null) return false;
        try {
            return java.util.Objects.equals(objectMapper.readTree(first), objectMapper.readTree(second));
        } catch (Exception ignored) {
            return false;
        }
    }

    private com.infinitecanvas.common.BizException classificationConflict() {
        return new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40001,
                "模型分类、上游身份或目标逻辑组售价已冲突，请刷新预览；售价冲突请先手动统一五个售价字段", null, 409);
    }

    @Transactional
    public ModelDtos.ModelAdminView create(AdminDtos.ModelRequest request) {
        VideoModel model = new VideoModel();
        apply(model, request, true);
        lockAndValidateRoute(model, true);
        inheritLogicalPricing(model);
        modelMapper.insert(model);
        modelMapper.updateLogicalPricing(model);
        return toAdminView(model, channelMapper.selectById(model.getChannelId()));
    }

    @Transactional
    public ModelDtos.ModelAdminView update(Long id, AdminDtos.ModelRequest request) {
        VideoModel model = requireVideoModel(id);
        String previousKey = logicalModelKey(model);
        String previousCapability = model.getCapability();
        Long previousChannel = model.getChannelId();
        String previousUpstream = model.getUpstreamModel();
        apply(model, request, false);
        lockAndValidateRoute(model, !java.util.Objects.equals(previousChannel, model.getChannelId())
                || !java.util.Objects.equals(previousUpstream, model.getUpstreamModel()));
        boolean regrouped = !logicalModelKey(model).equalsIgnoreCase(previousKey)
                || !model.getCapability().equals(previousCapability);
        if (regrouped) {
            inheritLogicalPricing(model);
        } else if (hasPricingChange(request)) {
            VideoModel canonical = modelMapper.selectCanonicalByModelKeyForUpdate(logicalModelKey(model), model.getCapability());
            if (canonical != null) {
                copyPricing(canonical, model);
                apply(model, request, false);
            }
        }
        modelMapper.updateById(model);
        if (regrouped || hasPricingChange(request)) {
            modelMapper.updateLogicalPricing(model);
        }
        if (!java.util.Objects.equals(previousChannel, model.getChannelId())
                || !java.util.Objects.equals(previousUpstream, model.getUpstreamModel())
                || !java.util.Objects.equals(previousCapability, model.getCapability())) {
            modelMapper.updateCost(id, null, null, null);
            model.setCostPerUnit(null);
            model.setCostQuotaType(null);
            model.setCostSyncedAt(null);
        }
        return toAdminView(model, channelMapper.selectById(model.getChannelId()));
    }

    private void lockAndValidateRoute(VideoModel model, boolean checkUnique) {
        if (channelMapper.selectByIdForUpdate(model.getChannelId()) == null) {
            throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40003,
                    "所选渠道不存在");
        }
        if (!checkUnique) return;
        VideoModel existing = modelMapper.selectByChannelAndUpstream(model.getChannelId(), model.getUpstreamModel());
        if (existing != null && !java.util.Objects.equals(existing.getId(), model.getId())) {
            throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40001,
                    "该渠道已存在相同上游模型线路");
        }
    }

    private boolean hasPricingChange(AdminDtos.ModelRequest request) {
        return request.pricingRules() != null || request.creditsPerSecond() != null
                || request.resolutionFactors() != null || request.audioFactor() != null
                || request.minChargeCredits() != null;
    }

    private void inheritLogicalPricing(VideoModel model) {
        VideoModel canonical = modelMapper.selectCanonicalByModelKeyForUpdate(logicalModelKey(model), model.getCapability());
        if (canonical != null && !java.util.Objects.equals(canonical.getId(), model.getId())) {
            copyPricing(canonical, model);
        }
    }

    static void copyPricing(VideoModel source, VideoModel target) {
        target.setPricingRules(source.getPricingRules());
        target.setCreditsPerSecond(source.getCreditsPerSecond());
        target.setResolutionFactors(source.getResolutionFactors());
        target.setAudioFactor(source.getAudioFactor());
        target.setMinChargeCredits(source.getMinChargeCredits());
    }

    @Transactional
    public void delete(Long id) {
        requireVideoModel(id);
        if (taskMapper.countByModelId(id) > 0) {
            throw new BizException("MODEL_40901", "模型已有历史任务，无法删除；请在编辑中停用该模型", null, 409);
        }
        modelMapper.deleteById(id);
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
                model.getMaxReferenceImages(), model.getCreatedAt(), model.getCostPerUnit(),
                model.getCostQuotaType(), model.getCostSyncedAt(), model.getCurrentLoad());
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
        boolean creative = "image".equals(capability) || "video".equals(capability);
        if (request.enabled() != null) {
            model.setEnabled(request.enabled() ? 1 : 0);
        } else if (create) {
            model.setEnabled(1);
        }
        if ("unknown".equals(capability)) model.setEnabled(0);
        model.setSort(request.sort() == null ? (create ? 0 : model.getSort()) : request.sort());
        model.setCreditsPerSecond(request.creditsPerSecond() == null
                ? (create ? (creative ? new java.math.BigDecimal("10") : java.math.BigDecimal.ZERO) : model.getCreditsPerSecond()) : request.creditsPerSecond());
        model.setPricingRules(orDefaultPricingRules(request.pricingRules(), model.getPricingRules(), create, capability));
        model.setResolutionFactors(orDefaultJson(request.resolutionFactors(),
                "video".equals(capability) ? "{\"480p\":1.0,\"720p\":1.5,\"1080p\":2.0}" : "{}",
                model.getResolutionFactors(), create, "分辨率系数"));
        model.setResolutionDefault(request.resolutionDefault() == null || request.resolutionDefault().isBlank()
                ? (create ? ("image".equals(capability) ? "1024x1024" : "video".equals(capability) ? "720p" : "") : model.getResolutionDefault()) : request.resolutionDefault());
        model.setAudioFactor(request.audioFactor() == null
                ? (create ? java.math.BigDecimal.ONE : model.getAudioFactor()) : request.audioFactor());
        model.setMinChargeCredits(request.minChargeCredits() == null
                ? (create ? 1L : model.getMinChargeCredits()) : request.minChargeCredits());
        model.setSupportedSeconds(orDefaultJson(request.supportedSeconds(),
                "video".equals(capability) ? "[\"4\",\"8\",\"12\"]" : "[]",
                model.getSupportedSeconds(), create, "时长枚举"));
        model.setSupportedSizes(orDefaultJson(request.supportedSizes(),
                "image".equals(capability) ? "[\"1024x1024\"]" : "video".equals(capability) ? "[\"1280x720\",\"720x1280\"]" : "[]",
                model.getSupportedSizes(), create, "尺寸枚举"));
        model.setSupportedRatios(request.supportedRatios() == null ? model.getSupportedRatios()
                : validateJson(request.supportedRatios(), "宽高比枚举"));
        model.setSupportsAudio(request.supportsAudio() == null
                ? (create ? Integer.valueOf(0) : model.getSupportsAudio()) : request.supportsAudio());
        model.setSupportsWatermark(request.supportsWatermark() == null
                ? (create ? Integer.valueOf(0) : model.getSupportsWatermark()) : request.supportsWatermark());
        model.setSupportsFirstLastFrame(request.supportsFirstLastFrame() == null
                ? (create ? Integer.valueOf(0) : model.getSupportsFirstLastFrame()) : request.supportsFirstLastFrame());
        model.setSupportsReferenceImages(request.supportsReferenceImages() == null
                ? (create ? Integer.valueOf(creative ? 1 : 0) : model.getSupportsReferenceImages()) : request.supportsReferenceImages());
        model.setMaxReferenceImages(request.maxReferenceImages() == null
                ? (create ? Integer.valueOf(creative ? 1 : 0) : model.getMaxReferenceImages()) : request.maxReferenceImages());

        Channel channel = channelMapper.selectById(model.getChannelId());
        if (channel == null || creative && !readChannelCapabilities(channel.getCapabilities()).contains(capability)) {
            throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40001,
                    "所选渠道不支持" + ("image".equals(capability) ? "图片" : "视频") + "能力");
        }
    }

    private String logicalModelKey(VideoModel model) {
        return model.getModelKey() == null || model.getModelKey().isBlank()
                ? model.getUpstreamModel() : model.getModelKey();
    }

    private String normalizeCapability(String capability) {
        if (!List.of("llm", "image", "video", "unknown").contains(capability)) {
            throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40001,
                    "模型类型仅支持 llm、image、video 或 unknown");
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
