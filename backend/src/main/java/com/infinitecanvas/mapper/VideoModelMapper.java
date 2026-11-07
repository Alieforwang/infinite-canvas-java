package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.VideoModel;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 视频模型表 Mapper（原生 MyBatis，SQL 见 resources/mapper/VideoModelMapper.xml）。
 */
public interface VideoModelMapper {

    VideoModel selectById(Long id);

    /** 用户端可见模型：enabled=1 且 capability='video'，按 sort,id 升序。 */
    List<VideoModel> selectEnabledVideoSorted();

    List<VideoModel> selectEnabledByCapabilitySorted(@Param("capability") String capability);

    VideoModel selectCanonicalByModelKey(@Param("modelKey") String modelKey,
                                         @Param("capability") String capability);

    VideoModel selectCanonicalByModelKeyForUpdate(@Param("modelKey") String modelKey,
                                                  @Param("capability") String capability);

    List<VideoModel> selectEnabledByModelKey(@Param("modelKey") String modelKey,
                                             @Param("capability") String capability);

    List<VideoModel> selectAllSorted();

    /** Lock classification inventory in stable id order, including logical pricing groups. */
    List<VideoModel> selectAllForUpdate();

    /** Only reclassify an unchanged identity; all sale fields and route specifications remain intact. */
    int updateCapabilityIfUnchanged(@Param("model") VideoModel expected, @Param("capability") String capability);

    VideoModel selectByChannelAndUpstream(@Param("channelId") Long channelId,
                                          @Param("upstreamModel") String upstreamModel);

    long countByChannelId(@Param("channelId") Long channelId);

    long countAll();

    int insert(VideoModel model);

    int updateById(VideoModel model);

    /** 同一逻辑模型的客户售价统一更新，不改线路规格、成本或负载。 */
    int updateLogicalPricing(VideoModel model);

    int deleteById(@Param("id") Long id);

    /** Phase 1: 更新线路成本缓存 */
    int clearCostsByChannel(@Param("channelId") Long channelId);

    int updateCost(@Param("id") Long id,
                   @Param("costPerUnit") BigDecimal costPerUnit,
                   @Param("costQuotaType") Integer costQuotaType,
                   @Param("syncedAt") LocalDateTime syncedAt);

    /** 仅身份仍匹配时刷新成本，防止旧同步覆盖管理员刚修改的线路。 */
    int updateCostIfRouteMatches(@Param("route") VideoModel route,
                                 @Param("costPerUnit") BigDecimal costPerUnit,
                                 @Param("costQuotaType") Integer costQuotaType,
                                 @Param("syncedAt") LocalDateTime syncedAt);

    /** Phase 1: 增加并发负载计数 */
    int incrementLoad(@Param("id") Long id);

    /** Phase 1: 减少并发负载计数（不低于 0） */
    int decrementLoad(@Param("id") Long id);
}