import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Row, Space, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import {
    Activity,
    CircleX,
    Coins,
    Gift,
    ListVideo,
    RefreshCw,
    TrendingUp,
    UserPlus,
    Users,
} from "lucide-react";
import dayjs from "dayjs";

import { adminApi } from "../api/admin";
import { MetricCard } from "../components/MetricCard";
import { PageHead } from "../components/PageHead";
import { formatApiError, useFeedback } from "../lib/feedback";
import { creditsToYuan, formatCredits, formatDateTime, formatPercent, formatYuan } from "../lib/format";
import { useCurrency } from "../lib/currency";
import type { DashboardChannelHealth, DashboardData, DashboardTrendItem } from "../types";

interface TrendRow {
    d: string;
    tasks: number;
    credits: number;
}

function buildSevenDayTrend(trend: DashboardTrendItem[]): TrendRow[] {
    const byDay = new Map<string, DashboardTrendItem>();
    for (const item of trend) {
        const key = item.d.length >= 5 ? item.d.slice(-5) : item.d;
        byDay.set(key, item);
    }
    const rows: TrendRow[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
        const day = dayjs().subtract(offset, "day").format("MM-DD");
        const item = byDay.get(day);
        rows.push({ d: day, tasks: item?.tasks ?? 0, credits: item?.credits ?? 0 });
    }
    return rows;
}

export function DashboardPage() {
    const { showApiError } = useFeedback();
    const { ready, exchangePerYuan } = useCurrency();
    const formatAmount = (value?: number | null) => ready ? formatYuan(creditsToYuan(value, exchangePerYuan)) : "-";
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await adminApi.dashboard();
            setData(result);
        } catch (err) {
            setError(formatApiError(err));
            showApiError(err);
        } finally {
            setLoading(false);
        }
    }, [showApiError]);

    useEffect(() => {
        void load();
    }, [load]);

    const trendRows = useMemo(() => buildSevenDayTrend(data?.trend ?? []), [data?.trend]);
    const maxTasks = useMemo(() => Math.max(1, ...trendRows.map((row) => row.tasks)), [trendRows]);
    const maxCredits = useMemo(() => Math.max(1, ...trendRows.map((row) => row.credits)), [trendRows]);

    const trendColumns: TableColumnsType<TrendRow> = [
        {
            title: "日期",
            dataIndex: "d",
            width: 100,
            render: (value: string) => <span className="mono">{value}</span>,
        },
        {
            title: "任务数",
            dataIndex: "tasks",
            width: 220,
            render: (value: number) => (
                <div className="trend-bar-row">
                    <div className="trend-bar-track">
                        <div className="trend-bar-fill" style={{ width: `${(value / maxTasks) * 100}%` }} />
                    </div>
                    <span className="trend-bar-value">{formatCredits(value)}</span>
                </div>
            ),
        },
        {
            title: "消耗金额",
            dataIndex: "credits",
            width: 260,
            render: (value: number) => (
                <div className="trend-bar-row">
                    <div className="trend-bar-track">
                        <div
                            className="trend-bar-fill trend-bar-fill--credits"
                            style={{ width: `${(value / maxCredits) * 100}%` }}
                        />
                    </div>
                    <span className="trend-bar-value">{formatAmount(value)}</span>
                </div>
            ),
        },
    ];

    const channelColumns: TableColumnsType<DashboardChannelHealth> = [
        { title: "渠道", dataIndex: "name", width: 220, render: (value: string) => <strong>{value}</strong> },
        {
            title: "启用",
            dataIndex: "enabled",
            width: 90,
            render: (value: number) =>
                value === 1 ? <Tag color="success">启用</Tag> : <Tag color="default">停用</Tag>,
        },
        {
            title: "最近测试",
            dataIndex: "lastTestOk",
            width: 110,
            render: (value: boolean | null) => {
                if (value === true) {
                    return <Tag color="success">成功</Tag>;
                }
                if (value === false) {
                    return <Tag color="error">失败</Tag>;
                }
                return <Tag color="default">未测试</Tag>;
            },
        },
        {
            title: "测试消息",
            dataIndex: "lastTestMessage",
            ellipsis: true,
            render: (value: string | null) => <span className="muted">{value || "-"}</span>,
        },
        {
            title: "最近测试时间",
            dataIndex: "lastTestAt",
            width: 180,
            render: (value: string | null) => <span className="mono">{formatDateTime(value)}</span>,
        },
    ];

    return (
        <>
            <PageHead
                title="平台概览"
                description="平台用户、任务、金额与渠道健康度的实时概览。"
                extra={
                    <Button icon={<RefreshCw size={15} />} onClick={() => void load()} loading={loading}>
                        刷新
                    </Button>
                }
            />

            {error ? (
                <Alert
                    type="error"
                    showIcon
                    message="概览数据加载失败"
                    description={error}
                    style={{ marginBottom: 16 }}
                    action={
                        <Button size="small" onClick={() => void load()}>
                            重试
                        </Button>
                    }
                />
            ) : null}

            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={6}>
                    <MetricCard label="用户总数" value={formatCredits(data?.users)} icon={<Users size={15} />} />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <MetricCard label="今日新增用户" value={formatCredits(data?.todayNewUsers)} icon={<UserPlus size={15} />} />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <MetricCard
                        label="任务数（今日 / 总数）"
                        value={formatCredits(data?.tasksToday)}
                        suffix={`/ 总 ${formatCredits(data?.tasksTotal)}`}
                        icon={<ListVideo size={15} />}
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <MetricCard label="进行中任务" value={formatCredits(data?.running)} icon={<Activity size={15} />} />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <MetricCard label="今日失败任务" value={formatCredits(data?.failedToday)} icon={<CircleX size={15} />} />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <MetricCard
                        label="任务成功率"
                        value={formatPercent(data?.successRate)}
                        icon={<TrendingUp size={15} />}
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <MetricCard
                        label="今日消耗金额"
                        value={formatAmount(data?.creditsConsumedToday)}
                        icon={<Coins size={15} />}
                    />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <MetricCard
                        label="今日发放金额"
                        value={formatAmount(data?.creditsGrantedToday)}
                        icon={<Gift size={15} />}
                    />
                </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24} xl={14}>
                    <Card
                        title="近 7 日任务与金额趋势"
                        extra={<span className="muted">数据按天汇总，缺失日期按 0 补齐</span>}
                    >
                        <Table<TrendRow>
                            rowKey="d"
                            size="small"
                            loading={loading}
                            columns={trendColumns}
                            dataSource={trendRows}
                            pagination={false}
                            scroll={{ x: 640 }}
                        />
                    </Card>
                </Col>
                <Col xs={24} xl={10}>
                    <Card title="渠道健康" extra={<span className="muted">最近一次连接测试结果</span>}>
                        <Table<DashboardChannelHealth>
                            rowKey="id"
                            size="small"
                            loading={loading}
                            columns={channelColumns}
                            dataSource={data?.channels ?? []}
                            pagination={false}
                            scroll={{ x: 760 }}
                            locale={{ emptyText: "暂无渠道" }}
                        />
                    </Card>
                </Col>
            </Row>

            <Space style={{ marginTop: 16 }} size={4}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    数据更新时间：{dayjs().format("YYYY-MM-DD HH:mm:ss")}（进入页面或点击刷新时重新拉取）
                </Typography.Text>
            </Space>
        </>
    );
}
