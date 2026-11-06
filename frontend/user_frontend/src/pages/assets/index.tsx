import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Card, Empty, Form, Input, Modal, Pagination, Popconfirm, Select, Spin, Tabs, Tag, Upload } from "antd";
import type { UploadProps } from "antd";
import { Download, FileText, PencilLine, Plus, RefreshCw, Search, Trash2, Upload as UploadIcon, Video } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { createAsset, deleteAsset, listAssets, updateAsset, type AssetView } from "@/api/assets";
import { uploadFile } from "@/api/files";
import { useAuthStore } from "@/stores/use-auth-store";
import { AddToCanvasModal } from "@/components/works/add-to-canvas-modal";
import { TransferLibrary } from "@/components/works/transfer-library";
import { assetToTransferItem, canTransferItem, type CanvasTransferItem } from "@/lib/canvas-transfer";

const KIND_LABEL: Record<string, string> = { video: "视频", image: "图片", text: "文本" };

export default function AssetsPage() {
    const { message } = App.useApp();
    const refreshAccount = useAuthStore((state) => state.refreshAccount);
    const [assets, setAssets] = useState<AssetView[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(12);
    const [kind, setKind] = useState("all");
    const [keyword, setKeyword] = useState("");
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState<AssetView | null>(null);
    const [creatingText, setCreatingText] = useState(false);
    const [preview, setPreview] = useState<AssetView | null>(null);
    const [form] = Form.useForm();
    const [searchParams, setSearchParams] = useSearchParams();
    const source = searchParams.get("tab") === "works" ? "works" : "assets";
    const setSource = (value: string) => setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        next.set("tab", value);
        return next;
    });
    const [transferItems, setTransferItems] = useState<CanvasTransferItem[]>([]);
    const [loadError, setLoadError] = useState("");
    const loadRef = useRef(0);

    const load = async (targetPage = page, targetKind = kind, targetKeyword = keyword, targetSize = pageSize) => {
        const request = ++loadRef.current;
        setLoading(true);
        setLoadError("");
        try {
            const result = await listAssets({ page: targetPage, pageSize: targetSize, kind: targetKind, keyword: targetKeyword });
            if (request !== loadRef.current) return;
            setAssets(result.items);
            setTotal(result.total);
            setPage(result.page);
        } catch (error) {
            if (request === loadRef.current) {
                setAssets([]);
                setLoadError(error instanceof Error ? error.message : "素材加载失败");
            }
        } finally {
            if (request === loadRef.current) setLoading(false);
        }
    };

    useEffect(() => {
        void load(1, kind, keyword);
        return () => { loadRef.current += 1; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onSearch = (value: string) => {
        setKeyword(value);
        void load(1, kind, value);
    };

    const uploadProps: UploadProps = {
        showUploadList: false,
        accept: "image/jpeg,image/png,image/webp,video/mp4,video/webm",
        beforeUpload: async (file) => {
            const raw = file as File;
            try {
                const uploaded = await uploadFile(raw);
                const isVideo = raw.type.startsWith("video/");
                await createAsset({
                    kind: isVideo ? "video" : "image",
                    title: raw.name,
                    fileNo: uploaded.fileNo,
                    source: "UPLOAD",
                });
                message.success("已上传到我的素材");
                setSource("assets");
                await load(1, kind, keyword);
                void refreshAccount();
            } catch (error) {
                message.error(error instanceof Error ? error.message : "上传失败");
            }
            return false;
        },
    };

    const openEdit = (asset: AssetView) => {
        setEditing(asset);
        form.setFieldsValue({
            title: asset.title,
            tags: (asset.tags || []).join(","),
            note: asset.note || "",
            textContent: asset.textContent || "",
        });
    };

    const submitEdit = async () => {
        const values = await form.validateFields();
        try {
            if (editing) {
                await updateAsset(editing.assetNo, {
                    title: values.title,
                    tags: values.tags ? String(values.tags).split(",").map((item: string) => item.trim()).filter(Boolean) : [],
                    note: values.note,
                    ...(editing.kind === "text" ? { textContent: values.textContent } : {}),
                });
                message.success("已保存");
            } else {
                await createAsset({
                    kind: "text",
                    title: values.title,
                    textContent: values.textContent,
                    tags: values.tags ? String(values.tags).split(",").map((item: string) => item.trim()).filter(Boolean) : [],
                    note: values.note,
                    source: "MANUAL",
                });
                message.success("文本资产已创建");
            }
            setEditing(null);
            setCreatingText(false);
            await load(1, kind, keyword);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存失败");
        }
    };

    const remove = async (asset: AssetView) => {
        try {
            await deleteAsset(asset.assetNo);
            message.success("已删除");
            await load(page, kind, keyword);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除失败");
        }
    };

    const openCreateText = () => {
        setSource("assets");
        setCreatingText(true);
        form.resetFields();
    };

    return (
        <div className="mx-auto w-full max-w-7xl px-6 py-8">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5 dark:border-stone-800">
                <div>
                    <p className="text-xs text-stone-500">创作资源</p>
                    <h1 className="mt-2 text-2xl font-semibold text-stone-950 dark:text-stone-100">素材与作品</h1>
                    <p className="mt-1 text-sm text-stone-500">管理上传素材，找回成功生成的作品，随时加入新画布或已有画布。</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Upload {...uploadProps}>
                        <Button icon={<UploadIcon className="size-4" />}>上传素材</Button>
                    </Upload>
                    <Button icon={<Plus className="size-4" />} onClick={openCreateText}>
                        新建文本
                    </Button>
                    {source === "assets" ? <Button aria-label="刷新素材" icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void load(page, kind, keyword)} /> : null}
                </div>
            </div>

            <Tabs className="mt-4" activeKey={source} onChange={setSource} items={[{ key: "assets", label: "我的素材" }, { key: "works", label: "生成作品" }]} />
            {source === "assets" ? <>
            <div className="mt-5 flex flex-wrap items-center gap-3">
                <Input.Search
                    allowClear
                    placeholder="搜索标题、备注、标签"
                    prefix={<Search className="size-4 text-stone-400" />}
                    onSearch={onSearch}
                    className="max-w-xs"
                />
                <Select
                    value={kind}
                    className="w-32"
                    options={[
                        { value: "all", label: "全部类型" },
                        { value: "video", label: "视频" },
                        { value: "image", label: "图片" },
                        { value: "text", label: "文本" },
                    ]}
                    onChange={(value) => {
                        setKind(value);
                        void load(1, value, keyword);
                    }}
                />
                <span className="text-xs text-stone-400">共 {total} 项</span>
            </div>

            {loadError ? <Alert className="mt-4" type="error" showIcon title={loadError} action={<Button size="small" onClick={() => void load()}>重试</Button>} /> : null}
            <Spin spinning={loading}>
            {assets.length === 0 && !loading && !loadError ? (
                <div className="mt-16 flex flex-col items-center justify-center gap-3">
                    <Empty description="还没有素材，上传图片/视频或新建文本开始沉淀" />
                    <Upload {...uploadProps}>
                        <Button type="primary" icon={<UploadIcon className="size-4" />}>
                            上传第一个素材
                        </Button>
                    </Upload>
                </div>
            ) : (
                <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {assets.map((asset) => (
                        <Card
                            key={asset.assetNo}
                            className="group overflow-hidden"
                            styles={{ body: { padding: 0 } }}
                            cover={
                                <button
                                    type="button"
                                    className="flex h-40 w-full items-center justify-center overflow-hidden bg-stone-100 dark:bg-stone-800"
                                    onClick={() => setPreview(asset)}
                                >
                                    {asset.coverUrl ? (
                                        <img src={asset.coverUrl} alt={asset.title} className="size-full object-cover" />
                                    ) : asset.kind === "text" ? (
                                        <div className="flex flex-col items-center gap-1 text-stone-400">
                                            <FileText className="size-8" />
                                            <span className="text-[10px]">文本</span>
                                        </div>
                                    ) : (
                                        <Video className="size-8 text-stone-400" />
                                    )}
                                </button>
                            }
                        >
                            <div className="space-y-2 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <Tag className="!mr-0">{KIND_LABEL[asset.kind] ?? asset.kind}</Tag>
                                    <span className="text-[11px] text-stone-400">{asset.createdAt?.replace("T", " ").slice(0, 16)}</span>
                                </div>
                                <Button block size="small" type="primary" disabled={loading || !canTransferItem(assetToTransferItem(asset))} onClick={() => setTransferItems([assetToTransferItem(asset)])}>加入画布</Button>
                                <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100" title={asset.title}>
                                    {asset.title}
                                </p>
                                {asset.tags?.length ? (
                                    <div className="flex flex-wrap gap-1">
                                        {asset.tags.slice(0, 3).map((tag) => (
                                            <Tag key={tag} className="!mr-0 !text-[10px]">
                                                {tag}
                                            </Tag>
                                        ))}
                                    </div>
                                ) : null}
                                <div className="flex items-center justify-between pt-1">
                                    <div className="flex items-center gap-1">
                                        <Button size="small" type="text" icon={<PencilLine className="size-3.5" />} onClick={() => openEdit(asset)} />
                                        <Popconfirm title="删除该素材？" onConfirm={() => void remove(asset)}>
                                            <Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />} />
                                        </Popconfirm>
                                    </div>
                                    {asset.file ? (
                                        <a href={asset.file.url} download>
                                            <Button size="small" type="text" icon={<Download className="size-3.5" />} />
                                        </a>
                                    ) : (
                                        <Button size="small" type="text" onClick={() => void navigator.clipboard?.writeText(asset.textContent || "")}>
                                            复制
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            </Spin>
            {total > pageSize ? (
                <div className="mt-8 flex justify-end">
                    <Pagination
                        current={page}
                        pageSize={pageSize}
                        total={total}
                        showSizeChanger
                        disabled={loading}
                        onChange={(nextPage, nextSize) => {
                            setPageSize(nextSize);
                            void load(nextSize === pageSize ? nextPage : 1, kind, keyword, nextSize);
                        }}
                    />
                </div>
            ) : null}

            </> : <TransferLibrary source="works" onAdd={(item) => setTransferItems([item])} />}
            <AddToCanvasModal open={transferItems.length > 0} onClose={() => setTransferItems([])} items={transferItems} />

            <Modal
                open={editing !== null || creatingText}
                title={editing ? "编辑素材" : "新建文本素材"}
                onCancel={() => {
                    setEditing(null);
                    setCreatingText(false);
                }}
                onOk={() => void submitEdit()}
                okText="保存"
            >
                <Form form={form} layout="vertical" className="pt-2">
                    <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
                        <Input maxLength={200} />
                    </Form.Item>
                    <Form.Item name="tags" label="标签（逗号分隔）">
                        <Input placeholder="例如：赛博朋克,夜景" />
                    </Form.Item>
                    <Form.Item name="note" label="备注">
                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={1000} />
                    </Form.Item>
                    {editing?.kind === "text" || creatingText ? (
                        <Form.Item name="textContent" label="文本内容">
                            <Input.TextArea autoSize={{ minRows: 4, maxRows: 10 }} maxLength={20000} />
                        </Form.Item>
                    ) : null}
                </Form>
            </Modal>

            <Modal
                open={preview !== null}
                footer={null}
                width={860}
                onCancel={() => setPreview(null)}
                title={preview?.title}
            >
                {preview?.kind === "video" && preview.file ? (
                    <video src={preview.file.url} controls className="max-h-[70vh] w-full bg-black" />
                ) : preview?.kind === "image" && preview.file ? (
                    <img src={preview.file.url} alt={preview.title} className="max-h-[70vh] w-full object-contain" />
                ) : (
                    <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-sm text-stone-700 dark:text-stone-200">
                        {preview?.textContent}
                    </pre>
                )}
            </Modal>
        </div>
    );
}
