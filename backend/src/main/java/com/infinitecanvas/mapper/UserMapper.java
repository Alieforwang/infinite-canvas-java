package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.User;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 用户表 Mapper（原生 MyBatis，SQL 见 resources/mapper/UserMapper.xml）。
 */
public interface UserMapper {

    User selectById(Long id);

    User selectByEmail(@Param("email") String email);

    int insert(User user);

    /** 只更新非 null 字段（与 MyBatis-Plus updateById 行为一致）。 */
    int updateById(User user);

    long countAll();

    long countCreatedToday();

    long countByKeywordAndStatus(@Param("keyword") String keyword, @Param("status") String status);

    List<User> selectPage(@Param("keyword") String keyword,
                          @Param("status") String status,
                          @Param("offset") long offset,
                          @Param("limit") int limit);
}