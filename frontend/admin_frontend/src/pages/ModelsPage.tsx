import { useCallback, useEffect, useState } from "react";
import {
    AutoComplete,
    Button,
    Drawer,
    Form,
    Input,
    InputNumber,
    Popconfirm,
    Row,
    Col,
    Collapse,
    Select,
    Space,
    Switch,
    Table,
    Tag,
    Tooltip,
    Typography,
} from "antd";
import type { FormRule, TableColumnsType } from "antd";
import { Ban, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

import { adminApi } from "../api/admin";
import { PageHead } from "../components/PageHead";
import { useFeedback } from "../lib/feedback";
import { parseJsonList } from "../lib/format";
import type { Channel, ModelPayload, VideoModel } from "../types";

interface PricingRuleForm {
    resolution: string;
    seconds?: number;
    credits: number;
}

interface ModelFormValues {
    channelId: number;
    upstreamModel: string;
    displayName: string;
    modelKey: string;
    routeWeight: number;
    capability: string;
    pricingRules: PricingRuleForm[];
    creditsPerSecond: number;
    resolutionFactors: string;
    resolutionDefault: string;
    audioFactor: number;
    minChargeCredits: number;
    supportedSeconds: string;
    supportedSizes: string;
    supportedRatios: string;
    supportsAudio: boolean;
    supportsWatermark: boolean;
    supportsFirstLastFrame: boolean;
    supportsReferenceImages: boolean;
    maxReferenceImages: number;
    enabled: boolean;
    sort: number;
}

const DEFAULT_RESOLUTION_FACTORS = '{"480p":1.0,"720p":1.5,"1080p":2.0}';
const DEFAULT_SUPPORTED_SECONDS = '["4","8","12"]';
const DEFAULT_SUPPORTED_SIZES = '["1280x720","720x1280"]';
const DEFAULT_SUPPORTED_RATIOS = '["16:9","9:16","1:1"]';

const CAPABILITY_OPTIONS = [
    { value: "image", label: "图片生成" },
    { value: "video", label: "视频生成" },
];

const IMAGE_SPEC_OPTIONS = [
    { value: "1024x1024", label: "1024 × 1024 · 正方形 1:1" },
    { value: "1536x1024", label: "1536 × 1024 · 横图 3:2" },
    { value: "1024x1536", label: "1024 × 1536 · 竖图 2:3" },
    { value: "1792x1024", label: "1792 × 1024 · 宽屏横图" },
    { value: "1024x1792", label: "1024 × 1792 · 长幅竖图" },
];
const VIDEO_SPEC_OPTIONS = [
    { value: "480p", label: "480p · 标清" },
    { value: "720p", label: "720p · 高清" },
    { value: "1080p", label: "1080p · 全高清" },
    { value: "2160p", label: "2160p · 4K" },
];

function defaultPricingRules(capability: string): PricingRuleForm[] {
    return capability === "image"
        ? [{ resolution: "1024x1024", credits: 10 }]
        : [{ resolution: "720p", seconds: 8, credits: 80 }];
}

function parsePricingRules(text: string | null | undefined, capability: string): PricingRuleForm[] {
    try {
        const parsed: unknown = JSON.parse(text || "[]");
        if (!Array.isArray(parsed)) {
            return defaultPricingRules(capability);
        }
        const rules = parsed.flatMap((item): PricingRuleForm[] => {
            if (!item || typeof item !== "object") {
                return [];
            }
            const candidate = item as Record<string, unknown>;
            const resolution = typeof candidate.resolution === "string" ? candidate.resolution.trim() : "";
            const credits = Number(candidate.credits);
            const seconds = Number(candidate.seconds);
            if (!resolution || !Number.isFinite(credits) || credits <= 0) {
                return [];
            }
            if (capability === "video" && (!Number.isFinite(seconds) || seconds <= 0)) {
                return [];
            }
            return [{ resolution, credits, ...(capability === "video" ? { seconds } : {}) }];
        });
        return rules.length > 0 ? rules : defaultPricingRules(capability);
    } catch {
        return defaultPricingRules(capability);
    }
}

function pricingSummary(text: string | null | undefined, capability: string): string {
    return parsePricingRules(text, capability)
        .map((rule) => capability === "video"
            ? `${rule.resolution} / ${rule.seconds}s · ${rule.credits} 积分`
            : `${rule.resolution} · ${rule.credits} 积分/张`)
        .join("；");
}

const validateJsonObject: FormRule = {
    validator: async (_rule, value: string) => {
        if (!value || !value.trim()) {
            return Promise.reject(new Error("请输入 JSON 对象"));
        }
        try {
            const parsed: unknown = JSON.parse(value);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                return Promise.reject(new Error("必须是 JSON 对象，例如 {\"720p\":1.5}"));
            }
        } catch {
            return Promise.reject(new Error("JSON 格式不合法"));
        }
        return Promise.resolve();
    },
};

const validateJsonArray: FormRule = {
    validator: async (_rule, value: string) => {
        if (!value || !value.trim()) {
            return Promise.reject(new Error("请输入 JSON 数组"));
        }
        try {
            const parsed: unknown = JSON.parse(value);
            if (!Array.isArray(parsed)) {
                return Promise.reject(new Error("必须是 JSON 数组，例如 [\"4\",\"8\"]"));
            }
        } catch {
            return Promise.reject(new Error("JSON 格式不合法"));
        }
        return Promise.resolve();
    },
};

function prettyJsonText(text: string): string {
    try {
        return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        return text;
    }
}

function modelPayloadFromValues(values: ModelFormValues): ModelPayload {
    return {
        channelId: values.channelId,
        upstreamModel: values.upstreamModel.trim(),
        displayName: values.displayName.trim(),
        modelKey: values.modelKey.trim(),
        routeWeight: values.routeWeight,
        capability: values.capability,
        pricingRules: JSON.stringify(values.pricingRules.map((rule) => ({
            resolution: rule.resolution.trim(),
            ...(values.capability === "video" ? { seconds: rule.seconds } : {}),
            credits: rule.credits,
        }))),
        creditsPerSecond: values.creditsPerSecond,
        resolutionFactors: values.resolutionFactors.trim(),
        resolutionDefault: values.capability === "image" ? values.pricingRules[0].resolution.trim() : values.resolutionDefault,
        audioFactor: values.audioFactor,
        minChargeCredits: values.minChargeCredits,
        supportedSeconds: values.capability === "image" ? "[]" : values.supportedSeconds.trim(),
        supportedSizes: values.capability === "image"
            ? JSON.stringify([...new Set(values.pricingRules.map((rule) => rule.resolution.trim()))]) : values.supportedSizes.trim(),
        supportedRatios: values.supportedRatios.trim(),
        supportsAudio: values.supportsAudio ? 1 : 0,
        supportsWatermark: values.supportsWatermark ? 1 : 0,
        supportsFirstLastFrame: values.supportsFirstLastFrame ? 1 : 0,
        supportsReferenceImages: values.supportsReferenceImages ? 1 : 0,
        maxReferenceImages: values.maxReferenceImages,
        enabled: values.enabled,
        sort: values.sort,
    };
}

export function ModelsPage() {
    const { message, showApiError, showSuccess } = useFeedback();
    const [models, setModels] = useState<VideoModel[]>([]);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loading, setLoading] = useState(true);
    const [form] = Form.useForm<ModelFormValues>();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState<VideoModel | null>(null);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [syncingModels, setSyncingModels] = useState(false);
    const [channelModels, setChannelModels] = useState<Record<string, string[]>>({});
    const [modelsUrls, setModelsUrls] = useState<Record<number, string>>({});
    const channelId = Form.useWatch("channelId", form);
    const modelsUrl = modelsUrls[channelId] ?? "";
    const modelsCacheKey = `${channelId}:${modelsUrl.trim()}`;
    const syncChannelModels = async () => {
        const selectedChannelId = form.getFieldValue("channelId");
        if (!selectedChannelId) return;
        const selectedUrl = (modelsUrls[selectedChannelId] ?? "").trim();
        const cacheKey = `${selectedChannelId}:${selectedUrl}`;
        setSyncingModels(true);
        try {
            const result = await adminApi.syncChannelModels(selectedChannelId, selectedUrl || undefined);
            if (!result.ok) {
                message.error(result.message || "同步渠道模型失败");
                return;
            }
            const names = [...new Set(result.models.map((name) => name.trim()).filter(Boolean))];
            setChannelModels((previous) => ({ ...previous, [cacheKey]: names }));
            if (form.getFieldValue("channelId") === selectedChannelId) {
                if (names.length) message.success(`已同步 ${names.length} 个模型，请在上游模型名中选择`);
                else message.info("当前渠道未返回模型，可手动输入上游模型名");
            }
        } catch (err) {
            showApiError(err);
        } finally {
            setSyncingModels(false);
        }
    };
    const capability = Form.useWatch("capability", form) ?? "video";
    const pricingRules = Form.useWatch("pricingRules", form) ?? [];
    const minChargeCredits = Form.useWatch("minChargeCredits", form) ?? 1;
    const eligibleChannels = channels.filter((channel) =>
        (channel.capabilities?.length ? channel.capabilities : ["video"]).includes(capability));

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [modelList, channelList] = await Promise.all([adminApi.listModels(), adminApi.listChannels()]);
            setModels(modelList);
            setChannels(channelList);
        } catch (err) {
            showApiError(err);
        } finally {
            setLoading(false);
        }
    }, [showApiError]);

    useEffect(() => {
        void load();
    }, [load]);

    const applyDefaults = () => {
        form.resetFields();
        form.setFieldsValue({
            capability: "video",
            pricingRules: defaultPricingRules("video"),
            routeWeight: 100,
            creditsPerSecond: 10,
            resolutionFactors: DEFAULT_RESOLUTION_FACTORS,
            resolutionDefault: "720p",
            audioFactor: 1,
            minChargeCredits: 1,
            supportedSeconds: DEFAULT_SUPPORTED_SECONDS,
            supportedSizes: DEFAULT_SUPPORTED_SIZES,
            supportedRatios: DEFAULT_SUPPORTED_RATIOS,
            supportsAudio: false,
            supportsWatermark: false,
            supportsFirstLastFrame: false,
            supportsReferenceImages: true,
            maxReferenceImages: 1,
            enabled: true,
            sort: 0,
        });
    };

    const handleCapabilityChange = (nextCapability: string) => {
        const selectedChannelId = form.getFieldValue("channelId");
        const selectedChannel = channels.find((channel) => channel.id === selectedChannelId);
        const selectedCapabilities = selectedChannel?.capabilities?.length ? selectedChannel.capabilities : ["video"];
        form.setFieldsValue({
            pricingRules: defaultPricingRules(nextCapability),
            ...(!selectedChannel || selectedCapabilities.includes(nextCapability) ? {} : { channelId: undefined }),
        });
    };

    const openCreate = () => {
        if (channels.length === 0) {
            message.warning("请先创建至少一个渠道");
            return;
        }
        setEditing(null);
        applyDefaults();
        setDrawerOpen(true);
    };

    const openEdit = (record: VideoModel) => {
        setEditing(record);
        form.resetFields();
        form.setFieldsValue({
            channelId: record.channelId,
            upstreamModel: record.upstreamModel,
            displayName: record.displayName,
            modelKey: record.modelKey || record.upstreamModel,
            routeWeight: Number(record.routeWeight) > 0 ? Number(record.routeWeight) : 100,
            capability: record.capability || "video",
            pricingRules: parsePricingRules(record.pricingRules, record.capability || "video"),
            creditsPerSecond: Number(record.creditsPerSecond),
            resolutionFactors: prettyJsonText(record.resolutionFactors),
            resolutionDefault: record.resolutionDefault,
            audioFactor: Number(record.audioFactor),
            minChargeCredits: record.minChargeCredits,
            supportedSeconds: prettyJsonText(record.supportedSeconds),
            supportedSizes: prettyJsonText(record.supportedSizes),
            supportedRatios: prettyJsonText(record.supportedRatios),
            supportsAudio: record.supportsAudio === 1,
            supportsWatermark: record.supportsWatermark === 1,
            supportsFirstLastFrame: record.supportsFirstLastFrame === 1,
            supportsReferenceImages: record.supportsReferenceImages === 1,
            maxReferenceImages: record.maxReferenceImages,
            enabled: record.enabled === 1,
            sort: record.sort,
        });
        setDrawerOpen(true);
    };

    const handleSubmit = async () => {
        let values: ModelFormValues;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }
        setSaving(true);
        try {
            if (editing) {
                await adminApi.updateModel(editing.id, modelPayloadFromValues(values));
                showSuccess("模型已更新");
            } else {
                await adminApi.createModel(modelPayloadFromValues(values));
                showSuccess("模型已创建");
            }
            setDrawerOpen(false);
            await load();
        } catch (err) {
            showApiError(err);
        } finally {
            setSaving(false);
        }
    };

    const handleDisable = async (record: VideoModel) => {
        setDeletingId(record.id);
        try {
            await adminApi.deleteModel(record.id);
            showSuccess("模型已停用");
            await load();
        } catch (err) {
            showApiError(err);
        } finally {
            setDeletingId(null);
        }
    };

    const channelOptions = eligibleChannels.map((channel) => ({
        value: channel.id,
        label: `${channel.name}${channel.enabled === 1 ? "" : "（已停用）"}`,
    }));

    const columns: TableColumnsType<VideoModel> = [
        { title: "ID", dataIndex: "id", width: 64 },
        { title: "渠道", dataIndex: "channelName", width: 150, render: (value: string) => <Tag color="geekblue">{value || "-"}</Tag> },
        {
            title: "逻辑模型标识",
            dataIndex: "modelKey",
            width: 180,
            render: (value: string) => (
                <Tooltip title={value}>
                    <span className="mono">{value || "-"}</span>
                </Tooltip>
            ),
        },
        {
            title: "线路权重",
            dataIndex: "routeWeight",
            width: 100,
            align: "right",
            render: (value: number) => <span className="mono">{value}</span>,
        },
        {
            title: "上游模型 / 展示名",
            dataIndex: "upstreamModel",
            width: 240,
            render: (_: string, record: VideoModel) => (
                <div>
                    <div className="mono">{record.upstreamModel}</div>
                    <Typography.Text strong>{record.displayName}</Typography.Text>
                </div>
            ),
        },
        {
            title: "媒体类型",
            dataIndex: "capability",
            width: 100,
            render: (value: string) => (
                <Tag color={value === "image" ? "cyan" : "blue"}>{value === "image" ? "图片" : "视频"}</Tag>
            ),
        },
        {
            title: "规格定价",
            dataIndex: "pricingRules",
            width: 310,
            render: (value: string, record: VideoModel) => (
                <Tooltip title={value}>
                    <span>{pricingSummary(value, record.capability || "video")}</span>
                </Tooltip>
            ),
        },
        {
            title: "支持时长",
            dataIndex: "supportedSeconds",
            width: 140,
            render: (value: string) => (
                <Space size={[2, 2]} wrap>
                    {parseJsonList(value).map((item) => (
                        <Tag key={item}>{item}s</Tag>
                    ))}
                </Space>
            ),
        },
        {
            title: "能力位",
            key: "capabilities",
            width: 230,
            render: (_: unknown, record: VideoModel) => {
                const flags = [
                    { key: "audio", label: "音频", enabled: record.supportsAudio === 1 },
                    { key: "watermark", label: "水印", enabled: record.supportsWatermark === 1 },
                    { key: "firstLast", label: "首尾帧", enabled: record.supportsFirstLastFrame === 1 },
                    { key: "reference", label: `参考图×${record.maxReferenceImages}`, enabled: record.supportsReferenceImages === 1 },
                ];
                return (
                    <Space size={[2, 2]} wrap>
                        {flags.map((flag) => (
                            <Tag key={flag.key} color={flag.enabled ? "blue" : "default"}>
                                {flag.label}
                            </Tag>
                        ))}
                    </Space>
                );
            },
        },
        { title: "排序", dataIndex: "sort", width: 72, align: "right" as const },
        {
            title: "启用",
            dataIndex: "enabled",
            width: 80,
            render: (value: number) => (value === 1 ? <Tag color="success">启用</Tag> : <Tag color="default">停用</Tag>),
        },
        {
            title: "操作",
            key: "actions",
            width: 150,
            fixed: "right",
            render: (_: unknown, record: VideoModel) => (
                <Space size={0}>
                    <Button type="link" size="small" icon={<Pencil size={14} />} onClick={() => openEdit(record)}>
                        编辑
                    </Button>
                    <Popconfirm
                        title="停用模型"
                        description="删除操作等价于停用，停用后用户端不可见。"
                        okText="确认停用"
                        okButtonProps={{ danger: true, loading: deletingId === record.id }}
                        cancelText="取消"
                        disabled={record.enabled === 0}
                        onConfirm={() => void handleDisable(record)}
                    >
                        <Button type="link" size="small" danger icon={<Ban size={14} />} disabled={record.enabled === 0}>
                            停用
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <>
            <PageHead
                title="模型管理"
                description="配置图片与视频模型的渠道线路、规格定价和生成能力。"
                extra={
                    <Space>
                        <Button icon={<RefreshCw size={15} />} onClick={() => void load()} loading={loading}>
                            刷新
                        </Button>
                        <Button type="primary" icon={<Plus size={15} />} onClick={openCreate}>
                            新增模型
                        </Button>
                    </Space>
                }
            />

            <Table<VideoModel>
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={models}
                pagination={false}
                scroll={{ x: 2180 }}
                locale={{ emptyText: "暂无模型，请先新增" }}
            />

            <Drawer
                title={editing ? `编辑模型 · ${editing.displayName}` : "新增模型"}
                size={720}
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
                <Form<ModelFormValues> form={form} layout="vertical" requiredMark={false}>
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item label="媒体类型" name="capability" rules={[{ required: true, message: "请选择媒体类型" }]}>
                                <Select options={CAPABILITY_OPTIONS} onChange={handleCapabilityChange} />
                            </Form.Item>
                        </Col>
                        <Col span={16}>
                            <Form.Item
                                label="所属渠道"
                                name="channelId"
                                rules={[{ required: true, message: "请选择支持该媒体类型的渠道" }]}
                                extra={
                                    <Button type="link" size="small" icon={<RefreshCw size={14} />}
                                        disabled={!channelId} loading={syncingModels}
                                        onClick={() => void syncChannelModels()}>
                                        同步当前渠道模型
                                    </Button>
                                }
                            >
                                <Select
                                    options={channelOptions}
                                    placeholder={channelOptions.length > 0 ? "请选择渠道" : "暂无支持该媒体类型的渠道"}
                                    showSearch
                                    optionFilterProp="label"
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item
                        label="模型列表 URL（可选）"
                        extra="留空自动尝试兼容地址；可填写 /models 或与渠道同源的完整地址。仅用于本次配置页同步，不随模型保存。列表包含上游公开的全部模型，请选择支持当前媒体类型的模型。"
                    >
                        <Input
                            value={modelsUrl}
                            disabled={!channelId || syncingModels}
                            placeholder="例如：/v1/models"
                            allowClear
                            onChange={(event) => setModelsUrls((previous) => ({ ...previous, [channelId]: event.target.value }))}
                        />
                    </Form.Item>
                    <Row gutter={16}>
                        <Col span={16}>
                            <Form.Item
                                label="逻辑模型标识"
                                name="modelKey"
                                rules={[
                                    { required: true, whitespace: true, message: "请输入逻辑模型标识" },
                                    { max: 128, message: "最多 128 个字符" },
                                ]}
                                extra="同一用户可见模型的多条渠道线路填写相同标识。"
                            >
                                <Input placeholder="例如：sora-2" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item
                                label="线路权重"
                                name="routeWeight"
                                rules={[
                                    { required: true, message: "请输入线路权重" },
                                    {
                                        validator: async (_rule, value: number | null | undefined) => {
                                            if (value != null && (!Number.isInteger(value) || value <= 0 || value > 1_000_000)) {
                                                return Promise.reject(new Error("线路权重必须为 1 到 1000000 的整数"));
                                            }
                                            return Promise.resolve();
                                        },
                                    },
                                ]}
                            >
                                <InputNumber min={1} max={1_000_000} precision={0} step={1} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                label="上游模型名（upstreamModel）"
                                name="upstreamModel"
                                rules={[{ required: true, message: "请输入上游模型名" }]}
                            >
                                <AutoComplete
                                    options={(channelModels[modelsCacheKey] ?? []).map((name) => ({ value: name }))}
                                    placeholder="同步渠道后选择，或手动输入模型名"
                                    filterOption={(input, option) =>
                                        String(option?.value ?? "").toLowerCase().includes(input.toLowerCase())}
                                    onSelect={(name: string) => {
                                        if (!form.getFieldValue("modelKey")?.trim()) form.setFieldValue("modelKey", name);
                                        if (!form.getFieldValue("displayName")?.trim()) form.setFieldValue("displayName", name);
                                    }}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                label="展示名（displayName）"
                                name="displayName"
                                rules={[{ required: true, message: "请输入展示名" }]}
                            >
                                <Input placeholder="用户端展示的模型名称" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Typography.Title level={5}>规格与客户售价</Typography.Title>
                    <Typography.Paragraph type="secondary">
                        每条规格对应客户端的一个可选项；仅配置上游实际支持的规格。预设用于快捷填写，不代表当前渠道支持。
                    </Typography.Paragraph>
                    <div style={{ padding: 16, marginBottom: 20, border: "1px solid var(--ant-color-border-secondary, #e8e8ef)", borderRadius: 12, background: "var(--ant-color-fill-alter, #fafafe)" }}>
                        <Typography.Text strong>客户选择预览 · {capability === "image" ? "生成图片" : "生成视频"}</Typography.Text>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                            {pricingRules.map((rule: PricingRuleForm, index: number) => (
                                <Tag key={index} color="purple" style={{ padding: "6px 10px", margin: 0, borderRadius: 8 }}>
                                    {rule.resolution?.replace("x", " × ") || "待选择规格"}
                                    {capability === "video" ? ` · ${rule.seconds || "—"} 秒` : ""}
                                    {` · ${rule.credits == null ? "—" : Math.max(minChargeCredits, Math.ceil(rule.credits))} 积分/${capability === "image" ? "张" : "次"}`}
                                </Tag>
                            ))}
                        </div>
                    </div>
                    <Form.List
                        name="pricingRules"
                        rules={[{
                            validator: async (_rule, rules: PricingRuleForm[] | undefined) => {
                                if (!rules?.length) {
                                    return Promise.reject(new Error("请至少配置一条规格价格"));
                                }
                                const keys = rules.map((rule) => `${rule.resolution?.trim()}:${capability === "image" ? "image" : rule.seconds}`);
                                if (new Set(keys).size !== keys.length) {
                                    return Promise.reject(new Error("同一规格只能配置一个价格，请删除重复规格"));
                                }
                                return Promise.resolve();
                            },
                        }]}
                    >
                        {(fields, { add, remove }, { errors }) => (
                            <>
                                {fields.map(({ key, ...field }) => (
                                    <Row gutter={12} key={key} align="top">
                                        <Col span={capability === "video" ? 9 : 13}>
                                            <Form.Item
                                                {...field}
                                                label={capability === "image" ? "尺寸" : "分辨率"}
                                                name={[field.name, "resolution"]}
                                                rules={[
                                                    { required: true, whitespace: true, message: capability === "image" ? "请选择或输入尺寸" : "请选择或输入分辨率" },
                                                    ...(capability === "image" ? [{ pattern: /^[1-9]\d{1,4}x[1-9]\d{1,4}$/, message: "请输入宽x高，例如 1024x1024（小写 x）" }] : []),
                                                ]}
                                            >
                                                <AutoComplete
                                                    options={capability === "image" ? IMAGE_SPEC_OPTIONS : VIDEO_SPEC_OPTIONS}
                                                    placeholder={capability === "image" ? "选择尺寸，或输入宽x高" : "选择分辨率，或输入渠道规格"}
                                                    filterOption={(input, option) => String(option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
                                                />
                                            </Form.Item>
                                        </Col>
                                        {capability === "video" ? (
                                            <Col span={6}>
                                                <Form.Item
                                                    {...field}
                                                    label="秒数"
                                                    name={[field.name, "seconds"]}
                                                    rules={[{ required: true, message: "请输入秒数" }]}
                                                >
                                                    <InputNumber min={1} precision={0} style={{ width: "100%" }} />
                                                </Form.Item>
                                            </Col>
                                        ) : null}
                                        <Col span={capability === "video" ? 7 : 9}>
                                            <Form.Item
                                                {...field}
                                                label={capability === "image" ? "每张积分" : "每条积分"}
                                                name={[field.name, "credits"]}
                                                rules={[{ required: true, message: "请输入积分" }]}
                                            >
                                                <InputNumber min={1} precision={0} style={{ width: "100%" }} />
                                            </Form.Item>
                                        </Col>
                                        <Col span={2}>
                                            <Tooltip title="删除规格">
                                                <Button
                                                    aria-label="删除规格"
                                                    type="text"
                                                    danger
                                                    icon={<Trash2 size={16} />}
                                                    style={{ marginTop: 30 }}
                                                    onClick={() => remove(field.name)}
                                                />
                                            </Tooltip>
                                        </Col>
                                    </Row>
                                ))}
                                <Button type="dashed" block icon={<Plus size={15} />} onClick={() => add(defaultPricingRules(capability)[0])}>
                                    添加规格价格
                                </Button>
                                <Form.ErrorList errors={errors} />
                            </>
                        )}
                    </Form.List>

                    <Collapse
                        ghost
                        style={{ marginTop: 16 }}
                        items={[{
                            key: "compatibility",
                            forceRender: true,
                            label: "兼容高级配置",
                            children: (
                                <>
                                    <Row gutter={16}>
                                        <Col span={12}>
                                            <Form.Item
                                                label="积分 / 秒"
                                                name="creditsPerSecond"
                                                rules={[{ required: true, message: "请输入每秒积分" }]}
                                            >
                                                <InputNumber min={0} step={0.5} precision={4} style={{ width: "100%" }} />
                                            </Form.Item>
                                        </Col>
                                        <Col span={12}>
                                            <Form.Item
                                                label="默认分辨率"
                                                name="resolutionDefault"
                                                rules={[{ required: true, message: "请选择默认分辨率" }]}
                                            >
                                                <Select
                                    options={["480p", "720p", "1080p"].map((value) => ({ value, label: value }))}
                                    placeholder="请选择"
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item
                        label="分辨率系数（JSON 对象）"
                        name="resolutionFactors"
                        rules={[validateJsonObject]}
                        extra='键为分辨率档位，值为计费系数，例如 {"480p":1.0,"720p":1.5,"1080p":2.0}'
                    >
                        <Input.TextArea rows={3} style={{ fontFamily: "monospace" }} />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                label="音频系数（audioFactor）"
                                name="audioFactor"
                                rules={[{ required: true, message: "请输入音频系数" }]}
                            >
                                <InputNumber min={0} step={0.1} precision={4} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                label="最小扣费积分"
                                name="minChargeCredits"
                                rules={[{ required: true, message: "请输入最小扣费积分" }]}
                            >
                                <InputNumber min={0} step={1} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item
                        label="支持时长（JSON 数组）"
                        name="supportedSeconds"
                        rules={[validateJsonArray]}
                        extra='例如 ["4","8","12"]'
                    >
                        <Input.TextArea rows={2} style={{ fontFamily: "monospace" }} />
                    </Form.Item>
                    <Form.Item
                        label="支持尺寸（JSON 数组）"
                        name="supportedSizes"
                        rules={[validateJsonArray]}
                        extra='例如 ["1280x720","720x1280"]'
                    >
                        <Input.TextArea rows={2} style={{ fontFamily: "monospace" }} />
                    </Form.Item>
                    <Form.Item
                        label="支持比例（JSON 数组）"
                        name="supportedRatios"
                        rules={[validateJsonArray]}
                        extra='例如 ["16:9","9:16","1:1"]'
                    >
                        <Input.TextArea rows={2} style={{ fontFamily: "monospace" }} />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item label="支持音频" name="supportsAudio" valuePropName="checked">
                                <Switch checkedChildren="支持" unCheckedChildren="不支持" />
                            </Form.Item>
                            <Form.Item label="支持水印" name="supportsWatermark" valuePropName="checked">
                                <Switch checkedChildren="支持" unCheckedChildren="不支持" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item label="支持首尾帧" name="supportsFirstLastFrame" valuePropName="checked">
                                <Switch checkedChildren="支持" unCheckedChildren="不支持" />
                            </Form.Item>
                            <Form.Item label="支持参考图" name="supportsReferenceImages" valuePropName="checked">
                                <Switch checkedChildren="支持" unCheckedChildren="不支持" />
                            </Form.Item>
                        </Col>
                    </Row>
                                </>
                            ),
                        }]}
                    />

                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item
                                label="最大参考图数"
                                name="maxReferenceImages"
                                rules={[{ required: true, message: "请输入最大参考图数" }]}
                            >
                                <InputNumber min={0} max={100} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item label="排序" name="sort" rules={[{ required: true, message: "请输入排序值" }]}>
                                <InputNumber step={1} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item label="启用" name="enabled" valuePropName="checked">
                                <Switch checkedChildren="启用" unCheckedChildren="停用" />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Drawer>
        </>
    );
}
