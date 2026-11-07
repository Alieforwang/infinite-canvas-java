package com.infinitecanvas.service;

import com.infinitecanvas.entity.VideoModel;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

/** Pure configured-weight selection. Cost/load policy lives in CostAwareRouteSelector. */
public final class WeightedRouteSelector {
    private WeightedRouteSelector() { }

    public static VideoModel select(List<VideoModel> routes) {
        return select(routes, ThreadLocalRandom.current().nextLong(Long.MAX_VALUE));
    }

    static VideoModel select(List<VideoModel> routes, long ticket) {
        long total = 0;
        for (VideoModel route : routes) total = Math.addExact(total, weight(route));
        if (total <= 0) throw new IllegalArgumentException("At least one positive-weight route is required");
        long point = Math.floorMod(ticket, total);
        for (VideoModel route : routes) {
            point -= weight(route);
            if (point < 0) return route;
        }
        throw new IllegalStateException("No weighted route selected");
    }

    private static int weight(VideoModel route) {
        return route.getRouteWeight() == null ? 100 : Math.max(0, route.getRouteWeight());
    }
}
