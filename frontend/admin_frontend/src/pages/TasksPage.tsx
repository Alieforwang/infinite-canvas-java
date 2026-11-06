import { useCallback, useEffect, useState } from "react";
import {
    Alert,
    Button,
    Descriptions,
    Divider,
    Drawer,
    Form,
    Input,
    Modal,
    Popconfirm,
    Progress,
    Select,
    Space,
    Table,
    Tag,
    Timeline,
    Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import { Ban, Eye, RefreshCw, RotateCcw, Search, Undo2 } from "lucide-react";

import { adminApi } from "../api/admin";
import { JsonBlock } from "../components/JsonBlock";
import { PageHead } from "../components/PageHead";
import { StatusTag } from "../components/StatusTag";
import { useFeedback } from "../lib/feedback";
import {
    durationSeconds,
    formatBytes,
    formatCredits,
    formatDateTime,
    formatDuration,
    taskStatusMeta,
} from "../lib/format";
import type {
    AdminTaskDetail,
    AdminTaskRow,
    PageResult,
    TaskTransaction,
    TaskUpstreamCall,
    VideoTask,
} from "../types";

interface TaskQueryState {
    status?: string;
    taskNo: string;
    page: number;
    pageSize: number;
}

interface RefundFormValues {
    reason: string;
}

const DEFAULT_PAGE_SIZE = 10;
const ACTIVE_STATUSES = ["queued", "running", "creating"];
const RETRYABLE_STATUSES = ["failed", "cancelled", "expired"];

function canCancel(status: string): boolean {
    return ACTIVE_STATUSES.includes(status);
}

function canRetry(status: string): boolean {
    return RETRYABLE_STATUSES.includes(status);
}

function canRefund(status: string): boolean {
    return RETRYABLE_STATUSES.includes(status);
}

function statusProgressStatus(status: string, progress: number): "success" | "exception" | "active" | "normal" {
    if (status === "succeeded" || progress >= 100) {
        return "success";
    }
    if (status === "failed" || status === "expired") {
        return "exception";
    }
    if (status === "cancelled") {
        return "normal";
    }
    return "active";
}

export function TasksPage() {
    const { showApiError, showSuccess } = useFeedback();
    const [data, setData] = useState<PageResult<AdminTaskRow> | null>(null);
    const [loading, setLoading] = useState(true);
    const [statusInput, setStatusInput] = useState<string | undefined>(undefined);
    const [taskNoInput, setTaskNoInput] = useState("");
    const [query, setQuery] = useState<TaskQueryState>({ taskNo: "", page: 1, pageSize: DEFAULT_PAGE_SIZE });
    const [actionTaskNo, setActionTaskNo] = useState<string | null>(null);

    const [detailTarget, setDetailTarget] = useState<AdminTaskRow | null>(null);
    const [detail, setDetail] = useState<AdminTaskDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const [refundTarget, setRefundTarget] = useState<AdminTaskRow | null>(null);
    const [refunding, setRefunding] = useState(false);
    const [refundForm] = Form.useForm<RefundFormValues>();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await adminApi.listTasks({
                status: query.status || undefined,
                taskNo: query.taskNo || undefined,
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

    const loadDetail = async (taskNo: string) => {
        setDetailLoading(true);
        try {
            const result = await adminApi.getTask(taskNo);
            setDetail(result);
        } catch (err) {
            showApiError(err);
        } finally {
            setDetailLoading(false);
        }
    };

    const openDetail = (record: AdminTaskRow) => {
        setDetailTarget(record);
        setDetail(null);
        void loadDetail(record.task.taskNo);
    };

    const handleSearch = () => {
        setQuery((prev) => ({ ...prev, taskNo: taskNoInput.trim(), status: statusInput, page: 1 }));
    };

    const handleReset = () => {
        setTaskNoInput("");
        setStatusInput(undefined);
        setQuery((prev) => ({ ...prev, taskNo: "", status: undefined, page: 1 }));
    };

    const handleRetry = (record: AdminTaskRow) => {
        const { task } = record;
        Modal.confirm({
            title: "确认重试该任务？",
            content: (
                <div>
                    <p>
                        重试会以相同参数<strong>新建一个任务</strong>，并重新冻结 / 扣除积分（预计{" "}
                        <strong>{formatCredits(task.heldCredits)}</strong> 积分），原任务记录保留。
                    </p>
                    <p className="muted" style={{ marginBottom: 0 }}>
                        任务号：<span className="mono">{task.taskNo}</span>
                    </p>
                </div>
            ),
            okText: "确认重试",
            cancelText: "取消",
            onOk: async () => {
                try {
                    const result = await adminApi.retryTask(task.taskNo);
                    Modal.success({
                        title: "重试任务已创建",
                        content: (
                            <div>
                                新任务号：<span className="mono">{result.taskNo}</span>
                            </div>
                        ),
                        okText: "知道了",
                    });
                    await load();
                } catch (err) {
                    showApiError(err);
                }
            },
        });
    };

    const handleCancel = async (record: AdminTaskRow) => {
        setActionTaskNo(record.task.taskNo);
        try {
            await adminApi.cancelTask(record.task.taskNo);
            showSuccess("任务已取消，冻结积分将自动退还");
            await load();
            if (detailTarget?.task.taskNo === record.task.taskNo) {
                await loadDetail(record.task.taskNo);
            }
        } catch (err) {
            showApiError(err);
        } finally {
            setActionTaskNo(null);
        }
    };

    const openRefund = (record: AdminTaskRow) => {
        refundForm.resetFields();
        refundForm.setFieldsValue({ reason: "管理员手工退款" });
        setRefundTarget(record);
    };

    const submitRefund = async () => {
        if (!refundTarget) {
            return;
        }
        let values: RefundFormValues;
        try {
            values = await refundForm.validateFields();
        } catch {
            return;
        }
        setRefunding(true);
        try {
            await adminApi.refundTask(refundTarget.task.taskNo, values.reason.trim());
            showSuccess("退款成功，冻结积分已退回用户");
            const taskNo = refundTarget.task.taskNo;
            setRefundTarget(null);
            await load();
            if (detailTarget?.task.taskNo === taskNo) {
                await loadDetail(taskNo);
            }
        } catch (err) {
            showApiError(err);
        } finally {
            setRefunding(false);
        }
    };

    const columns: TableColumnsType<AdminTaskRow> = [
        {
            title: "任务号",
            key: "taskNo",
            width: 250,
            render: (_: unknown, record: AdminTaskRow) => (
                <Button type="link" size="small" style={{ padding: 0 }} onClick={() => openDetail(record)}>
                    <span className="mono">{record.task.taskNo}</span>
                </Button>
            ),
        },
        { title: "用户邮箱", dataIndex: "userEmail", width: 210, render: (value: string) => value || "-" },
        {
            title: "模型 / 渠道",
            key: "model",
            width: 180,
            render: (_: unknown, record: AdminTaskRow) => (
                <div>
                    <div>{record.task.modelName || "-"}</div>
                    <div className="muted" style={{ fontSize: 11 }}>
                        {record.task.channelName || "-"}
                    </div>
                </div>
            ),
        },
        {
            title: "状态",
            key: "status",
            width: 100,
            render: (_: unknown, record: AdminTaskRow) => <StatusTag meta={taskStatusMeta(record.task.status)} />,
        },
        {
            title: "积分（冻结 / 结算）",
            key: "credits",
            width: 150,
            render: (_: unknown, record: AdminTaskRow) => (
                <div>
                    <div className="credits-value">冻结 {formatCredits(record.task.heldCredits)}</div>
                    <div className="muted" style={{ fontSize: 11 }}>
                        结算 {formatCredits(record.task.settledCredits)}
                    </div>
                </div>
            ),
        },
        {
            title: "进度",
            dataIndex: ["task", "progress"],
            width: 140,
            render: (_: unknown, record: AdminTaskRow) => (
                <Progress
                    percent={record.task.progress ?? 0}
                    size="small"
                    status={statusProgressStatus(record.task.status, record.task.progress ?? 0)}
                />
            ),
        },
        {
            title: "耗时",
            key: "duration",
            width: 110,
            render: (_: unknown, record: AdminTaskRow) => (
                <span className="mono">{formatDuration(record.task.createdAt, record.task.finishedAt)}</span>
            ),
        },
        {
            title: "创建时间",
            dataIndex: ["task", "createdAt"],
            width: 170,
            render: (value: string) => <span className="mono">{formatDateTime(value)}</span>,
        },
        {
            title: "操作",
            key: "actions",
            width: 300,
            fixed: "right",
            render: (_: unknown, record: AdminTaskRow) => {
                const status = record.task.status;
                return (
                    <Space size={0} wrap>
                        <Button type="link" size="small" icon={<Eye size={14} />} onClick={() => openDetail(record)}>
                            详情
                        </Button>
                        {canRetry(status) ? (
                            <Button type="link" size="small" icon={<RotateCcw size={14} />} onClick={() => handleRetry(record)}>
                                重试
                            </Button>
                        ) : null}
                        {canCancel(status) ? (
                            <Popconfirm
                                title="取消任务"
                                description="取消后任务终止，冻结积分将自动退还，确认继续？"
                                okText="确认取消"
                                okButtonProps={{ danger: true, loading: actionTaskNo === record.task.taskNo }}
                                cancelText="再想想"
                                onConfirm={() => void handleCancel(record)}
                            >
                                <Button type="link" size="small" danger icon={<Ban size={14} />}>
                                    取消
                                </Button>
                            </Popconfirm>
                        ) : null}
                        {canRefund(status) ? (
                            <Button type="link" size="small" icon={<Undo2 size={14} />} onClick={() => openRefund(record)}>
                                退款
                            </Button>
                        ) : null}
                    </Space>
                );
            },
        },
    ];

    const eventTimelineItems = (detail?.events ?? []).map((event, index) => {
        const target = (event.to ?? "").toLowerCase();
        const color = target === "failed" || target === "expired" ? "red" : target === "succeeded" ? "green" : "blue";
        return {
            key: `${index}-${event.at ?? ""}`,
            color,
            content: (
                <div>
                    <Space size={8} wrap>
                        <Typography.Text strong>
                            {event.from || "-"} → {event.to || "-"}
                        </Typography.Text>
                        {event.source ? <Tag>{event.source}</Tag> : null}
                        <span className="mono muted" style={{ fontSize: 11 }}>
                            {formatDateTime(event.at)}
                        </span>
                    </Space>
                    {event.detail ? (
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                            {event.detail}
                        </div>
                    ) : null}
                </div>
            ),
        };
    });

    const upstreamColumns: TableColumnsType<TaskUpstreamCall> = [
        { title: "动作", dataIndex: "action", width: 110, render: (value: string | null) => value || "-" },
        { title: "HTTP", dataIndex: "httpStatus", width: 80, render: (value: number | null) => value ?? "-" },
        { title: "耗时(ms)", dataIndex: "latencyMs", width: 100, align: "right", render: (value: number | null) => value ?? "-" },
        { title: "错误码", dataIndex: "errorCode", width: 130, render: (value: string | null) => value || "-" },
        {
            title: "响应片段",
            dataIndex: "snippet",
            ellipsis: true,
            render: (value: string | null) => <span className="mono muted">{value || "-"}</span>,
        },
        {
            title: "时间",
            dataIndex: "at",
            width: 170,
            render: (value: string | null) => <span className="mono">{formatDateTime(value)}</span>,
        },
    ];

    const transactionColumns: TableColumnsType<TaskTransaction> = [
        { title: "业务类型", dataIndex: "bizType", width: 150, render: (value: string | null) => <Tag>{value || "-"}</Tag> },
        {
            title: "可用变动",
            dataIndex: "availableDelta",
            width: 110,
            align: "right",
            render: (value: number | null) => <span style={{ color: (value ?? 0) >= 0 ? "#059669" : "#dc2626" }}>{formatCredits(value)}</span>,
        },
        {
            title: "冻结变动",
            dataIndex: "frozenDelta",
            width: 110,
            align: "right",
            render: (value: number | null) => <span style={{ color: (value ?? 0) >= 0 ? "#059669" : "#dc2626" }}>{formatCredits(value)}</span>,
        },
        { title: "备注", dataIndex: "remark", ellipsis: true, render: (value: string | null) => value || "-" },
        {
            title: "时间",
            dataIndex: "at",
            width: 170,
            render: (value: string | null) => <span className="mono">{formatDateTime(value)}</span>,
        },
    ];

    const currentTask: VideoTask | null = detail?.task ?? detailTarget?.task ?? null;
    const detailBody = detail;

    return (
        <>
            <PageHead
                title="任务管理"
                description="查看视频生成任务、事件时间线与上游调用记录，支持重试、取消和手工退款。"
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
                        placeholder="按任务号搜索"
                        prefix={<Search size={15} className="muted" />}
                        value={taskNoInput}
                        onChange={(event) => setTaskNoInput(event.target.value)}
                        onPressEnter={handleSearch}
                    />
                    <Select
                        allowClear
                        style={{ width: 150 }}
                        placeholder="任务状态"
                        value={statusInput}
                        onChange={(value: string | undefined) => setStatusInput(value)}
                        options={[
                            { value: "queued", label: "排队中" },
                            { value: "running", label: "生成中" },
                            { value: "succeeded", label: "成功" },
                            { value: "failed", label: "失败" },
                            { value: "cancelled", label: "已取消" },
                        ]}
                    />
                    <Button type="primary" onClick={handleSearch}>
                        查询
                    </Button>
                    <Button onClick={handleReset}>重置</Button>
                </div>
                <Typography.Text type="secondary">共 {formatCredits(data?.total ?? 0)} 个任务</Typography.Text>
            </div>

            <Table<AdminTaskRow>
                rowKey={(record) => record.task.taskNo}
                loading={loading}
                columns={columns}
                dataSource={data?.items ?? []}
                scroll={{ x: 1600 }}
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

            <Drawer
                title={detailTarget ? `任务详情 · ${detailTarget.task.taskNo}` : "任务详情"}
                size={960}
                open={Boolean(detailTarget)}
                onClose={() => setDetailTarget(null)}
                loading={detailLoading}
            >
                {detailBody && currentTask ? (
                    <>
                        {currentTask.errorMessage || currentTask.errorCode ? (
                            <Alert
                                type="error"
                                showIcon
                                message={`任务失败：${currentTask.errorCode || "未知错误"}`}
                                description={currentTask.errorMessage || "-"}
                                style={{ marginBottom: 16 }}
                            />
                        ) : null}

                        <Descriptions bordered size="small" column={2}>
                            <Descriptions.Item label="任务号">
                                <span className="mono">{currentTask.taskNo}</span>
                            </Descriptions.Item>
                            <Descriptions.Item label="状态">
                                <StatusTag meta={taskStatusMeta(currentTask.status)} />
                            </Descriptions.Item>
                            <Descriptions.Item label="用户">{detailBody.userEmail}</Descriptions.Item>
                            <Descriptions.Item label="用户 ID">{detailBody.userId}</Descriptions.Item>
                            <Descriptions.Item label="模型">{currentTask.modelName || "-"}</Descriptions.Item>
                            <Descriptions.Item label="渠道">{currentTask.channelName || "-"}</Descriptions.Item>
                            <Descriptions.Item label="进度">{currentTask.progress}%</Descriptions.Item>
                            <Descriptions.Item label="耗时">
                                {formatDuration(currentTask.createdAt, currentTask.finishedAt)}
                            </Descriptions.Item>
                            <Descriptions.Item label="冻结积分">
                                <span className="credits-value">{formatCredits(currentTask.heldCredits)}</span>
                            </Descriptions.Item>
                            <Descriptions.Item label="结算积分">
                                <span className="credits-value">{formatCredits(currentTask.settledCredits)}</span>
                            </Descriptions.Item>
                            <Descriptions.Item label="创建时间">{formatDateTime(currentTask.createdAt)}</Descriptions.Item>
                            <Descriptions.Item label="完成时间">{formatDateTime(currentTask.finishedAt)}</Descriptions.Item>
                            <Descriptions.Item label="参考图">
                                {currentTask.referenceFileNos && currentTask.referenceFileNos.length > 0
                                    ? currentTask.referenceFileNos.join(", ")
                                    : "-"}
                            </Descriptions.Item>
                            <Descriptions.Item label="产物文件">
                                {currentTask.file ? (
                                    <Space size={6} wrap>
                                        <span className="mono">{currentTask.file.fileNo}</span>
                                        <Tag>{currentTask.file.contentType}</Tag>
                                        <span className="muted">{formatBytes(currentTask.file.bytes)}</span>
                                        <a href={currentTask.file.url} target="_blank" rel="noreferrer">
                                            下载
                                        </a>
                                    </Space>
                                ) : (
                                    "-"
                                )}
                            </Descriptions.Item>
                        </Descriptions>

                        {currentTask.file && currentTask.file.contentType?.startsWith("video/") ? (
                            <div style={{ marginTop: 16 }}>
                                <video
                                    controls
                                    preload="metadata"
                                    src={currentTask.file.url}
                                    style={{ width: "100%", maxHeight: 340, borderRadius: 8, background: "#000" }}
                                />
                            </div>
                        ) : null}

                        <Divider titlePlacement="start">生成参数</Divider>
                        <Typography.Paragraph style={{ background: "#f8fafc", borderRadius: 8, padding: 12 }}>
                            {currentTask.prompt || "-"}
                        </Typography.Paragraph>
                        <JsonBlock value={currentTask.params ?? {}} />

                        <Divider titlePlacement="start">事件时间线</Divider>
                        {eventTimelineItems.length > 0 ? (
                            <Timeline items={eventTimelineItems} />
                        ) : (
                            <span className="muted">暂无事件</span>
                        )}

                        <Divider titlePlacement="start">上游调用记录</Divider>
                        <Table<TaskUpstreamCall>
                            rowKey={(record, index) => `${record.action ?? "call"}-${index ?? 0}`}
                            size="small"
                            columns={upstreamColumns}
                            dataSource={detailBody.upstreamCalls}
                            pagination={false}
                            scroll={{ x: 780 }}
                            locale={{ emptyText: "暂无上游调用" }}
                        />

                        <Divider titlePlacement="start">资金流水</Divider>
                        <Table<TaskTransaction>
                            rowKey={(record, index) => `${record.bizType ?? "tx"}-${index ?? 0}`}
                            size="small"
                            columns={transactionColumns}
                            dataSource={detailBody.transactions}
                            pagination={false}
                            scroll={{ x: 720 }}
                            locale={{ emptyText: "暂无资金流水" }}
                        />

                        <div className="muted" style={{ marginTop: 12, fontSize: 12 }}>
                            任务执行时长：{durationSeconds(currentTask.createdAt, currentTask.finishedAt) ?? "-"} 秒
                        </div>
                    </>
                ) : (
                    <div style={{ padding: 40, textAlign: "center" }} className="muted">
                        正在加载任务详情…
                    </div>
                )}
            </Drawer>

            <Modal
                title={refundTarget ? `手工退款 · ${refundTarget.task.taskNo}` : "手工退款"}
                open={Boolean(refundTarget)}
                forceRender
                onCancel={() => setRefundTarget(null)}
                footer={
                    <Space>
                        <Button onClick={() => setRefundTarget(null)}>取消</Button>
                        <Button type="primary" danger loading={refunding} onClick={() => void submitRefund()}>
                            确认退款
                        </Button>
                    </Space>
                }
            >
                <Alert
                    type="warning"
                    showIcon
                    message={`将退回冻结积分 ${formatCredits(refundTarget?.task.heldCredits)}，操作不可撤销。`}
                    style={{ marginBottom: 16 }}
                />
                <Form<RefundFormValues> form={refundForm} layout="vertical">
                    <Form.Item
                        label="退款原因"
                        name="reason"
                        rules={[
                            { required: true, message: "请填写退款原因" },
                            { min: 2, message: "退款原因至少 2 个字" },
                        ]}
                    >
                        <Input.TextArea rows={3} maxLength={200} showCount placeholder="例如：上游异常，用户申诉退款" />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
}
