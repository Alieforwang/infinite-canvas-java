import { useCallback, useEffect, useState } from "react";
import {
    Button,
    Descriptions,
    Drawer,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Select,
    Space,
    Switch,
    Table,
    Tag,
    Tooltip,
    Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import { Pencil, PlugZap, Plus, RefreshCw, Trash2 } from "lucide-react";

import { adminApi } from "../api/admin";
import { ApiError } from "../api/http";
import { PageHead } from "../components/PageHead";
import { useFeedback } from "../lib/feedback";
import { formatDateTime } from "../lib/format";
import type { Channel, ChannelPayload, ChannelTestResult } from "../types";

interface ChannelFormValues {
    name: string;
    protocol: string;
    baseUrl: string;
    apiKey?: string;
    authType: string;
    authHeader?: string;
    capabilities: string[];
    maxConcurrency: number;
    enabled: boolean;
}

const PROTOCOL_OPTIONS = [
    { value: "openai-official", label: "openai-official（OpenAI 官方兼容）" },
    { value: "newapi", label: "newapi（NewAPI 兼容）" },
    { value: "sub2api", label: "sub2api（Grok 视频）" },
];

const CAPABILITY_OPTIONS = [
    { value: "image", label: "图片生成" },
    { value: "video", label: "视频生成" },
];

const CAPABILITY_LABELS: Record<string, string> = {
    image: "图片",
    video: "视频",
};

const AUTH_TYPE_OPTIONS = [
    { value: "bearer", label: "bearer（Authorization: Bearer <API Key>）" },
    { value: "header", label: "header（自定义 Header，值 = API Key）" },
];

const PROTOCOL_COLORS: Record<string, string> = {
    "openai-official": "geekblue",
    newapi: "purple",
    "json-envelope": "cyan",
    "dual-dialect": "gold",
    sub2api: "green",
};

function protocolTag(protocol: string) {
    return <Tag color={PROTOCOL_COLORS[protocol] ?? "default"}>{protocol}</Tag>;
}

export function ChannelsPage() {
    const { showApiError, showSuccess } = useFeedback();
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loading, setLoading] = useState(true);
    const [form] = Form.useForm<ChannelFormValues>();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState<Channel | null>(null);
    const [saving, setSaving] = useState(false);
    const [testingId, setTestingId] = useState<number | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [testResult, setTestResult] = useState<{ channel: Channel; result: ChannelTestResult } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const list = await adminApi.listChannels();
            setChannels(list);
        } catch (err) {
            showApiError(err);
        } finally {
            setLoading(false);
        }
    }, [showApiError]);

    useEffect(() => {
        void load();
    }, [load]);

    const authType = Form.useWatch("authType", form);

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({
            protocol: "newapi",
            authType: "bearer",
            authHeader: "X-API-Key",
            capabilities: ["video"],
            maxConcurrency: 8,
            enabled: true,
        });
        setDrawerOpen(true);
    };

    const openEdit = (record: Channel) => {
        setEditing(record);
        form.resetFields();
        form.setFieldsValue({
            name: record.name,
            protocol: record.protocol,
            baseUrl: record.baseUrl,
            apiKey: "",
            authType: record.authType || "bearer",
            authHeader: "X-API-Key",
            capabilities: record.capabilities?.length ? record.capabilities : ["video"],
            maxConcurrency: record.maxConcurrency,
            enabled: record.enabled === 1,
        });
        setDrawerOpen(true);
    };

    const handleSubmit = async () => {
        let values: ChannelFormValues;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }
        const payload: ChannelPayload = {
            name: values.name.trim(),
            protocol: values.protocol,
            baseUrl: values.baseUrl.trim(),
            authType: values.authType,
            authHeader: values.authType === "header" ? (values.authHeader ?? "").trim() : "",
            capabilities: values.capabilities,
            maxConcurrency: values.maxConcurrency,
            enabled: values.enabled,
        };
        if (values.apiKey && values.apiKey.trim()) {
            payload.apiKey = values.apiKey.trim();
        }
        setSaving(true);
        try {
            if (editing) {
                await adminApi.updateChannel(editing.id, payload);
                showSuccess("渠道已更新");
            } else {
                await adminApi.createChannel(payload);
                showSuccess("渠道已创建");
            }
            setDrawerOpen(false);
            await load();
        } catch (err) {
            showApiError(err);
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async (record: Channel) => {
        setTestingId(record.id);
        try {
            const result = await adminApi.testChannel(record.id);
            setTestResult({ channel: record, result });
            await load();
        } catch (err) {
            showApiError(err);
        } finally {
            setTestingId(null);
        }
    };

    const handleDelete = async (record: Channel) => {
        setDeletingId(record.id);
        try {
            await adminApi.deleteChannel(record.id);
            showSuccess("渠道已删除");
        } catch (err) {
            showApiError(err);
            if (err instanceof ApiError && err.status === 409) {
                Modal.info({
                    title: "渠道未删除，已自动改为停用",
                    content: `渠道「${record.name}」下仍有模型，系统已将其停用。请先处理该渠道下的模型。`,
                    okText: "知道了",
                });
            }
        } finally {
            setDeletingId(null);
            await load();
        }
    };

    const columns: TableColumnsType<Channel> = [
        { title: "ID", dataIndex: "id", width: 64 },
        {
            title: "名称",
            dataIndex: "name",
            width: 180,
            render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
        },
        {
            title: "协议",
            dataIndex: "protocol",
            width: 160,
            render: (value: string) => protocolTag(value),
        },
        {
            title: "能力",
            dataIndex: "capabilities",
            width: 130,
            render: (values: string[] | undefined) => (
                <Space size={[2, 2]} wrap>
                    {(values?.length ? values : ["video"]).map((value) => (
                        <Tag key={value} color={value === "image" ? "cyan" : "blue"}>
                            {CAPABILITY_LABELS[value] ?? value}
                        </Tag>
                    ))}
                </Space>
            ),
        },
        {
            title: "Base URL / 规范化 URL",
            dataIndex: "baseUrl",
            width: 330,
            render: (_: string, record: Channel) => (
                <div>
                    <Tooltip title={record.baseUrl}>
                        <div className="mono" style={{ wordBreak: "break-all" }}>
                            {record.baseUrl}
                        </div>
                    </Tooltip>
                    <div className="mono muted" style={{ fontSize: 11, wordBreak: "break-all" }}>
                        {record.normalizedBaseUrl}
                    </div>
                </div>
            ),
        },
        {
            title: "Key 掩码",
            dataIndex: "apiKeyMask",
            width: 140,
            render: (value: string) => <span className="mono">{value || "-"}</span>,
        },
        {
            title: "启用",
            dataIndex: "enabled",
            width: 80,
            render: (value: number) =>
                value === 1 ? <Tag color="success">启用</Tag> : <Tag color="default">停用</Tag>,
        },
        {
            title: "模型数",
            dataIndex: "modelCount",
            width: 80,
            render: (value: number) => <span className="mono">{value}</span>,
        },
        {
            title: "最后测试",
            dataIndex: "lastTestAt",
            width: 200,
            render: (_: string | null, record: Channel) => {
                if (!record.lastTestAt) {
                    return <span className="muted">尚未测试</span>;
                }
                return (
                    <div>
                        <div>
                            {record.lastTestOk ? (
                                <Tag color="success">成功</Tag>
                            ) : (
                                <Tag color="error">失败</Tag>
                            )}
                        </div>
                        <div className="mono muted" style={{ fontSize: 11 }}>
                            {formatDateTime(record.lastTestAt)}
                        </div>
                        {record.lastTestMessage ? (
                            <Tooltip title={record.lastTestMessage}>
                                <div className="muted" style={{ fontSize: 11, maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {record.lastTestMessage}
                                </div>
                            </Tooltip>
                        ) : null}
                    </div>
                );
            },
        },
        {
            title: "操作",
            key: "actions",
            width: 220,
            fixed: "right",
            render: (_: unknown, record: Channel) => (
                <Space size={0}>
                    <Button
                        type="link"
                        size="small"
                        icon={<PlugZap size={14} />}
                        loading={testingId === record.id}
                        onClick={() => void handleTest(record)}
                    >
                        测试连接
                    </Button>
                    <Button type="link" size="small" icon={<Pencil size={14} />} onClick={() => openEdit(record)}>
                        编辑
                    </Button>
                    <Popconfirm
                        title="删除渠道"
                        description="渠道下无模型时将直接删除；若仍有模型，系统会改为停用。"
                        okText="确认删除"
                        okButtonProps={{ danger: true, loading: deletingId === record.id }}
                        cancelText="取消"
                        onConfirm={() => void handleDelete(record)}
                    >
                        <Button type="link" size="small" danger icon={<Trash2 size={14} />}>
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <>
            <PageHead
                title="渠道管理"
                description="维护图片与视频上游渠道：媒体能力、协议档位、认证与并发配置。"
                extra={
                    <Space>
                        <Button icon={<RefreshCw size={15} />} onClick={() => void load()} loading={loading}>
                            刷新
                        </Button>
                        <Button type="primary" icon={<Plus size={15} />} onClick={openCreate}>
                            新增渠道
                        </Button>
                    </Space>
                }
            />

            <Table<Channel>
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={channels}
                pagination={false}
                scroll={{ x: 1500 }}
                locale={{ emptyText: "暂无渠道，请先新增" }}
            />

            <Drawer
                title={editing ? `编辑渠道 · ${editing.name}` : "新增渠道"}
                size={560}
                open={drawerOpen}
                forceRender
                onClose={() => setDrawerOpen(false)}
                extra={
                    <Space>
                        <Button onClick={() => setDrawerOpen(false)}>取消</Button>
                        <Button type="primary" loading={saving} onClick={() => void handleSubmit()}>
                            保存
                        </Button>
                    </Space>
                }
            >
                <Form<ChannelFormValues> form={form} layout="vertical" requiredMark={false}>
                    <Form.Item
                        label="渠道名称"
                        name="name"
                        rules={[{ required: true, message: "请输入渠道名称" }, { max: 64, message: "最多 64 个字符" }]}
                    >
                        <Input placeholder="例如：OpenAI 官方 / NewAPI 集群 A" />
                    </Form.Item>
                    <Form.Item
                        label="协议档位"
                        name="protocol"
                        rules={[{ required: true, message: "请选择协议档位" }]}
                    >
                        <Select options={PROTOCOL_OPTIONS} placeholder="请选择协议档位" />
                    </Form.Item>
                    <Form.Item
                        label="媒体能力"
                        name="capabilities"
                        rules={[{ required: true, message: "请至少选择一种媒体能力" }]}
                    >
                        <Select mode="multiple" options={CAPABILITY_OPTIONS} placeholder="选择该渠道支持的生成类型" />
                    </Form.Item>
                    <Form.Item
                        label="Base URL"
                        name="baseUrl"
                        rules={[{ required: true, message: "请输入 Base URL" }]}
                        extra="支持填写到 /v1 前一级，保存后展示规范化结果。"
                    >
                        <Input placeholder="https://api.example.com" />
                    </Form.Item>
                    <Form.Item
                        label="API Key"
                        name="apiKey"
                        rules={
                            editing
                                ? []
                                : [{ required: true, message: "请输入 API Key" }]
                        }
                        extra={editing ? "留空表示不修改现有 API Key。" : "API Key 会加密存储，仅展示掩码。"}
                    >
                        <Input.Password
                            placeholder={editing ? `当前：${editing.apiKeyMask}（留空不改）` : "sk-..."}
                            autoComplete="new-password"
                        />
                    </Form.Item>
                    <Form.Item
                        label="认证方式（authType）"
                        name="authType"
                        rules={[{ required: true, message: "请选择认证方式" }]}
                    >
                        <Select options={AUTH_TYPE_OPTIONS} />
                    </Form.Item>
                    {authType === "header" ? (
                        <Form.Item
                            label="自定义认证 Header"
                            name="authHeader"
                            rules={[{ required: true, message: "请输入 Header 名称" }]}
                            extra="该 Header 的值将直接使用 API Key。"
                        >
                            <Input placeholder="X-API-Key" />
                        </Form.Item>
                    ) : null}
                    <Form.Item label="最大并发数" name="maxConcurrency" rules={[{ required: true, message: "请输入最大并发数" }]}>
                        <InputNumber min={1} max={1000} style={{ width: "100%" }} placeholder="默认 8" />
                    </Form.Item>
                    <Form.Item label="启用" name="enabled" valuePropName="checked">
                        <Switch checkedChildren="启用" unCheckedChildren="停用" />
                    </Form.Item>
                </Form>
            </Drawer>

            <Modal
                title={testResult ? `连接测试结果 · ${testResult.channel.name}` : "连接测试结果"}
                open={Boolean(testResult)}
                footer={
                    <Button type="primary" onClick={() => setTestResult(null)}>
                        关闭
                    </Button>
                }
                onCancel={() => setTestResult(null)}
            >
                {testResult ? (
                    <Descriptions column={1} size="small" bordered>
                        <Descriptions.Item label="结果">
                            {testResult.result.ok ? <Tag color="success">ok</Tag> : <Tag color="error">failed</Tag>}
                        </Descriptions.Item>
                        <Descriptions.Item label="延迟">{testResult.result.latencyMs} ms</Descriptions.Item>
                        <Descriptions.Item label="模型数">{testResult.result.models.length}</Descriptions.Item>
                        <Descriptions.Item label="模型">
                            {testResult.result.models.length > 0 ? (
                                <Space size={[4, 4]} wrap>
                                    {testResult.result.models.map((model) => (
                                        <Tag key={model}>{model}</Tag>
                                    ))}
                                </Space>
                            ) : (
                                <span className="muted">无</span>
                            )}
                        </Descriptions.Item>
                        <Descriptions.Item label="消息">{testResult.result.message}</Descriptions.Item>
                    </Descriptions>
                ) : null}
            </Modal>
        </>
    );
}
