import { expect, test } from "bun:test";
import type { VideoModelView } from "../src/api/models";
import { ratioFactor, resolveVideoSize, sizeForRatio } from "../src/lib/video-size";

const model = (sizes: string[]) => ({ params: { sizes } as VideoModelView["params"] });

test("ratio sizes apply the resolution to the short side", () => {
    expect(sizeForRatio("16:9", "720p")).toBe("1280x720");
    expect(sizeForRatio("9:16", "720p")).toBe("720x1280");
    expect(sizeForRatio("1:1", "720p")).toBe("720x720");
    expect(sizeForRatio("4:3", "1080p")).toBe("1440x1080");
    expect(sizeForRatio("21:9", "480p")).toBe("1120x480");
});

test("invalid ratio falls back to 16:9 and unknown resolution to 720p", () => {
    expect(ratioFactor("bad")).toBeCloseTo(16 / 9);
    expect(sizeForRatio("bad", "weird")).toBe("1280x720");
});

test("configured sizes win when their aspect matches the chosen ratio", () => {
    expect(resolveVideoSize(model(["1280x720", "720x1280"]), "9:16", "720p")).toBe("720x1280");
    expect(resolveVideoSize(model(["1280x720", "720x1280"]), "16:9", "1080p")).toBe("1280x720");
});

test("square and unlisted ratios derive a size instead of reusing the landscape default", () => {
    expect(resolveVideoSize(model(["1280x720", "720x1280"]), "1:1", "720p")).toBe("720x720");
    expect(resolveVideoSize(model([]), "9:16", "1080p")).toBe("1080x1920");
});
