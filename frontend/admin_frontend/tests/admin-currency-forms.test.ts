import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { planFormPayload } from "../src/pages/PlansPage";
import { creditsToYuan, currencyText, formatYuan, yuanToCredits } from "../src/lib/format";

const formValues = {
    code: " pack ", name: "充值包", type: "CREDIT_PACK", priceAmount: "19.99",
    credits: "0.29", bonusCredits: "0.01", validDays: 0, description: "说明", sort: 0, enabled: true,
};

describe("admin RMB form boundaries", () => {
    test("new adjustments and recharges retain exact decimals and reject noninteger units", () => {
        expect(yuanToCredits("0.29", 100)).toBe(29);
        expect(yuanToCredits("-1.25", 100)).toBe(-125);
        expect(() => yuanToCredits("0.001", 100)).toThrow("精度");
        expect(yuanToCredits("0.001", 1000)).toBe(1);
        expect(() => yuanToCredits("0.29000000000000000000001", 100)).toThrow("精度");
        expect(() => yuanToCredits("-1.2500000000000001", 100)).toThrow("精度");
        expect(() => yuanToCredits("9007199254740992", 100)).toThrow("范围");
    });

    test("plan submits yuan fields once and leaves its CNY selling price unchanged", () => {
        expect(planFormPayload(formValues, 100, null)).toMatchObject({ code: "pack", credits: 29, bonusCredits: 1, priceAmount: 19.99 });
        expect(planFormPayload({ ...formValues, credits: "0.001", bonusCredits: "0.002" }, 1000, null))
            .toMatchObject({ credits: 1, bonusCredits: 2, priceAmount: 19.99 });
        expect(() => planFormPayload({ ...formValues, credits: "0.001" }, 100, null)).toThrow("精度");
        expect(() => planFormPayload({ ...formValues, bonusCredits: "0.001" }, 100, null)).toThrow("精度");
        expect(() => planFormPayload({ ...formValues, credits: "-1.25" }, 100, null)).toThrow("负数");
        expect(() => planFormPayload({ ...formValues, priceAmount: "-0.01" }, 100, null)).toThrow("非负价格");
    });

    test("unmodified plan units survive nonterminating yuan fractions and unrelated edits", () => {
        const original = { credits: 1, bonusCredits: 2, displayedCredits: String(creditsToYuan(1, 3)), displayedBonus: String(creditsToYuan(2, 3)) };
        const values = { ...formValues, name: "仅修改名称", credits: original.displayedCredits, bonusCredits: original.displayedBonus };
        expect(planFormPayload(values, 3, original)).toMatchObject({ name: "仅修改名称", credits: 1, bonusCredits: 2 });
        expect(planFormPayload({ ...values, credits: "1" }, 3, original)).toMatchObject({ credits: 3, bonusCredits: 2 });
        expect(() => planFormPayload({ ...values, credits: "0.33333333333333331" }, 3, original)).toThrow("精度");
        const createDefault = { credits: 1000, bonusCredits: 0, displayedCredits: String(creditsToYuan(1000, 3)), displayedBonus: "0" };
        expect(planFormPayload({ ...formValues, credits: createDefault.displayedCredits, bonusCredits: "0" }, 3, createDefault).credits).toBe(1000);
    });

    test("historical plan text converts numbers at the configured rate and keeps subfen amounts", () => {
        expect(currencyText("1000积分包", 1000)).toBe("¥1.00充值包");
        expect(currencyText("积分不足，当前1积分", 1000)).toBe("余额不足，当前¥0.001");
        expect(formatYuan(creditsToYuan(1, 1000))).toBe("¥0.001");
        expect(formatYuan(creditsToYuan(-125, 100))).toBe("¥-1.25");
    });

    test.each([
        { page: "UsersPage", fields: ["amount"], count: 2 },
        { page: "PlansPage", fields: ["priceAmount", "credits", "bonusCredits"], count: 3 },
        { page: "RedeemCodesPage", fields: ["credits"], count: 1 },
    ])("$page money controls preserve strings and never silently clamp or round", async ({ page, fields, count }) => {
        const source = await Bun.file(new URL(`../src/pages/${page}.tsx`, import.meta.url)).text();
        const ast = ts.createSourceFile(`${page}.tsx`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        const controls: ts.JsxSelfClosingElement[] = [];
        const attribute = (attributes: ts.JsxAttributes, name: string) => attributes.properties.find(
            (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText(ast) === name,
        );
        const collect = (node: ts.Node) => {
            if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === "Form.Item") {
                const name = attribute(node.openingElement.attributes, "name")?.initializer;
                if (name && ts.isStringLiteral(name) && fields.includes(name.text)) {
                    const findInput = (child: ts.Node) => {
                        if (ts.isJsxSelfClosingElement(child) && child.tagName.getText(ast) === "InputNumber") controls.push(child);
                        child.forEachChild(findInput);
                    };
                    node.forEachChild(findInput);
                }
            }
            node.forEachChild(collect);
        };
        collect(ast);
        expect(controls.length).toBe(count);
        for (const control of controls) {
            expect(attribute(control.attributes, "stringMode")).toBeDefined();
            expect(attribute(control.attributes, "precision")).toBeUndefined();
            expect(attribute(control.attributes, "min")).toBeUndefined();
            expect(attribute(control.attributes, "max")).toBeUndefined();
        }
        expect(source).not.toContain("积分");
    });
});
