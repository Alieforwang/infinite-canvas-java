import { http } from "@/api/http";
import type { VideoTaskView } from "@/api/video-tasks";

export type CreateImageTaskInput = {
    modelKey: string;
    prompt: string;
    size: string;
    referenceFileNos: string[];
};

/** One key belongs to one submission; callers reuse it when recovering a timeout. */
export function createImageTask(input: CreateImageTaskInput, idempotencyKey: string): Promise<VideoTaskView> {
    return http.post<unknown, VideoTaskView>("/image-tasks", input, {
        headers: { "Idempotency-Key": idempotencyKey },
        timeout: 300_000,
    });
}

export function getImageTask(taskNo: string): Promise<VideoTaskView> {
    return http.get<unknown, VideoTaskView>(`/image-tasks/${encodeURIComponent(taskNo)}`);
}
