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

export const DEFAULT_EXCHANGE_PER_YUAN = 100;

export function normalizeExchangePerYuan(value: unknown): number {
    const rate = Number(value);
    return Number.isSafeInteger(rate) && rate > 0 ? rate : DEFAULT_EXCHANGE_PER_YUAN;
}

export function validateExchangePerYuan(value: unknown): number {
    if (value === undefined || value === null) {
        throw new RangeError("公共汇率缺失");
    }
    if (typeof value !== "number" && typeof value !== "string") {
        throw new RangeError("公共汇率无效");
    }
    const rate = Number(value);
    if (!Number.isSafeInteger(rate) || rate <= 0) {
        throw new RangeError("公共汇率无效");
    }
    return rate;
}

function resolveExchangePerYuan(value: unknown): number {
    return value === undefined ? DEFAULT_EXCHANGE_PER_YUAN : validateExchangePerYuan(value);
}


const ZERO = 0n;
const ONE = 1n;
const TEN = 10n;

function decimalFraction(value: number | string): [bigint, bigint] {
    const text = String(value).trim();
    const match = text.match(/^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
    if (!match || !Number.isFinite(Number(text))) throw new TypeError("请输入有效人民币金额");
    const fraction = match[3] ?? "";
    const exponent = Number(match[4] ?? 0) - fraction.length;
    const magnitude = BigInt(`${match[2]}${fraction}`);
    const sign = match[1] === "-" ? -ONE : ONE;
    return exponent >= 0
        ? [sign * magnitude * TEN ** BigInt(exponent), ONE]
        : [sign * magnitude, TEN ** BigInt(-exponent)];
}

function roundFraction(numerator: bigint, denominator: bigint): bigint {
    const sign = numerator < ZERO ? -ONE : ONE;
    const magnitude = numerator < ZERO ? -numerator : numerator;
    return sign * ((magnitude * 2n + denominator) / (denominator * 2n));
}

function formatFraction(numerator: bigint, denominator: bigint, precise: boolean): string {
    const digits = precise ? 12 : 2;
    const scale = TEN ** BigInt(digits);
    const rounded = roundFraction(numerator * scale, denominator);
    const magnitude = (rounded < ZERO ? -rounded : rounded).toString().padStart(digits + 1, "0");
    const whole = magnitude.slice(0, -digits).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const fraction = precise ? magnitude.slice(-digits).replace(/0+$/, "").padEnd(2, "0") : magnitude.slice(-digits);
    const sign = numerator < ZERO && rounded !== ZERO ? "-" : "";
    return `¥${sign}${whole}.${fraction}`;
}

export function creditsToYuan(value?: number | string | null, exchangePerYuan = DEFAULT_EXCHANGE_PER_YUAN): number | null {
    if (value === null || value === undefined || value === "") return null;
    const [numerator, denominator] = decimalFraction(value);
    return Number(numerator) / Number(denominator * BigInt(resolveExchangePerYuan(exchangePerYuan)));
}

export function yuanToCredits(value: number | string | null | undefined, exchangePerYuan = DEFAULT_EXCHANGE_PER_YUAN): number {
    if (value === null || value === undefined || value === "") throw new TypeError("金额不能为空");
    const [numerator, denominator] = decimalFraction(value);
    const scaled = numerator * BigInt(resolveExchangePerYuan(exchangePerYuan));
    if (scaled % denominator !== ZERO) throw new RangeError("人民币金额精度超过当前计费单位，请调整金额");
    const result = Number(scaled / denominator);
    if (!Number.isSafeInteger(result)) throw new RangeError("人民币金额超出支持范围");
    return result;
}

export function formatYuan(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === "") return "-";
    try {
        const [numerator, denominator] = decimalFraction(value);
        return formatFraction(numerator, denominator, true);
    } catch {
        return "-";
    }
}


export function currencyText(value: string | null | undefined, exchangePerYuan = DEFAULT_EXCHANGE_PER_YUAN): string {
    if (!value) return "";
    return value
        .replace(/([+-]?\d[\d,]*(?:\.\d+)?)\s*(?:算力)?积分(包)?/g, (_match, units: string, pack?: string) => {
            const numeric = Number(units.replace(/,/g, ""));
            const amount = Number.isFinite(numeric) ? formatYuan(creditsToYuan(numeric, exchangePerYuan)) : units;
            return `${amount}${pack ? "充值包" : ""}`;
        })
        .replace(/积分不足/g, "余额不足")
        .replace(/积分包/g, "充值包")
        .replace(/(?:算力)?积分/g, "余额");
}

export const MODEL_CAPABILITY_LABELS: Record<string, string> = {
    llm: "大语言模型",
    image: "图片生成",
    video: "视频生成",
    unknown: "待审核/未分类",
};

export function modelCapabilityLabel(value?: string | null): string {
    return MODEL_CAPABILITY_LABELS[value || "unknown"] ?? "待审核/未分类";
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
