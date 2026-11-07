package com.infinitecanvas.gateway;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.entity.VideoModel;
import com.infinitecanvas.entity.VideoTask;
import org.junit.jupiter.api.Test;

import java.util.Base64;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OpenAiCompatVideoAdapterTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final OpenAiCompatVideoAdapter adapter = new OpenAiCompatVideoAdapter(null, objectMapper);

    private static final byte[] PNG = Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9HkAAAAASUVORK5CYII=");
    private static final byte[] JPEG = new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0, 0, 0};

    private OpenAiCompatVideoAdapter.CreateContext referenceContext(String resolution, String mode, List<byte[]> images) {
        return new OpenAiCompatVideoAdapter.CreateContext(null, null, null, "prompt", 8, "1280x720",
                "16:9", resolution, false, false, mode, images);
    }

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

    @Test
    void referenceMetadataCarriesImagesAsDataUrls() {
        Map<String, Object> metadata = adapter.buildReferenceMetadata(referenceContext("720p", "reference", List.of(PNG, JPEG)));
        assertEquals("720P", metadata.get("resolution"));
        assertEquals("16:9", metadata.get("ratio"));
        assertEquals(8, metadata.get("duration"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> media = (List<Map<String, Object>>) metadata.get("media");
        assertEquals(2, media.size());
        assertEquals("reference_image", media.get(0).get("type"));
        assertTrue(String.valueOf(media.get(0).get("url")).startsWith("data:image/png;base64,"));
        assertEquals("reference_image", media.get(1).get("type"));
        assertTrue(String.valueOf(media.get(1).get("url")).startsWith("data:image/jpeg;base64,"));
    }

    @Test
    void firstLastFrameModeUsesFrameMediaTypes() {
        Map<String, Object> metadata = adapter.buildReferenceMetadata(referenceContext("1080P", "frames", List.of(PNG, JPEG)));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> media = (List<Map<String, Object>>) metadata.get("media");
        assertEquals("first_frame", media.get(0).get("type"));
        assertEquals("last_frame", media.get(1).get("type"));
    }

    @Test
    void resolutionNameNormalizesOnlyPixelPresets() {
        assertEquals("720P", OpenAiCompatVideoAdapter.resolutionName("720p"));
        assertEquals("1080P", OpenAiCompatVideoAdapter.resolutionName("1080P"));
        assertEquals("auto", OpenAiCompatVideoAdapter.resolutionName("auto"));
        assertEquals("", OpenAiCompatVideoAdapter.resolutionName(null));
    }
}
