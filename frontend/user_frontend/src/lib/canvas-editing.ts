import type { CanvasDocument, CanvasNode } from "@/api/canvas";

export type Point = { x: number; y: number };
export type Rect = Point & { width: number; height: number };
export type NodeHistory = {
    past: CanvasNode[][];
    present: CanvasNode[];
    /** The next redo snapshot is at index zero. */
    future: CanvasNode[][];
    limit: number;
};

const HISTORY_LIMIT = 100;
const NODE_FIELDS: (keyof CanvasNode)[] = ["id", "type", "x", "y", "width", "height", "title", "content", "fileNo", "storageKey"];
const snapshot = (nodes: readonly CanvasNode[]): CanvasNode[] => nodes.map((node) => ({ ...node }));
const sameNodes = (a: readonly CanvasNode[], b: readonly CanvasNode[]) => a.length === b.length && a.every((node, index) => NODE_FIELDS.every((field) => node[field] === b[index][field]));

/** History stores detached node snapshots. Viewport/selection changes belong outside it. */
export function createHistory(nodes: readonly CanvasNode[] = [], limit = HISTORY_LIMIT): NodeHistory {
    const boundedLimit = Number.isFinite(limit) ? Math.min(HISTORY_LIMIT, Math.max(0, Math.floor(limit))) : HISTORY_LIMIT;
    return { past: [], present: snapshot(nodes), future: [], limit: boundedLimit };
}

/** Call once at the end of a drag; unchanged commits preserve both redo and identity. */
export function commitHistory(history: NodeHistory, nodes: readonly CanvasNode[]): NodeHistory {
    if (sameNodes(history.present, nodes)) return history;
    return {
        ...history,
        past: history.limit ? [...history.past, snapshot(history.present)].slice(-history.limit) : [],
        present: snapshot(nodes),
        future: [],
    };
}

export function undoHistory(history: NodeHistory): NodeHistory {
    if (!history.past.length) return history;
    return {
        ...history,
        past: history.past.slice(0, -1),
        present: snapshot(history.past[history.past.length - 1]),
        future: [snapshot(history.present), ...history.future],
    };
}

export function redoHistory(history: NodeHistory): NodeHistory {
    if (!history.future.length) return history;
    return {
        ...history,
        past: history.limit ? [...history.past, snapshot(history.present)].slice(-history.limit) : [],
        present: snapshot(history.future[0]),
        future: history.future.slice(1),
    };
}

function normalizeRect(rect: Rect): Rect | null {
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return null;
    return {
        x: Math.min(rect.x, rect.x + rect.width),
        y: Math.min(rect.y, rect.y + rect.height),
        width: Math.abs(rect.width),
        height: Math.abs(rect.height),
    };
}

/** Includes partially intersected nodes and edge contact; supports reverse marquee drags. */
export function rectIntersects(a: Rect, b: Rect): boolean {
    const first = normalizeRect(a);
    const second = normalizeRect(b);
    return Boolean(first && second && first.x <= second.x + second.width && first.x + first.width >= second.x && first.y <= second.y + second.height && first.y + first.height >= second.y);
}

export function selectIntersectingNodes(nodes: readonly CanvasNode[], rect: Rect): string[] {
    return nodes.filter((node) => rectIntersects(node, rect)).map((node) => node.id);
}

export function getNodesBounds(nodes: readonly CanvasNode[]): Rect | null {
    const rects = nodes.map(normalizeRect).filter((rect): rect is Rect => rect !== null);
    if (!rects.length) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const rect of rects) {
        left = Math.min(left, rect.x);
        top = Math.min(top, rect.y);
        right = Math.max(right, rect.x + rect.width);
        bottom = Math.max(bottom, rect.y + rect.height);
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Screen coordinates are world * k + viewport offset; padding is in screen pixels. */
export function fitViewport(nodes: readonly CanvasNode[], size: { width: number; height: number }, padding = 80): CanvasDocument["viewport"] {
    const bounds = getNodesBounds(nodes);
    if (!bounds) return { x: 0, y: 0, k: 1 };
    const width = Number.isFinite(size.width) ? Math.max(1, size.width) : 1;
    const height = Number.isFinite(size.height) ? Math.max(1, size.height) : 1;
    const inset = Number.isFinite(padding) ? Math.max(0, padding) : 80;
    const k = Math.max(0.2, Math.min(2.5, Math.max(1, width - 2 * inset) / Math.max(1, bounds.width), Math.max(1, height - 2 * inset) / Math.max(1, bounds.height)));
    return { x: width / 2 - (bounds.x + bounds.width / 2) * k, y: height / 2 - (bounds.y + bounds.height / 2) * k, k };
}

export type CloneNodesOptions = {
    /** Defaults to (32,32), or (0,0) when anchor is supplied. */
    offset?: Point;
    /** Place the selection's bounding-box top-left at this world position. */
    anchor?: Point;
    /** Injectable for deterministic tests; node- is always prepended. */
    idFactory?: () => string;
};

/** Copies preserve media references and relative layout, never generation task identity. */
export function cloneNodes(nodes: readonly CanvasNode[], options: CloneNodesOptions = {}): CanvasNode[] {
    const bounds = getNodesBounds(nodes);
    const offset = options.offset ?? (options.anchor ? { x: 0, y: 0 } : { x: 32, y: 32 });
    const dx = offset.x + (options.anchor && bounds ? options.anchor.x - bounds.x : 0);
    const dy = offset.y + (options.anchor && bounds ? options.anchor.y - bounds.y : 0);
    const idFactory = options.idFactory ?? (() => crypto.randomUUID());
    const usedIds = new Set(nodes.map((node) => node.id));
    return nodes.map((node) => {
        const base = `node-${idFactory()}`;
        let id = base;
        let suffix = 1;
        while (usedIds.has(id)) id = `${base}-${suffix++}`;
        usedIds.add(id);
        return { ...node, id, x: node.x + dx, y: node.y + dy };
    });
}
