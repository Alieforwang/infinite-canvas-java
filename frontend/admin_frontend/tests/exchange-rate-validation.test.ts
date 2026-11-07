import assert from "node:assert/strict";
import test from "node:test";
import { validateExchangePerYuan } from "../src/lib/format.ts";

test("public exchange rate validation rejects missing and malformed values", () => {
    for (const value of [undefined, null, true, false, [], [100], {}, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "", "0", "-3"]) {
        assert.throws(() => validateExchangePerYuan(value), RangeError);
    }
});

test("public exchange rate validation accepts positive safe integers", () => {
    assert.equal(validateExchangePerYuan(3), 3);
    assert.equal(validateExchangePerYuan(1000), 1000);
    assert.equal(validateExchangePerYuan(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
});
