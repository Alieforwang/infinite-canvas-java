import { useMemo, useState } from "react";
import { Image as ImageIcon, Layers3, Search, Type, Video, X } from "lucide-react";

import type { CanvasNode } from "@/api/canvas";
import { TransferLibrary } from "@/components/works/transfer-library";
import type { CanvasTransferItem } from "@/lib/canvas-transfer";
import { cn } from "@/lib/utils";

export type CanvasWorkbenchSidebarProps = {
    nodes: CanvasNode[];
    selectedIds: string[];
    onSelectNode: (nodeId: string, additive: boolean) => void;
    onAddItems: (items: CanvasTransferItem[]) => void;
    media?: Record<string, string>;
    className?: string;
};

const nodeKinds = [
    { value: "all", label: "全部" },
    { value: "text", label: "文本" },
    { value: "image", label: "图片" },
    { value: "video", label: "视频" },
] as const;
const icons = { text: Type, image: ImageIcon, video: Video };
const labels = { text: "文本", image: "图片", video: "视频" };

export function CanvasWorkbenchSidebar({ nodes, selectedIds, onSelectNode, onAddItems, media = {}, className }: CanvasWorkbenchSidebarProps) {
    const [tab, setTab] = useState<"nodes" | "assets">("nodes");
    const [query, setQuery] = useState("");
    const [kind, setKind] = useState<(typeof nodeKinds)[number]["value"]>("all");
    const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
    const visible = useMemo(() => {
        const keyword = query.trim().toLocaleLowerCase();
        return nodes.filter((node) => (kind === "all" || node.type === kind) &&
            (!keyword || `${node.title ?? ""} ${node.content ?? ""} ${labels[node.type]}`.toLocaleLowerCase().includes(keyword)));
    }, [nodes, query, kind]);

    return (
        <aside aria-label="画布侧栏" className={cn("flex h-full min-h-0 w-72 flex-col border-r border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950", className)}>
            <div className="flex shrink-0 border-b border-stone-100 px-4 pt-3 dark:border-stone-800" role="tablist" aria-label="画布资源">
                {([{ value: "nodes", label: "画布节点", count: nodes.length }, { value: "assets", label: "素材与作品" }] as const).map((item) => (
                    <button key={item.value} type="button" role="tab" id={`workbench-tab-${item.value}`} aria-controls={`workbench-panel-${item.value}`} aria-selected={tab === item.value}
                        onClick={() => setTab(item.value)}
                        className={cn("flex flex-1 items-center justify-center gap-1.5 border-b-2 px-1 pb-3 text-xs font-medium transition-colors", tab === item.value ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-stone-200")}>
                        {item.label}{"count" in item ? <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500 dark:bg-stone-800">{item.count}</span> : null}
                    </button>
                ))}
            </div>
            <section role="tabpanel" id="workbench-panel-nodes" aria-labelledby="workbench-tab-nodes" hidden={tab !== "nodes"} className={cn("min-h-0 flex-1 flex-col", tab === "nodes" && "flex")}>
                <div className="shrink-0 space-y-3 p-3">
                    <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-2.5 dark:border-stone-700 dark:bg-stone-900">
                        <Search className="size-3.5 shrink-0 text-stone-400" />
                        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索节点名称或文本" aria-label="搜索画布节点"
                            className="h-9 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-stone-400" />
                        {query ? <button type="button" aria-label="清空节点搜索" className="rounded p-1 text-stone-400 hover:text-stone-700" onClick={() => setQuery("")}><X className="size-3" /></button> : null}
                    </div>
                    <div className="flex gap-1" aria-label="按节点类型筛选">
                        {nodeKinds.map((item) => <button key={item.value} type="button" aria-pressed={kind === item.value} onClick={() => setKind(item.value)}
                            className={cn("flex-1 rounded-md px-2 py-1.5 text-[11px] transition-colors", kind === item.value ? "bg-blue-50 font-medium text-blue-600 dark:bg-blue-950/60 dark:text-blue-400" : "text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800")}>
                            {item.label}
                        </button>)}
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                    {visible.length ? <div className="space-y-1">
                        {visible.map((node) => {
                            const Icon = icons[node.type];
                            const preview = node.fileNo ? media[node.fileNo] : undefined;
                            return <button key={node.id} type="button" aria-pressed={selected.has(node.id)}
                                title={`${node.title || labels[node.type]} · 点击定位，Shift 点击多选`}
                                onClick={(event) => onSelectNode(node.id, event.shiftKey)}
                                className={cn("group flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors", selected.has(node.id) ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40" : "border-transparent hover:bg-stone-50 dark:hover:bg-stone-900")}>
                                <span className={cn("flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md", selected.has(node.id) ? "bg-blue-100 text-blue-500 dark:bg-blue-900/50" : "bg-stone-100 text-stone-400 dark:bg-stone-800")}>
                                    {node.type === "image" && preview ? <img src={preview} alt="" className="size-full object-cover" loading="lazy" /> : <Icon className="size-4" />}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs font-medium text-stone-700 dark:text-stone-200">{node.title || `未命名${labels[node.type]}`}</span>
                                    <span className="mt-1 block truncate text-[10px] text-stone-400">{node.type === "text" && node.content ? node.content : `${labels[node.type]} · ${Math.round(node.width)} × ${Math.round(node.height)}`}</span>
                                </span>
                                {selected.has(node.id) ? <span className="size-1.5 shrink-0 rounded-full bg-blue-500" /> : null}
                            </button>;
                        })}
                    </div> : <div className="flex flex-col items-center gap-2 px-4 py-14 text-center text-xs text-stone-400">
                        <Layers3 className="mb-1 size-7 opacity-60" />
                        <span>{nodes.length ? "没有匹配的节点" : "画布上还没有节点"}</span>
                        <span className="text-[11px]">{nodes.length ? "试试其他关键词或节点类型" : "从工具栏添加节点，或从素材中添加内容"}</span>
                    </div>}
                </div>
                <div className="shrink-0 border-t border-stone-100 px-4 py-3 text-[10px] text-stone-400 dark:border-stone-800">点击定位 · Shift 点击多选{selectedIds.length ? ` · 已选 ${selectedIds.length} 项` : ""}</div>
            </section>
            {tab === "assets" ? <section role="tabpanel" id="workbench-panel-assets" aria-labelledby="workbench-tab-assets" className="min-h-0 flex-1 overflow-y-auto p-3">
                <TransferLibrary compact onSelect={onAddItems} onAdd={(item) => onAddItems([item])} />
            </section> : null}
        </aside>
    );
}
