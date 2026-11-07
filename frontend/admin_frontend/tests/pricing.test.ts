import assert from "node:assert/strict";
import test from "node:test";
import { buildLogicalPricingPlan } from "../src/lib/pricing.ts";
import type { VideoModel } from "../src/types.ts";

const now = Date.parse("2026-01-01T00:00:00Z");

function route(overrides: Partial<VideoModel>): VideoModel {
    return {
        id: 1, channelId: 1, channelName: "A", upstreamModel: "veo-3", displayName: "veo-3",
        modelKey: "veo-3", routeWeight: 100, capability: "video", pricingRules: '[{"resolution":"720p","seconds":8,"credits":80}]',
        enabled: 1, sort: 0, creditsPerSecond: 10, resolutionFactors: "{}", resolutionDefault: "720p", audioFactor: 1,
        minChargeCredits: 1, supportedSeconds: "[\"8\"]", supportedSizes: "[]", supportedRatios: "[]", supportsAudio: 0,
        supportsWatermark: 0, supportsFirstLastFrame: 0, supportsReferenceImages: 1, maxReferenceImages: 1,
        createdAt: "2026-01-01T00:00:00", costPerUnit: 2, costQuotaType: 2,
        costSyncedAt: "2025-12-31T12:00:00", currentLoad: 0, ...overrides,
    };
}

test("groups routes and uses min cost while warning on max cost floor", () => {
    const plan = buildLogicalPricingPlan([
        route({ id: 1, channelId: 1, costPerUnit: 2 }),
        route({ id: 2, channelId: 2, channelName: "B", costPerUnit: 10 }),
    ], 20, 10, now);
    assert.equal(plan.length, 1);
    assert.equal(plan[0].suggestion.rules[0].credits, 20);
    assert.ok(plan[0].suggestion.warnings.some((warning) => warning.includes("最高成本")));
});

test("reports unknown and expired routes without discarding known-cost suggestion", () => {
    const plan = buildLogicalPricingPlan([
        route({ id: 1, costPerUnit: 2 }),
        route({ id: 2, channelId: 2, costPerUnit: null, costSyncedAt: null }),
        route({ id: 3, channelId: 3, costPerUnit: 3, costSyncedAt: "2025-12-20T00:00:00" }),
    ], 20, 10, now);
    assert.equal(plan[0].suggestion.rules.length, 1);
    assert.ok(plan[0].suggestion.warnings.some((warning) => warning.includes("成本未知")));
    assert.ok(plan[0].suggestion.warnings.some((warning) => warning.includes("成本已过期")));
});

test("accepts zero cost and still honors minimum charge", () => {
    const plan = buildLogicalPricingPlan([route({ costPerUnit: 0, minChargeCredits: 7 })], 20, 10, now);
    assert.equal(plan[0].suggestion.rules[0].credits, 7);
    assert.equal(plan[0].suggestion.minCost, 0);
});

test("does not let a disabled cheap route lower the eligible suggestion", () => {
    const plan = buildLogicalPricingPlan([
        route({ id: 1, costPerUnit: 2 }),
        route({ id: 2, channelId: 2, costPerUnit: 0 }),
    ], 20, 10, now, 24, (candidate) => candidate.id === 1);
    assert.equal(plan[0].suggestion.rules[0].credits, 20);
    assert.ok(plan[0].suggestion.warnings.some((warning) => warning.includes("不可路由")));
});

test("does not use an inactive channel route for pricing", () => {
    const plan = buildLogicalPricingPlan([
        route({ id: 1, costPerUnit: 4 }),
        route({ id: 2, channelId: 2, costPerUnit: 0 }),
    ], 20, 10, now, 24, (candidate) => candidate.channelId === 1);
    assert.equal(plan[0].suggestion.rules[0].credits, 40);
    assert.match(plan[0].suggestion.warnings.join(" "), /不可路由/);
});
test("ignores audio capability on excluded routes", () => {
    const plan = buildLogicalPricingPlan([
        route({ id: 1, supportsAudio: 1, costPerUnit: 0 }),
        route({ id: 2, supportsAudio: 0, costPerUnit: 4 }),
    ], 20, 10, now, 24, (candidate) => candidate.id === 2);
    assert.equal(plan[0].suggestion.rules[0].credits, 40);
});
test("uses only routes that support each video duration", () => {
    const plan = buildLogicalPricingPlan([
        route({ id: 1, costPerUnit: 2, supportedSeconds: "[\"4\"]" }),
        route({ id: 2, channelId: 2, costPerUnit: 10, supportedSeconds: "[\"8\"]" }),
    ], 20, 10, now);
    assert.equal(plan[0].suggestion.rules[0].credits, 100);
});
test("rejects target margin below floor but allows both at zero", () => {
    const feasible = buildLogicalPricingPlan([route({ costPerUnit: 2 })], 0, 0, now)[0];
    assert.equal(feasible.suggestion.rules[0].credits, 16);
    const rejected = buildLogicalPricingPlan([route({ costPerUnit: 2 })], 0, 10, now)[0];
    assert.equal(rejected.suggestion.reason, "目标毛利率不能低于最低毛利率下限");
});
test("rejects a rule without a matching fresh cost even when another duration is cheap", () => {
    const plan = buildLogicalPricingPlan([
        route({ id: 1, supportedSeconds: '["4"]', costPerUnit: 0 }),
        route({ id: 2, supportedSeconds: '["8"]', costPerUnit: null, costSyncedAt: null }),
    ], 20, 10, now);
    assert.equal(plan[0].suggestion.rules.length, 0);
    assert.equal(plan[0].suggestion.reason, "当前规格没有可用的最新线路成本");
});

test("ignores costs dated beyond the tolerated future clock offset", () => {
    const plan = buildLogicalPricingPlan([
        route({ id: 1, costPerUnit: 0, costSyncedAt: "2026-01-01T00:06:00Z" }),
        route({ id: 2, costPerUnit: 4 }),
    ], 20, 10, now);
    assert.equal(plan[0].suggestion.rules[0].credits, 40);
});

test("does not interpret video pixel sizes as resolution pricing labels", () => {
    const plan = buildLogicalPricingPlan([route({ supportedSizes: '["1280x720"]' })], 20, 10, now);
    assert.equal(plan[0].suggestion.rules[0].credits, 20);
});

test("calculates each duration using only its supported route costs", () => {
    const rules = '[{"resolution":"720p","seconds":4,"credits":40},{"resolution":"720p","seconds":8,"credits":80}]';
    const plan = buildLogicalPricingPlan([
        route({ id: 1, pricingRules: rules, supportedSeconds: '["4"]', costPerUnit: 2 }),
        route({ id: 2, pricingRules: rules, supportedSeconds: '["8"]', costPerUnit: 10 }),
    ], 20, 10, now);
    assert.deepEqual(plan[0].suggestion.rules.map((rule) => rule.credits), [10, 100]);
});

test("image recommendations require matching size and a per-call quote", () => {
    const image = route({ capability: "image", pricingRules: '[{"resolution":"1024x1024","credits":10}]',
        supportedSizes: '["1024x1024"]', costPerUnit: 8, costQuotaType: 1 });
    const valid = buildLogicalPricingPlan([image], 20, 10, now)[0];
    assert.equal(valid.suggestion.rules[0].credits, 10);
    const wrongUnit = buildLogicalPricingPlan([{ ...image, costQuotaType: 2 }], 20, 10, now)[0];
    assert.equal(wrongUnit.suggestion.rules.length, 0);
    const wrongSize = buildLogicalPricingPlan([{ ...image, supportedSizes: '["512x512"]' }], 20, 10, now)[0];
    assert.equal(wrongSize.suggestion.rules.length, 0);
});

test("rejects audio routes and unsupported multi-resolution pricing", () => {
    const audio = buildLogicalPricingPlan([route({ supportsAudio: 1 })], 20, 10, now)[0];
    assert.equal(audio.suggestion.reason, "音频成本未单独报价");
    const multi = route({ pricingRules: '[{"resolution":"480p","seconds":8,"credits":80},{"resolution":"720p","seconds":8,"credits":100}]' });
    assert.match(buildLogicalPricingPlan([multi], 20, 10, now)[0].suggestion.reason ?? "", /多规格/);
});
