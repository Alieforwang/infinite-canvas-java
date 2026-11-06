import { http } from "@/api/http";
import { getImageTask } from "@/api/image-tasks";
import type { FileView } from "@/api/files";

export type PageResult<T> = {
    items: T[];
    page: number;
    pageSize: number;
    total: number;
    hasNext: boolean;
};

export type VideoTaskView = {
    taskNo: string;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    progress: number;
    modelName: string;
    prompt: string;
    params: Record<string, unknown>;
    referenceFileNos: string[];
    heldCredits: number;
    settledCredits: number;
    errorCode?: string;
    errorMessage?: string;
    file?: FileView | null;
    createdAt?: string;
    finishedAt?: string;
};

export type CreateTaskInput = {
    modelKey: string;
    prompt: string;
    seconds: number;
    resolution: string;
    size: string;
    ratio: string;
    generateAudio: boolean;
    watermark: boolean;
    mode: "frames" | "reference";
    referenceFileNos: string[];
};

export type CreateTaskResult = {
    taskNo: string;
    status: VideoTaskView["status"];
    estimatedCredits: number;
    heldCredits: number;
    pollAfterMs: number;
};

export async function createTask(input: CreateTaskInput): Promise<CreateTaskResult> {
    const form = new FormData();
    form.append("modelKey", input.modelKey);
    form.append("prompt", input.prompt);
    form.append("seconds", String(input.seconds));
    form.append("resolution", input.resolution);
    form.append("size", input.size);
    form.append("ratio", input.ratio);
    form.append("generateAudio", String(input.generateAudio));
    form.append("watermark", String(input.watermark));
    form.append("mode", input.mode);
    form.append("referenceFileNos", JSON.stringify(input.referenceFileNos));
    return http.post<unknown, CreateTaskResult>("/video-tasks", form, {
        headers: {
            "Content-Type": "multipart/form-data",
            "Idempotency-Key": crypto.randomUUID(),
        },
        timeout: 120_000,
    });
}

export function listTasks(status?: string, page = 1, pageSize = 20): Promise<PageResult<VideoTaskView>> {
    return http.get<unknown, PageResult<VideoTaskView>>("/video-tasks", {
        params: { status: status || undefined, page, pageSize },
    });
}

export function isImageTask(task: Pick<VideoTaskView, "taskNo" | "params">): boolean {
    return task.taskNo.startsWith("img_") || task.params.capability === "image";
}

export function getTask(taskNo: string): Promise<VideoTaskView> {
    return taskNo.startsWith("img_") ? getImageTask(taskNo)
        : http.get<unknown, VideoTaskView>(`/video-tasks/${encodeURIComponent(taskNo)}`);
}

export function cancelTask(taskNo: string): Promise<{ taskNo: string; status: string; refundCredits: number }> {
    if (taskNo.startsWith("img_")) return Promise.reject(new Error("图片生成正在处理，暂不支持取消，请等待处理结果"));
    return http.post<unknown, { taskNo: string; status: string; refundCredits: number }>(
        `/video-tasks/${taskNo}/cancel`,
    );
}

export function deleteTask(taskNo: string): Promise<void> {
    return http.delete<unknown, void>(`/video-tasks/${taskNo}`);
}
