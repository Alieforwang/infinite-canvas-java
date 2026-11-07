package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.UpstreamPrice;
import org.apache.ibatis.annotations.Param;
import java.time.LocalDateTime;
import java.util.List;

public interface UpstreamPriceMapper {
    List<UpstreamPrice> selectPrices(Long channelId);
    Snapshot selectSnapshot(Long channelId);
    void upsertSnapshot(@Param("channelId") Long channelId, @Param("version") String version,
                        @Param("syncedAt") LocalDateTime syncedAt);
    void deletePrices(Long channelId);
    void insertPrice(UpstreamPrice price);

    record Snapshot(Long channelId, String pricingVersion, LocalDateTime syncedAt) {}
}
