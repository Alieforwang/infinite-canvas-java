package com.infinitecanvas.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.common.BizException;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.entity.UpstreamPrice;
import com.infinitecanvas.entity.VideoModel;
import com.infinitecanvas.mapper.ChannelMapper;
import com.infinitecanvas.mapper.UpstreamPriceMapper;
import com.infinitecanvas.mapper.VideoModelMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatusCode;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class UpstreamPriceService {
    private static final Logger log = LoggerFactory.getLogger(UpstreamPriceService.class);
    /** Public pricing endpoint — always on the root of duoyuanx.com, not the channel sub-path. */
    private static final URI PRICING_URI = URI.create("https://duoyuanx.com/api/pricing");
    private static final Duration STALE_AFTER = Duration.ofHours(7);
    private final ChannelMapper channels;
    private final UpstreamPriceMapper prices;
    private final ObjectMapper json;
    private final TransactionTemplate transaction;
    private final HttpClient http;
    private final CryptoService crypto;
    private final VideoModelMapper modelMapper;
    private final SettingService settingService;

    @Autowired
    public UpstreamPriceService(ChannelMapper channels, UpstreamPriceMapper prices, ObjectMapper json,
                                TransactionTemplate transaction, CryptoService crypto,
                                VideoModelMapper modelMapper, SettingService settingService) {
        this(channels, prices, json, transaction, crypto, modelMapper, settingService,
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
                        .followRedirects(HttpClient.Redirect.NEVER).build());
    }

    UpstreamPriceService(ChannelMapper channels, UpstreamPriceMapper prices, ObjectMapper json,
                         TransactionTemplate transaction, CryptoService crypto,
                         VideoModelMapper modelMapper, SettingService settingService, HttpClient http) {
        this.channels = channels;
        this.prices = prices;
        this.json = json;
        this.transaction = transaction;
        this.crypto = crypto;
        this.http = http;
        this.modelMapper = modelMapper;
        this.settingService = settingService;
    }

    public record PriceView(String upstreamModel, int quotaType, BigDecimal modelPrice, String groupName,
                            BigDecimal groupRatio, BigDecimal groupCost, LocalDateTime lastSynced, String status) {}
    public record SnapshotView(String source, String currency, String currencyVerification, LocalDateTime syncedAt,
                               String pricingVersion, boolean stale, String status, List<PriceView> prices) {}
    record Parsed(String version, List<UpstreamPrice> prices) {}

    public SnapshotView get(Long channelId) {
        requireDuoyuanx(channelId);
        UpstreamPriceMapper.Snapshot snapshot = prices.selectSnapshot(channelId);
        if (snapshot == null) {
            return new SnapshotView("duoyuanx", "USD", "site-display-only", null, null, true, "no_cost", List.of());
        }
        boolean stale = snapshot.syncedAt() == null || snapshot.syncedAt().isBefore(LocalDateTime.now(ZoneOffset.UTC).minus(STALE_AFTER));
        List<PriceView> items = new ArrayList<>();
        for (UpstreamPrice item : prices.selectPrices(channelId)) {
            boolean hasCost = (item.getQuotaType() == 1 || item.getQuotaType() == 2)
                    && item.getModelPrice() != null && item.getGroupRatio() != null;
            items.add(new PriceView(item.getUpstreamModel(), item.getQuotaType(), item.getModelPrice(), "default",
                    item.getGroupRatio(), hasCost ? item.getModelPrice().multiply(item.getGroupRatio()) : null,
                    item.getSyncedAt(), !hasCost ? "no_cost" : stale ? "stale" : "fresh"));
        }
        return new SnapshotView("duoyuanx", "USD", "site-display-only", snapshot.syncedAt(),
                snapshot.pricingVersion(), stale, items.isEmpty() ? "no_cost" : stale ? "stale" : "fresh", items);
    }

    public SnapshotView sync(Long channelId) {
        Channel channel = channels.selectById(channelId);
        requireDuoyuanx(channelId);
        ChannelCostSource source = ChannelCostSource.of(channel);
        Parsed parsed;
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(PRICING_URI)
                    .timeout(Duration.ofSeconds(20))
                    .GET()
                    .header("Accept", "application/json");
            // Attach the channel's API Key as Bearer token if available
            if (channel != null && channel.getApiKeyCipher() != null) {
                try {
                    String apiKey = crypto.decrypt(new String(channel.getApiKeyCipher(), StandardCharsets.UTF_8));
                    if (apiKey != null && !apiKey.isBlank()) {
                        builder.header("Authorization", "Bearer " + apiKey);
                    }
                } catch (Exception ignored) {
                    // Proceed without auth if key cannot be decrypted
                }
            }
            HttpResponse<String> response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            if (!HttpStatusCode.valueOf(response.statusCode()).is2xxSuccessful() || response.body().length() > 5_000_000) {
                throw new IllegalArgumentException("pricing endpoint returned status=" + response.statusCode()
                        + (response.statusCode() == 401 || response.statusCode() == 403
                                ? "，请确认渠道 API Key 有效" : ""));
            }
            parsed = parse(response.body());
        } catch (BizException ex) {
            throw ex;
        } catch (Exception ex) {
            if (ex instanceof InterruptedException) Thread.currentThread().interrupt();
            String detail = ex.getMessage() != null ? ex.getMessage() : "网络异常";
            throw new BizException("UPSTREAM_PRICE_50201", "上游价格同步失败：" + detail.substring(0, Math.min(200, detail.length())) + "；原快照已保留", null, 502);
        }
        // Costs and the wallet must use the same immutable RMB settlement precision.
        // The former pricing.credits_per_yuan override is deliberately ignored.
        BigDecimal creditsPerUsd = positiveConversionSetting("pricing.usd_to_yuan", 7.2)
                .multiply(BigDecimal.valueOf(MoneyAmounts.unitsPerYuan(settingService)));
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        transaction.executeWithoutResult(status -> {
            Channel current = channels.selectByIdForUpdate(channelId);
            if (current == null) throw new BizException("CHANNEL_40401", "渠道不存在", null, 404);
            if (!isDuoyuanx(current) || !java.util.Objects.equals(source, ChannelCostSource.of(current))) {
                throw new BizException("UPSTREAM_PRICE_42201", "渠道来源已变更；原快照和成本缓存已保留", null, 422);
            }
            prices.upsertSnapshot(channelId, parsed.version(), now);
            prices.deletePrices(channelId);
            for (UpstreamPrice item : parsed.prices()) {
                item.setChannelId(channelId);
                item.setSyncedAt(now);
                prices.insertPrice(item);
            }
            // Snapshot, raw prices and derived route costs must commit or roll back together.
            refreshModelCosts(channelId, parsed.prices(), now, creditsPerUsd);
        });
        return get(channelId);
    }

    private BigDecimal positiveConversionSetting(String key, double defaultValue) {
        double value = settingService.getDouble(key, defaultValue);
        if (!Double.isFinite(value) || value <= 0) {
            throw new BizException("UPSTREAM_PRICE_42202", key + " 必须是有限正数；原快照和成本缓存已保留", null, 422);
        }
        return BigDecimal.valueOf(value);
    }

    /**
     * 将上游价格转换为人民币内部记账单位，回写到 model 表的 cost_per_unit 字段。
     * 这样共享成本选择器可以直接读取缓存，不需要每次 JOIN upstream_price 表。
     */
    private void refreshModelCosts(Long channelId, List<UpstreamPrice> syncedPrices, LocalDateTime syncedAt,
                                   BigDecimal creditsPerUsd) {
        for (VideoModel model : modelMapper.selectAllSorted()) {
            if (model.getChannelId() == null || !model.getChannelId().equals(channelId)) continue;
            UpstreamPrice match = null;
            for (UpstreamPrice price : syncedPrices) {
                if (price.getUpstreamModel() != null
                        && price.getUpstreamModel().equalsIgnoreCase(model.getUpstreamModel())) {
                    match = price;
                    break;
                }
            }
            if (match == null || match.getModelPrice() == null || match.getGroupRatio() == null
                    || match.getQuotaType() == null || match.getQuotaType() < 1 || match.getQuotaType() > 2) {
                modelMapper.updateCostIfRouteMatches(model, null, null, null);
                continue;
            }
            // 成本 = model_price(USD) × group_ratio × usdToYuan × creditsPerYuan
            // Zero-priced quotes and a zero default-group ratio are valid fresh costs.
            BigDecimal costUsd = match.getModelPrice().multiply(match.getGroupRatio());
            BigDecimal costCredits = costUsd.multiply(creditsPerUsd);
            modelMapper.updateCostIfRouteMatches(model, costCredits, match.getQuotaType(), syncedAt);
        }
    }

    @Scheduled(initialDelayString = "${app.upstream-prices.initial-delay-ms:30000}",
               fixedDelayString = "${app.upstream-prices.interval-ms:21600000}")
    public void scheduledSync() {
        for (Channel channel : channels.selectAllSorted()) {
            if (channel.getEnabled() == null || channel.getEnabled() != 1 || !isDuoyuanx(channel)) continue;
            try {
                sync(channel.getId());
            } catch (Exception ex) {
                log.warn("Upstream pricing sync failed for channel {}: {}", channel.getId(), ex.getMessage());
            }
        }
    }

    private void requireDuoyuanx(Long channelId) {
        Channel channel = channelId == null ? null : channels.selectById(channelId);
        if (channel == null) throw new BizException("CHANNEL_40401", "渠道不存在", null, 404);
        if (!isDuoyuanx(channel)) throw new BizException("UPSTREAM_PRICE_42201", "该渠道不支持公开价格同步", null, 422);
    }

    static boolean isDuoyuanx(Channel channel) {
        try {
            URI uri = URI.create(channel.getNormalizedBaseUrl());
            // Accept https://duoyuanx.com (any path prefix, e.g. /v1, /api, root)
            return "https".equalsIgnoreCase(uri.getScheme())
                    && "duoyuanx.com".equalsIgnoreCase(uri.getHost())
                    && (uri.getPort() == -1 || uri.getPort() == 443)
                    && uri.getRawUserInfo() == null;
        } catch (Exception ex) {
            return false;
        }
    }

    Parsed parse(String body) throws Exception {
        JsonNode root = json.readTree(body);
        if (root == null || root.path("success").isBoolean() && !root.path("success").booleanValue())
            throw new IllegalArgumentException("pricing endpoint reported failure");
        JsonNode entries = root.path("data");
        if (!entries.isArray() || entries.isEmpty() || entries.size() > 10000)
            throw new IllegalArgumentException("missing or oversized pricing data");
        JsonNode ratioNode = root.path("group_ratio").path("default");
        BigDecimal defaultRatio = decimal(ratioNode);
        if (defaultRatio != null && defaultRatio.signum() < 0) throw new IllegalArgumentException("negative group ratio");
        List<UpstreamPrice> parsed = new ArrayList<>();
        Set<String> names = new HashSet<>();
        for (JsonNode entry : entries) {
            String name = entry.path("model_name").asText("").trim();
            JsonNode quotaNode = entry.path("quota_type");
            if (name.isBlank() || name.length() > 255 || !names.add(name) || !quotaNode.canConvertToInt())
                throw new IllegalArgumentException("invalid or duplicate model");
            BigDecimal price = decimal(entry.path("model_price"));
            if (price != null && price.signum() < 0) throw new IllegalArgumentException("negative model price");
            UpstreamPrice item = new UpstreamPrice();
            item.setUpstreamModel(name);
            item.setQuotaType(quotaNode.intValue());
            item.setModelPrice(price);
            item.setGroupRatio(allowsDefault(entry.path("enable_groups")) ? defaultRatio : null);
            parsed.add(item);
        }
        JsonNode versionNode = root.path("pricing_version");
        String version = versionNode.isMissingNode() || versionNode.isNull() ? null : versionNode.asText();
        if (version != null && version.length() > 255) throw new IllegalArgumentException("oversized pricing version");
        return new Parsed(version, parsed);
    }

    private static boolean allowsDefault(JsonNode groups) {
        if (groups.isArray()) {
            for (JsonNode group : groups) if ("default".equals(group.asText())) return true;
            return false;
        }
        if (groups.isTextual()) {
            for (String group : groups.asText().split(",")) if ("default".equals(group.trim())) return true;
        }
        return false;
    }

    private static BigDecimal decimal(JsonNode node) {
        if (node.isNull() || node.isMissingNode() || (!node.isNumber() && !node.isTextual())) return null;
        try {
            BigDecimal value = new BigDecimal(node.asText());
            if (value.precision() > 24 || value.scale() > 10) throw new IllegalArgumentException("unsupported precision");
            return value;
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("invalid pricing decimal", ex);
        }
    }
}
