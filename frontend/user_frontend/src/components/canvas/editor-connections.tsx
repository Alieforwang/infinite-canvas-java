import { useId, type PointerEvent } from "react";
import type { CanvasNode } from "@/api/canvas";
import { canvasLinkPath, getCanvasLinks } from "@/lib/canvas-links";

export type ConnectionDraft = {
    nodeId: string;
    handleType: "source" | "target";
    pointerId: number;
    point: { x: number; y: number };
    targetNodeId?: string;
};

const inputPoint = (node: CanvasNode) => ({ x: node.x, y: node.y + node.height / 2 });
const outputPoint = (node: CanvasNode) => ({ x: node.x + node.width, y: node.y + node.height / 2 });

export function EditorConnections({ nodes, connections, viewport, selectedId, draft, onSelect }: {
    nodes: CanvasNode[];
    connections: unknown[];
    viewport: { x: number; y: number; k: number };
    selectedId: string | null;
    draft: ConnectionDraft | null;
    onSelect: (id: string) => void;
}) {
    const arrowId = `canvas-link-${useId().replace(/:/g, "")}`;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const origin = draft ? byId.get(draft.nodeId) : undefined;
    const target = draft?.targetNodeId ? byId.get(draft.targetNodeId) : undefined;
    const preview = draft && origin ? canvasLinkPath(
        draft.handleType === "source" ? outputPoint(origin) : target ? outputPoint(target) : draft.point,
        draft.handleType === "target" ? inputPoint(origin) : target ? inputPoint(target) : draft.point,
    ) : null;
    const select = (event: PointerEvent<SVGPathElement>, id: string) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        onSelect(id);
    };

    return <svg aria-label="节点连线" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <defs><marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#a78bfa" /></marker></defs>
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.k})`}>
            {getCanvasLinks(connections, nodes).map((connection) => {
                const from = byId.get(connection.fromNodeId)!;
                const to = byId.get(connection.toNodeId)!;
                const path = canvasLinkPath(outputPoint(from), inputPoint(to));
                return <g key={connection.id}>
                    <path data-connection-id={connection.id} data-from-node-id={from.id} data-to-node-id={to.id} d={path} fill="none" stroke="currentColor" strokeWidth={selectedId === connection.id ? 3 : 2} vectorEffect="non-scaling-stroke" markerEnd={`url(#${arrowId})`} className={selectedId === connection.id ? "text-violet-500" : "text-stone-400 dark:text-stone-500"} />
                    <path data-connection-hit-id={connection.id} d={path} fill="none" stroke="transparent" strokeWidth={18} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "stroke" }} className="cursor-pointer" role="button" tabIndex={0} aria-label={`选择连线：${from.title || from.id} → ${to.title || to.id}`}
                        onPointerDown={(event) => select(event, connection.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(connection.id); } }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onSelect(connection.id); }} />
                </g>;
            })}
            {preview ? <path data-connection-preview d={preview} fill="none" stroke="#8b5cf6" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray={target ? undefined : "6 4"} markerEnd={`url(#${arrowId})`} /> : null}
        </g>
    </svg>;
}
