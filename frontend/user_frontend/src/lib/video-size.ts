import type { VideoModelView } from "@/api/models";

// "720p" describes the short side, so a 9:16 clip at 720p is 720x1280 (not 404x720).
const RESOLUTION_SHORT_SIDE: Record<string, number> = {
    "480p": 480,
    "720p": 720,
    "1080p": 1080,
    "2k": 1440,
    "4k": 2160,
};

export function resolutionShortSide(resolution: string): number {
    return RESOLUTION_SHORT_SIDE[resolution.trim().toLowerCase()] ?? 720;
}

export function ratioFactor(ratio: string): number {
    const [width, height] = ratio.split(":").map((value) => Number(value));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 16 / 9;
    return width / height;
}

function even(value: number): number {
    return Math.max(2, Math.round(value / 2) * 2);
}

/** Pixel size for a ratio at a resolution, applying the resolution to the short side. */
export function sizeForRatio(ratio: string, resolution: string): string {
    const shortSide = resolutionShortSide(resolution);
    const factor = ratioFactor(ratio);
    return factor >= 1
        ? `${even(shortSide * factor)}x${even(shortSide)}`
        : `${even(shortSide)}x${even(shortSide / factor)}`;
}

function parseSize(value: string) {
    const match = value.trim().match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * Prefer a size the model actually exposes when its aspect matches the chosen
 * ratio. Video models imported from channels default to 1280x720/720x1280, so
 * blindly sending `sizes[0]` defeats a 9:16 or 1:1 ratio; when no configured
 * size matches, derive one from ratio + resolution instead.
 */
export function resolveVideoSize(model: Pick<VideoModelView, "params">, ratio: string, resolution: string): string {
    const factor = ratioFactor(ratio);
    const candidates = (model.params?.sizes ?? [])
        .map(parseSize)
        .filter((size): size is { width: number; height: number } => Boolean(size));
    const matching = candidates
        .filter((size) => Math.abs(size.width / size.height - factor) <= 0.02)
        .sort((a, b) => Math.abs(Math.min(a.width, a.height) - resolutionShortSide(resolution)) - Math.abs(Math.min(b.width, b.height) - resolutionShortSide(resolution)));
    if (matching.length) return `${matching[0].width}x${matching[0].height}`;
    return sizeForRatio(ratio, resolution);
}
