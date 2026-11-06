package com.infinitecanvas.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.common.BizException;
import com.infinitecanvas.common.ErrorCode;
import com.infinitecanvas.dto.AdminDtos;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.gateway.UpstreamClient;
import com.infinitecanvas.mapper.ChannelMapper;
import com.infinitecanvas.mapper.VideoModelMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
public class ChannelService {

    private final ChannelMapper channelMapper;
    private final VideoModelMapper modelMapper;
    private final CryptoService cryptoService;
    private final BaseUrlNormalizer baseUrlNormalizer;
    private final SsrfGuard ssrfGuard;
    private final UpstreamClient upstreamClient;
    private final ObjectMapper objectMapper;

    public ChannelService(ChannelMapper channelMapper, VideoModelMapper modelMapper, CryptoService cryptoService,
                          BaseUrlNormalizer baseUrlNormalizer, SsrfGuard ssrfGuard, UpstreamClient upstreamClient,
                          ObjectMapper objectMapper) {
        this.channelMapper = channelMapper;
        this.modelMapper = modelMapper;
        this.cryptoService = cryptoService;
        this.baseUrlNormalizer = baseUrlNormalizer;
        this.ssrfGuard = ssrfGuard;
        this.upstreamClient = upstreamClient;
        this.objectMapper = objectMapper;
    }

    public List<AdminDtos.ChannelView> list() {
        List<AdminDtos.ChannelView> views = new ArrayList<>();
        for (Channel channel : channelMapper.selectAllSorted()) {
            int modelCount = (int) modelMapper.countByChannelId(channel.getId());
            views.add(toView(channel, modelCount));
        }
        return views;
    }

    public Channel require(Long id) {
        Channel channel = channelMapper.selectById(id);
        if (channel == null) {
            throw new BizException("CHANNEL_40401", "渠道不存在", null, 404);
        }
        return channel;
    }

    @Transactional
    public AdminDtos.ChannelView create(AdminDtos.ChannelRequest request, Long adminId) {
        validate(request, true);
        BaseUrlNormalizer.Normalized normalized = baseUrlNormalizer.normalize(request.baseUrl());
        ssrfGuard.assertBaseUrl(normalized.normalized());
        Channel channel = new Channel();
        channel.setName(request.name().trim());
        channel.setProtocol(normalizeProtocol(request.protocol()));
        channel.setCapabilities(writeCapabilities(normalizeCapabilities(request.capabilities())));
        channel.setBaseUrl(normalized.original());
        channel.setNormalizedBaseUrl(normalized.normalized());
        String apiKey = request.apiKey().trim();
        channel.setApiKeyCipher(cryptoService.encrypt(apiKey).getBytes(StandardCharsets.UTF_8));
        channel.setApiKeyMask(cryptoService.mask(apiKey));
        channel.setAuthType(request.authType() == null || request.authType().isBlank() ? "bearer" : request.authType());
        channel.setAuthHeader(request.authHeader() == null ? "" : request.authHeader());
        channel.setConnectTimeoutMs(request.connectTimeoutMs() == null ? 5000 : request.connectTimeoutMs());
        channel.setReadTimeoutMs(request.readTimeoutMs() == null ? 900000 : request.readTimeoutMs());
        channel.setMaxConcurrency(request.maxConcurrency() == null ? 8 : request.maxConcurrency());
        channel.setEnabled(request.enabled() == null || request.enabled() ? 1 : 0);
        channelMapper.insert(channel);
        return toView(channel, 0);
    }

    @Transactional
    public AdminDtos.ChannelView update(Long id, AdminDtos.ChannelRequest request, Long adminId) {
        Channel channel = require(id);
        if (request.name() != null && !request.name().isBlank()) {
            channel.setName(request.name().trim());
        }
        if (request.protocol() != null) {
            channel.setProtocol(normalizeProtocol(request.protocol()));
        }
        if (request.capabilities() != null) {
            channel.setCapabilities(writeCapabilities(normalizeCapabilities(request.capabilities())));
        }
        if (request.baseUrl() != null && !request.baseUrl().isBlank()) {
            BaseUrlNormalizer.Normalized normalized = baseUrlNormalizer.normalize(request.baseUrl());
            ssrfGuard.assertBaseUrl(normalized.normalized());
            channel.setBaseUrl(normalized.original());
            channel.setNormalizedBaseUrl(normalized.normalized());
        }
        if (request.apiKey() != null && !request.apiKey().isBlank()) {
            String apiKey = request.apiKey().trim();
            channel.setApiKeyCipher(cryptoService.encrypt(apiKey).getBytes(StandardCharsets.UTF_8));
            channel.setApiKeyMask(cryptoService.mask(apiKey));
        }
        if (request.authType() != null) {
            channel.setAuthType(request.authType());
        }
        if (request.authHeader() != null) {
            channel.setAuthHeader(request.authHeader());
        }
        if (request.maxConcurrency() != null) {
            channel.setMaxConcurrency(request.maxConcurrency());
        }
        if (request.connectTimeoutMs() != null) {
            channel.setConnectTimeoutMs(request.connectTimeoutMs());
        }
        if (request.readTimeoutMs() != null) {
            channel.setReadTimeoutMs(request.readTimeoutMs());
        }
        if (request.enabled() != null) {
            channel.setEnabled(request.enabled() ? 1 : 0);
        }
        channelMapper.updateById(channel);
        int modelCount = (int) modelMapper.countByChannelId(channel.getId());
        return toView(channel, modelCount);
    }

    /** Delete if no model references it, otherwise disable. */
    @Transactional
    public void delete(Long id) {
        Channel channel = require(id);
        long modelCount = modelMapper.countByChannelId(id);
        if (modelCount > 0) {
            channel.setEnabled(0);
            channelMapper.updateById(channel);
            throw new BizException("CHANNEL_40901", "渠道下仍有模型，已改为停用", null, 409);
        }
        channelMapper.deleteById(id);
    }

    public AdminDtos.ChannelTestResult test(Long id) {
        Channel channel = require(id);
        long start = System.currentTimeMillis();
        try {
            List<String> models = upstreamClient.listModels(channel);
            long latency = System.currentTimeMillis() - start;
            channel.setLastTestAt(LocalDateTime.now());
            channel.setLastTestOk(true);
            channel.setLastTestMessage("ok, models=" + models.size());
            channelMapper.updateById(channel);
            return new AdminDtos.ChannelTestResult(true, latency, models, "连接成功");
        } catch (Exception ex) {
            long latency = System.currentTimeMillis() - start;
            channel.setLastTestAt(LocalDateTime.now());
            channel.setLastTestOk(false);
            channel.setLastTestMessage(ex.getMessage() == null ? "failed" : ex.getMessage().substring(0, Math.min(400, ex.getMessage().length())));
            channelMapper.updateById(channel);
            return new AdminDtos.ChannelTestResult(false, latency, List.of(), "连接失败：" + channel.getLastTestMessage());
        }
    }

    public AdminDtos.ChannelTestResult syncModels(Long id, String modelsUrl) {
        Channel channel = require(id);
        long start = System.currentTimeMillis();
        try {
            List<String> models = upstreamClient.listModels(channel, modelsUrl);
            return new AdminDtos.ChannelTestResult(true, System.currentTimeMillis() - start, models, "模型列表同步成功");
        } catch (Exception ex) {
            String detail = ex.getMessage() == null ? "failed" : ex.getMessage();
            return new AdminDtos.ChannelTestResult(false, System.currentTimeMillis() - start, List.of(),
                    "模型列表同步失败：" + detail.substring(0, Math.min(400, detail.length())));
        }
    }

    public AdminDtos.ChannelView toView(Channel channel, int modelCount) {
        return new AdminDtos.ChannelView(channel.getId(), channel.getName(), channel.getProtocol(),
                readCapabilities(channel.getCapabilities()), channel.getBaseUrl(), channel.getNormalizedBaseUrl(), channel.getApiKeyMask(),
                channel.getAuthType(), channel.getEnabled(), channel.getMaxConcurrency(),
                channel.getLastTestOk(), channel.getLastTestMessage(), channel.getLastTestAt(),
                channel.getCreatedAt(), modelCount);
    }

    private void validate(AdminDtos.ChannelRequest request, boolean requireKey) {
        if (request.name() == null || request.name().isBlank()) {
            throw new BizException(ErrorCode.VALID_40001, "渠道名称不能为空");
        }
        if (request.baseUrl() == null || request.baseUrl().isBlank()) {
            throw new BizException(ErrorCode.CHANNEL_42201, "Base URL 不能为空");
        }
        if (requireKey && (request.apiKey() == null || request.apiKey().isBlank())) {
            throw new BizException(ErrorCode.VALID_40001, "API Key 不能为空");
        }
    }

    public List<String> readCapabilities(String json) {
        try {
            List<String> values = json == null ? List.of("video")
                    : objectMapper.readValue(json, objectMapper.getTypeFactory().constructCollectionType(List.class, String.class));
            return normalizeCapabilities(values);
        } catch (Exception ex) {
            return List.of("video");
        }
    }

    private List<String> normalizeCapabilities(List<String> capabilities) {
        if (capabilities == null || capabilities.isEmpty()) {
            return List.of("video");
        }
        List<String> normalized = new ArrayList<>();
        for (String capability : capabilities) {
            if (!"image".equals(capability) && !"video".equals(capability)) {
                throw new BizException(ErrorCode.VALID_40001, "渠道能力仅支持 image 或 video");
            }
            if (!normalized.contains(capability)) {
                normalized.add(capability);
            }
        }
        return normalized;
    }

    private String writeCapabilities(List<String> capabilities) {
        try {
            return objectMapper.writeValueAsString(capabilities);
        } catch (Exception ex) {
            throw new BizException(ErrorCode.VALID_40001, "渠道能力格式不合法");
        }
    }

    private String normalizeProtocol(String protocol) {
        if (protocol == null || protocol.isBlank()) {
            return "openai-official";
        }
        return switch (protocol) {
            case "openai-official", "openai-json", "newapi", "json-envelope", "dual-dialect", "sub2api" -> protocol;
            default -> throw new BizException(ErrorCode.CHANNEL_42201, "不支持的协议档位");
        };
    }
}
