package com.infinitecanvas.common;

import lombok.Getter;

@Getter
public class BizException extends RuntimeException {

    private final String code;
    private final int httpStatus;
    private final Object data;

    public BizException(String code, String message) {
        this(code, message, null);
    }

    public BizException(String code, String message, Object data) {
        this(code, message, data, 400);
    }

    public BizException(String code, String message, Object data, int httpStatus) {
        super(message);
        this.code = code;
        this.data = data;
        this.httpStatus = httpStatus;
    }

    public static BizException notFound(String message) {
        return new BizException(ErrorCode.TASK_40401, message, null, 404);
    }

    public static BizException forbidden(String message) {
        return new BizException(ErrorCode.AUTH_40301, message, null, 403);
    }

    public static BizException unauthorized(String message) {
        return new BizException(ErrorCode.AUTH_40101, message, null, 401);
    }
}
