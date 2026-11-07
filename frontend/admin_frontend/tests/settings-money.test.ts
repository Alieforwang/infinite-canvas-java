import assert from "node:assert/strict";
import test from "node:test";
import { isUnchangedYuanInput, registrationGiftUnits } from "../src/lib/settings-money.ts";

test("registration gift follows strict backend long parsing", () => {
    assert.equal(registrationGiftUnits(" 1000 "), 1000);
    assert.equal(registrationGiftUnits("+125"), 125);
    for (const value of [undefined, null, "", "bad", "1000.0", "1e3", "0x64"]) {
        assert.equal(registrationGiftUnits(value), 100);
    }
});

test("legacy Unicode digits agree with Java Long.parseLong", () => {
    assert.equal(registrationGiftUnits("１２５"), 125);
    assert.equal(registrationGiftUnits("١٢٥"), 125);
    assert.equal(registrationGiftUnits("१२५"), 125);
    assert.equal(registrationGiftUnits("𝟙𝟚𝟝"), 100);
});

test("legacy whitespace agrees with Java String.trim", () => {
    assert.equal(registrationGiftUnits("\u0000\t125\r\n"), 125);
    assert.equal(registrationGiftUnits("\u00a0125\u00a0"), 100);
    assert.equal(registrationGiftUnits("\ufeff125\ufeff"), 100);
});

test("nonpositive historical gifts continue to grant nothing", () => {
    assert.equal(registrationGiftUnits("0"), 0);
    assert.equal(registrationGiftUnits("-5"), 0);
    assert.equal(registrationGiftUnits("-9223372036854775808"), 0);
});

test("long overflow follows backend fallback rather than a rounded number", () => {
    assert.equal(registrationGiftUnits("9223372036854775808"), 100);
    assert.equal(registrationGiftUnits("-9223372036854775809"), 100);
});

test("valid but unsafe historical units cannot be silently revalued by an editor", () => {
    assert.equal(registrationGiftUnits("9007199254740991"), Number.MAX_SAFE_INTEGER);
    assert.throws(() => registrationGiftUnits("9007199254740992"), RangeError);
    assert.throws(() => registrationGiftUnits("9223372036854775807"), RangeError);
});

test("unchanged yuan input preserves original units with custom and repeating rates", () => {
    assert.equal(isUnchangedYuanInput(0.001, 1, 1000), true);
    assert.equal(isUnchangedYuanInput(1 / 3, 1, 3), true);
    assert.equal(isUnchangedYuanInput(String(1 / 3), 1, 3), true);
    assert.equal(isUnchangedYuanInput("1.00", 100, 100), true);
    assert.equal(isUnchangedYuanInput("0", 0, 100), true);
});

test("edited and missing inputs must go through required and precision validation", () => {
    assert.equal(isUnchangedYuanInput("1.01", 100, 100), false);
    assert.equal(isUnchangedYuanInput(0.002, 1, 1000), false);
    assert.equal(isUnchangedYuanInput("0.33333333333333331", 1, 3), false);
    assert.equal(isUnchangedYuanInput("0.100000000000000001", 100, 1000), false);
    assert.equal(isUnchangedYuanInput("0x10", 16, 1), false);
    for (const value of [null, undefined, "", " ", false, "bad", Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.equal(isUnchangedYuanInput(value, 0, 100), false);
    }
});
