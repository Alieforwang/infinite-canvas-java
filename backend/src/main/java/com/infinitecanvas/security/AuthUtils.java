package com.infinitecanvas.security;

import com.infinitecanvas.common.BizException;
import com.infinitecanvas.common.ErrorCode;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

public final class AuthUtils {

    private AuthUtils() {
    }

    public static AuthPrincipal principal() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof AuthPrincipal p)) {
            throw BizException.unauthorized("请先登录");
        }
        return p;
    }

    public static Long userId() {
        AuthPrincipal p = principal();
        if (!"user".equals(p.role())) {
            throw new BizException(ErrorCode.AUTH_40301, "无权访问", null, 403);
        }
        return p.id();
    }

    public static Long adminId() {
        AuthPrincipal p = principal();
        if (!"admin".equals(p.role())) {
            throw new BizException(ErrorCode.AUTH_40301, "需要管理员权限", null, 403);
        }
        return p.id();
    }
}
