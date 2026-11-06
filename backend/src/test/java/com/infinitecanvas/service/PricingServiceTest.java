package com.infinitecanvas.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.common.BizException;
import com.infinitecanvas.entity.VideoModel;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PricingServiceTest {

    private final PricingService pricingService = new PricingService(new ObjectMapper());

    private VideoModel model() {
        VideoModel model = new VideoModel();
        model.setCreditsPerSecond(BigDecimal.TEN);
        model.setResolutionFactors("{\"480p\":1.0,\"720p\":1.5,\"1080p\":2.0}");
        model.setAudioFactor(new BigDecimal("1.2"));
        model.setMinChargeCredits(5L);
        return model;
    }

    @Test
    void quotes720pWithoutAudio() {
        assertEquals(60, pricingService.quote(model(), 4, "720p", false));
    }

    @Test
    void quotes480pIsCheaper() {
        assertEquals(40, pricingService.quote(model(), 4, "480p", false));
    }

    @Test
    void quotes1080pIsMoreExpensive() {
        assertEquals(80, pricingService.quote(model(), 4, "1080p", false));
    }

    @Test
    void appliesAudioFactor() {
        assertEquals(72, pricingService.quote(model(), 4, "720p", true));
    }

    @Test
    void enforcesMinimumCharge() {
        VideoModel model = model();
        model.setMinChargeCredits(50L);
        assertEquals(50, pricingService.quote(model, 1, "480p", false));
    }

    @Test
    void unknownResolutionFallsBackToBaseCoefficient() {
        assertEquals(40, pricingService.quote(model(), 4, "4k", false));
    }

    @Test
    void exactVideoRuleOverridesLegacyFormula() {
        VideoModel model = model();
        model.setPricingRules("[{\"resolution\":\"720p\",\"seconds\":4,\"credits\":37}]");
        assertEquals(37, pricingService.quote(model, 4, "720p", false));
        assertEquals(true, pricingService.supportsVideoSpecification(model, 4, "720p"));
        assertEquals(false, pricingService.supportsVideoSpecification(model, 8, "720p"));
    }

    @Test
    void exactVideoRuleStillAppliesAudioFactor() {
        VideoModel model = model();
        model.setPricingRules("[{\"resolution\":\"1080p\",\"seconds\":8,\"credits\":100}]");
        assertEquals(120, pricingService.quote(model, 8, "1080p", true));
    }

    @Test
    void quotesImageByResolutionRule() {
        VideoModel model = model();
        model.setPricingRules("[{\"resolution\":\"1024x1024\",\"credits\":12},{\"resolution\":\"1024x1536\",\"credits\":18}]");
        assertEquals(12, pricingService.quoteImage(model, "1024x1024"));
        assertEquals(18, pricingService.quoteImage(model, "1024x1536"));
    }

    @Test
    void normalizerRejectsEndpointPath() {
        BaseUrlNormalizer normalizer = new BaseUrlNormalizer();
        assertThrows(BizException.class, () -> normalizer.normalize("https://api.example.com/v1/videos"));
        assertThrows(BizException.class, () -> normalizer.normalize("https://user:pwd@api.example.com"));
        assertThrows(BizException.class, () -> normalizer.normalize("ftp://api.example.com"));
    }

    @Test
    void normalizerStripsTrailingV1() {
        BaseUrlNormalizer normalizer = new BaseUrlNormalizer();
        assertEquals("https://api.example.com", normalizer.normalize("https://api.example.com/v1/").normalized());
        assertEquals("http://127.0.0.1:8080/mock", normalizer.normalize("http://127.0.0.1:8080/mock").normalized());
    }
}
