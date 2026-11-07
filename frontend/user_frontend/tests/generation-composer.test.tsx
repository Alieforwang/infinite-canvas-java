import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CanvasGenerationComposer, type CanvasGenerationComposerProps } from "../src/components/canvas/generation-composer";
import type { CanvasNode } from "../src/api/canvas";
import type { VideoModelView } from "../src/api/models";
import { usePublicSettingsStore } from "../src/stores/use-public-settings-store";

const noop = () => {};
const image: VideoModelView = {
    id: "image-test", displayName: "图片模型", capability: "image",
    params: { seconds: ["8"], sizes: [], resolutions: [], ratios: ["16:9"], supportsAudio: false, supportsWatermark: false, supportsFirstLastFrame: false, supportsReferenceImages: false, maxReferenceImages: 1, resolutionDefault: "720p" },
    pricing: { creditsPerSecond: 10, rules: [{ resolution: "1024x1024", credits: 10 }], resolutionFactors: {}, audioFactor: 1, minChargeCredits: 1 },
};
const defaults: CanvasGenerationComposerProps = {
    outputType: "image", onOutputTypeChange: noop, modelsStatus: "ready", onRetryModels: noop,
    models: [image], modelId: image.id, onModelChange: noop, prompt: "测试图片", onPromptChange: noop,
    seconds: 8, onSecondsChange: noop, resolution: "1024x1024", onResolutionChange: noop,
    ratio: "16:9", onRatioChange: noop, mode: "reference", onModeChange: noop,
    references: [], candidates: [], media: {}, onToggleReference: noop, onOpenLibrary: noop,
    onUseSelected: noop, selectedTextCount: 0, estimate: 10, availableCredits: 100,
    generating: false, onGenerate: noop, onClose: noop, onRecharge: noop,
};
function render(props: Partial<CanvasGenerationComposerProps> = {}) {
    return renderToStaticMarkup(<CanvasGenerationComposer {...defaults} {...props} />);
}

test("image composer shows priced image dimensions and per-image cost without video controls", () => {
    const html = render();
    expect(html).toContain("1024 × 1024");
    expect(html).toContain("1:1");
    expect(html).toContain("¥0.10 /张");
    expect(html).not.toContain("积分");
    expect(html).toContain("开始生成图片");
    expect(html).not.toContain("选择时长");
    expect(html).not.toContain("暂无可用视频模型");
});

test("configured ratio applies to composer estimates, specs and insufficient balance", () => {
    const snapshot = usePublicSettingsStore.getInitialState();
    const previousRate = snapshot.exchangePerYuan;
    snapshot.exchangePerYuan = 1000;
    try {
        const html = render({ availableCredits: 1 });
        expect(html).toContain("¥0.01 /张");
        expect(html).toContain("¥0.001");
        expect(html).toContain("余额不足");
        expect(html).toContain("充值");
        expect(html).not.toContain("积分");
    } finally {
        snapshot.exchangePerYuan = previousRate;
    }
});

test("catalog loading and errors remain distinct from a genuinely empty image catalog", () => {
    expect(render({ models: [], modelsStatus: "loading" })).toContain("正在获取图片模型及规格价格");
    const error = render({ models: [], modelsStatus: "error", modelsError: "连接失败" });
    expect(error).toContain("连接失败");
    expect(error).toContain("重新加载");
    expect(error).not.toContain("暂无可用图片模型。");
    const empty = render({ models: [], modelsStatus: "ready" });
    expect(empty).toContain("暂无可用图片模型。");
    expect(empty).toContain("刷新模型");
});

test("image model without reference support does not offer the asset library", () => {
    const html = render();
    expect(html).not.toContain("从素材库");
    expect(html).toContain("不支持参考图片");
});

const video: VideoModelView = {
    id: "video-test", displayName: "视频模型", capability: "video",
    params: { seconds: ["8"], sizes: [], resolutions: ["720p"], ratios: [], supportsAudio: false, supportsWatermark: false, supportsFirstLastFrame: true, supportsReferenceImages: true, maxReferenceImages: 2, resolutionDefault: "720p" },
    pricing: { creditsPerSecond: 0, rules: [{ resolution: "720p", seconds: 8, credits: 12 }], resolutionFactors: {}, audioFactor: 1, minChargeCredits: 1 },
};

test("composer exposes @ mentions for canvas materials", () => {
    const textNode: CanvasNode = { id: "text-1", type: "text", x: 0, y: 0, width: 280, height: 150, title: "旁白", content: "镜头缓慢推近" };
    const html = render({ candidates: [textNode] });
    expect(html).toContain("输入 @ 引用画布素材");
    expect(html).toContain('aria-label="画布生成提示词"');
    expect(render()).not.toContain("输入 @ 引用画布素材");
});

test("a capable model with a null reference limit still exposes the add-reference slot", () => {
    const legacy: VideoModelView = { ...video, id: "video-legacy", params: { ...video.params, maxReferenceImages: null as unknown as number } };
    const html = render({ outputType: "video", models: [legacy], modelId: legacy.id, prompt: "测试视频", seconds: 8, resolution: "720p", ratio: "16:9", estimate: 12 });
    expect(html).toContain('aria-label="添加参考"');
});

test("over-limit connected references explain the model limit and offer a one-click trim", () => {
    const limited: VideoModelView = { ...video, id: "video-limited", params: { ...video.params, supportsFirstLastFrame: false, supportsReferenceImages: true, maxReferenceImages: 1 } };
    const references: CanvasNode[] = [
        { id: "ref-1", type: "image", x: 0, y: 0, width: 100, height: 100, title: "图一", fileNo: "f1" },
        { id: "ref-2", type: "image", x: 0, y: 0, width: 100, height: 100, title: "图二", fileNo: "f2" },
    ];
    const html = render({ outputType: "video", models: [limited], modelId: limited.id, prompt: "测试视频", seconds: 8, resolution: "720p", ratio: "16:9", references, media: { f1: "a.png", f2: "b.png" }, estimate: 12 });
    expect(html).toContain("当前模型最多支持 1 张参考图");
    expect(html).toContain("已选 2 张");
    expect(html).toContain("仅保留前 1 张");
    expect(html).toContain("超出上限");
});

test("video composer keeps ratio, resolution and duration controls usable when the model has no configured ratios", () => {
    const html = render({ outputType: "video", models: [video], modelId: video.id, prompt: "测试视频", seconds: 8, resolution: "720p", ratio: "16:9", estimate: 12 });
    expect(html).toContain("16:9");
    expect(html).toContain("720P");
    expect(html).toContain("8s");
    expect(html).toContain('aria-label="添加参考"');
    expect(html).toContain("开始生成视频");
});
