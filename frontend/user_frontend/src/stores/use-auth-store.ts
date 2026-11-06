import { create } from "zustand";

import * as authApi from "@/api/auth";
import { clearTokens, getToken } from "@/api/http";

type AuthStore = {
    user: authApi.UserView | null;
    credits: authApi.CreditsView;
    concurrency: { limit: number; running: number };
    initialized: boolean;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, displayName?: string) => Promise<void>;
    loadMe: () => Promise<void>;
    refreshAccount: () => Promise<void>;
    logout: () => Promise<void>;
    setCredits: (credits: authApi.CreditsView) => void;
};

const emptyCredits: authApi.CreditsView = { available: 0, frozen: 0, totalConsumed: 0 };
let sessionRevision = 0;

export const useAuthStore = create<AuthStore>((set, get) => ({
    user: null,
    credits: emptyCredits,
    concurrency: { limit: 2, running: 0 },
    initialized: false,
    loading: false,

    login: async (email, password) => {
        const revision = ++sessionRevision;
        const result = await authApi.login({ email, password });
        if (revision !== sessionRevision) return;
        set({ user: result.user, credits: result.credits, initialized: true });
        await get().loadMe();
    },

    register: async (email, password, displayName) => {
        const revision = ++sessionRevision;
        const result = await authApi.register({ email, password, displayName });
        if (revision !== sessionRevision) return;
        set({ user: result.user, credits: result.credits, initialized: true });
        await get().loadMe();
    },

    loadMe: async () => {
        const revision = sessionRevision;
        if (!getToken()) {
            set({ initialized: true, user: null });
            return;
        }
        set({ loading: true });
        try {
            const result = await authApi.me();
            if (revision !== sessionRevision) return;
            set({
                user: result.user,
                credits: result.credits,
                concurrency: result.concurrency,
                initialized: true,
                loading: false,
            });
        } catch {
            if (revision !== sessionRevision) return;
            clearTokens();
            set({ user: null, initialized: true, loading: false });
        }
    },

    refreshAccount: async () => {
        const revision = sessionRevision;
        const userId = get().user?.id;
        if (!getToken() || userId === undefined) return;
        try {
            const result = await authApi.me();
            if (revision !== sessionRevision || !getToken() || get().user?.id !== userId || result.user.id !== userId) return;
            set({ user: result.user, credits: result.credits, concurrency: result.concurrency });
        } catch {
            // ignore transient refresh errors
        }
    },

    logout: async () => {
        const revision = ++sessionRevision;
        try {
            await authApi.logout();
        } finally {
            if (revision === sessionRevision) {
                clearTokens();
                set({ user: null, credits: emptyCredits, concurrency: { limit: 2, running: 0 }, loading: false });
            }
        }
    },

    setCredits: (credits) => set({ credits }),
}));
