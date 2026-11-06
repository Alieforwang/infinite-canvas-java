import { useEffect, useState } from "react";
import { Avatar, Button, Layout, Menu, Space, Tag, Tooltip, Typography } from "antd";
import type { MenuProps } from "antd";
import {
    Boxes,
    CreditCard,
    LayoutDashboard,
    ListVideo,
    LogOut,
    Menu as MenuIcon,
    RadioTower,
    Settings,
    Ticket,
    Users,
    Video,
} from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { adminApi } from "../api/admin";
import { useFeedback } from "../lib/feedback";
import { useAuthStore } from "../stores/auth";

const { Sider, Header, Content } = Layout;

const MENU_ITEMS: MenuProps["items"] = [
    { key: "/", icon: <LayoutDashboard size={18} />, label: "概览" },
    { key: "/channels", icon: <RadioTower size={18} />, label: "渠道" },
    { key: "/models", icon: <Boxes size={18} />, label: "模型" },
    { key: "/users", icon: <Users size={18} />, label: "用户" },
    { key: "/plans", icon: <CreditCard size={18} />, label: "套餐" },
    { key: "/redeem-codes", icon: <Ticket size={18} />, label: "兑换码" },
    { key: "/tasks", icon: <ListVideo size={18} />, label: "任务" },
    { key: "/settings", icon: <Settings size={18} />, label: "设置" },
];

const PAGE_TITLES: Record<string, string> = {
    "/": "概览",
    "/channels": "渠道管理",
    "/models": "模型管理",
    "/users": "用户管理",
    "/plans": "套餐管理",
    "/redeem-codes": "兑换码",
    "/tasks": "任务管理",
    "/settings": "系统设置",
};

const ROLE_LABELS: Record<string, string> = {
    SUPER_ADMIN: "超级管理员",
    ADMIN: "管理员",
};

function resolveMenuKey(pathname: string): string {
    if (pathname === "/" || pathname === "") {
        return "/";
    }
    const first = pathname.split("/").filter(Boolean)[0] ?? "";
    return `/${first}`;
}

export function AdminLayout() {
    const { showSuccess } = useFeedback();
    const navigate = useNavigate();
    const location = useLocation();
    const admin = useAuthStore((state) => state.admin);
    const setProfile = useAuthStore((state) => state.setProfile);
    const clearSession = useAuthStore((state) => state.clearSession);
    const [collapsed, setCollapsed] = useState(false);
    const selectedKey = resolveMenuKey(location.pathname);

    useEffect(() => {
        let alive = true;
        adminApi
            .me()
            .then((me) => {
                if (alive) {
                    setProfile({
                        id: me.id,
                        username: me.username,
                        displayName: me.displayName,
                        role: me.role,
                    });
                }
            })
            .catch(() => {
                // 401 已由 http 拦截器统一处理；网络错误不阻断页面。
            });
        return () => {
            alive = false;
        };
    }, [setProfile]);

    useEffect(() => {
        const title = PAGE_TITLES[selectedKey] ?? "管理后台";
        document.title = `${title} · 无限画布管理后台`;
    }, [selectedKey]);

    const handleLogout = () => {
        clearSession();
        showSuccess("已退出登录");
        navigate("/login", { replace: true });
    };

    const displayName = admin?.displayName || admin?.username || "管理员";
    const roleLabel = (admin?.role && ROLE_LABELS[admin.role]) || admin?.role || "管理员";

    return (
        <Layout style={{ minHeight: "100vh" }}>
            <Sider
                className="admin-sider"
                width={216}
                theme="dark"
                collapsible
                collapsed={collapsed}
                onCollapse={setCollapsed}
                trigger={null}
                breakpoint="lg"
                collapsedWidth={64}
            >
                <div className="admin-brand">
                    <span className="admin-brand__logo">
                        <Video size={17} />
                    </span>
                    <span>
                        无限画布<span className="admin-brand__sub">管理后台</span>
                    </span>
                </div>
                <Menu
                    theme="dark"
                    mode="inline"
                    items={MENU_ITEMS}
                    selectedKeys={[selectedKey]}
                    onClick={({ key }) => navigate(key)}
                    style={{ borderInlineEnd: "none", flex: 1 }}
                />
            </Sider>

            <Layout>
                <Header className="admin-header">
                    <Space size={8}>
                        <Tooltip title="折叠 / 展开菜单">
                            <Button
                                type="text"
                                icon={<MenuIcon size={18} />}
                                onClick={() => setCollapsed((value) => !value)}
                            />
                        </Tooltip>
                        <Typography.Text strong style={{ fontSize: 15 }}>
                            {PAGE_TITLES[selectedKey] ?? "管理后台"}
                        </Typography.Text>
                    </Space>

                    <div className="admin-header__right">
                        <Tag color="processing">{roleLabel}</Tag>
                        <Space size={8}>
                            <Avatar size={30} className="admin-avatar">
                                {displayName.slice(0, 1).toUpperCase()}
                            </Avatar>
                            <span style={{ fontWeight: 500 }}>{displayName}</span>
                        </Space>
                        <Button icon={<LogOut size={16} />} onClick={handleLogout}>
                            退出登录
                        </Button>
                    </div>
                </Header>

                <Content className="admin-content">
                    <Outlet />
                </Content>
            </Layout>
        </Layout>
    );
}
