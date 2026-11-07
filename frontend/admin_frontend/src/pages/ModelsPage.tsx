import { useCallback, useEffect, useRef, useState } from "react";
import {
    AutoComplete,
    Button,
    Drawer,
    Form,
    Input,
    InputNumber,
    Modal,
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
import { creditsToYuan, formatYuan, modelCapabilityLabel, parseJsonList, yuanToCredits } from "../lib/format";
import { useCurrency } from "../lib/currency";
import { modelMoneyRulesUnchanged, unchangedModelRuleUnits, unchangedModelUnits } from "../lib/model-money";
import { buildLogicalPricingPlan, isRouteCostFresh, logicalModelKey } from "../lib/pricing";
import type { Channel, ModelCapability, ModelClassificationSuggestion, ModelPayload, UpstreamPriceSnapshot, VideoModel } from "../types";

// Fields rendered inside the collapsed "兼容高级配置" panel; expand it when validation points there.
const ADVANCED_PANEL_FIELDS = new Set([
    "creditsPerSecond",
    "resolutionFactors",
    "resolutionDefault",
    "audioFactor",
    "minChargeCredits",
    "supportedSeconds",
    "supportedSizes",
    "supportedRatios",
    "supportsAudio",
    "supportsWatermark",
    "supportsFirstLastFrame",
    "supportsReferenceImages",
    "maxReferenceImages",
]);

interface PricingRuleForm {
    resolution: string;
    seconds?: number;
    credits: number | string;
}

interface ModelFormValues {
    channelId: number;
    upstreamModel: string;
    displayName: string;
    modelKey: string;
    routeWeight: number;
    capability: ModelCapability;
    pricingRules: PricingRuleForm[];
    creditsPerSecond: number | string;
    resolutionFactors: string;
    resolutionDefault: string;
    audioFactor: number;
    minChargeCredits: number | string;
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
    { value: "llm", label: "大语言模型" },
    { value: "image", label: "图片生成" },
    { value: "video", label: "视频生成" },
    { value: "unknown", label: "待审核/未分类" },
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
    if (capability === "image") return [{ resolution: "1024x1024", credits: 10 }];
    if (capability === "video") return [{ resolution: "720p", seconds: 8, credits: 80 }];
    return [];
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
            if (!resolution || candidate.credits == null || String(candidate.credits).trim() === "" || !Number.isFinite(credits) || credits < 0) {
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

function pricingSummary(text: string | null | undefined, capability: string, exchangePerYuan: number): string {
    return parsePricingRules(text, capability)
        .map((rule) => capability === "video"
            ? `${rule.resolution} / ${rule.seconds}s · ${formatYuan(creditsToYuan(rule.credits, exchangePerYuan))}`
            : `${rule.resolution} · ${formatYuan(creditsToYuan(rule.credits, exchangePerYuan))}/张`)
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

function prettyJsonText(text: string | null | undefined, emptyValue = "[]"): string {
    if (text == null || !text.trim()) return emptyValue;
    try {
        return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        return text;
    }
}

function pricingRulesToYuan(rules: PricingRuleForm[], exchangePerYuan: number): PricingRuleForm[] {
    return rules.map((rule) => ({ ...rule, credits: creditsToYuan(rule.credits, exchangePerYuan) ?? 0 }));
}

type OriginalModelMoney = Pick<VideoModel, "capability" | "pricingRules" | "creditsPerSecond" | "minChargeCredits">;

export function modelPayloadFromValues(values: ModelFormValues, exchangePerYuan: number, original?: OriginalModelMoney): ModelPayload {
    const originalRules = original ? parsePricingRules(original.pricingRules, original.capability || "video") : [];
    const creditsForRule = (rule: PricingRuleForm): number =>
        unchangedModelRuleUnits(rule, originalRules, exchangePerYuan) ?? yuanToCredits(rule.credits, exchangePerYuan);
    const creditsPerSecond = unchangedModelUnits(values.creditsPerSecond, original ? Number(original.creditsPerSecond) : undefined, exchangePerYuan)
        ?? yuanToCredits(values.creditsPerSecond, exchangePerYuan);
    const minChargeCredits = unchangedModelUnits(values.minChargeCredits, original ? Number(original.minChargeCredits) : undefined, exchangePerYuan)
        ?? yuanToCredits(values.minChargeCredits, exchangePerYuan);
    return {
        channelId: values.channelId,
        upstreamModel: values.upstreamModel.trim(),
        displayName: values.displayName.trim(),
        modelKey: values.modelKey.trim(),
        routeWeight: values.routeWeight,
        capability: values.capability,
        pricingRules: original && modelMoneyRulesUnchanged(values.pricingRules, originalRules, exchangePerYuan)
            ? original.pricingRules
            : JSON.stringify(values.pricingRules.map((rule) => ({
                resolution: rule.resolution.trim(),
                ...(values.capability === "video" ? { seconds: rule.seconds } : {}),
                credits: creditsForRule(rule),
            }))),
        creditsPerSecond,
        resolutionFactors: values.resolutionFactors.trim(),
        resolutionDefault: values.capability === "image" ? values.pricingRules[0].resolution.trim() : values.resolutionDefault,
        audioFactor: values.audioFactor,
        minChargeCredits,
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
    const { exchangePerYuan, ready } = useCurrency();
    const { message, showApiError, showSuccess } = useFeedback();
    const [models, setModels] = useState<VideoModel[]>([]);
    const [capabilityFilter, setCapabilityFilter] = useState<ModelCapability | "all">("all");
    const [classificationPreview, setClassificationPreview] = useState<ModelClassificationSuggestion[]>([]);
    const [classifying, setClassifying] = useState(false);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loading, setLoading] = useState(true);
    const [form] = Form.useForm<ModelFormValues>();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [editing, setEditing] = useState<VideoModel | null>(null);
    const originalMoney = useRef<OriginalModelMoney | undefined>(undefined);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [syncingModels, setSyncingModels] = useState(false);
    const [channelModels, setChannelModels] = useState<Record<string, string[]>>({});
    const [pricingChannelId, setPricingChannelId] = useState<number | null>(null);
    const [priceSnapshot, setPriceSnapshot] = useState<UpstreamPriceSnapshot | null>(null);
    const [syncingPrices, setSyncingPrices] = useState(false);
    const [applyingPrices, setApplyingPrices] = useState(false);
    const [marginPercent, setMarginPercent] = useState(20);
    const [marginFloorPercent, setMarginFloorPercent] = useState(10);
    const [marginCeilingPercent, setMarginCeilingPercent] = useState(30);
    const [costMaxAgeHours, setCostMaxAgeHours] = useState(24);
    const settingsInitialized = useRef(false);
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
    const minChargeCredits = Form.useWatch("minChargeCredits", form) ?? creditsToYuan(1, exchangePerYuan) ?? 0;
    const isCreativeCapability = capability === "image" || capability === "video";
    const originalRules = originalMoney.current ? parsePricingRules(originalMoney.current.pricingRules, originalMoney.current.capability || "video") : [];
    const previewCharge = (rule: PricingRuleForm): string => {
        try {
            const price = unchangedModelRuleUnits(rule, originalRules, exchangePerYuan) ?? yuanToCredits(rule.credits, exchangePerYuan);
            const minimum = unchangedModelUnits(minChargeCredits, originalMoney.current?.minChargeCredits, exchangePerYuan) ?? yuanToCredits(minChargeCredits, exchangePerYuan);
            return formatYuan(creditsToYuan(Math.max(minimum, Math.ceil(price)), exchangePerYuan));
        } catch { return "金额无效"; }
    };
    const nonnegativeMoney: FormRule = {
        validator: async (_rule, value: unknown) => {
            if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "" || !Number.isFinite(Number(value)) || Number(value) < 0) {
                throw new Error("请输入不小于 0 的人民币金额");
            }
        },
    };
    const eligibleChannels = capability === "llm" || capability === "unknown"
        ? channels
        : channels.filter((channel) =>
            (channel.capabilities?.length ? channel.capabilities : ["video"]).includes(capability));
    const channelById = new Map(channels.map((channel) => [channel.id, channel]));
    const isPricingRouteEligible = (route: VideoModel) => {
        const channel = channelById.get(route.channelId);
        const capabilities = channel?.capabilities?.length ? channel.capabilities : ["video"];
        return route.enabled === 1 && Number(route.routeWeight) > 0
            && channel?.enabled === 1 && capabilities.includes(route.capability);
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [modelList, channelList, settings] = await Promise.all([
                adminApi.listModels(), adminApi.listChannels(), adminApi.listSettings(),
            ]);
            setModels(modelList);
            setChannels(channelList);
            if (!settingsInitialized.current) {
                const settingNumber = (key: string, fallback: number) => {
                    const value = Number(settings.find((item) => item.key === key)?.value ?? fallback);
                    return Number.isFinite(value) ? value : fallback;
                };
                const marginCeiling = Math.min(99.99, Math.max(0, settingNumber("pricing.margin_ceiling_percent", 30)));
                const marginFloor = Math.min(marginCeiling, 99.99, Math.max(0, settingNumber("pricing.margin_floor_percent", 10)));
                const targetMargin = Math.min(marginCeiling, Math.max(marginFloor, settingNumber("pricing.target_margin_percent", 20)));
                setMarginPercent(targetMargin);
                setMarginFloorPercent(marginFloor);
                setMarginCeilingPercent(marginCeiling);
                setCostMaxAgeHours(Math.min(8760, Math.max(1, Math.round(settingNumber("pricing.cost_max_age_hours", 24)))));
                settingsInitialized.current = true;
            }
            setPricingChannelId((current) => current ?? channelList.find((item) => {
                try { return new URL(item.normalizedBaseUrl).hostname.toLowerCase() === "duoyuanx.com"; }
                catch { return false; }
            })?.id ?? null);
        } catch (err) {
            showApiError(err);
        } finally {
            setLoading(false);
        }
    }, [showApiError]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (pricingChannelId == null) { setPriceSnapshot(null); return; }
        let active = true;
        setPriceSnapshot(null);
        void adminApi.listUpstreamPrices(pricingChannelId).then((snapshot) => {
            if (active) setPriceSnapshot(snapshot);
        }).catch((err) => { if (active) showApiError(err); });
        return () => { active = false; };
    }, [pricingChannelId, showApiError]);

    const refreshPrices = async () => {
        if (pricingChannelId == null) return;
        setSyncingPrices(true);
        try {
            const snapshot = await adminApi.syncUpstreamPrices(pricingChannelId);
            setPriceSnapshot(snapshot);
            await load();
            message.success(`已同步 ${snapshot.prices.length} 条上游报价`);
        } catch (err) {
            showApiError(err);
            try {
                const previous = await adminApi.listUpstreamPrices(pricingChannelId);
                setPriceSnapshot({ ...previous, stale: true, status: "stale" });
            } catch { setPriceSnapshot((previous) => previous ? { ...previous, stale: true, status: "stale" } : null); }
        } finally {
            setSyncingPrices(false);
        }
    };

    const pricingModels = models.filter((model) => model.capability === "image" || model.capability === "video");
    const pricingPlan = buildLogicalPricingPlan(pricingModels, marginPercent, marginFloorPercent, Date.now(), costMaxAgeHours, isPricingRouteEligible);
    const pricePlanByKey = new Map(pricingPlan.map((item) => [item.key, item]));
    const applicablePrices = pricingPlan.filter((item) => item.suggestion.rules.length > 0);
    const warningCount = applicablePrices.filter((item) => item.suggestion.warnings.length > 0).length;

    const applySuggestedPrices = () => {
        if (!applicablePrices.length || applyingPrices) return;
        Modal.confirm({
            title: `确认修改 ${applicablePrices.length} 个逻辑模型的客户售价？`,
            content: `将按每个逻辑模型全部线路的最新余额成本计算：最低成本用于建议价，最高成本用于最低毛利风险提示。${warningCount ? `当前有 ${warningCount} 个逻辑模型存在未知、过期成本或最低毛利风险，请确认后继续。` : ""}`,
            okText: "确认应用售价",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                setApplyingPrices(true);
                let updated = 0;
                try {
                    for (const { model, suggestion } of applicablePrices) {
                        await adminApi.updateModelPricing(model.id, JSON.stringify(suggestion.rules));
                        updated++;
                    }
                    showSuccess(`已更新 ${updated} 个逻辑模型的客户售价`);
                } catch (err) {
                    showApiError(err);
                    message.warning(`已更新 ${updated} 个逻辑模型，剩余未修改；请刷新后重新核对`);
                } finally {
                    setApplyingPrices(false);
                    await load();
                }
            },
        });
    };

    const filteredModels = capabilityFilter === "all"
        ? models
        : models.filter((model) => model.capability === capabilityFilter);

    const previewClassifications = async () => {
        setClassifying(true);
        try {
            const suggestions = await adminApi.previewModelClassifications();
            setClassificationPreview(suggestions);
            if (!suggestions.length) message.info("没有需要纠正的高置信模型分类");
        } catch (err) {
            showApiError(err);
        } finally {
            setClassifying(false);
        }
    };

    const applyClassifications = () => {
        if (!classificationPreview.length || classifying) return;
        Modal.confirm({
            title: `确认应用 ${classificationPreview.length} 条模型分类纠正？`,
            content: "后端会校验每条模型的当前分类与身份快照；任何漂移都会整体拒绝，不会部分应用。",
            okText: "确认批量应用",
            cancelText: "取消",
            onOk: async () => {
                setClassifying(true);
                try {
                    const result = await adminApi.applyModelClassifications(classificationPreview);
                    showSuccess(`已纠正 ${result.updated} 个模型分类`);
                    setClassificationPreview([]);
                    await load();
                } catch (err) {
                    showApiError(err);
                    await load();
                } finally {
                    setClassifying(false);
                }
            },
        });
    };

    const applyDefaults = () => {
        originalMoney.current = { capability: "video", pricingRules: JSON.stringify(defaultPricingRules("video")), creditsPerSecond: 10, minChargeCredits: 1 };
        form.resetFields();
        form.setFieldsValue({
            capability: "video",
            pricingRules: pricingRulesToYuan(defaultPricingRules("video"), exchangePerYuan),
            routeWeight: 100,
            creditsPerSecond: creditsToYuan(10, exchangePerYuan) ?? 0,
            resolutionFactors: DEFAULT_RESOLUTION_FACTORS,
            resolutionDefault: "720p",
            audioFactor: 1,
            minChargeCredits: creditsToYuan(1, exchangePerYuan) ?? 0,
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

    const handleCapabilityChange = (nextCapability: ModelCapability) => {
        const selectedChannelId = form.getFieldValue("channelId");
        const selectedChannel = channels.find((channel) => channel.id === selectedChannelId);
        const selectedCapabilities = selectedChannel?.capabilities?.length ? selectedChannel.capabilities : ["video"];
        const creative = nextCapability === "image" || nextCapability === "video";
        if (editing) {
            if (creative && selectedChannel && !selectedCapabilities.includes(nextCapability)) {
                form.setFieldsValue({ channelId: undefined });
            }
            return;
        }
        const rules = defaultPricingRules(nextCapability);
        originalMoney.current = {
            capability: nextCapability,
            pricingRules: JSON.stringify(rules),
            creditsPerSecond: !editing ? (creative ? 10 : 0) : originalMoney.current?.creditsPerSecond ?? 0,
            minChargeCredits: !editing ? (creative ? 1 : 0) : originalMoney.current?.minChargeCredits ?? 0,
        };
        form.setFieldsValue({
            pricingRules: pricingRulesToYuan(rules, exchangePerYuan),
            ...(!editing ? {
                creditsPerSecond: creditsToYuan(Number(originalMoney.current.creditsPerSecond), exchangePerYuan) ?? 0,
                minChargeCredits: creditsToYuan(originalMoney.current.minChargeCredits, exchangePerYuan) ?? 0,
                resolutionDefault: nextCapability === "video" ? "720p" : nextCapability === "image" ? "1024x1024" : "",
                resolutionFactors: nextCapability === "video" ? DEFAULT_RESOLUTION_FACTORS : "{}",
                supportedSeconds: nextCapability === "video" ? DEFAULT_SUPPORTED_SECONDS : "[]",
                supportedSizes: nextCapability === "video" ? DEFAULT_SUPPORTED_SIZES : nextCapability === "image" ? '["1024x1024"]' : "[]",
                supportedRatios: creative ? DEFAULT_SUPPORTED_RATIOS : "[]",
                supportsAudio: false,
                supportsWatermark: false,
                supportsFirstLastFrame: false,
                supportsReferenceImages: creative,
                maxReferenceImages: creative ? 1 : 0,
            } : {}),
            ...(!creative || !selectedChannel || selectedCapabilities.includes(nextCapability) ? {} : { channelId: undefined }),
        });
    };

    const openCreate = () => {
        if (channels.length === 0) {
            message.warning("请先创建至少一个渠道");
            return;
        }
        setEditing(null);
        setAdvancedOpen(false);
        applyDefaults();
        setDrawerOpen(true);
    };

    const openEdit = (record: VideoModel, disable = false) => {
        originalMoney.current = record;
        setAdvancedOpen(false);
        setEditing(record);
        form.resetFields();
        form.setFieldsValue({
            channelId: record.channelId,
            upstreamModel: record.upstreamModel,
            displayName: record.displayName,
            modelKey: record.modelKey || record.upstreamModel,
            routeWeight: Number(record.routeWeight) > 0 ? Number(record.routeWeight) : 100,
            capability: record.capability || "video",
            pricingRules: pricingRulesToYuan(parsePricingRules(record.pricingRules, record.capability || "video"), exchangePerYuan),
            creditsPerSecond: creditsToYuan(Number(record.creditsPerSecond), exchangePerYuan) ?? 0,
            resolutionFactors: prettyJsonText(record.resolutionFactors, "{}"),
            resolutionDefault: record.resolutionDefault,
            audioFactor: Number(record.audioFactor),
            minChargeCredits: creditsToYuan(record.minChargeCredits, exchangePerYuan) ?? 0,
            supportedSeconds: prettyJsonText(record.supportedSeconds),
            supportedSizes: prettyJsonText(record.supportedSizes),
            // Admin views omit null JSON columns; the form requires valid JSON text, so normalize them.
            supportedRatios: prettyJsonText(record.supportedRatios),
            supportsAudio: record.supportsAudio === 1,
            supportsWatermark: record.supportsWatermark === 1,
            supportsFirstLastFrame: record.supportsFirstLastFrame === 1,
            supportsReferenceImages: record.supportsReferenceImages === 1,
            maxReferenceImages: record.maxReferenceImages,
            enabled: disable ? false : record.enabled === 1,
            sort: record.sort,
        });
        setDrawerOpen(true);
    };

    const handleSubmit = async () => {
        if (!ready) { showApiError(new Error("金额设置尚未就绪，请稍后重试")); return; }
        let values: ModelFormValues;
        try {
            await form.validateFields();
            values = form.getFieldsValue(true);
        } catch (error) {
            // Silent return made "保存" look dead when a hidden advanced field was invalid.
            const first = (error as { errorFields?: Array<{ name: (string | number)[]; errors: string[] }> }).errorFields?.[0];
            if (!first) {
                message.warning("保存失败：请检查表单填写");
                return;
            }
            if (ADVANCED_PANEL_FIELDS.has(String(first.name[0]))) setAdvancedOpen(true);
            message.warning(`保存失败：${first.errors?.[0] || "请检查标红项"}`);
            window.setTimeout(() => void form.scrollToField(first.name, { behavior: "smooth", block: "center" }), 200);
            return;
        }
        setSaving(true);
        try {
            if (editing) {
                await adminApi.updateModel(editing.id, modelPayloadFromValues(values, exchangePerYuan, originalMoney.current));
                showSuccess("模型已更新");
            } else {
                await adminApi.createModel(modelPayloadFromValues(values, exchangePerYuan, originalMoney.current));
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

    const handleDelete = async (record: VideoModel) => {
        setDeletingId(record.id);
        try {
            await adminApi.deleteModel(record.id);
            showSuccess("模型已删除");
        } catch (err) {
            showApiError(err);
        } finally {
            setDeletingId(null);
            await load();
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
            render: (value: string) => {
                const color = value === "image" ? "cyan" : value === "video" ? "blue" : value === "llm" ? "purple" : "gold";
                return <Tag color={color}>{modelCapabilityLabel(value)}</Tag>;
            },
        },
        {
            title: "规格定价",
            dataIndex: "pricingRules",
            width: 310,
            render: (value: string, record: VideoModel) => (
                <Tooltip title={value}>
                    <span>{pricingSummary(value, record.capability || "video", exchangePerYuan)}</span>
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
        {
            title: "上游成本 / 建议售价",
            key: "upstreamPrice",
            width: 255,
            render: (_: unknown, record: VideoModel) => {
                if (record.capability !== "image" && record.capability !== "video") {
                    return <Tag color="default">不参与自动定价</Tag>;
                }
                const plan = pricePlanByKey.get(logicalModelKey(record));
                const costText = record.costPerUnit != null && record.costQuotaType != null
                    ? `${formatYuan(creditsToYuan(Number(record.costPerUnit), exchangePerYuan))}/${record.costQuotaType === 2 ? "秒" : record.costQuotaType === 1 ? "次" : "未知单位"}`
                    : "成本未知";
                const routeEligible = isPricingRouteEligible(record);
                const freshness = !routeEligible
                    ? "当前不可路由"
                    : record.costPerUnit == null || record.costQuotaType == null
                        ? "成本未知"
                        : isRouteCostFresh(record, Date.now(), costMaxAgeHours) ? "成本最新" : "成本已过期";
                return <div>
                    <div className="mono">{costText}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                        {freshness} · {plan?.suggestion.reason ?? plan?.suggestion.rules.map((item) => `${item.seconds ? `${item.seconds}s ` : ""}${formatYuan(creditsToYuan(item.credits, exchangePerYuan))}`).join("、") ?? "暂无建议"}
                    </div>
                    {plan?.suggestion.warnings.map((warning) => <div key={warning} style={{ color: "var(--ant-color-warning-text)", fontSize: 12 }}>{warning}</div>)}
                </div>;
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
            width: 200,
            fixed: "right",
            render: (_: unknown, record: VideoModel) => (
                <Space size={0}>
                    <Button type="link" size="small" icon={<Pencil size={14} />} onClick={() => openEdit(record)}>
                        编辑
                    </Button>
                    {record.enabled === 1 && <Tooltip title="打开编辑并预选停用，保存后生效">
                        <Button type="link" size="small" icon={<Ban size={14} />} onClick={() => openEdit(record, true)}>
                            停用
                        </Button>
                    </Tooltip>}
                    <Popconfirm
                        title="删除模型"
                        description="无历史任务才能从数据库删除；有关联任务时请改用停用。"
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
                title="模型管理"
                description="配置图片与视频模型的渠道线路、规格定价和生成能力。"
                extra={
                    <Space>
                        <Button icon={<RefreshCw size={15} />} loading={classifying} onClick={() => void previewClassifications()}>
                            重新识别现有模型
                        </Button>
                        <Select
                            aria-label="模型分类筛选"
                            value={capabilityFilter}
                            onChange={(value: ModelCapability | "all") => setCapabilityFilter(value)}
                            options={[{ value: "all", label: "全部分类" }, ...CAPABILITY_OPTIONS]}
                            style={{ width: 150 }}
                        />
                        <Button icon={<RefreshCw size={15} />} onClick={() => void load()} loading={loading}>刷新</Button>
                        <Button type="primary" icon={<Plus size={15} />} onClick={openCreate}>
                            新增模型
                        </Button>
                    </Space>
                }
            />

            <div style={{ padding: "16px 0", borderBottom: "1px solid var(--ant-color-border-secondary)", marginBottom: 16 }}>
                <Typography.Text strong>上游成本同步</Typography.Text>
                <Space wrap size={12} style={{ display: "flex", marginTop: 10, alignItems: "center" }}>
                    <Select
                        aria-label="价格来源渠道"
                        style={{ minWidth: 210 }}
                        value={pricingChannelId}
                        placeholder="选择多元探索渠道（duoyuanx.com）"
                        options={channels.filter((item) => {
                            try { return new URL(item.normalizedBaseUrl).hostname.toLowerCase() === "duoyuanx.com"; }
                            catch { return false; }
                        }).map((item) => ({ label: item.name, value: item.id }))}
                        onChange={setPricingChannelId}
                    />
                    <Button icon={<RefreshCw size={15} />} loading={syncingPrices} disabled={pricingChannelId == null}
                        onClick={() => void refreshPrices()}>同步上游成本</Button>
                    <Typography.Text>当前建议目标毛利率</Typography.Text>
                    <InputNumber aria-label="目标毛利率百分比" min={marginFloorPercent} max={marginCeilingPercent} precision={0} value={marginPercent}
                        onChange={(value) => setMarginPercent(Math.min(marginCeilingPercent, Math.max(marginFloorPercent, value ?? marginFloorPercent)))} addonAfter="%" style={{ width: 140 }} />
                    <Button type="primary" loading={applyingPrices} disabled={applicablePrices.length === 0}
                        onClick={applySuggestedPrices}>应用 {applicablePrices.length} 个逻辑模型建议</Button>
                </Space>
                <Typography.Text type="secondary" style={{ display: "block", marginTop: 8 }}>
                    {priceSnapshot?.syncedAt ? `最近同步 ${new Date(`${priceSnapshot.syncedAt}Z`).toLocaleString("zh-CN")} · ${priceSnapshot.prices.length} 个公开报价 · ` : "暂无已同步报价，请先同步成本 · "}
                    {priceSnapshot?.stale ? "公开报价快照已过期 · " : ""}
                    金额按人民币元展示；当前建议参数：目标毛利 {marginPercent}%、最低毛利 {marginFloorPercent}%、目标上限 {marginCeilingPercent}%、成本有效期 {costMaxAgeHours} 小时。最低成本用于建议价，最高成本用于风险提示；同步不修改客户售价，只有点击「应用建议售价」并确认才更新。{pricingPlan.length > applicablePrices.length ? ` ${pricingPlan.length - applicablePrices.length} 个逻辑模型因成本、计费或规格不明确而跳过。` : ""}
                </Typography.Text>
            </div>

            <Modal
                title="模型分类纠正预览"
                open={classificationPreview.length > 0}
                onCancel={() => setClassificationPreview([])}
                width={760}
                okText="确认批量应用"
                cancelText="暂不应用"
                confirmLoading={classifying}
                onOk={applyClassifications}
            >
                <Typography.Paragraph type="secondary">
                    仅展示高置信且与当前分类不同、售价无冲突的建议。待审核/未分类、不变项和售价冲突项不会被覆盖；售价冲突需先手动统一，提交时后端会再次校验模型身份。
                </Typography.Paragraph>
                <Table<ModelClassificationSuggestion>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={classificationPreview}
                    columns={[
                        { title: "模型 ID", dataIndex: "id", width: 80 },
                        { title: "上游模型", dataIndex: "upstreamModel", render: (value: string) => <span className="mono">{value}</span> },
                        { title: "逻辑标识", dataIndex: "modelKey", render: (value: string) => <span className="mono">{value}</span> },
                        { title: "当前分类", dataIndex: "currentCapability", render: (value: string) => <Tag>{modelCapabilityLabel(value)}</Tag> },
                        { title: "建议分类", dataIndex: "suggestedCapability", render: (value: string) => <Tag color="blue">{modelCapabilityLabel(value)}</Tag> },
                    ]}
                />
            </Modal>

            <Table<VideoModel>
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={filteredModels}
                pagination={false}
                scroll={{ x: 2500 }}
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
                            <Form.Item label="模型类型" name="capability" rules={[{ required: true, message: "请选择模型类型" }]}>
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

                    {isCreativeCapability ? <>
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
                                    {` · ${rule.credits == null ? "—" : previewCharge(rule)} /${capability === "image" ? "张" : "次"}`}
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
                                                label={capability === "image" ? "每张售价（元）" : "每条售价（元）"}
                                                name={[field.name, "credits"]}
                                                rules={[{ required: true, message: "请输入人民币售价" }, nonnegativeMoney]}
                                            >
                                                <InputNumber<string> stringMode step={String(1 / exchangePerYuan)} prefix="¥" style={{ width: "100%" }} />
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
                                <Button type="dashed" block icon={<Plus size={15} />} onClick={() => add(pricingRulesToYuan(defaultPricingRules(capability), exchangePerYuan)[0])}>
                                    添加规格价格
                                </Button>
                                <Form.ErrorList errors={errors} />
                            </>
                        )}
                    </Form.List>

                    <Collapse
                        ghost
                        style={{ marginTop: 16 }}
                        activeKey={advancedOpen ? ["compatibility"] : []}
                        onChange={(keys) => setAdvancedOpen(Array.isArray(keys) ? keys.includes("compatibility") : keys === "compatibility")}
                        items={[{
                            key: "compatibility",
                            forceRender: true,
                            label: "兼容高级配置",
                            children: (
                                <>
                                    <Row gutter={16}>
                                        <Col span={12}>
                                            <Form.Item
                                                label="每秒单价（元）"
                                                name="creditsPerSecond"
                                                rules={[{ required: true, message: "请输入每秒人民币单价" }, nonnegativeMoney]}
                                            >
                                                <InputNumber<string> stringMode step={String(1 / exchangePerYuan)} prefix="¥" style={{ width: "100%" }} />
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
                                label="最低扣费金额（元）"
                                name="minChargeCredits"
                                rules={[{ required: true, message: "请输入最低扣费金额" }, nonnegativeMoney]}
                            >
                                <InputNumber<string> stringMode step={String(1 / exchangePerYuan)} prefix="¥" style={{ width: "100%" }} />
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
                    </> : <Typography.Paragraph type="secondary">此分类用于模型登记与审核，暂不开放创作入口和生成价格配置。</Typography.Paragraph>}

                    <Row gutter={16}>
                        {isCreativeCapability && <Col span={8}>
                            <Form.Item
                                label="最大参考图数"
                                name="maxReferenceImages"
                                rules={[{ required: true, message: "请输入最大参考图数" }]}
                            >
                                <InputNumber min={0} max={100} style={{ width: "100%" }} />
                            </Form.Item>
                        </Col>}
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
