import { expect, test } from "bun:test";
import type { CanvasNode } from "../src/api/canvas";
import { buildMentionReferences, buildReferenceAwarePrompt, mentionLabelFor, stripMention } from "../src/lib/canvas/mention-references";

const node = (partial: Partial<CanvasNode> & Pick<CanvasNode, "id" | "type">): CanvasNode => ({ x: 0, y: 0, width: 100, height: 100, ...partial });
const nodes: CanvasNode[] = [
    node({ id: "img-1", type: "image", title: "河边少女", fileNo: "f1" }),
    node({ id: "txt-1", type: "text", title: "镜头描述", content: "低机位仰拍" }),
    node({ id: "img-2", type: "image", title: "河边少女", fileNo: "f2" }),
    node({ id: "img-empty", type: "image" }),
];
const media = { f1: "https://example.test/1.png" };

test("@ labels stay stable and disambiguate duplicate titles", () => {
    expect(mentionLabelFor(nodes, "img-1")).toBe("@河边少女");
    expect(mentionLabelFor(nodes, "img-2")).toBe("@河边少女 2");
    expect(mentionLabelFor(nodes, "txt-1")).toBe("@镜头描述");
    expect(mentionLabelFor(nodes, "missing")).toBe("");
});

test("mention menu includes attachable images and text, but not empty nodes", () => {
    const references = buildMentionReferences(nodes, new Set(["img-1"]), media, { images: true, text: true, inactiveImages: true });
    expect(references.find((item) => item.id === "img-1")?.active).toBe(true);
    expect(references.find((item) => item.id === "img-1")?.previewUrl).toBe(media.f1);
    expect(references.find((item) => item.id === "txt-1")?.text).toBe("低机位仰拍");
    expect(references.some((item) => item.id === "img-empty")).toBe(false);
});

test("models without image references only offer text mentions", () => {
    const references = buildMentionReferences(nodes, new Set(), media, { images: false, text: true, inactiveImages: true });
    expect(references.every((item) => item.kind === "text")).toBe(true);
});

test("reaching the reference limit hides unattached images but keeps active ones", () => {
    const references = buildMentionReferences(nodes, new Set(["img-1"]), media, { images: true, text: true, inactiveImages: false });
    expect(references.some((item) => item.id === "img-1")).toBe(true);
    expect(references.some((item) => item.id === "img-2")).toBe(false);
});

test("detaching a reference strips its @ token without breaking the sentence", () => {
    expect(stripMention("女孩 @河边少女 看向镜头", "@河边少女")).toBe("女孩 看向镜头");
    expect(stripMention("女孩 @河边少女，看向镜头", "@河边少女")).toBe("女孩，看向镜头");
    expect(stripMention("没有引用", "@河边少女")).toBe("没有引用");
});

test("submitted prompt maps reference titles to attachment order", () => {
    expect(buildReferenceAwarePrompt("海边", [])).toBe("海边");
    const prompt = buildReferenceAwarePrompt("  @河边少女 回头 ", [nodes[0], nodes[2]]);
    expect(prompt).toContain("图片1：河边少女");
    expect(prompt).toContain("图片2：河边少女");
    expect(prompt.endsWith("@河边少女 回头")).toBe(true);
});
