import { http } from "@/api/http";

export type VideoModelView = {
    id: string;
    displayName: string;
    capability: string;
    params: {
        seconds: string[];
        sizes: string[];
        resolutions: string[];
        ratios: string[];
        supportsAudio: boolean;
        supportsWatermark: boolean;
        supportsFirstLastFrame: boolean;
        supportsReferenceImages: boolean;
        maxReferenceImages: number;
        resolutionDefault: string;
    };
    pricing: {
        creditsPerSecond: number;
        rules: Array<{ resolution: string; seconds?: number; credits: number }>;
        resolutionFactors: Record<string, number>;
        audioFactor: number;
        minChargeCredits: number;
    };
};

export type ModelCapability = "image" | "video";
export type ModelSpec = { resolution: string; seconds?: number; credits: number };

/**
 * Upstream-imported video models often arrive without configured ratios. Fall
 * back to the common landscape/portrait/square set instead of shipping an empty
 * ratio selector (the concrete pixel size is derived from ratio + resolution by
 * resolveVideoSize, so every fallback ratio here is renderable).
 */
export const DEFAULT_VIDEO_RATIOS = ["16:9", "9:16", "1:1"];

export function getModelRatios(model: VideoModelView): string[] {
    const configured = Array.from(new Set((model.params.ratios ?? []).map((value) => value.trim()).filter(Boolean)));
    if (configured.length) return configured;
    return model.capability === "video" ? [...DEFAULT_VIDEO_RATIOS] : [];
}

export function listModels(capability: ModelCapability = "video"): Promise<VideoModelView[]> {
    return http.get<unknown, VideoModelView[]>("/models", { params: { capability } });
}

/** Explicit rules are authoritative; legacy video rates remain supported. */
export function getModelSpecs(model: VideoModelView): ModelSpec[] {
    const rules = model.pricing.rules ?? [];
    if (rules.length) {
        const seen = new Set<string>();
        return rules.flatMap((rule) => {
            const resolution = rule.resolution?.trim();
            const credits = Number(rule.credits);
            const seconds = Number(rule.seconds);
            if (!resolution || !Number.isFinite(credits) || credits <= 0
                || (model.capability !== "image" && (!Number.isFinite(seconds) || seconds <= 0))) return [];
            const key = `${resolution}:${model.capability === "image" ? "image" : seconds}`;
            if (seen.has(key)) return [];
            seen.add(key);
            return [{ resolution, credits: Math.max(model.pricing.minChargeCredits ?? 1, Math.ceil(credits)), ...(model.capability === "image" ? {} : { seconds }) }];
        });
    }
    if (model.capability === "image") return [];
    const resolutions = model.params.resolutions?.length
        ? model.params.resolutions : Object.keys(model.pricing.resolutionFactors ?? {});
    return resolutions.flatMap((resolution) => model.params.seconds.flatMap((duration) => {
        const seconds = Number(duration);
        return Number.isFinite(seconds) && seconds > 0
            ? [{ resolution, seconds, credits: quoteCredits(model, seconds, resolution, false) }] : [];
    }));
}

export function quoteCredits(model: VideoModelView, seconds: number, resolution: string, audio: boolean) {
    const rules = model.pricing.rules ?? [];
    const exact = rules.find((rule) => rule.resolution === resolution
        && (model.capability === "image" || Number(rule.seconds) === seconds));
    // An unconfigured combination must not display a made-up legacy estimate.
    if ((rules.length || model.capability === "image") && !exact) return 0;
    const audioFactor = audio && model.capability !== "image" ? model.pricing.audioFactor ?? 1 : 1;
    const raw = exact
        ? exact.credits * audioFactor
        : (model.pricing.creditsPerSecond ?? 0)
            * (model.pricing.resolutionFactors?.[resolution] ?? 1)
            * audioFactor
            * seconds;
    return Math.max(model.pricing.minChargeCredits ?? 1, Math.ceil(raw));
}
