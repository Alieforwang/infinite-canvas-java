import type { CanvasNode } from "@/api/canvas";

export type CanvasLink = { id: string; fromNodeId: string; toNodeId: string };

const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** Recognizes the persisted legacy shape without modifying unknown extension data. */
export function isCanvasLink(value: unknown): value is CanvasLink {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const candidate = value as Partial<CanvasLink>;
    return nonempty(candidate.id) && nonempty(candidate.fromNodeId) && nonempty(candidate.toNodeId);
}

const hasEndpoints = (link: CanvasLink, ids: Set<string>) => link.fromNodeId !== link.toNodeId && ids.has(link.fromNodeId) && ids.has(link.toNodeId);

export function getCanvasLinks(connections: readonly unknown[], nodes: readonly CanvasNode[]): CanvasLink[] {
    const ids = new Set(nodes.map((node) => node.id));
    const seen = new Set<string>();
    return connections.filter((value): value is CanvasLink => {
        if (!isCanvasLink(value) || !hasEndpoints(value, ids) || seen.has(value.id)) return false;
        seen.add(value.id);
        return true;
    });
}

export function appendCanvasLink(connections: unknown[], nodes: readonly CanvasNode[], fromNodeId: string, toNodeId: string, id: string = crypto.randomUUID()): unknown[] {
    const candidate = { id, fromNodeId, toNodeId };
    const ids = new Set(nodes.map((node) => node.id));
    if (!isCanvasLink(candidate) || !hasEndpoints(candidate, ids)) return connections;
    const duplicate = connections.some((value) => {
        if (!value || typeof value !== "object") return false;
        if ((value as { id?: unknown }).id === id) return true;
        return isCanvasLink(value) && value.fromNodeId === fromNodeId && value.toNodeId === toNodeId;
    });
    return duplicate ? connections : [...connections, candidate];
}

/** Copy the selected subgraph only; external references stay outside the new group. */
export function cloneCanvasLinks(connections: readonly unknown[], source: readonly CanvasNode[], clones: readonly CanvasNode[], idFactory: () => string = () => crypto.randomUUID()): CanvasLink[] {
    const mapping = new Map<string, string>();
    source.forEach((node, index) => {
        const clone = clones[index];
        if (clone && nonempty(clone.id)) mapping.set(node.id, clone.id);
    });
    const usedIds = new Set(connections.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const id = (value as { id?: unknown }).id;
        return nonempty(id) ? [id] : [];
    }));
    const result: CanvasLink[] = [];
    for (const link of getCanvasLinks(connections, source)) {
        const fromNodeId = mapping.get(link.fromNodeId);
        const toNodeId = mapping.get(link.toNodeId);
        if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) continue;
        const id = idFactory();
        if (!nonempty(id) || usedIds.has(id)) continue;
        usedIds.add(id);
        result.push({ id, fromNodeId, toNodeId });
    }
    return result;
}

/** Endpoints are world-space anchors, already positioned at each node's side. */
export function canvasLinkPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
    const curvature = Math.max(Math.abs(to.x - from.x) * 0.5, 80);
    return `M ${from.x} ${from.y} C ${from.x + curvature} ${from.y}, ${to.x - curvature} ${to.y}, ${to.x} ${to.y}`;
}

/** Keep unknown records intact; only remove recognized links whose endpoints became invalid. */
export function pruneCanvasLinks(connections: unknown[], nodes: readonly CanvasNode[]): unknown[] {
    const ids = new Set(nodes.map((node) => node.id));
    return connections.filter((value) => !isCanvasLink(value) || hasEndpoints(value, ids));
}
