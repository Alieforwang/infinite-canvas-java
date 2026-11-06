import { useState } from "react";
import { App, Button, Form, Input, Typography } from "antd";
import { Link, useNavigate } from "react-router-dom";

import { useAuthStore } from "@/stores/use-auth-store";

type RegisterValues = { email: string; password: string; confirmPassword: string; displayName?: string };

export default function RegisterPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const register = useAuthStore((state) => state.register);
    const [loading, setLoading] = useState(false);

    const submit = async (values: RegisterValues) => {
        if (values.password !== values.confirmPassword) {
            message.error("两次输入的密码不一致");
            return;
        }
        setLoading(true);
        try {
            await register(values.email.trim(), values.password, values.displayName?.trim());
            message.success("注册成功，已赠送积分");
            navigate("/video", { replace: true });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "注册失败");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-dvh items-center justify-center bg-stone-50 px-4 dark:bg-stone-950">
            <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm dark:border-stone-800 dark:bg-stone-900">
                <Typography.Title level={3} className="!mb-1">
                    注册
                </Typography.Title>
                <Typography.Paragraph type="secondary" className="!mb-6">
                    已有账号？<Link to="/login">去登录</Link> · <Link to="/">返回首页</Link>
                </Typography.Paragraph>
                <Form layout="vertical" onFinish={submit} requiredMark={false}>
                    <Form.Item name="email" label="邮箱" rules={[{ required: true, type: "email", message: "请输入有效邮箱" }]}>
                        <Input size="large" placeholder="you@example.com" autoComplete="email" />
                    </Form.Item>
                    <Form.Item name="displayName" label="昵称（可选）">
                        <Input size="large" placeholder="怎么称呼你" />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        label="密码"
                        rules={[{ required: true, min: 8, max: 32, message: "密码 8–32 位，需包含字母和数字" }]}
                    >
                        <Input.Password size="large" placeholder="至少 8 位，含字母和数字" autoComplete="new-password" />
                    </Form.Item>
                    <Form.Item name="confirmPassword" label="确认密码" rules={[{ required: true, message: "请再次输入密码" }]}>
                        <Input.Password size="large" placeholder="再次输入密码" autoComplete="new-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" size="large" block loading={loading}>
                        注册并开始创作
                    </Button>
                </Form>
            </div>
        </div>
    );
}
