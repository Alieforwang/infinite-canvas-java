import { useState } from "react";
import { Popover, Select, Tooltip } from "antd";
import { ArrowUp, ChevronDown, FolderOpen, LoaderCircle, X } from "lucide-react";
import type { CanvasNode } from "@/api/canvas";
import { getModelSpecs, type VideoModelView } from "@/api/models";
import type { VideoTaskView } from "@/api/video-tasks";
import { TaskFeedback } from "@/components/tasks/task-feedback";
import { isTaskActive } from "@/lib/video-task-state";
import { cn } from "@/lib/utils";

export type CanvasGenerationComposerProps = {
    outputType: "image" | "video";
    onOutputTypeChange: (value: "image" | "video") => void;
    modelsStatus: "loading" | "ready" | "error";
    modelsError?: string;
    onRetryModels: () => void;
    models: VideoModelView[];
    modelId?: string;
    onModelChange: (id: string) => void;
    prompt: string;
    onPromptChange: (value: string) => void;
    seconds: number;
    onSecondsChange: (value: number) => void;
    resolution: string;
    onResolutionChange: (value: string) => void;
    ratio: string;
    onRatioChange: (value: string) => void;
    mode: "frames" | "reference";
    onModeChange: (value: "frames" | "reference") => void;
    references: CanvasNode[];
    candidates: CanvasNode[];
    media: Record<string, string>;
    onToggleReference: (id: string) => void;
    onOpenLibrary: () => void;
    onUseSelected: () => void;
    selectedTextCount: number;
    task?: VideoTaskView;
    estimate: number;
    availableCredits: number;
    generating: boolean;
    onGenerate: () => void;
    onClose: () => void;
    onRecharge: () => void;
    onExpand?: () => void;
};
const chip = "rounded-lg border border-stone-200 px-2 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700";
function formatResolution(value: string) {
    const dimensions = value.match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
    if (!dimensions) return value;
    const width = Number(dimensions[1]);
    const height = Number(dimensions[2]);
    if (!width || !height) return value;
    let divisor = width;
    let remainder = height;
    while (remainder) {
        const next = divisor % remainder;
        divisor = remainder;
        remainder = next;
    }
    return `${width} × ${height} · ${width / divisor}:${height / divisor}`;
}
const chosen = "border-violet-400 bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200";
export function CanvasGenerationComposer(props: CanvasGenerationComposerProps) {
    const {
        outputType,
        onOutputTypeChange,
        modelsStatus,
        modelsError,
        onRetryModels,
        models,
        modelId,
        onModelChange,
        prompt,
        onPromptChange,
        seconds,
        onSecondsChange,
        resolution,
        onResolutionChange,
        ratio,
        onRatioChange,
        mode,
        onModeChange,
        references,
        candidates,
        media,
        onToggleReference,
        onOpenLibrary,
        onUseSelected,
        selectedTextCount,
        task,
        estimate,
        availableCredits,
        generating,
        onGenerate,
        onClose,
        onRecharge,
        onExpand,
    } = props;
    const [showReferences, setShowReferences] = useState(false);
    const model = models.find((entry) => entry.id === modelId && entry.capability === outputType);
    const specs = model ? getModelSpecs(model) : [];
    const selectedSpec = specs.find((spec) => spec.resolution === resolution && (outputType === "image" || spec.seconds === seconds));
    const busy = generating || Boolean(task && isTaskActive(task));
    const insufficient = Boolean(selectedSpec && availableCredits < estimate);
    const maxReferences = Math.max(0, model?.params.maxReferenceImages ?? 0);
    const supportsReferences = maxReferences > 0 && Boolean(model?.params.supportsReferenceImages || (outputType === "video" && model?.params.supportsFirstLastFrame));
    const validReferences = !references.length || Boolean(model && references.length <= maxReferences && (mode === "frames" ? outputType === "video" && model.params.supportsFirstLastFrame && references.length <= 2 : model.params.supportsReferenceImages));
    const invalidReason =
        modelsStatus === "loading"
            ? "正在加载可用模型…"
            : modelsStatus === "error"
              ? "模型加载失败，请重试"
              : !models.length
                ? `暂无可用${outputType === "image" ? "图片" : "视频"}模型，请联系管理员配置`
                : !model
                  ? "请选择模型"
                  : !specs.length
                    ? "该模型尚未配置有效规格和价格，请联系管理员"
                    : !selectedSpec
                      ? "请选择有效规格"
                      : !prompt.trim()
                        ? "请输入提示词"
                        : !validReferences
                          ? "参考图数量或参考模式不符合当前模型，请调整"
                          : "";
    const imageCandidates = candidates.filter((node) => node.type === "image" && Boolean(node.fileNo));
    const selectedIds = new Set(references.map((node) => node.id));
    const specKey = (spec: { resolution: string; seconds?: number }) => JSON.stringify([spec.resolution, spec.seconds ?? null]);
    return (
        <section data-generation-composer className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xl dark:border-stone-700 dark:bg-stone-900">
            <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex gap-1" aria-label="输出类型">
                    {(["image", "video"] as const).map((type) => (
                        <button key={type} type="button" aria-pressed={outputType === type} disabled={busy} onClick={() => onOutputTypeChange(type)} className={cn(chip, outputType === type && chosen)}>
                            {type === "image" ? "生成图片" : "生成视频"}
                        </button>
                    ))}
                </div>
                <div className="flex gap-2">
                    {onExpand ? (
                        <button type="button" className={chip} onClick={onExpand}>
                            展开
                        </button>
                    ) : null}
                    <button type="button" aria-label="关闭生成面板" onClick={onClose}>
                        <X className="size-4" />
                    </button>
                </div>
            </div>
            <div className="mb-3">
                <label className="mb-1 block text-xs text-stone-500" htmlFor={onExpand ? "node-generation-model" : "dialog-generation-model"}>
                    模型
                </label>
                <Select
                    id={onExpand ? "node-generation-model" : "dialog-generation-model"}
                    aria-label="生成模型"
                    className="w-full"
                    value={model?.id}
                    loading={modelsStatus === "loading"}
                    disabled={busy || modelsStatus !== "ready" || !models.length}
                    placeholder={modelsStatus === "loading" ? "正在加载可用模型…" : models.length ? "选择生成模型" : "暂无可用模型"}
                    showSearch
                    optionFilterProp="searchText"
                    onChange={onModelChange}
                    options={models.map((entry) => {
                        const prices = getModelSpecs(entry).map((spec) => spec.credits);
                        const price = prices.length ? Math.min(...prices) : null;
                        return {
                            value: entry.id,
                            searchText: `${entry.displayName} ${entry.id}`,
                            label: (
                                <div className="flex min-w-0 items-center justify-between gap-3">
                                    <span className="truncate font-medium">{entry.displayName}</span>
                                    <span className="shrink-0 text-[11px] text-stone-500">
                                        {outputType === "image" ? "图片" : "视频"} · {price === null ? "待配置规格" : `${price} 积分/${outputType === "image" ? "张" : "条"}起`}
                                    </span>
                                </div>
                            ),
                        };
                    })}
                />
                {modelsStatus === "loading" ? (
                    <p role="status" className="mt-2 flex items-center gap-1 text-xs text-stone-500">
                        <LoaderCircle className="size-3 animate-spin" />
                        正在获取{outputType === "image" ? "图片" : "视频"}模型及规格价格…
                    </p>
                ) : null}
                {modelsStatus === "error" ? (
                    <div role="alert" className="mt-2 text-xs text-red-600">
                        {modelsError || "模型加载失败"}
                        <button type="button" onClick={onRetryModels} className="ml-2 underline">
                            重新加载
                        </button>
                    </div>
                ) : modelsStatus === "ready" && !models.length ? (
                    <div role="status" className="mt-2 text-xs text-stone-500">
                        暂无可用{outputType === "image" ? "图片" : "视频"}模型。
                        <button type="button" onClick={onRetryModels} className="ml-2 underline">
                            刷新模型
                        </button>
                    </div>
                ) : null}
            </div>
            <textarea
                aria-label="画布生成提示词"
                value={prompt}
                disabled={busy}
                onChange={(event) => onPromptChange(event.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={outputType === "image" ? "描述要生成的图片…" : "描述要生成的视频…"}
                className="w-full resize-y rounded-lg border border-stone-200 bg-transparent p-2 text-sm outline-none focus:border-violet-400 dark:border-stone-700"
            />
            <div className="mt-3 space-y-2">
                <label className="block text-xs text-stone-500">{outputType === "image" ? "尺寸与单张价格" : "视频规格与价格"}</label>
                <Select
                    aria-label={outputType === "image" ? "图片尺寸" : "视频规格"}
                    className="w-full"
                    value={selectedSpec ? specKey(selectedSpec) : undefined}
                    disabled={busy || !specs.length}
                    placeholder="选择生成规格"
                    onChange={(value) => {
                        const next = specs.find((spec) => specKey(spec) === value);
                        if (next) {
                            onResolutionChange(next.resolution);
                            onSecondsChange(next.seconds ?? 0);
                        }
                    }}
                    options={specs.map((spec) => ({
                        value: specKey(spec),
                        label: (
                            <div className="flex items-center justify-between gap-3">
                                <span className="font-medium">
                                    {formatResolution(spec.resolution)}
                                    {outputType === "video" ? ` · ${spec.seconds} 秒` : ""}
                                </span>
                                <span className="shrink-0 text-xs text-violet-600 dark:text-violet-300">
                                    {spec.credits} 积分/{outputType === "image" ? "张" : "条"}
                                </span>
                            </div>
                        ),
                    }))}
                />
                {outputType === "video" ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-stone-500">比例</span>
                        {model?.params.ratios.map((value) => (
                            <button key={value} type="button" disabled={busy} className={cn(chip, ratio === value && chosen)} onClick={() => onRatioChange(value)}>
                                {value}
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={busy} className={chip} onClick={onUseSelected}>
                    使用所选文本 {selectedTextCount || ""}
                </button>
                {supportsReferences ? (
                    <button type="button" disabled={busy} className={cn(chip, "inline-flex items-center gap-1")} onClick={onOpenLibrary}>
                        <FolderOpen className="size-3" />
                        素材库
                    </button>
                ) : null}
                {supportsReferences ? (
                    <Popover
                        trigger="click"
                        open={showReferences}
                        onOpenChange={setShowReferences}
                        content={
                            <div className="max-h-64 w-64 overflow-y-auto">
                                <p className="mb-2 text-xs text-stone-500">选择参考图片（最多 {maxReferences} 张）</p>
                                {imageCandidates.length ? (
                                    imageCandidates.map((node) => (
                                        <button
                                            key={node.id}
                                            type="button"
                                            disabled={busy || (!selectedIds.has(node.id) && references.length >= maxReferences)}
                                            onClick={() => onToggleReference(node.id)}
                                            className={cn(chip, "mb-1 flex w-full items-center gap-2", selectedIds.has(node.id) && chosen)}
                                        >
                                            <img src={media[node.fileNo!]} alt="" className="size-8 rounded object-cover" />
                                            <span className="truncate">{node.title || "图片"}</span>
                                        </button>
                                    ))
                                ) : (
                                    <p className="text-xs">画布暂无可引用图片</p>
                                )}
                            </div>
                        }
                    >
                        <button type="button" disabled={busy} className={cn(chip, "inline-flex items-center gap-1")}>
                            参考图 {references.length}
                            <ChevronDown className="size-3" />
                        </button>
                    </Popover>
                ) : null}
                {outputType === "video" && model?.params.supportsFirstLastFrame ? (
                    <button type="button" disabled={busy} className={cn(chip, mode === "frames" && chosen)} onClick={() => onModeChange("frames")}>
                        首尾帧
                    </button>
                ) : null}
                {model?.params.supportsReferenceImages ? (
                    <button type="button" disabled={busy} className={cn(chip, mode === "reference" && chosen)} onClick={() => onModeChange("reference")}>
                        参考图片
                    </button>
                ) : null}
            </div>
            {model ? (
                <p className="mt-2 text-[11px] text-stone-500">
                    {supportsReferences
                        ? `当前模型支持${mode === "frames" && outputType === "video" ? `首尾帧，最多 ${Math.min(2, maxReferences)}` : `参考图片，最多 ${maxReferences}`} 张图片`
                        : "当前模型仅支持文字提示词，不支持参考图片；已有参考图请移除后生成。"}
                </p>
            ) : null}
            {references.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                    {references.map((node, index) => (
                        <div key={node.id} className="relative">
                            <img src={media[node.fileNo!]} alt={`参考图 ${index + 1}`} className="size-12 rounded object-cover" />
                            <button type="button" disabled={busy} aria-label={`移除参考图 ${index + 1}`} onClick={() => onToggleReference(node.id)} className="absolute -right-1 -top-1 rounded-full bg-stone-900 p-0.5 text-white">
                                <X className="size-3" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : null}
            <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-stone-500">{selectedSpec ? `${estimate} 积分/${outputType === "image" ? "张" : "条"}` : "规格待配置"}</span>
                <Tooltip title={invalidReason || (insufficient ? "积分不足" : "开始生成")}>
                    <span>
                        <button
                            type="button"
                            aria-label={outputType === "image" ? "开始生成图片" : "开始生成视频"}
                            disabled={busy || Boolean(invalidReason) || insufficient}
                            onClick={onGenerate}
                            className="flex size-9 items-center justify-center rounded-full bg-violet-600 text-white disabled:opacity-30"
                        >
                            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                        </button>
                    </span>
                </Tooltip>
            </div>
            {invalidReason ? (
                <p role="status" className="mt-2 text-xs text-stone-500">
                    {invalidReason}
                </p>
            ) : null}
            {generating && outputType === "image" ? (
                <p role="status" className="mt-2 text-xs text-violet-600">
                    正在生成图片，请保持页面打开，完成后自动插入画布…
                </p>
            ) : null}
            {insufficient ? (
                <p className="mt-2 text-xs text-amber-600">
                    可用 {availableCredits} 积分，积分不足。
                    <button type="button" className="underline" onClick={onRecharge}>
                        补充积分
                    </button>
                </p>
            ) : null}
            {task ? (
                <div className="mt-3 border-t border-stone-100 pt-3 dark:border-stone-800">
                    <TaskFeedback task={task} />
                </div>
            ) : null}
        </section>
    );
}
