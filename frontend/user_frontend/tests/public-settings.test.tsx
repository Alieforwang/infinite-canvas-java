import { afterEach, beforeEach, expect, test } from "bun:test";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { renderToStaticMarkup } from "react-dom/server";
import { http } from "../src/api/http";
import { formatCredits, setCurrencyExchangePerYuan } from "../src/lib/currency";
import { usePublicSettingsStore } from "../src/stores/use-public-settings-store";
import { PublicSettingsGate } from "../src/components/layout/public-settings-gate";
import { TaskFeedback } from "../src/components/tasks/task-feedback";
import type { VideoTaskView } from "../src/api/video-tasks";

const originalAdapter = http.defaults.adapter;
const originalState = { ...usePublicSettingsStore.getState() };
const initialSnapshot = usePublicSettingsStore.getInitialState();
const originalInitialState = { ...initialSnapshot };
let originalStorage: PropertyDescriptor | undefined;

function response(config: InternalAxiosRequestConfig, data: unknown): AxiosResponse {
    return { data: { code: "OK", data }, status: 200, statusText: "OK", headers: {}, config };
}

beforeEach(() => {
    originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null } });
    usePublicSettingsStore.setState({ ...originalState, initialized: false, loading: false, error: "", exchangePerYuan: 100 }, true);
    setCurrencyExchangePerYuan(100);
});

afterEach(() => {
    http.defaults.adapter = originalAdapter;
    usePublicSettingsStore.setState(originalState, true);
    Object.assign(initialSnapshot, originalInitialState);
    setCurrencyExchangePerYuan(100);
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

test("startup blocks billing UI until the custom public rate has arrived", async () => {
    let complete!: (value: AxiosResponse) => void;
    let request!: InternalAxiosRequestConfig;
    http.defaults.adapter = (config) => { request = config; return new Promise((resolve) => { complete = resolve; }); };
    const pending = usePublicSettingsStore.getState().load();
    const initial = renderToStaticMarkup(<PublicSettingsGate><p>balance-visible</p></PublicSettingsGate>);
    expect(initial).not.toContain("balance-visible");
    expect(usePublicSettingsStore.getState().initialized).toBe(false);
    // The adapter runs after the async axios request interceptor.
    await Promise.resolve();
    await Promise.resolve();
    complete(response(request, { exchangePerYuan: 1000, currency: "CNY" }));
    await pending;
    expect(usePublicSettingsStore.getState().initialized).toBe(true);
    expect(usePublicSettingsStore.getState().exchangePerYuan).toBe(1000);
    expect(formatCredits(1)).toBe("¥0.001");
});

test("failed or missing settings stay blocked until retry returns an explicit rate", async () => {
    http.defaults.adapter = async () => { throw new Error("offline"); };
    await usePublicSettingsStore.getState().load();
    const failed = usePublicSettingsStore.getState();
    expect(failed.initialized).toBe(false);
    expect(failed.error).toContain("加载失败");
    Object.assign(initialSnapshot, failed);
    const html = renderToStaticMarkup(<PublicSettingsGate><p>balance-visible</p></PublicSettingsGate>);
    expect(html).toContain("重新加载");
    expect(html).not.toContain("balance-visible");
    http.defaults.adapter = async (config) => response(config, { registrationOpen: true });
    await failed.load();
    expect(usePublicSettingsStore.getState().initialized).toBe(false);
    expect(usePublicSettingsStore.getState().error).toContain("加载失败");
    http.defaults.adapter = async (config) => response(config, { exchangePerYuan: 100 });
    await failed.load();
    expect(usePublicSettingsStore.getState().initialized).toBe(true);
    expect(usePublicSettingsStore.getState().exchangePerYuan).toBe(100);
    expect(usePublicSettingsStore.getState().error).toBe("");
});

test("invalid public ratio and account/public disagreement produce a clear blocking error", async () => {
    http.defaults.adapter = async (config) => response(config, { exchangePerYuan: 0 });
    await usePublicSettingsStore.getState().load();
    expect(usePublicSettingsStore.getState().initialized).toBe(false);
    http.defaults.adapter = async (config) => response(config, { exchangePerYuan: 1000 });
    await usePublicSettingsStore.getState().load();
    usePublicSettingsStore.getState().applyAccountRate(1000);
    expect(() => usePublicSettingsStore.getState().applyAccountRate(100)).toThrow("不一致");
    expect(usePublicSettingsStore.getState().initialized).toBe(false);
    expect(usePublicSettingsStore.getState().error).toContain("重新加载");
    expect(formatCredits(1)).toBe("¥0.001");
});

test("a failed reload or missing account rate cannot leave billing ready", async () => {
    http.defaults.adapter = async (config) => response(config, { exchangePerYuan: 1000 });
    await usePublicSettingsStore.getState().load();
    expect(usePublicSettingsStore.getState().initialized).toBe(true);
    http.defaults.adapter = async () => { throw new Error("offline"); };
    const pending = usePublicSettingsStore.getState().load();
    expect(usePublicSettingsStore.getState().initialized).toBe(false);
    await pending;
    expect(usePublicSettingsStore.getState().initialized).toBe(false);
    expect(usePublicSettingsStore.getState().error).toContain("加载失败");
    expect(() => usePublicSettingsStore.getState().applyAccountRate(undefined as unknown as number)).toThrow("不一致");
    expect(formatCredits(1)).toBe("¥0.001");
});

test("task feedback renders configured yuan amounts and normalizes historical task errors", () => {
    // Server rendering uses the store's initial snapshot, so configure that snapshot for this fixture.
    Object.assign(initialSnapshot, { exchangePerYuan: 1000 });
    const task = { status: "failed", heldCredits: 1, settledCredits: 0, errorMessage: "积分不足，需要10积分" } as VideoTaskView;
    const html = renderToStaticMarkup(<TaskFeedback task={task} />);
    expect(html).toContain("¥0.001");
    expect(html).toContain("余额不足，需要¥0.01");
    expect(html).not.toContain("积分");
});
