import type { ReactNode } from "react";
import { useEffect } from "react";
import { Dropdown } from "antd";
import { LogOut, UserRound } from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuthStore } from "@/stores/use-auth-store";
import { TaskCenter } from "@/components/tasks/task-center";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
    { to: "/video", label: "视频创作台" },
    { to: "/canvas", label: "无限画布" },
    { to: "/assets", label: "我的资产" },
    { to: "/account", label: "我的账户" },
];

export default function UserLayout({ children }: { children?: ReactNode }) {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const user = useAuthStore((state) => state.user);
    const credits = useAuthStore((state) => state.credits);
    const logout = useAuthStore((state) => state.logout);
    const fullBleed = pathname.startsWith("/video") || pathname.startsWith("/canvas/");

    useEffect(() => {
        if (!document.title.includes("无限画布")) {
            document.title = "无限画布 · 视频生成平台";
        }
    }, []);

    const onLogout = async () => {
        await logout();
        navigate("/login", { replace: true });
    };

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            <header className="flex h-14 shrink-0 items-center gap-6 border-b border-stone-200 bg-white px-6 dark:border-stone-800 dark:bg-stone-950">
                <Link to="/video" className="flex shrink-0 items-center gap-2">
                    <span
                        className="size-6 bg-stone-900 dark:bg-stone-100"
                        style={{
                            mask: "url(/logo.svg) center / contain no-repeat",
                            WebkitMask: "url(/logo.svg) center / contain no-repeat",
                        }}
                    />
                    <span className="text-base font-semibold tracking-tight">无限画布</span>
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                        视频平台
                    </span>
                </Link>
                <nav className="flex h-full min-w-0 items-center gap-6">
                    {NAV_ITEMS.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                                cn(
                                    "flex h-full items-center border-b-2 text-sm transition",
                                    isActive
                                        ? "border-stone-950 font-medium text-stone-950 dark:border-stone-100 dark:text-stone-100"
                                        : "border-transparent text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100",
                                )
                            }
                        >
                            {item.label}
                        </NavLink>
                    ))}
                </nav>
                <div className="ml-auto flex items-center gap-4">
                    <TaskCenter />
                    <Link
                        to="/account"
                        className="rounded-full border border-stone-200 px-3 py-1 text-xs text-stone-600 transition hover:border-stone-400 dark:border-stone-700 dark:text-stone-300"
                    >
                        可用 <span className="font-semibold text-stone-900 dark:text-stone-100">{credits.available}</span> 积分
                        {credits.frozen > 0 ? <span className="ml-2 text-amber-600">冻结 {credits.frozen}</span> : null}
                    </Link>
                    <Dropdown
                        menu={{
                            items: [
                                { key: "account", icon: <UserRound className="size-4" />, label: "我的账户" },
                                { type: "divider" },
                                { key: "logout", icon: <LogOut className="size-4" />, label: "退出登录" },
                            ],
                            onClick: ({ key }) => {
                                if (key === "account") navigate("/account");
                                if (key === "logout") void onLogout();
                            },
                        }}
                    >
                        <button type="button" className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-300">
                            <span className="flex size-7 items-center justify-center rounded-full bg-stone-900 text-xs text-white dark:bg-stone-100 dark:text-stone-900">
                                {(user?.displayName || user?.email || "U").slice(0, 1).toUpperCase()}
                            </span>
                            <span className="hidden max-w-32 truncate md:inline">{user?.displayName || user?.email}</span>
                        </button>
                    </Dropdown>
                </div>
            </header>
            <div className={cn("min-h-0 flex-1", fullBleed ? "overflow-hidden" : "overflow-y-auto")}>{children ?? <Outlet />}</div>
        </div>
    );
}
