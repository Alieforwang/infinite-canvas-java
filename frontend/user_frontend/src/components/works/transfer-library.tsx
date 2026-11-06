import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Checkbox, Empty, Input, Modal, Pagination, Select, Spin, Tabs, Tag } from "antd";
import { Download, FileText, Video } from "lucide-react";

import { listAssets, type AssetView } from "@/api/assets";
import { listTasks, type VideoTaskView } from "@/api/video-tasks";
import { assetToTransferItem, canTransferItem, taskToTransferItem, type CanvasTransferItem } from "@/lib/canvas-transfer";

type Source = "assets" | "works";
type Entry = { key: string; item: CanvasTransferItem; url?: string; coverUrl?: string; description?: string };
const KIND_LABEL = { text: "文本", image: "图片", video: "视频" };

/** Shared by the picker and the generated works page. Work search explicitly filters only the current server page. */
export function TransferLibrary({ source: fixedSource, onSelect, onAdd, compact = false }: {
    source?: Source;
    onSelect?: (items: CanvasTransferItem[]) => void;
    onAdd?: (item: CanvasTransferItem) => void;
    compact?: boolean;
}) {
    const [source, setSource] = useState<Source>(fixedSource ?? "assets");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(12);
    const [total, setTotal] = useState(0);
    const [kind, setKind] = useState("all");
    const [keyword, setKeyword] = useState("");
    const [workFilter, setWorkFilter] = useState("");
    const [entries, setEntries] = useState<Entry[]>([]);
    const [selected, setSelected] = useState<Record<string, CanvasTransferItem>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [reload, setReload] = useState(0);
    const [preview, setPreview] = useState<Entry | null>(null);
    const requestRef = useRef(0);

    useEffect(() => {
        const request = ++requestRef.current;
        setLoading(true);
        setError("");
        setEntries([]);
        const load = async () => {
            if (source === "assets") {
                const result = await listAssets({ page, pageSize, kind, keyword });
                return { ...result, entries: result.items.map((asset: AssetView): Entry => ({
                    key: `asset-${asset.assetNo}`, item: assetToTransferItem(asset), url: asset.file?.url, coverUrl: asset.coverUrl ?? (asset.kind === "image" ? asset.file?.url : undefined), description: asset.note,
                })) };
            }
            const result = await listTasks("succeeded", page, pageSize);
            return { ...result, entries: result.items.map((task: VideoTaskView): Entry => ({
                key: `task-${task.taskNo}`, item: taskToTransferItem(task), url: task.file?.url, description: task.modelName,
            })) };
        };
        void load().then((result) => {
            if (request !== requestRef.current) return;
            setEntries(result.entries);
            setTotal(result.total);
        }).catch((cause: unknown) => {
            if (request === requestRef.current) setError(cause instanceof Error ? cause.message : "内容加载失败，请重试");
        }).finally(() => {
            if (request === requestRef.current) setLoading(false);
        });
        return () => { requestRef.current += 1; };
    }, [source, page, pageSize, kind, keyword, reload]);

    const filter = workFilter.trim().toLowerCase();
    const visible = source === "works" && filter ? entries.filter((entry) => `${entry.item.title} ${entry.description ?? ""}`.toLowerCase().includes(filter)) : entries;
    const selectedItems = Object.values(selected);

    return (
        <div className={compact ? "space-y-3" : "space-y-4"}>
            {!fixedSource ? <Tabs size={compact ? "small" : "middle"} activeKey={source} onChange={(value) => { setSource(value as Source); setPage(1); setKeyword(""); setWorkFilter(""); }} items={[{ key: "assets", label: "我的素材" }, { key: "works", label: "生成作品" }]} /> : null}
            <div className={compact ? "flex flex-col items-stretch gap-2" : "flex flex-wrap items-center gap-3"}>
                {source === "assets" ? <>
                    <Input.Search size={compact ? "small" : "middle"} className={compact ? "w-full" : "max-w-xs"} allowClear placeholder={compact ? "搜索素材" : "搜索素材标题、备注、标签"} onSearch={(value) => { setKeyword(value); setPage(1); }} />
                    <Select size={compact ? "small" : "middle"} className={compact ? "w-full" : "w-28"} value={kind} onChange={(value) => { setKind(value); setPage(1); }} options={[{ value: "all", label: "全部类型" }, ...Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))]} />
                </> : <Input size={compact ? "small" : "middle"} className={compact ? "w-full" : "max-w-xs"} allowClear aria-label="筛选当前页作品" placeholder="筛选当前页的提示词、模型" value={workFilter} onChange={(event) => setWorkFilter(event.target.value)} />}
                <Button size={compact ? "small" : "middle"} loading={loading} onClick={() => setReload((value) => value + 1)}>刷新</Button>
                <span className="text-xs text-stone-500">共 {total} 项{source === "works" ? " · 搜索仅筛选当前页" : ""}</span>
            </div>
            {source === "works" ? <p className="text-sm text-stone-500">成功生成的作品会自动显示，无需手动保存到素材库。可翻页查看更早的作品。</p> : null}
            {error ? <Alert type="error" showIcon title={error} action={<Button size="small" onClick={() => setReload((value) => value + 1)}>重试</Button>} /> : null}
            <Spin spinning={loading}>
                <div className="min-h-32">
                    {!visible.length && !loading && !error ? <Empty description={source === "works" ? filter ? "当前页没有匹配作品，可清空筛选或翻页查看" : "暂无生成成功的作品" : "暂无匹配素材"} /> : null}
                    <div className={compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
                        {visible.map((entry) => {
                            const available = canTransferItem(entry.item);
                            return (
                                <Card key={entry.key} size="small" styles={compact ? { body: { padding: 8 } } : undefined} className={`${compact ? "min-w-0 " : ""}${selected[entry.key] ? "!border-blue-500" : ""}`}>
                                    <button type="button" aria-label={`预览 ${entry.item.title}`} className={`flex ${compact ? "h-20" : "h-32"} w-full items-center justify-center overflow-hidden rounded bg-stone-100 dark:bg-stone-800`} onClick={() => setPreview(entry)}>
                                        {entry.coverUrl ? <img src={entry.coverUrl} alt={entry.item.title} className="size-full object-cover" /> : entry.item.kind === "text" ? <FileText className="size-8 text-stone-400" /> : <Video className="size-8 text-stone-400" />}
                                    </button>
                                    <p className={compact ? "mt-2 truncate text-xs font-medium" : "mt-3 truncate text-sm font-medium"} title={entry.item.title}>{entry.item.title}</p>
                                    <div className={compact ? "mt-1 flex flex-col items-start gap-1" : "mt-2 flex items-center justify-between gap-2"}>
                                        <Tag>{KIND_LABEL[entry.item.kind]}</Tag>
                                        <span className={`${compact ? "max-w-full " : ""}truncate text-xs text-stone-500`}>{entry.description}</span>
                                    </div>
                                    {!available ? <p className="mt-2 text-xs text-stone-500">{entry.item.kind === "text" ? "文本内容为空，暂不可添加" : "文件暂不可用，暂不可添加"}</p> : null}
                                    <div className={compact ? "mt-2 flex flex-col items-stretch gap-2" : "mt-3 flex items-center justify-between gap-2"}>
                                        {onSelect ? <Checkbox disabled={!available || loading} checked={Boolean(selected[entry.key])} onChange={(event) => {
                                            setSelected((previous) => {
                                                const next = { ...previous };
                                                if (event.target.checked) next[entry.key] = entry.item;
                                                else delete next[entry.key];
                                                return next;
                                            });
                                        }}>选择</Checkbox> : null}
                                        {onAdd ? <Button size="small" type="primary" disabled={!available || loading} onClick={() => onAdd(entry.item)}>加入画布</Button> : null}
                                        {entry.url ? <a href={entry.url} download target="_blank" rel="noreferrer"><Button size="small" icon={<Download className="size-3.5" />}>下载</Button></a> : null}
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            </Spin>
            <div className={compact ? "sticky bottom-0 space-y-2 border-t border-stone-100 bg-white/95 py-3 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95" : "flex flex-wrap items-center justify-between gap-3"}>
                <Pagination size={compact ? "small" : undefined} simple={compact} current={page} total={total} pageSize={pageSize} showSizeChanger={!compact} pageSizeOptions={[12, 24, 48]} disabled={loading} onChange={(nextPage, size) => { setPage(size === pageSize ? nextPage : 1); setPageSize(size); }} />
                {onSelect ? <div className={compact ? "flex flex-wrap items-center gap-2" : "flex items-center gap-2"}><Button size={compact ? "small" : "middle"} disabled={!selectedItems.length} onClick={() => setSelected({})}>清空选择</Button><Button size={compact ? "small" : "middle"} type="primary" disabled={!selectedItems.length} onClick={() => onSelect(selectedItems)}>添加所选 {selectedItems.length} 项</Button></div> : null}
            </div>
            <Modal open={preview !== null} title={preview?.item.title} footer={null} width={800} onCancel={() => setPreview(null)} destroyOnHidden>
                {preview?.item.kind === "text" ? <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words">{preview.item.textContent}</pre> : preview?.url ? preview.item.kind === "video" ? <video controls src={preview.url} className="max-h-[60vh] w-full bg-black" /> : <img src={preview.url} alt={preview.item.title} className="max-h-[60vh] w-full object-contain" /> : <Empty description="文件暂不可用" />}
            </Modal>
        </div>
    );
}
