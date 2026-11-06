import { useCallback, useEffect, useState } from "react";
import {
    Button,
    Descriptions,
    Drawer,
    Form,
    Input,
    InputNumber,
    Modal,
    Select,
    Space,
    Spin,
    Table,
    Tag,
    Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import { Eye, HandCoins, RefreshCw, Search, ShieldOff, ShieldCheck, Wallet } from "lucide-react";

import { adminApi } from "../api/admin";
import { PageHead } from "../components/PageHead";
import { StatusTag } from "../components/StatusTag";
import { useFeedback } from "../lib/feedback";
import { formatCredits, formatDateTime, USER_STATUS_META } from "../lib/format";
import type { AdminUser, CreditTransaction, PageResult, Plan } from "../types";

interface UserQueryState {
    keyword: string;
    status?: string;
    page: number;
    pageSize: number;
}

interface StatusFormValues {
    reason: string;
}

interface AdjustFormValues {
    amount: number;
    reason: string;
}

interface RechargeFormValues {
    amount: number;
    remark?: string;
}

interface PlanFormValues {
    planId: number;
    reason?: string;
}

const DEFAULT_PAGE_SIZE = 10;

function deltaText(value: number | null): string {
    if (value === null || value === undefined) {
        return "-";
    }
    return value > 0 ? `+${formatCredits(value)}` : formatCredits(value);
}

function deltaColor(value: number | null): string {
    if (value === null || value === undefined || value === 0) {
        return "#6b7280";
    }
    return value > 0 ? "#059669" : "#dc2626";
}

export function UsersPage() {
    const { showApiError, showSuccess } = useFeedback();
    const [keywordInput, setKeywordInput] = useState("");
    const [statusInput, setStatusInput] = useState<string | undefined>(undefined);
    const [query, setQuery] = useState<UserQueryState>({ keyword: "", page: 1, pageSize: DEFAULT_PAGE_SIZE });
    const [data, setData] = useState<PageResult<AdminUser> | null>(null);
    const [loading, setLoading] = useState(true);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [submitting, setSubmitting] = useState(false);

    const [statusTarget, setStatusTarget] = useState<{ user: AdminUser; nextStatus: "ACTIVE" | "DISABLED" } | null>(null);
    const [adjustTarget, setAdjustTarget] = useState<AdminUser | null>(null);
    const [rechargeTarget, setRechargeTarget] = useState<AdminUser | null>(null);
    const [planTarget, setPlanTarget] = useState<AdminUser | null>(null);
    const [detailTarget, setDetailTarget] = useState<AdminUser | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
    const [transactions, setTransactions] = useState<CreditTransaction[]>([]);

    const [statusForm] = Form.useForm<StatusFormValues>();
    const [adjustForm] = Form.useForm<AdjustFormValues>();
    const [rechargeForm] = Form.useForm<RechargeFormValues>();
    const [planForm] = Form.useForm<PlanFormValues>();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await adminApi.listUsers({
                keyword: query.keyword || undefined,
                status: query.status || undefined,
                page: query.page,
                pageSize: query.pageSize,
            });
            setData(result);
        } catch (err) {
            showApiError(err);
        } finally {
            setLoading(false);
        }
    }, [query, showApiError]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        adminApi
            .listPlans()
            .then(setPlans)
            .catch((err: unknown) => showApiError(err));
    }, [showApiError]);

    const handleSearch = () => {
        setQuery((prev) => ({
            ...prev,
            keyword: keywordInput.trim(),
            status: statusInput,
            page: 1,
        }));
    };

    const handleReset = () => {
        setKeywordInput("");
        setStatusInput(undefined);
        setQuery((prev) => ({ ...prev, keyword: "", status: undefined, page: 1 }));
    };

    const openStatusModal = (user: AdminUser) => {
        const nextStatus = user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
        statusForm.resetFields();
        statusForm.setFieldsValue({ reason: "" });
        setStatusTarget({ user, nextStatus });
    };

    const submitStatus = async () => {
        if (!statusTarget) {
            return;
        }
        let values: StatusFormValues;
        try {
            values = await statusForm.validateFields();
        } catch {
            return;
        }
        setSubmitting(true);
        try {
            await adminApi.setUserStatus(statusTarget.user.id, statusTarget.nextStatus, values.reason.trim());
            showSuccess(statusTarget.nextStatus === "DISABLED" ? "用户已禁用" : "用户已启用");
            setStatusTarget(null);
            await load();
        } catch (err) {
            showApiError(err);
        } finally {
            setSubmitting(false);
        }
    };

    const openAdjustModal = (user: AdminUser) => {
        adjustForm.resetFields();
        adjustForm.setFieldsValue({ amount: 100, reason: "" });
        setAdjustTarget(user);
    };

    const submitAdjust = async () => {
        if (!adjustTarget) {
            return;
        }
        let values: AdjustFormValues;
        try {
            values = await adjustForm.validateFields();
        } catch {
            return;
        }
        setSubmitting(true);
        try {
            await adminApi.adjustUserCredits(adjustTarget.id, values.amount, values.reason.trim());
            showSuccess("积分调整成功");
            setAdjustTarget(null);
            await load();
            if (detailTarget && detailTarget.id === adjustTarget.id) {
                await loadDetail(adjustTarget);
            }
        } catch (err) {
            showApiError(err);
        } finally {
            setSubmitting(false);
        }
    };

    const openRechargeModal = (user: AdminUser) => {
        rechargeForm.resetFields();
        rechargeForm.setFieldsValue({ amount: 100, remark: "" });
        setRechargeTarget(user);
    };

    const submitRecharge = async () => {
        if (!rechargeTarget) {
            return;
        }
        let values: RechargeFormValues;
        try {
            values = await rechargeForm.validateFields();
        } catch {
            return;
        }
        setSubmitting(true);
        try {
            await adminApi.rechargeUser(rechargeTarget.id, values.amount, values.remark?.trim() ?? "");
            showSuccess("充值成功");
            setRechargeTarget(null);
            await load();
        } catch (err) {
            showApiError(err);
        } finally {
            setSubmitting(false);
        }
    };

    const openPlanModal = (user: AdminUser) => {
        planForm.resetFields();
        planForm.setFieldsValue({ planId: undefined, reason: "" });
        setPlanTarget(user);
    };

    const submitPlan = async () => {
        if (!planTarget) {
            return;
        }
        let values: PlanFormValues;
        try {
            values = await planForm.validateFields();
        } catch {
            return;
        }
        setSubmitting(true);
        try {
            await adminApi.grantUserPlan(planTarget.id, values.planId, values.reason?.trim() ?? "");
            showSuccess("套餐开通成功");
            setPlanTarget(null);
            await load();
        } catch (err) {
            showApiError(err);
        } finally {
            setSubmitting(false);
        }
    };

    const loadDetail = async (user: AdminUser) => {
        setDetailLoading(true);
        try {
            const [detail, txs] = await Promise.all([
                adminApi.getUser(user.id),
                adminApi.listUserTransactions(user.id),
            ]);
            setDetailUser(detail);
            setTransactions(txs);
        } catch (err) {
            showApiError(err);
        } finally {
            setDetailLoading(false);
        }
    };

    const openDetail = (user: AdminUser) => {
        setDetailTarget(user);
        setDetailUser(user);
        setTransactions([]);
        void loadDetail(user);
    };

    const columns: TableColumnsType<AdminUser> = [
        { title: "ID", dataIndex: "id", width: 64 },
        {
            title: "邮箱 / 昵称",
            dataIndex: "email",
            width: 240,
            render: (_: string, record: AdminUser) => (
                <div>
                    <div>{record.email}</div>
                    <Typography.Text type="secondary">{record.displayName || "-"}</Typography.Text>
                </div>
            ),
        },
        {
            title: "状态",
            dataIndex: "status",
            width: 90,
            render: (value: string) => <StatusTag meta={USER_STATUS_META[value]} fallback={value} />,
        },
        {
            title: "可用积分",
            dataIndex: "available",
            width: 110,
            align: "right",
            render: (value: number) => <span className="credits-value">{formatCredits(value)}</span>,
        },
        {
            title: "累计消耗",
            dataIndex: "totalConsumed",
            width: 110,
            align: "right",
            render: (value: number) => <span className="credits-value">{formatCredits(value)}</span>,
        },
        {
            title: "任务数",
            dataIndex: "taskCount",
            width: 90,
            align: "right",
            render: (value: number) => <span className="mono">{formatCredits(value)}</span>,
        },
        {
            title: "注册时间",
            dataIndex: "createdAt",
            width: 180,
            render: (value: string) => <span className="mono">{formatDateTime(value)}</span>,
        },
        {
            title: "操作",
            key: "actions",
            width: 430,
            fixed: "right",
            render: (_: unknown, record: AdminUser) => (
                <Space size={0} wrap>
                    <Button type="link" size="small" icon={<Eye size={14} />} onClick={() => openDetail(record)}>
                        详情
                    </Button>
                    <Button type="link" size="small" icon={<HandCoins size={14} />} onClick={() => openAdjustModal(record)}>
                        调积分
                    </Button>
                    <Button type="link" size="small" icon={<Wallet size={14} />} onClick={() => openRechargeModal(record)}>
                        充值
                    </Button>
                    <Button type="link" size="small" onClick={() => openPlanModal(record)}>
                        开通套餐
                    </Button>
                    <Button
                        type="link"
                        size="small"
                        danger={record.status === "ACTIVE"}
                        icon={record.status === "ACTIVE" ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                        onClick={() => openStatusModal(record)}
                    >
                        {record.status === "ACTIVE" ? "禁用" : "启用"}
                    </Button>
                </Space>
            ),
        },
    ];

    const transactionColumns: TableColumnsType<CreditTransaction> = [
        { title: "时间", dataIndex: "createdAt", width: 170, render: (value: string) => <span className="mono">{formatDateTime(value)}</span> },
        { title: "业务类型", dataIndex: "bizType", width: 150, render: (value: string) => <Tag>{value}</Tag> },
        {
            title: "可用变动",
            dataIndex: "availableDelta",
            width: 110,
            align: "right",
            render: (value: number | null) => <span style={{ color: deltaColor(value) }}>{deltaText(value)}</span>,
        },
        {
            title: "冻结变动",
            dataIndex: "frozenDelta",
            width: 110,
            align: "right",
            render: (value: number | null) => <span style={{ color: deltaColor(value) }}>{deltaText(value)}</span>,
        },
        {
            title: "变动后余额",
            dataIndex: "balanceAfter",
            width: 110,
            align: "right",
            render: (value: number | null) => <span className="credits-value">{formatCredits(value)}</span>,
        },
        { title: "备注", dataIndex: "remark", ellipsis: true, width: 220, render: (value: string) => value || "-" },
    ];

    const planOptions = plans.map((plan) => ({
        value: plan.id,
        disabled: plan.enabled !== 1,
        label: `${plan.name}（${formatCredits(plan.credits)}+${formatCredits(plan.bonusCredits)} 积分${plan.enabled === 1 ? "" : "，已下架"}）`,
    }));

    const detailTransactionTable = (
        <Table<CreditTransaction>
            rowKey="id"
            size="small"
            loading={detailLoading}
            columns={transactionColumns}
            dataSource={transactions}
            pagination={false}
            scroll={{ x: 870 }}
            locale={{ emptyText: "暂无积分流水" }}
        />
    );

    return (
        <>
            <PageHead
                title="用户管理"
                description="查询用户、调整积分、手工充值、开通套餐与启用/禁用账号。"
                extra={
                    <Button icon={<RefreshCw size={15} />} onClick={() => void load()} loading={loading}>
                        刷新
                    </Button>
                }
            />

            <div className="toolbar">
                <div className="toolbar__filters">
                    <Input
                        allowClear
                        style={{ width: 260 }}
                        placeholder="按邮箱 / 昵称搜索"
                        prefix={<Search size={15} className="muted" />}
                        value={keywordInput}
                        onChange={(event) => setKeywordInput(event.target.value)}
                        onPressEnter={handleSearch}
                    />
                    <Select
                        allowClear
                        style={{ width: 150 }}
                        placeholder="用户状态"
                        value={statusInput}
                        onChange={(value: string | undefined) => setStatusInput(value)}
                        options={[
                            { value: "ACTIVE", label: "正常" },
                            { value: "DISABLED", label: "已禁用" },
                        ]}
                    />
                    <Button type="primary" onClick={handleSearch}>
                        查询
                    </Button>
                    <Button onClick={handleReset}>重置</Button>
                </div>
                <Typography.Text type="secondary">
                    共 {formatCredits(data?.total ?? 0)} 位用户
                </Typography.Text>
            </div>

            <Table<AdminUser>
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={data?.items ?? []}
                scroll={{ x: 1560 }}
                pagination={{
                    current: data?.page ?? query.page,
                    pageSize: data?.pageSize ?? query.pageSize,
                    total: data?.total ?? 0,
                    showSizeChanger: true,
                    showQuickJumper: true,
                    pageSizeOptions: [10, 20, 50, 100],
                    showTotal: (total) => `共 ${total} 条`,
                    onChange: (page, pageSize) =>
                        setQuery((prev) => ({ ...prev, page, pageSize: pageSize ?? prev.pageSize })),
                }}
            />

            {/* 禁用 / 启用 */}
            <Modal
                title={
                    statusTarget
                        ? `${statusTarget.nextStatus === "DISABLED" ? "禁用" : "启用"}用户 · ${statusTarget.user.email}`
                        : "修改用户状态"
                }
                open={Boolean(statusTarget)}
                forceRender
                onCancel={() => setStatusTarget(null)}
                footer={
                    <Space>
                        <Button onClick={() => setStatusTarget(null)}>取消</Button>
                        <Button
                            type="primary"
                            danger={statusTarget?.nextStatus === "DISABLED"}
                            loading={submitting}
                            onClick={() => void submitStatus()}
                        >
                            确认{statusTarget?.nextStatus === "DISABLED" ? "禁用" : "启用"}
                        </Button>
                    </Space>
                }
            >
                <Form<StatusFormValues> form={statusForm} layout="vertical">
                    <Form.Item
                        label="原因"
                        name="reason"
                        rules={[
                            { required: true, message: "请填写原因" },
                            { min: 2, message: "原因至少 2 个字" },
                        ]}
                    >
                        <Input.TextArea rows={3} placeholder="例如：违反平台使用规则" maxLength={200} showCount />
                    </Form.Item>
                </Form>
            </Modal>

            {/* 调积分 */}
            <Modal
                title={adjustTarget ? `调整积分 · ${adjustTarget.email}` : "调整积分"}
                open={Boolean(adjustTarget)}
                forceRender
                onCancel={() => setAdjustTarget(null)}
                footer={
                    <Space>
                        <Button onClick={() => setAdjustTarget(null)}>取消</Button>
                        <Button type="primary" loading={submitting} onClick={() => void submitAdjust()}>
                            确认调账
                        </Button>
                    </Space>
                }
            >
                <Form<AdjustFormValues> form={adjustForm} layout="vertical">
                    <Form.Item
                        label="变动数量（正数增加，负数扣减）"
                        name="amount"
                        rules={[
                            { required: true, message: "请输入变动数量" },
                            {
                                validator: async (_rule, value: number) => {
                                    if (!value || Number(value) === 0) {
                                        return Promise.reject(new Error("变动数量不能为 0"));
                                    }
                                    if (!Number.isInteger(Number(value))) {
                                        return Promise.reject(new Error("变动数量必须为整数"));
                                    }
                                    return Promise.resolve();
                                },
                            },
                        ]}
                    >
                        <InputNumber style={{ width: "100%" }} step={10} placeholder="例如 100 或 -50" />
                    </Form.Item>
                    <Form.Item
                        label="调账原因"
                        name="reason"
                        rules={[
                            { required: true, message: "请填写调账原因" },
                            { min: 2, message: "调账原因至少 2 个字" },
                        ]}
                    >
                        <Input.TextArea rows={3} placeholder="例如：活动补偿" maxLength={200} showCount />
                    </Form.Item>
                </Form>
            </Modal>

            {/* 手工充值 */}
            <Modal
                title={rechargeTarget ? `手工充值 · ${rechargeTarget.email}` : "手工充值"}
                open={Boolean(rechargeTarget)}
                forceRender
                onCancel={() => setRechargeTarget(null)}
                footer={
                    <Space>
                        <Button onClick={() => setRechargeTarget(null)}>取消</Button>
                        <Button type="primary" loading={submitting} onClick={() => void submitRecharge()}>
                            确认充值
                        </Button>
                    </Space>
                }
            >
                <Form<RechargeFormValues> form={rechargeForm} layout="vertical">
                    <Form.Item
                        label="充值积分"
                        name="amount"
                        rules={[
                            { required: true, message: "请输入充值积分" },
                            {
                                validator: async (_rule, value: number) => {
                                    if (!value || Number(value) <= 0) {
                                        return Promise.reject(new Error("充值积分必须大于 0"));
                                    }
                                    if (!Number.isInteger(Number(value))) {
                                        return Promise.reject(new Error("充值积分必须为整数"));
                                    }
                                    return Promise.resolve();
                                },
                            },
                        ]}
                    >
                        <InputNumber style={{ width: "100%" }} min={1} step={100} placeholder="请输入充值积分" />
                    </Form.Item>
                    <Form.Item label="备注" name="remark">
                        <Input.TextArea rows={3} placeholder="例如：线下转账补充" maxLength={200} showCount />
                    </Form.Item>
                </Form>
            </Modal>

            {/* 开通套餐 */}
            <Modal
                title={planTarget ? `开通套餐 · ${planTarget.email}` : "开通套餐"}
                open={Boolean(planTarget)}
                forceRender
                onCancel={() => setPlanTarget(null)}
                footer={
                    <Space>
                        <Button onClick={() => setPlanTarget(null)}>取消</Button>
                        <Button type="primary" loading={submitting} onClick={() => void submitPlan()}>
                            确认开通
                        </Button>
                    </Space>
                }
            >
                <Form<PlanFormValues> form={planForm} layout="vertical">
                    <Form.Item
                        label="选择套餐"
                        name="planId"
                        rules={[{ required: true, message: "请选择套餐" }]}
                    >
                        <Select options={planOptions} placeholder="请选择要开通的套餐" showSearch optionFilterProp="label" />
                    </Form.Item>
                    <Form.Item label="原因（可选）" name="reason">
                        <Input.TextArea rows={2} placeholder="例如：客服补偿" maxLength={200} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* 用户详情 */}
            <Drawer
                title={detailTarget ? `用户详情 · ${detailTarget.email}` : "用户详情"}
                size={780}
                open={Boolean(detailTarget)}
                onClose={() => setDetailTarget(null)}
            >
                <Spin spinning={detailLoading}>
                    {detailUser ? (
                        <>
                            <Descriptions bordered size="small" column={2} style={{ marginBottom: 20 }}>
                                <Descriptions.Item label="用户 ID">{detailUser.id}</Descriptions.Item>
                                <Descriptions.Item label="状态">
                                    <StatusTag meta={USER_STATUS_META[detailUser.status]} fallback={detailUser.status} />
                                </Descriptions.Item>
                                <Descriptions.Item label="邮箱">{detailUser.email}</Descriptions.Item>
                                <Descriptions.Item label="昵称">{detailUser.displayName || "-"}</Descriptions.Item>
                                <Descriptions.Item label="可用积分">
                                    <span className="credits-value">{formatCredits(detailUser.available)}</span>
                                </Descriptions.Item>
                                <Descriptions.Item label="冻结积分">
                                    <span className="credits-value">{formatCredits(detailUser.frozen)}</span>
                                </Descriptions.Item>
                                <Descriptions.Item label="累计消耗">
                                    <span className="credits-value">{formatCredits(detailUser.totalConsumed)}</span>
                                </Descriptions.Item>
                                <Descriptions.Item label="任务数">{formatCredits(detailUser.taskCount)}</Descriptions.Item>
                                <Descriptions.Item label="注册时间">{formatDateTime(detailUser.createdAt)}</Descriptions.Item>
                                <Descriptions.Item label="最近登录">{formatDateTime(detailUser.lastLoginAt)}</Descriptions.Item>
                            </Descriptions>

                            <Typography.Title level={5} style={{ marginTop: 0 }}>
                                积分流水
                            </Typography.Title>
                            {detailTransactionTable}
                        </>
                    ) : (
                        <div style={{ padding: 40, textAlign: "center" }} className="muted">
                            暂无用户信息
                        </div>
                    )}
                </Spin>
            </Drawer>
        </>
    );
}
