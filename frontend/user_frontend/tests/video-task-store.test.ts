import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { http, saveTokens } from "../src/api/http";
import type { AuthResult, MeResult, UserView } from "../src/api/auth";
import type { VideoTaskView } from "../src/api/video-tasks";
import { useAuthStore } from "../src/stores/use-auth-store";
import { useVideoTaskStore } from "../src/stores/use-video-task-store";

class MemoryStorage implements Storage {
    private values = new Map<string, string>();
    get length() { return this.values.size; }
    clear() { this.values.clear(); }
    getItem(key: string) { return this.values.get(key) ?? null; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    removeItem(key: string) { this.values.delete(key); }
    setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((accept) => { resolve = accept; });
    return { promise, resolve };
}

const userA: UserView = { id: 101, email: "a@example.test", displayName: "A", status: "ACTIVE" };
const userB: UserView = { id: 202, email: "b@example.test", displayName: "B", status: "ACTIVE" };
const account = (user: UserView): MeResult => ({
    user,
    credits: { available: user.id * 10, frozen: user.id, totalConsumed: user.id * 2 },
    concurrency: { limit: 3, running: 1 },
});
const authResult = (user: UserView): AuthResult => ({
    user, credits: account(user).credits, accessToken: `token-${user.id}`, refreshToken: `refresh-${user.id}`, expiresIn: 3600,
});

function completedTask(taskNo: string): VideoTaskView {
    return {
        taskNo, status: "succeeded", progress: 100, modelName: "test-model", channelName: "test-channel",
        prompt: "A completed canvas result", params: {}, referenceFileNos: [], heldCredits: 12, settledCredits: 12,
        file: { fileNo: `file-${taskNo}`, url: `/files/${taskNo}`, contentType: "video/mp4" },
    };
}

function response(config: InternalAxiosRequestConfig, data: unknown): AxiosResponse {
    return { data: { code: "OK", message: "ok", data }, status: 200, statusText: "OK", headers: {}, config };
}

const originalAdapter = http.defaults.adapter;
const originalAuth = useAuthStore.getState();
const originalTasks = useVideoTaskStore.getState();
let originalStorage: PropertyDescriptor | undefined;
let originalWindow: PropertyDescriptor | undefined;
let stops: Array<() => void> = [];

beforeEach(() => {
    originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: Object.assign(new EventTarget(), { location: { pathname: "/video", href: "/video" } }),
    });
    useAuthStore.setState({ ...originalAuth, ...account(userA), initialized: true });
    useVideoTaskStore.setState(originalTasks, true);
    saveTokens(`token-${userA.id}`, `refresh-${userA.id}`);
    stops = [];
    http.defaults.adapter = async (config) => {
        if (config.url === "/video-tasks") {
            return response(config, { items: [], page: config.params?.page ?? 1, pageSize: config.params?.pageSize ?? 20, total: 0, hasNext: false });
        }
        if (config.url === "/auth/me") return response(config, account(userA));
        throw new Error(`Unexpected HTTP call: ${config.method} ${config.url}`);
    };
});

afterEach(() => {
    stops.reverse().forEach((stop) => stop());
    http.defaults.adapter = originalAdapter;
    useVideoTaskStore.setState(originalTasks, true);
    useAuthStore.setState(originalAuth, true);
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
});

async function startStore(userId: number) {
    const stop = useVideoTaskStore.getState().start(userId);
    stops.push(stop);
    // Join the automatic initial refresh before asserting persisted/restored state.
    await useVideoTaskStore.getState().refresh();
    return stop;
}

function persisted(userId: number) {
    const raw = localStorage.getItem(`ic_video_tasks:${userId}`);
    expect(raw).not.toBeNull();
    return JSON.parse(raw!) as {
        tasks: Record<string, VideoTaskView>;
        origins: Record<string, { projectNo: string; projectTitle?: string; resultInserted?: boolean }>;
    };
}

describe("canvas task persistence", () => {
    test.each([undefined, false])("restores a completed uninserted canvas result (resultInserted=%s)", async (resultInserted) => {
        const completed = completedTask("canvas-result");
        const origin = { projectNo: "project-1", projectTitle: "Storyboard", resultInserted };
        const stop = await startStore(userA.id);
        useVideoTaskStore.getState().track(completed, origin);
        expect(persisted(userA.id).tasks[completed.taskNo]).toEqual(completed);
        expect(persisted(userA.id).origins[completed.taskNo].projectNo).toBe(origin.projectNo);

        stop();
        expect(useVideoTaskStore.getState().tasks).toEqual({});
        const stopRestored = await startStore(userA.id);
        expect(useVideoTaskStore.getState().tasks[completed.taskNo]).toEqual(completed);
        expect(useVideoTaskStore.getState().origins[completed.taskNo]).toEqual({ ...origin, resultInserted: false });
        // Empty recent/active server pages do not remove the restored result.
        expect(persisted(userA.id).tasks[completed.taskNo]).toEqual(completed);

        useVideoTaskStore.getState().markInserted([completed.taskNo]);
        expect(persisted(userA.id).tasks[completed.taskNo]).toBeUndefined();
        expect(persisted(userA.id).origins[completed.taskNo]).toEqual({ ...origin, resultInserted: true });
        stopRestored();
        await startStore(userA.id);
        expect(useVideoTaskStore.getState().tasks[completed.taskNo]).toBeUndefined();
        expect(useVideoTaskStore.getState().origins[completed.taskNo]?.resultInserted).toBe(true);
    });

    test("restores the generation target node after restarting task tracking", async () => {
        const task = completedTask("img_target");
        const origin = { projectNo: "project-1", targetNodeId: "empty-image" };
        const stop = await startStore(userA.id);
        useVideoTaskStore.getState().track(task, origin);
        stop();
        await startStore(userA.id);
        expect(useVideoTaskStore.getState().origins[task.taskNo]).toEqual({ ...origin, resultInserted: false });
    });

    test("does not persist an ordinary completed video task without canvas provenance", async () => {
        const completed = completedTask("ordinary-video");
        const stop = await startStore(userA.id);
        useVideoTaskStore.getState().track(completed);
        expect(useVideoTaskStore.getState().tasks[completed.taskNo]).toEqual(completed);
        expect(persisted(userA.id).tasks).toEqual({});
        expect(persisted(userA.id).origins).toEqual({});
        stop();
        await startStore(userA.id);
        expect(useVideoTaskStore.getState().tasks[completed.taskNo]).toBeUndefined();
    });
});

describe("account refresh session isolation", () => {
    test("an old A refresh response cannot overwrite B after logout and login", async () => {
        const delayedA = deferred<MeResult>();
        const aRequestStarted = deferred<void>();
        const requests: string[] = [];
        http.defaults.adapter = async (config) => {
            requests.push(`${config.method} ${config.url}`);
            if (config.url === "/auth/me") {
                if (config.headers.Authorization === `Bearer token-${userA.id}`) {
                    aRequestStarted.resolve();
                    return response(config, await delayedA.promise);
                }
                expect(config.headers.Authorization).toBe(`Bearer token-${userB.id}`);
                return response(config, account(userB));
            }
            if (config.url === "/auth/logout") return response(config, null);
            if (config.url === "/auth/login") return response(config, authResult(userB));
            throw new Error(`Unexpected HTTP call: ${config.method} ${config.url}`);
        };

        const staleRefresh = useAuthStore.getState().refreshAccount();
        await aRequestStarted.promise;
        try {
            await useAuthStore.getState().logout();
            await useAuthStore.getState().login(userB.email, "test-password");
            expect(useAuthStore.getState().user).toEqual(userB);
        } finally {
            // Always settle the old request, even if an intermediate assertion fails.
            delayedA.resolve(account(userA));
            await staleRefresh;
        }
        expect(useAuthStore.getState().user).toEqual(userB);
        expect(useAuthStore.getState().credits).toEqual(account(userB).credits);
        expect(useAuthStore.getState().concurrency).toEqual(account(userB).concurrency);
        expect(localStorage.getItem("ic_access_token")).toBe(`token-${userB.id}`);
        expect(requests.filter((entry) => entry === "get /auth/me")).toHaveLength(2);
    });
});
