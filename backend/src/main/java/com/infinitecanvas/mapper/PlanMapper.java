package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.Plan;

import java.util.List;

/**
 * 套餐表 Mapper（原生 MyBatis，SQL 见 resources/mapper/PlanMapper.xml）。
 */
public interface PlanMapper {

    Plan selectById(Long id);

    List<Plan> selectEnabledSorted();

    List<Plan> selectAllSorted();

    int insert(Plan plan);

    int updateById(Plan plan);
}