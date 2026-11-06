package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.SystemSetting;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 系统设置表 Mapper（原生 MyBatis，SQL 见 resources/mapper/SystemSettingMapper.xml）。
 */
public interface SystemSettingMapper {

    SystemSetting selectById(@Param("settingKey") String settingKey);

    List<SystemSetting> selectAllSorted();

    int insert(SystemSetting setting);

    int updateById(SystemSetting setting);
}