package com.infinitecanvas.controller;

import com.infinitecanvas.common.ApiResponse;
import com.infinitecanvas.dto.AdminDtos;
import com.infinitecanvas.entity.SystemSetting;
import com.infinitecanvas.security.AuthUtils;
import com.infinitecanvas.service.SettingService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/admin/settings")
public class AdminSettingController {

    private static final Set<String> WHITELIST = Set.of(
            "user.register_gift_credits", "user.registration_open",
            "task.max_concurrency_per_user", "task.poll_timeout_minutes",
            "file.max_upload_image_mb", "file.max_upload_video_mb", "file.retention_days",
            "security.login_max_failures", "site.notice");

    private final SettingService settingService;

    public AdminSettingController(SettingService settingService) {
        this.settingService = settingService;
    }

    @GetMapping
    public ApiResponse<List<AdminDtos.SettingView>> list() {
        List<AdminDtos.SettingView> views = settingService.listAll().stream()
                .map(s -> new AdminDtos.SettingView(s.getSettingKey(), s.getSettingValue(),
                        s.getValueType(), s.getDescription()))
                .toList();
        return ApiResponse.ok(views);
    }

    @PutMapping
    public ApiResponse<Void> update(@RequestBody Map<String, String> values) {
        Long adminId = AuthUtils.adminId();
        // Validate the complete batch before any write, especially frozen money precision.
        values.forEach((key, value) -> {
            if (!WHITELIST.contains(key)) {
                throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40001,
                        "设置项不允许修改：" + key);
            }
            if ("user.register_gift_credits".equals(key)) {
                try {
                    if (Long.parseLong(value) < 0) {
                        throw new NumberFormatException();
                    }
                } catch (NumberFormatException ex) {
                    throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40001,
                            "注册赠送金额必须为非负金额，且符合记账精度");
                }
            }
        });
        values.forEach((key, value) -> settingService.set(key, value, adminId));
        return ApiResponse.ok(null);
    }
}
