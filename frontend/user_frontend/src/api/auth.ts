import { http, saveTokens } from "@/api/http";

export type UserView = {
    id: number;
    email: string;
    displayName: string;
    status: string;
    createdAt?: string;
};

export type CreditsView = { available: number; frozen: number; totalConsumed: number };

export type AuthResult = {
    user: UserView;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    credits: CreditsView;
};

export type MeResult = {
    user: UserView;
    credits: CreditsView;
    concurrency: { limit: number; running: number };
};

export async function register(input: { email: string; password: string; displayName?: string }): Promise<AuthResult> {
    const result = await http.post<unknown, AuthResult>("/auth/register", input);
    saveTokens(result.accessToken, result.refreshToken);
    return result;
}

export async function login(input: { email: string; password: string }): Promise<AuthResult> {
    const result = await http.post<unknown, AuthResult>("/auth/login", input);
    saveTokens(result.accessToken, result.refreshToken);
    return result;
}

export function me(): Promise<MeResult> {
    return http.get<unknown, MeResult>("/auth/me");
}

export function updateProfile(displayName: string): Promise<UserView> {
    return http.put<unknown, UserView>("/auth/profile", { displayName });
}

export function changePassword(oldPassword: string, newPassword: string): Promise<void> {
    return http.put<unknown, void>("/auth/password", { oldPassword, newPassword });
}

export async function logout(): Promise<void> {
    const refreshToken = localStorage.getItem("ic_refresh_token");
    try {
        if (refreshToken) {
            await http.post("/auth/logout", { refreshToken });
        }
    } finally {
        localStorage.removeItem("ic_access_token");
        localStorage.removeItem("ic_refresh_token");
    }
}
