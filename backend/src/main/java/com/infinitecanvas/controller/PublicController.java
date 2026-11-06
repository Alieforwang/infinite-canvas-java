package com.infinitecanvas.controller;

import com.infinitecanvas.common.ApiResponse;
import com.infinitecanvas.service.SettingService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/public")
public class PublicController {

    private final SettingService settingService;

    public PublicController(SettingService settingService) {
        this.settingService = settingService;
    }

    @GetMapping("/settings")
    public ApiResponse<Map<String, Object>> settings() {
        return ApiResponse.ok(settingService.publicSettings());
    }
}
