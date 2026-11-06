import { Navigate, Outlet, RouterProvider, createBrowserRouter } from "react-router-dom";

import { AdminLayout } from "./layouts/AdminLayout";
import { ChannelsPage } from "./pages/ChannelsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { ModelsPage } from "./pages/ModelsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlansPage } from "./pages/PlansPage";
import { RedeemCodesPage } from "./pages/RedeemCodesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TasksPage } from "./pages/TasksPage";
import { UsersPage } from "./pages/UsersPage";
import { useAuthStore } from "./stores/auth";

function RequireAuth() {
    const token = useAuthStore((state) => state.token);
    if (!token) {
        return <Navigate to="/login" replace />;
    }
    return <Outlet />;
}

const router = createBrowserRouter(
    [
        {
            path: "/login",
            element: <LoginPage />,
        },
        {
            element: <RequireAuth />,
            children: [
                {
                    element: <AdminLayout />,
                    children: [
                        { index: true, element: <DashboardPage /> },
                        { path: "channels", element: <ChannelsPage /> },
                        { path: "models", element: <ModelsPage /> },
                        { path: "users", element: <UsersPage /> },
                        { path: "plans", element: <PlansPage /> },
                        { path: "redeem-codes", element: <RedeemCodesPage /> },
                        { path: "tasks", element: <TasksPage /> },
                        { path: "settings", element: <SettingsPage /> },
                        { path: "*", element: <NotFoundPage /> },
                    ],
                },
            ],
        },
        { path: "*", element: <NotFoundPage /> },
    ],
    { basename: "/admin" },
);

export function AppRouter() {
    return <RouterProvider router={router} />;
}
