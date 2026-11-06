import { useMemo } from "react";
import { App } from "antd";

import { ApiError } from "../api/http";

/** 统一错误文案：message (requestId)，便于对照后端日志。 */
export function formatApiError(error: unknown): string {
    if (error instanceof ApiError) {
        return `${error.message} (${error.requestId || "-"})`;
    }
    if (error instanceof Error) {
        return `${error.message} (-)`;
    }
    return `未知错误 (-)`;
}

export function useFeedback() {
    const { message } = App.useApp();

    return useMemo(() => ({
        message,
        showApiError(error: unknown): void {
            void message.error(formatApiError(error));
        },
        showSuccess(text: string): void {
            void message.success(text);
        },
    }), [message]);
}