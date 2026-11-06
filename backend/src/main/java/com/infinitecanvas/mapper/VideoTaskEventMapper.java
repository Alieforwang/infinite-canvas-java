package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.VideoTaskEvent;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 任务事件表 Mapper（原生 MyBatis，SQL 见 resources/mapper/VideoTaskEventMapper.xml）。
 */
public interface VideoTaskEventMapper {

    int insert(VideoTaskEvent event);

    List<VideoTaskEvent> selectByTaskId(@Param("taskId") Long taskId);
}