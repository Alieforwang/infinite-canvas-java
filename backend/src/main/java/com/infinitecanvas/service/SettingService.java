package com.infinitecanvas.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.infinitecanvas.entity.SystemSetting;
import com.infinitecanvas.mapper.SystemSettingMapper;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class SettingService {

    private final SystemSettingMapper mapper;
    private final Cache<String, String> cache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofSeconds(30)).maximumSize(200).build();

    public SettingService(SystemSettingMapper mapper) {
        this.mapper = mapper;
    }

    public String get(String key, String defaultValue) {
        String value = cache.get(key, k -> {
            SystemSetting setting = mapper.selectById(k);
            return setting == null ? null : setting.getSettingValue();
        });
        return value == null || value.isBlank() ? defaultValue : value;
    }

    public long getLong(String key, long defaultValue) {
        try {
            return Long.parseLong(get(key, String.valueOf(defaultValue)).trim());
        } catch (NumberFormatException ex) {
            return defaultValue;
        }
    }

    public boolean getBool(String key, boolean defaultValue) {
        String value = get(key, null);
        if (value == null) {
            return defaultValue;
        }
        return "true".equalsIgnoreCase(value.trim()) || "1".equals(value.trim());
    }

    public void set(String key, String value, Long adminId) {
        SystemSetting setting = mapper.selectById(key);
        if (setting == null) {
            setting = new SystemSetting();
            setting.setSettingKey(key);
            setting.setSettingValue(value);
            setting.setValueType("STRING");
            setting.setUpdatedByAdminId(adminId);
            setting.setUpdatedAt(LocalDateTime.now());
            mapper.insert(setting);
        } else {
            setting.setSettingValue(value);
            setting.setUpdatedByAdminId(adminId);
            mappingUpdate(setting);
        }
        cache.invalidate(key);
    }

    private void mappingUpdate(SystemSetting setting) {
        mapper.updateById(setting);
    }

    public java.util.List<SystemSetting> listAll() {
        return mapper.selectAllSorted();
    }

    public Map<String, String> all() {
        Map<String, String> values = new LinkedHashMap<>();
        for (SystemSetting setting : mapper.selectAllSorted()) {
            values.put(setting.getSettingKey(), setting.getSettingValue());
        }
        return values;
    }

    public Map<String, Object> publicSettings() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("registrationOpen", getBool("user.registration_open", true));
        map.put("notice", get("site.notice", ""));
        map.put("exchangePerYuan", getLong("credit.exchange_per_yuan", 100));
        return map;
    }
}
