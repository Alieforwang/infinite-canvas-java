import { afterAll, afterEach, expect, test } from "bun:test";
import { http } from "../src/api/http";
import { DEFAULT_VIDEO_RATIOS, getModelRatios, getModelSpecs, listModels, quoteCredits, type VideoModelView } from "../src/api/models";
import { getTask, cancelTask } from "../src/api/video-tasks";
import { createImageTask } from "../src/api/image-tasks";

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null } });
afterAll(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});
const originalAdapter = http.defaults.adapter;
afterEach(() => { http.defaults.adapter = originalAdapter; });

const imageModel: VideoModelView = {
    id: "gpt-image-2", displayName: "GPT Image", capability: "image",
    params: { seconds: [], sizes: ["1280x720"], resolutions: ["1024x1024"], ratios: ["1:1"], supportsAudio: false, supportsWatermark: false, supportsFirstLastFrame: false, supportsReferenceImages: true, maxReferenceImages: 1, resolutionDefault: "720p" },
    pricing: { creditsPerSecond: 10, rules: [{ resolution: "1024x1024", credits: 10 }], resolutionFactors: {}, audioFactor: 1, minChargeCredits: 1 },
};

test("image catalog requests image capability instead of silently loading video", async () => {
    http.defaults.adapter = async (config) => {
        expect(config.params.capability).toBe("image");
        return { data: { code: "OK", data: [imageModel] }, status: 200, statusText: "OK", headers: {}, config };
    };
    expect(await listModels("image")).toEqual([imageModel]);
});

test("existing video consumers retain the default video catalog", async () => {
    http.defaults.adapter = async (config) => {
        expect(config.params.capability).toBe("video");
        return { data: { code: "OK", data: [] }, status: 200, statusText: "OK", headers: {}, config };
    };
    expect(await listModels()).toEqual([]);
});

test("image specification uses the per-image price, without multiplying by video duration", () => {
    expect(quoteCredits(imageModel, 6, "1024x1024", false)).toBe(10);
});

test("unpriced image sizes cannot inherit an unrelated video price", () => {
    expect(quoteCredits(imageModel, 6, "2048x2048", false)).toBe(0);
});

test("image choices use priced sizes and ignore stale video defaults", () => {
    expect(getModelSpecs(imageModel)).toEqual([{ resolution: "1024x1024", credits: 10 }]);
});

test("specification labels include the actual minimum charge", () => {
    const model = { ...imageModel, pricing: { ...imageModel.pricing, minChargeCredits: 20 } };
    expect(getModelSpecs(model)[0].credits).toBe(quoteCredits(model, 8, "1024x1024", false));
    expect(getModelSpecs(model)[0].credits).toBe(20);
});

test("video choices preserve complete priced pairs without creating new combinations", () => {
    const video = { ...imageModel, capability: "video", pricing: { ...imageModel.pricing, rules: [
        { resolution: "720p", seconds: 4, credits: 20 },
        { resolution: "1080p", seconds: 8, credits: 60 },
    ] } };
    expect(getModelSpecs(video)).toEqual(video.pricing.rules);
    expect(quoteCredits(video, 8, "720p", false)).toBe(0);
});

test("restoring an image task requests the image endpoint", async () => {
    http.defaults.adapter = async (config) => {
        expect(config.url).toBe("/image-tasks/img_recovered");
        return { data: { code: "OK", data: { taskNo: "img_recovered", status: "running" } }, status: 200, statusText: "OK", headers: {}, config };
    };
    expect((await getTask("img_recovered")).status).toBe("running");
});

test("image retry preserves the caller idempotency key and uses the platform API", async () => {
    let calls = 0;
    http.defaults.adapter = async (config) => {
        calls++;
        expect(config.url).toBe("/image-tasks");
        expect(config.headers.get("Idempotency-Key")).toBe("same-submission-key");
        expect(JSON.parse(config.data).size).toBe("1024x1024");
        return { data: { code: "OK", data: { taskNo: "img_retry", status: "running" } }, status: 200, statusText: "OK", headers: {}, config };
    };
    const input = { modelKey: "gpt-image-2", prompt: "test", size: "1024x1024", referenceFileNos: [] };
    await createImageTask(input, "same-submission-key");
    await createImageTask(input, "same-submission-key");
    expect(calls).toBe(2);
});

test("image cancellation cannot accidentally call the video cancel endpoint", async () => {
    http.defaults.adapter = async () => { throw new Error("Unexpected network request"); };
    await expect(cancelTask("img_processing")).rejects.toThrow("暂不支持取消");
});

test("video ratios fall back to the common set when a model ships none", () => {
    const base: VideoModelView = { ...imageModel, id: "video-empty", capability: "video", params: { ...imageModel.params, seconds: ["8"], ratios: [] } };
    expect(getModelRatios(base)).toEqual(DEFAULT_VIDEO_RATIOS);
    expect(getModelRatios({ ...base, params: { ...base.params, ratios: ["4:3"] } })).toEqual(["4:3"]);
    expect(getModelRatios({ ...base, params: { ...base.params, ratios: [" 4:3 ", "4:3", ""] } })).toEqual(["4:3"]);
    expect(getModelRatios(imageModel)).toEqual(["1:1"]);
});
