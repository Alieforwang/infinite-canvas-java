import type { ReactNode } from "react";
import { Dropdown, Tooltip } from "antd";
import { ClipboardPaste, FolderOpen, Hand, Image as ImageIcon, MousePointer2, Redo2, Type, Undo2, Upload, Video } from "lucide-react";

import { cn } from "@/lib/utils";
import { CanvasContextMenu, type CanvasContextMenuEntry } from "./canvas-menu";

type NodeType = "text" | "image" | "video";
type MediaType = "image" | "video";
export type CreationActions = {
    onCreate: (type: NodeType) => void;
    onUpload: (type: MediaType) => void;
    onOpenLibrary: () => void;
};

type ToolsProps = CreationActions & {
    tool: "pan" | "select";
    canUndo: boolean;
    canRedo: boolean;
    onToolChange: (tool: "pan" | "select") => void;
    onUndo: () => void;
    onRedo: () => void;
    className?: string;
    compact?: boolean;
};

function ToolButton({ label, tip = label, children, active, disabled, onClick, placement = "top" }: {
    label: string; tip?: string; children: ReactNode; active?: boolean; disabled?: boolean; onClick: () => void; placement?: "top" | "right";
}) {
    return <Tooltip title={tip} placement={placement}>
        <span className="flex shrink-0"><button type="button" aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}
            className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30", active ? "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400" : "text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-stone-100")}>
            {children}
        </button></span>
    </Tooltip>;
}

export function CanvasCreationRail({ onCreate, onUpload, onOpenLibrary, className }: CreationActions & { className?: string }) {
    return <div role="toolbar" aria-label="画布创建栏" aria-orientation="vertical"
        className={cn("flex max-h-[calc(100dvh-160px)] w-fit shrink-0 flex-col items-center gap-1 overflow-y-auto rounded-2xl border border-stone-200/80 bg-white/95 p-1.5 shadow-lg backdrop-blur dark:border-stone-700 dark:bg-stone-900/95", className)}
        onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}
        onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}>
        <ToolButton label="创建文本节点" placement="right" onClick={() => onCreate("text")}><Type className="size-4" /></ToolButton>
        <ToolButton label="创建图片节点" placement="right" onClick={() => onCreate("image")}><ImageIcon className="size-4" /></ToolButton>
        <ToolButton label="创建视频节点" placement="right" onClick={() => onCreate("video")}><Video className="size-4" /></ToolButton>
        <span role="separator" className="my-1 h-px w-6 shrink-0 bg-stone-200 dark:bg-stone-700" />
        <Dropdown trigger={["click"]} placement="bottomLeft" menu={{ items: [
            { key: "image", label: "上传图片", icon: <ImageIcon className="size-4" /> },
            { key: "video", label: "上传视频", icon: <Video className="size-4" /> },
        ], onClick: ({ key }) => onUpload(key as MediaType) }}>
            <span className="flex shrink-0"><Tooltip title="上传素材" placement="right"><button type="button" aria-label="上传素材" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-stone-100"><Upload className="size-4" /></button></Tooltip></span>
        </Dropdown>
        <ToolButton label="打开素材库" placement="right" onClick={onOpenLibrary}><FolderOpen className="size-4" /></ToolButton>
    </div>;
}

export function CanvasWorkbenchTools({ tool, canUndo, canRedo, onToolChange, onCreate, onUpload, onOpenLibrary, onUndo, onRedo, className, compact = false }: ToolsProps) {
    const divider = <span className="mx-1 h-5 w-px shrink-0 bg-stone-200 dark:bg-stone-700" />;
    return <div role="toolbar" aria-label="画布工具栏" className={cn("flex items-center gap-0.5 overflow-x-auto rounded-2xl border border-stone-200 bg-white/95 p-1.5 shadow-xl backdrop-blur dark:border-stone-700 dark:bg-stone-900/95", className)}
        onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}
        onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}>
        <ToolButton label="选择工具" tip="选择 V · 拖动框选" active={tool === "select"} onClick={() => onToolChange("select")}><MousePointer2 className="size-4" /></ToolButton>
        <ToolButton label="移动工具" tip="移动 H · 按住空格临时平移" active={tool === "pan"} onClick={() => onToolChange("pan")}><Hand className="size-4" /></ToolButton>
        {!compact ? <>
        {divider}
        <ToolButton label="创建文本节点" onClick={() => onCreate("text")}><Type className="size-4" /></ToolButton>
        <ToolButton label="创建图片节点" onClick={() => onCreate("image")}><ImageIcon className="size-4" /></ToolButton>
        <ToolButton label="创建视频节点" onClick={() => onCreate("video")}><Video className="size-4" /></ToolButton>
        {divider}
        <Dropdown trigger={["click"]} placement="top" menu={{ items: [
            { key: "image", label: "上传图片", icon: <ImageIcon className="size-4" /> },
            { key: "video", label: "上传视频", icon: <Video className="size-4" /> },
        ], onClick: ({ key }) => onUpload(key as MediaType) }}>
            <button type="button" aria-label="上传素材" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 dark:hover:bg-stone-800"><Upload className="size-4" /></button>
        </Dropdown>
        <ToolButton label="打开素材库" onClick={onOpenLibrary}><FolderOpen className="size-4" /></ToolButton>
        </> : null}
        {divider}
        <ToolButton label="工具栏撤销" tip="撤销 Ctrl/⌘+Z" disabled={!canUndo} onClick={onUndo}><Undo2 className="size-4" /></ToolButton>
        <ToolButton label="工具栏重做" tip="重做 Ctrl/⌘+Shift+Z" disabled={!canRedo} onClick={onRedo}><Redo2 className="size-4" /></ToolButton>
    </div>;
}

type CreationMenuProps = CreationActions & {
    position: { x: number; y: number };
    onClose: () => void;
    canPaste?: boolean;
    canUndo?: boolean;
    canRedo?: boolean;
    onPaste?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
};

export function CanvasCreationMenu({ position, onCreate, onUpload, onOpenLibrary, onClose, canPaste = false, canUndo = false, canRedo = false, onPaste, onUndo, onRedo }: CreationMenuProps) {
    const items: CanvasContextMenuEntry[] = [
        { type: "label", label: "添加节点" },
        { type: "item", id: "create-text", label: "文本", icon: <Type className="size-4" />, onSelect: () => onCreate("text") },
        { type: "item", id: "create-image", label: "图片", icon: <ImageIcon className="size-4" />, onSelect: () => onCreate("image") },
        { type: "item", id: "create-video", label: "视频", icon: <Video className="size-4" />, onSelect: () => onCreate("video") },
        { type: "separator" },
        { type: "item", id: "insert-library", label: "从作品库添加", icon: <FolderOpen className="size-4" />, onSelect: onOpenLibrary },
        {
            type: "item",
            id: "upload",
            label: "本地上传",
            icon: <Upload className="size-4" />,
            children: [
                { type: "item", id: "upload-image", label: "图片", icon: <ImageIcon className="size-4" />, onSelect: () => onUpload("image") },
                { type: "item", id: "upload-video", label: "视频", icon: <Video className="size-4" />, onSelect: () => onUpload("video") },
            ],
        },
        { type: "separator" },
        { type: "item", id: "paste", label: "粘贴", icon: <ClipboardPaste className="size-4" />, shortcut: "Ctrl+V", disabled: !canPaste, onSelect: onPaste },
        { type: "item", id: "redo", label: "重做", icon: <Redo2 className="size-4" />, shortcut: "Ctrl+Shift+Z", disabled: !canRedo, onSelect: onRedo },
        { type: "item", id: "undo", label: "撤销", icon: <Undo2 className="size-4" />, shortcut: "Ctrl+Z", disabled: !canUndo, onSelect: onUndo },
    ];
    return <CanvasContextMenu position={position} items={items} ariaLabel="画布创建菜单" onClose={onClose} />;
}
