import dayjs from "dayjs";

export function formatDateTime(value?: string | null): string {
    if (!value) {
        return "-";
    }
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed.format("YYYY-MM-DD HH:mm:ss") : value;
}

export function formatDate(value?: string | null): string {
    if (!value) {
        return "-";
    }
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed.format("YYYY-MM-DD") : value;
}

export function formatCredits(value?: number | null): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return "-";
    }
    return Number(value).toLocaleString("zh-CN");
}

/** 金额统一保留两位小数并带人民币符号。 */
export function formatMoney(value?: number | null): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return "-";
    }
    return `¥${Number(value).toFixed(2)}`;
}

export function formatPercent(value?: number | null): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return "-";
    }
    return `${Number(value).toFixed(1)}%`;
}

/** 计算任务耗时（秒），未结束返回 null。 */
export function durationSeconds(start?: string | null, end?: string | null): number | null {
    if (!start || !end) {
        return null;
    }
    const startDate = dayjs(start);
    const endDate = dayjs(end);
    if (!startDate.isValid() || !endDate.isValid()) {
        return null;
    }
    return Math.max(0, Math.round(endDate.diff(startDate, "millisecond") / 1000));
}

export function formatDuration(start?: string | null, end?: string | null): string {
    const seconds = durationSeconds(start, end);
    if (seconds === null) {
        return "-";
    }
    if (seconds < 60) {
        return `${seconds} 秒`;
    }
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes} 分 ${rest} 秒`;
}

export function formatBytes(bytes?: number | null): string {
    if (bytes === null || bytes === undefined) {
        return "-";
    }
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function parseJsonList(text?: string | null): string[] {
    if (!text) {
        return [];
    }
    try {
        const parsed: unknown = JSON.parse(text);
        if (Array.isArray(parsed)) {
            return parsed.map((item) => String(item));
        }
    } catch {
        // 非法 JSON 忽略
    }
    return [];
}

export function parseJsonRecord(text?: string | null): Record<string, unknown> {
    if (!text) {
        return {};
    }
    try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        // 非法 JSON 忽略
    }
    return {};
}

export function prettyJson(value: unknown): string {
    try {
        return JSON.stringify(value ?? {}, null, 2);
    } catch {
        return String(value);
    }
}

export interface StatusMeta {
    text: string;
    color: string;
}

export const TASK_STATUS_META: Record<string, StatusMeta> = {
    queued: { text: "排队中", color: "blue" },
    running: { text: "生成中", color: "processing" },
    succeeded: { text: "成功", color: "success" },
    failed: { text: "失败", color: "error" },
    cancelled: { text: "已取消", color: "default" },
    expired: { text: "已过期", color: "warning" },
    creating: { text: "创建中", color: "blue" },
};

export function taskStatusMeta(status?: string | null): StatusMeta {
    if (!status) {
        return { text: "未知", color: "default" };
    }
    return TASK_STATUS_META[status.toLowerCase()] ?? { text: status, color: "default" };
}

export const USER_STATUS_META: Record<string, StatusMeta> = {
    ACTIVE: { text: "正常", color: "success" },
    DISABLED: { text: "已禁用", color: "error" },
};

export const REDEEM_STATUS_META: Record<string, StatusMeta> = {
    UNUSED: { text: "未使用", color: "blue" },
    USED: { text: "已使用", color: "success" },
    DISABLED: { text: "已作废", color: "default" },
    EXPIRED: { text: "已过期", color: "warning" },
};

export const PLAN_TYPE_META: Record<string, StatusMeta> = {
    CREDIT_PACK: { text: "积分包", color: "blue" },
    PLAN: { text: "套餐", color: "purple" },
};

export function truncate(value?: string | null, max = 60): string {
    if (!value) {
        return "-";
    }
    return value.length > max ? `${value.slice(0, max)}…` : value;
}
