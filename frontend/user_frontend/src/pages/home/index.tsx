import { useEffect, useState } from "react";
import {
    ArrowRight,
    Check,
    CircleDot,
    Clapperboard,
    Cloud,
    Cpu,
    Film,
    Image,
    KeyRound,
    MonitorPlay,
    Network,
    PlayCircle,
    Rocket,
    ShieldCheck,
    Sparkles,
    Wand2,
    X,
    Zap,
} from "lucide-react";
import { Link } from "react-router-dom";

import "@/styles/stitch.css";
import { useAuthStore } from "@/stores/use-auth-store";
import { useCurrency } from "@/stores/use-public-settings-store";

const MODELS = [
    { name: "OpenAI Sora 2.0", icon: Film, tone: "secondary" },
    { name: "Google Veo 3.1", icon: Cloud, tone: "primary" },
    { name: "Kling 可灵 3.0", icon: Wand2, tone: "tertiary" },
    { name: "Seedance 2.0", icon: Clapperboard, tone: "secondary" },
    { name: "Wan 万相 3.0", icon: Network, tone: "primary" },
    { name: "MiniMax 海螺", icon: Sparkles, tone: "tertiary" },
];

const marketingPlans = (formatCredits: (value: number) => string) => [
    {
        name: "新人探索版",
        tag: "FREE TRIAL",
        price: "¥0",
        unit: "/ 注册立领",
        note: `体验余额示例 ${formatCredits(100)}（实际赠送以账户到账为准）`,
        features: [
            "体验 480p / 720p 标清视频生成",
            "单任务队列并发数：1",
            "独立视频创作台（/video）",
            "无限画布基础编排（/canvas）",
        ],
        missing: ["1080P 超清输出", "高优先级渲染队列"],
        cta: "立即注册领取体验余额",
        to: "/register",
        highlight: false,
    },
    {
        name: "创作者专业版",
        tag: "POPULAR",
        price: "¥99",
        unit: `/ ${formatCredits(10000)} 余额`,
        note: "充值余额长期有效 · 以账户中心实际套餐为准",
        features: [
            "支持 720P / 1080P 超清输出",
            "无限画布完整编排与自动保存",
            "多任务并发队列数：3",
            "云端资产库与预设保存",
        ],
        missing: [],
        cta: "即刻升级专业版",
        to: "/register",
        highlight: true,
    },
    {
        name: "工作室旗舰版",
        tag: "STUDIO FLEET",
        price: "¥299",
        unit: `/ ${formatCredits(35000)} 余额`,
        note: `包含 ${formatCredits(5000)} 赠送余额示例 · 团队专用`,
        features: [
            "最高优先级渲染队列",
            "1080P / 高清电影级输出",
            "并发任务队列数：5",
            "团队多端同步与版本归档",
        ],
        missing: [],
        cta: "获取旗舰工作室权限",
        to: "/register",
        highlight: false,
    },
];

const toneClass: Record<string, string> = {
    primary: "text-[#c0c1ff]",
    secondary: "text-[#4cd7f6]",
    tertiary: "text-[#bdc2ff]",
};

const HOME_NAV_IDS = ["features", "canvas", "workspace", "models", "pricing"] as const;
type HomeNavId = (typeof HOME_NAV_IDS)[number];

export default function HomePage() {
    const { formatCredits } = useCurrency();
    const plans = marketingPlans(formatCredits);
    const [activeNav, setActiveNav] = useState<HomeNavId>("features");
    const user = useAuthStore((state) => state.user);
    const loadMe = useAuthStore((state) => state.loadMe);
    const initialized = useAuthStore((state) => state.initialized);
    const token = typeof window !== "undefined" ? window.localStorage.getItem("ic_access_token") : null;
    const authed = Boolean(token || user);

    useEffect(() => {
        document.title = "无限画布 · AI 视频生成平台";
    }, []);

    useEffect(() => {
        if (token && !initialized) {
            void loadMe();
        }
    }, [initialized, loadMe, token]);

    useEffect(() => {
        const updateActiveNav = () => {
            const isAtPageBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
            if (isAtPageBottom) {
                setActiveNav(HOME_NAV_IDS[HOME_NAV_IDS.length - 1]);
                return;
            }

            let nextActiveNav: HomeNavId = HOME_NAV_IDS[0];
            let closestSectionTop = Number.NEGATIVE_INFINITY;
            for (const id of HOME_NAV_IDS) {
                const section = document.getElementById(id);
                const sectionTop = section?.getBoundingClientRect().top;
                if (sectionTop !== undefined && sectionTop <= 100 && sectionTop > closestSectionTop) {
                    nextActiveNav = id;
                    closestSectionTop = sectionTop;
                }
            }
            setActiveNav(nextActiveNav);
        };

        updateActiveNav();
        window.addEventListener("scroll", updateActiveNav, { passive: true });
        window.addEventListener("scrollend", updateActiveNav);
        window.addEventListener("resize", updateActiveNav);
        return () => {
            window.removeEventListener("scroll", updateActiveNav);
            window.removeEventListener("scrollend", updateActiveNav);
            window.removeEventListener("resize", updateActiveNav);
        };
    }, []);

    return (
        <div className="ac-page relative min-h-dvh overflow-x-hidden">
            <div className="pointer-events-none absolute left-1/2 top-0 -z-0 h-[460px] w-[1000px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(128,131,255,0.18),rgba(76,215,246,0.08),transparent_70%)] blur-[120px]" />
            <div className="pointer-events-none absolute -left-40 top-[900px] -z-0 h-[500px] w-[600px] rounded-full bg-[#4cd7f6]/5 blur-[120px]" />
            <div className="pointer-events-none absolute -right-40 top-[1700px] -z-0 h-[500px] w-[600px] rounded-full bg-[#8083ff]/6 blur-[120px]" />

            <header className="fixed inset-x-0 top-0 z-50 border-b border-[#464554]/25 bg-[#131315]/80 shadow-2xl shadow-black/40 backdrop-blur-xl">
                <div className="ac-container flex h-16 items-center justify-between">
                    <div className="flex items-center gap-8">
                        <Link to="/" className="flex items-center gap-3">
                            <span className="flex size-8 items-center justify-center rounded-lg border border-[#464554]/50 bg-[#353437] text-[#4cd7f6]">
                                <Network className="size-4" />
                            </span>
                            <span className="ac-title font-bold tracking-tight">无限画布 AI</span>
                        </Link>
                        <nav className="hidden items-center gap-8 text-sm lg:flex">
                            <a className={`ac-link-nav ${activeNav === "features" ? "ac-link-nav-active" : ""}`} href="#features" onClick={() => setActiveNav("features")}>核心特性</a>
                            <a className={`ac-link-nav ${activeNav === "canvas" ? "ac-link-nav-active" : ""}`} href="#canvas" onClick={() => setActiveNav("canvas")}>无限画布</a>
                            <a className={`ac-link-nav ${activeNav === "workspace" ? "ac-link-nav-active" : ""}`} href="#workspace" onClick={() => setActiveNav("workspace")}>创作台</a>
                            <a className={`ac-link-nav ${activeNav === "models" ? "ac-link-nav-active" : ""}`} href="#models" onClick={() => setActiveNav("models")}>模型矩阵</a>
                            <a className={`ac-link-nav ${activeNav === "pricing" ? "ac-link-nav-active" : ""}`} href="#pricing" onClick={() => setActiveNav("pricing")}>价格方案</a>
                        </nav>
                    </div>
                    <div className="flex items-center gap-3">
                        {authed ? (
                            <Link to="/video" className="ac-grad-btn px-4 py-2 text-sm">
                                <PlayCircle className="size-4" /> 进入工作台
                            </Link>
                        ) : (
                            <>
                                <Link to="/login" className="px-3 py-1.5 text-sm text-[#c7c4d7] transition hover:text-[#e5e1e4]">登录</Link>
                                <Link to="/register" className="ac-grad-btn px-4 py-2 text-sm">
                                    <Zap className="size-4" /> 免费试用 (领取体验余额)
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <main className="relative z-10 pt-24">
                <section className="ac-container pb-20 pt-12">
                    <div className="ac-rise mx-auto flex max-w-4xl flex-col items-center space-y-6 text-center">
                        <div className="inline-flex items-center gap-2.5 rounded-full border border-[#464554]/60 bg-[#2a2a2c]/80 px-3.5 py-1.5 backdrop-blur-md">
                            <span className="relative flex size-2">
                                <span className="ac-ping relative inline-flex size-2 rounded-full bg-[#4cd7f6]" />
                            </span>
                            <span className="ac-label text-[#4cd7f6]">VEO 3.1 &amp; SORA 2 实时集群已连接</span>
                            <span className="text-[#464554]">|</span>
                            <span className="ac-sm text-[#c7c4d7]">新一代 AI 视频生产力工作台</span>
                        </div>
                        <h1 className="ac-display text-[#e5e1e4]">
                            从单句灵感到电影级分镜
                            <br />
                            在
                            <span className="bg-gradient-to-r from-[#c0c1ff] via-[#4cd7f6] to-[#e1e0ff] bg-clip-text text-transparent">无限画布</span>
                            中重构创作
                        </h1>
                        <p className="ac-body-lg max-w-2xl leading-relaxed text-[#c7c4d7]">
                            无需配置繁琐 API Key。汇聚全球顶尖生成模型，节点流式编排、镜头首尾帧连贯锁相、
                            云端资产瞬时沉淀，开启按需计费的计算电影学新篇章。
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                            <Link to={authed ? "/video" : "/register"} className="ac-grad-btn px-8 py-3.5 text-lg">
                                <Rocket className="size-5" />
                                {authed ? "进入工作台" : "免费开始创作 (领取体验余额)"}
                            </Link>
                            <a href="#workspace" className="ac-ghost-btn px-7 py-3.5 text-lg">
                                <PlayCircle className="size-5 text-[#4cd7f6]" />
                                观看画布实操演示
                            </a>
                        </div>
                    </div>

                    <div className="ac-panel-lowest ac-dot-grid relative mt-16 overflow-hidden p-4 shadow-2xl md:p-6">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#464554]/25 pb-4">
                            <div className="flex items-center gap-3">
                                <div className="flex gap-1.5">
                                    <span className="size-3 rounded-full bg-[#ffb4ab]/60" />
                                    <span className="size-3 rounded-full bg-[#03b5d3]/60" />
                                    <span className="size-3 rounded-full bg-[#8083ff]/60" />
                                </div>
                                <span className="ac-code text-[#908fa0]">project_neon_noir_shot_01.canvas</span>
                                <span className="ac-label rounded border border-[#4cd7f6]/25 bg-[#2a2a2c] px-2 py-0.5 text-[#4cd7f6]">自动保存已同步</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="ac-code flex items-center gap-1.5 rounded border border-[#464554]/50 bg-[#2a2a2c]/80 px-3 py-1 text-[#c7c4d7]">
                                    <Cpu className="size-4 text-[#4cd7f6]" /> GPU 集群: 98.4% 在线
                                </div>
                                <div className="ac-label flex items-center gap-1 rounded border border-[#464554]/50 bg-[#2a2a2c] px-2.5 py-1 text-[#c7c4d7]">100%</div>
                            </div>
                        </div>

                        <div className="relative mt-5 min-h-[560px] overflow-hidden rounded-xl border border-[#464554]/30 bg-[#1c1b1d]/40 p-4 md:p-6">
                            <svg className="pointer-events-none absolute inset-0 z-10 hidden size-full md:block" viewBox="0 0 1200 560" preserveAspectRatio="none" aria-hidden="true">
                                <defs>
                                    <linearGradient id="streamGrad" x1="0%" x2="100%" y1="0%" y2="0%">
                                        <stop offset="0%" stopColor="#8083ff" stopOpacity="0.8" />
                                        <stop offset="50%" stopColor="#4cd7f6" stopOpacity="1" />
                                        <stop offset="100%" stopColor="#bdc2ff" stopOpacity="0.8" />
                                    </linearGradient>
                                </defs>
                                <path d="M 330 130 C 430 130, 440 250, 560 250" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
                                <path className="ac-conduit" d="M 330 130 C 430 130, 440 250, 560 250" fill="none" stroke="url(#streamGrad)" strokeWidth="2" />
                                <path d="M 330 380 C 430 380, 440 300, 560 300" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
                                <path className="ac-conduit" d="M 330 380 C 430 380, 440 300, 560 300" fill="none" stroke="url(#streamGrad)" strokeWidth="2" />
                                <path d="M 880 270 C 930 270, 950 250, 1000 250" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
                                <path className="ac-conduit" d="M 880 270 C 930 270, 950 250, 1000 250" fill="none" stroke="url(#streamGrad)" strokeWidth="2" />
                            </svg>

                            <div className="relative z-20 grid items-center gap-6 md:grid-cols-12">
                                <div className="flex flex-col gap-6 md:col-span-4">
                                    <div className="rounded-xl border border-[#464554]/45 bg-[#201f21]/90 p-4 shadow-xl backdrop-blur-md">
                                        <div className="mb-3 flex items-center justify-between border-b border-[#464554]/25 pb-3">
                                            <div className="flex items-center gap-2">
                                                <Image className="size-4 text-[#c0c1ff]" />
                                                <span className="ac-sm font-semibold text-[#e5e1e4]">镜头 01 · 提示词节点</span>
                                            </div>
                                            <span className="ac-label rounded bg-[#4cd7f6]/10 px-2 py-0.5 text-[#4cd7f6]">TEXT PROMPT</span>
                                        </div>
                                        <div className="ac-code rounded-lg border border-[#464554]/25 bg-[#0e0e10]/90 p-2.5 leading-relaxed text-[#c7c4d7]">
                                            "赛博深巷雨夜，全息霓虹在积水中倒影破碎。银色超跑缓行，镜头低机位跟随，慢动作雨丝滑落，70mm 电影镜头质感，体积雾。"
                                        </div>
                                        <div className="ac-label mt-3 flex items-center justify-between text-[#908fa0]">
                                            <span>权重: 1.05 | CFG: 7.5</span>
                                            <span className="size-3 rounded-full border-2 border-[#201f21] bg-[#c0c1ff]" />
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-[#464554]/45 bg-[#201f21]/90 p-4 shadow-xl backdrop-blur-md">
                                        <div className="mb-3 flex items-center justify-between border-b border-[#464554]/25 pb-3">
                                            <div className="flex items-center gap-2">
                                                <Image className="size-4 text-[#4cd7f6]" />
                                                <span className="ac-sm font-semibold text-[#e5e1e4]">角色外观参考锚点</span>
                                            </div>
                                            <span className="ac-label rounded bg-[#c0c1ff]/10 px-2 py-0.5 text-[#c0c1ff]">REF-IMG (1/7)</span>
                                        </div>
                                        <div className="relative h-24 overflow-hidden rounded-lg border border-[#464554]/30 bg-[#2a2a2c]">
                                            <img src="/showcase-2.jpg" alt="参考图" className="size-full object-cover" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-[#131315]/80 to-transparent" />
                                            <span className="ac-label absolute bottom-1.5 left-2 font-semibold text-[#e5e1e4]">char_anchor_v2.png</span>
                                        </div>
                                        <div className="ac-label mt-3 flex items-center justify-between text-[#908fa0]">
                                            <span>特征相似度锁定: 92%</span>
                                            <span className="size-3 rounded-full border-2 border-[#201f21] bg-[#4cd7f6]" />
                                        </div>
                                    </div>
                                </div>

                                <div className="md:col-span-4 md:px-2">
                                    <div className="relative w-full rounded-2xl border-2 border-[#c0c1ff]/45 bg-[#2a2a2c]/95 p-5 shadow-2xl backdrop-blur-xl">
                                        <div className="ac-label absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#c0c1ff] px-3 py-0.5 font-bold text-[#1000a9] shadow-lg">
                                            VEO 3.1 CINEMA ENGINE
                                        </div>
                                        <div className="mb-4 mt-2 flex items-center justify-between border-b border-[#464554]/25 pb-3">
                                            <div className="flex items-center gap-2">
                                                <Clapperboard className="size-4 text-[#4cd7f6]" />
                                                <span className="ac-body font-semibold text-[#e5e1e4]">视频生成配置管线</span>
                                            </div>
                                            <span className="size-2.5 animate-pulse rounded-full bg-[#4cd7f6]" />
                                        </div>
                                        <div className="ac-code space-y-3">
                                            {[
                                                ["生成模型", "Veo 3.1 Fast", "text-[#c0c1ff]"],
                                                ["分辨率 & 帧率", "1280×720 @ 24fps", "text-[#4cd7f6]"],
                                                ["镜头长度", "8.0 秒（尾帧自动抽取）", "text-[#e5e1e4]"],
                                                ["预估计费", `${formatCredits(80)}（计费示例，失败自动原路退）`, "text-[#bdc2ff]"],
                                            ].map(([label, value, tone]) => (
                                                <div key={label} className="flex items-center justify-between rounded border border-[#464554]/25 bg-[#0e0e10]/80 p-2">
                                                    <span className="text-[#c7c4d7]">{label}</span>
                                                    <span className={`font-semibold ${tone}`}>{value}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-4 flex items-center justify-between border-t border-[#464554]/25 pt-3">
                                            <span className="ac-label text-[#464554]">STATUS: DISPATCHING</span>
                                            <span className="ac-label flex items-center gap-1.5 text-[#4cd7f6]">
                                                <CircleDot className="size-4 animate-spin" /> 渲染中 78%
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-4 md:col-span-4">
                                    <div className="rounded-xl border border-[#464554]/45 bg-[#201f21]/95 p-4 shadow-2xl backdrop-blur-md">
                                        <div className="mb-3 flex items-center justify-between border-b border-[#464554]/25 pb-3">
                                            <div className="flex items-center gap-2">
                                                <MonitorPlay className="size-4 text-[#acedff]" />
                                                <span className="ac-sm font-semibold text-[#e5e1e4]">成片监视器 (镜头 01)</span>
                                            </div>
                                            <span className="ac-label rounded bg-[#4cd7f6]/15 px-2 py-0.5 text-[#4cd7f6]">720P MASTER</span>
                                        </div>
                                        <div className="relative aspect-video overflow-hidden rounded-lg border border-[#464554]/40 bg-[#0e0e10]">
                                            <img src="/showcase-1.jpg" alt="雨夜跑车成片画面" className="size-full object-cover" />
                                            <div className="absolute inset-0 flex items-end justify-between bg-gradient-to-t from-[#0e0e10]/90 via-transparent to-transparent p-3">
                                                <div className="ac-label flex items-center gap-2 text-[#e5e1e4]">
                                                    <PlayCircle className="size-4 text-[#4cd7f6]" /> 00:07 / 00:08
                                                </div>
                                                <span className="ac-label rounded bg-[#2a2a2c]/90 px-2 py-0.5 text-[#c7c4d7]">H.264</span>
                                            </div>
                                        </div>
                                        <div className="mt-3 flex items-center justify-between rounded-lg border border-[#c0c1ff]/30 bg-[#c0c1ff]/10 p-2.5">
                                            <div className="ac-label flex items-center gap-2 text-[#c0c1ff]">
                                                <Zap className="size-4" /> 已自动抽取尾帧 (Frame #192)
                                            </div>
                                            <span className="ac-label cursor-pointer text-[#c0c1ff] underline">连线至镜头 02 →</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-10 flex flex-col items-center border-t border-[#464554]/25 pt-8">
                            <span className="ac-label mb-6 uppercase tracking-widest text-[#908fa0]">全网前沿模型矩阵 · 统一 API 节点编排调度</span>
                            <div className="flex flex-wrap items-center justify-center gap-8 opacity-80 md:gap-12">
                                {MODELS.map((model) => (
                                    <div key={model.name} className="flex items-center gap-2">
                                        <model.icon className={`size-4 ${toneClass[model.tone]}`} />
                                        <span className="ac-body font-semibold text-[#e5e1e4]">{model.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section id="features" className="ac-container border-t border-[#464554]/15 py-20">
                    <div className="mx-auto mb-16 max-w-2xl text-center">
                        <span className="ac-label uppercase tracking-widest text-[#4cd7f6]">WHY INFINITE CANVAS</span>
                        <h2 className="ac-h2 mt-2 text-[#e5e1e4]">重构专业电影人与创作者的生成管线</h2>
                        <p className="ac-body ac-muted mt-3">摆脱单行对话框与片段拼凑的低效困境，让视听语言在网状拓扑中自然流淌。</p>
                    </div>
                    <div className="grid gap-8 md:grid-cols-3">
                        {[
                            {
                                icon: KeyRound,
                                title: "零门槛开箱即用",
                                desc: "告别复杂的海外 Base URL 代理与多账号 Key 管理。平台统一托管渠道与密钥，注册可领体验余额，具体金额以账户到账为准。",
                                foot: "无配置负担 · 自动化网关路由",
                                tone: "primary",
                            },
                            {
                                icon: Network,
                                title: "节点式无限画布",
                                desc: "突破线性聊天框局限。文本节点、多维参考图输入，尾帧可抽取作为下一镜头首帧，角色与光影不崩塌，分镜故事线无限延展。",
                                foot: "尾帧无缝串联 · 角色一致性锚定",
                                tone: "secondary",
                            },
                            {
                                icon: Cloud,
                                title: "统一云端资产与透明计费",
                                desc: "镜头切片、参数预设与画板版本云端自动保存，跨端创作无缝漫游；人民币费用透明展示，模型生成失败全额自动退款。",
                                foot: "防抖自动保存 · 失败原路零损耗退回",
                                tone: "tertiary",
                            },
                        ].map((item) => (
                            <div key={item.title} className="ac-panel group p-8 transition hover:border-[#c0c1ff]/50">
                                <div className={`mb-6 flex size-12 items-center justify-center rounded-xl border ${item.tone === "primary" ? "border-[#c0c1ff]/30 bg-[#c0c1ff]/10 text-[#c0c1ff]" : item.tone === "secondary" ? "border-[#4cd7f6]/30 bg-[#4cd7f6]/10 text-[#4cd7f6]" : "border-[#bdc2ff]/30 bg-[#bdc2ff]/10 text-[#bdc2ff]"}`}>
                                    <item.icon className="size-6" />
                                </div>
                                <h3 className="ac-title mb-3 font-semibold text-[#e5e1e4]">{item.title}</h3>
                                <p className="ac-body ac-muted leading-relaxed">{item.desc}</p>
                                <div className={`ac-label mt-6 flex items-center gap-2 border-t border-[#464554]/20 pt-4 ${item.tone === "primary" ? "text-[#c0c1ff]" : item.tone === "secondary" ? "text-[#4cd7f6]" : "text-[#bdc2ff]"}`}>
                                    <Check className="size-4" /> {item.foot}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section id="workspace" className="ac-container border-t border-[#464554]/15 py-20">
                    <div className="mx-auto mb-16 max-w-2xl text-center">
                        <span className="ac-label uppercase tracking-widest text-[#c0c1ff]">TWO DIVERGENT CREATIVE ENGINES</span>
                        <h2 className="ac-h2 mt-2 text-[#e5e1e4]">双重创作模式：满足从单镜头到宏大叙事</h2>
                        <p className="ac-body ac-muted mt-3">无论需要 30 秒快速试验参数，还是构建完整的分镜故事板。</p>
                    </div>
                    <div className="grid gap-8 lg:grid-cols-2">
                        <div className="ac-panel flex flex-col justify-between p-6 md:p-8">
                            <div>
                                <div className="mb-4 flex items-center justify-between">
                                    <span className="ac-chip border-[#4cd7f6]/30 bg-[#4cd7f6]/10 text-[#4cd7f6]">MODE A · 极速出片</span>
                                    <span className="ac-code text-[#464554]">ENDPOINT: /video</span>
                                </div>
                                <h3 className="ac-h3 mb-2 font-semibold text-[#e5e1e4]">独立视频创作台</h3>
                                <p className="ac-body ac-muted mb-6">
                                    经典 3 栏高效布局，为单镜头高速打磨而生。左侧历史流、中间参数配置与参考图垫图，右侧即时 16:9 原画播放与下载导出。
                                </p>
                                <div className="ac-code mb-6 grid grid-cols-12 gap-2 rounded-xl border border-[#464554]/25 bg-[#0e0e10]/80 p-3 text-[#908fa0]">
                                    <div className="col-span-3 flex flex-col gap-1.5 rounded border border-[#464554]/20 bg-[#2a2a2c]/60 p-2">
                                        <span>历史任务 (18)</span>
                                        <div className="flex h-6 items-center rounded border border-[#c0c1ff]/40 bg-[#c0c1ff]/20 px-1 text-[#c0c1ff]">#902 Ready</div>
                                        <div className="flex h-6 items-center rounded border border-[#464554]/10 bg-[#201f21] px-1">#901 Ready</div>
                                        <div className="flex h-6 items-center rounded border border-[#464554]/10 bg-[#201f21] px-1">#900 Done</div>
                                    </div>
                                    <div className="col-span-5 flex flex-col gap-1.5 rounded border border-[#464554]/20 bg-[#2a2a2c]/60 p-2">
                                        <span>模型 &amp; 参数 &amp; 参考图</span>
                                        <div className="grid grid-cols-4 gap-1">
                                            {[0, 1, 2].map((i) => <div key={i} className="h-5 rounded border border-[#464554]/30 bg-[#353437]" />)}
                                            <div className="flex h-5 items-center justify-center rounded border border-[#4cd7f6]/40 bg-[#4cd7f6]/20 text-[#4cd7f6]">+4</div>
                                        </div>
                                        <div className="flex h-6 items-center rounded border border-[#464554]/20 bg-[#201f21] px-1">Prompt &amp; Seed</div>
                                    </div>
                                    <div className="col-span-4 flex flex-col justify-between gap-1.5 rounded border border-[#464554]/20 bg-[#2a2a2c]/60 p-2">
                                        <span>720P 实时播放视口</span>
                                        <div className="flex h-14 items-center justify-center rounded border border-[#464554]/30 bg-[#0e0e10]">
                                            <PlayCircle className="size-5 text-[#4cd7f6]" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <ul className="ac-sm space-y-2 text-[#c7c4d7]">
                                <li className="flex items-center gap-2"><Zap className="size-4 text-[#4cd7f6]" /> 支持参考图联合权重注入（最多 7 张风格/角色/构图基准图）</li>
                                <li className="flex items-center gap-2"><Wand2 className="size-4 text-[#4cd7f6]" /> 实时调节模型、时长、分辨率与画面比例</li>
                            </ul>
                        </div>

                        <div id="canvas" className="ac-panel relative flex flex-col justify-between border-[#c0c1ff]/40 p-6 md:p-8">
                            <div className="ac-label absolute -top-3 right-6 rounded-full bg-gradient-to-r from-[#c0c1ff] to-[#4cd7f6] px-3 py-1 font-bold text-[#131315]">
                                旗舰特性 RECOMMENDED
                            </div>
                            <div>
                                <div className="mb-4 flex items-center justify-between">
                                    <span className="ac-chip border-[#c0c1ff]/30 bg-[#c0c1ff]/10 text-[#c0c1ff]">MODE B · 空间叙事</span>
                                    <span className="ac-code text-[#464554]">ENDPOINT: /canvas</span>
                                </div>
                                <h3 className="ac-h3 mb-2 font-semibold text-[#e5e1e4]">无限画布分镜编排</h3>
                                <p className="ac-body ac-muted mb-6">
                                    无限自由二维空间，像策划电影工业流程图一样连接生成节点。支持镜头尾帧继承、故事线分支、云端自动保存与多人协同。
                                </p>
                                <div className="ac-code mb-6 rounded-xl border border-[#464554]/25 bg-[#0e0e10]/80 p-3">
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1.5 rounded border border-[#c0c1ff]/40 bg-[#2a2a2c] px-2.5 py-2 text-[#c0c1ff]">
                                            <CircleDot className="size-3.5" /> 分镜 01
                                        </div>
                                        <div className="relative h-0.5 flex-1 bg-gradient-to-r from-[#c0c1ff] to-[#4cd7f6]">
                                            <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-[#131315] px-1 text-[9px] text-[#4cd7f6]">尾帧锁相</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 rounded border border-[#4cd7f6]/40 bg-[#2a2a2c] px-2.5 py-2 text-[#4cd7f6]">
                                            <CircleDot className="size-3.5" /> 分镜 02
                                        </div>
                                        <div className="relative h-0.5 flex-1 bg-gradient-to-r from-[#4cd7f6] to-[#c0c1ff]">
                                            <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-[#131315] px-1 text-[9px] text-[#c0c1ff]">运镜延展</span>
                                        </div>
                                        <div className="rounded border border-[#464554]/40 bg-[#2a2a2c] px-2.5 py-2 text-[#e5e1e4]">成片渲染</div>
                                    </div>
                                </div>
                            </div>
                            <ul className="ac-sm space-y-2 text-[#c7c4d7]">
                                <li className="flex items-center gap-2"><Network className="size-4 text-[#c0c1ff]" /> 非线性分镜故事板：A/B 方案镜头分支对比与合成分轨</li>
                                <li className="flex items-center gap-2"><Cloud className="size-4 text-[#c0c1ff]" /> 云端状态持久化，刷新或网络波动不丢进度</li>
                            </ul>
                        </div>
                    </div>
                </section>

                <section id="models" className="ac-container border-t border-[#464554]/15 py-20">
                    <div className="mb-12 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                        <div>
                            <span className="ac-label uppercase tracking-widest text-[#4cd7f6]">AI CINEMATOGRAPHY GALLERY</span>
                            <h2 className="ac-h2 mt-2 text-[#e5e1e4]">由无限画布孕育的视觉史诗</h2>
                            <p className="ac-body ac-muted mt-2">以下画面由平台真实接入的 Veo 3.1 模型生成，并经画布与创作台落盘。</p>
                        </div>
                        <div className="flex gap-2">
                            <button className="ac-sm rounded-lg border border-[#464554]/40 bg-[#2a2a2c] px-4 py-2 font-semibold text-[#c0c1ff]" type="button">全部精选</button>
                            <button className="ac-sm rounded-lg border border-[#464554]/20 bg-[#201f21] px-4 py-2 text-[#c7c4d7] transition hover:text-[#e5e1e4]" type="button">科幻分镜</button>
                            <button className="ac-sm rounded-lg border border-[#464554]/20 bg-[#201f21] px-4 py-2 text-[#c7c4d7] transition hover:text-[#e5e1e4]" type="button">概念短片</button>
                        </div>
                    </div>
                    <div className="grid gap-6 md:grid-cols-3">
                        {[
                            {
                                img: "/showcase-1.jpg",
                                tag: "Veo 3.1 · 1280×720",
                                duration: "00:08 单镜",
                                title: "《雨夜追车：霓虹都市》",
                                desc: "低机位跟拍银色超跑穿行雨夜霓虹街道，积水倒影与体积雾营造电影级氛围。",
                                foot: "导演: Platform Studio",
                                credit: `${formatCredits(80)}（示例）`,
                                tone: "text-[#c0c1ff]",
                            },
                            {
                                img: "/showcase-2.jpg",
                                tag: "Veo 3.1 · 首帧参考",
                                duration: "00:08 连贯镜头",
                                title: "《极速纪元：概念超跑》",
                                desc: "以参考图锁定车身形态与光影，在画布中延展同一角色的连续镜头。",
                                foot: "制作: 无限画布团队",
                                credit: `${formatCredits(80)}（示例）`,
                                tone: "text-[#4cd7f6]",
                            },
                            {
                                img: "/showcase-3.jpg",
                                tag: "Veo 3.1 · 1080P 输出",
                                duration: "00:08 光影测试",
                                title: "《机械遗迹：最后巡礼》",
                                desc: "城市霓虹与潮湿路面细节全程锚定，验证高分辨率输出的质感与稳定性。",
                                foot: "创作者: @CanvasDirector",
                                credit: `${formatCredits(144)}（示例）`,
                                tone: "text-[#bdc2ff]",
                            },
                        ].map((work) => (
                            <div key={work.title} className="group overflow-hidden rounded-xl border border-[#464554]/30 bg-[#1c1b1d] transition hover:border-[#c0c1ff]/50">
                                <div className="relative aspect-video overflow-hidden">
                                    <img src={work.img} alt={work.title} className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                    <div className="ac-label absolute left-3 top-3 rounded border border-[#4cd7f6]/30 bg-[#131315]/80 px-2 py-0.5 text-[#4cd7f6] backdrop-blur-md">{work.tag}</div>
                                    <div className="ac-code absolute bottom-3 right-3 rounded bg-[#0e0e10]/80 px-2 py-0.5 text-[#e5e1e4]">{work.duration}</div>
                                </div>
                                <div className="p-5">
                                    <h4 className="ac-title mb-2 font-semibold text-[#e5e1e4]">{work.title}</h4>
                                    <p className="ac-sm mb-4 text-[#c7c4d7]">{work.desc}</p>
                                    <div className="ac-label flex items-center justify-between border-t border-[#464554]/20 pt-3 text-[#908fa0]">
                                        <span>{work.foot}</span>
                                        <span className={`font-medium ${work.tone}`}>{work.credit}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section id="pricing" className="ac-container border-t border-[#464554]/15 py-20">
                    <div className="mx-auto mb-16 max-w-3xl text-center">
                        <span className="ac-label uppercase tracking-widest text-[#4cd7f6]">TRANSPARENT COMPUTE TIERS</span>
                        <h2 className="ac-h2 mt-2 text-[#e5e1e4]">透明算力计费：只为成功的像素买单</h2>
                        <p className="ac-body ac-muted mt-3">按模型规格展示人民币费用，任务失败退还冻结余额。以下套餐为展示示例，实际价格和到账金额以账户中心为准。</p>
                        <div className="ac-code mx-auto mt-6 inline-flex flex-wrap items-center justify-center gap-2 rounded-xl border border-[#464554]/40 bg-[#2a2a2c]/60 p-4 text-[#e5e1e4]">
                            <span className="font-bold text-[#4cd7f6]">费用计算法则:</span>
                            <span>预估费用（人民币） =</span>
                            <span className="rounded bg-[#201f21] px-2 py-0.5 text-[#c0c1ff]">所选模型与规格的人民币报价</span>
                            <span className="text-[#464554]">|</span>
                            <span className="flex items-center gap-1 text-[#bdc2ff]"><ShieldCheck className="size-4" /> 渲染失败全额退还</span>
                        </div>
                    </div>
                    <div className="grid items-stretch gap-8 md:grid-cols-3">
                        {plans.map((plan) => (
                            <div
                                key={plan.name}
                                className={`ac-panel relative flex flex-col justify-between p-8 ${plan.highlight ? "border-2 border-[#c0c1ff]/60 bg-[#2a2a2c]/90 shadow-2xl shadow-[#c0c1ff]/10" : ""}`}
                            >
                                {plan.highlight ? (
                                    <div className="ac-label absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-[#8083ff] to-[#03b5d3] px-4 py-1 font-bold text-[#0d0096] shadow-md">
                                        最受导演青睐 RECOMMENDED
                                    </div>
                                ) : null}
                                <div>
                                    <div className="mb-4 flex items-center justify-between">
                                        <span className="ac-title font-semibold text-[#e5e1e4]">{plan.name}</span>
                                        <span className="ac-label rounded bg-[#2a2a2c] px-2.5 py-0.5 text-[#c7c4d7]">{plan.tag}</span>
                                    </div>
                                    <div className="mb-6">
                                        <div className="flex items-baseline gap-1">
                                            <span className="ac-display !text-[44px] font-bold text-[#e5e1e4]">{plan.price}</span>
                                            <span className="ac-sm text-[#908fa0]">{plan.unit}</span>
                                        </div>
                                        <p className={`ac-sm mt-1 ${plan.highlight ? "text-[#c0c1ff]" : "text-[#4cd7f6]"}`}>{plan.note}</p>
                                    </div>
                                    <ul className="ac-sm space-y-3.5 border-b border-[#464554]/20 pb-8 text-[#c7c4d7]">
                                        {plan.features.map((feature) => (
                                            <li key={feature} className="flex items-center gap-2">
                                                <Check className="size-4 shrink-0 text-[#4cd7f6]" /> {feature}
                                            </li>
                                        ))}
                                        {plan.missing.map((feature) => (
                                            <li key={feature} className="flex items-center gap-2 text-[#908fa0]">
                                                <X className="size-4 shrink-0" /> {feature}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <Link
                                    to={plan.to}
                                    className={`mt-8 flex w-full items-center justify-center rounded-xl py-3 font-semibold ${plan.highlight ? "ac-grad-btn border border-white/20 text-[#0d0096]" : "border border-[#464554]/40 bg-[#2a2a2c] text-[#e5e1e4] transition hover:bg-[#353437]"}`}
                                >
                                    {plan.cta}
                                </Link>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="ac-container py-20">
                    <div className="relative overflow-hidden rounded-3xl border border-[#c0c1ff]/30 bg-gradient-to-r from-[#2a2a2c] via-[#201f21] to-[#0e0e10] p-10 text-center shadow-2xl md:p-16">
                        <div className="pointer-events-none absolute -top-24 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(128,131,255,0.28),rgba(76,215,246,0.12),transparent_70%)] blur-[90px]" />
                        <div className="relative z-10 mx-auto max-w-3xl space-y-6">
                            <span className="ac-label inline-block rounded-full border border-[#4cd7f6]/30 bg-[#353437] px-3.5 py-1.5 text-[#4cd7f6]">START YOUR NEXT MASTERPIECE</span>
                            <h2 className="ac-display text-[#e5e1e4]">即刻释放无限画布生成力量</h2>
                            <p className="ac-body-lg mx-auto max-w-xl text-[#c7c4d7]">
                                加入全球先锋导演与生成式创作者。现在注册领取体验余额，探索下一代计算电影学的无限边界。
                            </p>
                            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                                <Link to={authed ? "/video" : "/register"} className="ac-grad-btn px-9 py-4 text-lg">
                                    <Zap className="size-5" /> {authed ? "进入工作台" : "免费注册领取体验余额"}
                                </Link>
                                <Link to="/login" className="ac-ghost-btn px-8 py-4 text-lg">
                                    登录现有账号 <ArrowRight className="size-5" />
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="border-t border-[#464554]/20 bg-[#0e0e10]">
                <div className="ac-container py-16">
                    <div className="mb-12 grid gap-10 md:grid-cols-5">
                        <div className="space-y-4 md:col-span-2">
                            <div className="flex items-center gap-3">
                                <span className="flex size-7 items-center justify-center rounded border border-[#464554]/40 bg-[#2a2a2c] text-[#4cd7f6]">
                                    <Network className="size-4" />
                                </span>
                                <span className="ac-title font-bold text-[#e5e1e4]">无限画布 AI</span>
                            </div>
                            <p className="ac-sm max-w-sm leading-relaxed text-[#c7c4d7]">
                                专为下一代计算电影学与生成式导演打造的无限拓扑创作平台。整合全球顶级视觉大模型，实现精确的时空分镜编排。
                            </p>
                            <div className="ac-code text-[12px] text-[#908fa0]">API GATEWAY: ONLINE · DB-DRIVEN CONFIG</div>
                        </div>
                        {[
                            {
                                title: "产品架构",
                                links: [["视频创作台", "/video"], ["无限画布", "/canvas"], ["我的资产", "/assets"], ["模型矩阵", "#models"]],
                            },
                            {
                                title: "开发者与规则",
                                links: [["OpenAPI 文档", "/swagger-ui.html"], ["人民币计费细则", "#pricing"], ["管理后台", "/admin/login"], ["真实上游接入", "#models"]],
                            },
                            {
                                title: "合规与支持",
                                links: [["登录", "/login"], ["注册", "/register"], ["常见问题", "#pricing"]],
                            },
                        ].map((column) => (
                            <div key={column.title}>
                                <h5 className="ac-title mb-4 font-semibold text-[#e5e1e4]">{column.title}</h5>
                                <ul className="ac-sm space-y-2.5">
                                    {column.links.map(([label, to]) => (
                                        <li key={label}>
                                            {to.startsWith("#") ? (
                                                <a href={to} className="ac-footer-link">{label}</a>
                                            ) : (
                                                <Link to={to} className="ac-footer-link">{label}</Link>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                    <div className="ac-sm flex flex-col items-center justify-between gap-4 border-t border-[#464554]/15 pt-8 text-[#c7c4d7] md:flex-row">
                        <span>© {new Date().getFullYear()} 无限画布 · 视频生成平台 · 保留所有权利</span>
                        <div className="ac-label flex items-center gap-6 text-[#908fa0]">
                            <span>SHA-256 ENCRYPTED</span>
                            <span>SLA 99.9%</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
