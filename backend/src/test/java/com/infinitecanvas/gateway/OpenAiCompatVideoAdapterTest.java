package com.infinitecanvas.gateway;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.entity.VideoModel;
import com.infinitecanvas.entity.VideoTask;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OpenAiCompatVideoAdapterTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final OpenAiCompatVideoAdapter adapter = new OpenAiCompatVideoAdapter(null, objectMapper);

    @Test
    void buildsSub2ApiRequestWithDedicatedEndpointAndDialect() {
        Channel channel = new Channel();
        channel.setProtocol("sub2api");
        VideoTask task = new VideoTask();
        task.setId(42L);
        task.setTaskNo("task-42");
        VideoModel model = new VideoModel();
        model.setUpstreamModel("grok-imagine-video");
        model.setExtraRequestParams("{\"custom\":true}");
        OpenAiCompatVideoAdapter.CreateContext context = new OpenAiCompatVideoAdapter.CreateContext(
                channel, task, model, "ocean sunrise", 8, "1280x720", "16:9", "720p",
                false, false, "reference", List.of(new byte[]{1, 2, 3}));

        Map<String, Object> body = adapter.buildSub2ApiBody(context);

        assertEquals("/v1/videos/generations", OpenAiCompatVideoAdapter.SUB2API_CREATE_PATH);
        assertEquals("grok-imagine-video", body.get("model"));
        assertEquals("ocean sunrise", body.get("prompt"));
        assertEquals(8, body.get("duration"));
        assertEquals("16:9", body.get("aspect_ratio"));
        assertEquals("720p", body.get("resolution"));
        assertTrue((Boolean) body.get("custom"));
        assertFalse(body.containsKey("seconds"));
        assertEquals("data:image/png;base64,AQID", ((Map<?, ?>) body.get("image")).get("url"));
    }

    @Test
    void extractsSub2ApiTaskAndNestedVideoUrl() throws Exception {
        Channel channel = new Channel();
        channel.setNormalizedBaseUrl("https://sub2.example");
        assertEquals("req-1", adapter.extractTaskId(objectMapper.readTree("{\"request_id\":\"req-1\"}")));
        assertEquals("https://media.example/video.mp4", adapter.extractResultUrl(objectMapper.readTree(
                "{\"status\":\"done\",\"video\":{\"url\":\"https://media.example/video.mp4\"}}")));
        assertEquals("https://sub2.example/v1/videos/req-1/content",
                adapter.resolveResultUrl(channel, "/v1/videos/req-1/content"));
    }
}
