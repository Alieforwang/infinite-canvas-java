import { create } from "zustand";

import type { AdminProfile } from "../types";
import { tokenStorage } from "../lib/token";

interface AuthState {
    token: string | null;
    admin: AdminProfile | null;
    setSession: (profile: AdminProfile) => void;
    setProfile: (profile: Partial<AdminProfile> & Pick<AdminProfile, "id" | "username" | "displayName" | "role">) => void;
    clearSession: () => void;
}

const storedProfile = tokenStorage.getProfile<AdminProfile>();

export const useAuthStore = create<AuthState>()((set) => ({
    token: tokenStorage.getToken(),
    admin: storedProfile,
    setSession: (profile) => {
        tokenStorage.setToken(profile.accessToken);
        tokenStorage.setProfile(profile);
        set({ token: profile.accessToken, admin: profile });
    },
    setProfile: (profile) => {
        set((state) => {
            const next: AdminProfile = {
                accessToken: state.admin?.accessToken ?? state.token ?? "",
                expiresIn: state.admin?.expiresIn ?? 0,
                ...state.admin,
                ...profile,
            };
            tokenStorage.setProfile(next);
            return { admin: next };
        });
    },
    clearSession: () => {
        tokenStorage.clearToken();
        tokenStorage.clearProfile();
        set({ token: null, admin: null });
    },
}));

/** 供非 React 环境（如 axios 拦截器）安全读取。 */
export function hasToken(): boolean {
    return Boolean(useAuthStore.getState().token ?? tokenStorage.getToken());
}
