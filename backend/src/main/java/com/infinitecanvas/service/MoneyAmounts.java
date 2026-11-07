package com.infinitecanvas.service;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * RMB boundary for the existing integer ledger. Legacy field names remain compatible;
 * the historic settlement precision is read-only so existing money is never revalued.
 */
public final class MoneyAmounts {
    public static final String UNITS_PER_YUAN_SETTING = "credit.exchange_per_yuan";
    public static final long DEFAULT_UNITS_PER_YUAN = 100L;

    private MoneyAmounts() {
    }

    public static long unitsPerYuan(SettingService settings) {
        long configured = settings.getLong(UNITS_PER_YUAN_SETTING, DEFAULT_UNITS_PER_YUAN);
        return configured > 0 ? configured : DEFAULT_UNITS_PER_YUAN;
    }

    public static BigDecimal yuan(long units, SettingService settings) {
        return BigDecimal.valueOf(units).divide(BigDecimal.valueOf(unitsPerYuan(settings)),
                12, RoundingMode.HALF_UP).stripTrailingZeros();
    }

    public static String format(long units, SettingService settings) {
        BigDecimal amount = yuan(units, settings);
        if (amount.scale() < 2) {
            amount = amount.setScale(2);
        }
        return "¥" + amount.toPlainString();
    }
}
