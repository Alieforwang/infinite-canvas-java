import { useCallback, useEffect, useState } from "react";
import {
    Alert,
    Button,
    Card,
    Col,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Row,
    Select,
    Space,
    Table,
    Tag,
    Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import { Download, Plus, RefreshCw, Search, TicketX } from "lucide-react";

import { adminApi } from "../api/admin";
import { CopyButton } from "../components/CopyButton";
import { PageHead } from "../components/PageHead";
import { StatusTag } from "../components/StatusTag";
import { useFeedback } from "../lib/feedback";
import { formatCredits, formatDateTime, REDEEM_STATUS_META } from "../lib/format";
import type { PageResult, Plan, RedeemCode, RedeemGenerateResult } from "../types";

interface GenerateFormValues {
    count: number;
    credits: number;
    planId?: number;
    prefix?: string;
    validDays: number;
}

interface RedeemQueryState {
    batchNo: string;
    status?: string;
    page: number;
    pageSize: number;
}

const DEFAULT_PAGE_SIZE = 10;

function triggerBlobDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

export function RedeemCodesPage() {
    const { showApiError, showSuccess } = useFeedback();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [data, setData] = useState<PageResult<RedeemCode> | null>(null);
    const [loading, setLoading] = useState(true);
    const [batchNoInput, setBatchNoInput] = useState("");
    const [statusInput, setStatusInput] = useState<string | undefined>(undefined);
    const [query, setQuery] = useState<RedeemQueryState>({ batchNo: "", page: 1, pageSize: DEFAULT_PAGE_SIZE });
    const [generating, setGenerating] = useState(false);
    const [generated, setGenerated] = useState<RedeemGenerateResult | null>(null);
    const [disablingId, setDisablingId] = useState<number | null>(null);
    const [exporting, setExporting] = useState(false);
    const [generateForm] = Form.useForm<GenerateFormValues>();

    useEffect(() => {
        generateForm.setFieldsValue({ count: 10, credits: 1000, validDays: 7, prefix: "" });
    }, [generateForm]);

    useEffect(() => {
        adminApi
            .listPlans()
            .then(setPlans)
            .catch((err: unknown) => showApiError(err));
    }, [showApiError]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await adminApi.listRedeemCodes({
                batchNo: query.batchNo || undefined,
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

    const handleSearch = () => {
        setQuery((prev) => ({ ...prev, batchNo: batchNoInput.trim(), status: statusInput, page: 1 }));
    };

    const handleReset = () => {
        setBatchNoInput("");
        setStatusInput(undefined);
        setQuery((prev) => ({ ...prev, batchNo: "", status: undefined, page: 1 }));
    };

    const handleGenerate = async (values: GenerateFormValues) => {
        setGenerating(true);
        try {
            const result = await adminApi.generateRedeemCodes({
                count: values.count,
                credits: values.credits,
                planId: values.planId ?? null,
                prefix: values.prefix?.trim() ?? "",
                validDays: values.validDays,
            });
            setGenerated(result);
            setBatchNoInput(result.batchNo);
            setStatusInput(undefined);
            setQuery((prev) => ({ ...prev, batchNo: result.batchNo, status: undefined, page: 1 }));
            showSuccess(`已生成 ${result.codes.length} 个兑换码，批次 ${result.batchNo}`);
        } catch (err) {
            showApiError(err);
        } finally {
            setGenerating(false);
        }
    };

    const handleDisable = async (record: RedeemCode) => {
        setDisablingId(record.id);
        try {
            await adminApi.disableRedeemCode(record.id);
            showSuccess("兑换码已作废");
            await load();
        } catch (err) {
            showApiError(err);
        } finally {
            setDisablingId(null);
        }
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const blob = await adminApi.exportRedeemCodes(query.batchNo || undefined);
            triggerBlobDownload(blob, `redeem-codes-${query.batchNo || "all"}.csv`);
            showSuccess("CSV 已开始下载");
        } catch (err) {
            showApiError(err);
        } finally {
            setExporting(false);
        }
    };

    const columns: TableColumnsType<RedeemCode> = [
        { title: "ID", dataIndex: "id", width: 64 },
        {
            title: "兑换码（掩码）",
            dataIndex: "codeMask",
            width: 170,
            render: (value: string) => <span className="mono">{value}</span>,
        },
        {
            title: "批次号",
            dataIndex: "batchNo",
            width: 180,
            render: (value: string) => <span className="mono">{value}</span>,
        },
        {
            title: "积分",
            dataIndex: "credits",
            width: 100,
            align: "right",
            render: (value: number) => <span className="credits-value">{formatCredits(value)}</span>,
        },
        {
            title: "状态",
            dataIndex: "status",
            width: 100,
            render: (value: string) => <StatusTag meta={REDEEM_STATUS_META[value]} fallback={value} />,
        },
        {
            title: "使用者",
            dataIndex: "usedByEmail",
            width: 220,
            render: (value: string | null, record: RedeemCode) => (
                <div>
                    <div>{value || <span className="muted">-</span>}</div>
                    {record.usedAt ? (
                        <div className="mono muted" style={{ fontSize: 11 }}>
                            {formatDateTime(record.usedAt)}
                        </div>
                    ) : null}
                </div>
            ),
        },
        {
            title: "过期时间",
            dataIndex: "expiresAt",
            width: 170,
            render: (value: string | null) =>
                value ? <span className="mono">{formatDateTime(value)}</span> : <span className="muted">不过期</span>,
        },
        {
            title: "创建时间",
            dataIndex: "createdAt",
            width: 170,
            render: (value: string) => <span className="mono">{formatDateTime(value)}</span>,
        },
        {
            title: "操作",
            key: "actions",
            width: 110,
            fixed: "right",
            render: (_: unknown, record: RedeemCode) => (
                <Popconfirm
                    title="作废兑换码"
                    description="作废后该兑换码不可再使用，确认继续？"
                    okText="确认作废"
                    okButtonProps={{ danger: true, loading: disablingId === record.id }}
                    cancelText="取消"
                    disabled={record.status !== "UNUSED"}
                    onConfirm={() => void handleDisable(record)}
                >
                    <Button type="link" size="small" danger icon={<TicketX size={14} />} disabled={record.status !== "UNUSED"}>
                        作废
                    </Button>
                </Popconfirm>
            ),
        },
    ];

    const planOptions = plans.map((plan) => ({
        value: plan.id,
        label: `${plan.name}（${formatCredits(plan.credits + plan.bonusCredits)} 积分${plan.enabled === 1 ? "" : "，已下架"}）`,
    }));

    return (
        <>
            <PageHead
                title="兑换码"
                description="批量生成兑换码，明文仅展示一次；支持按批次/状态筛选、作废与 CSV 导出。"
                extra={
                    <Button icon={<RefreshCw size={15} />} onClick={() => void load()} loading={loading}>
                        刷新
                    </Button>
                }
            />

            <Card title="生成兑换码" style={{ marginBottom: 16 }}>
                <Form<GenerateFormValues> form={generateForm} layout="vertical" onFinish={handleGenerate}>
                    <Row gutter={16}>
                        <Col xs={24} sm={12} lg={4}>
                            <Form.Item
                                label="生成数量"
                                name="count"
                                rules={[
                                    { required: true, message: "请输入生成数量" },
                                    {
                                        validator: async (_rule, value: number) => {
                                            if (value < 1 || value > 1000) {
                                                return Promise.reject(new Error("数量需在 1–1000 之间"));
                                            }
                                            return Promise.resolve();
                                        },
                                    },
                                ]}
                            >
                                <InputNumber min={1} max={1000} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} lg={4}>
                            <Form.Item
                                label="每码积分"
                                name="credits"
                                rules={[
                                    { required: true, message: "请输入积分" },
                                    {
                                        validator: async (_rule, value: number) => {
                                            if (!value || value <= 0) {
                                                return Promise.reject(new Error("积分必须大于 0"));
                                            }
                                            return Promise.resolve();
                                        },
                                    },
                                ]}
                            >
                                <InputNumber min={1} step={100} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} lg={5}>
                            <Form.Item label="关联套餐（可选）" name="planId">
                                <Select allowClear options={planOptions} placeholder="不关联套餐" showSearch optionFilterProp="label" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} lg={4}>
                            <Form.Item label="前缀（可选）" name="prefix">
                                <Input placeholder="例如 WELCOME" maxLength={16} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} lg={3}>
                            <Form.Item label="有效天数" name="validDays" rules={[{ required: true, message: "请输入有效天数" }]}>
                                <InputNumber min={0} step={1} style={{ width: "100%" }} placeholder="0 不过期" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} lg={4}>
                            <Form.Item label=" ">
                                <Button type="primary" htmlType="submit" icon={<Plus size={15} />} loading={generating} block>
                                    生成兑换码
                                </Button>
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Card>

            <div className="toolbar">
                <div className="toolbar__filters">
                    <Input
                        allowClear
                        style={{ width: 240 }}
                        placeholder="按批次号精确筛选"
                        prefix={<Search size={15} className="muted" />}
                        value={batchNoInput}
                        onChange={(event) => setBatchNoInput(event.target.value)}
                        onPressEnter={handleSearch}
                    />
                    <Select
                        allowClear
                        style={{ width: 150 }}
                        placeholder="兑换码状态"
                        value={statusInput}
                        onChange={(value: string | undefined) => setStatusInput(value)}
                        options={[
                            { value: "UNUSED", label: "未使用" },
                            { value: "USED", label: "已使用" },
                            { value: "DISABLED", label: "已作废" },
                            { value: "EXPIRED", label: "已过期" },
                        ]}
                    />
                    <Button type="primary" onClick={handleSearch}>
                        查询
                    </Button>
                    <Button onClick={handleReset}>重置</Button>
                </div>
                <div className="toolbar__actions">
                    <Typography.Text type="secondary">共 {formatCredits(data?.total ?? 0)} 个兑换码</Typography.Text>
                    <Button icon={<Download size={15} />} loading={exporting} onClick={() => void handleExport()}>
                        导出 CSV
                    </Button>
                </div>
            </div>

            <Table<RedeemCode>
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={data?.items ?? []}
                scroll={{ x: 1400 }}
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

            <Modal
                title="兑换码生成成功"
                width={680}
                open={Boolean(generated)}
                onCancel={() => setGenerated(null)}
                footer={
                    <Space>
                        <CopyButton
                            text={generated?.codes.join("\n") ?? ""}
                            label="复制全部明文"
                            size="middle"
                        />
                        <Button
                            icon={<Download size={15} />}
                            onClick={async () => {
                                if (!generated) {
                                    return;
                                }
                                setExporting(true);
                                try {
                                    const blob = await adminApi.exportRedeemCodes(generated.batchNo);
                                    triggerBlobDownload(blob, `redeem-codes-${generated.batchNo}.csv`);
                                    showSuccess("CSV 已开始下载");
                                } catch (err) {
                                    showApiError(err);
                                } finally {
                                    setExporting(false);
                                }
                            }}
                            loading={exporting}
                        >
                            导出本批次 CSV
                        </Button>
                        <Button type="primary" onClick={() => setGenerated(null)}>
                            我已保存，关闭
                        </Button>
                    </Space>
                }
            >
                {generated ? (
                    <>
                        <Alert
                            type="warning"
                            showIcon
                            message="明文兑换码仅本次展示，关闭后不可再次查看，请立即复制保存。"
                            style={{ marginBottom: 16 }}
                        />
                        <div style={{ marginBottom: 12 }}>
                            <Space>
                                <span>
                                    批次号：<span className="mono">{generated.batchNo}</span>
                                </span>
                                <CopyButton text={generated.batchNo} label="复制批次号" />
                                <Tag color="blue">共 {generated.codes.length} 个</Tag>
                            </Space>
                        </div>
                        <pre className="code-list">{generated.codes.join("\n")}</pre>
                    </>
                ) : null}
            </Modal>
        </>
    );
}
