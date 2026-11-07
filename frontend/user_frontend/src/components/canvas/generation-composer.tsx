import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Popover, Tooltip } from "antd";
import { ArrowUp, Check, ChevronDown, Film, FolderOpen, Images, LoaderCircle, Maximize2, Plus, Type, X } from "lucide-react";
import type { CanvasNode } from "@/api/canvas";
import { getModelRatios, getModelSpecs, type ModelSpec, type VideoModelView } from "@/api/models";
import type { VideoTaskView } from "@/api/video-tasks";
import { CanvasResourceMentionTextarea } from "@/components/canvas/canvas-resource-mention-textarea";
import { TaskFeedback } from "@/components/tasks/task-feedback";
import { buildMentionReferences, mentionLabelFor, stripMention } from "@/lib/canvas/mention-references";
import { isTaskActive } from "@/lib/video-task-state";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/stores/use-public-settings-store";

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

// Jimeng-style composer: borderless ghost chips in one bottom row, reference
// slots above the input, and no form labels taking up vertical space.
const chipBase =
    "inline-flex h-8 min-w-0 shrink-0 items-center gap-1 rounded-lg px-1.5 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 disabled:cursor-not-allowed disabled:opacity-40 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white";
const chipChosen = "bg-violet-50 text-violet-700 hover:bg-violet-50 hover:text-violet-700 dark:bg-violet-500/15 dark:text-violet-200 dark:hover:bg-violet-500/20 dark:hover:text-violet-100";
const menuRow = "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-stone-600 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800";
const menuRowChosen = "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200";
const iconButton = "flex size-7 shrink-0 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-stone-800 dark:hover:text-stone-200";

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
function resolutionLabel(value: string) {
    return /^\d+p$/i.test(value) ? value.toUpperCase() : formatResolution(value);
}
function specKey(spec: ModelSpec) {
    return JSON.stringify([spec.resolution, spec.seconds ?? null]);
}
function popoverTitle(text: string) {
    return <p className="mb-1.5 px-1 text-[11px] font-medium text-stone-400 dark:text-stone-500">{text}</p>;
}

type ChipProps = {
    icon?: ReactNode;
    children: ReactNode;
    ariaLabel?: string;
    title?: string;
    active?: boolean;
    disabled?: boolean;
    className?: string;
    onClick?: () => void;
};

function Chip({ icon, children, ariaLabel, title, active, disabled, className, onClick }: ChipProps) {
    return (
        <button type="button" aria-label={ariaLabel} aria-pressed={active} title={title} disabled={disabled} onClick={onClick} className={cn(chipBase, active && chipChosen, className)}>
            {icon}
            <span className="truncate">{children}</span>
        </button>
    );
}

/** Aspect-ratio preview rectangle, used both in the chip and the ratio menu. */
function RatioBadge({ ratio, size }: { ratio: string; size: number }) {
    const [width, height] = ratio.split(":").map((value) => Number(value));
    const valid = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
    const inner = valid
        ? width >= height
            ? { width: size, height: Math.max(4, Math.round((size * height) / width)) }
            : { width: Math.max(4, Math.round((size * width) / height)), height: size }
        : { width: size, height: size };
    return (
        <span className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
            <span className="rounded-[2px] border border-current opacity-75" style={inner} />
        </span>
    );
}

function ModelPicker({ models, modelId, outputType, busy, status, onSelect }: { models: VideoModelView[]; modelId?: string; outputType: "image" | "video"; busy: boolean; status: "loading" | "ready" | "error"; onSelect: (id: string) => void }) {
    const { formatCredits } = useCurrency();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const selected = models.find((entry) => entry.id === modelId && entry.capability === outputType);
    const keyword = search.trim().toLowerCase();
    const filtered = keyword ? models.filter((entry) => `${entry.displayName} ${entry.id}`.toLowerCase().includes(keyword)) : models;
    const disabled = busy || status !== "ready" || !models.length;
    const label = selected?.displayName ?? (status === "loading" ? "加载模型…" : models.length ? "选择模型" : "暂无模型");
    const unit = outputType === "image" ? "张" : "条";
    return (
        <Popover
            trigger="click"
            placement="topLeft"
            arrow={false}
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) setSearch("");
            }}
            content={
                <div className="w-72">
                    <input
                        autoFocus
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="搜索模型"
                        aria-label="搜索生成模型"
                        className="mb-1.5 w-full rounded-lg bg-stone-100 px-2.5 py-1.5 text-xs text-stone-700 outline-none placeholder:text-stone-400 dark:bg-stone-800 dark:text-stone-200"
                    />
                    <div className="thin-scrollbar max-h-60 space-y-0.5 overflow-y-auto">
                        {filtered.length ? (
                            filtered.map((entry) => {
                                const prices = getModelSpecs(entry).map((spec) => spec.credits);
                                const price = prices.length ? Math.min(...prices) : null;
                                const active = entry.id === modelId;
                                return (
                                    <button key={entry.id} type="button" disabled={busy} aria-pressed={active} onClick={() => { onSelect(entry.id); setOpen(false); setSearch(""); }} className={cn(menuRow, active && menuRowChosen)}>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[13px]">{entry.displayName}</span>
                                            <span className="block text-[10px] text-stone-400 dark:text-stone-500">{entry.capability === "image" ? "图片模型" : "视频模型"}{price === null ? " · 待配置规格" : ` · ${formatCredits(price)}/${unit}起`}</span>
                                        </span>
                                        {active ? <Check className="size-3.5 shrink-0" /> : null}
                                    </button>
                                );
                            })
                        ) : (
                            <p className="px-2 py-3 text-center text-[11px] text-stone-400">没有匹配的模型</p>
                        )}
                    </div>
                </div>
            }
        >
            <button type="button" className={cn(chipBase, "shrink max-w-[150px]")} disabled={disabled} aria-label={`选择生成模型：${label}`} aria-haspopup="dialog" aria-expanded={open}>
                <span className="truncate">{label}</span>
                <ChevronDown className="size-3 shrink-0 opacity-60" />
            </button>
        </Popover>
    );
}

function RatioPicker({ ratios, value, busy, onChange }: { ratios: string[]; value: string; busy: boolean; onChange: (value: string) => void }) {
    const [open, setOpen] = useState(false);
    return (
        <Popover
            trigger="click"
            placement="topLeft"
            arrow={false}
            open={open}
            onOpenChange={setOpen}
            content={
                <div className="w-64">
                    {popoverTitle("画面比例")}
                    <div className="grid grid-cols-3 gap-1">
                        {ratios.map((entry) => {
                            const active = entry === value;
                            return (
                                <button
                                    key={entry}
                                    type="button"
                                    disabled={busy}
                                    aria-pressed={active}
                                    onClick={() => {
                                        onChange(entry);
                                        setOpen(false);
                                    }}
                                    className={cn(
                                        "flex flex-col items-center gap-1 rounded-lg border border-stone-200 px-1 py-1.5 text-[11px] text-stone-500 transition-colors hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:text-stone-400 dark:hover:border-stone-600 dark:hover:bg-stone-800",
                                        active && "border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-500/60 dark:bg-violet-500/15 dark:text-violet-200",
                                    )}
                                >
                                    <span className="flex h-7 items-center justify-center">
                                        <RatioBadge ratio={entry} size={22} />
                                    </span>
                                    {entry}
                                </button>
                            );
                        })}
                    </div>
                </div>
            }
        >
            <button type="button" className={chipBase} disabled={busy} aria-label={`画面比例：${value}`} aria-haspopup="dialog" aria-expanded={open}>
                <RatioBadge ratio={value} size={12} />
                <span className="truncate">{value}</span>
                <ChevronDown className="size-3 shrink-0 opacity-60" />
            </button>
        </Popover>
    );
}

type ResolutionChoice = { value: string; label: string; detail?: string; credits?: number };
type DurationChoice = { value: number; label: string; detail?: string; credits?: number };

function ResolutionPicker({ options, value, unit, busy, onChange }: { options: ResolutionChoice[]; value: string; unit: string; busy: boolean; onChange: (value: string) => void }) {
    const { formatCredits } = useCurrency();
    const [open, setOpen] = useState(false);
    if (options.length < 2) {
        return <span className="inline-flex h-8 shrink-0 items-center px-1.5 text-xs text-stone-500 dark:text-stone-400">{resolutionLabel(value)}</span>;
    }
    return (
        <Popover
            trigger="click"
            placement="topLeft"
            arrow={false}
            open={open}
            onOpenChange={setOpen}
            content={
                <div className="w-56">
                    {popoverTitle("分辨率（含对应时长与单价）")}
                    <div className="space-y-0.5">
                        {options.map((entry) => {
                            const active = entry.value === value;
                            return (
                                <button key={entry.value} type="button" disabled={busy} aria-pressed={active} onClick={() => { onChange(entry.value); setOpen(false); }} className={cn(menuRow, active && menuRowChosen)}>
                                    <span className="min-w-0 flex-1 truncate">
                                        {entry.label}
                                        {entry.detail ? <span className="ml-1 text-[10px] text-stone-400 dark:text-stone-500">· {entry.detail}</span> : null}
                                    </span>
                                    {entry.credits !== undefined ? <span className="shrink-0 text-[10px] tabular-nums text-stone-400">{formatCredits(entry.credits)}/{unit}</span> : null}
                                    {active ? <Check className="size-3.5 shrink-0" /> : null}
                                </button>
                            );
                        })}
                    </div>
                </div>
            }
        >
            <button type="button" className={chipBase} disabled={busy} aria-label={`分辨率：${resolutionLabel(value)}`} aria-haspopup="dialog" aria-expanded={open}>
                <span className="truncate">{resolutionLabel(value)}</span>
                <ChevronDown className="size-3 shrink-0 opacity-60" />
            </button>
        </Popover>
    );
}

function DurationPicker({ options, value, unit, busy, onChange }: { options: DurationChoice[]; value: number; unit: string; busy: boolean; onChange: (value: number) => void }) {
    const { formatCredits } = useCurrency();
    const [open, setOpen] = useState(false);
    return (
        <Popover
            trigger="click"
            placement="topLeft"
            arrow={false}
            open={open}
            onOpenChange={setOpen}
            content={
                <div className="w-56">
                    {popoverTitle("时长（含对应分辨率与单价）")}
                    <div className="space-y-0.5">
                        {options.map((entry) => {
                            const active = entry.value === value;
                            return (
                                <button key={entry.value} type="button" disabled={busy} aria-pressed={active} onClick={() => { onChange(entry.value); setOpen(false); }} className={cn(menuRow, active && menuRowChosen)}>
                                    <span className="min-w-0 flex-1 truncate">
                                        {entry.label}
                                        {entry.detail ? <span className="ml-1 text-[10px] text-stone-400 dark:text-stone-500">· {entry.detail}</span> : null}
                                    </span>
                                    {entry.credits !== undefined ? <span className="shrink-0 text-[10px] tabular-nums text-stone-400">{formatCredits(entry.credits)}/{unit}</span> : null}
                                    {active ? <Check className="size-3.5 shrink-0" /> : null}
                                </button>
                            );
                        })}
                    </div>
                </div>
            }
        >
            <button type="button" className={chipBase} disabled={busy} aria-label={`视频时长：${value} 秒`} aria-haspopup="dialog" aria-expanded={open}>
                <span className="truncate">{value}s</span>
                <ChevronDown className="size-3 shrink-0 opacity-60" />
            </button>
        </Popover>
    );
}

function ModePicker({ mode, busy, onChange }: { mode: "frames" | "reference"; busy: boolean; onChange: (value: "frames" | "reference") => void }) {
    const [open, setOpen] = useState(false);
    return (
        <Popover
            trigger="click"
            placement="topLeft"
            arrow={false}
            open={open}
            onOpenChange={setOpen}
            content={
                <div className="w-56">
                    {popoverTitle("参考方式")}
                    <button type="button" disabled={busy} aria-pressed={mode === "frames"} onClick={() => { onChange("frames"); setOpen(false); }} className={cn(menuRow, mode === "frames" && menuRowChosen)}>
                        <Film className="size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1">
                            <span className="block">首尾帧</span>
                            <span className="block text-[10px] text-stone-400 dark:text-stone-500">第 1 张为首帧，第 2 张为尾帧</span>
                        </span>
                        {mode === "frames" ? <Check className="size-3.5 shrink-0" /> : null}
                    </button>
                    <button type="button" disabled={busy} aria-pressed={mode === "reference"} onClick={() => { onChange("reference"); setOpen(false); }} className={cn(menuRow, mode === "reference" && menuRowChosen)}>
                        <Images className="size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1">
                            <span className="block">参考图</span>
                            <span className="block text-[10px] text-stone-400 dark:text-stone-500">多张图片作为画面与角色参考</span>
                        </span>
                        {mode === "reference" ? <Check className="size-3.5 shrink-0" /> : null}
                    </button>
                </div>
            }
        >
            <button type="button" className={chipBase} disabled={busy} aria-label={`参考模式：${mode === "frames" ? "首尾帧" : "参考图"}`} aria-haspopup="dialog" aria-expanded={open}>
                {mode === "frames" ? <Film className="size-3.5 shrink-0 opacity-70" /> : <Images className="size-3.5 shrink-0 opacity-70" />}
                <span className="truncate">{mode === "frames" ? "首尾帧" : "参考图"}</span>
                <ChevronDown className="size-3 shrink-0 opacity-60" />
            </button>
        </Popover>
    );
}

function SizePicker({ specs, value, busy, onChange }: { specs: ModelSpec[]; value?: string; busy: boolean; onChange: (spec: ModelSpec) => void }) {
    const { formatCredits } = useCurrency();
    const [open, setOpen] = useState(false);
    const selected = specs.find((spec) => specKey(spec) === value);
    return (
        <Popover
            trigger="click"
            placement="topLeft"
            arrow={false}
            open={open}
            onOpenChange={setOpen}
            content={
                <div className="w-64">
                    {popoverTitle("图片尺寸与单价")}
                    <div className="thin-scrollbar max-h-60 space-y-0.5 overflow-y-auto">
                        {specs.map((spec) => {
                            const active = specKey(spec) === value;
                            return (
                                <button key={specKey(spec)} type="button" disabled={busy} aria-pressed={active} onClick={() => { onChange(spec); setOpen(false); }} className={cn(menuRow, active && menuRowChosen)}>
                                    <span className="min-w-0 flex-1 truncate">{formatResolution(spec.resolution)}</span>
                                    <span className="shrink-0 text-[10px] tabular-nums text-stone-400">{formatCredits(spec.credits)}/张</span>
                                    {active ? <Check className="size-3.5 shrink-0" /> : null}
                                </button>
                            );
                        })}
                    </div>
                </div>
            }
        >
            <button type="button" className={cn(chipBase, "max-w-[172px]")} disabled={busy || !specs.length} aria-label={`图片尺寸：${selected ? formatResolution(selected.resolution) : "未选择"}`} aria-haspopup="dialog" aria-expanded={open}>
                <span className="truncate">{selected ? formatResolution(selected.resolution) : "选择尺寸"}</span>
                <ChevronDown className="size-3 shrink-0 opacity-60" />
            </button>
        </Popover>
    );
}

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
    const { formatCredits } = useCurrency();
    const [referenceOpen, setReferenceOpen] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const model = models.find((entry) => entry.id === modelId && entry.capability === outputType);
    const specs = model ? getModelSpecs(model) : [];
    const selectedSpec = specs.find((spec) => spec.resolution === resolution && (outputType === "image" || spec.seconds === seconds));
    const ratios = model ? getModelRatios(model) : [];
    const resolutions = Array.from(new Set(specs.map((spec) => spec.resolution)));
    const durations = Array.from(new Set(specs.map((spec) => spec.seconds).filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)));
    const busy = generating || Boolean(task && isTaskActive(task));
    const insufficient = Boolean(selectedSpec && availableCredits < estimate);
    const supportsFrames = outputType === "video" && Boolean(model?.params.supportsFirstLastFrame);
    const supportsImages = Boolean(model?.params.supportsReferenceImages);
    const referenceCapable = Boolean(model && (supportsImages || supportsFrames));
    // Some models still carry a null reference limit; a capable model supports at least one image.
    const configuredMaxReferences = Math.max(1, Math.floor(Number(model?.params.maxReferenceImages) || 1));
    const maxReferences = referenceCapable ? configuredMaxReferences : 0;
    const supportsReferences = referenceCapable;
    // First/last-frame mode inherently consumes two slots; reference mode follows the model limit.
    const referenceLimit = supportsFrames && mode === "frames" ? Math.max(2, configuredMaxReferences) : configuredMaxReferences;
    const validReferences = !references.length || Boolean(referenceCapable && references.length <= referenceLimit && (mode === "frames" ? supportsFrames : supportsImages));
    const showModePicker = outputType === "video" && Boolean(model?.params.supportsFirstLastFrame && model?.params.supportsReferenceImages);
    const showStaticMode = outputType === "video" && Boolean(model?.params.supportsFirstLastFrame) && !model?.params.supportsReferenceImages;
    const unit = outputType === "image" ? "张" : "条";
    const referenceIssue =
        !references.length
            ? ""
            : !supportsReferences
              ? "当前模型不支持参考图片，请先移除已选的参考图"
              : references.length > referenceLimit
                ? `当前模型最多支持 ${referenceLimit} 张参考图，已选 ${references.length} 张，请移除 ${references.length - referenceLimit} 张`
                : outputType === "video" && mode === "frames" && !supportsFrames
                  ? "当前模型不支持首尾帧，请切换为参考图模式"
                  : !validReferences
                    ? "参考图数量或参考模式不符合当前模型，请调整"
                    : "";
    const configIssue =
        modelsStatus !== "ready" || !models.length
            ? ""
            : !model
              ? "请选择模型"
              : !specs.length
                ? "该模型尚未配置有效规格和价格，请联系管理员"
                : !selectedSpec
                  ? "请选择有效规格"
                  : referenceIssue;
    const ready = modelsStatus === "ready" && Boolean(model) && Boolean(selectedSpec);
    const canSubmit = ready && !configIssue && Boolean(prompt.trim()) && !insufficient && !busy;
    const visibleInvalidReason = modelsStatus === "ready" && models.length ? configIssue : "";
    const tooltipHint = canSubmit
        ? "开始生成"
        : referenceIssue
          ? references.length > referenceLimit
              ? `最多 ${referenceLimit} 张参考图`
              : "请调整参考图"
          : configIssue
            ? "请先完善生成参数"
            : modelsStatus === "loading"
              ? "正在加载模型…"
              : modelsStatus === "error"
                ? "模型加载失败，请重试"
                : !models.length
                  ? "暂无可用模型"
                  : !ready
                    ? "请先选择模型与规格"
                    : !prompt.trim()
                      ? "请输入提示词"
                      : insufficient
                        ? "余额不足"
                        : "开始生成";
    const resolutionChoices: ResolutionChoice[] = resolutions.map((value) => {
        const paired = specs.find((spec) => spec.resolution === value && spec.seconds === seconds) ?? specs.find((spec) => spec.resolution === value);
        return { value, label: resolutionLabel(value), detail: paired?.seconds ? `${paired.seconds} 秒` : undefined, credits: paired?.credits };
    });
    const durationChoices: DurationChoice[] = durations.map((value) => {
        const paired = specs.find((spec) => spec.seconds === value && spec.resolution === resolution) ?? specs.find((spec) => spec.seconds === value);
        return { value, label: `${value}s`, detail: paired ? resolutionLabel(paired.resolution) : undefined, credits: paired?.credits };
    });
    const placeholder = outputType === "image"
        ? supportsReferences ? "描述你想生成的画面，可添加图片作为参考…" : "描述你想生成的画面…"
        : supportsReferences ? "描述你想生成的视频画面、镜头与运动，可添加图片作为参考…" : "描述你想生成的视频画面、镜头与运动…";
    const imageCandidates = candidates.filter((node) => node.type === "image" && Boolean(node.fileNo));
    const selectedIds = useMemo(() => new Set(references.map((node) => node.id)), [references]);
    // @ mentions offer every canvas image that can still be attached, plus text
    // nodes (whose content is inserted inline instead of becoming a reference).
    const mentionReferences = useMemo(
        () =>
            buildMentionReferences(candidates, selectedIds, media, {
                images: supportsReferences,
                text: true,
                inactiveImages: references.length < referenceLimit,
            }),
        [candidates, selectedIds, media, supportsReferences, references.length, referenceLimit],
    );

    // Grow with the prompt, but keep the composer compact on the canvas.
    useEffect(() => {
        const element = textareaRef.current;
        if (!element) return;
        element.style.height = "auto";
        element.style.height = `${Math.min(Math.max(element.scrollHeight, 72), 176)}px`;
    }, [prompt]);

    const pickResolution = (value: string) => {
        const next = specs.find((spec) => spec.resolution === value && (outputType === "image" || spec.seconds === seconds)) ?? specs.find((spec) => spec.resolution === value);
        if (!next) return;
        onResolutionChange(next.resolution);
        onSecondsChange(next.seconds ?? seconds);
    };
    const pickDuration = (value: number) => {
        const next = specs.find((spec) => spec.seconds === value && spec.resolution === resolution) ?? specs.find((spec) => spec.seconds === value);
        if (!next) return;
        onResolutionChange(next.resolution);
        onSecondsChange(next.seconds ?? value);
    };
    // Receives the shared mention-reference shape from the textarea component.
    const attachMention = (reference: { nodeId: string; kind: string }) => {
        if (reference.kind === "image" && !selectedIds.has(reference.nodeId)) onToggleReference(reference.nodeId);
    };
    const dropReferences = (nodes: CanvasNode[]) => {
        let nextPrompt = prompt;
        nodes.forEach((node) => {
            if (!selectedIds.has(node.id)) return;
            const label = mentionLabelFor(candidates, node.id);
            if (label) nextPrompt = stripMention(nextPrompt, label);
            onToggleReference(node.id);
        });
        if (nextPrompt !== prompt) onPromptChange(nextPrompt);
    };
    const toggleReference = (node: CanvasNode) => {
        // Detaching a reference also removes its @token so the prompt cannot cite a missing image.
        if (selectedIds.has(node.id)) {
            const label = mentionLabelFor(candidates, node.id);
            if (label) onPromptChange(stripMention(prompt, label));
        }
        onToggleReference(node.id);
    };
    const trimExcessReferences = () => dropReferences(references.slice(referenceLimit));
    const submit = () => {
        if (!canSubmit) return;
        onGenerate();
    };

    return (
        <section data-generation-composer className="rounded-[18px] border border-stone-200 bg-white p-2.5 shadow-2xl dark:border-stone-700/80 dark:bg-stone-900">
            {/* Row 1: output type, reference slots, window actions (Jimeng reference strip). */}
            <div className="flex flex-wrap items-center gap-1.5 px-0.5">
                <div role="group" aria-label="输出类型" className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded-lg bg-stone-100 p-0.5 dark:bg-stone-800">
                    {(["image", "video"] as const).map((type) => {
                        const active = outputType === type;
                        return (
                            <button
                                key={type}
                                type="button"
                                aria-pressed={active}
                                aria-label={type === "image" ? "生成图片" : "生成视频"}
                                disabled={busy}
                                onClick={() => onOutputTypeChange(type)}
                                className={cn(
                                    "h-6 rounded-md px-2.5 text-[11px] font-medium text-stone-500 transition-colors hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-stone-400 dark:hover:text-stone-100",
                                    active && "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white",
                                )}
                            >
                                {type === "image" ? "图片" : "视频"}
                            </button>
                        );
                    })}
                </div>
                {references.map((node, index) => {
                    const badge = outputType === "video" && mode === "frames" ? (index === 0 ? "首帧" : index === 1 ? "尾帧" : null) : null;
                    const exceeds = index >= referenceLimit;
                    return (
                        <div
                            key={node.id}
                            title={exceeds ? `当前模型最多支持 ${referenceLimit} 张参考图` : node.title}
                            className={cn(
                                "relative h-10 w-14 shrink-0 overflow-hidden rounded-lg border bg-stone-100 dark:bg-stone-800",
                                exceeds ? "border-red-400 ring-1 ring-red-400/60 dark:border-red-500" : "border-stone-200 dark:border-stone-700",
                            )}
                        >
                            {media[node.fileNo!] ? <img src={media[node.fileNo!]} alt={`参考图 ${index + 1}`} className="size-full object-cover" /> : null}
                            <button
                                type="button"
                                disabled={busy}
                                aria-label={`移除参考图 ${node.title || index + 1}`}
                                onClick={() => toggleReference(node)}
                                className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-stone-900/80 text-white transition-colors hover:bg-stone-900 disabled:opacity-50"
                            >
                                <X className="size-3" />
                            </button>
                            {exceeds ? (
                                <span className="absolute bottom-0 left-0 right-0 bg-red-600/90 py-0.5 text-center text-[9px] leading-none text-white">超出上限</span>
                            ) : badge ? (
                                <span className="absolute bottom-0 left-0 right-0 bg-stone-900/60 py-0.5 text-center text-[9px] leading-none text-white">{badge}</span>
                            ) : null}
                        </div>
                    );
                })}
                {supportsReferences ? (
                    <Popover
                        trigger="click"
                        placement="topLeft"
                        arrow={false}
                        open={referenceOpen}
                        onOpenChange={setReferenceOpen}
                        content={
                            <div className="w-64">
                                {popoverTitle(`从画布选择（最多 ${referenceLimit} 张，已选 ${references.length} 张）`)}
                                {outputType === "video" && mode === "frames" ? <p className="mb-1 px-1 text-[10px] text-stone-400">第 1 张为首帧，第 2 张为尾帧</p> : null}
                                <div className="thin-scrollbar max-h-56 space-y-0.5 overflow-y-auto">
                                    {imageCandidates.length ? (
                                        imageCandidates.map((node) => {
                                            const selected = selectedIds.has(node.id);
                                            return (
                                                <button
                                                    key={node.id}
                                                    type="button"
                                                    disabled={busy || (!selected && references.length >= referenceLimit)}
                                                    aria-pressed={selected}
                                                    onClick={() => toggleReference(node)}
                                                    className={cn(menuRow, selected && menuRowChosen)}
                                                >
                                                    {media[node.fileNo!] ? <img src={media[node.fileNo!]} alt="" className="size-8 shrink-0 rounded-md object-cover" /> : <span className="size-8 shrink-0 rounded-md bg-stone-200 dark:bg-stone-700" />}
                                                    <span className="min-w-0 flex-1 truncate">{node.title || "图片"}</span>
                                                    {selected ? <Check className="size-3.5 shrink-0" /> : null}
                                                </button>
                                            );
                                        })
                                    ) : (
                                        <p className="px-1 py-2 text-xs text-stone-400">画布暂无可引用图片</p>
                                    )}
                                </div>
                                <div className="mt-1 border-t border-stone-100 pt-1 dark:border-stone-800">
                                    <button type="button" disabled={busy} onClick={() => { setReferenceOpen(false); onOpenLibrary(); }} className={menuRow}>
                                        <FolderOpen className="size-3.5 shrink-0" />
                                        <span className="min-w-0 flex-1 truncate">从素材库添加</span>
                                    </button>
                                </div>
                            </div>
                        }
                    >
                        <button
                            type="button"
                            disabled={busy}
                            aria-label="添加参考"
                            aria-haspopup="dialog"
                            aria-expanded={referenceOpen}
                            title={references.length >= referenceLimit ? "参考图已达上限，仍可从素材库添加图片" : "添加参考图"}
                            className="flex h-10 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-stone-300 text-stone-400 transition-colors hover:border-violet-400 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600 dark:text-stone-500 dark:hover:border-violet-500 dark:hover:text-violet-300"
                        >
                            <Plus className="size-4" />
                            <span className="text-[10px] leading-none">参考</span>
                        </button>
                    </Popover>
                ) : null}
                {selectedTextCount ? (
                    <Chip icon={<Type className="size-3.5 shrink-0 opacity-70" />} ariaLabel="使用所选文本" disabled={busy} onClick={onUseSelected} title="把选中的文本节点填入提示词">
                        使用所选文本 {selectedTextCount}
                    </Chip>
                ) : null}
                <div className="ml-auto flex items-center gap-0.5">
                    {onExpand ? (
                        <Tooltip title="展开编辑">
                            <button type="button" aria-label="展开生成面板" onClick={onExpand} className={iconButton}>
                                <Maximize2 className="size-4" />
                            </button>
                        </Tooltip>
                    ) : null}
                    <Tooltip title="关闭">
                        <button type="button" aria-label="关闭生成面板" onClick={onClose} className={iconButton}>
                            <X className="size-4" />
                        </button>
                    </Tooltip>
                </div>
            </div>

            {/* Row 2: prompt input, deliberately the visual hero of the composer. */}
            <div className="mt-1.5 rounded-xl border border-stone-200 bg-stone-50/80 px-2.5 pb-1.5 pt-2 transition-colors focus-within:border-violet-400 dark:border-stone-700/70 dark:bg-stone-950/40 dark:focus-within:border-violet-500">
                <CanvasResourceMentionTextarea
                    ref={textareaRef}
                    aria-label="画布生成提示词"
                    value={prompt}
                    references={mentionReferences}
                    mentionCandidates={mentionReferences}
                    onMentionSelect={attachMention}
                    onChange={onPromptChange}
                    onSubmit={submit}
                    submitOnPlainEnter={false}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                            event.preventDefault();
                            submit();
                        }
                    }}
                    disabled={busy}
                    maxLength={2000}
                    rows={3}
                    placeholder={placeholder}
                    className="block max-h-[176px] min-h-[64px] w-full resize-none border-0 bg-transparent px-0.5 text-sm leading-6 text-stone-800 outline-none placeholder:text-stone-400 disabled:opacity-50 dark:text-stone-100 dark:placeholder:text-stone-500"
                />
                <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[10px] text-stone-400 dark:text-stone-500">{mentionReferences.length ? "输入 @ 引用画布素材 · Ctrl/⌘ + Enter 生成" : "Ctrl/⌘ + Enter 生成"}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-stone-400 dark:text-stone-500">{prompt.length}/2000</span>
                </div>
            </div>

            {/* Row 3: one flat chip row — model, ratio, resolution, duration, mode, price, generate. */}
            <div className="mt-1.5 flex items-center gap-2 px-0.5">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-0.5 gap-y-1">
                    <ModelPicker models={models} modelId={modelId} outputType={outputType} busy={busy} status={modelsStatus} onSelect={onModelChange} />
                    {outputType === "video" ? (
                        <>
                            {ratios.length ? <RatioPicker ratios={ratios} value={ratio} busy={busy} onChange={onRatioChange} /> : null}
                            {specs.length ? <ResolutionPicker options={resolutionChoices} value={resolution} unit={unit} busy={busy} onChange={pickResolution} /> : null}
                            {durations.length ? <DurationPicker options={durationChoices} value={seconds} unit={unit} busy={busy} onChange={pickDuration} /> : null}
                            {showModePicker ? <ModePicker mode={mode} busy={busy} onChange={onModeChange} /> : null}
                            {showStaticMode ? (
                                <span className="inline-flex h-8 shrink-0 items-center gap-1 px-1.5 text-xs text-stone-500 dark:text-stone-400" title="当前模型仅支持首尾帧参考">
                                    <Film className="size-3.5 shrink-0 opacity-70" />
                                    首尾帧
                                </span>
                            ) : null}
                        </>
                    ) : (
                        <SizePicker specs={specs} value={selectedSpec ? specKey(selectedSpec) : undefined} busy={busy} onChange={(spec) => { onResolutionChange(spec.resolution); onSecondsChange(spec.seconds ?? 0); }} />
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <span className="whitespace-nowrap text-[11px] tabular-nums text-stone-500 dark:text-stone-400">{selectedSpec ? `${formatCredits(estimate)} /${unit}` : "规格待配置"}</span>
                    <Tooltip title={tooltipHint}>
                        <span>
                            <button
                                type="button"
                                aria-label={outputType === "image" ? "开始生成图片" : "开始生成视频"}
                                disabled={!canSubmit}
                                onClick={onGenerate}
                                className="flex size-9 items-center justify-center rounded-full bg-stone-900 text-white shadow-sm transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
                            >
                                {busy ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                            </button>
                        </span>
                    </Tooltip>
                </div>
            </div>

            {modelsStatus === "loading" ? (
                <p role="status" className="mt-2 flex items-center gap-1 px-1 text-[11px] text-stone-400">
                    <LoaderCircle className="size-3 animate-spin" />
                    正在获取{outputType === "image" ? "图片" : "视频"}模型及规格价格…
                </p>
            ) : null}
            {modelsStatus === "error" ? (
                <div role="alert" className="mt-2 px-1 text-[11px] text-red-600">
                    {modelsError || "模型加载失败"}
                    <button type="button" onClick={onRetryModels} className="ml-2 underline">
                        重新加载
                    </button>
                </div>
            ) : null}
            {modelsStatus === "ready" && !models.length ? (
                <div role="status" className="mt-2 px-1 text-[11px] text-stone-500">
                    暂无可用{outputType === "image" ? "图片" : "视频"}模型。
                    <button type="button" onClick={onRetryModels} className="ml-2 underline">
                        刷新模型
                    </button>
                </div>
            ) : null}
            {visibleInvalidReason ? (
                <p role="status" className="mt-2 flex flex-wrap items-center gap-x-1 px-1 text-[11px] text-stone-500 dark:text-stone-400">
                    <span>{visibleInvalidReason}</span>
                    {referenceIssue && references.length > referenceLimit ? (
                        <button type="button" className="underline underline-offset-2 hover:text-stone-700 dark:hover:text-stone-200" onClick={trimExcessReferences}>
                            {referenceLimit > 0 ? `仅保留前 ${referenceLimit} 张` : "移除全部参考图"}
                        </button>
                    ) : null}
                </p>
            ) : null}
            {model && !supportsReferences ? (
                <p className="mt-2 px-1 text-[11px] text-stone-400 dark:text-stone-500">当前模型仅支持文字提示词，不支持参考图片{references.length ? "；请先移除已选的参考图" : ""}。</p>
            ) : null}
            {generating && outputType === "image" ? (
                <p role="status" className="mt-2 px-1 text-[11px] text-violet-600 dark:text-violet-300">
                    正在生成图片，请保持页面打开，完成后自动插入画布…
                </p>
            ) : null}
            {insufficient ? (
                <p className="mt-2 px-1 text-[11px] text-amber-600">
                    可用 {formatCredits(availableCredits)}，余额不足。
                    <button type="button" className="underline" onClick={onRecharge}>
                        充值
                    </button>
                </p>
            ) : null}
            {task ? (
                <div className="mt-2 border-t border-stone-100 px-1 pt-2 dark:border-stone-800">
                    <TaskFeedback task={task} />
                </div>
            ) : null}
        </section>
    );
}
