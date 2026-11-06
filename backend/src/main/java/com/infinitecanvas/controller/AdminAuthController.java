package com.infinitecanvas.controller;

import com.infinitecanvas.common.ApiResponse;
import com.infinitecanvas.security.AuthUtils;
import com.infinitecanvas.service.AdminAuthService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/auth")
public class AdminAuthController {

    private final AdminAuthService adminAuthService;

    public AdminAuthController(AdminAuthService adminAuthService) {
        this.adminAuthService = adminAuthService;
    }

    public record LoginRequest(@NotBlank String username, @NotBlank String password) {
    }

    @PostMapping("/login")
    public ApiResponse<AdminAuthService.LoginResult> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.ok(adminAuthService.login(request.username(), request.password()));
    }

    @GetMapping("/me")
    public ApiResponse<AdminAuthService.LoginResult> me() {
        return ApiResponse.ok(adminAuthService.me(AuthUtils.adminId()));
    }
}
