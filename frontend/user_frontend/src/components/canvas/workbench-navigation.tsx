import { useMemo, useState } from "react";
import { Expand, Map, Minus, Plus, RotateCcw } from "lucide-react";

import type { CanvasDocument, CanvasNode } from "@/api/canvas";
import { cn } from "@/lib/utils";

export type CanvasWorkbenchNavigationProps = {
    nodes: CanvasNode[];
    viewport: CanvasDocument["viewport"];
    size: { width: number; height: number };
    onViewportChange: (viewport: CanvasDocument["viewport"]) => void;
    className?: string;
};

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
const MAP_WIDTH = 220;
const MAP_HEIGHT = 132;
const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

export function CanvasWorkbenchNavigation({ nodes, viewport, size, onViewportChange, className }: CanvasWorkbenchNavigationProps) {
    const [mapOpen, setMapOpen] = useState(true);
    const width = Math.max(size.width, 1);
    const height = Math.max(size.height, 1);
    const zoom = Number.isFinite(viewport.k) && viewport.k > 0 ? viewport.k : 1;
    const visible = { x: -viewport.x / zoom, y: -viewport.y / zoom, width: width / zoom, height: height / zoom };
    const minimap = useMemo(() => {
        const left = Math.min(visible.x, ...nodes.map((node) => node.x));
        const top = Math.min(visible.y, ...nodes.map((node) => node.y));
        const right = Math.max(visible.x + visible.width, ...nodes.map((node) => node.x + node.width));
        const bottom = Math.max(visible.y + visible.height, ...nodes.map((node) => node.y + node.height));
        const contentWidth = Math.max(1, right - left);
        const contentHeight = Math.max(1, bottom - top);
        const scale = Math.min((MAP_WIDTH - 24) / contentWidth, (MAP_HEIGHT - 24) / contentHeight);
        return {
            scale,
            offsetX: (MAP_WIDTH - contentWidth * scale) / 2 - left * scale,
            offsetY: (MAP_HEIGHT - contentHeight * scale) / 2 - top * scale,
        };
    }, [nodes, visible.x, visible.y, visible.width, visible.height]);

    const changeZoom = (next: number) => {
        const k = clampZoom(next);
        const centerX = (width / 2 - viewport.x) / zoom;
        const centerY = (height / 2 - viewport.y) / zoom;
        onViewportChange({ x: width / 2 - centerX * k, y: height / 2 - centerY * k, k });
    };

    const fit = () => {
        if (!nodes.length) return onViewportChange({ x: 0, y: 0, k: 1 });
        const left = Math.min(...nodes.map((node) => node.x));
        const top = Math.min(...nodes.map((node) => node.y));
        const right = Math.max(...nodes.map((node) => node.x + node.width));
        const bottom = Math.max(...nodes.map((node) => node.y + node.height));
        const k = clampZoom(Math.min(Math.max(1, width - 96) / Math.max(1, right - left), Math.max(1, height - 96) / Math.max(1, bottom - top), 1));
        onViewportChange({ x: width / 2 - (left + right) / 2 * k, y: height / 2 - (top + bottom) / 2 * k, k });
    };
    const buttonClass = "flex size-8 shrink-0 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-stone-800 dark:hover:text-stone-100";

    return (
        <div aria-label="画布导航" className={cn("flex w-fit flex-col items-end gap-2", className)} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
            {mapOpen ? <div className="overflow-hidden rounded-xl border border-stone-200 bg-white/95 shadow-sm backdrop-blur dark:border-stone-700 dark:bg-stone-900/95">
                <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2 text-[10px] text-stone-400 dark:border-stone-800"><span>画布概览</span><span>点击定位</span></div>
                <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} width={MAP_WIDTH} height={MAP_HEIGHT} role="button" tabIndex={0}
                    aria-label="画布小地图，点击定位；方向键平移画布" className="block cursor-crosshair bg-stone-50 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 dark:bg-stone-950"
                    onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        const mapX = (event.clientX - rect.left) * MAP_WIDTH / Math.max(rect.width, 1);
                        const mapY = (event.clientY - rect.top) * MAP_HEIGHT / Math.max(rect.height, 1);
                        const worldX = (mapX - minimap.offsetX) / minimap.scale;
                        const worldY = (mapY - minimap.offsetY) / minimap.scale;
                        onViewportChange({ x: width / 2 - worldX * zoom, y: height / 2 - worldY * zoom, k: zoom });
                    }}
                    onKeyDown={(event) => {
                        const directions: Record<string, [number, number]> = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
                        const direction = directions[event.key];
                        if (!direction) return;
                        event.preventDefault();
                        event.stopPropagation();
                        onViewportChange({ ...viewport, x: viewport.x + direction[0] * 80, y: viewport.y + direction[1] * 80 });
                    }}>
                    {nodes.map((node) => <rect key={node.id} x={node.x * minimap.scale + minimap.offsetX} y={node.y * minimap.scale + minimap.offsetY}
                        width={Math.max(2, node.width * minimap.scale)} height={Math.max(2, node.height * minimap.scale)} rx={2}
                        className={node.type === "text" ? "fill-amber-200 dark:fill-amber-800" : node.type === "image" ? "fill-blue-200 dark:fill-blue-800" : "fill-violet-200 dark:fill-violet-800"} />)}
                    <rect x={visible.x * minimap.scale + minimap.offsetX} y={visible.y * minimap.scale + minimap.offsetY}
                        width={visible.width * minimap.scale} height={visible.height * minimap.scale} rx={2} fill="rgba(59,130,246,0.06)" stroke="#3b82f6" strokeWidth={1.25} />
                </svg>
            </div> : null}
            <div className="flex items-center gap-0.5 rounded-xl border border-stone-200 bg-white/95 p-1 shadow-sm backdrop-blur dark:border-stone-700 dark:bg-stone-900/95">
                <button type="button" title="缩小" aria-label="缩小画布" className={buttonClass} disabled={zoom <= MIN_ZOOM} onClick={() => changeZoom(zoom / 1.2)}><Minus className="size-3.5" /></button>
                <button type="button" title="恢复 100% 缩放" aria-label={`当前缩放 ${Math.round(zoom * 100)}%，点击恢复 100%`} className="h-8 min-w-12 rounded-lg px-1 text-[11px] tabular-nums text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800" onClick={() => changeZoom(1)}>{Math.round(zoom * 100)}%</button>
                <button type="button" title="放大" aria-label="放大画布" className={buttonClass} disabled={zoom >= MAX_ZOOM} onClick={() => changeZoom(zoom * 1.2)}><Plus className="size-3.5" /></button>
                <span className="mx-1 h-4 w-px bg-stone-200 dark:bg-stone-700" />
                <button type="button" title="适应全部内容" aria-label="适应全部画布内容" className={buttonClass} onClick={fit}><Expand className="size-3.5" /></button>
                <button type="button" title="重置视图" aria-label="重置画布视图" className={buttonClass} onClick={() => onViewportChange({ x: 0, y: 0, k: 1 })}><RotateCcw className="size-3.5" /></button>
                <button type="button" title={mapOpen ? "隐藏小地图" : "显示小地图"} aria-label={mapOpen ? "隐藏小地图" : "显示小地图"} aria-pressed={mapOpen} className={cn(buttonClass, mapOpen && "bg-blue-50 !text-blue-500 dark:bg-blue-950/50")} onClick={() => setMapOpen((value) => !value)}><Map className="size-3.5" /></button>
            </div>
        </div>
    );
}
