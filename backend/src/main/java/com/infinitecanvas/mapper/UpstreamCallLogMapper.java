package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.UpstreamCallLog;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 上游调用日志表 Mapper（原生 MyBatis，SQL 见 resources/mapper/UpstreamCallLogMapper.xml）。
 */
public interface UpstreamCallLogMapper {

    int insert(UpstreamCallLog call);

    /** 任务详情页：按 id 倒序取最近 limit 条。 */
    List<UpstreamCallLog> selectLatestByTaskId(@Param("taskId") Long taskId, @Param("limit") int limit);
}