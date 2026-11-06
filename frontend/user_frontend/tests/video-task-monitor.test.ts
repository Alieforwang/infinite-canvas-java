import { describe, expect, test } from "bun:test";
import type { PageResult, VideoTaskView } from "../src/api/video-tasks";
import { createVideoTaskMonitor, type TaskMonitorDependencies } from "../src/services/video-task-monitor";
import { transferItemsToNodes, type CanvasTransferItem } from "../src/lib/canvas-transfer";

function task(taskNo: string, status: VideoTaskView["status"] = "running"): VideoTaskView {
    return {
        taskNo, status, progress: status === "succeeded" ? 100 : 50,
        modelName: "test-model", channelName: "test-channel", prompt: `Prompt ${taskNo}`,
        params: {}, referenceFileNos: [], heldCredits: 12, settledCredits: status === "succeeded" ? 12 : 0,
        ...(status === "succeeded" ? { file: { fileNo: `file-${taskNo}`, url: `/files/${taskNo}`, contentType: "video/mp4" } } : {}),
    };
}

function page(items: VideoTaskView[] = [], current = 1, hasNext = false, pageSize = 100): PageResult<VideoTaskView> {
    return { items, page: current, pageSize, total: items.length + (hasNext ? 1 : 0), hasNext };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
    return { promise, resolve, reject };
}

function harness(options: {
    initial?: VideoTaskView[];
    listTasks: TaskMonitorDependencies["listTasks"];
    getTask?: TaskMonitorDependencies["getTask"];
}) {
    const state: Record<string, VideoTaskView> = Object.fromEntries((options.initial ?? []).map((item) => [item.taskNo, item]));
    const snapshots: VideoTaskView[][] = [];
    const errors: string[] = [];
    const getCalls: string[] = [];
    const monitor = createVideoTaskMonitor({
        listTasks: options.listTasks,
        getTask: async (taskNo) => {
            getCalls.push(taskNo);
            if (!options.getTask) throw new Error(`Unexpected getTask(${taskNo})`);
            return options.getTask(taskNo);
        },
        knownTasks: () => state,
        onSnapshot: (items) => {
            snapshots.push(items);
            items.forEach((item) => { state[item.taskNo] = item; });
        },
        onError: (message) => { errors.push(message); },
    });
    return { monitor, state, snapshots, errors, getCalls };
}

describe("video task monitor", () => {
    test.each(["succeeded", "failed", "cancelled"] as const)("prefers recent %s over an older running result from a concurrent active query", async (status) => {
        const activeQuery = deferred<PageResult<VideoTaskView>>();
        const activeStarted = deferred<void>();
        const oldRunning = task("same-task", "running");
        const terminal = task(oldRunning.taskNo, status);
        const subject = harness({
            initial: [oldRunning],
            listTasks: async (filter) => {
                if (filter === "running") {
                    activeStarted.resolve();
                    return activeQuery.promise;
                }
                return page(filter === undefined ? [terminal] : []);
            },
        });
        const pending = subject.monitor.refresh();
        await activeStarted.promise;
        // The active query returns a stale running row after recent already saw completion.
        activeQuery.resolve(page([oldRunning]));
        await pending;
        expect(subject.snapshots).toEqual([[terminal]]);
        expect(subject.state[terminal.taskNo]).toEqual(terminal);
        expect(subject.getCalls).toEqual([]);
        expect(subject.errors).toEqual([]);
    });

    test("keeps a server-running task active through 160 refreshes", async () => {
        const running = task("long-running");
        const subject = harness({
            initial: [running],
            listTasks: async (status) => page(status === "queued" ? [] : [running]),
        });
        for (let iteration = 0; iteration < 160; iteration += 1) {
            await subject.monitor.refresh();
            expect(subject.state[running.taskNo].status).toBe("running");
        }
        expect(subject.snapshots).toHaveLength(160);
        expect(subject.snapshots.flat().some((item) => item.status === "failed")).toBe(false);
        expect(subject.errors).toEqual([]);
        expect(subject.getCalls).toEqual([]);
    });

    test("reports an offline error and preserves the previous running state", async () => {
        const running = task("offline-running");
        const subject = harness({
            initial: [running],
            listTasks: async () => { throw new Error("Network offline"); },
        });
        await subject.monitor.refresh();
        expect(subject.errors).toEqual(["Network offline"]);
        expect(subject.snapshots).toHaveLength(0);
        expect(subject.state[running.taskNo]).toEqual(running);
        expect(subject.state[running.taskNo].status).toBe("running");
    });

    test("reconciles an old active task missing from recent and active pages by ID", async () => {
        const old = task("old-task");
        const completed = task(old.taskNo, "succeeded");
        const recent = task("recent-task", "succeeded");
        const subject = harness({
            initial: [old],
            listTasks: async (status) => page(status === undefined ? [recent] : []),
            getTask: async () => completed,
        });
        await subject.monitor.refresh();
        expect(subject.getCalls).toEqual([old.taskNo]);
        expect(subject.state[old.taskNo]).toEqual(completed);
        expect(subject.snapshots[0].map((item) => item.taskNo).sort()).toEqual([old.taskNo, recent.taskNo].sort());
        expect(subject.errors).toEqual([]);
    });

    test("reads every queued and running page using hasNext", async () => {
        const calls: Array<{ status?: string; current: number; size: number }> = [];
        const queued = [task("queued-1", "queued"), task("queued-2", "queued")];
        const running = [task("running-1"), task("running-2"), task("running-3")];
        const subject = harness({
            listTasks: async (status, current = 1, size = 20) => {
                calls.push({ status, current, size });
                if (status === undefined) return page([], current, false, size);
                const items = status === "queued" ? queued : running;
                return page([items[current - 1]], current, current < items.length, size);
            },
        });
        await subject.monitor.refresh();
        expect(calls.filter((call) => call.status === "queued").map((call) => call.current)).toEqual([1, 2]);
        expect(calls.filter((call) => call.status === "running").map((call) => call.current)).toEqual([1, 2, 3]);
        expect(calls.filter((call) => call.status !== undefined).every((call) => call.size === 100)).toBe(true);
        expect(calls.find((call) => call.status === undefined)?.size).toBe(20);
        expect(Object.keys(subject.state).sort()).toEqual([...queued, ...running].map((item) => item.taskNo).sort());
        expect(subject.errors).toEqual([]);
    });

    test("shares the same promise and requests between concurrent refresh callers", async () => {
        const gate = deferred<PageResult<VideoTaskView>>();
        const calls: Array<string | undefined> = [];
        const running = task("shared");
        const subject = harness({
            listTasks: async (status) => {
                calls.push(status);
                return status === undefined ? gate.promise : page([]);
            },
        });
        const first = subject.monitor.refresh();
        const second = subject.monitor.refresh();
        const third = subject.monitor.refresh();
        expect(first).toBe(second);
        expect(second).toBe(third);
        expect(calls).toHaveLength(3);
        gate.resolve(page([running]));
        await Promise.all([first, second, third]);
        expect(subject.snapshots).toHaveLength(1);
        expect(subject.state[running.taskNo]).toEqual(running);
    });

    test("ignores an invalidated response while a new refresh can publish", async () => {
        const stale = deferred<PageResult<VideoTaskView>>();
        let recentCalls = 0;
        const fresh = task("fresh", "succeeded");
        const subject = harness({
            listTasks: async (status) => {
                if (status !== undefined) return page([]);
                recentCalls += 1;
                return recentCalls === 1 ? stale.promise : page([fresh]);
            },
        });
        const previous = subject.monitor.refresh();
        subject.monitor.invalidate();
        const current = subject.monitor.refresh();
        expect(current).not.toBe(previous);
        await current;
        stale.resolve(page([task("stale")]));
        await previous;
        expect(subject.snapshots).toHaveLength(1);
        expect(subject.snapshots[0]).toEqual([fresh]);
        expect(subject.state.stale).toBeUndefined();
        expect(subject.errors).toEqual([]);
    });

    test("ignores a late detail lookup after invalidation", async () => {
        const detail = deferred<VideoTaskView>();
        const started = deferred<void>();
        const old = task("old-detail");
        const subject = harness({
            initial: [old],
            listTasks: async () => page([]),
            getTask: async () => { started.resolve(); return detail.promise; },
        });
        const pending = subject.monitor.refresh();
        await started.promise;
        subject.monitor.invalidate();
        detail.resolve(task(old.taskNo, "succeeded"));
        await pending;
        expect(subject.snapshots).toHaveLength(0);
        expect(subject.state[old.taskNo].status).toBe("running");
        expect(subject.errors).toEqual([]);
    });

    test("retains missing active state on detail failure while publishing other results", async () => {
        const old = task("missing-detail");
        const recent = task("another-complete", "succeeded");
        const subject = harness({
            initial: [old],
            listTasks: async (status) => page(status === undefined ? [recent] : []),
            getTask: async () => { throw new Error("Detail unavailable"); },
        });
        await subject.monitor.refresh();
        expect(subject.state[old.taskNo].status).toBe("running");
        expect(subject.state[recent.taskNo].status).toBe("succeeded");
        expect(subject.errors).toEqual(["Detail unavailable"]);
    });
});

describe("canvas transfer items", () => {
    test("deduplicates generated tasks and keeps their IDs stable across batches", () => {
        const work: CanvasTransferItem = { kind: "video", title: "Generated", fileNo: "file-1", taskNo: "task-no-1" };
        const first = transferItemsToNodes([work, { ...work, title: "Same work from assets" }]);
        const second = transferItemsToNodes([work]);
        expect(first).toHaveLength(1);
        expect(first[0].id).toBe("task-task-no-1");
        expect(second[0].id).toBe(first[0].id);
        // This is how callers skip an item previously inserted into an existing canvas.
        const existing = new Set(first.map((node) => node.id));
        expect(second.filter((node) => !existing.has(node.id))).toEqual([]);
    });

    test("accepts text and media with content while skipping empty inputs", () => {
        const nodes = transferItemsToNodes([
            { kind: "text", title: "Script", textContent: "Scene one" },
            { kind: "text", title: "Blank", textContent: " \n\t " },
            { kind: "text", title: "Missing text" },
            { kind: "image", title: "Missing image" },
            { kind: "video", title: "Missing video", fileNo: "" },
            { kind: "image", title: "Image", fileNo: "image-1" },
            { kind: "video", title: "Video", fileNo: "video-1" },
        ]);
        expect(nodes).toHaveLength(3);
        expect(nodes.map((node) => node.type)).toEqual(["text", "image", "video"]);
        expect(nodes[0].content).toBe("Scene one");
        expect(nodes[1].fileNo).toBe("image-1");
        expect(nodes[2].fileNo).toBe("video-1");
        expect(new Set(nodes.map((node) => node.id)).size).toBe(3);
    });
});
