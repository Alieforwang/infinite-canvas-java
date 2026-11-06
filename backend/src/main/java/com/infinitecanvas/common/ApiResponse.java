package com.infinitecanvas.common;

import org.slf4j.MDC;

import java.time.Instant;

public record ApiResponse<T>(String code, String message, T data, String requestId, String timestamp) {

    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>("OK", "", data, currentRequestId(), Instant.now().toString());
    }

    public static <T> ApiResponse<T> fail(String code, String message, T data) {
        return new ApiResponse<>(code, message, data, currentRequestId(), Instant.now().toString());
    }

    private static String currentRequestId() {
        String id = MDC.get(RequestIdFilter.MDC_KEY);
        return id == null ? "" : id;
    }
}
