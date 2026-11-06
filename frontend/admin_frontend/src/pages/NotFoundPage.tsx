import { Button, Result } from "antd";
import { useNavigate } from "react-router-dom";

import { useAuthStore } from "../stores/auth";

export function NotFoundPage() {
    const navigate = useNavigate();
    const token = useAuthStore((state) => state.token);

    return (
        <div className="notfound-shell">
            <Result
                status="404"
                title="404"
                subTitle="抱歉，你访问的页面不存在或已被移除。"
                extra={
                    <Button type="primary" onClick={() => navigate(token ? "/" : "/login", { replace: true })}>
                        {token ? "返回概览" : "前往登录"}
                    </Button>
                }
            />
        </div>
    );
}
