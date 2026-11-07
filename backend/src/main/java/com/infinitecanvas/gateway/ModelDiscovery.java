package com.infinitecanvas.gateway;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** URL and response compatibility for upstream model discovery. */
final class ModelDiscovery {
    private static final List<String> COMPAT_SUFFIXES = List.of(
            "/api/claudecode", "/api/anthropic", "/apps/anthropic", "/api/coding",
            "/claudecode", "/anthropic", "/step_plan", "/coding", "/claude");

    private ModelDiscovery() {}

    static List<String> urls(String baseUrl, String override) {
        URI base = httpUri(baseUrl.trim());
        if (base.getRawQuery() != null) throw new IllegalArgumentException("渠道 Base URL 不能包含查询参数");
        if (override != null && !override.isBlank()) {
            // Treat relative paths as children of the configured base path.
            URI directory = URI.create(base.toString().replaceAll("/+$", "") + "/");
            URI resolved = httpUri(directory.resolve(override.trim()).normalize().toString());
            if (!base.getScheme().equalsIgnoreCase(resolved.getScheme())
                    || !base.getHost().equalsIgnoreCase(resolved.getHost()) || port(base) != port(resolved)) {
                throw new IllegalArgumentException("模型列表 URL 必须与渠道 Base URL 同源");
            }
            return List.of(resolved.toString());
        }
        String root = base.toString().replaceAll("/+$", "");
        Set<String> urls = new LinkedHashSet<>();
        addCandidates(urls, root);
        String path = base.getPath().replaceAll("/+$", "");
        for (String suffix : COMPAT_SUFFIXES) {
            if (path.endsWith(suffix)) {
                addCandidates(urls, root.substring(0, root.length() - suffix.length()));
                break;
            }
        }
        return List.copyOf(urls);
    }

    private static URI httpUri(String value) {
        URI uri = URI.create(value);
        if (!("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))
                || uri.getHost() == null || uri.getRawUserInfo() != null || uri.getRawFragment() != null) {
            throw new IllegalArgumentException("模型列表地址必须为有效的 HTTP(S) URL，不能包含凭据或片段");
        }
        return uri;
    }

    private static int port(URI uri) {
        return uri.getPort() == -1 ? ("https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80) : uri.getPort();
    }

    private static void addCandidates(Set<String> urls, String base) {
        if (base.endsWith("/v1")) {
            urls.add(base + "/models");
            urls.add(base.substring(0, base.length() - 3) + "/models");
        } else {
            urls.add(base + "/v1/models");
            urls.add(base + "/models");
        }
    }

    static List<UpstreamClient.DiscoveredModel> parseDiscovered(JsonNode body) {
        java.util.Map<String, String> models = new java.util.LinkedHashMap<>();
        boolean recognized = false;
        if (body != null && body.isArray()) {
            collect(body, models, true);
            recognized = true;
        } else if (body != null && body.isObject()) {
            if (body.path("data").isArray()) {
                collect(body.get("data"), models, false);
                recognized = true;
            }
            if (body.path("models").isArray()) {
                collect(body.get("models"), models, true);
                recognized = true;
            }
        }
        if (!recognized) throw new IllegalArgumentException("上游模型列表响应格式无法识别");
        return models.entrySet().stream().map(entry -> new UpstreamClient.DiscoveredModel(entry.getKey(), entry.getValue())).toList();
    }

    private static void collect(JsonNode array, java.util.Map<String, String> models, boolean alternate) {
        for (JsonNode item : array) {
            String id = null;
            if (item.isTextual() && alternate) id = item.textValue().trim();
            if (item.isObject()) {
                for (String key : alternate ? List.of("slug", "id", "name") : List.of("id")) {
                    JsonNode value = item.get(key);
                    if (value != null && value.isTextual() && !value.textValue().isBlank()) {
                        id = value.textValue().trim();
                        if ("name".equals(key) && id.startsWith("models/")) id = id.substring(7).trim();
                        if (!id.isEmpty()) break;
                    }
                }
            }
            if (id != null && !id.isBlank()) {
                String capability = ModelCapabilityClassifier.classify(id, item);
                models.merge(id, capability, (first, second) -> first.equals(second) ? first : "unknown");
            }
        }
    }
}
