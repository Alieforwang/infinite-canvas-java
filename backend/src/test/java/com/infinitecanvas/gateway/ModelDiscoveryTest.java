package com.infinitecanvas.gateway;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.common.BizException;
import com.infinitecanvas.config.AppProperties;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.mapper.UpstreamCallLogMapper;
import com.infinitecanvas.service.CryptoService;
import com.infinitecanvas.service.SsrfGuard;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Proxy;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.junit.jupiter.api.Assertions.*;

class ModelDiscoveryTest {
    private HttpServer server;
    private String origin;
    private final Map<String, Reply> replies = new ConcurrentHashMap<>();
    private final List<String> paths = new CopyOnWriteArrayList<>();
    private final List<String> auth = new CopyOnWriteArrayList<>();
    private UpstreamClient client;
    private AppProperties props;
    private Channel channel;
    private record Reply(int status, String body, String location) {
        Reply(int status, String body) { this(status, body, null); }
    }

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            paths.add(exchange.getRequestURI().getPath());
            auth.add(String.valueOf(exchange.getRequestHeaders().getFirst("Authorization")));
            Reply reply = replies.getOrDefault(exchange.getRequestURI().getPath(), new Reply(404, "missing"));
            byte[] bytes = reply.body().getBytes(StandardCharsets.UTF_8);
            if (reply.location() != null) exchange.getResponseHeaders().set("Location", reply.location());
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(reply.status(), bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        origin = "http://127.0.0.1:" + server.getAddress().getPort();
        props = new AppProperties();
        props.getSecurity().setAllowHttpUpstream(true);
        props.getSecurity().setAllowPrivateUpstream(true);
        props.getCrypto().setKeyEncSecret("fixture-encryption-secret");
        CryptoService crypto = new CryptoService(props);
        UpstreamCallLogMapper logs = (UpstreamCallLogMapper) Proxy.newProxyInstance(
                getClass().getClassLoader(), new Class<?>[]{UpstreamCallLogMapper.class},
                (proxy, method, args) -> method.getReturnType() == int.class ? 1 : null);
        client = new UpstreamClient(props, crypto, logs, new ObjectMapper(), new SsrfGuard(props));
        channel = new Channel();
        channel.setBaseUrl(origin);
        channel.setNormalizedBaseUrl(origin);
        channel.setAuthType("bearer");
        channel.setApiKeyCipher(crypto.encrypt("fixture-key").getBytes(StandardCharsets.UTF_8));
    }

    @AfterEach
    void stop() { server.stop(0); }

    @Test
    void fallsBackOn404AndParsesAlternateCatalogStrictly() {
        replies.put("/models", new Reply(200, """
                {"models":[{"slug":" image-a "},{"id":"image-b"},{"name":"models/image-c"},
                {"id":123},{"slug":false},{"slug":"image-a"},{"id":" "}]}
                """));
        assertEquals(List.of("image-a", "image-b", "image-c"), client.listModels(channel));
        assertEquals(List.of("/v1/models", "/models"), paths);
        assertEquals(List.of("Bearer fixture-key", "Bearer fixture-key"), auth);
    }

    @Test
    void preservesV1BasePathAndFallsBackOn405() {
        channel.setBaseUrl(origin + "/gateway/v1/");
        replies.put("/gateway/v1/models", new Reply(405, "unsupported"));
        replies.put("/gateway/models", new Reply(200, "{\"data\":[{\"id\":\"a\"}]}"));
        assertEquals(List.of("a"), client.listModels(channel));
        assertEquals(List.of("/gateway/v1/models", "/gateway/models"), paths);
    }

    @Test
    void stripsKnownCompatibilitySuffixOnlyAfterOriginalPathCandidates() {
        channel.setBaseUrl(origin + "/gateway/api/anthropic");
        replies.put("/gateway/v1/models", new Reply(200, "[\" a \",{\"id\":\"b\"},{\"name\":\"models/c\"},12,\"a\"]"));
        assertEquals(List.of("a", "b", "c"), client.listModels(channel));
        assertEquals(List.of("/gateway/api/anthropic/v1/models", "/gateway/api/anthropic/models", "/gateway/v1/models"), paths);
    }

    @Test
    void unauthorizedForbiddenAndServerErrorsNeverFallBack() {
        for (int status : List.of(401, 403, 500)) {
            paths.clear();
            replies.put("/v1/models", new Reply(status, "{\"error\":\"denied\"}"));
            replies.put("/models", new Reply(200, "[]"));
            assertThrows(UpstreamException.class, () -> client.listModels(channel));
            assertEquals(List.of("/v1/models"), paths);
        }
    }

    @Test
    void overrideSupportsRelativeAndAbsoluteSameOriginWithoutFallback() {
        channel.setBaseUrl(origin + "/gateway/v1");
        replies.put("/gateway/v1/catalog", new Reply(200, "{\"models\":[{\"slug\":\"x\"}]}"));
        assertEquals(List.of("x"), client.listModels(channel, "catalog"));
        replies.put("/custom", new Reply(200, "[]"));
        assertEquals(List.of(), client.listModels(channel, origin + "/custom"));
        assertEquals(List.of("/gateway/v1/catalog", "/custom"), paths);
        paths.clear();
        assertThrows(UpstreamException.class, () -> client.listModels(channel, "/missing"));
        assertEquals(List.of("/missing"), paths);
    }

    @Test
    void rejectsDifferentOriginAndUnsafeOverridesBeforeAnyRequest() {
        for (String override : List.of("https://127.0.0.1:" + server.getAddress().getPort() + "/models",
                "http://127.0.0.1:1/models", "http://localhost:" + server.getAddress().getPort() + "/models",
                "//example.com/models", origin.replace("http://", "http://user:password@") + "/models",
                "file:///models")) {
            assertThrows(IllegalArgumentException.class, () -> client.listModels(channel, override));
        }
        assertTrue(paths.isEmpty());
    }

    @Test
    void ssrfGuardRunsBeforeSendingCredentials() {
        props.getSecurity().setAllowPrivateUpstream(false);
        assertThrows(BizException.class, () -> client.listModels(channel));
        assertThrows(BizException.class, () -> client.listModels(channel, "/catalog"));
        assertTrue(paths.isEmpty());
    }

    @Test
    void doesNotFollowRedirectsOrFallbackOnBadResponses() {
        replies.put("/v1/models", new Reply(302, "redirect", origin + "/leak"));
        assertThrows(UpstreamException.class, () -> client.listModels(channel));
        assertEquals(List.of("/v1/models"), paths);
        for (String body : List.of("{\"error\":\"not a list\"}", "{\"data\":{}}", "null", "<html>bad</html>")) {
            paths.clear();
            replies.put("/v1/models", new Reply(200, body));
            assertThrows(RuntimeException.class, () -> client.listModels(channel));
            assertEquals(List.of("/v1/models"), paths);
        }
    }

    @Test
    void syncEndpointAcceptsOptionalBodyAndLeavesTestStatusUntouched() throws Exception {
        List<String> writes = new ArrayList<>();
        com.infinitecanvas.mapper.ChannelMapper mapper = (com.infinitecanvas.mapper.ChannelMapper) Proxy.newProxyInstance(
                getClass().getClassLoader(), new Class<?>[]{com.infinitecanvas.mapper.ChannelMapper.class},
                (proxy, method, args) -> {
                    if (method.getName().equals("selectById")) return channel;
                    writes.add(method.getName());
                    return method.getReturnType() == int.class ? 1 : null;
                });
        var service = new com.infinitecanvas.service.ChannelService(mapper, null, null, null,
                new SsrfGuard(props), client, new ObjectMapper());
        var mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(
                new com.infinitecanvas.controller.AdminChannelController(service)).build();
        replies.put("/v1/models", new Reply(200, "{\"data\":[{\"id\":\"a\"}]}"));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/admin/channels/1/models/sync"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.data.models[0]").value("a"));
        replies.put("/custom", new Reply(200, "{\"models\":[{\"id\":\"b\"}]}"));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/admin/channels/1/models/sync")
                        .contentType("application/json").content("{\"modelsUrl\":\"/custom?catalog=image\"}"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.data.models[0]").value("b"));
        assertTrue(writes.isEmpty());
        assertEquals(List.of("/v1/models", "/custom"), paths);
        assertTrue(service.test(1L).ok());
        assertEquals(List.of("updateById"), writes);
        assertEquals(Boolean.TRUE, channel.getLastTestOk());
    }

    @Test
    void combinesRecognizedArraysAndIgnoresNonTextualIds() {
        replies.put("/v1/models", new Reply(200, """
                {"data":[{"id":" a "},{"id":3},{"id":true},{"id":"a"}],
                 "models":[{"slug":"a"},{"id":"b"},{"name":"models/c"},{"slug":3,"id":"d"}]}
                """));
        assertEquals(List.of("a", "b", "c", "d"), client.listModels(channel));
        assertEquals(List.of("/v1/models"), paths);
    }
}
