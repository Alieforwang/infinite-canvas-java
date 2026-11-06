import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Form, Input, InputNumber, Row, Space, Switch, Tag, Typography } from "antd";
import { RefreshCw, Save } from "lucide-react";

import { adminApi } from "../api/admin";
import { PageHead } from "../components/PageHead";
import { useFeedback } from "../lib/feedback";
import type { SettingItem } from "../types";

interface SettingMeta {
    key: string;
    label: string;
    fallback: string;
    type: "INT" | "BOOL" | "STRING";
    description: string;
}

/** 与后端 AdminSettingController.WHITELIST 保持一致，仅允许编辑这些键。 */
const SETTING_METAS: SettingMeta[] = [
    {
        key: "user.register_gift_credits",
        label: "注册赠送积分",
        fallback: "100",
        type: "INT",
        description: "新用户注册成功后自动发放的积分数量。",
    },
    {
        key: "user.registration_open",
        label: "开放注册",
        fallback: "true",
        type: "BOOL",
        description: "关闭后用户端不再允许新用户注册。",
    },
    {
        key: "credit.exchange_per_yuan",
        label: "每元兑换积分",
        fallback: "100",
        type: "INT",
        description: "1 元人民币可兑换的积分数量。",
    },
    {
        key: "task.max_concurrency_per_user",
        label: "每用户并发任务上限",
        fallback: "2",
        type: "INT",
        description: "单个用户同时进行中的生成任务数量上限。",
    },
    {
        key: "task.poll_timeout_minutes",
        label: "任务总超时（分钟）",
        fallback: "30",
        type: "INT",
        description: "任务从创建到完成的最长等待时间，超时后失败并退款。",
    },
    {
        key: "file.max_upload_image_mb",
        label: "图片上传上限（MB）",
        fallback: "20",
        type: "INT",
        description: "单张图片文件的最大上传体积。",
    },
    {
        key: "file.max_upload_video_mb",
        label: "视频上传上限（MB）",
        fallback: "200",
        type: "INT",
        description: "单个视频文件的最大上传体积。",
    },
    {
        key: "file.retention_days",
        label: "文件保留天数",
        fallback: "0",
        type: "INT",
        description: "0 表示永久保留，大于 0 表示过期清理天数。",
    },
    {
        key: "security.login_max_failures",
        label: "登录失败阈值",
        fallback: "5",
        type: "INT",
        description: "同一账号连续登录失败达到阈值后触发限制。",
    },
    {
        key: "site.notice",
        label: "站点维护公告",
        fallback: "",
        type: "STRING",
        description: "展示在用户端顶部的公告内容，留空表示不展示。",
    },
];

const SETTING_KEY_SET = new Set(SETTING_METAS.map((item) => item.key));

type SettingFormValues = Record<string, string | number | boolean>;

function toFormValue(item: SettingMeta, raw: string): string | number | boolean {
    if (item.type === "BOOL") {
        return raw === "true" || raw === "1";
    }
    if (item.type === "INT") {
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : Number(item.fallback);
    }
    return raw;
}

export function SettingsPage() {
    const { showApiError, showSuccess } = useFeedback();
    const [settings, setSettings] = useState<SettingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm<SettingFormValues>();

    const settingMap = useMemo(() => {
        const map = new Map<string, SettingItem>();
        for (const item of settings) {
            if (SETTING_KEY_SET.has(item.key)) {
                map.set(item.key, item);
            }
        }
        return map;
    }, [settings]);

    const applyToForm = useCallback(
        (source: Map<string, SettingItem>) => {
            for (const meta of SETTING_METAS) {
                const item = source.get(meta.key);
                const raw = item?.value ?? meta.fallback;
                form.setFieldValue([meta.key], toFormValue(meta, raw));
            }
        },
        [form],
    );

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const list = await adminApi.listSettings();
            setSettings(list);
            const map = new Map<string, SettingItem>();
            for (const item of list) {
                if (SETTING_KEY_SET.has(item.key)) {
                    map.set(item.key, item);
                }
            }
            form.resetFields();
            applyToForm(map);
        } catch (err) {
            showApiError(err);
        } finally {
            setLoading(false);
        }
    }, [applyToForm, form, showApiError]);

    useEffect(() => {
        void load();
    }, [load]);

    const handleSave = async () => {
        let values: SettingFormValues;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }
        const payload: Record<string, string> = {};
        for (const meta of SETTING_METAS) {
            const value = values[meta.key];
            if (meta.type === "BOOL") {
                payload[meta.key] = value ? "true" : "false";
            } else if (meta.type === "INT") {
                payload[meta.key] = String(value ?? 0);
            } else {
                payload[meta.key] = String(value ?? "");
            }
        }
        setSaving(true);
        try {
            await adminApi.saveSettings(payload);
            showSuccess("设置已保存");
            await load();
        } catch (err) {
            showApiError(err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <PageHead
                title="系统设置"
                description="维护平台运行参数。仅后端白名单内的键允许修改，保存时整体提交。"
                extra={
                    <Space>
                        <Button icon={<RefreshCw size={15} />} onClick={() => void load()} loading={loading}>
                            重新加载
                        </Button>
                        <Button type="primary" icon={<Save size={15} />} loading={saving} onClick={() => void handleSave()}>
                            保存设置
                        </Button>
                    </Space>
                }
            />

            <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="仅可编辑以下 10 个白名单配置项"
                description={
                    <Space size={[4, 4]} wrap>
                        {SETTING_METAS.map((meta) => (
                            <Tag key={meta.key} className="mono">
                                {meta.key}
                            </Tag>
                        ))}
                    </Space>
                }
            />

            <Card loading={loading}>
                <Form<SettingFormValues> form={form} layout="vertical" requiredMark={false}>
                    {SETTING_METAS.map((meta) => {
                        const remote = settingMap.get(meta.key);
                        return (
                            <Row key={meta.key} gutter={24} align="top" style={{ marginBottom: 4 }}>
                                <Col xs={24} md={9}>
                                    <div style={{ paddingTop: 6 }}>
                                        <Typography.Text strong>{meta.label}</Typography.Text>
                                        <div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>
                                            {meta.key}
                                        </div>
                                        <div className="form-hint">{remote?.description || meta.description}</div>
                                    </div>
                                </Col>
                                <Col xs={24} md={15}>
                                    <Form.Item
                                        name={[meta.key]}
                                        rules={
                                            meta.type === "INT"
                                                ? [{ required: true, message: `请输入${meta.label}` }]
                                                : meta.type === "STRING"
                                                  ? [{ max: 500, message: "最多 500 个字符" }]
                                                  : []
                                        }
                                        style={{ marginBottom: 20 }}
                                    >
                                        {meta.type === "BOOL" ? (
                                            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                                        ) : meta.type === "INT" ? (
                                            <InputNumber min={0} step={1} style={{ width: 240 }} />
                                        ) : meta.key === "site.notice" ? (
                                            <Input.TextArea rows={3} maxLength={500} showCount placeholder="留空表示不展示公告" />
                                        ) : (
                                            <Input style={{ maxWidth: 420 }} />
                                        )}
                                    </Form.Item>
                                </Col>
                            </Row>
                        );
                    })}
                </Form>

                <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, display: "flex", justifyContent: "flex-end", gap: 12 }}>
                    <Button onClick={() => void load()} disabled={saving}>
                        撤销修改
                    </Button>
                    <Button type="primary" icon={<Save size={15} />} loading={saving} onClick={() => void handleSave()}>
                        保存设置
                    </Button>
                </div>
            </Card>
        </>
    );
}
