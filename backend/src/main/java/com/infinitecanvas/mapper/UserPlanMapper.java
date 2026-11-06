package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.UserPlan;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 用户套餐表 Mapper（原生 MyBatis，SQL 见 resources/mapper/UserPlanMapper.xml）。
 */
public interface UserPlanMapper {

    int insert(UserPlan userPlan);

    /** 当前生效套餐：user_id + status=ACTIVE，按 id 倒序取 1 条。 */
    UserPlan selectActiveLatest(@Param("userId") Long userId);

    List<UserPlan> selectByUser(@Param("userId") Long userId);
}