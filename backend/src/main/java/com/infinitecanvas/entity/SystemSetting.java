package com.infinitecanvas.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class SystemSetting {
    private String settingKey;
    private String settingValue;
    private String valueType;
    private String description;
    private Long updatedByAdminId;
    private LocalDateTime updatedAt;
}
