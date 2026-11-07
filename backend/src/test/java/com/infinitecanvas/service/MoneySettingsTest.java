package com.infinitecanvas.service;

import com.infinitecanvas.common.BizException;
import com.infinitecanvas.controller.AdminSettingController;
import com.infinitecanvas.security.AuthPrincipal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MoneySettingsTest {
    private final SettingService settings = mock(SettingService.class);
    private final AdminSettingController controller = new AdminSettingController(settings);

    @BeforeEach
    void authenticateAdmin() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthPrincipal(7L, "admin", "test-admin"), null));
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @ParameterizedTest
    @ValueSource(strings = {"credit.exchange_per_yuan", "pricing.credits_per_yuan"})
    void rejectsChangesToHistoricPrecisionBeforeWritingAnyOtherSetting(String frozenKey) {
        Map<String, String> values = new LinkedHashMap<>();
        values.put("site.notice", "new notice");
        values.put(frozenKey, "1000");

        assertThrows(BizException.class, () -> controller.update(values));

        verifyNoInteractions(settings);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"-1", "1.5", "NaN", "", "9223372036854775808"})
    void registrationGiftRejectsInvalidSettlementUnitsWithoutPartialWrites(String value) {
        Map<String, String> values = new LinkedHashMap<>();
        values.put("site.notice", "new notice");
        values.put("user.register_gift_credits", value);

        assertThrows(BizException.class, () -> controller.update(values));

        verifyNoInteractions(settings);
    }

    @Test
    void keepsValidGiftAndUnrelatedSettingsWritable() {
        controller.update(Map.of("user.register_gift_credits", "125", "site.notice", "hello"));

        verify(settings).set("user.register_gift_credits", "125", 7L);
        verify(settings).set("site.notice", "hello", 7L);
    }
}
