const TOKEN_KEY = "ic_admin_access_token";
const PROFILE_KEY = "ic_admin_profile";

/** Token 统一存放在 localStorage，键名与后端约定保持一致。 */
export const tokenStorage = {
    getToken(): string | null {
        try {
            return window.localStorage.getItem(TOKEN_KEY);
        } catch {
            return null;
        }
    },
    setToken(token: string): void {
        try {
            window.localStorage.setItem(TOKEN_KEY, token);
        } catch {
            // localStorage 不可用时仅保留内存态
        }
    },
    clearToken(): void {
        try {
            window.localStorage.removeItem(TOKEN_KEY);
        } catch {
            // ignore
        }
    },
    getProfile<T>(): T | null {
        try {
            const raw = window.localStorage.getItem(PROFILE_KEY);
            return raw ? (JSON.parse(raw) as T) : null;
        } catch {
            return null;
        }
    },
    setProfile(profile: unknown): void {
        try {
            window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
        } catch {
            // ignore
        }
    },
    clearProfile(): void {
        try {
            window.localStorage.removeItem(PROFILE_KEY);
        } catch {
            // ignore
        }
    },
};
