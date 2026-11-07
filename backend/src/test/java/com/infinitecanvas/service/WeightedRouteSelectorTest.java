package com.infinitecanvas.service;

import com.infinitecanvas.entity.VideoModel;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class WeightedRouteSelectorTest {

    @Test
    void mapsTicketsAccordingToRouteWeights() {
        VideoModel first = route(1L, 1);
        VideoModel second = route(2L, 3);
        List<VideoModel> routes = List.of(first, second);

        assertEquals(1L, WeightedRouteSelector.select(routes, 0).getId());
        assertEquals(2L, WeightedRouteSelector.select(routes, 1).getId());
        assertEquals(2L, WeightedRouteSelector.select(routes, 2).getId());
        assertEquals(2L, WeightedRouteSelector.select(routes, 3).getId());
        assertEquals(1L, WeightedRouteSelector.select(routes, 4).getId());
    }

    @Test
    void rejectsRoutesWithoutPositiveWeight() {
        assertThrows(IllegalArgumentException.class,
                () -> WeightedRouteSelector.select(List.of(route(1L, 0)), 0));
    }

    @Test
    void weightedOnlyIgnoresCostAndCachedLoad() {
        VideoModel first = route(1L, 1);
        first.setCostPerUnit(new BigDecimal("100"));
        first.setCostQuotaType(1);
        first.setCurrentLoad(100);
        VideoModel second = route(2L, 3);
        assertEquals(first, WeightedRouteSelector.select(List.of(first, second), 0));
        assertEquals(second, WeightedRouteSelector.select(List.of(first, second), 1));
    }

    private VideoModel route(long id, int weight) {
        VideoModel model = new VideoModel();
        model.setId(id);
        model.setRouteWeight(weight);
        return model;
    }
}
