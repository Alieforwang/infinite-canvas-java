package com.infinitecanvas.gateway;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.common.BizException;
import com.infinitecanvas.config.AppProperties;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.entity.UpstreamCallLog;
import com.infinitecanvas.mapper.UpstreamCallLogMapper;
import com.infinitecanvas.service.CryptoService;
import com.infinitecanvas.service.SsrfGuard;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okio.Buffer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class OpenAiCompatImageAdapterTest {
    private MockWebServer server;
    private AppProperties props;
    private Channel channel;
    private OpenAiCompatImageAdapter adapter;
    private UpstreamCallLogMapper logs;
    private ObjectMapper json;

    @BeforeEach void setup() throws Exception {
        server = new MockWebServer(); server.start();
        props = new AppProperties();
        props.getSecurity().setAllowHttpUpstream(true); props.getSecurity().setAllowPrivateUpstream(true);
        props.getCrypto().setKeyEncSecret("fixture-only-encryption-secret");
        var crypto = new CryptoService(props);
        logs = mock(UpstreamCallLogMapper.class); json = new ObjectMapper();
        var guard = new SsrfGuard(props);
        var client = new UpstreamClient(props, crypto, logs, json, guard);
        adapter = new OpenAiCompatImageAdapter(client, guard, json);
        channel = new Channel(); channel.setNormalizedBaseUrl(server.url("/").toString().replaceAll("/$", ""));
        channel.setAuthType("bearer"); channel.setApiKeyCipher(crypto.encrypt("fixture-only-key").getBytes(StandardCharsets.UTF_8));
    }
    @AfterEach void close() throws Exception { server.shutdown(); }

    @Test void jsonGenerationUsesExactModelAndSizeAndLogsWithoutBase64() throws Exception {
        server.enqueue(new MockResponse().setHeader("Content-Type", "application/json").setBody("{\"data\":[{\"b64_json\":\"fixture-image\"}]}"));
        var result = adapter.generate(channel, 10L, "img_fixture", "upstream-model", "draw", "1024x1024", List.of());
        assertEquals("fixture-image", result.path("data").get(0).path("b64_json").asText());
        var request = server.takeRequest();
        assertEquals("/v1/images/generations", request.getPath()); assertEquals("POST", request.getMethod());
        assertEquals("Bearer fixture-only-key", request.getHeader("Authorization"));
        var body = json.readTree(request.getBody().readUtf8());
        assertEquals("upstream-model", body.path("model").asText()); assertEquals("1024x1024", body.path("size").asText());
        assertEquals(1, body.path("n").asInt());
        var captor = org.mockito.ArgumentCaptor.forClass(UpstreamCallLog.class);
        verify(logs).insert(captor.capture()); assertFalse(captor.getValue().getResponseSnippet().contains("fixture-image"));
    }

    @Test void referenceImagesUseMultipartEdit() throws Exception {
        server.enqueue(new MockResponse().setHeader("Content-Type", "application/json").setBody("{\"data\":[]}"));
        adapter.generate(channel, 10L, "img_fixture", "upstream-model", "edit", "1024x1024",
                List.of(new UpstreamClient.FilePart("image", new byte[]{1, 2, 3}, "reference.png")));
        var request = server.takeRequest();
        assertEquals("/v1/images/edits", request.getPath());
        assertTrue(request.getHeader("Content-Type").startsWith("multipart/form-data"));
        String body = request.getBody().readUtf8();
        assertTrue(body.contains("name=\"image\"; filename=\"reference.png\""));
        assertTrue(body.contains("upstream-model"));
    }

    @Test void rejectsUpstreamFailureAndNeverFollowsCreateRedirect() {
        server.enqueue(new MockResponse().setResponseCode(302).setHeader("Location", server.url("/credential-trap")));
        assertThrows(UpstreamException.class, () -> adapter.generate(channel, 10L, "img_fixture", "model", "draw", "1024x1024", List.of()));
        assertEquals(1, server.getRequestCount());
    }

    @Test void downloadsPublicResultWithoutAuthorizationAndRejectsWrongMediaType() throws Exception {
        server.enqueue(new MockResponse().setHeader("Content-Type", "image/png").setBody(new Buffer().write(new byte[]{1,2,3})));
        assertArrayEquals(new byte[]{1,2,3}, adapter.download(server.url("/result").toString(), 10L, "img_fixture").bytes());
        assertNull(server.takeRequest().getHeader("Authorization"));
        server.enqueue(new MockResponse().setHeader("Content-Type", "text/html").setBody("not an image"));
        assertThrows(UpstreamException.class, () -> adapter.download(server.url("/bad").toString(), 10L, "img_fixture"));
    }

    @Test void rejectsPrivateDownloadBeforeNetworkAndDoesNotFollowDownloadRedirect() {
        props.getSecurity().setAllowPrivateUpstream(false);
        assertThrows(BizException.class, () -> adapter.download(server.url("/private").toString(), 10L, "img_fixture"));
        assertEquals(0, server.getRequestCount());
        props.getSecurity().setAllowPrivateUpstream(true);
        server.enqueue(new MockResponse().setResponseCode(302).setHeader("Location", server.url("/trap")));
        assertThrows(UpstreamException.class, () -> adapter.download(server.url("/redirect").toString(), 10L, "img_fixture"));
        assertEquals(1, server.getRequestCount());
    }
}
