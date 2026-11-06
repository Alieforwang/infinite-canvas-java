import type { CanvasNode } from "@/api/canvas";

export type DocumentSnapshot = {
    nodes: CanvasNode[];
    connections: unknown[];
};

export type DocumentHistory = {
    past: DocumentSnapshot[];
    present: DocumentSnapshot;
    /** The next redo snapshot is at index zero. */
    future: DocumentSnapshot[];
    limit: number;
};

const MAX_HISTORY = 100;

function takeSnapshot(nodes: readonly CanvasNode[], connections: readonly unknown[]): DocumentSnapshot {
    // These are persisted document values. Clone the complete graph so nested edge
    // metadata and any future node fields cannot be changed by editor previews.
    return structuredClone({ nodes: [...nodes], connections: [...connections] });
}

/** Compare persisted JSON values, independent of object property insertion order. */
function sameValue(first: unknown, second: unknown): boolean {
    if (Object.is(first, second)) return true;
    if (first === null || second === null || typeof first !== "object" || typeof second !== "object") return false;
    if (Array.isArray(first) || Array.isArray(second)) {
        return Array.isArray(first) && Array.isArray(second) && first.length === second.length
            && first.every((value, index) => sameValue(value, second[index]));
    }
    const firstKeys = Object.keys(first);
    const secondKeys = Object.keys(second);
    return firstKeys.length === secondKeys.length && firstKeys.every((key) =>
        Object.prototype.hasOwnProperty.call(second, key)
        && sameValue((first as Record<string, unknown>)[key], (second as Record<string, unknown>)[key]),
    );
}

export function createDocumentHistory(
    nodes: readonly CanvasNode[] = [],
    connections: readonly unknown[] = [],
    limit = MAX_HISTORY,
): DocumentHistory {
    const boundedLimit = Number.isFinite(limit) ? Math.min(MAX_HISTORY, Math.max(0, Math.floor(limit))) : MAX_HISTORY;
    return { past: [], present: takeSnapshot(nodes, connections), future: [], limit: boundedLimit };
}

/** Commit nodes and edges together once after a completed editor gesture. */
export function commitDocumentHistory(
    history: DocumentHistory,
    nodes: readonly CanvasNode[],
    connections: readonly unknown[],
): DocumentHistory {
    if (sameValue(history.present.nodes, nodes) && sameValue(history.present.connections, connections)) return history;
    return {
        ...history,
        past: history.limit ? [...history.past, takeSnapshot(history.present.nodes, history.present.connections)].slice(-history.limit) : [],
        present: takeSnapshot(nodes, connections),
        future: [],
    };
}

export function undoDocumentHistory(history: DocumentHistory): DocumentHistory {
    if (!history.past.length) return history;
    const previous = history.past[history.past.length - 1];
    return {
        ...history,
        past: history.past.slice(0, -1),
        present: takeSnapshot(previous.nodes, previous.connections),
        future: [takeSnapshot(history.present.nodes, history.present.connections), ...history.future],
    };
}

export function redoDocumentHistory(history: DocumentHistory): DocumentHistory {
    if (!history.future.length) return history;
    const next = history.future[0];
    return {
        ...history,
        past: history.limit ? [...history.past, takeSnapshot(history.present.nodes, history.present.connections)].slice(-history.limit) : [],
        present: takeSnapshot(next.nodes, next.connections),
        future: history.future.slice(1),
    };
}
