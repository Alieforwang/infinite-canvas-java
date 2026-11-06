package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.PlanOrder;

/**
 * 订单表 Mapper（原生 MyBatis，SQL 见 resources/mapper/PlanOrderMapper.xml）。
 */
public interface PlanOrderMapper {

    PlanOrder selectById(Long id);

    int insert(PlanOrder order);
}