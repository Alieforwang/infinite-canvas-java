import { useCallback, useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Input, Select, Switch, Tag, Upload } from "antd";
import type { UploadProps } from "antd";
import { Download, Film, LoaderCircle, Plus, RefreshCw, Save, Sparkles, Upload as UploadIcon, X } from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { createAsset } from "@/api/assets";
import { uploadFile } from "@/api/files";
import { getModelRatios, getModelSpecs, listModels, quoteCredits, type VideoModelView } from "@/api/models";
import { createTask, getTask, type VideoTaskView } from "@/api/video-tasks";
import { TaskFeedback } from "@/components/tasks/task-feedback";
import { AddToCanvasModal } from "@/components/works/add-to-canvas-modal";
import { useAuthStore } from "@/stores/use-auth-store";
import { useCurrency } from "@/stores/use-public-settings-store";
import { useVideoTaskStore } from "@/stores/use-video-task-store";
import { cn } from "@/lib/utils";
import { sizeForRatio } from "@/lib/video-size";

type Reference = { fileNo: string; url: string; name: string };
type VideoDraft = {
    modelId?: string;
    prompt: string;
    seconds: number;
    resolution: string;
    ratio: string;
    audio: boolean;
    watermark: boolean;
    mode: "frames" | "reference";
    references: Reference[];
};

const draftKey = (userId: number) => `video-draft:${userId}`;

function readDraft(userId: number): Partial<VideoDraft> {
    try {
        const value: unknown = JSON.parse(sessionStorage.getItem(draftKey(userId)) || "null");
        if (!value || typeof value !== "object") return {};
        const draft = value as Partial<VideoDraft>;
        return {
            modelId: typeof draft.modelId === "string" ? draft.modelId : undefined,
            prompt: typeof draft.prompt === "string" ? draft.prompt : "",
            seconds: typeof draft.seconds === "number" && draft.seconds > 0 ? draft.seconds : 6,
            resolution: typeof draft.resolution === "string" ? draft.resolution : "720p",
            ratio: typeof draft.ratio === "string" ? draft.ratio : "16:9",
            audio: draft.audio === true,
            watermark: draft.watermark === true,
            mode: draft.mode === "reference" ? "reference" : "frames",
            references: Array.isArray(draft.references) ? draft.references.filter((ref) => ref && typeof ref.fileNo === "string" && typeof ref.url === "string" && typeof ref.name === "string") : [],
        };
    } catch {
        return {};
    }
}

const STATUS_META: Record<string, { label: string; color: string }> = {
    queued: { label: "排队中", color: "default" },
    running: { label: "生成中", color: "processing" },
    succeeded: { label: "已完成", color: "success" },
    failed: { label: "失败", color: "error" },
    cancelled: { label: "已取消", color: "default" },
};

export default function VideoPage() {
    const userId = useAuthStore((state) => state.user?.id);
    return userId ? <VideoWorkspace key={userId} userId={userId} /> : null;
}

function VideoWorkspace({ userId }: { userId: number }) {
    const { message } = App.useApp();
    const { formatCredits } = useCurrency();
    const credits = useAuthStore((state) => state.credits);
    const tasks = useVideoTaskStore((state) => state.tasks);
    const track = useVideoTaskStore((state) => state.track);
    const refresh = useVideoTaskStore((state) => state.refresh);
    const cancel = useVideoTaskStore((state) => state.cancel);
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const taskNo = searchParams.get("task");
    const [draft] = useState(() => readDraft(userId));
    const [models, setModels] = useState<VideoModelView[]>([]);
    const [modelId, setModelId] = useState<string | undefined>(draft.modelId);
    const [prompt, setPrompt] = useState(draft.prompt ?? "");
    const [seconds, setSeconds] = useState(draft.seconds ?? 6);
    const [resolution, setResolution] = useState(draft.resolution ?? "720p");
    const [ratio, setRatio] = useState(draft.ratio ?? "16:9");
    const [audio, setAudio] = useState(draft.audio ?? false);
    const [watermark, setWatermark] = useState(draft.watermark ?? false);
    const [mode, setMode] = useState<"frames" | "reference">(draft.mode ?? "frames");
    const [references, setReferences] = useState<Reference[]>(draft.references ?? []);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [current, setCurrent] = useState<VideoTaskView | null>(null);
    const [creating, setCreating] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [saving, setSaving] = useState(false);
    const [canvasOpen, setCanvasOpen] = useState(false);
    const history = useMemo(() => Object.values(tasks).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")), [tasks]);

    const model = useMemo(() => models.find((item) => item.id === modelId), [modelId, models]);
    const estimate = useMemo(() => (model ? quoteCredits(model, seconds, resolution, audio) : 0), [audio, model, resolution, seconds]);
    const running = current ? ["queued", "running"].includes(current.status) : false;

    const persistDraft = useCallback(() => {
        try {
            sessionStorage.setItem(draftKey(userId), JSON.stringify({ modelId, prompt, seconds, resolution, ratio, audio, watermark, mode, references } satisfies VideoDraft));
        } catch {
            // The editor remains usable when browser storage is unavailable.
        }
    }, [userId, modelId, prompt, seconds, resolution, ratio, audio, watermark, mode, references]);

    useEffect(() => {
        persistDraft();
    }, [persistDraft]);

    useEffect(() => {
        let active = true;
        void (async () => {
            try {
                const list = await listModels();
                if (!active) return;
                setModels(list);
                const selected = list.find((item) => item.id === draft.modelId) ?? list[0];
                if (selected) {
                    setModelId(selected.id);
                    setSeconds((value) => selected.params.seconds.includes(String(value)) ? value : Number(selected.params.seconds[0] ?? 6));
                    setResolution((value) => selected.params.resolutions.includes(value) ? value : selected.params.resolutions[0] ?? "720p");
                    setRatio((value) => {
                        const ratios = getModelRatios(selected);
                        return ratios.includes(value) ? value : ratios[0] ?? "16:9";
                    });
                    if (!selected.params.supportsAudio) setAudio(false);
                    if (!selected.params.supportsWatermark) setWatermark(false);
                }
            } catch (error) {
                if (active) message.error(error instanceof Error ? error.message : "模型加载失败");
            }
        })();
        return () => { active = false; };
    }, [draft.modelId, message]);

    const loadHistory = useCallback(async () => {
        setHistoryLoading(true);
        try {
            await refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "历史记录加载失败");
        } finally {
            setHistoryLoading(false);
        }
    }, [message, refresh]);

    useEffect(() => {
        void loadHistory();
    }, [loadHistory]);

    const currentTaskNo = current?.taskNo;
    useEffect(() => {
        if (currentTaskNo && tasks[currentTaskNo]) setCurrent(tasks[currentTaskNo]);
    }, [currentTaskNo, tasks]);

    useEffect(() => {
        if (!taskNo) return;
        let active = true;
        const cached = useVideoTaskStore.getState().tasks[taskNo];
        setCurrent(cached ?? null);
        setCanvasOpen(false);
        if (cached) return;
        void getTask(taskNo).then((task) => {
            if (!active) return;
            track(task);
            setCurrent(task);
        }).catch((error: unknown) => {
            if (active) message.error(error instanceof Error ? error.message : "任务加载失败");
        });
        return () => { active = false; };
    }, [taskNo, track, message]);

    const selectModel = (id: string) => {
        setModelId(id);
        const selected = models.find((item) => item.id === id);
        if (!selected) return;
        setSeconds(Number(selected.params.seconds[0] ?? 6));
        setResolution(selected.params.resolutions[0] ?? "720p");
        setRatio(getModelRatios(selected)[0] ?? "16:9");
        setAudio(false);
        setWatermark(false);
    };

    const accountUrl = `/account?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
    const goToAccount = () => {
        persistDraft();
        navigate(accountUrl);
    };

    const pickReference: UploadProps["beforeUpload"] = async (file) => {
        if (!model) {
            return false;
        }
        if (references.length >= (model.params.maxReferenceImages || 1)) {
            message.warning(`该模型最多 ${model.params.maxReferenceImages} 张参考图`);
            return false;
        }
        try {
            const uploaded = await uploadFile(file as File);
            setReferences((items) => [...items, { fileNo: uploaded.fileNo, url: uploaded.url, name: (file as File).name }]);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "上传失败");
        }
        return false;
    };

    const generate = async () => {
        if (!model) {
            message.error("请先选择模型");
            return;
        }
        if (!prompt.trim()) {
            message.error("请输入提示词");
            return;
        }
        if (estimate > credits.available) {
            message.error(`余额不足：本次需要 ${formatCredits(estimate)}，当前可用 ${formatCredits(credits.available)}`);
            return;
        }
        persistDraft();
        setCreating(true);
        try {
            const created = await createTask({
                modelKey: model.id,
                prompt: prompt.trim(),
                seconds,
                resolution,
                size: sizeForRatio(ratio, resolution),
                ratio,
                generateAudio: audio,
                watermark,
                mode,
                referenceFileNos: references.map((item) => item.fileNo),
            });
            if (useAuthStore.getState().user?.id !== userId) return;
            const placeholder: VideoTaskView = {
                taskNo: created.taskNo,
                status: "queued",
                progress: 0,
                modelName: model.displayName,
                prompt: prompt.trim(),
                params: { modelId: model.id, seconds, resolution, size: sizeForRatio(ratio, resolution), ratio, generateAudio: audio, watermark, mode },
                referenceFileNos: references.map((item) => item.fileNo),
                heldCredits: created.heldCredits,
                settledCredits: 0,
                createdAt: new Date().toISOString(),
            };
            track(placeholder);
            setCurrent(placeholder);
            setSearchParams((params) => {
                params.set("task", placeholder.taskNo);
                return params;
            }, { replace: true });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "创建任务失败");
        } finally {
            setCreating(false);
        }
    };

    const onCancel = async () => {
        if (!current) {
            return;
        }
        setCancelling(true);
        try {
            await cancel(current.taskNo);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "取消失败");
        } finally {
            setCancelling(false);
        }
    };

    const onSaveAsset = async () => {
        if (!current?.file) {
            return;
        }
        setSaving(true);
        try {
            await createAsset({
                kind: "video",
                title: current.prompt.slice(0, 40) || "视频作品",
                fileNo: current.file.fileNo,
                source: "VIDEO_PAGE",
                tags: current.modelName ? [current.modelName] : [],
                metadata: { taskNo: current.taskNo },
            });
            message.success("已保存到我的资产");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    const openHistory = (selectedTaskNo: string) => {
        const task = tasks[selectedTaskNo];
        if (task) setCurrent(task);
        setCanvasOpen(false);
        setSearchParams((params) => {
            params.set("task", selectedTaskNo);
            return params;
        });
    };

    return (
        <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[280px_minmax(0,1fr)] lg:overflow-hidden">
            <aside className="hidden min-h-0 flex-col rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900 lg:flex">
                <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-stone-800 dark:text-stone-100">生成记录</span>
                    <Button size="small" type="text" icon={<RefreshCw className={cn("size-4", historyLoading && "animate-spin")} />} onClick={() => void loadHistory()} />
                </div>
                <div className="thin-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto">
                    {history.length === 0 && !historyLoading ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有生成记录" />
                    ) : (
                        history.map((task) => (
                            <button
                                key={task.taskNo}
                                type="button"
                                onClick={() => void openHistory(task.taskNo)}
                                className={cn(
                                    "w-full rounded-lg border p-2 text-left transition",
                                    current?.taskNo === task.taskNo
                                        ? "border-stone-900 bg-stone-50 dark:border-stone-100 dark:bg-stone-800"
                                        : "border-stone-200 hover:border-stone-400 dark:border-stone-800",
                                )}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <Tag color={STATUS_META[task.status]?.color} className="!mr-0">
                                        {STATUS_META[task.status]?.label ?? task.status}
                                    </Tag>
                                    <span className="truncate text-[11px] text-stone-400">{task.modelName}</span>
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs text-stone-600 dark:text-stone-300">{task.prompt || "（无提示词）"}</p>
                                <p className="mt-1 text-[11px] text-stone-400">{task.createdAt?.replace("T", " ").slice(0, 19)}</p>
                            </button>
                        ))
                    )}
                </div>
            </aside>

            <section className="grid gap-3 lg:min-h-0 lg:overflow-hidden xl:grid-cols-[400px_minmax(0,1fr)]">
                <div className="thin-scrollbar flex flex-col gap-4 rounded-lg border border-stone-200 bg-white p-4 lg:min-h-0 lg:overflow-y-auto dark:border-stone-800 dark:bg-stone-900">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-xl font-semibold text-stone-950 dark:text-stone-100">视频创作台</h1>
                            <p className="mt-1 text-xs text-stone-500">选择模型，输入提示词，生成你的视频</p>
                        </div>
                        <Sparkles className="size-5 text-stone-300" />
                    </div>

                    <div className="lg:hidden">
                        <Select
                            className="w-full"
                            placeholder="查看生成记录"
                            value={current?.taskNo}
                            loading={historyLoading}
                            options={history.map((task) => ({ value: task.taskNo, label: `${STATUS_META[task.status]?.label ?? task.status} · ${task.prompt || task.taskNo}` }))}
                            onChange={openHistory}
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-stone-500">模型</label>
                        <Select
                            className="w-full"
                            value={modelId}
                            placeholder="选择模型"
                            options={models.map((item) => ({
                                value: item.id,
                                label: `${item.displayName} · ${getModelSpecs(item).length ? `${formatCredits(Math.min(...getModelSpecs(item).map((spec) => spec.credits)))} /条起` : "规格待配置"}`,
                            }))}
                            onChange={selectModel}
                            notFoundContent="暂无可用模型，请联系管理员"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium text-stone-500">提示词</label>
                        <Input.TextArea
                            value={prompt}
                            onChange={(event) => setPrompt(event.target.value)}
                            placeholder="描述你想要的画面、镜头、光线与运动…"
                            autoSize={{ minRows: 4, maxRows: 8 }}
                            maxLength={2000}
                            showCount
                        />
                    </div>

                    <div>
                        <div className="mb-1 flex items-center justify-between text-xs font-medium text-stone-500">
                            <span>参考图</span>
                            <span>
                                {references.length}/{model?.params.maxReferenceImages ?? 1}
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {references.map((item) => (
                                <div key={item.fileNo} className="group relative size-16 overflow-hidden rounded-lg border border-stone-200 dark:border-stone-700">
                                    <img src={item.url} alt={item.name} className="size-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => setReferences((items) => items.filter((ref) => ref.fileNo !== item.fileNo))}
                                        className="absolute right-1 top-1 hidden rounded-full bg-black/60 p-0.5 text-white group-hover:block"
                                    >
                                        <X className="size-3" />
                                    </button>
                                </div>
                            ))}
                            {references.length < (model?.params.maxReferenceImages ?? 1) ? (
                                <Upload showUploadList={false} accept="image/jpeg,image/png,image/webp" beforeUpload={pickReference}>
                                    <button
                                        type="button"
                                        className="flex size-16 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-stone-300 text-stone-400 transition hover:border-stone-500 hover:text-stone-600 dark:border-stone-700"
                                    >
                                        <UploadIcon className="size-4" />
                                        <span className="text-[10px]">上传</span>
                                    </button>
                                </Upload>
                            ) : null}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-stone-500">时长</label>
                            <Select
                                className="w-full"
                                value={seconds}
                                options={(model?.params.seconds ?? ["4", "6", "8"]).map((value) => ({ value: Number(value), label: `${value} 秒` }))}
                                onChange={(value) => setSeconds(value)}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-stone-500">分辨率</label>
                            <Select
                                className="w-full"
                                value={resolution}
                                options={(model?.params.resolutions ?? ["480p", "720p", "1080p"]).map((value) => ({ value, label: value }))}
                                onChange={(value) => setResolution(value)}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-stone-500">比例</label>
                            <Select
                                className="w-full"
                                value={ratio}
                                options={(model ? getModelRatios(model) : ["16:9"]).map((value) => ({ value, label: value }))}
                                onChange={(value) => setRatio(value)}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-stone-500">模式</label>
                            <Select
                                className="w-full"
                                value={mode}
                                options={[
                                    { value: "frames", label: "首尾帧" },
                                    { value: "reference", label: "参考图" },
                                ]}
                                onChange={(value) => setMode(value as "frames" | "reference")}
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-6">
                        <label className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300">
                            <Switch size="small" checked={audio} onChange={setAudio} disabled={!model?.params.supportsAudio} />
                            生成声音
                        </label>
                        <label className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300">
                            <Switch size="small" checked={watermark} onChange={setWatermark} disabled={!model?.params.supportsWatermark} />
                            水印
                        </label>
                    </div>

                    <div className="rounded-lg bg-stone-50 p-3 text-xs text-stone-600 dark:bg-stone-800/60 dark:text-stone-300">
                        <div className="flex items-center justify-between">
                            <span>预估消耗</span>
                            <span className="font-semibold text-stone-900 dark:text-stone-100">{formatCredits(estimate)}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                            <span>可用余额</span>
                            <span>{formatCredits(credits.available)}</span>
                        </div>
                        {estimate > credits.available ? (
                            <div className="mt-3 border-t border-stone-200 pt-2 dark:border-stone-700">
                                <p className="text-amber-700 dark:text-amber-400">还差 {formatCredits(estimate - credits.available)}，草稿已为当前账户保留。</p>
                                <Button size="small" className="mt-2" onClick={goToAccount}>去账户充值</Button>
                            </div>
                        ) : null}
                    </div>

                    <Button
                        type="primary"
                        size="large"
                        block
                        loading={creating}
                        disabled={running}
                        onClick={() => void generate()}
                        icon={<Sparkles className="size-4" />}
                    >
                        {running ? "生成中…" : "开始生成"}
                    </Button>
                </div>

                <div className="flex min-h-[360px] flex-col rounded-lg border border-stone-200 bg-white p-4 lg:min-h-0 dark:border-stone-800 dark:bg-stone-900">
                    {!current ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-stone-400">
                            <Film className="size-10" />
                            <p className="text-sm">生成结果会显示在这里</p>
                        </div>
                    ) : (
                        <div className="flex min-h-0 flex-1 flex-col gap-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-xs text-stone-400">{current.taskNo}</span>
                                {running ? (
                                    <Button size="small" danger loading={cancelling} onClick={() => void onCancel()}>
                                        取消任务
                                    </Button>
                                ) : null}
                            </div>
                            <TaskFeedback task={current} />

                            {running ? (
                                <div className="flex flex-1 flex-col items-center justify-center gap-4">
                                    <p className="flex items-center gap-2 text-sm text-stone-500">
                                        <LoaderCircle className="size-4 animate-spin" />
                                        {current.status === "queued" ? "排队中…" : "正在生成视频…"}
                                    </p>
                                    <p className="max-w-md text-center text-xs text-stone-400">{current.prompt}</p>
                                </div>
                            ) : current.status === "succeeded" && current.file ? (
                                <div className="flex min-h-0 flex-1 flex-col gap-3">
                                    <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-black">
                                        <video src={current.file.url} controls className="max-h-full max-w-full" />
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <a href={current.file.url} download>
                                            <Button icon={<Download className="size-4" />}>下载视频</Button>
                                        </a>
                                        <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCanvasOpen(true)}>
                                            加入画布
                                        </Button>
                                        <Button icon={<Save className="size-4" />} loading={saving} onClick={() => void onSaveAsset()}>
                                            另存到我的资产
                                        </Button>
                                        <span className="ml-auto text-xs text-stone-400">
                                            {current.file.bytes ? `${(current.file.bytes / 1024 / 1024).toFixed(1)} MB` : ""}
                                        </span>
                                    </div>
                                    <p className="text-xs text-stone-500">生成作品已可在 <Link to="/assets?tab=works" className="underline">作品库</Link> 找回，也可加入画布继续创作。</p>
                                    <p className="text-xs text-stone-500">{current.prompt}</p>
                                </div>
                            ) : (
                                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                                    <p className="max-w-md text-sm text-stone-600 dark:text-stone-300">
                                        {current.status === "cancelled" ? "任务已取消，可使用当前草稿继续创作。" : current.status === "succeeded" ? "视频文件暂不可用，请刷新任务记录。" : "可调整当前草稿后重新生成。"}
                                    </p>
                                    <Button icon={<Sparkles className="size-4" />} loading={creating} onClick={() => void generate()}>
                                        重新生成
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </section>
            <AddToCanvasModal
                open={canvasOpen}
                onClose={() => setCanvasOpen(false)}
                items={current?.status === "succeeded" && current.file ? [{ kind: "video", title: current.prompt.slice(0, 40) || "视频作品", fileNo: current.file.fileNo, taskNo: current.taskNo }] : []}
            />
        </div>
    );
}
