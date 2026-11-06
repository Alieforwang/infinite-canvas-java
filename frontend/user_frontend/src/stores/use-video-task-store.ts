import { create } from "zustand";
import { cancelTask, getTask, listTasks, type VideoTaskView } from "@/api/video-tasks";
import { isTaskActive } from "@/lib/video-task-state";
import { createVideoTaskMonitor } from "@/services/video-task-monitor";
import { useAuthStore } from "@/stores/use-auth-store";

export type TaskOrigin = { projectNo?: string; projectTitle?: string; resultInserted?: boolean };
type TaskEvent = { id: string; taskNo: string };
type TaskState = {
    userId: number | null;
    tasks: Record<string, VideoTaskView>;
    origins: Record<string, TaskOrigin>;
    unread: string[];
    events: TaskEvent[];
    loading: boolean;
    error: string | null;
    initialized: boolean;
    track: (task: VideoTaskView, origin?: TaskOrigin) => void;
    refresh: () => Promise<void>;
    cancel: (taskNo: string) => Promise<void>;
    markInserted: (taskNos: string[]) => void;
    markRead: (taskNo?: string) => void;
    dismissEvent: (id: string) => void;
    start: (userId: number) => () => void;
};

let monitor: ReturnType<typeof createVideoTaskMonitor> | null = null;
let wake: (() => void) | null = null;
const storageKey = (userId: number) => `ic_video_tasks:${userId}`;

function persist(state: TaskState) {
    if (state.userId === null) return;
    try {
        // Remember canvas provenance and unfinished work, separately for each account.
        localStorage.setItem(storageKey(state.userId), JSON.stringify({
            origins: state.origins,
            tasks: Object.fromEntries(Object.entries(state.tasks).filter(([taskNo, task]) => isTaskActive(task) || (state.origins[taskNo]?.projectNo && !state.origins[taskNo].resultInserted && task.status === "succeeded"))),
        }));
    } catch { /* Tracking continues in memory when storage is unavailable. */ }
}

function restore(userId: number): Pick<TaskState, "tasks" | "origins"> {
    try {
        const value = JSON.parse(localStorage.getItem(storageKey(userId)) || "null");
        const tasks: Record<string, VideoTaskView> = {};
        const origins: Record<string, TaskOrigin> = {};
        if (value && typeof value === "object") {
            for (const [key, task] of Object.entries(value.tasks || {}) as [string, VideoTaskView][]) {
                if (task && task.taskNo === key && (isTaskActive(task) || task.status === "succeeded")) tasks[key] = task;
            }
            for (const [key, origin] of Object.entries(value.origins || {}) as [string, TaskOrigin][]) {
                if (origin && typeof origin.projectNo === "string") {
                    origins[key] = { projectNo: origin.projectNo, projectTitle: typeof origin.projectTitle === "string" ? origin.projectTitle : undefined, resultInserted: origin.resultInserted === true };
                }
            }
        }
        return { tasks, origins };
    } catch { return { tasks: {}, origins: {} }; }
}

export const useVideoTaskStore = create<TaskState>((set, get) => ({
    userId: null, tasks: {}, origins: {}, unread: [], events: [], loading: false, error: null, initialized: false,
    track: (task, origin) => {
        const state = get();
        if (state.userId !== useAuthStore.getState().user?.id) return;
        const previous = state.tasks[task.taskNo];
        if (previous && !isTaskActive(previous) && isTaskActive(task)) return;
        const completed = previous && isTaskActive(previous) && !isTaskActive(task);
        set({
            tasks: { ...state.tasks, [task.taskNo]: task },
            origins: origin ? { ...state.origins, [task.taskNo]: { ...state.origins[task.taskNo], ...origin } } : state.origins,
            unread: completed ? [...new Set([...state.unread, task.taskNo])] : state.unread,
            events: completed ? [...state.events, { id: `${task.taskNo}-${task.status}-${Date.now()}`, taskNo: task.taskNo }] : state.events,
        });
        persist(get());
        if (isTaskActive(task) || completed) void useAuthStore.getState().refreshAccount();
        if (isTaskActive(task)) wake?.();
    },
    refresh: async () => {
        const current = monitor;
        if (!current) return;
        set({ loading: true });
        await current.refresh();
        if (monitor === current) set({ loading: false });
    },
    cancel: async (taskNo) => {
        const userId = get().userId;
        const current = monitor;
        await cancelTask(taskNo);
        if (get().userId !== userId || monitor !== current) return;
        current?.invalidate();
        await get().refresh();
        if (get().userId === userId) await useAuthStore.getState().refreshAccount();
    },
    markInserted: (taskNos) => {
        set((state) => {
            const origins = { ...state.origins };
            taskNos.forEach((taskNo) => { if (origins[taskNo]) origins[taskNo] = { ...origins[taskNo], resultInserted: true }; });
            return { origins };
        });
        persist(get());
    },
    markRead: (taskNo) => set((state) => ({ unread: taskNo ? state.unread.filter((id) => id !== taskNo) : [] })),
    dismissEvent: (id) => set((state) => ({ events: state.events.filter((event) => event.id !== id) })),
    start: (userId) => {
        monitor?.invalidate();
        set({ userId, ...restore(userId), unread: [], events: [], loading: false, error: null, initialized: false });
        const current = createVideoTaskMonitor({
            listTasks, getTask,
            knownTasks: () => get().tasks,
            onSnapshot: (items) => {
                const state = get();
                if (state.userId !== userId || monitor !== current || useAuthStore.getState().user?.id !== userId) return;
                const accepted = items.filter((task) => !state.tasks[task.taskNo] || isTaskActive(state.tasks[task.taskNo]) || !isTaskActive(task));
                const completed = accepted.filter((task) => state.tasks[task.taskNo] && isTaskActive(state.tasks[task.taskNo]) && !isTaskActive(task));
                const tasks = { ...state.tasks };
                accepted.forEach((task) => { tasks[task.taskNo] = task; });
                set({
                    tasks, initialized: true, error: null,
                    unread: [...new Set([...state.unread, ...completed.map((task) => task.taskNo)])],
                    events: [...state.events, ...completed.map((task) => ({ id: `${task.taskNo}-${task.status}-${Date.now()}`, taskNo: task.taskNo }))],
                });
                persist(get());
                if (completed.length) void useAuthStore.getState().refreshAccount();
            },
            onError: (error) => { if (monitor === current && get().userId === userId) set({ error }); },
        });
        monitor = current;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const cycle = async () => {
            if (stopped || monitor !== current) return;
            if (timer) clearTimeout(timer);
            await get().refresh();
            if (stopped || monitor !== current) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => void cycle(), Object.values(get().tasks).some(isTaskActive) ? 3000 : 15000);
        };
        const refreshNow = () => { void cycle(); };
        wake = refreshNow;
        refreshNow();
        window.addEventListener("focus", refreshNow);
        window.addEventListener("online", refreshNow);
        return () => {
            stopped = true;
            if (timer) clearTimeout(timer);
            current.invalidate();
            window.removeEventListener("focus", refreshNow);
            window.removeEventListener("online", refreshNow);
            if (monitor === current) {
                monitor = null;
                wake = null;
                set({ userId: null, tasks: {}, origins: {}, unread: [], events: [], loading: false, error: null, initialized: false });
            }
        };
    },
}));
