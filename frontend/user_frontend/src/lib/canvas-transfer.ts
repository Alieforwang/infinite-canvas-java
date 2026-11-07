import type { AssetView } from "@/api/assets";
import type { CanvasNode } from "@/api/canvas";
import type { VideoTaskView } from "@/api/video-tasks";

export type CanvasTransferItem = {
    kind: "text" | "image" | "video";
    title: string;
    fileNo?: string;
    textContent?: string;
    taskNo?: string;
};

export function assetToTransferItem(asset: AssetView): CanvasTransferItem {
    return {
        kind: asset.kind,
        title: asset.title,
        fileNo: asset.file?.fileNo,
        textContent: asset.textContent ?? undefined,
        taskNo: typeof asset.metadata?.taskNo === "string" ? asset.metadata.taskNo : undefined,
    };
}

export function taskToTransferItem(task: VideoTaskView): CanvasTransferItem {
    return { kind: "video", title: task.prompt || `${task.modelName} 生成作品`, fileNo: task.file?.fileNo, taskNo: task.taskNo };
}

export function canTransferItem(item: CanvasTransferItem): boolean {
    return item.kind === "text" ? Boolean(item.textContent?.trim()) : Boolean(item.fileNo);
}

/** Task IDs also let callers skip a generated work already present in a document. */
export function transferItemsToNodes(items: CanvasTransferItem[], position = { x: 80, y: 80 }): CanvasNode[] {
    const seen = new Set<string>();
    const nodes: CanvasNode[] = [];
    for (const item of items) {
        if (!canTransferItem(item)) continue;
        const id = item.taskNo ? `task-${item.taskNo}` : crypto.randomUUID();
        if (seen.has(id)) continue;
        seen.add(id);
        const index = nodes.length;
        nodes.push({
            id,
            type: item.kind,
            title: item.title,
            x: position.x + (index % 3) * 360,
            y: position.y + Math.floor(index / 3) * 300,
            width: 320,
            height: item.kind === "text" ? 220 : 240,
            ...(item.taskNo ? { taskNo: item.taskNo } : {}),
            ...(item.kind === "text" ? { content: item.textContent } : { fileNo: item.fileNo }),
        });
    }
    return nodes;
}

/** Use the target captured at submission, never the selection at completion. */
export function applyGeneratedResult(
    nodes: CanvasNode[],
    item: CanvasTransferItem,
    targetNodeId?: string,
    position = { x: 80, y: 80 },
): { nodes: CanvasNode[]; resultNode?: CanvasNode } {
    if (item.taskNo && nodes.some((node) => node.taskNo === item.taskNo || node.id === `task-${item.taskNo}`)) return { nodes };
    const target = nodes.find((node) => node.id === targetNodeId);
    if (target && target.type === item.kind && item.kind !== "text" && item.fileNo && !target.fileNo && !target.storageKey && !target.content) {
        const resultNode = { ...target, title: item.title, fileNo: item.fileNo, storageKey: `file:${item.fileNo}`, taskNo: item.taskNo };
        return { nodes: nodes.map((node) => node.id === target.id ? resultNode : node), resultNode };
    }
    const [resultNode] = transferItemsToNodes([item], position);
    return resultNode ? { nodes: [...nodes, resultNode], resultNode } : { nodes };
}
