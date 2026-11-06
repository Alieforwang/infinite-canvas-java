import { http } from "@/api/http";
import type { PageResult } from "@/api/video-tasks";

export type AccountView = {
    available: number;
    frozen: number;
    totalConsumed: number;
    totalRecharged: number;
    exchangePerYuan: number;
    concurrencyLimit: number;
    running: number;
    currentPlan?: { name: string; expiresAt?: string; creditsTotal?: number; creditsUsed?: number } | null;
};

export type TransactionView = {
    id: number;
    bizType: string;
    bizLabel: string;
    amount: number;
    balanceAfter: number;
    taskNo?: string | null;
    remark?: string;
    createdAt?: string;
};

export type PlanView = {
    id: number;
    code: string;
    name: string;
    type: "CREDIT_PACK" | "PLAN";
    priceAmount: number;
    credits: number;
    validDays: number;
    description?: string;
};

export function getAccount(): Promise<AccountView> {
    return http.get<unknown, AccountView>("/account");
}

export function listTransactions(page = 1, pageSize = 20): Promise<PageResult<TransactionView>> {
    return http.get<unknown, PageResult<TransactionView>>("/account/transactions", {
        params: { page, pageSize },
    });
}

export function redeem(code: string): Promise<{ credits: number; planName?: string }> {
    return http.post<unknown, { credits: number; planName?: string }>("/account/redeem", { code });
}

export function listPlans(): Promise<PlanView[]> {
    return http.get<unknown, PlanView[]>("/plans");
}
