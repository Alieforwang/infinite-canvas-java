import { Progress, Tag } from "antd";
import type { VideoTaskView } from "@/api/video-tasks";
import { isTaskActive, TASK_STATUS_LABEL, taskCreditSummary, taskProgress } from "@/lib/video-task-state";
import { useCurrency } from "@/stores/use-public-settings-store";

export function TaskFeedback({ task }: { task: VideoTaskView }) {
    const active = isTaskActive(task);
    const { exchangePerYuan, currencyText } = useCurrency();
    return (
        <div className="space-y-2 text-xs" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2">
                <Tag color={task.status === "succeeded" ? "success" : task.status === "failed" ? "error" : active ? "processing" : "default"}>
                    {TASK_STATUS_LABEL[task.status]}
                </Tag>
                <span className="text-stone-500">{taskCreditSummary(task, exchangePerYuan)}</span>
            </div>
            {active ? (
                <>
                    <Progress percent={taskProgress(task)} size="small" status="active" aria-label="生成进度" />
                    <p className="text-stone-500">可以切换页面继续创作，完成后会在右上角「任务」中提醒。</p>
                </>
            ) : null}
            {task.status === "failed" && task.errorMessage ? <p className="break-words text-rose-600">{currencyText(task.errorMessage)}</p> : null}
        </div>
    );
}
