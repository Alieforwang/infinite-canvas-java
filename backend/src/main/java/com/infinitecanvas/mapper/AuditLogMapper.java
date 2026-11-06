package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.AuditLog;

/**
 * 审计日志表 Mapper（原生 MyBatis，SQL 见 resources/mapper/AuditLogMapper.xml）。
 */
public interface AuditLogMapper {

    int insert(AuditLog log);
}