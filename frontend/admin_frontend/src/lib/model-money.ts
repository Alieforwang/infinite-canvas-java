import { sameDisplayedMoney } from "./money-input";
import { creditsToYuan } from "./format";

export interface ModelMoneyRule {
    resolution: string;
    seconds?: number;
    credits: number | string;
}

/** Preserve the exact stored unit when a repeating yuan amount was not edited. */
export function unchangedModelUnits(value: unknown, originalUnits: number | undefined, exchangePerYuan: number): number | null {
    if (originalUnits === undefined || !Number.isFinite(originalUnits) || Math.abs(originalUnits) > Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(exchangePerYuan) || exchangePerYuan <= 0) return null;
    return sameDisplayedMoney(value, creditsToYuan(originalUnits, exchangePerYuan)!) ? originalUnits : null;
}

/** Match a price by its specification, never by its position in the form. */
export function unchangedModelRuleUnits(value: ModelMoneyRule, originalRules: ModelMoneyRule[], exchangePerYuan: number): number | null {
    for (const original of originalRules) {
        if (original.resolution.trim() !== value.resolution.trim() || original.seconds !== value.seconds) continue;
        const units = unchangedModelUnits(value.credits, Number(original.credits), exchangePerYuan);
        if (units !== null) return units;
    }
    return null;
}

export function modelMoneyRulesUnchanged(values: ModelMoneyRule[], originals: ModelMoneyRule[], exchangePerYuan: number): boolean {
    return values.length === originals.length && values.every((rule) => unchangedModelRuleUnits(rule, originals, exchangePerYuan) !== null);
}
