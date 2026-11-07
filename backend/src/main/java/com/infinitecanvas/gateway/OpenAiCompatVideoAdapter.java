package com.infinitecanvas.gateway;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.entity.VideoModel;
import com.infinitecanvas.entity.VideoTask;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * OpenAI-compatible video adapter. Profiles:
 * - openai-official: minimal multipart (/v1/videos) with model/prompt/seconds/size/input_reference
 * - newapi: multipart with the common aggregator extensions (ratio, resolution_name, generate_audio, watermark, mode, image[] ...)
 * - sub2api: Grok JSON video API (/v1/videos/generations)
 * - json-envelope / dual-dialect: P1 (currently treated as newapi)
 */
@Component
public class OpenAiCompatVideoAdapter {

    static final String SUB2API_CREATE_PATH = "/v1/videos/generations";

    private final UpstreamClient client;
    private final ObjectMapper objectMapper;

    public OpenAiCompatVideoAdapter(UpstreamClient client, ObjectMapper objectMapper) {
        this.client = client;
        this.objectMapper = objectMapper;
    }

    public record CreateContext(Channel channel, VideoTask task, VideoModel model,
                                String prompt, int seconds, String size, String ratio, String resolution,
                                boolean generateAudio, boolean watermark, String mode,
                                List<byte[]> referenceImages) {
    }

    public JsonNode create(CreateContext ctx) {
        if ("sub2api".equalsIgnoreCase(ctx.channel().getProtocol())) {
            return client.postJson(ctx.channel(), ctx.task().getId(), ctx.task().getTaskNo(),
                    SUB2API_CREATE_PATH, buildSub2ApiBody(ctx));
        }
        if ("openai-json".equalsIgnoreCase(ctx.channel().getProtocol())) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", ctx.model().getUpstreamModel());
            body.put("prompt", ctx.prompt());
            // Superset of common JSON video dialects: OpenAI-style seconds/size plus
            // duration/aspect_ratio/resolution used by Grok/Veo-style gateways.
            body.put("seconds", String.valueOf(ctx.seconds()));
            body.put("duration", ctx.seconds());
            if (ctx.size() != null && !ctx.size().isBlank()) {
                body.put("size", ctx.size());
            }
            if (ctx.ratio() != null && !ctx.ratio().isBlank()) {
                body.put("aspect_ratio", ctx.ratio());
            }
            if (ctx.resolution() != null && !ctx.resolution().isBlank()) {
                body.put("resolution", ctx.resolution());
            }
            if (ctx.generateAudio()) {
                body.put("generate_audio", true);
            }
            // Gateways that follow the vendor metadata dialect (duoyuanx Wan/Seedance) need
            // reference images inside metadata.media; the OpenAI-style top-level fields alone
            // would silently turn a reference generation into text-to-video.
            if (!ctx.referenceImages().isEmpty()) {
                body.put("metadata", buildReferenceMetadata(ctx));
            }
            mergeExtraRequestParams(body, ctx.model().getExtraRequestParams());
            return client.postJson(ctx.channel(), ctx.task().getId(), ctx.task().getTaskNo(), "/v1/videos", body);
        }
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("model", ctx.model().getUpstreamModel());
        fields.put("prompt", ctx.prompt());
        fields.put("seconds", String.valueOf(ctx.seconds()));
        if (ctx.size() != null && !ctx.size().isBlank()) {
            fields.put("size", ctx.size());
        }
        List<UpstreamClient.FilePart> files = new ArrayList<>();
        boolean official = "openai-official".equalsIgnoreCase(ctx.channel().getProtocol());
        if (official) {
            if (!ctx.referenceImages().isEmpty()) {
                files.add(new UpstreamClient.FilePart("input_reference", ctx.referenceImages().get(0), "input_reference.png"));
            }
        } else {
            fields.put("ratio", ctx.ratio());
            fields.put("resolution_name", ctx.resolution());
            fields.put("generate_audio", String.valueOf(ctx.generateAudio()));
            fields.put("watermark", String.valueOf(ctx.watermark()));
            fields.put("mode", ctx.mode());
            if ("frames".equals(ctx.mode())) {
                if (ctx.referenceImages().size() > 0) {
                    files.add(new UpstreamClient.FilePart("first_frame", ctx.referenceImages().get(0), "first.png"));
                    files.add(new UpstreamClient.FilePart("images", ctx.referenceImages().get(0), "first.png"));
                }
                if (ctx.referenceImages().size() > 1) {
                    files.add(new UpstreamClient.FilePart("last_frame", ctx.referenceImages().get(1), "last.png"));
                    files.add(new UpstreamClient.FilePart("images", ctx.referenceImages().get(1), "last.png"));
                }
            } else {
                for (int i = 0; i < ctx.referenceImages().size(); i++) {
                    String name = "ref_" + (i + 1) + ".png";
                    files.add(new UpstreamClient.FilePart("image[]", ctx.referenceImages().get(i), name));
                    files.add(new UpstreamClient.FilePart("images", ctx.referenceImages().get(i), name));
                }
            }
        }
        return client.createVideo(ctx.channel(), ctx.task().getId(), ctx.task().getTaskNo(), "/v1/videos", fields, files);
    }

    public JsonNode query(Channel channel, VideoTask task) {
        return client.getJson(channel, task.getId(), task.getTaskNo(), "/v1/videos/" + task.getUpstreamTaskId());
    }

    public byte[] content(Channel channel, VideoTask task) {
        return client.getBytes(channel, task.getId(), task.getTaskNo(),
                channel.getNormalizedBaseUrl() + "/v1/videos/" + task.getUpstreamTaskId() + "/content", true);
    }

    public String resolveResultUrl(Channel channel, String url) {
        if (url != null && url.startsWith("/")) {
            return channel.getNormalizedBaseUrl() + url;
        }
        return url;
    }

    public byte[] downloadResultUrl(Channel channel, VideoTask task, String url) {
        return client.getBytes(channel, task.getId(), task.getTaskNo(), url, false);
    }

    public String extractTaskId(JsonNode root) {
        List<String> keys = List.of("id", "task_id", "request_id");
        for (String key : keys) {
            JsonNode node = root.get(key);
            if (node != null && !node.isNull() && !node.asText().isBlank()) {
                return node.asText();
            }
        }
        JsonNode data = root.get("data");
        if (data != null) {
            if (data.isArray() && !data.isEmpty()) {
                return extractTaskId(data.get(0));
            }
            if (data.isObject()) {
                return extractTaskId(data);
            }
        }
        JsonNode task = root.get("task");
        if (task != null && task.isObject()) {
            return extractTaskId(task);
        }
        return null;
    }

    public String extractStatus(JsonNode root) {
        String[] keys = {"status", "state", "task_status"};
        for (String key : keys) {
            JsonNode node = findField(root, key);
            if (node != null && !node.isNull()) {
                return node.asText().toLowerCase();
            }
        }
        return "";
    }

    public int extractProgress(JsonNode root) {
        JsonNode node = findField(root, "progress");
        if (node != null && node.isNumber()) {
            return node.asInt();
        }
        return 0;
    }

    public String extractResultUrl(JsonNode root) {
        String[] keys = {"video_url", "result_url", "url"};
        for (String key : keys) {
            JsonNode node = findField(root, key);
            if (node != null && node.isTextual() && !node.asText().isBlank()) {
                return node.asText();
            }
        }
        for (String parent : new String[]{"video", "content", "metadata", "output", "data"}) {
            JsonNode node = findField(root, parent);
            if (node != null && node.isObject()) {
                String nested = extractResultUrl(node);
                if (nested != null) {
                    return nested;
                }
            }
            if (node != null && node.isArray() && !node.isEmpty()) {
                String nested = extractResultUrl(node.get(0));
                if (nested != null) {
                    return nested;
                }
            }
        }
        return null;
    }

    public String extractErrorMessage(JsonNode root) {
        JsonNode error = findField(root, "error");
        if (error != null && !error.isNull()) {
            if (error.isTextual()) {
                return error.asText();
            }
            JsonNode message = error.get("message");
            if (message != null && message.isTextual()) {
                return message.asText();
            }
        }
        JsonNode message = findField(root, "message");
        return message == null || message.isNull() ? null : message.asText();
    }

    public String toJson(Map<String, Object> value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            return "{}";
        }
    }

    public JsonNode parse(String raw) {
        try {
            return objectMapper.readTree(raw == null ? "{}" : raw);
        } catch (Exception ex) {
            throw new UpstreamException("UPSTREAM_BAD_BODY", "无法解析上游响应", 502, raw);
        }
    }

    /** Vendor JSON dialect: generation params + reference images as data URLs under metadata.media. */
    Map<String, Object> buildReferenceMetadata(CreateContext ctx) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        if (ctx.resolution() != null && !ctx.resolution().isBlank()) {
            metadata.put("resolution", resolutionName(ctx.resolution()));
        }
        if (ctx.ratio() != null && !ctx.ratio().isBlank()) {
            metadata.put("ratio", ctx.ratio());
        }
        metadata.put("duration", ctx.seconds());
        metadata.put("audio", ctx.generateAudio());
        metadata.put("watermark", ctx.watermark());
        boolean frames = "frames".equalsIgnoreCase(ctx.mode());
        int limit = Math.min(ctx.referenceImages().size(), frames ? 2 : 10);
        List<Map<String, Object>> media = new ArrayList<>();
        for (int index = 0; index < limit; index++) {
            String type = frames ? (index == 0 ? "first_frame" : "last_frame") : "reference_image";
            media.add(Map.of("type", type, "url", imageDataUrl(ctx.referenceImages().get(index))));
        }
        metadata.put("media", media);
        return metadata;
    }

    static String imageDataUrl(byte[] bytes) {
        String mime = "image/png";
        if (bytes.length > 3 && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8) {
            mime = "image/jpeg";
        } else if (bytes.length > 11 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
                && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P') {
            mime = "image/webp";
        }
        return "data:" + mime + ";base64," + Base64.getEncoder().encodeToString(bytes);
    }

    static String resolutionName(String resolution) {
        String value = resolution == null ? "" : resolution.trim();
        if (value.matches("(?i)\\d+p")) {
            return value.substring(0, value.length() - 1) + "P";
        }
        return value;
    }

    Map<String, Object> buildSub2ApiBody(CreateContext ctx) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", ctx.model().getUpstreamModel());
        body.put("prompt", ctx.prompt());
        body.put("duration", ctx.seconds());
        if (ctx.ratio() != null && !ctx.ratio().isBlank()) {
            body.put("aspect_ratio", ctx.ratio());
        }
        if (ctx.resolution() != null && !ctx.resolution().isBlank()) {
            body.put("resolution", ctx.resolution());
        }
        if (!ctx.referenceImages().isEmpty()) {
            String dataUrl = "data:image/png;base64,"
                    + Base64.getEncoder().encodeToString(ctx.referenceImages().get(0));
            body.put("image", Map.of("url", dataUrl));
        }
        mergeExtraRequestParams(body, ctx.model().getExtraRequestParams());
        return body;
    }

    private void mergeExtraRequestParams(Map<String, Object> body, String rawExtraParams) {
        if (rawExtraParams == null || rawExtraParams.isBlank()) {
            return;
        }
        try {
            JsonNode extra = objectMapper.readTree(rawExtraParams);
            if (extra.isObject()) {
                extra.fields().forEachRemaining(entry ->
                        body.put(entry.getKey(), objectMapper.convertValue(entry.getValue(), Object.class)));
            }
        } catch (Exception ignored) {
            // Invalid extra params are ignored; the admin UI validates JSON on save.
        }
    }

    private JsonNode findField(JsonNode root, String key) {
        if (root == null) {
            return null;
        }
        if (root.has(key)) {
            return root.get(key);
        }
        JsonNode data = root.get("data");
        if (data != null) {
            if (data.isObject() && data.has(key)) {
                return data.get(key);
            }
            if (data.isArray() && !data.isEmpty() && data.get(0).has(key)) {
                return data.get(0).get(key);
            }
        }
        return null;
    }
}
