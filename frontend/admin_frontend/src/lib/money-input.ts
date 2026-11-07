/** Compare decimal text without first rounding it to a JavaScript number. */
function decimalIdentity(value: unknown): string | null {
    if (typeof value !== "number" && typeof value !== "string") return null;
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(value).trim());
    if (!match || !(match[2] || match[3])) return null;
    const digits = `${match[2]}${match[3] ?? ""}`.replace(/^0+/, "");
    if (!digits) return "0";
    const significant = digits.replace(/0+$/, "");
    const exponent = Number(match[4] ?? 0) - (match[3]?.length ?? 0) + digits.length - significant.length;
    if (!Number.isSafeInteger(exponent)) return null;
    return `${match[1] === "-" ? "-" : ""}${significant}e${exponent}`;
}

export function sameDisplayedMoney(value: unknown, displayed: number): boolean {
    const identity = decimalIdentity(value);
    return Number.isFinite(displayed) && identity !== null && identity === decimalIdentity(displayed);
}
