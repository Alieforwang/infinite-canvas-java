import { describe, expect, test } from "bun:test";
import type { CanvasNode } from "../src/api/canvas";
import { cloneNodes, commitHistory, createHistory, fitViewport, getNodesBounds, rectIntersects, redoHistory, selectIntersectingNodes, undoHistory } from "../src/lib/canvas-editing";

const node = (id = "a", props: Partial<CanvasNode> = {}): CanvasNode => ({ id, type: "text", x: 0, y: 0, width: 100, height: 80, content: "draft", ...props });

describe("canvas node history", () => {
    test("snapshots detach input arrays and nodes so later edits cannot corrupt undo", () => {
        const original = [node()];
        const initial = createHistory(original);
        original[0].content = "mutated outside history";
        original.push(node("b"));
        expect(initial.present).toEqual([node()]);
        const changed = [node("a", { x: 150, content: "edited" })];
        const committed = commitHistory(initial, changed);
        changed[0].x = 999;
        expect(committed.present[0].x).toBe(150);
        expect(undoHistory(committed).present).toEqual([node()]);
        expect(initial.past).toEqual([]);
    });

    test("undo/redo restore node creation, movement and deletion in order", () => {
        const start = createHistory();
        const created = commitHistory(start, [node(), node("b")]);
        const moved = commitHistory(created, [node("a", { x: 200 }), node("b")]);
        const deleted = commitHistory(moved, [node("a", { x: 200 })]);
        const undoDelete = undoHistory(deleted);
        expect(undoDelete.present).toEqual(moved.present);
        const undoMove = undoHistory(undoDelete);
        expect(undoMove.present).toEqual(created.present);
        const undoCreate = undoHistory(undoMove);
        expect(undoCreate.present).toEqual([]);
        expect(redoHistory(redoHistory(redoHistory(undoCreate))).present).toEqual(deleted.present);
        expect(undoHistory(start)).toBe(start);
        expect(redoHistory(deleted)).toBe(deleted);
    });

    test("a real branch clears redo, while unchanged commits preserve redo and identity", () => {
        const first = createHistory([node()]);
        const second = commitHistory(first, [node("a", { title: "renamed" })]);
        const undone = undoHistory(second);
        // Property order is irrelevant to whether content changed.
        const equivalent = { content: "draft", height: 80, width: 100, y: 0, x: 0, type: "text", id: "a" } as CanvasNode;
        expect(commitHistory(undone, [equivalent])).toBe(undone);
        expect(redoHistory(undone).present[0].title).toBe("renamed");
        const branched = commitHistory(undone, [node("a", { content: "new branch" })]);
        expect(branched.future).toEqual([]);
        expect(redoHistory(branched)).toBe(branched);
    });

    test("keeps only the latest 100 undo steps and can redo them all", () => {
        let history = createHistory([node()]);
        for (let x = 1; x <= 120; x++) history = commitHistory(history, [node("a", { x })]);
        expect(history.past.length).toBe(100);
        for (let step = 0; step < 100; step++) history = undoHistory(history);
        expect(history.present[0].x).toBe(20);
        expect(undoHistory(history)).toBe(history);
        for (let step = 0; step < 100; step++) history = redoHistory(history);
        expect(history.present[0].x).toBe(120);
        expect(history.past.length).toBe(100);
    });

    test("custom limits are bounded and zero disables storing undo snapshots", () => {
        let history = createHistory([], 2);
        for (let x = 0; x < 4; x++) history = commitHistory(history, [node("a", { x })]);
        expect(history.past.length).toBe(2);
        expect(undoHistory(undoHistory(history)).present[0].x).toBe(1);
        const noUndo = commitHistory(createHistory([], 0), [node()]);
        expect(noUndo.past).toEqual([]);
        expect(noUndo.present).toEqual([node()]);
        expect(createHistory([], 200).limit).toBe(100);
        expect(createHistory([], Number.NaN).limit).toBe(100);
    });
});

describe("canvas geometry", () => {
    test("bounds span a group across the world origin and ignore invalid geometry", () => {
        expect(getNodesBounds([node("a", { x: -100, y: -50 }), node("b", { x: 200, y: 150 }), node("bad", { x: NaN })])).toEqual({ x: -100, y: -50, width: 400, height: 280 });
        expect(getNodesBounds([])).toBeNull();
        expect(getNodesBounds([node("bad", { width: Infinity })])).toBeNull();
    });

    test("reverse rectangle drags select partial intersections and touching edges", () => {
        const nodes = [node("inside", { x: 20, y: 20 }), node("partial", { x: 140, y: 50 }), node("edge", { x: 150, y: 150 }), node("outside", { x: 151, y: 151 })];
        const selection = { x: 150, y: 150, width: -140, height: -140 };
        expect(selectIntersectingNodes(nodes, selection)).toEqual(["inside", "partial", "edge"]);
        expect(rectIntersects({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 10, width: 0, height: 0 })).toBe(true);
        expect(rectIntersects(selection, { x: NaN, y: 0, width: 10, height: 10 })).toBe(false);
    });

    test("fit centers a distant group and keeps every edge within screen padding", () => {
        const nodes = [node("a", { x: -100, y: -50 }), node("b", { x: 300, y: 170 })];
        const size = { width: 1000, height: 700 };
        const padding = 80;
        const viewport = fitViewport(nodes, size, padding);
        const bounds = getNodesBounds(nodes)!;
        expect(viewport.x + (bounds.x + bounds.width / 2) * viewport.k).toBeCloseTo(size.width / 2);
        expect(viewport.y + (bounds.y + bounds.height / 2) * viewport.k).toBeCloseTo(size.height / 2);
        for (const item of nodes) {
            expect(viewport.x + item.x * viewport.k).toBeGreaterThanOrEqual(padding - 1e-8);
            expect(viewport.y + item.y * viewport.k).toBeGreaterThanOrEqual(padding - 1e-8);
            expect(viewport.x + (item.x + item.width) * viewport.k).toBeLessThanOrEqual(size.width - padding + 1e-8);
            expect(viewport.y + (item.y + item.height) * viewport.k).toBeLessThanOrEqual(size.height - padding + 1e-8);
        }
    });

    test("fit clamps extreme zoom while still centering content", () => {
        const huge = node("huge", { x: 5000, y: -1000, width: 20000, height: 10000 });
        const viewport = fitViewport([huge], { width: 800, height: 600 });
        expect(viewport.k).toBe(0.2);
        expect(viewport.x + (huge.x + huge.width / 2) * viewport.k).toBeCloseTo(400);
        expect(viewport.y + (huge.y + huge.height / 2) * viewport.k).toBeCloseTo(300);
        expect(fitViewport([node("tiny", { width: 1, height: 1 })], { width: 800, height: 600 }).k).toBe(2.5);
        expect(fitViewport([], { width: 800, height: 600 })).toEqual({ x: 0, y: 0, k: 1 });
        const zeroSize = fitViewport([node("point", { width: 0, height: 0 })], { width: 0, height: 0 }, 500);
        expect(Object.values(zeroSize).every(Number.isFinite)).toBe(true);
    });
});

describe("canvas clipboard clones", () => {
    test("preserves file references and relative geometry without mutating the source", () => {
        const source = [node("task-T_SUCCESS", { type: "video", x: -80, y: 120, content: undefined, fileNo: "F_VIDEO", storageKey: "private/object", title: "成功视频" }), node("text", { x: 140, y: -50 })];
        const before = structuredClone(source);
        const copies = cloneNodes(source);
        expect(source).toEqual(before);
        expect(new Set(copies.map(item => item.id)).size).toBe(2);
        expect(copies.every(item => item.id.startsWith("node-") && !item.id.startsWith("task-"))).toBe(true);
        expect(copies[0]).toMatchObject({ x: -48, y: 152, fileNo: "F_VIDEO", storageKey: "private/object", title: "成功视频", type: "video" });
        expect(copies[1].x - copies[0].x).toBe(source[1].x - source[0].x);
        expect(copies[1].y - copies[0].y).toBe(source[1].y - source[0].y);
        expect(cloneNodes(source)[0].id).not.toBe(copies[0].id);
        copies[0].title = "copy edit";
        expect(source[0].title).toBe("成功视频");
    });

    test("anchor places the whole group, then applies explicit offset", () => {
        const source = [node("a", { x: -100, y: 20 }), node("b", { x: 200, y: -80 })];
        const anchored = cloneNodes(source, { anchor: { x: 500, y: 400 } });
        expect(getNodesBounds(anchored)).toMatchObject({ x: 500, y: 400 });
        const nudged = cloneNodes(source, { anchor: { x: 500, y: 400 }, offset: { x: 10, y: -20 } });
        expect(getNodesBounds(nudged)).toMatchObject({ x: 510, y: 380 });
        expect(cloneNodes(source, { offset: { x: 0, y: 0 } })[0].x).toBe(-100);
        expect(cloneNodes([], { anchor: { x: 500, y: 400 } })).toEqual([]);
    });

    test("even repeated injected IDs cannot collide with original or sibling nodes", () => {
        const copies = cloneNodes([node("node-fixed"), node("task-generated")], { idFactory: () => "fixed" });
        expect(copies.map(item => item.id)).toEqual(["node-fixed-1", "node-fixed-2"]);
        expect(cloneNodes([node("task-generated")], { idFactory: () => "task-generated" })[0].id).toBe("node-task-generated");
    });
});
