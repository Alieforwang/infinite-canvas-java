package com.infinitecanvas.service;

import com.infinitecanvas.common.BizException;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.entity.VideoModel;
import com.infinitecanvas.mapper.ChannelMapper;
import com.infinitecanvas.mapper.VideoTaskMapper;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/** Shared video/image policy. Cached prices never cause upstream I/O during task creation. */
public final class CostAwareRouteSelector {
    private final SettingService settings;
    private final ChannelMapper channels;
    private final VideoTaskMapper tasks;

    public CostAwareRouteSelector(SettingService settings, ChannelMapper channels, VideoTaskMapper tasks) {
        this.settings = settings;
        this.channels = channels;
        this.tasks = tasks;
    }

    public VideoModel select(List<VideoModel> routes, long saleCredits, int seconds) {
        return select(routes, saleCredits, seconds, ThreadLocalRandom.current().nextLong(Long.MAX_VALUE));
    }

    VideoModel select(List<VideoModel> routes, long saleCredits, int seconds, long ticket) {
        List<VideoModel> candidates = routes.stream()
                .filter(route -> route.getRouteWeight() == null || route.getRouteWeight() > 0).toList();
        if (candidates.isEmpty()) throw unavailable();
        String strategy = settings.get("routing.strategy", "profit_first");
        if ("weighted_only".equals(strategy)) return WeightedRouteSelector.select(candidates, ticket);

        double floor = percent("pricing.margin_floor_percent", 10);
        double ceiling = Math.max(floor, percent("pricing.margin_ceiling_percent", 30));
        double target = Math.max(floor, Math.min(ceiling, percent("pricing.target_margin_percent", 20)));
        long maxAge = settings.getLong("pricing.cost_max_age_hours", 24);
        if (maxAge < 1 || maxAge > 8760) maxAge = 24;
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        Map<Long, BigDecimal> costs = new HashMap<>();
        List<VideoModel> safe = new ArrayList<>();
        List<VideoModel> unknown = new ArrayList<>();
        for (VideoModel route : candidates) {
            BigDecimal cost = freshTotalCost(route, seconds, now, maxAge);
            if (cost == null) {
                unknown.add(route);
            } else {
                costs.put(route.getId(), cost);
                if (saleCredits > 0 && cost.compareTo(BigDecimal.valueOf(saleCredits)
                        .multiply(BigDecimal.ONE.subtract(BigDecimal.valueOf(floor).movePointLeft(2)))) <= 0) safe.add(route);
            }
        }
        boolean downweight = "downweight".equals(settings.get("routing.margin_policy", "skip"));
        if (saleCredits > 0) {
            // Unknown/stale routes are fallback only; fresh known unsafe routes need explicit opt-in.
            candidates = !safe.isEmpty() ? safe : downweight ? candidates : unknown;
            if (candidates.isEmpty()) throw new BizException("ROUTING_42201",
                    "可用线路的最新成本均低于最低毛利要求，请调整售价或路由策略", null, 422);
        }
        if ("cost_first".equals(strategy)) {
            BigDecimal cheapest = candidates.stream().map(route -> costs.get(route.getId()))
                    .filter(cost -> cost != null).min(BigDecimal::compareTo).orElse(null);
            if (cheapest != null) {
                BigDecimal chosenCost = cheapest;
                candidates = candidates.stream().filter(route -> costs.get(route.getId()) != null
                        && chosenCost.compareTo(costs.get(route.getId())) == 0).toList();
            }
        }
        double floorFactor = bounded("routing.margin_floor_weight_factor", 0.1, 0.001, 1);
        double loadStrength = bounded("routing.load_balance_factor", 1, 0, 100);
        Map<Long, Double> channelLoadFactors = new HashMap<>();
        List<Long> weights = new ArrayList<>();
        long totalWeight = 0;
        for (VideoModel route : candidates) {
            double loadFactor = channelLoadFactors.computeIfAbsent(route.getChannelId(), channelId -> {
                Channel channel = channels.selectById(channelId);
                int capacity = channel == null || channel.getMaxConcurrency() == null
                        || channel.getMaxConcurrency() <= 0 ? 4 : channel.getMaxConcurrency();
                // Count real tasks, including legacy tasks and other model routes on the channel.
                long active = Math.max(0, tasks.countActiveByChannel(channelId));
                return 1.0 / (1.0 + loadStrength * ((double) active / capacity));
            });
            BigDecimal cost = costs.get(route.getId());
            double marginFactor = "cost_first".equals(strategy) || cost == null || saleCredits <= 0 ? 1
                    : marginFactor(margin(cost, saleCredits), floor, target, floorFactor);
            long base = route.getRouteWeight() == null ? 100 : route.getRouteWeight();
            long weight = Math.max(1, Math.round(base * loadFactor * marginFactor * 1000));
            weights.add(weight);
            totalWeight += weight;
        }
        long point = Math.floorMod(ticket, totalWeight);
        for (int i = 0; i < candidates.size(); i++) {
            point -= weights.get(i);
            if (point < 0) return candidates.get(i);
        }
        return candidates.get(candidates.size() - 1);
    }

    static BigDecimal freshTotalCost(VideoModel route, int seconds, LocalDateTime now, long maxAgeHours) {
        BigDecimal unit = route.getCostPerUnit();
        LocalDateTime synced = route.getCostSyncedAt();
        if (unit == null || unit.signum() < 0 || synced == null
                || synced.isBefore(now.minusHours(maxAgeHours)) || synced.isAfter(now.plusMinutes(5))) return null;
        if (Integer.valueOf(1).equals(route.getCostQuotaType())) return unit;
        if (Integer.valueOf(2).equals(route.getCostQuotaType()) && !"image".equals(route.getCapability()) && seconds > 0) {
            return unit.multiply(BigDecimal.valueOf(seconds));
        }
        return null;
    }

    private static double margin(BigDecimal cost, long sale) {
        return 100 * (1 - cost.doubleValue() / sale);
    }

    private static double marginFactor(double margin, double floor, double target, double minimum) {
        if (margin >= target) return 1;
        if (margin <= floor || target <= floor) return minimum;
        return minimum + (1 - minimum) * (margin - floor) / (target - floor);
    }

    private double percent(String key, double fallback) { return bounded(key, fallback, 0, 99.99); }

    private double bounded(String key, double fallback, double min, double max) {
        double value = settings.getDouble(key, fallback);
        return Double.isFinite(value) && value >= min && value <= max ? value : fallback;
    }

    private BizException unavailable() { return new BizException("ROUTING_42201", "当前规格暂无可用渠道线路"); }
}
