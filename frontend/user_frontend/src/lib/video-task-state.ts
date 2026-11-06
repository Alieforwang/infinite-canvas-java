import type { VideoTaskView } from "@/api/video-tasks";

export function isTaskActive(task: Pick<VideoTaskView, "status">): boolean {
    return task.status === "queued" || task.status === "running";
}

export const TASK_STATUS_LABEL: Record<VideoTaskView["status"], string> = {
    queued: "排队中",
    running: "生成中",
    succeeded: "已完成",
    failed: "生成失败",
    cancelled: "已取消",
};

export function taskCreditSummary(task: VideoTaskView): string {
    if (isTaskActive(task)) return `已冻结 ${task.heldCredits} 积分，完成后按实际用量结算`;
    if (task.status === "succeeded") return `实际消耗 ${task.settledCredits} 积分`;
    // Task terminal state and credit finalization are committed together by the backend.
    return task.heldCredits > 0
        ? `本次未消费，冻结的 ${task.heldCredits} 积分已退回`
        : "本次未消费积分";
}

export function taskProgress(task: VideoTaskView): number {
    return task.status === "succeeded" ? 100 : Math.max(0, Math.min(100, task.progress || 0));
}
