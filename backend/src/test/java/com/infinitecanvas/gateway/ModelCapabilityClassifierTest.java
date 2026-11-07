package com.infinitecanvas.gateway;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ModelCapabilityClassifierTest {
    private final ObjectMapper json = new ObjectMapper();

    @ParameterizedTest
    @CsvSource({
            "gpt-4o-vision,llm", "gpt-4o-image-understanding,llm", "gpt-4o-image-analysis,llm",
            "claude-3-7-sonnet-image-understanding,llm", "gemini-2.5-pro-image-understanding,llm",
            "gemini-2.5-pro-vision,llm", "deepseek-vl2,llm", "qwen2.5-vl,llm",
            "gemini-2.5-flash-image,image", "gemini-2.0-flash-exp-image-generation,image",
            "gemini-3-pro-image-preview,image", "gpt-4o-image,image", "gpt-image-1,image",
            "models/gemini-2.5-flash-image-preview,image", "provider/claude-sonnet-4-5,llm",
            "embedding-3,unknown", "rerank-v3,unknown", "opaque-image-alias,unknown"
    })
    void visionUnderstandingMustNotBeMistakenForImageGeneration(String id, String capability) {
        assertEquals(capability, ModelCapabilityClassifier.classify(id));
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "opaque|{\"capabilities\":[\"image\"]}|image",
            "opaque|{\"supported_endpoint_types\":[\"chat-completions\"]}|llm",
            "opaque|{\"task\":\"text-to-video\"}|video",
            "opaque|{\"architecture\":{\"output_modalities\":[\"text\"]}}|llm",
            "gpt-4o|{\"input_modalities\":[\"text\",\"image\"]}|llm",
            "opaque|{\"input_modalities\":[\"image\"]}|unknown",
            "gpt-4o|{\"type\":\"embedding\"}|unknown",
            "opaque|{\"capabilities\":[\"image\",\"video\"]}|unknown",
            "opaque|{\"output_modalities\":[\"text\",\"image\"]}|unknown",
            "opaque|{\"capabilities\":{\"image\":false,\"text\":true}}|llm"
    })
    void onlyExplicitUnambiguousOutputSignalsAreAuthoritative(String id, String metadata, String capability) throws Exception {
        assertEquals(capability, ModelCapabilityClassifier.classify(id, json.readTree(metadata)));
    }
}
