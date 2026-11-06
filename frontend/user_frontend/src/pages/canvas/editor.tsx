import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { App, Button, Input, Modal, Tooltip } from "antd";
import { ArrowLeft, Copy, FolderOpen, Image as ImageIcon, Keyboard, LoaderCircle, PanelLeft, Pencil, Plus, Redo2, Sparkles, Trash2, Undo2, Video } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { getProject, updateProject, type CanvasDocument, type CanvasNode } from "@/api/canvas";
import { signedUrlOf, uploadFile } from "@/api/files";
import { getModelSpecs, listModels, quoteCredits, type VideoModelView } from "@/api/models";
import { createImageTask, getImageTask } from "@/api/image-tasks";
import { createTask, getTask, type VideoTaskView } from "@/api/video-tasks";
import { useAuthStore } from "@/stores/use-auth-store";
import { useVideoTaskStore } from "@/stores/use-video-task-store";
import { AssetPickerModal } from "@/components/works/asset-picker-modal";
import { transferItemsToNodes, type CanvasTransferItem } from "@/lib/canvas-transfer";
import { isTaskActive } from "@/lib/video-task-state";
import { cn } from "@/lib/utils";
import { CanvasWorkbenchSidebar } from "@/components/canvas/workbench-sidebar";
import { CanvasWorkbenchNavigation } from "@/components/canvas/workbench-navigation";
import { CanvasCreationMenu, CanvasCreationRail, CanvasWorkbenchTools } from "@/components/canvas/workbench-tools";
import { CanvasGenerationComposer } from "@/components/canvas/generation-composer";
import { cloneNodes, fitViewport, getNodesBounds, selectIntersectingNodes, type Rect } from "@/lib/canvas-editing";
import { createDocumentHistory, commitDocumentHistory, undoDocumentHistory, redoDocumentHistory } from "@/lib/canvas-document-history";
import { appendCanvasLink, cloneCanvasLinks, getCanvasLinks, isCanvasLink, pruneCanvasLinks } from "@/lib/canvas-links";
import { EditorConnections, type ConnectionDraft } from "@/components/canvas/editor-connections";

const NODE_SIZE = {
    text: { width: 280, height: 150 },
    image: { width: 320, height: 240 },
    video: { width: 360, height: 220 },
};
export default function CanvasEditorPage() {
    const { projectNo } = useParams<{ projectNo: string }>();
    const userId = useAuthStore((state) => state.user?.id);
    return <CanvasEditor key={`${userId}:${projectNo}`} projectNo={projectNo} />;
}

function CanvasEditor({ projectNo }: { projectNo?: string }) {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const requestedTaskNo = searchParams.get("task");
    const userId = useAuthStore((state) => state.user?.id);
    const credits = useAuthStore((state) => state.credits);
    const tasks = useVideoTaskStore((state) => state.tasks);
    const origins = useVideoTaskStore((state) => state.origins);
    const track = useVideoTaskStore((state) => state.track);
    const markInserted = useVideoTaskStore((state) => state.markInserted);
    const [pickerOpen, setPickerOpen] = useState(false);
    const pickingForGeneration = useRef(false);
    const [creationMenu, setCreationMenu] = useState<{ x: number; y: number; world: { x: number; y: number } } | null>(null);
    const uploadTargetRef = useRef<{ nodeId?: string; point: { x: number; y: number } } | null>(null);
    const [uploadingIds, setUploadingIds] = useState<string[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [canvasTool, setCanvasTool] = useState<"pan" | "select">("pan");
    const [spacePan, setSpacePan] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [size, setSize] = useState({ width: 1200, height: 800 });
    const [marquee, setMarquee] = useState<Rect | null>(null);
    const [historyVersion, setHistoryVersion] = useState(0);
    const [nodeGenOpen, setNodeGenOpen] = useState(false);
    const [generationSourceIds, setGenerationSourceIds] = useState<string[]>([]);
    const [generationAnchorIds, setGenerationAnchorIds] = useState<string[]>([]);
    const [referenceMode, setReferenceMode] = useState<"frames" | "reference">("frames");
    const [nodePanelHeight, setNodePanelHeight] = useState(300);
    const nodePanelRef = useRef<HTMLElement>(null);
    const clipboardRef = useRef<{ nodes: CanvasNode[]; connections: unknown[] }>({ nodes: [], connections: [] });
    const historyRef = useRef(createDocumentHistory());
    const connectionsRef = useRef<unknown[]>([]);
    const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
    const selectedConnectionRef = useRef<string | null>(null);
    const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);
    const connectionDraftRef = useRef<ConnectionDraft | null>(null);
    const selectedRef = useRef<string[]>([]);
    const marqueeRef = useRef<{ start: { x: number; y: number }; original: string[]; additive: boolean } | null>(null);

    const [title, setTitle] = useState("");
    const [nodes, setNodes] = useState<CanvasNode[]>([]);
    const [connections, setConnections] = useState<unknown[]>([]);
    const [viewport, setViewport] = useState({ x: 0, y: 0, k: 1 });
    const [selected, setSelected] = useState<string[]>([]);
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [media, setMedia] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [loaded, setLoaded] = useState(false);
    const [editingText, setEditingText] = useState<CanvasNode | null>(null);
    const [textDraft, setTextDraft] = useState("");
    const [outputType, setOutputType] = useState<"image" | "video">("video");
    const [modelsStatus, setModelsStatus] = useState<"loading" | "ready" | "error">("loading");
    const [modelsError, setModelsError] = useState("");
    const [modelsRetry, setModelsRetry] = useState(0);
    const imageRequestRef = useRef<{ payload: string; key: string } | null>(null);
    const [models, setModels] = useState<VideoModelView[]>([]);
    const [genOpen, setGenOpen] = useState(false);
    const [modelId, setModelId] = useState<string | undefined>();
    const [prompt, setPrompt] = useState("");
    const [seconds, setSeconds] = useState(6);
    const [resolution, setResolution] = useState("720p");
    const [ratio, setRatio] = useState("16:9");
    const [genTaskNo, setGenTaskNo] = useState<string | null>(null);
    const genTask = genTaskNo ? tasks[genTaskNo] : undefined;
    const [generating, setGenerating] = useState(false);
    const [draftReady, setDraftReady] = useState(false);
    const draftKey = `ic_canvas_draft:${useAuthStore.getState().user?.id}:${projectNo}`;
    const insertedThisVisit = useRef(new Set<string>());

    const containerRef = useRef<HTMLDivElement>(null);
    const versionRef = useRef(1);
    const loadedRef = useRef(false);
    const saveTimerRef = useRef<number | null>(null);
    const saveQueueRef = useRef(Promise.resolve());
    const saveRevisionRef = useRef(0);
    const nodesRef = useRef<CanvasNode[]>([]);
    const viewportRef = useRef(viewport);
    const titleRef = useRef("");
    const imageInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const panRef = useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });
    const dragRef = useRef<{ startX: number; startY: number; origins: CanvasNode[]; pointerId: number } | null>(null);

    nodesRef.current = nodes;
    connectionsRef.current = connections;
    selectedConnectionRef.current = selectedConnection;
    viewportRef.current = viewport;
    titleRef.current = title;
    selectedRef.current = selected;
    useEffect(() => {
        if (selected.length) setSelectedConnection(null);
    }, [selected]);

    const changeDocument = (nextNodes: CanvasNode[], nextConnections: unknown[], record = true) => {
        if (record && dragRef.current) {
            historyRef.current = commitDocumentHistory(historyRef.current, nodesRef.current, connectionsRef.current);
            dragRef.current = null;
        }
        nodesRef.current = nextNodes;
        connectionsRef.current = nextConnections;
        setNodes(nextNodes);
        setConnections(nextConnections);
        if (record) {
            historyRef.current = commitDocumentHistory(historyRef.current, nextNodes, nextConnections);
            setHistoryVersion((value) => value + 1);
        }
    };
    const changeNodes = (update: CanvasNode[] | ((current: CanvasNode[]) => CanvasNode[]), record = true) => {
        const next = typeof update === "function" ? update(nodesRef.current) : update;
        changeDocument(next, pruneCanvasLinks(connectionsRef.current, next), record);
    };
    const changeConnections = (next: unknown[]) => changeDocument(nodesRef.current, next);
    const travelHistory = (direction: "undo" | "redo") => {
        if (dragRef.current || marqueeRef.current || connectionDraftRef.current) return;
        const next = direction === "undo" ? undoDocumentHistory(historyRef.current) : redoDocumentHistory(historyRef.current);
        if (next === historyRef.current) return;
        historyRef.current = next;
        changeDocument(next.present.nodes, next.present.connections, false);
        setSelected((ids) => ids.filter((id) => next.present.nodes.some((node) => node.id === id)));
        setSelectedConnection(null);
        setHistoryVersion((value) => value + 1);
    };

    const model = models.find((item) => item.id === modelId);
    const selectedNodes = nodes.filter((node) => selected.includes(node.id));
    const generationNodes = generationSourceIds.map((id) => nodes.find((node) => node.id === id)).filter((node): node is CanvasNode => Boolean(node));
    const selectedText = generationNodes
        .filter((node) => node.type === "text")
        .map((node) => node.content || "")
        .filter(Boolean);
    const selectedImages = generationNodes.filter((node) => node.type === "image" && node.fileNo);

    const resolveMedia = async (node: CanvasNode) => {
        if (!node.fileNo || media[node.fileNo]) {
            return;
        }
        try {
            const url = await signedUrlOf(node.fileNo);
            setMedia((current) => ({ ...current, [node.fileNo!]: url }));
        } catch {
            // ignore: node shows placeholder
        }
    };

    useEffect(() => {
        void (async () => {
            if (!projectNo) return;
            try {
                const project = await getProject(projectNo);
                setTitle(project.title);
                nodesRef.current = project.document.nodes || [];
                setNodes(nodesRef.current);
                connectionsRef.current = project.document.connections || [];
                setConnections(connectionsRef.current);
                historyRef.current = createDocumentHistory(nodesRef.current, connectionsRef.current);
                setHistoryVersion((value) => value + 1);
                setViewport(project.document.viewport || { x: 0, y: 0, k: 1 });
                versionRef.current = project.version;
                (project.document.nodes || []).forEach((node) => void resolveMedia(node));
                try {
                    const pendingRequest = JSON.parse(sessionStorage.getItem(`${draftKey}:image-request`) || "null");
                    if (pendingRequest && typeof pendingRequest.payload === "string" && typeof pendingRequest.key === "string") imageRequestRef.current = pendingRequest;
                    const draft = JSON.parse(sessionStorage.getItem(draftKey) || "null");
                    if (draft) {
                        setOutputType(draft.outputType === "image" ? "image" : "video");
                        if (typeof draft.modelId === "string") setModelId(draft.modelId);
                        if (Number.isFinite(draft.seconds)) setSeconds(draft.seconds);
                        if (typeof draft.resolution === "string") setResolution(draft.resolution);
                        if (typeof draft.ratio === "string") setRatio(draft.ratio);
                        setReferenceMode(draft.mode === "frames" ? "frames" : "reference");
                        if (Array.isArray(draft.anchors ?? draft.sources)) setGenerationAnchorIds(draft.anchors ?? draft.sources);
                        if (typeof draft.prompt === "string") setPrompt(draft.prompt);
                        if (Array.isArray(draft.selected)) setSelected(draft.selected.filter((id: unknown) => typeof id === "string"));
                        if (Array.isArray(draft.sources ?? draft.selected)) setGenerationSourceIds((draft.sources ?? draft.selected).filter((id: unknown) => typeof id === "string"));
                        if (typeof draft.taskNo === "string") setGenTaskNo(draft.taskNo);
                        setGenOpen(Boolean(requestedTaskNo) || draft.open === true);
                        setNodeGenOpen(!requestedTaskNo && draft.nodeOpen === true);
                    }
                } catch {
                    /* Invalid or unavailable session storage does not block editing. */
                }
                setDraftReady(true);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "画布加载失败");
                navigate("/canvas");
            } finally {
                loadedRef.current = true;
                setLoaded(true);
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectNo]);

    useEffect(() => {
        if (!draftReady) return;
        let cancelled = false;
        setModelsStatus("loading");
        setModelsError("");
        setModels([]);
        void listModels(outputType)
            .then((list) => {
                if (cancelled) return;
                const matching = list.filter((item) => item.capability === outputType);
                setModels(matching);
                setModelId((current) => (matching.some((item) => item.id === current) ? current : matching[0]?.id));
                setModelsStatus("ready");
            })
            .catch((error) => {
                if (cancelled) return;
                setModelsError(error instanceof Error ? error.message : "模型加载失败");
                setModelsStatus("error");
            });
        return () => {
            cancelled = true;
        };
    }, [draftReady, outputType, modelsRetry]);

    useEffect(() => {
        if (!model) return;
        const specs = getModelSpecs(model);
        const spec = specs.find((item) => item.resolution === resolution && (outputType === "image" || item.seconds === seconds)) ?? specs.find((item) => item.resolution === resolution) ?? specs[0];
        if (spec) {
            setResolution(spec.resolution);
            setSeconds(spec.seconds ?? 0);
        }
        setRatio((current) => (model.params.ratios.includes(current) ? current : (model.params.ratios[0] ?? "1:1")));
        setReferenceMode((current) => (outputType === "image" ? "reference" : current === "reference" && model.params.supportsReferenceImages ? "reference" : model.params.supportsFirstLastFrame ? "frames" : "reference"));
    }, [model, outputType, resolution, seconds]);

    useEffect(() => {
        if (!loadedRef.current || !projectNo) return;
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        const revision = ++saveRevisionRef.current;
        saveTimerRef.current = window.setTimeout(() => {
            const document: CanvasDocument = {
                nodes: nodesRef.current,
                connections,
                viewport: viewportRef.current,
                backgroundMode: "dots",
            };
            const savedTitle = titleRef.current;
            saveQueueRef.current = saveQueueRef.current.then(async () => {
                if (useAuthStore.getState().user?.id !== userId) return;
                setStatus("saving");
                try {
                    const updated = await updateProject(projectNo, versionRef.current, savedTitle, document);
                    versionRef.current = updated.version;
                    if (saveRevisionRef.current === revision) setStatus("saved");
                    if (useAuthStore.getState().user?.id === userId) {
                        markInserted(document.nodes.filter((node) => node.id.startsWith("task-")).map((node) => node.id.slice(5)));
                    }
                } catch {
                    setStatus("error");
                }
            });
        }, 900);
        return () => {
            if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes, viewport, title, connections, projectNo, loaded]);

    useEffect(() => {
        if (!nodeGenOpen || !nodePanelRef.current) return;
        const observer = new ResizeObserver(([entry]) => setNodePanelHeight(entry.target.getBoundingClientRect().height));
        observer.observe(nodePanelRef.current);
        return () => observer.disconnect();
    }, [nodeGenOpen]);

    useEffect(() => {
        if (!draftReady) return;
        try {
            sessionStorage.setItem(
                draftKey,
                JSON.stringify({ taskNo: genTaskNo, outputType, modelId, prompt, seconds, resolution, ratio, mode: referenceMode, selected, sources: generationSourceIds, anchors: generationAnchorIds, open: genOpen, nodeOpen: nodeGenOpen }),
            );
        } catch {
            /* Keep the current draft in memory. */
        }
    }, [draftReady, draftKey, genTaskNo, outputType, modelId, prompt, seconds, resolution, ratio, referenceMode, selected, generationSourceIds, generationAnchorIds, genOpen, nodeGenOpen]);

    useEffect(() => {
        if (!draftReady || !requestedTaskNo) return;
        setOutputType(requestedTaskNo.startsWith("img_") ? "image" : "video");
        setGenTaskNo(requestedTaskNo);
        setGenOpen(true);
        setNodeGenOpen(false);
    }, [draftReady, requestedTaskNo]);

    useEffect(() => {
        if (!draftReady) return;
        const taskNo = genTaskNo;
        if (!taskNo) return;
        if (useVideoTaskStore.getState().tasks[taskNo]) {
            setGenTaskNo(taskNo);
            return;
        }
        let cancelled = false;
        void (taskNo.startsWith("img_") ? getImageTask(taskNo) : getTask(taskNo))
            .then((task) => {
                if (cancelled) return;
                track(task);
                setGenTaskNo(task.taskNo);
            })
            .catch((error) => {
                if (!cancelled) message.error(error instanceof Error ? error.message : "任务读取失败");
            });
        return () => {
            cancelled = true;
        };
    }, [draftReady, requestedTaskNo, genTaskNo, track, message]);

    useEffect(() => {
        if (!genTask || !genTask.taskNo.startsWith("img_") || isTaskActive(genTask)) return;
        imageRequestRef.current = null;
        try {
            sessionStorage.removeItem(`${draftKey}:image-request`);
        } catch {
            /* Draft persistence is optional. */
        }
    }, [genTask, draftKey]);

    useEffect(() => {
        if (!loaded || !projectNo) return;
        const completed = Object.values(tasks).filter((task) => task.status === "succeeded" && task.file && origins[task.taskNo]?.projectNo === projectNo && !origins[task.taskNo]?.resultInserted && !insertedThisVisit.current.has(task.taskNo));
        if (!completed.length) return;
        const existing = new Set(nodesRef.current.map((node) => node.id));
        completed.forEach((task) => insertedThisVisit.current.add(task.taskNo));
        const center = worldCenter();
        const additions = transferItemsToNodes(
            completed.map((task) => ({
                kind: task.params.capability === "image" ? "image" : "video",
                title: task.prompt.slice(0, 40),
                fileNo: task.file!.fileNo,
                taskNo: task.taskNo,
            })),
            { x: Math.round(center.x - 160), y: Math.round(center.y - 120) },
        ).filter((node) => !existing.has(node.id));
        additions.forEach((node) => void resolveMedia(node));
        if (additions.length) {
            changeNodes((current) => [...current, ...additions.filter((node) => !current.some((existingNode) => existingNode.id === node.id))]);
            setSelected(additions.map((node) => node.id));
            message.success(`${additions.length} 个生成结果已插入画布`);
        }
        // Only task snapshots trigger insertion; deleting a node is an intentional edit.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tasks, origins, loaded, projectNo, markInserted, message]);

    const insertWorks = (items: CanvasTransferItem[]) => {
        const center = worldCenter();
        const incoming = transferItemsToNodes(items, { x: Math.round(center.x - 160), y: Math.round(center.y - 120) });
        const existing = new Set(nodesRef.current.map((node) => node.id));
        const fresh = incoming.filter((node) => !existing.has(node.id));
        if (pickingForGeneration.current) {
            pickingForGeneration.current = false;
            const images = incoming.filter((node) => node.type === "image" && node.fileNo);
            setGenerationSourceIds((ids) => [...new Set([...ids, ...images.map((node) => node.id)])]);
            if (!images.length) message.info("视频生成使用图片作为参考，请选择图片素材");
        }
        if (!fresh.length) return message.info("所选作品已在画布中");
        changeNodes((current) => [...current, ...fresh]);
        setSelected(fresh.map((node) => node.id));
        fresh.forEach((node) => void resolveMedia(node));
        message.success(`已添加 ${fresh.length} 项到画布`);
    };

    const worldCenter = () => {
        const rect = containerRef.current?.getBoundingClientRect();
        return {
            x: ((rect?.width ?? 1200) / 2 - viewport.x) / viewport.k,
            y: ((rect?.height ?? 800) / 2 - viewport.y) / viewport.k,
        };
    };

    const addNode = (type: CanvasNode["type"], extra: Partial<CanvasNode> = {}, point?: { x: number; y: number }) => {
        const center = worldCenter();
        const size = NODE_SIZE[type];
        const node: CanvasNode = {
            id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type,
            x: Math.round(point?.x ?? center.x - size.width / 2),
            y: Math.round(point?.y ?? center.y - size.height / 2),
            width: size.width,
            height: size.height,
            title: type === "text" ? "文本" : type === "image" ? "图片" : "视频",
            ...(type === "text" ? { content: "双击编辑文本" } : {}),
            ...extra,
        };
        changeNodes((items) => [...items, node]);
        setSelected([node.id]);
        if (type === "text") setNodeGenOpen(false);
        else showNodeComposer([node.id]);
        if (node.fileNo) void resolveMedia(node);
    };

    const requestUpload = (type: "image" | "video", nodeId?: string, point?: { x: number; y: number }) => {
        const center = worldCenter();
        const nodeSize = NODE_SIZE[type];
        uploadTargetRef.current = { nodeId, point: point ?? { x: center.x - nodeSize.width / 2, y: center.y - nodeSize.height / 2 } };
        (type === "image" ? imageInputRef : videoInputRef).current?.click();
    };
    const uploadAsNode = async (file: File, type: "image" | "video") => {
        const target = uploadTargetRef.current;
        uploadTargetRef.current = null;
        if (target?.nodeId) setUploadingIds((ids) => [...ids, target.nodeId!]);
        try {
            const uploaded = await uploadFile(file);
            setMedia((current) => ({ ...current, [uploaded.fileNo]: uploaded.url }));
            const extra = { fileNo: uploaded.fileNo, storageKey: `file:${uploaded.fileNo}`, title: file.name };
            if (target?.nodeId) {
                if (!nodesRef.current.some((node) => node.id === target.nodeId)) {
                    message.info("文件已上传，目标节点已被删除，本次上传未写入画布");
                    return;
                }
                changeNodes((items) => items.map((node) => (node.id === target.nodeId ? { ...node, ...extra } : node)));
            } else {
                addNode(type, extra, target?.point);
            }
            message.success("已添加到画布");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "上传失败");
        } finally {
            if (target?.nodeId) setUploadingIds((ids) => ids.filter((id) => id !== target.nodeId));
        }
    };

    const removeSelected = () => {
        const ids = selectedRef.current;
        if (ids.length) {
            changeNodes((items) => items.filter((node) => !ids.includes(node.id)));
            setSelected([]);
        } else if (selectedConnectionRef.current) {
            changeConnections(connectionsRef.current.filter((entry) => !isCanvasLink(entry) || entry.id !== selectedConnectionRef.current));
        }
        setSelectedConnection(null);
    };

    const copySelected = () => {
        const source = nodesRef.current.filter((node) => selectedRef.current.includes(node.id));
        clipboardRef.current = structuredClone({ nodes: source, connections: getCanvasLinks(connectionsRef.current, source) });
        if (source.length) message.success(`已复制 ${source.length} 个节点，可按 Ctrl/⌘+V 粘贴`);
    };
    const pasteNodes = (duplicate = false) => {
        const source = duplicate ? nodesRef.current.filter((node) => selectedRef.current.includes(node.id)) : clipboardRef.current.nodes;
        if (!source.length) return;
        const additions = cloneNodes(source);
        const sourceConnections = duplicate ? connectionsRef.current : clipboardRef.current.connections;
        const links = cloneCanvasLinks(sourceConnections, source, additions);
        changeDocument([...nodesRef.current, ...additions], [...connectionsRef.current, ...links]);
        setSelected(additions.map((node) => node.id));
        setSelectedConnection(null);
        if (!duplicate) clipboardRef.current = { nodes: additions, connections: links };
    };
    const focusNodes = (items: CanvasNode[]) => {
        if (items.length) setViewport(fitViewport(items, size, 100));
    };

    useEffect(() => {
        if (loading || !containerRef.current) return;
        const observer = new ResizeObserver(([entry]) => {
            setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [loading]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu], .ant-select, .ant-popover, [aria-label='节点生成面板']")) return;
            if (genOpen || shortcutsOpen || pickerOpen || editingText || document.querySelector(".ant-drawer-open")) return;
            const modifier = event.ctrlKey || event.metaKey;
            const key = event.key.toLowerCase();
            if (event.code === "Space" && !modifier) {
                event.preventDefault();
                setSpacePan(true);
                return;
            }
            if (modifier && key === "z") {
                event.preventDefault();
                travelHistory(event.shiftKey ? "redo" : "undo");
            } else if (modifier && key === "y") {
                event.preventDefault();
                travelHistory("redo");
            } else if (modifier && key === "a") {
                event.preventDefault();
                setSelected(nodesRef.current.map((node) => node.id));
            } else if (modifier && key === "c" && selectedRef.current.length) {
                event.preventDefault();
                copySelected();
            } else if (modifier && key === "v" && clipboardRef.current.nodes.length) {
                event.preventDefault();
                pasteNodes();
            } else if (modifier && key === "d") {
                event.preventDefault();
                pasteNodes(true);
            } else if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                removeSelected();
            } else if (event.key === "Escape") {
                finishGesture();
                setSelected([]);
                setSelectedConnection(null);
                setNodeGenOpen(false);
            } else if (!modifier && key === "v") setCanvasTool("select");
            else if (!modifier && key === "h") setCanvasTool("pan");
            else if (!modifier && key === "f") focusNodes(selectedRef.current.length ? nodesRef.current.filter((node) => selectedRef.current.includes(node.id)) : nodesRef.current);
        };
        const releaseSpace = (event: KeyboardEvent) => {
            if (event.code === "Space") setSpacePan(false);
        };
        const blur = () => {
            setSpacePan(false);
            finishGesture();
        };
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", releaseSpace);
        window.addEventListener("blur", blur);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", releaseSpace);
            window.removeEventListener("blur", blur);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [genOpen, shortcutsOpen, pickerOpen, editingText, size]);

    useEffect(() => {
        if (loading) return;
        const container = containerRef.current;
        if (!container) return;
        const onWheel = (event: WheelEvent) => {
            // These panels own their scrolling; React's delegated stopPropagation runs later.
            if (event.target instanceof Element && event.target.closest("[data-canvas-scroll]")) return;
            if (event.deltaY === 0) return;
            if (event.cancelable) event.preventDefault();
            const rect = container.getBoundingClientRect();
            const mx = event.clientX - rect.left;
            const my = event.clientY - rect.top;
            setViewport((current) => {
                const k = Math.min(2.5, Math.max(0.2, current.k * (event.deltaY < 0 ? 1.1 : 0.9)));
                return { k, x: mx - ((mx - current.x) * k) / current.k, y: my - ((my - current.y) * k) / current.k };
            });
        };
        container.addEventListener("wheel", onWheel, { passive: false });
        return () => container.removeEventListener("wheel", onWheel);
    }, [loading]);
    const worldPoint = (clientX: number, clientY: number) => {
        const rect = containerRef.current!.getBoundingClientRect();
        const view = viewportRef.current;
        return { x: (clientX - rect.left - view.x) / view.k, y: (clientY - rect.top - view.y) / view.k };
    };
    const startPan = (event: ReactPointerEvent) => {
        const view = viewportRef.current;
        panRef.current = { active: true, startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y };
        containerRef.current?.setPointerCapture(event.pointerId);
    };
    const onBackgroundPointerDown = (event: ReactPointerEvent) => {
        if ((event.target as HTMLElement).dataset.canvasBg !== "true" || (event.button !== 0 && event.button !== 1)) return;
        event.preventDefault();
        containerRef.current?.focus({ preventScroll: true });
        setSelectedConnection(null);
        if (event.button === 1 || spacePan || (canvasTool === "pan" && !event.shiftKey)) {
            startPan(event);
            if (!event.shiftKey) setSelected([]);
            return;
        }
        const start = worldPoint(event.clientX, event.clientY);
        marqueeRef.current = { start, original: selectedRef.current, additive: event.shiftKey };
        setMarquee({ ...start, width: 0, height: 0 });
        if (!event.shiftKey) setSelected([]);
        containerRef.current?.setPointerCapture(event.pointerId);
    };
    const connectionTargetAt = (clientX: number, clientY: number, draft: ConnectionDraft) => {
        const element = document.elementFromPoint(clientX, clientY);
        const port = element?.closest<HTMLElement>("[data-connection-handle]");
        if (port?.dataset.connectionHandle === draft.handleType) return undefined;
        const id = element?.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId;
        return id && id !== draft.nodeId && nodesRef.current.some((node) => node.id === id) ? id : undefined;
    };
    const startConnection = (event: ReactPointerEvent, nodeId: string, handleType: "source" | "target") => {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.preventDefault();
        finishGesture();
        setSelected([]);
        setSelectedConnection(null);
        setNodeGenOpen(false);
        setCreationMenu(null);
        const draft: ConnectionDraft = { nodeId, handleType, pointerId: event.pointerId, point: worldPoint(event.clientX, event.clientY) };
        connectionDraftRef.current = draft;
        setConnectionDraft(draft);
        containerRef.current?.focus({ preventScroll: true });
        containerRef.current?.setPointerCapture(event.pointerId);
    };
    const completeConnection = (event: ReactPointerEvent) => {
        const draft = connectionDraftRef.current;
        if (!draft || draft.pointerId !== event.pointerId) return;
        const targetId = connectionTargetAt(event.clientX, event.clientY, draft);
        if (!targetId) return;
        const from = draft.handleType === "source" ? draft.nodeId : targetId;
        const to = draft.handleType === "target" ? draft.nodeId : targetId;
        const next = appendCanvasLink(connectionsRef.current, nodesRef.current, from, to);
        if (next !== connectionsRef.current) changeConnections(next);
    };
    const onPointerMove = (event: ReactPointerEvent) => {
        const connection = connectionDraftRef.current;
        if (connection && connection.pointerId === event.pointerId) {
            const draft = { ...connection, point: worldPoint(event.clientX, event.clientY), targetNodeId: connectionTargetAt(event.clientX, event.clientY, connection) };
            connectionDraftRef.current = draft;
            setConnectionDraft(draft);
            return;
        }
        if (panRef.current.active) {
            const { startX, startY, originX, originY } = panRef.current;
            setViewport((current) => ({ ...current, x: originX + event.clientX - startX, y: originY + event.clientY - startY }));
            return;
        }
        const selection = marqueeRef.current;
        if (selection) {
            const point = worldPoint(event.clientX, event.clientY);
            const rect = { x: Math.min(selection.start.x, point.x), y: Math.min(selection.start.y, point.y), width: Math.abs(point.x - selection.start.x), height: Math.abs(point.y - selection.start.y) };
            setMarquee(rect);
            const ids = selectIntersectingNodes(nodesRef.current, rect);
            setSelected([...new Set([...(selection.additive ? selection.original : []), ...ids])]);
            return;
        }
        const drag = dragRef.current;
        if (drag && drag.pointerId === event.pointerId) {
            const dx = (event.clientX - drag.startX) / viewportRef.current.k;
            const dy = (event.clientY - drag.startY) / viewportRef.current.k;
            const origins = new Map(drag.origins.map((node) => [node.id, node]));
            changeNodes(
                (items) =>
                    items.map((node) => {
                        const origin = origins.get(node.id);
                        return origin ? { ...node, x: origin.x + dx, y: origin.y + dy } : node;
                    }),
                false,
            );
        }
    };
    const finishGesture = () => {
        const connectionPointerId = connectionDraftRef.current?.pointerId;
        connectionDraftRef.current = null;
        setConnectionDraft(null);
        if (connectionPointerId !== undefined && containerRef.current?.hasPointerCapture(connectionPointerId)) containerRef.current.releasePointerCapture(connectionPointerId);
        panRef.current.active = false;
        if (dragRef.current) {
            historyRef.current = commitDocumentHistory(historyRef.current, nodesRef.current, connectionsRef.current);
            setHistoryVersion((value) => value + 1);
        }
        dragRef.current = null;
        marqueeRef.current = null;
        setMarquee(null);
    };
    const startDrag = (event: ReactPointerEvent, node: CanvasNode) => {
        if ((event.target as HTMLElement).closest("video, button, input, textarea") || (event.button !== 0 && event.button !== 1)) return;
        event.stopPropagation();
        if (spacePan || event.button === 1) {
            event.preventDefault();
            startPan(event);
            return;
        }
        event.preventDefault();
        containerRef.current?.focus({ preventScroll: true });
        const current = selectedRef.current;
        if (event.shiftKey) {
            setSelected(current.includes(node.id) ? current.filter((id) => id !== node.id) : [...current, node.id]);
            return;
        }
        const ids = current.includes(node.id) ? current : [node.id];
        setSelected(ids);
        showNodeComposer(ids);
        dragRef.current = { startX: event.clientX, startY: event.clientY, origins: nodesRef.current.filter((item) => ids.includes(item.id)), pointerId: event.pointerId };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const openGenerate = (nearNode = false, sourceIds = selectedRef.current, frameNode = true) => {
        const anchors = nodesRef.current.filter((node) => sourceIds.includes(node.id));
        const anchorType = anchors.find((node) => node.type === "image" || node.type === "video")?.type;
        if (anchorType === "image" || anchorType === "video") changeOutputType(anchorType);
        const inputIds = getCanvasLinks(connectionsRef.current, nodesRef.current)
            .filter((link) => sourceIds.includes(link.toNodeId))
            .map((link) => link.fromNodeId);
        const orderedIds = [...new Set([...sourceIds, ...inputIds])];
        const source = orderedIds.map((id) => nodesRef.current.find((node) => node.id === id)).filter((node): node is CanvasNode => Boolean(node));
        const text = source
            .filter((node) => node.type === "text")
            .map((node) => node.content || "")
            .filter(Boolean);
        setGenerationSourceIds(source.map((node) => node.id));
        setGenerationAnchorIds(anchors.map((node) => node.id));
        if (text.length) setPrompt(text.join("\n"));
        if (outputType === "image") setReferenceMode("reference");
        else setReferenceMode(model?.params.supportsReferenceImages && (!model.params.supportsFirstLastFrame || source.filter((node) => node.type === "image" && node.fileNo).length > 2) ? "reference" : "frames");
        setGenTaskNo(null);
        if (nearNode && frameNode) {
            const bounds = getNodesBounds(anchors);
            if (bounds) {
                const panelHeight = Math.min(nodePanelHeight, Math.max(240, size.height - 160));
                const k = Math.max(0.1, Math.min(viewportRef.current.k, 1, (size.width - 160) / Math.max(1, bounds.width), (size.height - panelHeight - 128) / Math.max(1, bounds.height)));
                const top = Math.max(40, (size.height - 64 - bounds.height * k - panelHeight - 18) / 2);
                setViewport({ k, x: (size.width + 56) / 2 - (bounds.x + bounds.width / 2) * k, y: top - bounds.y * k });
            }
        }
        setGenOpen(!nearNode);
        setNodeGenOpen(nearNode);
    };

    const showNodeComposer = (ids: string[]) => {
        if (ids.length !== 1 || genOpen) return;
        const node = nodesRef.current.find((item) => item.id === ids[0]);
        if (!node || node.type === "text") return;
        if (nodeGenOpen && generationAnchorIds.length === 1 && generationAnchorIds[0] === node.id) return;
        openGenerate(true, ids, false);
    };

    const generate = async () => {
        if (generating || (genTask && isTaskActive(genTask))) return;
        if (modelsStatus !== "ready" || !model || model.capability !== outputType) return message.error("请选择当前输出类型的可用模型");
        if (!prompt.trim()) return message.error("请输入提示词");
        if (!getModelSpecs(model).some((spec) => spec.resolution === resolution && (outputType === "image" || spec.seconds === seconds))) return message.warning("请重新选择当前模型支持的规格组合");
        if (outputType === "video" && !model.params.ratios.includes(ratio)) return message.warning("请选择当前模型支持的画面比例");
        if (selectedImages.length > model.params.maxReferenceImages) return message.warning(`该模型最多支持 ${model.params.maxReferenceImages} 张参考图`);
        if (selectedImages.length && referenceMode === "frames" && (!model.params.supportsFirstLastFrame || selectedImages.length > 2)) return message.warning("当前首尾帧模式不支持这些参考图，请调整模式或素材");
        if (selectedImages.length && referenceMode === "reference" && !model.params.supportsReferenceImages) return message.warning("当前模型不支持图片参考模式");
        if (credits.available < estimate) return message.warning("可用积分不足，请先到账户中心补充积分，当前草稿会保留");
        setGenerating(true);
        try {
            if (outputType === "image") {
                const input = { modelKey: model.id, prompt: prompt.trim(), size: resolution, referenceFileNos: selectedImages.map((node) => node.fileNo!) };
                const payload = JSON.stringify(input);
                if (imageRequestRef.current?.payload !== payload) imageRequestRef.current = { payload, key: crypto.randomUUID() };
                try {
                    sessionStorage.setItem(`${draftKey}:image-request`, JSON.stringify(imageRequestRef.current));
                } catch {
                    /* In-memory retries remain safe. */
                }
                const task = await createImageTask(input, imageRequestRef.current!.key);
                if (userId !== useAuthStore.getState().user?.id) return;
                setGenTaskNo(task.taskNo);
                track(task, { projectNo, projectTitle: title });
                if (isTaskActive(task)) message.success("图片任务已提交，完成后自动插入画布");
                else {
                    imageRequestRef.current = null;
                    try {
                        sessionStorage.removeItem(`${draftKey}:image-request`);
                    } catch {
                        /* Optional draft persistence. */
                    }
                    if (task.status !== "succeeded" || !task.file) message.error(task.errorMessage || "图片生成失败，请重试");
                    else message.success("图片已生成，正在插入画布");
                }
                return;
            }
            const created = await createTask({
                modelKey: model.id,
                prompt: prompt.trim(),
                seconds,
                resolution,
                size: model.params.sizes[0] || "1280x720",
                ratio,
                generateAudio: false,
                watermark: false,
                mode: referenceMode,
                referenceFileNos: selectedImages.map((node) => node.fileNo!),
            });
            if (useAuthStore.getState().user?.id !== userId) return;
            const task: VideoTaskView = {
                taskNo: created.taskNo,
                status: created.status,
                progress: 0,
                modelName: model.displayName,
                prompt: prompt.trim(),
                params: { seconds, resolution, ratio },
                referenceFileNos: selectedImages.map((node) => node.fileNo!),
                heldCredits: created.heldCredits,
                settledCredits: 0,
                createdAt: new Date().toISOString(),
            };
            track(task, { projectNo, projectTitle: title });
            setGenTaskNo(task.taskNo);
            message.success("任务已提交，可关闭窗口继续编辑，完成后会自动插入本画布");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "提交失败，请重试");
        } finally {
            if (outputType === "image" && useAuthStore.getState().user?.id === userId) void useAuthStore.getState().refreshAccount();
            setGenerating(false);
        }
    };

    const estimate = model ? quoteCredits(model, seconds, resolution, false) : 0;
    const selectionBounds = getNodesBounds(selectedNodes);
    const sourceBounds = getNodesBounds(nodes.filter((node) => generationAnchorIds.includes(node.id)));
    const selectionToolbarStyle = selectionBounds
        ? {
              left: Math.max(72, Math.min(size.width - Math.min(400, size.width - 16) - 8, (selectionBounds.x + selectionBounds.width / 2) * viewport.k + viewport.x - 180)),
              top: Math.max(8, Math.min(size.height - 110, selectionBounds.y * viewport.k + viewport.y - 70)),
          }
        : {};
    const panelWidth = Math.min(500, Math.max(240, size.width - 88));
    const anchorTop = sourceBounds ? sourceBounds.y * viewport.k + viewport.y : 24;
    const belowNode = sourceBounds ? (sourceBounds.y + sourceBounds.height) * viewport.k + viewport.y + 18 : 24;
    const nodePanelStyle = {
        width: panelWidth,
        left: Math.max(72, Math.min(size.width - panelWidth - 12, sourceBounds ? (sourceBounds.x + sourceBounds.width / 2) * viewport.k + viewport.x - panelWidth / 2 : (size.width - panelWidth) / 2)),
        top: Math.max(12, Math.min(size.height - nodePanelHeight - 64, belowNode + nodePanelHeight + 64 <= size.height ? belowNode : anchorTop - nodePanelHeight - 18 >= 12 ? anchorTop - nodePanelHeight - 18 : belowNode)),
    };
    const changeOutputType = (type: "image" | "video") => {
        if (generating || (genTask && isTaskActive(genTask)) || type === outputType) return;
        setOutputType(type);
        setModels([]);
        setModelsStatus("loading");
        setModelId(undefined);
        setGenTaskNo(null);
        setReferenceMode(type === "image" ? "reference" : "frames");
    };
    const selectGenerationModel = (id: string) => {
        const next = models.find((item) => item.id === id);
        if (!next) return;
        setModelId(id);
        const specs = getModelSpecs(next);
        const spec = specs.find((item) => item.resolution === resolution && (outputType === "image" || item.seconds === seconds)) ?? specs[0];
        setResolution(spec?.resolution ?? "");
        setSeconds(spec?.seconds ?? 0);
        setRatio((current) => (next.params.ratios.includes(current) ? current : (next.params.ratios[0] ?? "16:9")));
        setReferenceMode((current) => (current === "reference" && next.params.supportsReferenceImages ? "reference" : next.params.supportsFirstLastFrame ? "frames" : "reference"));
    };
    const composerProps = {
        outputType,
        onOutputTypeChange: changeOutputType,
        modelsStatus,
        modelsError,
        onRetryModels: () => setModelsRetry((value) => value + 1),
        models,
        modelId,
        onModelChange: selectGenerationModel,
        prompt,
        onPromptChange: setPrompt,
        seconds,
        onSecondsChange: setSeconds,
        resolution,
        onResolutionChange: setResolution,
        ratio,
        onRatioChange: setRatio,
        mode: referenceMode,
        onModeChange: setReferenceMode,
        references: selectedImages,
        candidates: nodes,
        media,
        onToggleReference: (id: string) => setGenerationSourceIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id])),
        onOpenLibrary: () => {
            pickingForGeneration.current = true;
            setPickerOpen(true);
        },
        onUseSelected: () => {
            const text = selectedNodes
                .filter((node) => node.type === "text")
                .map((node) => node.content || "")
                .filter(Boolean);
            if (text.length) setPrompt(text.join("\n"));
        },
        selectedTextCount: selectedText.length,
        task: genTask,
        estimate,
        availableCredits: credits.available,
        generating,
        onGenerate: () => void generate(),
        onClose: () => {
            setGenOpen(false);
            setNodeGenOpen(false);
        },
        onRecharge: () => navigate(`/account?returnTo=${encodeURIComponent(`/canvas/${projectNo}`)}`),
    };
    const generationForm = <CanvasGenerationComposer {...composerProps} />;
    if (loading) {
        return (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-stone-500">
                <LoaderCircle className="size-4 animate-spin" /> 加载画布…
            </div>
        );
    }

    return (
        <div className="relative flex h-full min-w-0 flex-col bg-stone-100 dark:bg-stone-950" data-canvas-editor data-history-version={historyVersion}>
            <header className="flex min-h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-stone-200 bg-white px-3 py-1 dark:border-stone-800 dark:bg-stone-900">
                <Button type="text" size="small" icon={<ArrowLeft className="size-4" />} onClick={() => navigate("/canvas")}>
                    项目
                </Button>
                <Tooltip title={sidebarOpen ? "收起节点和素材" : "展开节点和素材"}>
                    <Button aria-label="切换画布侧栏" size="small" type={sidebarOpen ? "default" : "text"} icon={<PanelLeft className="size-4" />} onClick={() => setSidebarOpen(!sidebarOpen)} />
                </Tooltip>
                <Input aria-label="画布名称" value={title} onChange={(event) => setTitle(event.target.value)} variant="borderless" className="!w-40 !shrink-0 !font-medium" maxLength={200} />
                <span role="status" className="shrink-0 text-[11px] text-stone-400">
                    {status === "saving" ? "保存中…" : status === "saved" ? "已保存" : status === "error" ? "保存失败，请保留页面" : ""}
                </span>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                    <Tooltip title="撤销 Ctrl/⌘+Z">
                        <Button aria-label="撤销" size="small" type="text" icon={<Undo2 className="size-4" />} disabled={!historyRef.current.past.length} onClick={() => travelHistory("undo")} />
                    </Tooltip>
                    <Tooltip title="重做 Ctrl/⌘+Shift+Z">
                        <Button aria-label="重做" size="small" type="text" icon={<Redo2 className="size-4" />} disabled={!historyRef.current.future.length} onClick={() => travelHistory("redo")} />
                    </Tooltip>
                    <Button size="small" type="text" icon={<FolderOpen className="size-4" />} onClick={() => setPickerOpen(true)}>
                        从作品库添加
                    </Button>
                    <Button size="small" type="primary" icon={<Sparkles className="size-4" />} onClick={() => openGenerate()}>
                        开始生成
                    </Button>
                    <Tooltip title="快捷键">
                        <Button aria-label="画布快捷键" size="small" type="text" icon={<Keyboard className="size-4" />} onClick={() => setShortcutsOpen(true)} />
                    </Tooltip>
                </div>
            </header>

            <div className="relative flex min-h-0 flex-1 overflow-hidden">
                {sidebarOpen ? (
                    <div className="absolute inset-y-0 left-0 z-30 shadow-xl sm:relative sm:z-auto sm:shadow-none">
                        <CanvasWorkbenchSidebar
                            nodes={nodes}
                            selectedIds={selected}
                            media={media}
                            onAddItems={insertWorks}
                            onSelectNode={(id, additive) => {
                                setSelected((current) => (additive ? (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) : [id]));
                                focusNodes(nodes.filter((node) => node.id === id));
                                if (!additive) showNodeComposer([id]);
                                if (window.innerWidth < 640) setSidebarOpen(false);
                            }}
                        />
                    </div>
                ) : null}
                <div
                    ref={containerRef}
                    data-canvas-bg="true"
                    tabIndex={0}
                    aria-label="无限画布编辑区域"
                    className={cn("relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden outline-none", spacePan || canvasTool === "pan" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair")}
                    style={{
                        backgroundImage: "radial-gradient(circle, rgba(120,113,108,0.28) 1px, transparent 1px)",
                        backgroundSize: `${22 * viewport.k}px ${22 * viewport.k}px`,
                        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
                    }}
                    onContextMenu={(event) => {
                        if ((event.target as HTMLElement).dataset.canvasBg !== "true") return;
                        event.preventDefault();
                        finishGesture();
                        setCreationMenu({ x: event.clientX, y: event.clientY, world: worldPoint(event.clientX, event.clientY) });
                    }}
                    onPointerDown={onBackgroundPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={(event) => {
                        if (connectionDraftRef.current && connectionDraftRef.current.pointerId !== event.pointerId) return;
                        completeConnection(event);
                        finishGesture();
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                    }}
                    onPointerCancel={(event) => {
                        if (!connectionDraftRef.current || connectionDraftRef.current.pointerId === event.pointerId) finishGesture();
                    }}
                    onLostPointerCapture={(event) => {
                        if (connectionDraftRef.current && connectionDraftRef.current.pointerId !== event.pointerId) return;
                        if (!event.currentTarget.hasPointerCapture(event.pointerId)) finishGesture();
                    }}
                >
                    <EditorConnections
                        nodes={nodes}
                        connections={connections}
                        viewport={viewport}
                        selectedId={selected.length ? null : selectedConnection}
                        draft={connectionDraft}
                        onSelect={(id) => {
                            setSelected([]);
                            setSelectedConnection(id);
                            setNodeGenOpen(false);
                            containerRef.current?.focus({ preventScroll: true });
                        }}
                    />
                    {selectedConnection && !selected.length ? (
                        <div
                            className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-500 shadow-lg dark:border-stone-700 dark:bg-stone-900"
                            onPointerDown={(event) => event.stopPropagation()}
                        >
                            <span>已选连线</span>
                            <Button size="small" danger type="text" aria-label="删除选中连线" icon={<Trash2 className="size-3.5" />} onClick={removeSelected}>
                                删除
                            </Button>
                        </div>
                    ) : null}
                    <div className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})` }}>
                        {nodes.map((node) => (
                            <div
                                key={node.id}
                                data-node-id={node.id}
                                data-selected={selected.includes(node.id)}
                                className={cn(
                                    "pointer-events-auto absolute cursor-default rounded-xl border bg-white shadow-sm dark:bg-stone-900",
                                    selected.includes(node.id) ? "border-violet-500 ring-2 ring-violet-500/15 dark:border-violet-400" : "border-stone-200 dark:border-stone-700",
                                )}
                                style={{ left: node.x, top: node.y, width: node.width, height: node.height, zIndex: selected.includes(node.id) ? 1 : 0 }}
                                onPointerDown={(event) => startDrag(event, node)}
                                onDoubleClick={() => {
                                    if (node.type === "text") {
                                        setEditingText(node);
                                        setTextDraft(node.content || "");
                                    }
                                }}
                            >
                                <div title="拖动标题移动节点" className="absolute -top-7 left-1 right-1 flex h-6 cursor-grab items-center gap-1.5 text-[11px] text-stone-500 active:cursor-grabbing dark:text-stone-400">
                                    {node.type === "image" ? <ImageIcon className="size-3 shrink-0" /> : node.type === "video" ? <Video className="size-3 shrink-0" /> : <Pencil className="size-3 shrink-0" />}
                                    <span className="truncate">{node.title || (node.type === "video" ? "视频" : node.type === "image" ? "图片" : "文本")}</span>
                                </div>
                                {(["target", "source"] as const).map((handleType) => (
                                    <button
                                        key={handleType}
                                        type="button"
                                        aria-label={handleType === "source" ? "节点输出端口" : "节点输入端口"}
                                        title={handleType === "source" ? "拖动连线到目标节点" : "拖动连线到来源节点"}
                                        data-connection-handle={handleType}
                                        className="absolute z-10 flex size-6 cursor-crosshair items-center justify-center rounded-full border-0 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                                        style={{ [handleType === "source" ? "right" : "left"]: -12, top: "50%", marginTop: -12, transform: `scale(${1 / viewport.k})` }}
                                        onPointerDown={(event) => startConnection(event, node.id, handleType)}
                                    >
                                        <span
                                            className={cn(
                                                "size-2.5 rounded-full border-2 border-violet-400 bg-white transition hover:bg-violet-300 dark:bg-stone-900",
                                                connectionDraft?.targetNodeId === node.id && "bg-violet-500 ring-4 ring-violet-400/25 dark:bg-violet-500",
                                            )}
                                        />
                                    </button>
                                ))}
                                {selected.includes(node.id) ? (
                                    <Tooltip title={node.type === "image" ? "用此节点生成图片" : "用此节点生成视频"}>
                                        <button
                                            type="button"
                                            aria-label="从节点打开生成面板"
                                            className="absolute -right-9 top-1/2 mt-9 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-violet-300 bg-white text-violet-600 shadow-sm hover:bg-violet-50 dark:border-violet-700 dark:bg-stone-900 dark:text-violet-300"
                                            onClick={() => {
                                                setSelected([node.id]);
                                                openGenerate(true, [node.id]);
                                            }}
                                        >
                                            <Plus className="size-3.5" />
                                        </button>
                                    </Tooltip>
                                ) : null}
                                <div className="h-full w-full overflow-hidden rounded-[11px]">
                                    {node.type === "text" ? (
                                        <div className="h-full w-full overflow-auto whitespace-pre-wrap break-words p-3 text-sm text-stone-700 dark:text-stone-200">{node.content}</div>
                                    ) : !node.fileNo ? (
                                        <div className="flex h-full flex-col items-center justify-center gap-2 bg-stone-50/60 p-3 text-center dark:bg-stone-950/30">
                                            {node.type === "image" ? <ImageIcon className="size-7 text-blue-400" /> : <Video className="size-7 text-orange-400" />}
                                            <span className="text-xs text-stone-500">{node.type === "image" ? "空白图片节点" : "空白视频节点"}</span>
                                            <Button size="small" aria-label={node.type === "image" ? "上传图片到节点" : "上传视频到节点"} loading={uploadingIds.includes(node.id)} onClick={() => requestUpload(node.type as "image" | "video", node.id)}>
                                                {node.type === "image" ? "上传图片" : "上传视频"}
                                            </Button>
                                            <span className="text-[10px] text-stone-400">{node.type === "image" ? "JPG / PNG / WebP" : "MP4 / WebM"}</span>
                                        </div>
                                    ) : node.type === "image" ? (
                                        media[node.fileNo] ? (
                                            <img src={media[node.fileNo]} alt={node.title} className="size-full object-cover" draggable={false} />
                                        ) : (
                                            <div className="flex h-full items-center justify-center text-xs text-stone-400">
                                                <LoaderCircle className="mr-1 size-3 animate-spin" /> 加载图片
                                            </div>
                                        )
                                    ) : media[node.fileNo] ? (
                                        <video
                                            src={media[node.fileNo]}
                                            controls
                                            className="size-full bg-black object-contain"
                                            onPointerDown={(event) => {
                                                if (event.button === 0) {
                                                    event.stopPropagation();
                                                    setSelected([node.id]);
                                                    showNodeComposer([node.id]);
                                                }
                                            }}
                                        />
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-xs text-stone-400">
                                            <LoaderCircle className="mr-1 size-3 animate-spin" /> 加载视频
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {marquee ? <div className="pointer-events-none absolute border border-blue-500 bg-blue-500/10" style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} /> : null}
                    </div>
                    {selectionBounds && !nodeGenOpen ? (
                        <div
                            data-selection-toolbar
                            className="absolute z-20 flex max-w-[calc(100%-1rem)] items-center gap-1 overflow-x-auto rounded-xl border border-stone-200 bg-white p-1.5 shadow-lg dark:border-stone-700 dark:bg-stone-900"
                            style={selectionToolbarStyle}
                            onPointerDown={(event) => event.stopPropagation()}
                            data-canvas-scroll
                            onWheel={(event) => event.stopPropagation()}
                        >
                            <span className="shrink-0 px-2 text-xs text-stone-500">已选 {selected.length} 项</span>
                            {selectedNodes.length === 1 && selectedNodes[0].type === "text" ? (
                                <Button
                                    aria-label="编辑选中文本"
                                    size="small"
                                    type="text"
                                    icon={<Pencil className="size-3.5" />}
                                    onClick={() => {
                                        setEditingText(selectedNodes[0]);
                                        setTextDraft(selectedNodes[0].content || "");
                                    }}
                                />
                            ) : null}
                            <Tooltip title="复制一份 Ctrl/⌘+D">
                                <Button aria-label="复制一份" size="small" type="text" icon={<Copy className="size-3.5" />} onClick={() => pasteNodes(true)} />
                            </Tooltip>
                            <Tooltip title="聚焦所选 F">
                                <Button size="small" type="text" onClick={() => focusNodes(selectedNodes)}>
                                    聚焦
                                </Button>
                            </Tooltip>
                            <Button aria-label="删除选中节点" size="small" danger type="text" icon={<Trash2 className="size-3.5" />} onClick={removeSelected} />
                            <Button size="small" type="primary" icon={<Sparkles className="size-3.5" />} onClick={() => openGenerate(true)}>
                                用所选生成
                            </Button>
                        </div>
                    ) : null}
                    {nodeGenOpen ? (
                        <section
                            ref={nodePanelRef}
                            aria-label="节点生成面板"
                            className="absolute z-20 max-h-[calc(100%-5rem)] overflow-auto rounded-2xl"
                            style={nodePanelStyle}
                            onPointerDown={(event) => event.stopPropagation()}
                            data-canvas-scroll
                            onWheel={(event) => event.stopPropagation()}
                        >
                            <CanvasGenerationComposer
                                {...composerProps}
                                onExpand={() => {
                                    setNodeGenOpen(false);
                                    setGenOpen(true);
                                }}
                            />
                        </section>
                    ) : null}
                    <CanvasCreationRail className="absolute left-3 top-1/2 z-30 -translate-y-1/2" onCreate={(type) => addNode(type)} onUpload={requestUpload} onOpenLibrary={() => setPickerOpen(true)} />
                    <div className="pointer-events-none absolute bottom-4 left-3 right-3 z-30 flex justify-center">
                        <CanvasWorkbenchTools
                            compact
                            className="pointer-events-auto max-w-full"
                            tool={spacePan ? "pan" : canvasTool}
                            onToolChange={setCanvasTool}
                            canUndo={historyRef.current.past.length > 0}
                            canRedo={historyRef.current.future.length > 0}
                            onUndo={() => travelHistory("undo")}
                            onRedo={() => travelHistory("redo")}
                            onCreate={(type) => addNode(type)}
                            onUpload={requestUpload}
                            onOpenLibrary={() => setPickerOpen(true)}
                        />
                    </div>
                    <CanvasWorkbenchNavigation nodes={nodes} viewport={viewport} size={size} onViewportChange={setViewport} className={cn("absolute right-4 z-10", size.width < 960 ? "bottom-[76px]" : "bottom-4")} />
                    {creationMenu ? (
                        <CanvasCreationMenu
                            position={creationMenu}
                            onClose={() => {
                                setCreationMenu(null);
                                containerRef.current?.focus({ preventScroll: true });
                            }}
                            onCreate={(type) => addNode(type, {}, creationMenu.world)}
                            onUpload={(type) => requestUpload(type, undefined, creationMenu.world)}
                            onOpenLibrary={() => setPickerOpen(true)}
                        />
                    ) : null}
                    {nodes.length === 0 ? (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-stone-400">
                            <div>
                                <p className="mb-2 font-medium">从一段想法开始</p>
                                <p>右键空白处或使用左侧创建栏，创建文本、图片和视频节点。</p>
                                <p className="mt-2 text-xs">也可从左侧添加素材，选中节点后生成图片或视频。</p>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadAsNode(file, "image");
                    event.target.value = "";
                }}
            />
            <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/webm"
                className="hidden"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadAsNode(file, "video");
                    event.target.value = "";
                }}
            />

            <AssetPickerModal
                open={pickerOpen}
                onClose={() => {
                    setPickerOpen(false);
                    pickingForGeneration.current = false;
                }}
                onSelect={insertWorks}
            />

            <Modal
                open={editingText !== null}
                title="编辑文本节点"
                onCancel={() => setEditingText(null)}
                onOk={() => {
                    if (editingText) changeNodes((items) => items.map((node) => (node.id === editingText.id ? { ...node, content: textDraft } : node)));
                    setEditingText(null);
                }}
                okText="保存"
            >
                <Input.TextArea value={textDraft} onChange={(event) => setTextDraft(event.target.value)} autoSize={{ minRows: 6, maxRows: 16 }} />
            </Modal>

            <Modal
                open={genOpen}
                title={outputType === "image" ? "用画布素材生成图片" : "用画布素材生成视频"}
                onCancel={() => {
                    if (!generating) setGenOpen(false);
                }}
                footer={null}
                width={600}
            >
                {genOpen ? generationForm : null}
            </Modal>
            <Modal open={shortcutsOpen} title="画布快捷键" footer={null} onCancel={() => setShortcutsOpen(false)} width={520}>
                <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-3 py-3 text-sm">
                    <dt>撤销 / 重做</dt>
                    <dd>Ctrl/⌘+Z / Ctrl/⌘+Shift+Z</dd>
                    <dt>全选</dt>
                    <dd>Ctrl/⌘+A</dd>
                    <dt>复制 / 粘贴</dt>
                    <dd>Ctrl/⌘+C / Ctrl/⌘+V</dd>
                    <dt>复制一份</dt>
                    <dd>Ctrl/⌘+D</dd>
                    <dt>移动 / 选择工具</dt>
                    <dd>H / V</dd>
                    <dt>临时平移</dt>
                    <dd>按住空格拖动 / 鼠标中键</dd>
                    <dt>框选 / 追加框选</dt>
                    <dd>选择工具拖动 / Shift+拖动</dd>
                    <dt>追加或取消选择</dt>
                    <dd>Shift+点击节点</dd>
                    <dt>聚焦所选或全部</dt>
                    <dd>F</dd>
                    <dt>删除 / 取消选择</dt>
                    <dd>Delete / Esc</dd>
                </dl>
                <p className="text-xs text-stone-400">文本输入时使用输入框自身的快捷键。编辑历史保留最近 100 步。</p>
            </Modal>
        </div>
    );
}
