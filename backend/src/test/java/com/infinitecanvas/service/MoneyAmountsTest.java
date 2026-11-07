package com.infinitecanvas.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.common.BizException;
import com.infinitecanvas.dto.AccountDtos;
import com.infinitecanvas.entity.CreditAccount;
import com.infinitecanvas.entity.SystemSetting;
import com.infinitecanvas.mapper.CreditAccountMapper;
import com.infinitecanvas.mapper.CreditTransactionMapper;
import com.infinitecanvas.mapper.SystemSettingMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MoneyAmountsTest {
    private SettingService settings(String precision) {
        SystemSettingMapper mapper = mock(SystemSettingMapper.class);
        if (precision != null) {
            SystemSetting setting = new SystemSetting();
            setting.setSettingValue(precision);
            when(mapper.selectById(MoneyAmounts.UNITS_PER_YUAN_SETTING)).thenReturn(setting);
        }
        return new SettingService(mapper);
    }

    @ParameterizedTest
    @CsvSource({"100,0,¥0.00", "100,80,¥0.80", "100,-125,¥-1.25",
            "1000,1,¥0.001", "1000,1000,¥1.00", "1,80,¥80.00",
            "100,9223372036854775807,¥92233720368547758.07"})
    void convertsHistoricUnitsWithoutFloatingPointOrLedgerChanges(String precision, long units, String expected) {
        assertEquals(expected, MoneyAmounts.format(units, settings(precision)));
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-100", "NaN", "1.5", "", "9223372036854775808"})
    void invalidHistoricPrecisionUsesTheSamePositiveDefaultAtEveryBoundary(String precision) {
        SettingService settings = settings(precision);
        assertEquals(100L, MoneyAmounts.unitsPerYuan(settings));
        assertEquals(100L, settings.publicSettings().get("exchangePerYuan"));
        assertEquals("¥1.00", MoneyAmounts.format(100, settings));
    }

    @Test
    void publicCurrencyMetadataAndDefaultRemainBackwardsCompatible() {
        Map<String, Object> config = settings(null).publicSettings();
        assertEquals("CNY", config.get("currency"));
        assertEquals("元", config.get("currencyUnit"));
        assertEquals(100L, config.get("exchangePerYuan"));
    }

    @Test
    void accountJsonKeepsRawAmountsAndAddsCurrencyMetadata() throws Exception {
        var account = new AccountDtos.AccountView(1000, 80, 250, 1330, 1000, 2, 1, null);
        var json = new ObjectMapper().readTree(new ObjectMapper().writeValueAsString(account));
        assertEquals(1000L, json.get("available").longValue());
        assertEquals(1000L, json.get("exchangePerYuan").longValue());
        assertEquals("CNY", json.get("currency").textValue());
        assertEquals("元", json.get("currencyUnit").textValue());
    }

    @Test
    void insufficientBalanceMessageIsInYuanAndLeavesTheLedgerUntouched() {
        CreditAccountMapper accounts = mock(CreditAccountMapper.class);
        CreditTransactionMapper transactions = mock(CreditTransactionMapper.class);
        CreditAccount account = new CreditAccount();
        account.setAvailable(80L);
        when(accounts.selectForUpdate(7L)).thenReturn(account);
        BillingService billing = new BillingService(accounts, transactions, settings("1000"));

        BizException error = assertThrows(BizException.class, () -> billing.hold(7L, 2L, "task", 100, "req"));

        assertEquals("余额不足：本次需要 ¥0.10，当前可用 ¥0.08", error.getMessage());
        assertEquals(80L, account.getAvailable());
        verifyNoInteractions(transactions);
        verify(accounts, never()).hold(anyLong(), anyLong());
    }
}
