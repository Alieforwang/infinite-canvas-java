import axios, { type AxiosError, type AxiosRequestConfig, type AxiosResponse } from "axios";

import type { ApiEnvelope } from "../types";
import { tokenStorage } from "../lib/token";

/** 后端业务错误 / HTTP 错误统一异常，携带 requestId 以便排查。 */
export class ApiError extends Error {
    readonly code: string;
    readonly requestId: string;
    readonly status?: number;

    constructor(message: string, code: string, requestId: string, status?: number) {
        super(message);
        this.name = "ApiError";
        this.code = code;
        this.requestId = requestId;
        this.status = status;
    }
}

export const http = axios.create({
    baseURL: "/api",
    timeout: 60_000,
});

http.interceptors.request.use((config) => {
    const token = tokenStorage.getToken();
    if (token) {
        config.headers.set("Authorization", `Bearer ${token}`);
    }
    config.headers.set("Accept", "application/json");
    return config;
});

function redirectToLogin(): void {
    const path = window.location.pathname;
    if (path.startsWith("/admin/login")) {
        return;
    }
    tokenStorage.clearToken();
    tokenStorage.clearProfile();
    window.location.replace("/admin/login");
}

function readHeader(headers: unknown, name: string): string {
    if (!headers || typeof headers !== "object") {
        return "";
    }
    const record = headers as Record<string, unknown>;
    const value = record[name] ?? record[name.toLowerCase()];
    if (Array.isArray(value)) {
        return String(value[0] ?? "");
    }
    return value === undefined || value === null ? "" : String(value);
}

http.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError<unknown>) => {
        const status = error.response?.status;
        let body = error.response?.data as ApiEnvelope<unknown> | undefined;

        // 导出接口使用 blob 响应，错误时后端返回的仍是 JSON，需要先解包。
        if (body instanceof Blob) {
            try {
                body = JSON.parse(await body.text()) as ApiEnvelope<unknown>;
            } catch {
                body = undefined;
            }
        }

        const requestId =
            body?.requestId ||
            readHeader(error.response?.headers, "x-request-id") ||
            (body?.data && typeof body.data === "object" && "requestId" in body.data
                ? String((body.data as Record<string, unknown>).requestId ?? "")
                : "");
        const message = body?.message || error.message || "请求失败";
        const code = body?.code || (status ? `HTTP_${status}` : "NETWORK_ERROR");

        if (status === 401) {
            redirectToLogin();
        }

        return Promise.reject(new ApiError(message, code, requestId || "-", status));
    },
);

function unwrap<T>(body: ApiEnvelope<T>): T {
    if (!body || body.code !== "OK") {
        throw new ApiError(
            body?.message || "接口返回异常",
            body?.code || "INVALID_RESPONSE",
            body?.requestId || "-",
        );
    }
    return body.data;
}

export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const response = await http.get<ApiEnvelope<T>>(url, { params });
    return unwrap(response.data);
}

export async function apiPost<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await http.post<ApiEnvelope<T>>(url, data, config);
    return unwrap(response.data);
}

export async function apiPut<T>(url: string, data?: unknown): Promise<T> {
    const response = await http.put<ApiEnvelope<T>>(url, data);
    return unwrap(response.data);
}

export async function apiDelete<T>(url: string): Promise<T> {
    const response = await http.delete<ApiEnvelope<T>>(url);
    return unwrap(response.data);
}

/** 下载二进制内容（如兑换码 CSV 导出）。 */
export async function apiDownload(url: string, params?: Record<string, unknown>): Promise<Blob> {
    const response = await http.get<Blob>(url, { params, responseType: "blob", timeout: 120_000 });
    return response.data;
}
