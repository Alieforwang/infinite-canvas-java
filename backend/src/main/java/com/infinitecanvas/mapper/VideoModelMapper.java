package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.VideoModel;
import org.apache.ibatis.annotations.Param;

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

    List<VideoModel> selectEnabledByModelKey(@Param("modelKey") String modelKey,
                                             @Param("capability") String capability);

    List<VideoModel> selectAllSorted();

    long countByChannelId(@Param("channelId") Long channelId);

    long countAll();

    int insert(VideoModel model);

    int updateById(VideoModel model);
}