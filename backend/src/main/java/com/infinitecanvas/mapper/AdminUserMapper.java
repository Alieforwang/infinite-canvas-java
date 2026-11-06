package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.AdminUser;
import org.apache.ibatis.annotations.Param;

/**
 * 管理员表 Mapper（原生 MyBatis，SQL 见 resources/mapper/AdminUserMapper.xml）。
 */
public interface AdminUserMapper {

    AdminUser selectById(Long id);

    AdminUser selectByUsername(@Param("username") String username);

    int insert(AdminUser adminUser);

    int updateById(AdminUser adminUser);

    long countAll();
}