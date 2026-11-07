import { afterEach, describe, expect, test } from "bun:test";
import { creditsToYuan, currencyText, formatCredits, formatYuan, normalizeExchangePerYuan, setCurrencyExchangePerYuan, yuanToCredits } from "../src/lib/currency";
import { ApiError } from "../src/api/http";
import { taskCreditSummary } from "../src/lib/video-task-state";
import type { VideoTaskView } from "../src/api/video-tasks";

afterEach(() => { setCurrencyExchangePerYuan(100); });

describe("RMB boundary preserves internal billing units", () => {
    test("default and configured ratios convert balances, signs and sub-fen amounts", () => {
        expect(formatCredits(12345)).toBe("¥123.45");
        expect(formatCredits(0)).toBe("¥0.00");
        expect(formatCredits(-125, { signed: true })).toBe("-¥1.25");
        expect(formatCredits(125, { signed: true })).toBe("+¥1.25");
        expect(formatCredits(1, { exchangePerYuan: 1000 })).toBe("¥0.001");
        expect(formatCredits(0.00001, { exchangePerYuan: 1000 })).toBe("¥0.00000001");
        expect(formatCredits(1, { exchangePerYuan: 3 })).toBe("¥0.333333333333");
        expect(formatCredits(123456789, { exchangePerYuan: 1000 })).toBe("¥123,456.789");
        expect(creditsToYuan(29, 100)).toBe(0.29);
    });

    test("yuan input uses exact decimal arithmetic and rejects unsupported precision", () => {
        expect(yuanToCredits(0.29)).toBe(29);
        expect(yuanToCredits("0.29")).toBe(29);
        expect(yuanToCredits("-1.25")).toBe(-125);
        expect(yuanToCredits("1e-3", 1000)).toBe(1);
        expect(yuanToCredits("0.001", 1000)).toBe(1);
        expect(yuanToCredits("12.345", 1000)).toBe(12345);
        expect(() => yuanToCredits("0.001", 100)).toThrow(RangeError);
        expect(() => yuanToCredits("-0.001", 100)).toThrow(RangeError);
        expect(() => yuanToCredits("1.005", 100)).toThrow(RangeError);
        expect(() => yuanToCredits("9007199254740992", 100)).toThrow(RangeError);
        expect(() => yuanToCredits("NaN")).toThrow(TypeError);
    });

    test("plan priceAmount already in CNY is never divided again", () => {
        setCurrencyExchangePerYuan(1000);
        expect(formatYuan(99)).toBe("¥99.00");
        expect(formatYuan("99.995")).toBe("¥100.00");
        expect(formatCredits(99000)).toBe("¥99.00");
        expect(formatCredits(null)).toBe("-");
        expect(formatCredits(NaN)).toBe("-");
        expect(normalizeExchangePerYuan(undefined)).toBe(100);
        expect(normalizeExchangePerYuan(0)).toBe(100);
    });

    test("historical labels and billing errors convert numbers rather than only renaming the unit", () => {
        expect(currencyText("1000积分包", 1000)).toBe("¥1.00充值包");
        expect(currencyText("余额调整 -250 积分，赠送 1,000 算力积分", 100)).toBe("余额调整 -¥2.50，赠送 ¥10.00");
        expect(currencyText("积分不足：需要 80 积分，当前可用 1 积分", 1000)).toBe("余额不足：需要 ¥0.08，当前可用 ¥0.001");
        expect(currencyText("已按人民币扣款 ¥1.20", 1000)).toBe("已按人民币扣款 ¥1.20");
        setCurrencyExchangePerYuan(1000);
        expect(new ApiError("CREDIT_NOT_ENOUGH", "积分不足：需要 80 积分").message).toBe("余额不足：需要 ¥0.08");
    });

    test("task frozen, settled, refund and uncharged branches display yuan at configured ratio", () => {
        const task = { status: "running", heldCredits: 125, settledCredits: 100 } as VideoTaskView;
        expect(taskCreditSummary(task, 1000)).toContain("已冻结 ¥0.125");
        expect(taskCreditSummary({ ...task, status: "succeeded" }, 1000)).toBe("实际消费 ¥0.10");
        expect(taskCreditSummary({ ...task, status: "failed" }, 1000)).toContain("¥0.125 已退回");
        expect(taskCreditSummary({ ...task, status: "cancelled", heldCredits: 0 }, 1000)).toBe("本次未消费");
    });
});
