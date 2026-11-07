import assert from "node:assert/strict";
import test from "node:test";
import { modelMoneyRulesUnchanged, unchangedModelRuleUnits, unchangedModelUnits } from "../src/lib/model-money.ts";
import { modelPayloadFromValues } from "../src/pages/ModelsPage";

test("preserves minimum charge units after dividing by the configured rate", () => {
    assert.equal(unchangedModelUnits("0.10", 100, 1000), 100);
    assert.equal(unchangedModelUnits(0.001, 1, 1000), 1);
});

test("preserves unchanged recurring yuan amounts for both string and number inputs", () => {
    assert.equal(unchangedModelUnits(1 / 3, 1, 3), 1);
    assert.equal(unchangedModelUnits(String(1 / 3), 1, 3), 1);
});

test("preserves historical fractional per-second rates before final ledger rounding", () => {
    assert.equal(unchangedModelUnits("0.005", 0.5, 100), 0.5);
    assert.equal(unchangedModelUnits("0.1", 0.3, 3), 0.3);
    assert.equal(unchangedModelUnits(String(1.2345 / 1000), 1.2345, 1000), 1.2345);
});

test("edited amounts are sent through strict conversion instead of reusing old units", () => {
    assert.equal(unchangedModelUnits("0.11", 100, 1000), null);
    assert.equal(unchangedModelUnits("0.3333", 1, 3), null);
    assert.equal(unchangedModelUnits("0.33333333333333331", 1, 3), null);
    assert.equal(unchangedModelUnits("0.100000000000000001", 100, 1000), null);
});

test("zero remains a valid unchanged price", () => {
    assert.equal(unchangedModelUnits("0", 0, 100), 0);
});

test("invalid input cannot bypass strict conversion through the preservation path", () => {
    for (const value of [undefined, null, "", " ", "0x10", "16abc", "Infinity", NaN, true]) {
        assert.equal(unchangedModelUnits(value, 16, 1), null, String(value));
    }
});

test("rejects invalid rate and unsafe original values", () => {
    for (const rate of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        assert.equal(unchangedModelUnits(0, 0, rate), null);
    }
    assert.equal(unchangedModelUnits(1, undefined, 1), null);
    assert.equal(unchangedModelUnits(1, Infinity, 1), null);
    assert.equal(unchangedModelUnits(1, Number.MAX_SAFE_INTEGER + 1, 1), null);
});

test("decimal and scientific notation retain an unchanged amount", () => {
    assert.equal(unchangedModelUnits("+1.0e-3", 1, 1000), 1);
    assert.equal(unchangedModelUnits(" .10 ", 100, 1000), 100);
});

test("rule preservation follows resolution and duration after reordering", () => {
    const original = [{ resolution: "720p", seconds: 8, credits: 1 }, { resolution: "1080p", seconds: 12, credits: 2 }];
    assert.equal(unchangedModelRuleUnits({ resolution: "1080p", seconds: 12, credits: String(2 / 3) }, original, 3), 2);
    assert.equal(modelMoneyRulesUnchanged([
        { resolution: "1080p", seconds: 12, credits: String(2 / 3) },
        { resolution: "720p", seconds: 8, credits: String(1 / 3) },
    ], original, 3), true);
});

test("a different specification or duration cannot inherit an unrelated stored price", () => {
    const original = [{ resolution: "720p", seconds: 8, credits: 1 }];
    assert.equal(unchangedModelRuleUnits({ resolution: "1080p", seconds: 8, credits: 1 / 3 }, original, 3), null);
    assert.equal(unchangedModelRuleUnits({ resolution: "720p", seconds: 12, credits: 1 / 3 }, original, 3), null);
});

test("matches an unchanged historical duplicate by its actual amount", () => {
    const original = [{ resolution: "720p", seconds: 8, credits: 1 }, { resolution: "720p", seconds: 8, credits: 2 }];
    assert.equal(unchangedModelRuleUnits({ resolution: "720p", seconds: 8, credits: 2 / 3 }, original, 3), 2);
});

test("image specifications preserve zero and fractional legacy rule amounts", () => {
    const original = [{ resolution: "1024x1024", credits: 0 }, { resolution: "1536x1024", credits: 0.5 }];
    assert.equal(unchangedModelRuleUnits({ resolution: "1024x1024", credits: "0" }, original, 100), 0);
    assert.equal(unchangedModelRuleUnits({ resolution: "1536x1024", credits: "0.005" }, original, 100), 0.5);
});

test("added, deleted or repriced rules require new serialization", () => {
    const original = [{ resolution: "720p", seconds: 8, credits: 1 }];
    assert.equal(modelMoneyRulesUnchanged([], original, 100), false);
    assert.equal(modelMoneyRulesUnchanged([{ resolution: "720p", seconds: 8, credits: "0.02" }], original, 100), false);
    assert.equal(modelMoneyRulesUnchanged([], [], 100), true);
});

test("harmless whitespace around a specification does not alter its stored amount", () => {
    assert.equal(unchangedModelRuleUnits({ resolution: " 720p ", seconds: 8, credits: "0.10" }, [{ resolution: "720p", seconds: 8, credits: 10 }], 100), 10);
});

const modelValues = {
    channelId: 1, upstreamModel: " model-a ", displayName: "改名", modelKey: "model-a", capability: "video" as const,
    pricingRules: [{ resolution: "720p", seconds: 8, credits: "0.08" }], routeWeight: 100,
    creditsPerSecond: "0.01", resolutionFactors: '{"720p":1}', resolutionDefault: "720p", audioFactor: 1,
    minChargeCredits: "0.001", supportedSeconds: "[8]", supportedSizes: '["1280x720"]', supportedRatios: '["16:9"]',
    supportsAudio: false, supportsWatermark: false, supportsFirstLastFrame: false, supportsReferenceImages: true,
    maxReferenceImages: 1, enabled: true, sort: 0,
};

test("model payload converts rules, per-second and minimum amounts exactly once", () => {
    const payload = modelPayloadFromValues(modelValues, 1000);
    assert.equal(JSON.parse(payload.pricingRules)[0].credits, 80);
    assert.equal(payload.creditsPerSecond, 10);
    assert.equal(payload.minChargeCredits, 1);
    assert.equal(payload.upstreamModel, "model-a");
});

test("an unrelated model edit preserves original rule JSON and fractional legacy rates", () => {
    const original = { capability: "video" as const, pricingRules: '[ { "resolution": "720p", "seconds": 8, "credits": 1 } ]', creditsPerSecond: 0.3, minChargeCredits: 1 };
    const payload = modelPayloadFromValues({ ...modelValues, pricingRules: [{ resolution: "720p", seconds: 8, credits: String(1 / 3) }], creditsPerSecond: "0.1", minChargeCredits: String(1 / 3) }, 3, original);
    assert.equal(payload.pricingRules, original.pricingRules);
    assert.equal(payload.creditsPerSecond, 0.3);
    assert.equal(payload.minChargeCredits, 1);
});

test("manual reclassification retains unchanged historical sales rules and rates", () => {
    const original = { capability: "video" as const, pricingRules: '[ { "resolution": "720p", "seconds": 8, "credits": 80 } ]', creditsPerSecond: 10, minChargeCredits: 1 };
    const payload = modelPayloadFromValues({ ...modelValues, capability: "llm" }, 1000, original);
    assert.equal(payload.pricingRules, original.pricingRules);
    assert.equal(payload.creditsPerSecond, 10);
    assert.equal(payload.minChargeCredits, 1);
    assert.equal(payload.capability, "llm");
});

test("LLM inventory payload has no invented generation specification or pricing", () => {
    const payload = modelPayloadFromValues({ ...modelValues, capability: "llm", pricingRules: [], creditsPerSecond: "0", minChargeCredits: "0", resolutionFactors: "{}", resolutionDefault: "", supportedSeconds: "[]", supportedSizes: "[]", supportedRatios: "[]", supportsReferenceImages: false, maxReferenceImages: 0 }, 1000);
    assert.equal(payload.pricingRules, "[]");
    assert.equal(payload.creditsPerSecond, 0);
    assert.equal(payload.minChargeCredits, 0);
    assert.equal(payload.supportedSeconds, "[]");
    assert.equal(payload.supportedSizes, "[]");
});

test("changed model prices containing a fractional accounting unit are rejected", () => {
    assert.throws(() => modelPayloadFromValues({ ...modelValues, pricingRules: [{ resolution: "720p", seconds: 8, credits: "0.0001" }] }, 1000), /精度/);
    assert.throws(() => modelPayloadFromValues({ ...modelValues, minChargeCredits: "0.0001" }, 1000), /精度/);
});
