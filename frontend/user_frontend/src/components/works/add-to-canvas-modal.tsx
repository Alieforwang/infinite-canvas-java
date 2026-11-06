import { useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Modal, Select, Space, Spin } from "antd";
import { useNavigate } from "react-router-dom";

import { createProject, emptyDocument, getProject, listProjects, updateProject, type ProjectSummary } from "@/api/canvas";
import { ApiError } from "@/api/http";
import { transferItemsToNodes, type CanvasTransferItem } from "@/lib/canvas-transfer";

export type AddToCanvasModalProps = { open: boolean; onClose: () => void; items: CanvasTransferItem[] };

export function AddToCanvasModal({ open, onClose, items }: AddToCanvasModalProps) {
    const navigate = useNavigate();
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [target, setTarget] = useState<string | undefined>();
    const [title, setTitle] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState<{ projectNo: string; added: number; skipped: number } | null>(null);
    const [reload, setReload] = useState(0);
    const requestRef = useRef(0);
    const savingRef = useRef(false);

    useEffect(() => {
        const request = ++requestRef.current;
        if (!open) return;
        setLoading(true);
        setError("");
        setResult(null);
        setTarget(undefined);
        setTitle("");
        void listProjects().then((value) => {
            if (request === requestRef.current) setProjects(value);
        }).catch((cause: unknown) => {
            if (request === requestRef.current) setError(cause instanceof Error ? cause.message : "画布列表加载失败");
        }).finally(() => {
            if (request === requestRef.current) setLoading(false);
        });
        return () => { requestRef.current += 1; };
    }, [open, reload]);

    const submit = async () => {
        if (savingRef.current || loading || result) return;
        const nodes = transferItemsToNodes(items);
        if (!nodes.length) {
            setError("没有可添加的内容：媒体需要有效文件，文本内容不能为空。");
            return;
        }
        savingRef.current = true;
        setSaving(true);
        setError("");
        const request = requestRef.current;
        try {
            if (!target) {
                const project = await createProject(title.trim() || "我的创作画布", { ...emptyDocument(), nodes });
                if (request === requestRef.current) setResult({ projectNo: project.projectNo, added: nodes.length, skipped: 0 });
            } else {
                const project = await getProject(target);
                const existing = new Set(project.document.nodes.map((node) => node.id));
                const fresh = nodes.filter((node) => !existing.has(node.id));
                const bottom = project.document.nodes.reduce((max, node) => Math.max(max, node.y + node.height), 0);
                const positioned = fresh.map((node) => ({ ...node, y: node.y + (project.document.nodes.length ? bottom + 40 : 0) }));
                if (positioned.length) {
                    await updateProject(project.projectNo, project.version, project.title, {
                        ...project.document,
                        nodes: [...project.document.nodes, ...positioned],
                    });
                }
                if (request === requestRef.current) setResult({ projectNo: project.projectNo, added: positioned.length, skipped: nodes.length - positioned.length });
            }
        } catch (cause) {
            if (request === requestRef.current) {
                const conflict = cause instanceof ApiError && (cause.status === 409 || /CONFLICT|VERSION/i.test(cause.code));
                setError(conflict ? "画布已被其他操作更新，本次添加未保存。请重新点击添加以读取最新画布后重试。" : cause instanceof Error ? cause.message : "添加失败，请重试");
            }
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            title="加入画布"
            onCancel={onClose}
            closable={!saving}
            maskClosable={!saving}
            keyboard={!saving}
            footer={result ? (
                <Space>
                    <Button onClick={onClose}>完成</Button>
                    <Button type="primary" onClick={() => { onClose(); navigate(`/canvas/${result.projectNo}`); }}>打开画布</Button>
                </Space>
            ) : (
                <Space>
                    <Button disabled={saving} onClick={onClose}>取消</Button>
                    <Button type="primary" loading={saving} disabled={loading || !items.length} onClick={() => void submit()}>添加 {items.length} 项</Button>
                </Space>
            )}
        >
            <div className="space-y-4 py-3">
                {error ? <Alert type="error" showIcon title={error} action={!saving ? <Button size="small" onClick={() => setReload((value) => value + 1)}>刷新画布列表</Button> : undefined} /> : null}
                {result ? (
                    <Alert type="success" showIcon title={`已添加 ${result.added} 项${result.skipped ? `，${result.skipped} 项作品已在画布中，已跳过` : ""}`} />
                ) : (
                    <Spin spinning={loading}>
                        <div className="space-y-3">
                            <p className="text-sm text-stone-500">选择已有画布，或为本次内容创建新画布。</p>
                            <Select
                                className="w-full"
                                value={target ?? "__new__"}
                                disabled={saving}
                                showSearch
                                optionFilterProp="label"
                                onChange={(value) => setTarget(value === "__new__" ? undefined : value)}
                                options={[{ value: "__new__", label: "＋ 新建画布" }, ...projects.map((project) => ({ value: project.projectNo, label: `${project.title} · ${project.nodeCount} 个节点` }))]}
                            />
                            {!target ? <Input aria-label="新画布名称" placeholder="画布名称（可选）" maxLength={200} disabled={saving} value={title} onChange={(event) => setTitle(event.target.value)} /> : null}
                        </div>
                    </Spin>
                )}
            </div>
        </Modal>
    );
}
