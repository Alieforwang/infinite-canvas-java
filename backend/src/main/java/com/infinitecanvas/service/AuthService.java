package com.infinitecanvas.service;

import com.infinitecanvas.common.BizException;
import com.infinitecanvas.common.ErrorCode;
import com.infinitecanvas.config.AppProperties;
import com.infinitecanvas.dto.AuthDtos;
import com.infinitecanvas.entity.CreditAccount;
import com.infinitecanvas.entity.User;
import com.infinitecanvas.entity.UserRefreshToken;
import com.infinitecanvas.mapper.UserMapper;
import com.infinitecanvas.mapper.UserRefreshTokenMapper;
import com.infinitecanvas.security.JwtService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;

@Service
public class AuthService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final long CONCURRENCY_DEFAULT = 2;

    private final UserMapper userMapper;
    private final UserRefreshTokenMapper refreshTokenMapper;
    private final com.infinitecanvas.mapper.VideoTaskMapper videoTaskMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final BillingService billingService;
    private final SettingService settingService;
    private final AppProperties props;

    public AuthService(UserMapper userMapper, UserRefreshTokenMapper refreshTokenMapper,
                       com.infinitecanvas.mapper.VideoTaskMapper videoTaskMapper,
                       PasswordEncoder passwordEncoder, JwtService jwtService,
                       BillingService billingService, SettingService settingService, AppProperties props) {
        this.userMapper = userMapper;
        this.refreshTokenMapper = refreshTokenMapper;
        this.videoTaskMapper = videoTaskMapper;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.billingService = billingService;
        this.settingService = settingService;
        this.props = props;
    }

    @Transactional
    public AuthDtos.AuthResult register(AuthDtos.RegisterRequest request, String ip, String userAgent) {
        if (!settingService.getBool("user.registration_open", true)) {
            throw new BizException(ErrorCode.AUTH_40301, "当前暂停注册", null, 403);
        }
        String email = request.email().trim().toLowerCase();
        if (userMapper.selectByEmail(email) != null) {
            throw new BizException(ErrorCode.AUTH_40901, "邮箱已注册", null, 409);
        }
        User user = new User();
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setDisplayName(request.displayName() == null || request.displayName().isBlank()
                ? email.substring(0, email.indexOf('@')) : request.displayName().trim());
        user.setStatus("ACTIVE");
        user.setRole("USER");
        userMapper.insert(user);
        billingService.account(user.getId());
        billingService.giftRegister(user.getId());
        return issueTokens(user, ip, userAgent);
    }

    public AuthDtos.AuthResult login(AuthDtos.LoginRequest request, String ip, String userAgent) {
        String email = request.email().trim().toLowerCase();
        User user = userMapper.selectByEmail(email);
        if (user == null || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new BizException(ErrorCode.AUTH_40104, "邮箱或密码错误", null, 401);
        }
        if (!"ACTIVE".equals(user.getStatus())) {
            throw new BizException(ErrorCode.AUTH_40302, "账号已被禁用", null, 403);
        }
        user.setLastLoginAt(LocalDateTime.now());
        userMapper.updateById(user);
        return issueTokens(user, ip, userAgent);
    }

    public AuthDtos.AuthResult refresh(String rawRefreshToken) {
        UserRefreshToken stored = findByRawToken(rawRefreshToken);
        if (stored == null) {
            throw new BizException(ErrorCode.AUTH_40102, "refreshToken 无效", null, 401);
        }
        if (stored.getRevokedAt() != null) {
            // reuse detection: revoke all tokens for that user
            revokeAll(stored.getUserId());
            throw new BizException(ErrorCode.AUTH_40303, "登录状态已失效，请重新登录", null, 403);
        }
        if (stored.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new BizException(ErrorCode.AUTH_40103, "登录已过期，请重新登录", null, 401);
        }
        User user = userMapper.selectById(stored.getUserId());
        if (user == null || !"ACTIVE".equals(user.getStatus())) {
            throw new BizException(ErrorCode.AUTH_40302, "账号不可用", null, 403);
        }
        stored.setRevokedAt(LocalDateTime.now());
        refreshTokenMapper.updateById(stored);
        return issueTokens(user, stored.getIp(), stored.getUserAgent());
    }

    public void logout(String rawRefreshToken) {
        UserRefreshToken stored = findByRawToken(rawRefreshToken);
        if (stored != null && stored.getRevokedAt() == null) {
            stored.setRevokedAt(LocalDateTime.now());
            refreshTokenMapper.updateById(stored);
        }
    }

    public AuthDtos.MeResult me(Long userId) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw BizException.unauthorized("用户不存在");
        }
        CreditAccount account = billingService.account(userId);
        long running = videoTaskMapper.countActiveByUser(userId);
        return new AuthDtos.MeResult(toView(user), toCredits(account), new AuthDtos.Concurrency(
                settingService.getLong("task.max_concurrency_per_user", CONCURRENCY_DEFAULT), running));
    }

    public AuthDtos.UserView updateProfile(Long userId, String displayName) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw BizException.unauthorized("用户不存在");
        }
        if (displayName != null && !displayName.isBlank()) {
            user.setDisplayName(displayName.trim());
            userMapper.updateById(user);
        }
        return toView(user);
    }

    @Transactional
    public void changePassword(Long userId, String oldPassword, String newPassword) {
        User user = userMapper.selectById(userId);
        if (user == null) {
            throw BizException.unauthorized("用户不存在");
        }
        if (!passwordEncoder.matches(oldPassword, user.getPasswordHash())) {
            throw new BizException(ErrorCode.AUTH_40104, "旧密码错误", null, 400);
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userMapper.updateById(user);
        revokeAll(userId);
    }

    private AuthDtos.AuthResult issueTokens(User user, String ip, String userAgent) {
        String access = jwtService.createAccessToken(user.getId(), "user", "user");
        String rawRefresh = randomToken();
        UserRefreshToken token = new UserRefreshToken();
        token.setUserId(user.getId());
        token.setTokenHash(sha256(rawRefresh));
        token.setExpiresAt(LocalDateTime.now().plusSeconds(jwtService.refreshTtlSeconds()));
        token.setUserAgent(userAgent == null ? "" : userAgent.substring(0, Math.min(255, userAgent.length())));
        token.setIp(ip == null ? "" : ip);
        token.setCreatedAt(LocalDateTime.now());
        refreshTokenMapper.insert(token);
        CreditAccount account = billingService.account(user.getId());
        return new AuthDtos.AuthResult(toView(user), access, rawRefresh, jwtService.accessTtlSeconds(), toCredits(account));
    }

    private void revokeAll(Long userId) {
        refreshTokenMapper.revokeAllByUserId(userId, LocalDateTime.now());
    }

    private UserRefreshToken findByRawToken(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return refreshTokenMapper.selectByTokenHash(sha256(raw));
    }

    private static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private AuthDtos.UserView toView(User user) {
        return new AuthDtos.UserView(user.getId(), user.getEmail(), user.getDisplayName(), user.getStatus(), user.getCreatedAt());
    }

    private AuthDtos.CreditsView toCredits(CreditAccount account) {
        return new AuthDtos.CreditsView(
                account.getAvailable() == null ? 0 : account.getAvailable(),
                account.getFrozen() == null ? 0 : account.getFrozen(),
                account.getTotalConsumed() == null ? 0 : account.getTotalConsumed());
    }

    public long concurrencyLimit() {
        return settingService.getLong("task.max_concurrency_per_user", CONCURRENCY_DEFAULT);
    }

    public Long adminOrUserCount() {
        return userMapper.countAll();
    }

    public AppProperties properties() {
        return props;
    }
}
