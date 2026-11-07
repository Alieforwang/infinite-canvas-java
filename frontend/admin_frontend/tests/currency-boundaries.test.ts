import assert from "node:assert/strict";
import test from "node:test";
import { creditsToYuan, currencyText, formatYuan, yuanToCredits } from "../src/lib/format.ts";

test("decimal yuan input does not gain a unit through floating point multiplication", () => {
    assert.equal(yuanToCredits(0.29, 100), 29);
    assert.equal(yuanToCredits(0.07, 100), 7);
    assert.equal(yuanToCredits("0.14", 100), 14);
    assert.equal(yuanToCredits("1.10", 100), 110);
});

test("manual balance adjustments retain their sign", () => {
    assert.equal(yuanToCredits("-1.25", 100), -125);
    assert.equal(yuanToCredits(0, 100), 0);
    assert.equal(yuanToCredits("+1.25", 100), 125);
});

test("custom and nondecimal rates use the configured precision", () => {
    assert.equal(yuanToCredits("0.001", 1000), 1);
    assert.equal(yuanToCredits("1.005", 1000), 1005);
    assert.equal(yuanToCredits("1", 3), 3);
    assert.equal(yuanToCredits("0.5", 2), 1);
});

test("scientific notation is converted as an exact decimal", () => {
    assert.equal(yuanToCredits("7e-2", 100), 7);
    assert.equal(yuanToCredits("1e-3", 1000), 1);
    assert.equal(yuanToCredits("-1.25e0", 100), -125);
});

test("fractions of an accounting unit are rejected rather than rounded", () => {
    assert.throws(() => yuanToCredits("0.001", 100), RangeError);
    assert.throws(() => yuanToCredits("0.0001", 1000), RangeError);
    assert.throws(() => yuanToCredits("-0.001", 100), RangeError);
    assert.throws(() => yuanToCredits(1 / 3, 3), RangeError);
});

test("missing, invalid and nonfinite money cannot become a zero payment", () => {
    for (const value of [null, undefined, "", " ", "bad", "12abc", "0x10", "Infinity", Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.throws(() => yuanToCredits(value, 100), TypeError);
    }
});

test("integer limits are checked without rounding the submitted decimal first", () => {
    assert.equal(yuanToCredits("90071992547409.91", 100), Number.MAX_SAFE_INTEGER);
    assert.throws(() => yuanToCredits("90071992547409.92", 100), RangeError);
    assert.throws(() => yuanToCredits("-90071992547409.92", 100), RangeError);
});

test("raw balances are divided once at the configured rate", () => {
    assert.equal(creditsToYuan(80, 100), 0.8);
    assert.equal(creditsToYuan(80, 1000), 0.08);
    assert.equal(creditsToYuan(1, 1000), 0.001);
    assert.equal(creditsToYuan(0, 1000), 0);
    assert.equal(creditsToYuan(null, 1000), null);
});

test("subcent balances and costs remain visible", () => {
    assert.equal(formatYuan(creditsToYuan(1, 1000)), "¥0.001");
    assert.equal(formatYuan("0.0001"), "¥0.0001");
    assert.equal(formatYuan(1 / 3), "¥0.333333333333");
});

test("already-yuan cash prices are formatted without another division", () => {
    assert.equal(formatYuan(99), "¥99.00");
    assert.equal(formatYuan("1000.50"), "¥1,000.50");
    assert.equal(formatYuan(-1.25), "¥-1.25");
    assert.equal(formatYuan(null), "-");
    assert.equal(formatYuan(Number.NaN), "-");
});

test("historical numeric credit labels convert the amount and the unit together", () => {
    assert.equal(currencyText("需要 80 积分，当前 65 积分", 1000), "需要 ¥0.08，当前 ¥0.065");
    assert.equal(currencyText("标准包 5,500 积分", 100), "标准包 ¥55.00");
    assert.equal(currencyText("积分不足；积分包", 100), "余额不足；充值包");
});

test("current yuan messages and empty historical fields remain stable", () => {
    assert.equal(currencyText("余额不足：本次需要 ¥0.10", 1000), "余额不足：本次需要 ¥0.10");
    assert.equal(currencyText(null, 1000), "");
    assert.equal(currencyText(undefined, 1000), "");
});
