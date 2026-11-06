package com.infinitecanvas.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

public final class AuthDtos {

    private AuthDtos() {
    }

    public record UserView(Long id, String email, String displayName, String status, LocalDateTime createdAt) {
    }

    public record CreditsView(long available, long frozen, long totalConsumed) {
    }

    public record AuthResult(UserView user, String accessToken, String refreshToken, long expiresIn, CreditsView credits) {
    }

    public record Concurrency(long limit, long running) {
    }

    public record MeResult(UserView user, CreditsView credits, Concurrency concurrency) {
    }

    public record RegisterRequest(
            @Email(message = "邮箱格式不正确") @NotBlank(message = "邮箱不能为空") String email,
            @NotBlank(message = "密码不能为空") @Size(min = 8, max = 32, message = "密码长度 8-32 位") String password,
            String displayName) {
    }

    public record LoginRequest(@NotBlank(message = "邮箱不能为空") String email,
                               @NotBlank(message = "密码不能为空") String password) {
    }

    public record RefreshRequest(@NotBlank(message = "refreshToken 不能为空") String refreshToken) {
    }

    public record ProfileRequest(@Size(max = 64, message = "昵称最长 64 字") String displayName) {
    }

    public record PasswordRequest(@NotBlank String oldPassword,
                                  @NotBlank @Size(min = 8, max = 32, message = "密码长度 8-32 位") String newPassword) {
    }
}
