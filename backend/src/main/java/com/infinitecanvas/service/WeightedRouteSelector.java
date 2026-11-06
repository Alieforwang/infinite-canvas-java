package com.infinitecanvas.service;

import com.infinitecanvas.entity.VideoModel;

import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

public final class WeightedRouteSelector {

    private WeightedRouteSelector() {
    }

    public static VideoModel select(List<VideoModel> routes) {
        long total = totalWeight(routes);
        return select(routes, ThreadLocalRandom.current().nextLong(total));
    }

    static VideoModel select(List<VideoModel> routes, long ticket) {
        long total = totalWeight(routes);
        long target = Math.floorMod(ticket, total);
        long cumulative = 0;
        for (VideoModel route : routes) {
            cumulative += weight(route);
            if (target < cumulative) {
                return route;
            }
        }
        throw new IllegalStateException("No weighted route selected");
    }

    private static long totalWeight(List<VideoModel> routes) {
        long total = 0;
        for (VideoModel route : routes) {
            total = Math.addExact(total, weight(route));
        }
        if (total <= 0) {
            throw new IllegalArgumentException("At least one route is required");
        }
        return total;
    }

    private static int weight(VideoModel route) {
        Integer value = route.getRouteWeight();
        return value == null ? 100 : Math.max(value, 0);
    }
}
