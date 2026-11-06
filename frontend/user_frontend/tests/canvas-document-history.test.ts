import { describe, expect, test } from "bun:test";
import type { CanvasNode } from "../src/api/canvas";
import { commitHistory, createHistory, undoHistory } from "../src/lib/canvas-editing";
import { commitDocumentHistory, createDocumentHistory, redoDocumentHistory, undoDocumentHistory } from "../src/lib/canvas-document-history";

const node = (id: string, patch: Partial<CanvasNode> = {}): CanvasNode => ({ id, type: "text", x: 0, y: 0, width: 100, height: 80, ...patch });
const link = (from = "a", to = "b") => ({ id: `edge-${from}-${to}`, from, to, metadata: { label: "reference", points: [{ x: 20, y: 40 }] } });

describe("reproduction: node-only history loses document connections", () => {
    test("adding a connection with unchanged nodes does not create an undo step", () => {
        const nodes = [node("a"), node("b")];
        const before = createHistory(nodes);
        const document = { nodes, connections: [link()] };
        const after = commitHistory(before, document.nodes);
        expect(after).toBe(before);
        expect(after.past).toHaveLength(0);
        expect("connections" in after).toBe(false);
    });

    test("deleting a connected node then undoing restores nodes but cannot restore its edge", () => {
        let document = { nodes: [node("a"), node("b")], connections: [link()] };
        let history = createHistory(document.nodes);
        document = { nodes: document.nodes.filter((item) => item.id !== "b"), connections: [] };
        history = commitHistory(history, document.nodes);
        history = undoHistory(history);
        document = { ...document, nodes: history.present };
        expect(document.nodes.map((item) => item.id)).toEqual(["a", "b"]);
        expect(document.connections).toEqual([]);
        expect("connections" in history.present).toBe(false);
    });
});

describe("document history", () => {
    test("connection creation is undoable even with unchanged nodes", () => {
        const nodes = [node("a"), node("b")];
        const initial = createDocumentHistory(nodes);
        const connected = commitDocumentHistory(initial, nodes, [link()]);
        expect(connected).not.toBe(initial);
        expect(connected.past).toHaveLength(1);
        expect(undoDocumentHistory(connected).present).toEqual({ nodes, connections: [] });
        expect(redoDocumentHistory(undoDocumentHistory(connected)).present).toEqual(connected.present);
    });

    test("deleting a connected node restores the node and edge in the same undo", () => {
        const nodes = [node("a"), node("b")];
        const initial = createDocumentHistory(nodes, [link()]);
        const deleted = commitDocumentHistory(initial, [nodes[0]], []);
        expect(deleted.present).toEqual({ nodes: [nodes[0]], connections: [] });
        const restored = undoDocumentHistory(deleted);
        expect(restored.present).toEqual({ nodes, connections: [link()] });
        expect(redoDocumentHistory(restored).present).toEqual(deleted.present);
    });

    test("removing only an edge restores that edge without changing nodes", () => {
        const nodes = [node("a"), node("b"), node("c")];
        const initial = createDocumentHistory(nodes, [link(), link("b", "c")]);
        const disconnected = commitDocumentHistory(initial, nodes, [link("b", "c")]);
        expect(undoDocumentHistory(disconnected).present).toEqual(initial.present);
        expect(disconnected.present.nodes).toEqual(nodes);
    });

    test("snapshots deeply detach nested connections and future node properties", () => {
        const nodes = [Object.assign(node("a"), { metadata: { labels: ["original"] } })];
        const connections = [link()];
        const initial = createDocumentHistory(nodes, connections);
        nodes[0].metadata.labels[0] = "outside mutation";
        connections[0].metadata.points[0].x = 999;
        connections.push(link("a", "c"));
        expect(initial.present.nodes[0]).toHaveProperty("metadata.labels", ["original"]);
        expect(initial.present.connections).toEqual([link()]);
        const changedConnections = [link("a", "c")];
        const changed = commitDocumentHistory(initial, nodes, changedConnections);
        changedConnections[0].metadata.points[0].y = 888;
        expect(changed.present.connections).toEqual([link("a", "c")]);
        expect(undoDocumentHistory(changed).present).toEqual(initial.present);
        expect(initial.past).toEqual([]);
    });

    test("restored present snapshots do not alias past or future snapshots", () => {
        const initial = createDocumentHistory([node("a"), node("b")], [link()]);
        const changed = commitDocumentHistory(initial, [node("a", { x: 120 }), node("b")], [link("b", "a")]);
        const undone = undoDocumentHistory(changed);
        (undone.present.connections[0] as ReturnType<typeof link>).metadata.points[0].x = 777;
        undone.present.nodes[0].x = 777;
        expect(changed.past[0].connections).toEqual([link()]);
        expect(changed.past[0].nodes[0].x).toBe(0);
        const redone = redoDocumentHistory(undone);
        (redone.present.connections[0] as ReturnType<typeof link>).metadata.points[0].x = 888;
        redone.present.nodes[0].x = 888;
        expect(undone.future[0].connections).toEqual([link("b", "a")]);
        expect(undone.future[0].nodes[0].x).toBe(120);
    });

    test("unchanged data with reordered object keys preserves history identity and redo", () => {
        const nodes = [node("a"), node("b")];
        const initial = createDocumentHistory(nodes, [link()]);
        const changed = commitDocumentHistory(initial, nodes, [link("b", "a")]);
        const undone = undoDocumentHistory(changed);
        const equivalent = [{ metadata: { points: [{ y: 40, x: 20 }], label: "reference" }, to: "b", from: "a", id: "edge-a-b" }];
        expect(commitDocumentHistory(undone, structuredClone(nodes), equivalent)).toBe(undone);
        expect(redoDocumentHistory(undone).present).toEqual(changed.present);
        expect(undoDocumentHistory(initial)).toBe(initial);
        expect(redoDocumentHistory(initial)).toBe(initial);
    });

    test("a new branch drops redo without mutating the earlier history", () => {
        const nodes = [node("a"), node("b"), node("c")];
        const first = commitDocumentHistory(createDocumentHistory(nodes), nodes, [link()]);
        const second = commitDocumentHistory(first, nodes, [link(), link("b", "c")]);
        const undone = undoDocumentHistory(second);
        const branch = commitDocumentHistory(undone, nodes, [link("a", "c")]);
        expect(branch.future).toEqual([]);
        expect(redoDocumentHistory(branch)).toBe(branch);
        expect(undoDocumentHistory(branch).present).toEqual(first.present);
        expect(undone.future).toHaveLength(1);
    });

    test("nested metadata changes and ordered edge lists both create history", () => {
        const nodes = [node("a"), node("b"), node("c")];
        const initial = createDocumentHistory(nodes, [link(), link("a", "c")]);
        const updated = [link(), link("a", "c")];
        updated[0].metadata.points[0].x = 21;
        const changed = commitDocumentHistory(initial, nodes, updated);
        expect(changed.past).toHaveLength(1);
        expect(undoDocumentHistory(changed).present.connections).toEqual(initial.present.connections);
        expect(commitDocumentHistory(changed, nodes, [...updated].reverse()).past).toHaveLength(2);
    });

    test("unknown JSON connection values round trip without filtering or coercion", () => {
        const connections: unknown[] = [null, "legacy", 0, false, [1, { extra: ["v", null] }], { custom: { flag: true } }];
        const initial = createDocumentHistory([], connections);
        const changed = commitDocumentHistory(initial, [], [null]);
        expect(undoDocumentHistory(changed).present.connections).toEqual(connections);
        expect(commitDocumentHistory(initial, [], structuredClone(connections))).toBe(initial);
    });

    test("caps the undo window at 100 and redoes all retained document changes", () => {
        let history = createDocumentHistory([node("a"), node("b")], [], 500);
        expect(history.limit).toBe(100);
        for (let step = 1; step <= 120; step++) history = commitDocumentHistory(history, [node("a", { x: step }), node("b")], [{ ...link(), step }]);
        expect(history.past).toHaveLength(100);
        for (let step = 0; step < 100; step++) history = undoDocumentHistory(history);
        expect(history.present.nodes[0].x).toBe(20);
        expect(history.present.connections[0]).toHaveProperty("step", 20);
        expect(undoDocumentHistory(history)).toBe(history);
        for (let step = 0; step < 100; step++) history = redoDocumentHistory(history);
        expect(history.present.nodes[0].x).toBe(120);
        expect(history.present.connections[0]).toHaveProperty("step", 120);
        expect(history.past).toHaveLength(100);
    });

    test("empty history and bounded custom limits including zero", () => {
        expect(createDocumentHistory()).toEqual({ past: [], present: { nodes: [], connections: [] }, future: [], limit: 100 });
        expect(createDocumentHistory([], [], NaN).limit).toBe(100);
        expect(createDocumentHistory([], [], -2).limit).toBe(0);
        expect(createDocumentHistory([], [], 2.9).limit).toBe(2);
        const zero = commitDocumentHistory(createDocumentHistory([], [], 0), [node("a")], [link()]);
        expect(zero.past).toEqual([]);
        expect(zero.present).toEqual({ nodes: [node("a")], connections: [link()] });
        expect(undoDocumentHistory(zero)).toBe(zero);
        let limited = createDocumentHistory([], [], 2);
        for (let step = 0; step < 4; step++) limited = commitDocumentHistory(limited, [node("a", { x: step })], [{ step }]);
        expect(limited.past).toHaveLength(2);
        expect(undoDocumentHistory(undoDocumentHistory(limited)).present.connections).toEqual([{ step: 1 }]);
    });
});
