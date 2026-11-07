import { sameDisplayedMoney } from "./money-input";

const DEFAULT_REGISTRATION_GIFT_UNITS = 100;
const LONG_MIN = BigInt("-9223372036854775808");
const LONG_MAX = BigInt("9223372036854775807");

function javaLongText(raw: string): string | null {
    // Java String.trim removes only characters <= U+0020. Long.parseLong also
    // accepts BMP decimal digits via Character.digit(char, 10), not just ASCII.
    const text = raw.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, "");
    const sign = text[0] === "+" || text[0] === "-" ? text[0] : "";
    const digits = text.slice(sign.length);
    if (!digits) return null;
    let normalized = sign;
    for (const digit of digits) {
        if (digit.length !== 1 || !/\p{Nd}/u.test(digit)) return null;
        const code = digit.charCodeAt(0);
        let zero = code;
        while (zero > 0 && /\p{Nd}/u.test(String.fromCharCode(zero - 1))) zero -= 1;
        normalized += String((code - zero) % 10);
    }
    return normalized;
}

/** Match SettingService.getLong and AuthService's nonnegative registration gift. */
export function registrationGiftUnits(raw?: string | null): number {
    const text = javaLongText(raw ?? String(DEFAULT_REGISTRATION_GIFT_UNITS));
    if (text === null) return DEFAULT_REGISTRATION_GIFT_UNITS;
    const units = BigInt(text);
    if (units < LONG_MIN || units > LONG_MAX) return DEFAULT_REGISTRATION_GIFT_UNITS;
    if (units <= BigInt(0)) return 0;
    if (units > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new RangeError("历史注册赠送金额超出当前编辑范围，请先核对配置，避免改变金额");
    }
    return Number(units);
}

/** Keep the original integer when a repeating yuan amount has not been edited. */
export function isUnchangedYuanInput(value: unknown, originalUnits: number, exchangePerYuan: number): boolean {
    if (!Number.isSafeInteger(originalUnits) || !Number.isSafeInteger(exchangePerYuan) || exchangePerYuan <= 0) return false;
    return sameDisplayedMoney(value, originalUnits / exchangePerYuan);
}
