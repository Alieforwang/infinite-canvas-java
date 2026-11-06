import type {
    AdminMe,
    AdminProfile,
    AdminTaskDetail,
    AdminTaskRow,
    AdminUser,
    Channel,
    ChannelPayload,
    ChannelTestResult,
    CreditTransaction,
    DashboardData,
    ModelPayload,
    PageResult,
    Plan,
    PlanPayload,
    RedeemCode,
    RedeemGeneratePayload,
    RedeemGenerateResult,
    SettingItem,
    VideoModel,
} from "../types";
import { apiDelete, apiDownload, apiGet, apiPost, apiPut } from "./http";

export interface UserListQuery {
    keyword?: string;
    status?: string;
    page?: number;
    pageSize?: number;
}

export interface TaskListQuery {
    status?: string;
    userId?: number;
    taskNo?: string;
    page?: number;
    pageSize?: number;
}

export interface RedeemListQuery {
    batchNo?: string;
    status?: string;
    page?: number;
    pageSize?: number;
}

export const adminApi = {
    // ---------- 认证 ----------
    login(username: string, password: string) {
        return apiPost<AdminProfile>("/admin/auth/login", { username, password });
    },
    me() {
        return apiGet<AdminMe>("/admin/auth/me");
    },

    // ---------- 概览 ----------
    dashboard() {
        return apiGet<DashboardData>("/admin/dashboard");
    },

    // ---------- 渠道 ----------
    listChannels() {
        return apiGet<Channel[]>("/admin/channels");
    },
    createChannel(payload: ChannelPayload) {
        return apiPost<Channel>("/admin/channels", payload);
    },
    updateChannel(id: number, payload: ChannelPayload) {
        return apiPut<Channel>(`/admin/channels/${id}`, payload);
    },
    deleteChannel(id: number) {
        return apiDelete<void>(`/admin/channels/${id}`);
    },
    testChannel(id: number) {
        return apiPost<ChannelTestResult>(`/admin/channels/${id}/test`, undefined, { timeout: 180_000 });
    },

    syncChannelModels(id: number, modelsUrl?: string) {
        return apiPost<ChannelTestResult>(`/admin/channels/${id}/models/sync`, { modelsUrl }, { timeout: 180_000 });
    },

    // ---------- 模型 ----------
    listModels() {
        return apiGet<VideoModel[]>("/admin/models");
    },
    createModel(payload: ModelPayload) {
        return apiPost<VideoModel>("/admin/models", payload);
    },
    updateModel(id: number, payload: ModelPayload) {
        return apiPut<VideoModel>(`/admin/models/${id}`, payload);
    },
    deleteModel(id: number) {
        return apiDelete<void>(`/admin/models/${id}`);
    },

    // ---------- 用户 ----------
    listUsers(query: UserListQuery) {
        return apiGet<PageResult<AdminUser>>("/admin/users", { ...query });
    },
    getUser(id: number) {
        return apiGet<AdminUser>(`/admin/users/${id}`);
    },
    setUserStatus(id: number, status: "ACTIVE" | "DISABLED", reason: string) {
        return apiPost<void>(`/admin/users/${id}/status`, { status, reason });
    },
    adjustUserCredits(id: number, amount: number, reason: string) {
        return apiPost<void>(`/admin/users/${id}/credits`, { amount, reason });
    },
    rechargeUser(id: number, amount: number, remark: string) {
        return apiPost<void>(`/admin/users/${id}/recharge`, { amount, remark });
    },
    grantUserPlan(id: number, planId: number, reason: string) {
        return apiPost<void>(`/admin/users/${id}/plan`, { planId, reason });
    },
    listUserTransactions(id: number) {
        return apiGet<CreditTransaction[]>(`/admin/users/${id}/transactions`, { page: 1, pageSize: 100 });
    },

    // ---------- 套餐 ----------
    listPlans() {
        return apiGet<Plan[]>("/admin/plans");
    },
    createPlan(payload: PlanPayload) {
        return apiPost<Plan>("/admin/plans", payload);
    },
    updatePlan(id: number, payload: PlanPayload) {
        return apiPut<Plan>(`/admin/plans/${id}`, payload);
    },
    deletePlan(id: number) {
        return apiDelete<void>(`/admin/plans/${id}`);
    },

    // ---------- 兑换码 ----------
    listRedeemCodes(query: RedeemListQuery) {
        return apiGet<PageResult<RedeemCode>>("/admin/redeem-codes", { ...query });
    },
    generateRedeemCodes(payload: RedeemGeneratePayload) {
        return apiPost<RedeemGenerateResult>("/admin/redeem-codes", payload);
    },
    disableRedeemCode(id: number) {
        return apiPost<void>(`/admin/redeem-codes/${id}/disable`);
    },
    exportRedeemCodes(batchNo?: string) {
        return apiDownload("/admin/redeem-codes/export", batchNo ? { batchNo } : undefined);
    },

    // ---------- 任务 ----------
    listTasks(query: TaskListQuery) {
        return apiGet<PageResult<AdminTaskRow>>("/admin/tasks", { ...query });
    },
    getTask(taskNo: string) {
        return apiGet<AdminTaskDetail>(`/admin/tasks/${taskNo}`);
    },
    retryTask(taskNo: string) {
        return apiPost<{ taskNo: string; status: string; estimatedCredits: number; heldCredits: number }>(
            `/admin/tasks/${taskNo}/retry`,
        );
    },
    refundTask(taskNo: string, reason: string) {
        return apiPost<void>(`/admin/tasks/${taskNo}/refund`, { reason });
    },
    cancelTask(taskNo: string) {
        return apiPost<void>(`/admin/tasks/${taskNo}/cancel`);
    },

    // ---------- 设置 ----------
    listSettings() {
        return apiGet<SettingItem[]>("/admin/settings");
    },
    saveSettings(values: Record<string, string>) {
        return apiPut<void>("/admin/settings", values);
    },
};
