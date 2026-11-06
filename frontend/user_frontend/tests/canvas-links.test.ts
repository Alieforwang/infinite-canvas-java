import { describe, expect, test } from "bun:test";
import type { CanvasNode } from "../src/api/canvas";
import { appendCanvasLink, canvasLinkPath, cloneCanvasLinks, getCanvasLinks, isCanvasLink, pruneCanvasLinks } from "../src/lib/canvas-links";

const node = (id: string): CanvasNode => ({ id, type: "text", x: 0, y: 0, width: 100, height: 80 });
const link = (id: string, fromNodeId = "a", toNodeId = "b") => ({ id, fromNodeId, toNodeId });

describe("canvas links", () => {
    test("curves leave the source to the right and enter the target from the left in every world direction", () => {
        const cases = [
            { from: { x: -300, y: -40 }, to: { x: 100, y: 60 }, bend: 200 },
            { from: { x: 100, y: -40 }, to: { x: -300, y: -60 }, bend: 200 },
            { from: { x: -100, y: -40 }, to: { x: -100, y: 60 }, bend: 80 },
            { from: { x: -100, y: -40 }, to: { x: -80, y: -60 }, bend: 80 },
        ];
        for (const { from, to, bend } of cases) {
            const path = canvasLinkPath(from, to);
            expect(path).toBe(`M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`);
        }
    });

    test("appends directed links immutably and rejects invalid or duplicate requests without changing identity", () => {
        const nodes = [node("a"), node("b")];
        const unknown = { id: "reserved", custom: true };
        const initial: unknown[] = [unknown];
        const result = appendCanvasLink(initial, nodes, "a", "b", "edge");
        expect(result).toEqual([unknown, link("edge")]);
        expect(initial).toEqual([unknown]);
        expect(result[0]).toBe(unknown);
        for (const [from, to, id] of [["a", "a", "self"], ["a", "gone", "missing"], ["", "b", "empty"], [" ", "b", "whitespace"], ["a", "b", "duplicate"], ["b", "a", "edge"], ["b", "a", "reserved"], ["b", "a", ""]]) {
            expect(appendCanvasLink(result, nodes, from, to, id)).toBe(result);
        }
        expect(appendCanvasLink(result, nodes, "b", "a", "reverse")).toEqual([...result, link("reverse", "b", "a")]);
    });
    test("clones only the selected group's internal links using node index mapping and fresh IDs", () => {
        const source = [node("b"), node("a")];
        const clones = [node("copy-b"), node("copy-a")];
        const data = [link("internal"), link("reverse", "b", "a"), link("external-in", "outside", "a"), link("external-out", "b", "outside"), link("self", "a", "a"), { custom: true }];
        let count = 0;
        expect(cloneCanvasLinks(data, source, clones, () => `copy-${++count}`)).toEqual([
            link("copy-1", "copy-a", "copy-b"), link("copy-2", "copy-b", "copy-a"),
        ]);
        expect(data[0]).toEqual(link("internal"));
        expect(source.map((item) => item.id)).toEqual(["b", "a"]);
        expect(cloneCanvasLinks(data, source, [node("copy-b")])).toEqual([]);
        expect(cloneCanvasLinks(data, source, [node("same"), node("same")])).toEqual([]);
        expect(cloneCanvasLinks(data, source, clones, () => "internal")).toEqual([]);
    });

    test("renders valid legacy links once and preserves unknown data when deleting nodes", () => {
        const nodes = [node("a"), node("b")];
        const first = link("edge");
        const future = { id: "future", source: "a", target: "b", kind: "future-format" };
        const data = [future, null, first, link("edge", "b", "a"), link("self", "a", "a"), link("missing", "a", "gone"), { id: "", fromNodeId: "a", toNodeId: "b" }];
        expect(isCanvasLink(first)).toBe(true);
        expect(isCanvasLink(future)).toBe(false);
        expect(isCanvasLink(null)).toBe(false);
        expect(isCanvasLink(data[data.length - 1])).toBe(false);
        expect(getCanvasLinks(data, nodes)).toEqual([first]);
        const pruned = pruneCanvasLinks(data, [node("a")]);
        expect(pruned).toEqual([future, null, data[data.length - 1]]);
        expect(pruned[0]).toBe(future);
        expect(data).toHaveLength(7);
    });
});
