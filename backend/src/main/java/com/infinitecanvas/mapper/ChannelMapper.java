package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.Channel;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 上游渠道表 Mapper（原生 MyBatis，SQL 见 resources/mapper/ChannelMapper.xml）。
 */
public interface ChannelMapper {

    Channel selectById(Long id);

    /** Serialize route imports/edits for one channel. Must run in a transaction. */
    Channel selectByIdForUpdate(Long id);

    Channel selectByName(@Param("name") String name);

    List<Channel> selectAllSorted();

    int insert(Channel channel);

    int updateById(Channel channel);

    int updateTestResult(Channel channel);

    int deleteById(Long id);

    long countAll();
}