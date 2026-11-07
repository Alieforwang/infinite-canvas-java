package com.infinitecanvas.gateway;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/** Classifies discovery inventory, independently of a channel's configured dispatch capabilities. */
public final class ModelCapabilityClassifier {
    private ModelCapabilityClassifier() {}

    public static String classify(String modelId) {
        return classify(modelId, null);
    }

    public static String classify(String modelId, JsonNode metadata) {
        Set<String> explicit = new LinkedHashSet<>();
        if (metadata != null && metadata.isObject()) {
            for (String key : new String[]{"capability", "capabilities", "type", "task", "pipeline_tag",
                    "output_modalities", "supported_endpoint_types"}) {
                collect(metadata.get(key), explicit);
            }
            collect(metadata.path("architecture").get("output_modalities"), explicit);
        }
        // Conflicting/multiple output capabilities require review; do not silently pick a creative route.
        if (!explicit.isEmpty()) return explicit.size() == 1 ? explicit.iterator().next() : "unknown";

        String id = modelId == null ? "" : modelId.trim().toLowerCase(Locale.ROOT);
        id = id.substring(id.lastIndexOf('/') + 1);
        if (id.matches("(?:gpt-image|chatgpt-image|dall-e|flux|imagen|ideogram|stable-diffusion|sdxl|sd3|midjourney|qwen-image|hunyuan-?image|(?:doubao-)?seedream)(?:[-_.].*|[0-9].*|$)")
                || id.matches("gpt-4o-image(?:-generation(?:[-_.].*)?|$)")
                || id.matches("gemini-.*(?:flash(?:-exp)?-image|pro-image)(?:-(?:preview|generation)(?:[-_.].*)?|-[0-9][0-9.-]*|$)")) return "image";
        if (id.matches("(?:sora|veo|kling|wan|hunyuan-?video|(?:doubao-)?seedance|runway|luma|hailuo|minimax-video)(?:[-_.].*|[0-9].*|$)")) return "video";
        // Exclude non-generative/unsupported families before the language prefix rules.
        if (id.contains("embedding") || id.contains("rerank") || id.contains("whisper") || id.contains("tts")) return "unknown";
        if (id.matches("(?:gpt|claude|deepseek|gemini|qwen|llama|mistral|mixtral|glm|chatglm|grok|ernie|command-r|jamba)(?:[-_.].*|[0-9].*|$)")
                || id.matches("o[134](?:[-_.].*|$)")) return "llm";
        return "unknown";
    }

    private static void collect(JsonNode value, Set<String> capabilities) {
        if (value == null || value.isNull()) return;
        if (value.isArray()) {
            value.forEach(item -> collect(item, capabilities));
        } else if (value.isObject()) {
            value.fields().forEachRemaining(entry -> {
                if (entry.getValue().isBoolean() && entry.getValue().booleanValue()) add(entry.getKey(), capabilities);
            });
        } else if (value.isTextual()) {
            add(value.textValue(), capabilities);
        }
    }

    private static void add(String value, Set<String> capabilities) {
        String token = value.trim().toLowerCase(Locale.ROOT).replace('_', '-');
        String capability = switch (token) {
            case "llm", "language", "text", "chat", "chat-completion", "chat-completions", "chat.completions",
                    "text-generation", "text-completion", "completion", "completions" -> "llm";
            case "image", "images", "image-generation", "text-to-image", "text2image" -> "image";
            case "video", "videos", "video-generation", "text-to-video", "image-to-video", "text2video" -> "video";
            case "unknown", "embedding", "embeddings", "rerank", "audio", "speech", "transcription" -> "unknown";
            default -> null;
        };
        if (capability != null) capabilities.add(capability);
    }
}
