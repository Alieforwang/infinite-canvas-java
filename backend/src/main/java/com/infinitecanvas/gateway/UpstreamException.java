package com.infinitecanvas.gateway;

import com.infinitecanvas.entity.Channel;

/** Thrown when an upstream OpenAI-compatible call fails or returns an unexpected payload. */
public class UpstreamException extends RuntimeException {

    private final int httpStatus;
    private final String body;
    private final String code;

    public UpstreamException(String code, String message, int httpStatus, String body) {
        super(message);
        this.code = code;
        this.httpStatus = httpStatus;
        this.body = body;
    }

    public int getHttpStatus() {
        return httpStatus;
    }

    public String getBody() {
        return body;
    }

    public String getCode() {
        return code;
    }

    public static UpstreamException of(Channel channel, int status, String body) {
        String code = switch (status) {
            case 401, 403 -> "UPSTREAM_AUTH";
            case 402 -> "UPSTREAM_BALANCE";
            case 429 -> "UPSTREAM_RATE_LIMIT";
            default -> status >= 500 ? "UPSTREAM_UNAVAILABLE" : "UPSTREAM_INVALID_PARAM";
        };
        String message = switch (code) {
            case "UPSTREAM_AUTH" -> "上游鉴权失败，请检查渠道 API Key";
            case "UPSTREAM_BALANCE" -> "上游账户余额不足";
            case "UPSTREAM_RATE_LIMIT" -> "上游限流，请稍后重试";
            case "UPSTREAM_UNAVAILABLE" -> "上游服务暂不可用";
            default -> "上游参数错误";
        };
        return new UpstreamException(code, message, status, body);
    }
}
