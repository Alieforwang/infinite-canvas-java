package com.infinitecanvas.service;

import com.infinitecanvas.common.BizException;
import com.infinitecanvas.common.ErrorCode;
import org.springframework.stereotype.Component;

import java.net.URI;

/** Normalize an upstream Base URL. Accepts site root or root + /v1; rejects endpoint paths and userinfo. */
@Component
public class BaseUrlNormalizer {

    public record Normalized(String original, String normalized) {
    }

    public Normalized normalize(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new BizException(ErrorCode.CHANNEL_42201, "Base URL 不能为空");
        }
        String value = raw.trim().replaceAll("/+$", "");
        URI uri;
        try {
            uri = URI.create(value);
        } catch (IllegalArgumentException ex) {
            throw new BizException(ErrorCode.CHANNEL_42201, "Base URL 格式非法");
        }
        if (uri.getScheme() == null || uri.getHost() == null
                || !(uri.getScheme().equalsIgnoreCase("http") || uri.getScheme().equalsIgnoreCase("https"))) {
            throw new BizException(ErrorCode.CHANNEL_42201, "Base URL 必须是 http(s) 地址");
        }
        if (uri.getUserInfo() != null) {
            throw new BizException(ErrorCode.CHANNEL_42201, "Base URL 不能包含用户信息");
        }
        String path = uri.getPath() == null ? "" : uri.getPath().replaceAll("/+$", "");
        String lower = path.toLowerCase();
        if (lower.endsWith("/videos") || lower.contains("/v1/videos") || lower.contains("/v1beta")) {
            throw new BizException(ErrorCode.CHANNEL_42201, "Base URL 只填站点根地址，不要包含接口路径");
        }
        if (lower.endsWith("/v1")) {
            path = path.substring(0, path.length() - 3);
        }
        String normalized = uri.getScheme().toLowerCase() + "://" + uri.getHost().toLowerCase()
                + (uri.getPort() > 0 ? ":" + uri.getPort() : "") + path;
        return new Normalized(raw.trim(), normalized);
    }
}
