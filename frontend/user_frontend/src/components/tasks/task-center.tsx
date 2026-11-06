import { useEffect, useRef, useState } from "react";
import { Alert, App, Badge, Button, Drawer, Empty, Popconfirm } from "antd";
import { ListVideo, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { isImageTask } from "@/api/video-tasks";
import { TaskFeedback } from "@/components/tasks/task-feedback";
import { isTaskActive, TASK_STATUS_LABEL } from "@/lib/video-task-state";
import { useAuthStore } from "@/stores/use-auth-store";
import { useVideoTaskStore } from "@/stores/use-video-task-store";

export function TaskCenter() {
    const { notification, message } = App.useApp();
    const navigate = useNavigate();
    const userId = useAuthStore((state) => state.user?.id);
    const { tasks, origins, unread, events, loading, error, initialized, start, refresh, cancel, markRead, dismissEvent } = useVideoTaskStore();
    const [open, setOpen] = useState(false);
    const [cancelling, setCancelling] = useState<Record<string, boolean>>({});
    const notified = useRef(new Set<string>());
    const active = Object.values(tasks).filter(isTaskActive);
    const sorted = Object.values(tasks).sort((a, b) => {
        const activeOrder = Number(isTaskActive(b)) - Number(isTaskActive(a));
        return activeOrder || (b.createdAt || b.taskNo).localeCompare(a.createdAt || a.taskNo);
    });
    const visible = [...sorted.filter(isTaskActive), ...sorted.filter((task) => !isTaskActive(task)).slice(0, 30)];

    const openTask = (taskNo: string) => {
        markRead(taskNo);
        setOpen(false);
        const projectNo = origins[taskNo]?.projectNo;
        navigate(projectNo ? `/canvas/${encodeURIComponent(projectNo)}?task=${encodeURIComponent(taskNo)}` : `/video?task=${encodeURIComponent(taskNo)}`);
    };

    useEffect(() => {
        if (userId === undefined) return;
        setOpen(false);
        setCancelling({});
        const stop = start(userId);
        const keys = notified.current;
        return () => {
            stop();
            keys.forEach((key) => notification.destroy(key));
            keys.clear();
        };
    }, [userId, start, notification]);

    useEffect(() => {
        for (const event of events) {
            const task = tasks[event.taskNo];
            if (task && !notified.current.has(event.id)) {
                notified.current.add(event.id);
                notification.open({
                    key: event.id,
                    title: `${isImageTask(task) ? "图片" : "视频"}任务${TASK_STATUS_LABEL[task.status]}`,
                    description: task.prompt.slice(0, 80) || task.taskNo,
                    duration: 6,
                    actions: <Button type="primary" size="small" onClick={() => openTask(task.taskNo)}>查看任务</Button>,
                    onClose: () => { notified.current.delete(event.id); },
                });
            }
            dismissEvent(event.id);
        }
        // Each event is consumed once; callbacks read the snapshot that completed the task.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events, tasks, notification, dismissEvent]);

    const cancelOne = async (taskNo: string) => {
        setCancelling((state) => ({ ...state, [taskNo]: true }));
        try {
            await cancel(taskNo);
            message.success("任务已取消，账户信息已刷新");
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "取消失败，请刷新任务状态后重试");
            void refresh();
        } finally {
            setCancelling((state) => ({ ...state, [taskNo]: false }));
        }
    };

    return (
        <>
            <Badge count={active.length || unread.length} size="small" offset={[-4, 2]}>
                <Button type="text" icon={<ListVideo className="size-4" />} onClick={() => { setOpen(true); markRead(); }}>
                    任务{active.length ? ` ${active.length}` : ""}
                </Button>
            </Badge>
            <Drawer title="生成任务" open={open} onClose={() => setOpen(false)} size={460}
                extra={<Button type="text" icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void refresh()}>刷新</Button>}>
                <p className="mb-4 text-xs text-stone-500">正在处理 {active.length} 个任务 · 展示当前任务与最近完成记录</p>
                {error ? <Alert className="mb-4" type="warning" showIcon title="状态更新暂时中断" description={`${error}。保留上次状态，连接恢复后会继续更新。`} /> : null}
                {!visible.length ? <Empty description={!initialized && loading ? "正在读取任务…" : "还没有生成任务"} /> : null}
                <div className="space-y-4">
                    {visible.map((task) => (
                        <article key={task.taskNo} className="space-y-3 rounded-xl border border-stone-200 p-4 dark:border-stone-800">
                            <div>
                                <p className="line-clamp-2 text-sm font-medium">{task.prompt || "视频生成"}</p>
                                <p className="mt-1 text-xs text-stone-500">{task.modelName}{origins[task.taskNo]?.projectTitle ? ` · ${origins[task.taskNo].projectTitle}` : ""}</p>
                                <p className="mt-1 break-all text-[11px] text-stone-400">{task.taskNo}</p>
                            </div>
                            <TaskFeedback task={task} />
                            <div className="flex justify-end gap-2">
                                {isTaskActive(task) && !isImageTask(task) ? <Popconfirm title="取消这个生成任务？" description="取消结果以服务器确认的信息为准。" onConfirm={() => cancelOne(task.taskNo)} okText="取消任务" cancelText="继续等待">
                                    <Button size="small" danger loading={cancelling[task.taskNo]}>取消任务</Button>
                                </Popconfirm> : null}
                                <Button size="small" type="primary" onClick={() => openTask(task.taskNo)}>{origins[task.taskNo]?.projectNo ? "打开画布" : task.status === "succeeded" ? "查看结果" : "查看详情"}</Button>
                            </div>
                        </article>
                    ))}
                </div>
            </Drawer>
        </>
    );
}
