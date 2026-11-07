import { useCallback, useEffect, useRef, useState } from "react";
import { App, Button, Card, Descriptions, Form, Input, Modal, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeft, CheckCircle2, KeyRound, Sparkles, Ticket, Wallet } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { getAccount, listPlans, listTransactions, redeem, type AccountView, type PlanView, type TransactionView } from "@/api/account";
import { changePassword, updateProfile } from "@/api/auth";
import { useAuthStore } from "@/stores/use-auth-store";
import { useCurrency, usePublicSettingsStore } from "@/stores/use-public-settings-store";

const BIZ_LABEL: Record<string, string> = {
    HOLD: "预扣",
    SETTLE: "消费",
    REFUND: "退款",
    RECHARGE: "充值",
    GIFT: "注册赠送",
    REDEEM: "兑换",
    PLAN_GRANT: "套餐",
    ADJUST: "管理员调整",
    SETTLE_ADJUST: "补差",
};

export default function AccountPage() {
    const { message } = App.useApp();
    const { formatCredits, formatYuan, currencyText } = useCurrency();
    const user = useAuthStore((state) => state.user);
    const loadMe = useAuthStore((state) => state.loadMe);
    const available = useAuthStore((state) => state.credits.available);
    const frozen = useAuthStore((state) => state.credits.frozen);
    const totalConsumed = useAuthStore((state) => state.credits.totalConsumed);
    const [searchParams] = useSearchParams();
    const requestedReturn = searchParams.get("returnTo");
    const returnTo = requestedReturn && /^\/(?:video|canvas)(?:[/?#]|$)/.test(requestedReturn) && !requestedReturn.includes("\\") ? requestedReturn : "/video";
    const accountRequest = useRef(0);
    const transactionRequest = useRef(0);
    const [account, setAccount] = useState<AccountView | null>(null);
    const [plans, setPlans] = useState<PlanView[]>([]);
    const [transactions, setTransactions] = useState<TransactionView[]>([]);
    const [txPage, setTxPage] = useState(1);
    const [txTotal, setTxTotal] = useState(0);
    const [redeemCode, setRedeemCode] = useState("");
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [passwordForm] = Form.useForm();
    const [profileForm] = Form.useForm();

    const loadAccount = useCallback(async () => {
        const request = ++accountRequest.current;
        try {
            const data = await getAccount();
            if (request === accountRequest.current) {
                usePublicSettingsStore.getState().applyAccountRate(data.exchangePerYuan);
                setAccount(data);
            }
        } catch (error) {
            if (request === accountRequest.current) message.error(error instanceof Error ? error.message : "账户加载失败");
        }
    }, [message]);

    const loadTransactions = useCallback(async (page = 1) => {
        const request = ++transactionRequest.current;
        try {
            const result = await listTransactions(page, 10);
            if (request !== transactionRequest.current) return;
            setTransactions(result.items);
            setTxTotal(result.total);
        } catch (error) {
            if (request === transactionRequest.current) message.error(error instanceof Error ? error.message : "流水加载失败");
        }
    }, [message]);

    useEffect(() => {
        // Refresh local data on numeric credit changes without writing back to the auth store.
        void loadAccount();
        void loadTransactions(txPage);
        return () => {
            ++accountRequest.current;
            ++transactionRequest.current;
        };
    }, [user?.id, available, frozen, totalConsumed, txPage, loadAccount, loadTransactions]);

    useEffect(() => {
        void (async () => {
            try {
                setPlans(await listPlans());
            } catch {
                // plans are optional for rendering
            }
        })();
    }, []);

    const onRedeem = async () => {
        if (!redeemCode.trim()) {
            message.warning("请输入兑换码");
            return;
        }
        try {
            const result = await redeem(redeemCode.trim());
            message.success(`兑换成功：${formatCredits(result.credits, { signed: true })}${result.planName ? `（${currencyText(result.planName)}）` : ""}`);
            setRedeemCode("");
            setTxPage(1);
            await loadMe();
            await Promise.all([loadAccount(), loadTransactions(1)]);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "兑换失败");
        }
    };

    const columns: ColumnsType<TransactionView> = [
        {
            title: "类型",
            dataIndex: "bizType",
            render: (value: string) => <Tag>{BIZ_LABEL[value] ?? value}</Tag>,
        },
        {
            title: "变动（元）",
            dataIndex: "amount",
            render: (value: number) => (
                <span className={value >= 0 ? "text-emerald-600" : "text-rose-600"}>
                    {formatCredits(value, { signed: true })}
                </span>
            ),
        },
        { title: "余额（元）", dataIndex: "balanceAfter", render: (value: number) => formatCredits(value) },
        { title: "关联任务", dataIndex: "taskNo", render: (value: string) => value ? <Link className="underline" to={`/video?task=${encodeURIComponent(value)}`}>{value}</Link> : "-" },
        { title: "备注", dataIndex: "remark", render: (value: string) => currencyText(value) || "-" },
        { title: "时间", dataIndex: "createdAt", render: (value: string) => value?.replace("T", " ").slice(0, 19) || "-" },
    ];

    const submitPassword = async () => {
        const values = await passwordForm.validateFields();
        try {
            await changePassword(values.oldPassword, values.newPassword);
            message.success("密码已修改，请重新登录");
            setPasswordOpen(false);
            passwordForm.resetFields();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "修改失败");
        }
    };

    const submitProfile = async () => {
        const values = await profileForm.validateFields();
        try {
            await updateProfile(values.displayName);
            message.success("昵称已更新");
            setProfileOpen(false);
            await loadMe();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "更新失败");
        }
    };

    return (
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5 dark:border-stone-800">
                <div>
                    <p className="text-xs text-stone-500">账户中心</p>
                    <h1 className="mt-2 text-2xl font-semibold text-stone-950 dark:text-stone-100">我的账户</h1>
                    <p className="mt-1 text-sm text-stone-500">
                        {user?.email}
                        <button type="button" className="ml-2 text-xs text-stone-400 underline" onClick={() => { profileForm.setFieldsValue({ displayName: user?.displayName }); setProfileOpen(true); }}>
                            修改昵称
                        </button>
                    </p>
                </div>
                <div className="flex gap-2">
                    <Link to={returnTo}>
                        <Button icon={<ArrowLeft className="size-4" />}>返回创作</Button>
                    </Link>
                    <Button icon={<KeyRound className="size-4" />} onClick={() => setPasswordOpen(true)}>
                        修改密码
                    </Button>
                </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                    { label: "可用余额", value: account ? formatCredits(account.available) : "—", icon: <Wallet className="size-4" />, tone: "text-stone-900 dark:text-stone-100" },
                    { label: "冻结金额", value: account ? formatCredits(account.frozen) : "—", icon: <Sparkles className="size-4" />, tone: "text-amber-600" },
                    { label: "累计消费", value: account ? formatCredits(account.totalConsumed) : "—", icon: <CheckCircle2 className="size-4" />, tone: "text-rose-600" },
                    { label: "进行中任务", value: `${account?.running ?? 0}/${account?.concurrencyLimit ?? 2}`, icon: <Ticket className="size-4" />, tone: "text-sky-600" },
                ].map((item) => (
                    <Card key={item.label} className="!rounded-xl">
                        <div className="flex items-center justify-between text-xs text-stone-500">
                            <span>{item.label}</span>
                            {item.icon}
                        </div>
                        <p className={`mt-2 text-3xl font-semibold ${item.tone}`}>{item.value}</p>
                    </Card>
                ))}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <Card title="资金流水（人民币）" className="!rounded-xl">
                    <Table<TransactionView>
                        rowKey="id"
                        size="small"
                        columns={columns}
                        dataSource={transactions}
                        pagination={{
                            current: txPage,
                            pageSize: 10,
                            total: txTotal,
                            showSizeChanger: false,
                            onChange: setTxPage,
                        }}
                        scroll={{ x: 640 }}
                    />
                </Card>

                <div className="space-y-4">
                    <Card title="兑换码" className="!rounded-xl">
                        <Input
                            value={redeemCode}
                            onChange={(event) => setRedeemCode(event.target.value)}
                            placeholder="输入兑换码"
                            onPressEnter={() => void onRedeem()}
                        />
                        <Button type="primary" block className="mt-3" onClick={() => void onRedeem()}>
                            立即兑换
                        </Button>
                    </Card>

                    <Card title="套餐与充值" className="!rounded-xl">
                        {account?.currentPlan ? (
                            <Descriptions size="small" column={1} className="mb-3">
                                <Descriptions.Item label="当前套餐">{currencyText(account.currentPlan.name)}</Descriptions.Item>
                                <Descriptions.Item label="到期时间">{account.currentPlan.expiresAt?.slice(0, 10) ?? "永久"}</Descriptions.Item>
                                <Descriptions.Item label="套餐额度">
                                    已用 {formatCredits(account.currentPlan.creditsUsed ?? 0)} / 总额 {formatCredits(account.currentPlan.creditsTotal ?? 0)}
                                </Descriptions.Item>
                            </Descriptions>
                        ) : null}
                        <div className="space-y-2">
                            {plans.map((plan) => (
                                <div key={plan.id} className="rounded-lg border border-stone-200 p-3 text-sm dark:border-stone-800">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-stone-800 dark:text-stone-100">{currencyText(plan.name)}</span>
                                        <span className="text-xs text-stone-400">{formatYuan(plan.priceAmount)}</span>
                                    </div>
                                    <p className="mt-1 text-xs text-stone-500">
                                        到账余额 {formatCredits(plan.credits)}
                                        {plan.validDays > 0 ? ` · ${plan.validDays} 天有效` : " · 永久有效"}
                                    </p>
                                </div>
                            ))}
                            {plans.length === 0 ? <p className="text-xs text-stone-400">暂无上架套餐，请联系管理员</p> : null}
                        </div>
                        <p className="mt-3 text-xs text-stone-400">在线支付暂未开放（P1）：请联系管理员充值或使用兑换码。</p>
                    </Card>
                </div>
            </div>

            <Modal open={passwordOpen} title="修改密码" onCancel={() => setPasswordOpen(false)} onOk={() => void submitPassword()} okText="保存">
                <Form form={passwordForm} layout="vertical" className="pt-2">
                    <Form.Item name="oldPassword" label="旧密码" rules={[{ required: true, message: "请输入旧密码" }]}>
                        <Input.Password />
                    </Form.Item>
                    <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 8, max: 32, message: "8–32 位，含字母和数字" }]}>
                        <Input.Password />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal open={profileOpen} title="修改昵称" onCancel={() => setProfileOpen(false)} onOk={() => void submitProfile()} okText="保存">
                <Form form={profileForm} layout="vertical" className="pt-2">
                    <Form.Item name="displayName" label="昵称" rules={[{ required: true, message: "请输入昵称" }]}>
                        <Input maxLength={64} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
