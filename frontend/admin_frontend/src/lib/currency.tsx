import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { adminApi } from "../api/admin";
import { DEFAULT_EXCHANGE_PER_YUAN, validateExchangePerYuan } from "./format";

export interface CurrencyContextValue {
    exchangePerYuan: number;
    currency: "CNY";
    currencyUnit: "元";
    ready: boolean;
    loading: boolean;
    error: string | null;
    retry: () => void;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
    const [exchangePerYuan, setExchangePerYuan] = useState(DEFAULT_EXCHANGE_PER_YUAN);
    const [ready, setReady] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setReady(false);
        setError(null);
        adminApi.publicSettings().then((settings) => {
            if (!alive) return;
            setExchangePerYuan(validateExchangePerYuan(settings.exchangePerYuan));
            setReady(true);
        }).catch((err: unknown) => {
            if (!alive) return;
            setReady(false);
            setError(err instanceof Error ? err.message : "公共货币设置加载失败");
        }).finally(() => {
            if (alive) setLoading(false);
        });
        return () => { alive = false; };
    }, [attempt]);

    const value = useMemo<CurrencyContextValue>(() => ({
        exchangePerYuan,
        currency: "CNY",
        currencyUnit: "元",
        ready,
        loading,
        error,
        retry: () => setAttempt((current) => current + 1),
    }), [exchangePerYuan, ready, loading, error]);

    return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
    const value = useContext(CurrencyContext);
    if (!value) throw new Error("useCurrency 必须在 CurrencyProvider 内使用");
    return value;
}
