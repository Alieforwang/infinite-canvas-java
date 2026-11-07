import type { VideoModel } from "../types";

export interface PricingRule {
    resolution: string;
    seconds?: number;
    credits: number;
}

export interface LogicalPriceSuggestion {
    rules: PricingRule[];
    reason?: string;
    warnings: string[];
    minCost?: number;
    maxCost?: number;
}

export interface LogicalPricingGroup {
    key: string;
    model: VideoModel;
    routes: VideoModel[];
    suggestion: LogicalPriceSuggestion;
}

const COST_MAX_AGE_HOURS = 24;

function groupKey(model: VideoModel): string {
    return `${(model.modelKey || model.upstreamModel).trim().toLowerCase()}::${(model.capability || "video").trim().toLowerCase()}`;
}

function parseRules(model: VideoModel): PricingRule[] | null {
    let raw: unknown;
    try {
        raw = JSON.parse(model.pricingRules || "null");
    } catch {
        return null;
    }
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const rules = raw.flatMap((item): PricingRule[] => {
        if (!item || typeof item !== "object") return [];
        const candidate = item as Record<string, unknown>;
        const resolution = typeof candidate.resolution === "string" ? candidate.resolution.trim() : "";
        const credits = Number(candidate.credits);
        const seconds = Number(candidate.seconds);
        if (!resolution || !Number.isFinite(credits) || credits <= 0) return [];
        if (model.capability === "video" && (!Number.isFinite(seconds) || seconds <= 0)) return [];
        return [{ resolution, ...(model.capability === "video" ? { seconds } : {}), credits }];
    });
    if (rules.length !== raw.length) return null;
    if (new Set(rules.map((rule) => `${rule.resolution}:${rule.seconds ?? ""}`)).size !== rules.length) return null;
    if (new Set(rules.map((rule) => rule.resolution)).size !== 1) return null;
    return rules;
}

function parseTime(value: string): number {
    const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`;
    return Date.parse(normalized);
}

function supportsRule(route: VideoModel, rule: PricingRule): boolean {
    const raw = route.capability === "video" ? route.supportedSeconds : route.supportedSizes;
    if (!raw || !raw.trim()) return true;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch { return false; }
    if (!Array.isArray(parsed) || parsed.length === 0) return true;
    if (route.capability === "video") {
        const seconds = Number(rule.seconds);
        return parsed.some((item) => Number.isFinite(Number(item)) && Number(item) === seconds);
    }
    return parsed.some((item) => String(item).trim() === rule.resolution);
}

export function isRouteCostFresh(model: VideoModel, nowMs = Date.now(), maxAgeHours = COST_MAX_AGE_HOURS): boolean {
    if (model.costPerUnit == null || !Number.isFinite(Number(model.costPerUnit)) || Number(model.costPerUnit) < 0) return false;
    if (model.costQuotaType !== 1 && model.costQuotaType !== 2) return false;
    if (!model.costSyncedAt) return false;
    const syncedAt = parseTime(model.costSyncedAt);
    return Number.isFinite(syncedAt) && syncedAt <= nowMs + 5 * 60 * 1000 && nowMs - syncedAt <= maxAgeHours * 60 * 60 * 1000;
}

function hasFreshCost(model: VideoModel, nowMs: number, maxAgeHours: number): boolean {
    return isRouteCostFresh(model, nowMs, maxAgeHours);
}

function suggestionForGroup(
    model: VideoModel,
    routes: VideoModel[],
    targetMarginPercent: number,
    marginFloorPercent: number,
    nowMs: number,
    maxAgeHours: number,
    isEligibleRoute: (route: VideoModel) => boolean,
): LogicalPriceSuggestion {
    const reject = (reason: string): LogicalPriceSuggestion => ({ rules: [], reason, warnings: [] });
    const warnings: string[] = [];
    const eligibleRoutes = routes.filter(isEligibleRoute);
    if (eligibleRoutes.some((route) => route.supportsAudio === 1)) return reject("音频成本未单独报价");
    const rules = parseRules(model);
    if (!rules) return reject("原有规格价格规则无效或包含未单独报价的多规格");
    if (model.capability !== "video" && model.capability !== "image") return reject("媒体类型不支持");

    const knownRoutes = eligibleRoutes.filter((route) => hasFreshCost(route, nowMs, maxAgeHours));
    const unknownCount = eligibleRoutes.filter((route) => route.costPerUnit == null || route.costQuotaType == null).length;
    const staleCount = eligibleRoutes.length - unknownCount - knownRoutes.length;
    const excludedCount = routes.length - eligibleRoutes.length;
    if (excludedCount > 0) warnings.push(`${excludedCount} 条线路当前不可路由，未参与成本计算`);
    if (unknownCount > 0) warnings.push(`${unknownCount} 条可路由线路成本未知`);
    if (staleCount > 0) warnings.push(`${staleCount} 条可路由线路成本已过期`);
    if (knownRoutes.length === 0) return { rules: [], reason: "没有可用的最新线路成本", warnings };
    if (!Number.isFinite(targetMarginPercent) || targetMarginPercent < 0 || targetMarginPercent >= 100) {
        return { rules: [], reason: "目标毛利率必须在 0% 至 100% 之间", warnings };
    }
    if (!Number.isFinite(marginFloorPercent) || marginFloorPercent < 0 || marginFloorPercent >= 100) {
        return { rules: [], reason: "最低毛利率下限必须在 0% 至 100% 之间", warnings };
    }

    if (targetMarginPercent < marginFloorPercent) {
        return { rules: [], reason: "目标毛利率不能低于最低毛利率下限", warnings };
    }

    const suggested: PricingRule[] = [];
    let minCost = Number.POSITIVE_INFINITY;
    let maxCost = 0;
    for (const rule of rules) {
        const relatedRoutes = eligibleRoutes.filter((route) => supportsRule(route, rule));
        if (relatedRoutes.length === 0) {
            warnings.push(`没有可路由线路支持规格 ${rule.resolution}${rule.seconds ? `/${rule.seconds}s` : ""}`);
            return { rules: [], reason: "没有线路支持当前规格", warnings };
        }
        const ruleKnownRoutes = relatedRoutes.filter((route) => hasFreshCost(route, nowMs, maxAgeHours));
        if (ruleKnownRoutes.length === 0) {
            const unknown = relatedRoutes.filter((route) => route.costPerUnit == null || route.costQuotaType == null).length;
            const stale = relatedRoutes.length - unknown;
            if (unknown > 0) warnings.push(`规格 ${rule.resolution}${rule.seconds ? `/${rule.seconds}s` : ""} 有 ${unknown} 条相关线路成本未知`);
            if (stale > 0) warnings.push(`规格 ${rule.resolution}${rule.seconds ? `/${rule.seconds}s` : ""} 有 ${stale} 条相关线路成本已过期`);
            return { rules: [], reason: "当前规格没有可用的最新线路成本", warnings };
        }
        if (model.capability === "video" && ruleKnownRoutes.some((route) => route.costQuotaType === 1) && rules.length !== 1) {
            return { rules: [], reason: "按次视频需要单一时长规格", warnings };
        }
        if (model.capability === "image" && (ruleKnownRoutes.some((route) => route.costQuotaType !== 1) || rules.length !== 1)) {
            return { rules: [], reason: "图片需要单一规格的按次报价", warnings };
        }
        const costs = ruleKnownRoutes.map((route) => Number(route.costPerUnit) * (route.costQuotaType === 2 ? (rule.seconds ?? 0) : 1))
            .filter((cost) => Number.isFinite(cost) && cost >= 0);
        if (costs.length === 0) return { rules: [], reason: "线路成本无法按规格换算", warnings };
        const ruleMin = Math.min(...costs);
        const ruleMax = Math.max(...costs);
        minCost = Math.min(minCost, ruleMin);
        maxCost = Math.max(maxCost, ruleMax);
        const credits = Math.max(Number(model.minChargeCredits) || 1,
            Math.ceil(ruleMin / (1 - targetMarginPercent / 100)));
        suggested.push({ ...rule, credits });
        const floorPrice = Math.ceil(ruleMax / (1 - marginFloorPercent / 100));
        if (credits < floorPrice) warnings.push(`最高成本线路最低毛利低于 ${marginFloorPercent}%`);
    }
    if (suggested.some((rule) => !Number.isSafeInteger(rule.credits) || rule.credits <= 0 || rule.credits > 1_000_000)) {
        return { rules: [], reason: "计算价格超出可配置范围", warnings };
    }
    return { rules: suggested, warnings, minCost, maxCost };
}

export function buildLogicalPricingPlan(
    models: VideoModel[],
    targetMarginPercent: number,
    marginFloorPercent: number,
    nowMs = Date.now(),
    maxAgeHours = COST_MAX_AGE_HOURS,
    isEligibleRoute: (route: VideoModel) => boolean = () => true,
): LogicalPricingGroup[] {
    const groups = new Map<string, VideoModel[]>();
    for (const model of models) {
        const key = groupKey(model);
        groups.set(key, [...(groups.get(key) ?? []), model]);
    }
    return [...groups.entries()].map(([key, routes]) => ({
        key,
        model: routes[0],
        routes,
        suggestion: suggestionForGroup(routes[0], routes, targetMarginPercent, marginFloorPercent, nowMs, maxAgeHours, isEligibleRoute),
    }));
}

export function logicalModelKey(model: VideoModel): string {
    return groupKey(model);
}
