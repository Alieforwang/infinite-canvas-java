package com.infinitecanvas.service;

import com.infinitecanvas.common.BizException;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.entity.VideoModel;
import com.infinitecanvas.mapper.ChannelMapper;
import com.infinitecanvas.mapper.VideoTaskMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CostAwareRouteSelectorTest {
    private final SettingService settings = mock(SettingService.class);
    private final ChannelMapper channels = mock(ChannelMapper.class);
    private final VideoTaskMapper tasks = mock(VideoTaskMapper.class);
    private final CostAwareRouteSelector selector = new CostAwareRouteSelector(settings, channels, tasks);

    @BeforeEach
    void defaults() {
        when(settings.get(anyString(), anyString())).thenAnswer(call -> call.getArgument(1));
        when(settings.getLong(anyString(), anyLong())).thenAnswer(call -> call.getArgument(1));
        when(settings.getDouble(anyString(), anyDouble())).thenAnswer(call -> call.getArgument(1));
        when(channels.selectById(anyLong())).thenAnswer(call -> {
            Channel channel = new Channel();
            channel.setId(call.getArgument(0));
            channel.setMaxConcurrency(4);
            return channel;
        });
    }

    @Test
    void safeKnownCostTakesPriorityOverUnknownAndUnsafeRoutes() {
        VideoModel safe = route(1, "80", 1);
        VideoModel unsafe = route(2, "95", 1);
        VideoModel unknown = route(3, null, null);
        for (long ticket : List.of(0L, 100L, Long.MAX_VALUE)) {
            assertEquals(safe, selector.select(List.of(unsafe, unknown, safe), 100, 8, ticket));
        }
    }

    @Test
    void singleKnownUnsafeRouteIsRejectedByDefault() {
        BizException error = assertThrows(BizException.class,
                () -> selector.select(List.of(route(1, "91", 1)), 100, 8, 0));
        assertEquals("ROUTING_42201", error.getCode());
        verifyNoInteractions(tasks);
    }

    @Test
    void unknownCostIsFallbackOnlyWhenNoSafeKnownRouteExists() {
        VideoModel unsafe = route(1, "120", 1);
        VideoModel unknown = route(2, null, null);
        assertEquals(unknown, selector.select(List.of(unsafe, unknown), 100, 8, 0));
    }

    @Test
    void staleCostIsUnknownRatherThanAFalseLossRejection() {
        VideoModel stale = route(1, "120", 1);
        stale.setCostSyncedAt(now().minusHours(25));
        assertEquals(stale, selector.select(List.of(stale), 100, 8, 0));
    }

    @Test
    void lossFallbackRequiresExplicitDownweightPolicy() {
        when(settings.get("routing.margin_policy", "skip")).thenReturn("downweight");
        VideoModel unsafe = route(1, "120", 1);
        assertEquals(unsafe, selector.select(List.of(unsafe), 100, 8, 0));
    }

    @Test
    void weightedOnlyHonorsConfiguredWeightsAndIgnoresCostsAndLoad() {
        when(settings.get("routing.strategy", "profit_first")).thenReturn("weighted_only");
        VideoModel unsafe = route(1, "120", 1);
        unsafe.setRouteWeight(1);
        unsafe.setCurrentLoad(1000);
        VideoModel zero = route(2, "0", 1);
        zero.setRouteWeight(3);
        assertEquals(unsafe, selector.select(List.of(unsafe, zero), 100, 8, 0));
        assertEquals(zero, selector.select(List.of(unsafe, zero), 100, 8, 1));
        verifyNoInteractions(tasks, channels);
    }

    @Test
    void costFirstComparesFullRequestCostAcrossQuotaTypes() {
        when(settings.get("routing.strategy", "profit_first")).thenReturn("cost_first");
        VideoModel perSecond = route(1, "10", 2);
        VideoModel perCall = route(2, "50", 1);
        assertEquals(perCall, selector.select(List.of(perSecond, perCall), 100, 8, 0));
        assertEquals(perSecond, selector.select(List.of(perSecond, perCall), 100, 4, 0));
    }

    @Test
    void costFirstTreatsEqualDecimalsAsTies() {
        when(settings.get("routing.strategy", "profit_first")).thenReturn("cost_first");
        VideoModel first = route(1, "50.0", 1);
        VideoModel second = route(2, "50.00", 1);
        assertEquals(second, selector.select(List.of(first, second), 100, 8, 100_000));
    }

    @Test
    void freshZeroCostIsKnownSafe() {
        VideoModel free = route(1, "0", 1);
        VideoModel unknown = route(2, null, null);
        assertEquals(free, selector.select(List.of(unknown, free), 100, 8, 0));
        assertEquals(BigDecimal.ZERO, CostAwareRouteSelector.freshTotalCost(free, 8, now(), 24));
    }

    @Test
    void marginFloorBoundaryIsInclusiveWithoutFloatingPointLoss() {
        VideoModel floor = route(1, "90", 1);
        assertEquals(floor, selector.select(List.of(floor), 100, 8, 0));
        assertThrows(BizException.class, () -> selector.select(List.of(route(2, "90.000001", 1)), 100, 8, 0));
    }

    @Test
    void intermediateMarginsReduceWeight() {
        VideoModel floor = route(1, "90", 1);
        VideoModel target = route(2, "80", 1);
        assertEquals(floor, selector.select(List.of(floor, target), 100, 8, 9_999));
        assertEquals(target, selector.select(List.of(floor, target), 100, 8, 10_000));
    }

    @Test
    void loadUsesRealChannelTasksEvenWithUnknownCostAndStaleCachedCounters() {
        VideoModel busy = route(1, null, null);
        VideoModel idle = route(2, null, null);
        busy.setCurrentLoad(0);
        idle.setCurrentLoad(999);
        when(tasks.countActiveByChannel(1L)).thenReturn(40L);
        assertEquals(busy, selector.select(List.of(busy, idle), 100, 8, 9_090));
        assertEquals(idle, selector.select(List.of(busy, idle), 100, 8, 9_091));
    }

    @Test
    void routesOnSameChannelShareOneLoadRead() {
        VideoModel first = route(1, "10", 1);
        VideoModel second = route(2, "10", 1);
        second.setChannelId(1L);
        selector.select(List.of(first, second), 100, 8, 0);
        verify(tasks, times(1)).countActiveByChannel(1L);
    }

    @Test
    void zeroWeightRemainsExcludedAfterCostAndLoadAdjustments() {
        VideoModel zero = route(1, "0", 1);
        zero.setRouteWeight(0);
        VideoModel positive = route(2, "80", 1);
        assertEquals(positive, selector.select(List.of(zero, positive), 100, 8, 0));
        assertThrows(BizException.class, () -> selector.select(List.of(zero), 100, 8, 0));
    }

    @Test
    void unsupportedQuotaNegativeCostAndFutureOrStaleTimestampAreUnknown() {
        VideoModel route = route(1, "1", 99);
        assertNull(CostAwareRouteSelector.freshTotalCost(route, 8, now(), 24));
        route.setCostQuotaType(1);
        route.setCostPerUnit(BigDecimal.ONE.negate());
        assertNull(CostAwareRouteSelector.freshTotalCost(route, 8, now(), 24));
        route.setCostPerUnit(BigDecimal.ONE);
        route.setCostSyncedAt(now().plusHours(1));
        assertNull(CostAwareRouteSelector.freshTotalCost(route, 8, now(), 24));
        route.setCostSyncedAt(now().minusHours(25));
        assertNull(CostAwareRouteSelector.freshTotalCost(route, 8, now(), 24));
    }

    @Test
    void imagePerSecondQuoteIsUnsupportedWhilePerCallZeroIsValid() {
        VideoModel image = route(1, "0", 2);
        image.setCapability("image");
        assertNull(CostAwareRouteSelector.freshTotalCost(image, 1, now(), 24));
        image.setCostQuotaType(1);
        assertEquals(BigDecimal.ZERO, CostAwareRouteSelector.freshTotalCost(image, 1, now(), 24));
    }

    @Test
    void nonFiniteAndOutOfRangeSettingsUseSafeDefaults() {
        when(settings.getDouble("pricing.margin_floor_percent", 10)).thenReturn(Double.NaN);
        when(settings.getDouble("pricing.target_margin_percent", 20)).thenReturn(Double.POSITIVE_INFINITY);
        when(settings.getDouble("pricing.margin_ceiling_percent", 30)).thenReturn(-5.0);
        when(settings.getDouble("routing.load_balance_factor", 1)).thenReturn(Double.NEGATIVE_INFINITY);
        when(settings.getDouble("routing.margin_floor_weight_factor", 0.1)).thenReturn(-1.0);
        when(settings.getLong("pricing.cost_max_age_hours", 24)).thenReturn(Long.MAX_VALUE);
        VideoModel route = route(1, "80", 1);
        assertEquals(route, selector.select(List.of(route), 100, 8, Long.MIN_VALUE));
    }

    @Test
    void equalMarginThresholdsDoNotDivideByZero() {
        when(settings.getDouble("pricing.target_margin_percent", 20)).thenReturn(10.0);
        VideoModel route = route(1, "90", 1);
        assertEquals(route, selector.select(List.of(route), 100, 8, 0));
    }

    private VideoModel route(long id, String cost, Integer quota) {
        VideoModel route = new VideoModel();
        route.setId(id);
        route.setChannelId(id);
        route.setCapability("video");
        route.setRouteWeight(100);
        route.setCostPerUnit(cost == null ? null : new BigDecimal(cost));
        route.setCostQuotaType(quota);
        route.setCostSyncedAt(cost == null ? null : now());
        return route;
    }

    private LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }
}
