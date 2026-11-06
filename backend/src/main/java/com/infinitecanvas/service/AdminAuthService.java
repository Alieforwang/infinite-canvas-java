package com.infinitecanvas.service;

import com.infinitecanvas.common.BizException;
import com.infinitecanvas.common.ErrorCode;
import com.infinitecanvas.dto.AuthDtos;
import com.infinitecanvas.entity.AdminUser;
import com.infinitecanvas.mapper.AdminUserMapper;
import com.infinitecanvas.security.JwtService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class AdminAuthService {

    private final AdminUserMapper adminUserMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AdminAuthService(AdminUserMapper adminUserMapper, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.adminUserMapper = adminUserMapper;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public record LoginResult(Long id, String username, String displayName, String role,
                              String accessToken, long expiresIn) {
    }

    public LoginResult login(String username, String password) {
        AdminUser admin = adminUserMapper.selectByUsername(username == null ? "" : username.trim());
        if (admin == null || !passwordEncoder.matches(password == null ? "" : password, admin.getPasswordHash())) {
            throw new BizException(ErrorCode.AUTH_40104, "用户名或密码错误", null, 401);
        }
        if (!"ACTIVE".equals(admin.getStatus())) {
            throw new BizException(ErrorCode.AUTH_40302, "管理员账号已被禁用", null, 403);
        }
        admin.setLastLoginAt(LocalDateTime.now());
        adminUserMapper.updateById(admin);
        String token = jwtService.createAccessToken(admin.getId(), "admin", "admin");
        return new LoginResult(admin.getId(), admin.getUsername(), admin.getDisplayName(), admin.getRole(),
                token, jwtService.accessTtlSeconds());
    }

    public LoginResult me(Long adminId) {
        AdminUser admin = adminUserMapper.selectById(adminId);
        if (admin == null) {
            throw BizException.unauthorized("管理员不存在");
        }
        return new LoginResult(admin.getId(), admin.getUsername(), admin.getDisplayName(), admin.getRole(),
                null, 0);
    }
}
