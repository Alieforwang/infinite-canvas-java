import type { PageResult, VideoTaskView } from "@/api/video-tasks";
import { isTaskActive } from "@/lib/video-task-state";

export type TaskMonitorDependencies = {
    listTasks: (status?: string, page?: number, pageSize?: number) => Promise<PageResult<VideoTaskView>>;
    getTask: (taskNo: string) => Promise<VideoTaskView>;
    knownTasks: () => Record<string, VideoTaskView>;
    onSnapshot: (tasks: VideoTaskView[]) => void;
    onError: (message: string) => void;
};

/** One shared request at a time. Only the server can move a task into a terminal state. */
export function createVideoTaskMonitor(deps: TaskMonitorDependencies) {
    let generation = 0;
    let pending: Promise<void> | null = null;

    async function listActive(status: "queued" | "running") {
        const items: VideoTaskView[] = [];
        let page = 1;
        let result: PageResult<VideoTaskView>;
        do {
            result = await deps.listTasks(status, page++, 100);
            items.push(...result.items);
        } while (result.hasNext);
        return items;
    }

    function invalidate() {
        generation += 1;
        pending = null;
    }

    function refresh(): Promise<void> {
        if (pending) return pending;
        const requestGeneration = generation;
        const known = Object.values(deps.knownTasks());
        const request = (async () => {
            try {
                const [recent, queued, running] = await Promise.all([
                    deps.listTasks(undefined, 1, 20), listActive("queued"), listActive("running"),
                ]);
                if (generation !== requestGeneration) return;
                const snapshot = new Map<string, VideoTaskView>();
                // Separate list queries can observe different instants. Terminal state wins.
                [...recent.items, ...queued, ...running].forEach((task) => {
                    const previous = snapshot.get(task.taskNo);
                    if (previous && !isTaskActive(previous) && isTaskActive(task)) return;
                    if (previous?.status === "running" && task.status === "queued") return;
                    snapshot.set(task.taskNo, task);
                });
                // A long-running task can complete outside the recent page. Reconcile it by ID.
                const missing = known.filter((task) => isTaskActive(task) && !snapshot.has(task.taskNo));
                const details = await Promise.allSettled(missing.map((task) => deps.getTask(task.taskNo)));
                if (generation !== requestGeneration) return;
                let detailError: string | undefined;
                details.forEach((result) => {
                    if (result.status === "fulfilled") snapshot.set(result.value.taskNo, result.value);
                    else detailError = result.reason instanceof Error ? result.reason.message : "部分任务状态暂时无法更新";
                });
                deps.onSnapshot([...snapshot.values()]);
                if (detailError) deps.onError(detailError);
            } catch (error) {
                if (generation === requestGeneration) {
                    deps.onError(error instanceof Error ? error.message : "任务状态暂时无法更新");
                }
            }
        })();
        pending = request;
        void request.finally(() => { if (pending === request) pending = null; });
        return request;
    }

    return { refresh, invalidate };
}
