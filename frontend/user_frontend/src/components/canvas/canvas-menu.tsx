import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export type CanvasContextMenuEntry =
    | { type: "separator" }
    | { type: "label"; label: string }
    | {
          type: "item";
          id: string;
          label: string;
          icon?: ReactNode;
          shortcut?: string;
          disabled?: boolean;
          danger?: boolean;
          /** Static submenu entries. */
          children?: CanvasContextMenuEntry[];
          /** Lazily loaded submenu entries (e.g. "save to another canvas"). */
          loadChildren?: () => Promise<CanvasContextMenuEntry[]>;
          onSelect?: () => void;
      };

type Props = {
    position: { x: number; y: number };
    items: CanvasContextMenuEntry[];
    ariaLabel: string;
    onClose: () => void;
    width?: number;
};

const MENU_WIDTH = 224;
const SUBMENU_WIDTH = 208;
const VIEWPORT_MARGIN = 8;

/**
 * Jimeng-style canvas context menu: keyboard navigable, viewport-clamped and
 * supports one level of submenus (loaded eagerly or lazily).
 */
export function CanvasContextMenu({ position, items, ariaLabel, onClose, width = MENU_WIDTH }: Props) {
    const rootRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    const [placement, setPlacement] = useState({ left: position.x, top: position.y, flipSubmenu: false });
    const [submenuOpen, setSubmenuOpen] = useState(false);

    useLayoutEffect(() => {
        const menu = rootRef.current;
        if (!menu) return;
        const rect = menu.getBoundingClientRect();
        const left = clamp(position.x, VIEWPORT_MARGIN, window.innerWidth - rect.width - VIEWPORT_MARGIN);
        const top = clamp(position.y, VIEWPORT_MARGIN, window.innerHeight - rect.height - VIEWPORT_MARGIN);
        const flipSubmenu = left + width + SUBMENU_WIDTH + VIEWPORT_MARGIN > window.innerWidth;
        setPlacement((current) => (current.left === left && current.top === top && current.flipSubmenu === flipSubmenu ? current : { left, top, flipSubmenu }));
    }, [position.x, position.y, width]);

    useEffect(() => {
        const menu = rootRef.current;
        if (!menu) return;
        menu.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
    }, []);

    useEffect(() => {
        const menu = rootRef.current;
        if (!menu) return;
        const outside = (event: Event) => {
            if (!menu.contains(event.target as Node)) closeRef.current();
        };
        const close = () => closeRef.current();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                if (submenuOpen) setSubmenuOpen(false);
                else closeRef.current();
            } else if (event.key === "Tab") {
                event.preventDefault();
                closeRef.current();
            }
        };
        // Capture phase: canvas node handlers stop propagation on pointerdown.
        window.addEventListener("pointerdown", outside, true);
        window.addEventListener("wheel", outside, { passive: true, capture: true });
        window.addEventListener("resize", close);
        window.addEventListener("blur", close);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("pointerdown", outside, true);
            window.removeEventListener("wheel", outside, true);
            window.removeEventListener("resize", close);
            window.removeEventListener("blur", close);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [submenuOpen]);

    return createPortal(
        <div
            ref={rootRef}
            role="menu"
            aria-label={ariaLabel}
            data-canvas-context-menu
            className="fixed z-[110] overflow-visible rounded-xl border border-stone-200 bg-white p-1.5 shadow-2xl dark:border-stone-700 dark:bg-stone-900"
            style={{ left: placement.left, top: placement.top, width }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
            onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
            }}
            onKeyDown={(event) => {
                if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                const buttons = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
                if (!buttons.length) return;
                event.preventDefault();
                event.stopPropagation();
                const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
                const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
                buttons[next]?.focus({ preventScroll: true });
            }}
        >
            <MenuSection items={items} onClose={() => closeRef.current()} flipSubmenu={placement.flipSubmenu} onSubmenuChange={setSubmenuOpen} />
        </div>,
        document.body,
    );
}

function MenuSection({ items, onClose, flipSubmenu, onSubmenuChange }: { items: CanvasContextMenuEntry[]; onClose: () => void; flipSubmenu: boolean; onSubmenuChange: (open: boolean) => void }) {
    const [openId, setOpenId] = useState<string | null>(null);
    const [loadingId, setLoadingId] = useState<string | null>(null);
    const [loaded, setLoaded] = useState<Record<string, CanvasContextMenuEntry[]>>({});

    useEffect(() => {
        onSubmenuChange(Boolean(openId));
    }, [openId, onSubmenuChange]);

    const openSubmenu = (entry: Extract<CanvasContextMenuEntry, { type: "item" }>) => {
        if (entry.disabled) return;
        if (!entry.children && !entry.loadChildren) return;
        if (openId === entry.id) return;
        setOpenId(entry.id);
        if (entry.children || loaded[entry.id] || !entry.loadChildren || loadingId === entry.id) return;
        setLoadingId(entry.id);
        void entry
            .loadChildren()
            .then((children) => setLoaded((current) => ({ ...current, [entry.id]: children })))
            .catch(() => setLoaded((current) => ({ ...current, [entry.id]: [{ type: "item", id: `${entry.id}-error`, label: "加载失败", disabled: true }] })))
            .finally(() => setLoadingId((current) => (current === entry.id ? null : current)));
    };

    const run = (entry: Extract<CanvasContextMenuEntry, { type: "item" }>) => {
        if (entry.disabled) return;
        if (entry.children || entry.loadChildren) {
            openSubmenu(entry);
            return;
        }
        onClose();
        entry.onSelect?.();
    };

    return (
        <>
            {items.map((entry, index) => {
                if (entry.type === "separator") return <div key={`sep-${index}`} role="separator" className="mx-2 my-1 border-t border-stone-100 dark:border-stone-800" />;
                if (entry.type === "label") return <div key={`label-${index}`} className="px-2.5 py-1.5 text-[11px] text-stone-400 dark:text-stone-500">{entry.label}</div>;
                const children = entry.children ?? loaded[entry.id];
                const hasChildren = Boolean(entry.children || entry.loadChildren);
                const expanded = openId === entry.id;
                return (
                    <div key={entry.id} className="relative">
                        <button
                            type="button"
                            role="menuitem"
                            tabIndex={-1}
                            disabled={entry.disabled}
                            aria-haspopup={hasChildren ? "menu" : undefined}
                            aria-expanded={hasChildren ? expanded : undefined}
                            onPointerEnter={() => openSubmenu(entry)}
                            onFocus={() => openSubmenu(entry)}
                            onClick={() => run(entry)}
                            className={cn(
                                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-stone-600 outline-none transition-colors hover:bg-stone-100 focus:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-stone-200 dark:hover:bg-stone-800 dark:focus:bg-stone-800 dark:disabled:hover:bg-transparent",
                                entry.danger && "text-red-600 hover:bg-red-50 focus:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 dark:focus:bg-red-950/40",
                            )}
                        >
                            <span className="flex size-4 shrink-0 items-center justify-center opacity-80">{entry.icon}</span>
                            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                            {entry.shortcut ? <span className="shrink-0 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">{entry.shortcut}</span> : null}
                            {hasChildren ? <ChevronRight className="size-3.5 shrink-0 opacity-60" /> : null}
                            {loadingId === entry.id ? <LoaderCircle className="size-3.5 shrink-0 animate-spin opacity-60" /> : null}
                        </button>
                        {expanded && hasChildren ? (
                            <div
                                role="menu"
                                aria-label={entry.label}
                                className={cn("absolute top-0 max-h-[min(320px,calc(100dvh-32px))] min-w-[208px] overflow-y-auto rounded-xl border border-stone-200 bg-white p-1.5 shadow-2xl dark:border-stone-700 dark:bg-stone-900", flipSubmenu ? "right-full mr-1" : "left-full ml-1")}
                            >
                                {children?.length ? (
                                    <MenuSection items={children} onClose={onClose} flipSubmenu={flipSubmenu} onSubmenuChange={() => {}} />
                                ) : (
                                    <div className="flex items-center gap-2 px-2.5 py-2 text-[12px] text-stone-400">
                                        <LoaderCircle className="size-3.5 animate-spin" />
                                        加载中…
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </>
    );
}

function clamp(value: number, min: number, max: number) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
}
