import { useMemo } from "react";
import { create } from "zustand";
import { http } from "@/api/http";
import { currencyText, DEFAULT_EXCHANGE_PER_YUAN, formatCredits, formatYuan, setCurrencyExchangePerYuan, yuanToCredits, type CurrencyOptions } from "@/lib/currency";

export type PublicSettings = {
    exchangePerYuan?: number;
    currency?: "CNY";
    currencyUnit?: "元";
    registrationOpen?: boolean;
    notice?: string;
};

type PublicSettingsStore = {
    settings: PublicSettings;
    exchangePerYuan: number;
    initialized: boolean;
    loading: boolean;
    error: string;
    load: () => Promise<void>;
    applyAccountRate: (rate: number) => void;
};
let pending: Promise<void> | null = null;

export const usePublicSettingsStore = create<PublicSettingsStore>((set, get) => ({
    settings: {},
    exchangePerYuan: DEFAULT_EXCHANGE_PER_YUAN,
    initialized: false,
    loading: false,
    error: "",
    load: () => {
        if (pending) return pending;
        set({ loading: true, error: "", initialized: false });
        pending = http.get<unknown, PublicSettings>("/public/settings")
            .then((settings) => {
                if (typeof settings.exchangePerYuan !== "number" || !Number.isSafeInteger(settings.exchangePerYuan) || settings.exchangePerYuan <= 0) {
                    throw new Error("无效计费配置");
                }
                // Configure non-React consumers before unblocking the first UI render.
                const exchangePerYuan = setCurrencyExchangePerYuan(settings.exchangePerYuan);
                set({ settings, exchangePerYuan, initialized: true, loading: false });
            })
            .catch(() => { set({ error: "计费配置加载失败，请重试", loading: false }); })
            .finally(() => { pending = null; });
        return pending;
    },
    applyAccountRate: (rate) => {
        const exchangePerYuan = rate;
        if (!Number.isSafeInteger(exchangePerYuan) || exchangePerYuan <= 0 || (get().initialized && exchangePerYuan !== get().exchangePerYuan)) {
            const error = "账户计费配置与公共配置不一致，请重新加载后重试";
            set({ initialized: false, error });
            throw new Error(error);
        }
        setCurrencyExchangePerYuan(exchangePerYuan);
        set({ exchangePerYuan });
    },
}));

export function useCurrency() {
    const exchangePerYuan = usePublicSettingsStore((state) => state.exchangePerYuan);
    return useMemo(() => ({
        exchangePerYuan,
        formatCredits: (value: number | string | null | undefined, options: CurrencyOptions = {}) =>
            formatCredits(value, { precise: true, ...options, exchangePerYuan }),
        formatYuan,
        yuanToCredits: (value: number | string) => yuanToCredits(value, exchangePerYuan),
        currencyText: (value: string | null | undefined) => currencyText(value, exchangePerYuan),
    }), [exchangePerYuan]);
}
