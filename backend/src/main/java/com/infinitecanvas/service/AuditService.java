package com.infinitecanvas.service;

import com.infinitecanvas.entity.AuditLog;
import com.infinitecanvas.mapper.AuditLogMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class AuditService {

    private final AuditLogMapper mapper;

    public AuditService(AuditLogMapper mapper) {
        this.mapper = mapper;
    }

    public void record(String actorType, Long actorId, String action, String targetType, String targetId,
                       String detailJson, String ip, String requestId) {
        AuditLog log = new AuditLog();
        log.setActorType(actorType);
        log.setActorId(actorId);
        log.setAction(action);
        log.setTargetType(targetType == null ? "" : targetType);
        log.setTargetId(targetId == null ? "" : targetId);
        log.setDetailJson(detailJson);
        log.setIp(ip == null ? "" : ip);
        log.setRequestId(requestId == null ? "" : requestId);
        log.setCreatedAt(LocalDateTime.now());
        mapper.insert(log);
    }
}
