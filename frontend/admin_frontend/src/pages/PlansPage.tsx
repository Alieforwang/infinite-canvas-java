import { useCallback, useEffect, useState } from "react";
import {
    Button,
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
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

import { adminApi } from "../api/admin";
import { PageHead } from "../components/PageHead";
import { StatusTag } from "../components/StatusTag";
import { useFeedback } from "../lib/feedback";
import { formatCredits, formatDateTime, formatMoney, PLAN_TYPE_META } from "../lib/format";
import type { Plan, PlanPayload } from "../types";

interface PlanFormValues {
    code: string;
    name: string;
    type: string;
    priceAmount: number;
    credits: number;
    bonusCredits: number;
    validDays: number;
    description?: string;
    sort: number;
    enabled: boolean;
}

const TYPE_OPTIONS = [
    { value: "CREDIT_PACK", label: "CREDIT_PACK（积分包）" },
    { value: "PLAN", label: "PLAN（周期套餐）" },
];

export function PlansPage() {
    const { showApiError, showSuccess } = useFeedback();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [form] = Form.useForm<PlanFormValues>();
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Plan | null>(null);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const list = await adminApi.listPlans();
            setPlans(list);
        } catch (err) {
            showApiError(err);
        } finally {
            setLoading(false);
        }
    }, [showApiError]);

    useEffect(() => {
        void load();
    }, [load]);

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({
            type: "CREDIT_PACK",
            priceAmount: 10,
            credits: 1000,
            bonusCredits: 0,
            validDays: 0,
            description: "",
            sort: 0,
            enabled: true,
        });
        setModalOpen(true);
    };

    const openEdit = (record: Plan) => {
        setEditing(record);
        form.resetFields();
        form.setFieldsValue({
            code: record.code,
            name: record.name,
            type: record.type,
            priceAmount: Number(record.priceAmount),
            credits: record.credits,
            bonusCredits: record.bonusCredits,
            validDays: record.validDays,
            description: record.description ?? "",
            sort: record.sort,
            enabled: record.enabled === 1,
        });
        setModalOpen(true);
    };

    const handleSubmit = async () => {
        let values: PlanFormValues;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }
        const payload: PlanPayload = {
            code: values.code.trim(),
            name: values.name.trim(),
            type: values.type,
            priceAmount: values.priceAmount,
            credits: values.credits,
            bonusCredits: values.bonusCredits,
            validDays: values.validDays,
            description: values.description?.trim() ?? "",
            sort: values.sort,
            enabled: values.enabled,
        };
        setSaving(true);
        try {
            if (editing) {
                await adminApi.updatePlan(editing.id, payload);
                showSuccess("套餐已更新");
            } else {
                await adminApi.createPlan(payload);
                showSuccess("套餐已创建");
            }
            setModalOpen(false);
            await load();
        } catch (err) {
            showApiError(err);
        } finally {
            setSaving(false);
        }
    };

    const handleDisable = async (record: Plan) => {
        setDeletingId(record.id);
        try {
            await adminApi.deletePlan(record.id);
            showSuccess("套餐已下架");
            await load();
        } catch (err) {
            showApiError(err);
        } finally {
            setDeletingId(null);
        }
    };

    const columns: TableColumnsType<Plan> = [
        { title: "ID", dataIndex: "id", width: 64 },
        { title: "Code", dataIndex: "code", width: 130, render: (value: string) => <span className="mono">{value}</span> },
        { title: "名称", dataIndex: "name", width: 220, render: (value: string) => <Typography.Text strong>{value}</Typography.Text> },
        {
            title: "类型",
            dataIndex: "type",
            width: 120,
            render: (value: string) => <StatusTag meta={PLAN_TYPE_META[value]} fallback={value} />,
        },
        {
            title: "价格",
            dataIndex: "priceAmount",
            width: 110,
            align: "right",
            render: (value: number) => <span className="money-value">{formatMoney(value)}</span>,
        },
        {
            title: "积分",
            dataIndex: "credits",
            width: 120,
            align: "right",
            render: (value: number) => <span className="credits-value">{formatCredits(value)}</span>,
        },
        {
            title: "赠送积分",
            dataIndex: "bonusCredits",
            width: 110,
            align: "right",
            render: (value: number) => <span className="credits-value">{formatCredits(value)}</span>,
        },
        {
            title: "有效期",
            dataIndex: "validDays",
            width: 100,
            render: (value: number) => (value > 0 ? `${value} 天` : <span className="muted">永久</span>),
        },
        {
            title: "描述",
            dataIndex: "description",
            ellipsis: true,
            width: 220,
            render: (value: string) => <span className="muted">{value || "-"}</span>,
        },
        { title: "排序", dataIndex: "sort", width: 76, align: "right" as const },
        {
            title: "状态",
            dataIndex: "enabled",
            width: 90,
            render: (value: number) => (value === 1 ? <Tag color="success">上架</Tag> : <Tag color="default">已下架</Tag>),
        },
        {
            title: "创建时间",
            dataIndex: "createdAt",
            width: 180,
            render: (value: string) => <span className="mono">{formatDateTime(value)}</span>,
        },
        {
            title: "操作",
            key: "actions",
            width: 150,
            fixed: "right",
            render: (_: unknown, record: Plan) => (
                <Space size={0}>
                    <Button type="link" size="small" icon={<Pencil size={14} />} onClick={() => openEdit(record)}>
                        编辑
                    </Button>
                    <Popconfirm
                        title="下架套餐"
                        description="下架后用户端不可购买，已开通的套餐不受影响。"
                        okText="确认下架"
                        okButtonProps={{ danger: true, loading: deletingId === record.id }}
                        cancelText="取消"
                        disabled={record.enabled === 0}
                        onConfirm={() => void handleDisable(record)}
                    >
                        <Button type="link" size="small" danger icon={<Trash2 size={14} />} disabled={record.enabled === 0}>
                            下架
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <>
            <PageHead
                title="套餐管理"
                description="管理积分包与周期套餐：价格、积分、赠送积分、有效天数与上下架状态。"
                extra={
                    <Space>
                        <Button icon={<RefreshCw size={15} />} onClick={() => void load()} loading={loading}>
                            刷新
                        </Button>
                        <Button type="primary" icon={<Plus size={15} />} onClick={openCreate}>
                            新增套餐
                        </Button>
                    </Space>
                }
            />

            <Table<Plan>
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={plans}
                pagination={false}
                scroll={{ x: 1680 }}
                locale={{ emptyText: "暂无套餐，请先新增" }}
            />

            <Modal
                title={editing ? `编辑套餐 · ${editing.name}` : "新增套餐"}
                width={600}
                open={modalOpen}
                forceRender
                onCancel={() => setModalOpen(false)}
                footer={
                    <Space>
                        <Button onClick={() => setModalOpen(false)}>取消</Button>
                        <Button type="primary" loading={saving} onClick={() => void handleSubmit()}>
                            保存
                        </Button>
                    </Space>
                }
            >
                <Form<PlanFormValues> form={form} layout="vertical" requiredMark={false}>
                    <Space size={16} style={{ display: "flex" }} align="start">
                        <Form.Item
                            label="套餐 Code"
                            name="code"
                            rules={[{ required: true, message: "请输入套餐 code" }]}
                            style={{ flex: 1 }}
                        >
                            <Input placeholder="例如：pack_10" />
                        </Form.Item>
                        <Form.Item
                            label="套餐名称"
                            name="name"
                            rules={[{ required: true, message: "请输入套餐名称" }]}
                            style={{ flex: 1 }}
                        >
                            <Input placeholder="例如：体验包 1000 积分" />
                        </Form.Item>
                    </Space>

                    <Space size={16} style={{ display: "flex" }} align="start">
                        <Form.Item label="类型" name="type" rules={[{ required: true, message: "请选择类型" }]} style={{ flex: 1 }}>
                            <Select options={TYPE_OPTIONS} />
                        </Form.Item>
                        <Form.Item
                            label="价格（元）"
                            name="priceAmount"
                            rules={[{ required: true, message: "请输入价格" }]}
                            style={{ flex: 1 }}
                        >
                            <InputNumber min={0} precision={2} step={1} style={{ width: "100%" }} prefix="¥" />
                        </Form.Item>
                    </Space>

                    <Space size={16} style={{ display: "flex" }} align="start">
                        <Form.Item
                            label="积分"
                            name="credits"
                            rules={[{ required: true, message: "请输入积分" }]}
                            style={{ flex: 1 }}
                        >
                            <InputNumber min={0} step={100} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item
                            label="赠送积分"
                            name="bonusCredits"
                            rules={[{ required: true, message: "请输入赠送积分" }]}
                            style={{ flex: 1 }}
                        >
                            <InputNumber min={0} step={100} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item
                            label="有效天数"
                            name="validDays"
                            rules={[{ required: true, message: "请输入有效天数" }]}
                            style={{ flex: 1 }}
                        >
                            <InputNumber min={0} step={1} style={{ width: "100%" }} placeholder="0 表示永久" />
                        </Form.Item>
                    </Space>

                    <Form.Item label="描述" name="description">
                        <Input.TextArea rows={2} maxLength={200} showCount placeholder="展示给用户的套餐说明" />
                    </Form.Item>

                    <Space size={16} style={{ display: "flex" }} align="start">
                        <Form.Item label="排序" name="sort" rules={[{ required: true, message: "请输入排序值" }]} style={{ flex: 1 }}>
                            <InputNumber step={1} style={{ width: "100%" }} />
                        </Form.Item>
                        <Form.Item label="上架" name="enabled" valuePropName="checked" style={{ flex: 1 }}>
                            <Switch checkedChildren="上架" unCheckedChildren="下架" />
                        </Form.Item>
                    </Space>

                    {editing ? (
                        <Tooltip title="修改 code 可能影响已有订单与兑换码关联，请谨慎操作">
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                提示：套餐 code 建议创建后不要修改。
                            </Typography.Text>
                        </Tooltip>
                    ) : null}
                </Form>
            </Modal>
        </>
    );
}
