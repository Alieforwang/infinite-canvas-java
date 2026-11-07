package com.infinitecanvas.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.common.BizException;
import com.infinitecanvas.common.GlobalExceptionHandler;
import com.infinitecanvas.controller.AdminModelController;
import com.infinitecanvas.dto.AdminDtos;
import com.infinitecanvas.entity.VideoModel;
import com.infinitecanvas.mapper.VideoTaskMapper;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

/** Exercises the real mapper, HTTP contract and proxied Spring transaction boundary. */
class ModelClassificationTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void administratorCanFilterAllFourInventoryCategories() throws Exception {
        try (var store = store()) {
            for (String capability : List.of("llm", "image", "video", "unknown")) {
                store.models.insert(route(capability + "-inventory", capability, capability, 10));
            }
            var mvc = mvc(service(store));
            for (String capability : List.of("llm", "image", "video", "unknown")) {
                mvc.perform(get("/api/admin/models").param("capability", capability))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.data.length()").value(1))
                        .andExpect(jsonPath("$.data[0].capability").value(capability));
            }
            mvc.perform(get("/api/admin/models")).andExpect(jsonPath("$.data.length()").value(4));
            mvc.perform(get("/api/admin/models").param("capability", "unsupported"))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    void channelCanDeclareLanguageCapabilityButUnknownRemainsModelReviewState() throws Exception {
        try (var store = store()) {
            var channels = new ChannelService(store.channels, store.models, mock(VideoTaskMapper.class),
                    null, null, null, null, json);
            var request = json.convertValue(Map.of("capabilities", List.of("llm", "image", "video", "llm")),
                    AdminDtos.ChannelRequest.class);
            var view = channels.update(7L, request, 1L);
            assertEquals(List.of("llm", "image", "video"), view.capabilities());
            var before = store.channels.selectById(7L);
            var invalid = json.convertValue(Map.of("capabilities", List.of("unknown")), AdminDtos.ChannelRequest.class);
            assertThrows(BizException.class, () -> channels.update(7L, invalid, 1L));
            assertEquals(before, store.channels.selectById(7L));
        }
    }

    @Test
    void publicModelInventoryOnlyAdvertisesEnabledCreativeRoutes() throws Exception {
        try (var store = store()) {
            store.jdbc.update("UPDATE channel SET enabled = 1");
            for (String capability : List.of("llm", "image", "video", "unknown")) {
                store.models.insert(route(capability + "-inventory", capability, capability, 10));
            }
            var disabled = route("disabled-image", "disabled-image", "image", 10);
            disabled.setEnabled(0);
            store.models.insert(disabled);
            var mvc = standaloneSetup(new com.infinitecanvas.controller.ModelController(service(store)))
                    .setControllerAdvice(new GlobalExceptionHandler()).build();
            for (String capability : List.of("image", "video")) {
                mvc.perform(get("/api/models").param("capability", capability))
                        .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1))
                        .andExpect(jsonPath("$.data[0].capability").value(capability));
            }
            mvc.perform(get("/api/models")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.length()").value(1))
                    .andExpect(jsonPath("$.data[0].capability").value("video"));
            for (String capability : List.of("llm", "unknown", "unsupported")) {
                mvc.perform(get("/api/models").param("capability", capability)).andExpect(status().isBadRequest());
            }
        }
    }

    @Test
    void failedLaterCompareAndSetRollsBackEarlierClassificationAndCostChanges() throws Exception {
        try (var store = store()) {
            var first = route("gpt-4o", "gpt", "video", 10);
            var second = route("claude-sonnet-4-5", "claude", "image", 10);
            store.models.insert(first);
            store.models.insert(second);
            var before = store.models.selectAllSorted();
            doReturn(0).when(store.models).updateCapabilityIfUnchanged(
                    argThat(model -> model != null && model.getId().equals(second.getId())), eq("llm"));
            var mvc = mvc(service(store));
            mvc.perform(post("/api/admin/models/classification-apply").contentType("application/json")
                            .content(previewBody(mvc))).andExpect(status().isConflict());
            verify(store.models).updateCapabilityIfUnchanged(
                    argThat(model -> model != null && model.getId().equals(first.getId())), eq("llm"));
            assertEquals(before, store.models.selectAllSorted());
        }
    }

    @Test
    void languageClassificationIsInventoryIndependentOfLegacyCreativeChannelCapabilities() throws Exception {
        try (var store = store()) {
            var route = route("gpt-4o", "shared", "video", 10);
            store.models.insert(route);
            var service = service(store);
            var request = json.convertValue(Map.of("capability", "llm"), AdminDtos.ModelRequest.class);
            assertEquals("llm", service.update(route.getId(), request).capability());
            assertThrows(BizException.class, () -> service.listModels("llm"));
            assertThrows(BizException.class, () -> service.listModels("unknown"));
        }
    }

    @Test
    void unknownInventoryCannotBeEnabledBeforeClassification() throws Exception {
        try (var store = store()) {
            var route = route("opaque", "opaque", "video", 10);
            store.models.insert(route);
            var request = json.convertValue(Map.of("capability", "unknown", "enabled", 1), AdminDtos.ModelRequest.class);
            var view = service(store).update(route.getId(), request);
            assertEquals("unknown", view.capability());
            assertEquals(0, view.enabled());
        }
    }

    @Test
    void previewIsReadOnlyAndReturnsOnlyConfidentChangedClassifications() throws Exception {
        try (var store = store()) {
            for (var item : List.of(route("gpt-4o", "gpt", "video", 10),
                    route("claude-sonnet-4-5", "claude", "image", 10),
                    route("gpt-image-1", "image", "video", 10),
                    route("sora-2", "video", "image", 10),
                    route("custom-alias", "alias", "video", 10),
                    route("deepseek-chat", "deepseek", "llm", 10))) store.models.insert(item);
            List<VideoModel> before = store.models.selectAllSorted();
            var mvc = mvc(service(store));
            mvc.perform(get("/api/admin/models/classification-preview"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(4))
                    .andExpect(jsonPath("$.data[0].currentCapability").value("video"))
                    .andExpect(jsonPath("$.data[0].suggestedCapability").value("llm"))
                    .andExpect(jsonPath("$.data[0].upstreamModel").value("gpt-4o"))
                    .andExpect(jsonPath("$.data[0].modelKey").value("gpt"));
            assertEquals(before, store.models.selectAllSorted());
        }
    }

    @Test
    void confirmedClassificationPreservesAllSalesFieldsSpecsLoadAndFormerGroupWhileClearingCost() throws Exception {
        try (var store = store()) {
            var moving = route("gpt-4o", "shared", "video", 17);
            var remaining = route("opaque-other-route", "shared", "video", 17);
            store.models.insert(moving);
            store.models.insert(remaining);
            var expected = store.models.selectById(moving.getId());
            var formerGroup = store.models.selectById(remaining.getId());
            var mvc = mvc(service(store));
            String body = previewBody(mvc);
            mvc.perform(post("/api/admin/models/classification-apply").contentType("application/json").content(body))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data.updated").value(1));
            var actual = store.models.selectById(moving.getId());
            expected.setCapability("llm");
            expected.setCostPerUnit(null);
            expected.setCostQuotaType(null);
            expected.setCostSyncedAt(null);
            expected.setUpdatedAt(actual.getUpdatedAt());
            assertEquals(expected, actual);
            assertEquals(formerGroup, store.models.selectById(remaining.getId()));
        }
    }

    @Test
    void staleCapabilityUpstreamOrLogicalIdentityRejectsWholePreviewWithoutMutation() throws Exception {
        for (String column : List.of("capability", "upstream_model", "model_key")) {
            try (var store = store()) {
                store.models.insert(route("gpt-4o", "gpt", "video", 10));
                var changed = route("claude-sonnet-4-5", "claude", "image", 10);
                store.models.insert(changed);
                var mvc = mvc(service(store));
                String body = previewBody(mvc);
                store.jdbc.update("UPDATE `model` SET " + column + " = ? WHERE id = ?", "changed", changed.getId());
                var before = store.models.selectAllSorted();
                mvc.perform(post("/api/admin/models/classification-apply").contentType("application/json").content(body))
                        .andExpect(status().isConflict());
                assertEquals(before, store.models.selectAllSorted());
            }
        }
    }

    @Test
    void incompatibleTargetGroupSalesFieldsAreSkippedInPreviewAndRejectedOnApply() throws Exception {
        try (var store = store()) {
            var moving = route("gpt-4o", "shared", "video", 10);
            store.models.insert(moving);
            store.models.insert(route("deepseek-chat", "shared", "llm", 12));
            var before = store.models.selectAllSorted();
            var mvc = mvc(service(store));
            mvc.perform(get("/api/admin/models/classification-preview"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(0));
            mvc.perform(post("/api/admin/models/classification-apply").contentType("application/json")
                            .content(json.writeValueAsString(Map.of("items", List.of(suggestion(moving, "llm"))))))
                    .andExpect(status().isConflict());
            assertEquals(before, store.models.selectAllSorted());
        }
    }

    @Test
    void twoIncomingRoutesCannotCreateAGroupWithDifferentSalesFields() throws Exception {
        try (var store = store()) {
            var first = route("gpt-4o", "shared", "video", 10);
            var second = route("claude-sonnet-4-5", "shared", "image", 12);
            store.models.insert(first);
            store.models.insert(second);
            var before = store.models.selectAllSorted();
            var mvc = mvc(service(store));
            mvc.perform(get("/api/admin/models/classification-preview"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(0));
            mvc.perform(post("/api/admin/models/classification-apply").contentType("application/json").content(
                            json.writeValueAsString(Map.of("items", List.of(suggestion(first, "llm"), suggestion(second, "llm"))))))
                    .andExpect(status().isConflict());
            assertEquals(before, store.models.selectAllSorted());
        }
    }

    @Test
    void forgedUnknownOrChangedSuggestionCannotOverrideManualInventory() throws Exception {
        try (var store = store()) {
            var alias = route("custom-alias", "alias", "image", 10);
            store.models.insert(alias);
            var before = store.models.selectAllSorted();
            var mvc = mvc(service(store));
            mvc.perform(post("/api/admin/models/classification-apply").contentType("application/json")
                            .content(json.writeValueAsString(Map.of("items", List.of(suggestion(alias, "llm"))))))
                    .andExpect(status().isConflict());
            assertEquals(before, store.models.selectAllSorted());
        }
    }

    @Test
    void concurrentConfirmationAppliesOnceAndRejectsTheStaleSecondRequest() throws Exception {
        try (var store = store()) {
            var route = route("gpt-4o", "gpt", "video", 10);
            store.models.insert(route);
            var mvc = mvc(service(store));
            String body = previewBody(mvc);
            var ready = new CountDownLatch(2);
            var workers = Executors.newFixedThreadPool(2);
            try {
                java.util.concurrent.Callable<Integer> apply = () -> {
                    ready.countDown();
                    assertTrue(ready.await(5, TimeUnit.SECONDS));
                    return mvc.perform(post("/api/admin/models/classification-apply")
                                    .contentType("application/json").content(body))
                            .andReturn().getResponse().getStatus();
                };
                var first = workers.submit(apply);
                var second = workers.submit(apply);
                assertEquals(List.of(200, 409), List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS))
                        .stream().sorted().toList());
                assertEquals("llm", store.models.selectById(route.getId()).getCapability());
            } finally {
                workers.shutdownNow();
                assertTrue(workers.awaitTermination(5, TimeUnit.SECONDS));
            }
        }
    }

    private String previewBody(MockMvc mvc) throws Exception {
        var response = mvc.perform(get("/api/admin/models/classification-preview")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode suggestions = json.readTree(response).get("data");
        return json.writeValueAsString(Map.of("items", suggestions));
    }

    private Map<String, Object> suggestion(VideoModel model, String to) {
        return Map.of("id", model.getId(), "currentCapability", model.getCapability(), "suggestedCapability", to,
                "upstreamModel", model.getUpstreamModel(), "modelKey", model.getModelKey());
    }

    private ModelImportTest.ImportStore store() throws Exception {
        return new ModelImportTest.ImportStore("[\"image\",\"video\"]");
    }

    private ModelService service(ModelImportTest.ImportStore store) {
        var service = new ModelService(store.models, store.channels, mock(VideoTaskMapper.class), json);
        var proxy = new ProxyFactory(service);
        proxy.setProxyTargetClass(true);
        proxy.addAdvice(new TransactionInterceptor(store.transaction.getTransactionManager(), new AnnotationTransactionAttributeSource()));
        return (ModelService) proxy.getProxy();
    }

    private MockMvc mvc(ModelService service) {
        return standaloneSetup(new AdminModelController(service)).setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    private VideoModel route(String upstream, String key, String capability, int price) {
        var model = new VideoModel();
        model.setChannelId(7L);
        model.setUpstreamModel(upstream);
        model.setModelKey(key);
        model.setDisplayName("Existing " + upstream);
        model.setCapability(capability);
        model.setEnabled(1);
        model.setSort(0);
        model.setRouteWeight(23);
        model.setPricingRules("[{\"resolution\":\"720p\",\"seconds\":8,\"credits\":" + price + "}]");
        model.setCreditsPerSecond(BigDecimal.valueOf(price));
        model.setResolutionFactors("{\"720p\":2}");
        model.setAudioFactor(new BigDecimal("1.5"));
        model.setMinChargeCredits(19L);
        model.setResolutionDefault("720p");
        model.setSupportedSeconds("[\"8\"]");
        model.setSupportedSizes("[\"1280x720\"]");
        model.setSupportsReferenceImages(1);
        model.setMaxReferenceImages(3);
        model.setExtraRequestParams("{\"private\":true}");
        model.setCostPerUnit(new BigDecimal("1.23"));
        model.setCostQuotaType(1);
        model.setCostSyncedAt(LocalDateTime.of(2026, 11, 7, 1, 2, 3));
        model.setCurrentLoad(2);
        return model;
    }
}
