import { useState } from "react";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { LockKeyhole, ShieldCheck, UserRound, Video } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";

import { adminApi } from "../api/admin";
import { formatApiError, useFeedback } from "../lib/feedback";
import { useAuthStore } from "../stores/auth";

interface LoginFormValues {
    username: string;
    password: string;
}

export function LoginPage() {
    const { showApiError, showSuccess } = useFeedback();
    const navigate = useNavigate();
    const token = useAuthStore((state) => state.token);
    const setSession = useAuthStore((state) => state.setSession);
    const [form] = Form.useForm<LoginFormValues>();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (token) {
        return <Navigate to="/" replace />;
    }

    const handleFinish = async (values: LoginFormValues) => {
        setSubmitting(true);
        setError(null);
        try {
            const profile = await adminApi.login(values.username.trim(), values.password);
            setSession(profile);
            showSuccess("登录成功");
            navigate("/", { replace: true });
        } catch (err) {
            setError(formatApiError(err));
            showApiError(err);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="login-shell">
            <section className="login-hero">
                <div className="login-hero__brand">
                    <Video size={26} />
                    <span>无限画布</span>
                </div>
                <div>
                    <h1 className="login-hero__title">
                        视频生成平台
                        <br />
                        管理后台
                    </h1>
                    <p className="login-hero__desc">
                        统一管理渠道与模型、人民币余额、套餐与兑换码，实时查看生成任务与平台运行指标。
                    </p>
                </div>
                <div className="login-hero__footer">
                    <ShieldCheck size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                    仅限授权管理员访问 · Infinite Canvas Studio
                </div>
            </section>

            <section className="login-panel">
                <div className="login-card">
                    <Typography.Title level={3} className="login-card__title">
                        管理员登录
                    </Typography.Title>
                    <p className="login-card__subtitle">请使用管理员账号登录，登录态有效期内自动保持。</p>

                    {error ? (
                        <Alert
                            type="error"
                            showIcon
                            closable
                            message="登录失败"
                            description={error}
                            style={{ marginBottom: 20 }}
                            onClose={() => setError(null)}
                        />
                    ) : null}

                    <Card variant="borderless" styles={{ body: { padding: 0 } }}>
                        <Form<LoginFormValues>
                            form={form}
                            layout="vertical"
                            size="large"
                            requiredMark={false}
                            onFinish={handleFinish}
                            initialValues={{ username: "", password: "" }}
                        >
                            <Form.Item
                                label="用户名"
                                name="username"
                                rules={[{ required: true, message: "请输入用户名" }]}
                            >
                                <Input
                                    prefix={<UserRound size={16} className="muted" />}
                                    placeholder="请输入管理员用户名"
                                    autoComplete="username"
                                    autoFocus
                                />
                            </Form.Item>
                            <Form.Item
                                label="密码"
                                name="password"
                                rules={[{ required: true, message: "请输入密码" }]}
                            >
                                <Input.Password
                                    prefix={<LockKeyhole size={16} className="muted" />}
                                    placeholder="请输入密码"
                                    autoComplete="current-password"
                                />
                            </Form.Item>
                            <Form.Item style={{ marginBottom: 0, marginTop: 4 }}>
                                <Button type="primary" htmlType="submit" block loading={submitting}>
                                    登录
                                </Button>
                            </Form.Item>
                        </Form>
                    </Card>
                </div>
            </section>
        </div>
    );
}
