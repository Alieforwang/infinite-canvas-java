import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Dropdown, Tooltip } from "antd";
import { FolderOpen, Hand, Image as ImageIcon, MousePointer2, Redo2, Type, Undo2, Upload, Video } from "lucide-react";

import { cn } from "@/lib/utils";

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

export function CanvasCreationMenu({ position, onCreate, onUpload, onOpenLibrary, onClose }: CreationActions & { position: { x: number; y: number }; onClose: () => void }) {
    const rootRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    useEffect(() => {
        const menu = rootRef.current;
        if (!menu) return;
        const rect = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(position.x, window.innerWidth - rect.width - 8))}px`;
        menu.style.top = `${Math.max(8, Math.min(position.y, window.innerHeight - rect.height - 8))}px`;
        menu.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
        const outside = (event: Event) => { if (!menu.contains(event.target as Node)) closeRef.current(); };
        const close = () => closeRef.current();
        window.addEventListener("pointerdown", outside);
        window.addEventListener("wheel", outside, { passive: true });
        window.addEventListener("resize", close);
        window.addEventListener("blur", close);
        return () => {
            window.removeEventListener("pointerdown", outside);
            window.removeEventListener("wheel", outside);
            window.removeEventListener("resize", close);
            window.removeEventListener("blur", close);
        };
    }, [position.x, position.y]);
    const action = (callback: () => void) => () => { callback(); onClose(); };
    const item = (label: string, icon: ReactNode, callback: () => void) => <button type="button" role="menuitem" tabIndex={-1} onClick={action(callback)}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-stone-600 outline-none hover:bg-stone-100 focus:bg-blue-50 focus:text-blue-600 dark:text-stone-200 dark:hover:bg-stone-800 dark:focus:bg-blue-950/60 dark:focus:text-blue-300">
        {icon}<span>{label}</span>
    </button>;
    return createPortal(<div ref={rootRef} role="menu" aria-label="画布创建菜单" className="fixed z-[100] max-h-[calc(100dvh-16px)] w-52 overflow-y-auto rounded-xl border border-stone-200 bg-white p-1.5 shadow-2xl dark:border-stone-700 dark:bg-stone-900"
        style={{ left: position.x, top: position.y }}
        onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}
        onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
        onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Tab") {
                if (event.key === "Escape") event.preventDefault();
                event.stopPropagation(); onClose(); return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            const buttons = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next]?.focus({ preventScroll: true });
        }}>
        <div className="px-3 py-1.5 text-[11px] text-stone-400">在此处创建</div>
        {item("创建文本", <Type className="size-4" />, () => onCreate("text"))}
        {item("创建图片", <ImageIcon className="size-4" />, () => onCreate("image"))}
        {item("创建视频", <Video className="size-4" />, () => onCreate("video"))}
        <div role="separator" className="mx-2 my-1 border-t border-stone-100 dark:border-stone-800" />
        {item("上传图片", <Upload className="size-4" />, () => onUpload("image"))}
        {item("上传视频", <Upload className="size-4" />, () => onUpload("video"))}
        {item("从素材库添加", <FolderOpen className="size-4" />, onOpenLibrary)}
    </div>, document.body);
}
