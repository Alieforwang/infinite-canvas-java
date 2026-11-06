import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CanvasGenerationComposer, type CanvasGenerationComposerProps } from "../src/components/canvas/generation-composer";
import type { VideoModelView } from "../src/api/models";

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
    expect(html).toContain("10 积分/张");
    expect(html).toContain("开始生成图片");
    expect(html).not.toContain("选择时长");
    expect(html).not.toContain("暂无可用视频模型");
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
