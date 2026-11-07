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
import { useCurrency } from "../lib/currency";
import { creditsToYuan, currencyText, formatDateTime, formatYuan, PLAN_TYPE_META, yuanToCredits } from "../lib/format";
import type { Plan, PlanPayload } from "../types";

interface PlanFormValues {
    code: string;
    name: string;
    type: string;
    priceAmount: string;
    credits: string;
    bonusCredits: string;
    validDays: number;
    description?: string;
    sort: number;
    enabled: boolean;
}

interface OriginalCreditInputs {
    credits: number;
    bonusCredits: number;
    displayedCredits: string;
    displayedBonus: string;
}

export function planFormPayload(values: PlanFormValues, exchangePerYuan: number, original: OriginalCreditInputs | null): PlanPayload {
    const credits = original && values.credits === original.displayedCredits
        ? original.credits : yuanToCredits(values.credits, exchangePerYuan);
    const bonusCredits = original && values.bonusCredits === original.displayedBonus
        ? original.bonusCredits : yuanToCredits(values.bonusCredits, exchangePerYuan);
    const priceAmount = Number(values.priceAmount);
    if (credits < 0 || bonusCredits < 0) throw new RangeError("余额及赠送余额不能为负数");
    if (!Number.isFinite(priceAmount) || priceAmount < 0) throw new RangeError("请输入有效的非负价格");
    return {
        code: values.code.trim(),
        name: values.name.trim(),
        type: values.type,
        priceAmount,
        credits,
        bonusCredits,
        validDays: values.validDays,
        description: values.description?.trim() ?? "",
        sort: values.sort,
        enabled: values.enabled,
    };
}

const NON_NEGATIVE_AMOUNT_RULE = {
    validator: async (_rule: unknown, value: string) => {
        if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new Error("金额必须为非负数");
    },
};

const TYPE_OPTIONS = [
    { value: "CREDIT_PACK", label: "CREDIT_PACK（充值包）" },
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
    const { exchangePerYuan, ready } = useCurrency();
    const [rawCreditInputs, setRawCreditInputs] = useState<OriginalCreditInputs | null>(null);

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
        const displayedCredits = String(creditsToYuan(1000, exchangePerYuan) ?? 0);
        setRawCreditInputs({ credits: 1000, bonusCredits: 0, displayedCredits, displayedBonus: "0" });
        form.resetFields();
        form.setFieldsValue({
            type: "CREDIT_PACK",
            priceAmount: "10",
            credits: displayedCredits,
            bonusCredits: "0",
            validDays: 0,
            description: "",
            sort: 0,
            enabled: true,
        });
        setModalOpen(true);
    };

    const openEdit = (record: Plan) => {
        setEditing(record);
        // Keep the raw units alongside repeating yuan fractions so unrelated edits never rewrite money.
        const displayedCredits = String(creditsToYuan(record.credits, exchangePerYuan) ?? 0);
        const displayedBonus = String(creditsToYuan(record.bonusCredits, exchangePerYuan) ?? 0);
        setRawCreditInputs({ credits: record.credits, bonusCredits: record.bonusCredits, displayedCredits, displayedBonus });
        form.resetFields();
        form.setFieldsValue({
            code: record.code,
            name: record.name,
            type: record.type,
            priceAmount: String(record.priceAmount),
            credits: displayedCredits,
            bonusCredits: displayedBonus,
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
        if (!ready) {
            showApiError(new Error("金额设置尚未就绪，请稍后重试"));
            return;
        }
        let payload: PlanPayload;
        try {
            payload = planFormPayload(values, exchangePerYuan, rawCreditInputs);
        } catch (err) {
            showApiError(err);
            return;
        }
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
        { title: "名称", dataIndex: "name", width: 220, render: (value: string) => <Typography.Text strong>{currencyText(value, exchangePerYuan)}</Typography.Text> },
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
            render: (value: number) => <span className="money-value">{formatYuan(value)}</span>,
        },
        {
            title: "余额（元）",
            dataIndex: "credits",
            width: 120,
            align: "right",
            render: (value: number) => <span className="credits-value">{ready ? formatYuan(creditsToYuan(value, exchangePerYuan)) : "金额未就绪"}</span>,
        },
        {
            title: "赠送余额（元）",
            dataIndex: "bonusCredits",
            width: 110,
            align: "right",
            render: (value: number) => <span className="credits-value">{ready ? formatYuan(creditsToYuan(value, exchangePerYuan)) : "金额未就绪"}</span>,
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
            render: (value: string) => <span className="muted">{currencyText(value, exchangePerYuan) || "-"}</span>,
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
                description="管理充值包与周期套餐：价格、余额、赠送余额、有效天数与上下架状态。"
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
                title={editing ? `编辑套餐 · ${currencyText(editing.name, exchangePerYuan)}` : "新增套餐"}
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
                            <Input placeholder="例如：体验充值包" />
                        </Form.Item>
                    </Space>

                    <Space size={16} style={{ display: "flex" }} align="start">
                        <Form.Item label="类型" name="type" rules={[{ required: true, message: "请选择类型" }]} style={{ flex: 1 }}>
                            <Select options={TYPE_OPTIONS} />
                        </Form.Item>
                        <Form.Item
                            label="价格（元）"
                            name="priceAmount"
                            rules={[{ required: true, message: "请输入价格" }, NON_NEGATIVE_AMOUNT_RULE]}
                            style={{ flex: 1 }}
                        >
                            <InputNumber<string> stringMode step="1" style={{ width: "100%" }} prefix="¥" />
                        </Form.Item>
                    </Space>

                    <Space size={16} style={{ display: "flex" }} align="start">
                        <Form.Item
                            label="余额（元）"
                            name="credits"
                            rules={[{ required: true, message: "请输入余额金额" }, NON_NEGATIVE_AMOUNT_RULE]}
                            style={{ flex: 1 }}
                        >
                            <InputNumber<string> stringMode step="0.01" style={{ width: "100%" }} prefix="¥" />
                        </Form.Item>
                        <Form.Item
                            label="赠送余额（元）"
                            name="bonusCredits"
                            rules={[{ required: true, message: "请输入赠送余额" }, NON_NEGATIVE_AMOUNT_RULE]}
                            style={{ flex: 1 }}
                        >
                            <InputNumber<string> stringMode step="0.01" style={{ width: "100%" }} prefix="¥" />
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
