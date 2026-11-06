import { useEffect, useState } from "react";
import { App, Button, Card, Empty, Input, Modal } from "antd";
import { FolderOpen, PencilLine, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
    createProject,
    deleteProject,
    emptyDocument,
    getProject,
    listProjects,
    updateProject,
    type ProjectSummary,
} from "@/api/canvas";

export default function CanvasListPage() {
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
    const [renameValue, setRenameValue] = useState("");

    const load = async () => {
        setLoading(true);
        try {
            setProjects(await listProjects());
        } catch (error) {
            message.error(error instanceof Error ? error.message : "画布加载失败");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const create = async () => {
        try {
            const project = await createProject(`未命名画布 ${projects.length + 1}`, emptyDocument());
            navigate(`/canvas/${project.projectNo}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "创建失败");
        }
    };

    const rename = async () => {
        if (!renaming) {
            return;
        }
        try {
            const detail = await getProject(renaming.projectNo);
            await updateProject(detail.projectNo, detail.version, renameValue.trim() || detail.title, detail.document);
            message.success("已重命名");
            setRenaming(null);
            void load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "重命名失败");
        }
    };

    const remove = (project: ProjectSummary) => {
        modal.confirm({
            title: "删除画布？",
            content: `「${project.title}」将被删除。`,
            okText: "删除",
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await deleteProject(project.projectNo);
                    message.success("已删除");
                    void load();
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "删除失败");
                }
            },
        });
    };

    return (
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5 dark:border-stone-800">
                <div>
                    <p className="text-xs text-stone-500">画布项目</p>
                    <h1 className="mt-2 text-2xl font-semibold text-stone-950 dark:text-stone-100">无限画布</h1>
                    <p className="mt-1 text-sm text-stone-500">在画布上编排文本、图片与视频节点，串联多镜头创作。</p>
                </div>
                <div className="flex gap-2">
                    <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void load()} />
                    <Button type="primary" icon={<Plus className="size-4" />} onClick={() => void create()}>
                        新建画布
                    </Button>
                </div>
            </div>

            {projects.length === 0 && !loading ? (
                <div className="mt-16 flex flex-col items-center justify-center gap-3">
                    <Empty description="还没有画布项目，创建一个开始编排" />
                    <Button type="primary" icon={<Plus className="size-4" />} onClick={() => void create()}>
                        新建第一个画布
                    </Button>
                </div>
            ) : (
                <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {projects.map((project) => (
                        <Card
                            key={project.projectNo}
                            className="overflow-hidden"
                            styles={{ body: { padding: 0 } }}
                            cover={
                                <button
                                    type="button"
                                    onClick={() => navigate(`/canvas/${project.projectNo}`)}
                                    className="flex h-44 w-full items-center justify-center overflow-hidden bg-stone-100 dark:bg-stone-800"
                                >
                                    {project.coverUrl ? (
                                        <img src={project.coverUrl} alt={project.title} className="size-full object-cover" />
                                    ) : (
                                        <FolderOpen className="size-10 text-stone-300" />
                                    )}
                                </button>
                            }
                        >
                            <div className="flex items-center justify-between gap-2 p-4">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">{project.title}</p>
                                    <p className="mt-1 text-[11px] text-stone-400">
                                        {project.nodeCount} 个节点 · {project.updatedAt?.replace("T", " ").slice(0, 16)}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                    <Button
                                        size="small"
                                        type="text"
                                        icon={<PencilLine className="size-3.5" />}
                                        onClick={() => {
                                            setRenaming(project);
                                            setRenameValue(project.title);
                                        }}
                                    />
                                    <Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />} onClick={() => remove(project)} />
                                    <Button size="small" type="primary" onClick={() => navigate(`/canvas/${project.projectNo}`)}>
                                        打开
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <Modal
                open={renaming !== null}
                title="重命名画布"
                onCancel={() => setRenaming(null)}
                onOk={() => void rename()}
                okText="保存"
            >
                <Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={200} />
            </Modal>
        </div>
    );
}
