package com.infinitecanvas.security;

import org.springframework.util.AntPathMatcher;

import java.util.List;

/**
 * 无需登录即可访问的接口路径清单。
 *
 * <p>这份清单被 {@link com.infinitecanvas.config.SecurityConfig} 的 permitAll 与
 * {@link JwtAuthenticationFilter} 的 audience（role）校验共同使用，避免两处规则漂移：
 * 公开接口没有身份语义，因此管理端 token 与用户端 token 只要签名有效都应放行
 * （例如管理端 CurrencyProvider 用管理员 token 读取 {@code GET /api/public/settings}）。</p>
 */
public final class PublicPaths {

    public static final String[] MATCHERS = {
            "/api/auth/register",
            "/api/auth/login",
            "/api/auth/refresh",
            "/api/public/**",
            "/api/files/*/content",
    };

    private static final AntPathMatcher PATH_MATCHER = new AntPathMatcher();
    private static final List<String> PATTERNS = List.of(MATCHERS);

    private PublicPaths() {
    }

    public static boolean isPublic(String path) {
        if (path == null || path.isEmpty()) {
            return false;
        }
        for (String pattern : PATTERNS) {
            if (PATH_MATCHER.match(pattern, path)) {
                return true;
            }
        }
        return false;
    }
}
