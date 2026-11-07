import { useState } from "react";
import { App, Button, Card, Form, Input, Typography } from "antd";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useAuthStore } from "@/stores/use-auth-store";

export default function LoginPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const login = useAuthStore((state) => state.login);
    const [loading, setLoading] = useState(false);

    const submit = async (values: { email: string; password: string }) => {
        setLoading(true);
        try {
            await login(values.email.trim(), values.password);
            message.success("登录成功");
            navigate(params.get("redirect") || "/video", { replace: true });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-dvh items-center justify-center bg-stone-50 px-4 dark:bg-stone-950">
            <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm md:grid-cols-2 dark:border-stone-800 dark:bg-stone-900">
                <div className="hidden flex-col justify-between bg-stone-950 p-10 text-white md:flex">
                    <div>
                        <p className="text-sm text-stone-400">无限画布 · 视频生成平台</p>
                        <h1 className="mt-4 text-3xl font-semibold leading-snug">
                            用一句话，
                            <br />
                            生成你的下一支视频
                        </h1>
                    </div>
                    <ul className="space-y-2 text-sm text-stone-400">
                        <li>· 平台统一配置模型，无需自备 API Key</li>
                        <li>· 人民币计费，失败自动退款</li>
                        <li>· 生成记录与素材云端保存</li>
                    </ul>
                </div>
                <div className="p-8 md:p-10">
                    <Typography.Title level={3} className="!mb-1">
                        登录
                    </Typography.Title>
                    <Typography.Paragraph type="secondary" className="!mb-6">
                        还没有账号？<Link to="/register">立即注册</Link> · <Link to="/">返回首页</Link>
                    </Typography.Paragraph>
                    <Form layout="vertical" onFinish={submit} requiredMark={false}>
                        <Form.Item name="email" label="邮箱" rules={[{ required: true, type: "email", message: "请输入有效邮箱" }]}>
                            <Input size="large" placeholder="you@example.com" autoComplete="email" />
                        </Form.Item>
                        <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
                            <Input.Password size="large" placeholder="输入密码" autoComplete="current-password" />
                        </Form.Item>
                        <Button type="primary" htmlType="submit" size="large" block loading={loading}>
                            登录
                        </Button>
                    </Form>
                </div>
            </div>
        </div>
    );
}
