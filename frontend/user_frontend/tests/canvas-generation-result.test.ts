import { describe, expect, test } from "bun:test";
import type { CanvasNode } from "../src/api/canvas";
import { applyGeneratedResult } from "../src/lib/canvas-transfer";

const empty: CanvasNode = { id: "empty-image", type: "image", x: 100, y: 80, width: 320, height: 240 };
const result = { kind: "image" as const, title: "池塘里的鱼", fileNo: "generated-file", taskNo: "img_1" };

describe("canvas generation result placement", () => {
    test("fills the originating empty node and preserves its identity and geometry", () => {
        const nodes = [empty, { ...empty, id: "other" }];
        const applied = applyGeneratedResult(nodes, result, empty.id);
        expect(applied.nodes).toHaveLength(2);
        expect(applied.resultNode).toEqual({ ...empty, title: result.title, fileNo: result.fileNo, storageKey: `file:${result.fileNo}`, taskNo: result.taskNo });
        expect(applied.nodes[1]).toBe(nodes[1]);
        expect(nodes[0]).toEqual(empty);
    });
    test("replaying completion after saving and loading does not insert a duplicate", () => {
        const first = applyGeneratedResult([empty], result, empty.id);
        const restored = JSON.parse(JSON.stringify(first.nodes));
        const replay = applyGeneratedResult(restored, result, empty.id);
        expect(replay.nodes).toBe(restored);
        expect(replay.resultNode).toBeUndefined();
    });
    test.each([
        { nodes: [] },
        { nodes: [{ ...empty, fileNo: "user-upload" }] },
        { nodes: [{ ...empty, content: "existing-content" }] },
        { nodes: [{ ...empty, storageKey: "existing-storage" }] },
        { nodes: [{ ...empty, type: "video" as const }] },
    ])("preserves edits and inserts separately when the target is unavailable", ({ nodes }) => {
        const applied = applyGeneratedResult(nodes, result, empty.id, { x: 500, y: 300 });
        expect(applied.nodes).toHaveLength(nodes.length + 1);
        expect(applied.resultNode).toMatchObject({ id: "task-img_1", type: "image", fileNo: result.fileNo, x: 500, y: 300 });
        if (nodes.length) expect(applied.nodes[0]).toBe(nodes[0]);
    });
    test("global generation inserts a new node and legacy results are deduplicated", () => {
        const applied = applyGeneratedResult([empty], result);
        expect(applied.nodes).toHaveLength(2);
        expect(applied.nodes[0]).toBe(empty);
        const legacy = [{ ...empty, id: "task-img_1", fileNo: result.fileNo }];
        expect(applyGeneratedResult(legacy, result).nodes).toBe(legacy);
    });
});
