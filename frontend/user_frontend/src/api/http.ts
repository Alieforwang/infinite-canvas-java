import axios, { AxiosError } from "axios";
import { currencyText } from "@/lib/currency";

export type ApiEnvelope<T> = {
    code: string;
    message: string;
    data: T;
    requestId?: string;
    timestamp?: string;
};

export class ApiError extends Error {
    readonly code: string;
    readonly requestId: string;
    readonly status?: number;

    constructor(code: string, message: string, requestId = "", status?: number) {
        super(currencyText(message || code));
        this.name = "ApiError";
        this.code = code;
        this.requestId = requestId;
        this.status = status;
    }
}

export const ACCESS_TOKEN_KEY = "ic_access_token";
export const REFRESH_TOKEN_KEY = "ic_refresh_token";

let refreshing: Promise<boolean> | null = null;

export const http = axios.create({ baseURL: "/api", timeout: 60_000 });

http.interceptors.request.use((config) => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

http.interceptors.response.use(
    (response) => {
        const body = response.data as ApiEnvelope<typeof response.data>;
        if (body && typeof body === "object" && "code" in body && body.code !== "OK") {
            return Promise.reject(new ApiError(body.code, body.message, body.requestId, response.status));
        }
        return body?.data;
    },
    async (error: AxiosError<ApiEnvelope<unknown>>) => {
        const response = error.response;
        const body = response?.data;
        const status = response?.status;
        if (status === 401 && !isAuthEndpoint(error.config?.url ?? "")) {
            const refreshed = await refreshTokens();
            if (refreshed && error.config) {
                return http.request(error.config);
            }
            clearTokens();
            if (!window.location.pathname.startsWith("/login")) {
                window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
            }
        }
        throw new ApiError(body?.code ?? "NETWORK_ERROR", body?.message ?? "网络异常，请稍后重试",
            body?.requestId ?? "", status);
    },
);

function isAuthEndpoint(url: string) {
    return url.includes("/auth/login") || url.includes("/auth/register") || url.includes("/auth/refresh");
}

async function refreshTokens(): Promise<boolean> {
    if (refreshing) {
        return refreshing;
    }
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
        return false;
    }
    refreshing = axios
        .post<ApiEnvelope<{ accessToken: string; refreshToken: string; expiresIn: number }>>(
            "/api/auth/refresh",
            { refreshToken },
        )
        .then((response) => {
            const data = response.data?.data;
            if (!data?.accessToken) {
                return false;
            }
            localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
            localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
            return true;
        })
        .catch(() => false)
        .finally(() => {
            refreshing = null;
        });
    return refreshing;
}

export function saveTokens(accessToken: string, refreshToken: string) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getToken() {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
}
