package com.infinitecanvas.controller;

import com.infinitecanvas.common.ApiResponse;
import com.infinitecanvas.dto.AuthDtos;
import com.infinitecanvas.security.AuthUtils;
import com.infinitecanvas.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public ApiResponse<AuthDtos.AuthResult> register(@Valid @RequestBody AuthDtos.RegisterRequest request,
                                                     HttpServletRequest http) {
        return ApiResponse.ok(authService.register(request, clientIp(http), http.getHeader("User-Agent")));
    }

    @PostMapping("/login")
    public ApiResponse<AuthDtos.AuthResult> login(@Valid @RequestBody AuthDtos.LoginRequest request,
                                                  HttpServletRequest http) {
        return ApiResponse.ok(authService.login(request, clientIp(http), http.getHeader("User-Agent")));
    }

    @PostMapping("/refresh")
    public ApiResponse<AuthDtos.AuthResult> refresh(@Valid @RequestBody AuthDtos.RefreshRequest request) {
        return ApiResponse.ok(authService.refresh(request.refreshToken()));
    }

    @PostMapping("/logout")
    public ApiResponse<Void> logout(@Valid @RequestBody AuthDtos.RefreshRequest request) {
        authService.logout(request.refreshToken());
        return ApiResponse.ok(null);
    }

    @GetMapping("/me")
    public ApiResponse<AuthDtos.MeResult> me() {
        return ApiResponse.ok(authService.me(AuthUtils.userId()));
    }

    @PutMapping("/profile")
    public ApiResponse<AuthDtos.UserView> updateProfile(@Valid @RequestBody AuthDtos.ProfileRequest request) {
        return ApiResponse.ok(authService.updateProfile(AuthUtils.userId(), request.displayName()));
    }

    @PutMapping("/password")
    public ApiResponse<Void> changePassword(@Valid @RequestBody AuthDtos.PasswordRequest request) {
        authService.changePassword(AuthUtils.userId(), request.oldPassword(), request.newPassword());
        return ApiResponse.ok(null);
    }

    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
