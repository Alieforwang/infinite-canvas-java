import { useEffect } from "react";
import { createBrowserRouter, Outlet } from "react-router-dom";
import { Spin } from "antd";

import { getToken } from "@/api/http";
import UserLayout from "@/layouts/user-layout";
import AccountPage from "@/pages/account";
import AssetsPage from "@/pages/assets";
import LoginPage from "@/pages/auth/login";
import RegisterPage from "@/pages/auth/register";
import CanvasListPage from "@/pages/canvas";
import CanvasEditorPage from "@/pages/canvas/editor";
import HomePage from "@/pages/home";
import NotFound from "@/pages/not-found";
import VideoPage from "@/pages/video";
import { useAuthStore } from "@/stores/use-auth-store";

function RequireAuth() {
    const initialized = useAuthStore((state) => state.initialized);
    const user = useAuthStore((state) => state.user);
    const loadMe = useAuthStore((state) => state.loadMe);

    useEffect(() => {
        if (!getToken()) {
            window.location.replace(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
            return;
        }
        if (!initialized) {
            void loadMe();
        }
    }, [initialized, loadMe]);

    if (!getToken()) {
        return <div className="flex h-dvh items-center justify-center"><Spin /></div>;
    }
    if (!initialized || !user) {
        return <div className="flex h-dvh items-center justify-center"><Spin description="加载账户信息…" /></div>;
    }
    return (
        <UserLayout>
            <Outlet />
        </UserLayout>
    );
}

export const router = createBrowserRouter([
    { path: "/", element: <HomePage /> },
    { path: "/login", element: <LoginPage /> },
    { path: "/register", element: <RegisterPage /> },
    {
        element: <RequireAuth />,
        children: [
            { path: "/video", element: <VideoPage /> },
            { path: "/canvas", element: <CanvasListPage /> },
            { path: "/canvas/:projectNo", element: <CanvasEditorPage /> },
            { path: "/assets", element: <AssetsPage /> },
            { path: "/account", element: <AccountPage /> },
        ],
    },
    { path: "*", element: <NotFound /> },
]);
