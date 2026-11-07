/** 后端统一响应结构。 */
export interface ApiEnvelope<T> {
    code: string;
    message: string;
    data: T;
    requestId: string;
    timestamp: string;
}

/** 服务端分页结构。 */
export interface PageResult<T> {
    items: T[];
    page: number;
    pageSize: number;
    total: number;
    hasNext: boolean;
}

export interface PageQuery {
    page?: number;
    pageSize?: number;
}

// ---------------- 认证 ----------------

export interface AdminProfile {
    id: number;
    username: string;
    displayName: string;
    role: string;
    accessToken: string;
    expiresIn: number;
}

export interface AdminMe {
    id: number;
    username: string;
    displayName: string;
    role: string;
    expiresIn?: number;
}

// ---------------- 概览 ----------------

export interface DashboardTrendItem {
    d: string;
    tasks: number;
    credits: number;
}

export interface DashboardChannelHealth {
    id: number;
    name: string;
    enabled: number;
    lastTestOk: boolean | null;
    lastTestMessage: string | null;
    lastTestAt: string | null;
}

export interface DashboardData {
    users: number;
    todayNewUsers: number;
    tasksToday: number;
    tasksTotal: number;
    running: number;
    failedToday: number;
    successRate: number;
    creditsConsumedToday: number;
    creditsGrantedToday: number;
    trend: DashboardTrendItem[];
    channels: DashboardChannelHealth[];
}

// ---------------- 渠道 ----------------

export interface Channel {
    id: number;
    name: string;
    protocol: string;
    baseUrl: string;
    normalizedBaseUrl: string;
    apiKeyMask: string;
    authType: string;
    capabilities: string[];
    enabled: number;
    maxConcurrency: number;
    lastTestOk: boolean | null;
    lastTestMessage: string | null;
    lastTestAt: string | null;
    createdAt: string;
    modelCount: number;
}

export interface ChannelPayload {
    name: string;
    protocol: string;
    baseUrl: string;
    apiKey?: string;
    authType: string;
    authHeader?: string;
    capabilities: string[];
    maxConcurrency: number;
    enabled: boolean;
    connectTimeoutMs?: number;
    readTimeoutMs?: number;
}

export interface ChannelTestResult {
    ok: boolean;
    latencyMs: number;
    models: string[];
    message: string;
}

// ---------------- 模型 ----------------

export type ModelCapability = "llm" | "image" | "video" | "unknown";

export interface ModelClassificationSuggestion {
    id: number;
    currentCapability: ModelCapability;
    suggestedCapability: Exclude<ModelCapability, "unknown">;
    upstreamModel: string;
    modelKey: string;
}

export interface ModelClassificationApplyResult {
    updated: number;
}
export interface VideoModel {
    id: number;
    channelId: number;
    channelName: string;
    upstreamModel: string;
    displayName: string;
    modelKey: string;
    routeWeight: number;
    capability: ModelCapability;
    pricingRules: string;
    enabled: number;
    sort: number;
    creditsPerSecond: number;
    resolutionFactors: string;
    resolutionDefault: string;
    audioFactor: number;
    minChargeCredits: number;
    supportedSeconds: string;
    supportedSizes: string;
    supportedRatios: string;
    supportsAudio: number;
    supportsWatermark: number;
    supportsFirstLastFrame: number;
    supportsReferenceImages: number;
    maxReferenceImages: number;
    createdAt: string;
    costPerUnit: number | null;
    costQuotaType: number | null;
    costSyncedAt: string | null;
    currentLoad: number | null;
}

export interface ModelPayload {
    channelId: number;
    upstreamModel: string;
    displayName: string;
    modelKey: string;
    routeWeight: number;
    capability: ModelCapability;
    pricingRules: string;
    creditsPerSecond: number;
    resolutionFactors: string;
    resolutionDefault: string;
    audioFactor: number;
    minChargeCredits: number;
    supportedSeconds: string;
    supportedSizes: string;
    supportedRatios: string;
    supportsAudio: number;
    supportsWatermark: number;
    supportsFirstLastFrame: number;
    supportsReferenceImages: number;
    maxReferenceImages: number;
    enabled: boolean;
    sort: number;
}

// ---------------- 用户 ----------------

export interface AdminUser {
    id: number;
    email: string;
    displayName: string;
    status: "ACTIVE" | "DISABLED" | string;
    available: number;
    frozen: number;
    totalConsumed: number;
    taskCount: number;
    createdAt: string;
    lastLoginAt: string | null;
}

export interface CreditTransaction {
    id: number;
    userId: number;
    bizType: string;
    availableDelta: number;
    frozenDelta: number;
    balanceAfter: number;
    taskId: number | null;
    orderId: number | null;
    redeemCodeId: number | null;
    idempotencyKey: string | null;
    operatorAdminId: number | null;
    remark: string;
    requestId: string | null;
    createdAt: string;
}

// ---------------- 套餐 ----------------

export interface Plan {
    id: number;
    code: string;
    name: string;
    type: "CREDIT_PACK" | "PLAN" | string;
    priceAmount: number;
    credits: number;
    bonusCredits: number;
    validDays: number;
    description: string;
    sort: number;
    enabled: number;
    createdAt: string;
    updatedAt: string;
}

export interface PlanPayload {
    code: string;
    name: string;
    type: string;
    priceAmount: number;
    credits: number;
    bonusCredits: number;
    validDays: number;
    description: string;
    sort: number;
    enabled: boolean;
}

// ---------------- 兑换码 ----------------

export interface RedeemCode {
    id: number;
    codeMask: string;
    batchNo: string;
    prefix: string;
    credits: number;
    planId: number | null;
    status: "UNUSED" | "USED" | "DISABLED" | "EXPIRED" | string;
    usedByEmail: string | null;
    usedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
}

export interface RedeemGeneratePayload {
    count: number;
    credits?: number;
    planId?: number | null;
    prefix?: string;
    validDays?: number;
}

export interface RedeemGenerateResult {
    batchNo: string;
    codes: string[];
}

// ---------------- 任务 ----------------

export interface TaskFile {
    fileNo: string;
    url: string;
    contentType: string;
    bytes: number;
    width?: number | null;
    height?: number | null;
    durationMs?: number | null;
}

export interface VideoTask {
    taskNo: string;
    status: string;
    progress: number;
    modelName: string;
    channelName: string;
    prompt: string;
    params: Record<string, unknown> | null;
    referenceFileNos: string[] | null;
    heldCredits: number | null;
    settledCredits: number | null;
    errorCode: string | null;
    errorMessage: string | null;
    file: TaskFile | null;
    createdAt: string;
    finishedAt: string | null;
}

export interface AdminTaskRow {
    task: VideoTask;
    userId: number;
    userEmail: string;
}

export interface TaskEvent {
    from: string | null;
    to: string | null;
    source: string | null;
    detail: string | null;
    at: string | null;
}

export interface TaskUpstreamCall {
    action: string | null;
    httpStatus: number | null;
    latencyMs: number | null;
    errorCode: string | null;
    snippet: string | null;
    at: string | null;
}

export interface TaskTransaction {
    bizType: string | null;
    availableDelta: number | null;
    frozenDelta: number | null;
    remark: string | null;
    at: string | null;
}

export interface AdminTaskDetail extends AdminTaskRow {
    events: TaskEvent[];
    upstreamCalls: TaskUpstreamCall[];
    transactions: TaskTransaction[];
}

export interface UpstreamPrice {
    upstreamModel: string;
    quotaType: number;
    modelPrice: number | null;
    groupName: string;
    groupRatio: number | null;
    groupCost: number | null;
    lastSynced: string | null;
    status: "fresh" | "stale" | "no_cost";
}

export interface UpstreamPriceSnapshot {
    source: string;
    currency: string;
    currencyVerification: string;
    syncedAt: string | null;
    pricingVersion: string | null;
    stale: boolean;
    status: "fresh" | "stale" | "no_cost";
    prices: UpstreamPrice[];
}

export interface PublicSettings {
    exchangePerYuan: number;
    currency: "CNY";
    currencyUnit: "元";
}


export interface SettingItem {
    key: string;
    value: string;
    type: string;
    description: string;
}
