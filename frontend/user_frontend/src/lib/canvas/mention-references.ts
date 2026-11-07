import type { CanvasNode } from "@/api/canvas";

/**
 * Lightweight @-mention resources for the generation composer. The older
 * canvas-resource-references module is tied to CanvasNodeData; the live editor
 * uses the API CanvasNode shape, so labels are derived here instead.
 */
export type CanvasMentionReference = {
    id: string;
    nodeId: string;
    kind: "image" | "text";
    /** Stable token inserted into the prompt, e.g. "@河边少女.png". */
    label: string;
    title: string;
    previewUrl?: string;
    text?: string;
    active: boolean;
};

function baseLabel(node: CanvasNode) {
    return (node.title?.trim() || (node.type === "text" ? "文本" : "图片")).replace(/\s+/g, " ");
}

/** Duplicate titles get a numeric suffix so two mentions never share a token. */
export function mentionLabel(node: CanvasNode, used?: Set<string>): string {
    const base = baseLabel(node);
    if (!used) return `@${base}`;
    let label = `@${base}`;
    let index = 2;
    while (used.has(label)) label = `@${base} ${index++}`;
    used.add(label);
    return label;
}

/** Deterministic label for a node inside the given node list (duplicates included). */
export function mentionLabelFor(nodes: CanvasNode[], nodeId: string): string {
    const used = new Set<string>();
    for (const node of nodes) {
        const label = mentionLabel(node, used);
        if (node.id === nodeId) return label;
    }
    return "";
}

export function buildMentionReferences(nodes: CanvasNode[], activeIds: Set<string>, media: Record<string, string>, options: { images: boolean; text: boolean; inactiveImages: boolean }): CanvasMentionReference[] {
    const used = new Set<string>();
    return nodes.flatMap((node): CanvasMentionReference[] => {
        const label = mentionLabel(node, used);
        const active = activeIds.has(node.id);
        if (node.type === "image" && node.fileNo) {
            if (!options.images || (!active && !options.inactiveImages)) return [];
            return [{ id: node.id, nodeId: node.id, kind: "image", label, title: node.title?.trim() || label, previewUrl: media[node.fileNo], active }];
        }
        if (node.type === "text" && node.content?.trim()) {
            if (!options.text) return [];
            return [{ id: node.id, nodeId: node.id, kind: "text", label, title: node.title?.trim() || "文本", text: node.content, active: false }];
        }
        return [];
    });
}

/** Remove an @label token (and its surrounding spacing) when a reference is detached. */
export function stripMention(prompt: string, label: string): string {
    if (!label || !prompt.includes(label)) return prompt;
    return prompt
        .split(label)
        .join("")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/[ \t]+([，。！？,.!?])/g, "$1")
        .trimStart();
}

/**
 * Tell the model which attached images correspond to which canvas node titles,
 * so "@title" tokens in the prompt stay meaningful after the files are sent in
 * order.
 */
export function buildReferenceAwarePrompt(prompt: string, references: Array<Pick<CanvasNode, "title">>): string {
    const trimmed = prompt.trim();
    if (!references.length) return trimmed;
    const mapping = references.map((node, index) => `图片${index + 1}：${(node.title || "素材").trim()}`).join("；");
    return `参考图片顺序（可在提示词中用 @名称 或 图片N 指代）：${mapping}。\n\n${trimmed}`;
}
