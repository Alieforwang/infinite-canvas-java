// API fields named credits remain internal billing units. Only presentation/input crosses this boundary.
export const DEFAULT_EXCHANGE_PER_YUAN = 100;
let activeExchangePerYuan = DEFAULT_EXCHANGE_PER_YUAN;

export function normalizeExchangePerYuan(value: unknown): number {
    const rate = Number(value);
    return Number.isSafeInteger(rate) && rate > 0 ? rate : DEFAULT_EXCHANGE_PER_YUAN;
}

export function setCurrencyExchangePerYuan(value: unknown): number {
    activeExchangePerYuan = normalizeExchangePerYuan(value);
    return activeExchangePerYuan;
}

export type CurrencyOptions = { exchangePerYuan?: number; precise?: boolean; signed?: boolean };
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TEN = BigInt(10);

// Decimal arithmetic avoids binary rounding such as 0.29 * 100 = 28.999999999999996.
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
    return sign * ((magnitude * BigInt(2) + denominator) / (denominator * BigInt(2)));
}

function formatFraction(numerator: bigint, denominator: bigint, options: CurrencyOptions): string {
    const precise = options.precise !== false;
    const digits = precise ? 12 : 2;
    const scale = TEN ** BigInt(digits);
    const rounded = roundFraction(numerator * scale, denominator);
    const magnitude = (rounded < ZERO ? -rounded : rounded).toString().padStart(digits + 1, "0");
    const whole = magnitude.slice(0, -digits).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const fraction = precise ? magnitude.slice(-digits).replace(/0+$/, "").padEnd(2, "0") : magnitude.slice(-digits);
    const sign = numerator < ZERO && rounded !== ZERO ? "-" : options.signed && numerator > ZERO ? "+" : "";
    return `${sign}¥${whole}.${fraction}`;
}

/** Formats existing CNY fields (including priceAmount) without applying the billing conversion. */
export function formatYuan(value: number | string | null | undefined, options: CurrencyOptions = {}): string {
    if (value === null || value === undefined || value === "") return "-";
    try {
        const [numerator, denominator] = decimalFraction(value);
        return formatFraction(numerator, denominator, { precise: false, ...options });
    } catch {
        return "-";
    }
}

export function creditsToYuan(value: number, exchangePerYuan = activeExchangePerYuan): number {
    return value / normalizeExchangePerYuan(exchangePerYuan);
}

export function formatCredits(value: number | string | null | undefined, options: CurrencyOptions = {}): string {
    if (value === null || value === undefined || value === "") return "-";
    try {
        const [numerator, denominator] = decimalFraction(value);
        const rate = normalizeExchangePerYuan(options.exchangePerYuan ?? activeExchangePerYuan);
        return formatFraction(numerator, denominator * BigInt(rate), options);
    } catch {
        return "-";
    }
}

/** Converts an exactly representable yuan input once to the legacy integer API unit. */
export function yuanToCredits(value: number | string, exchangePerYuan = activeExchangePerYuan): number {
    const [numerator, denominator] = decimalFraction(value);
    const scaled = numerator * BigInt(normalizeExchangePerYuan(exchangePerYuan));
    if (scaled % denominator !== ZERO) throw new RangeError("人民币金额精度超过当前计费单位，请调整金额");
    const units = scaled / denominator;
    const result = Number(units);
    if (!Number.isSafeInteger(result)) throw new RangeError("人民币金额超出支持范围");
    return result;
}

/** Normalize historical server-generated plan names, ledger remarks, and billing errors only. */
export function currencyText(value: string | null | undefined, exchangePerYuan = activeExchangePerYuan): string {
    if (!value) return "";
    return value
        .replace(/([+-]?\d[\d,]*(?:\.\d+)?)\s*(?:算力)?积分(包)?/g, (_match, units: string, pack?: string) =>
            `${formatCredits(units.replaceAll(",", ""), { exchangePerYuan, precise: true })}${pack ? "充值包" : ""}`)
        .replace(/积分不足/g, "余额不足")
        .replace(/积分包/g, "充值包")
        .replace(/(?:算力)?积分/g, "余额");
}
