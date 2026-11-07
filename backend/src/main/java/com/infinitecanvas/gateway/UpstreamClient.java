package com.infinitecanvas.gateway;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.config.AppProperties;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.entity.UpstreamCallLog;
import com.infinitecanvas.mapper.UpstreamCallLogMapper;
import com.infinitecanvas.service.CryptoService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.time.LocalDateTime;
import java.util.Map;

@Component
public class UpstreamClient {

    private static final Logger log = LoggerFactory.getLogger(UpstreamClient.class);

    private final AppProperties props;
    private final CryptoService cryptoService;
    private final UpstreamCallLogMapper callLogMapper;
    private final ObjectMapper objectMapper;
    private final RestClient http;
    private final RestClient modelsHttp;
    private final com.infinitecanvas.service.SsrfGuard ssrfGuard;

    public UpstreamClient(AppProperties props, CryptoService cryptoService,
                          UpstreamCallLogMapper callLogMapper, ObjectMapper objectMapper,
                          com.infinitecanvas.service.SsrfGuard ssrfGuard) {
        this.props = props;
        this.cryptoService = cryptoService;
        this.callLogMapper = callLogMapper;
        this.objectMapper = objectMapper;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(props.getUpstream().getConnectTimeoutMs());
        factory.setReadTimeout(Math.max(props.getUpstream().getCreateTimeoutMs(), props.getUpstream().getDownloadTimeoutMs()));
        this.http = RestClient.builder().requestFactory(factory).build();
        this.ssrfGuard = ssrfGuard;
        SimpleClientHttpRequestFactory modelsFactory = new SimpleClientHttpRequestFactory() {
            @Override
            protected void prepareConnection(java.net.HttpURLConnection connection, String method) throws java.io.IOException {
                super.prepareConnection(connection, method);
                connection.setInstanceFollowRedirects(false);
            }
        };
        modelsFactory.setConnectTimeout(props.getUpstream().getConnectTimeoutMs());
        modelsFactory.setReadTimeout(props.getUpstream().getQueryTimeoutMs());
        this.modelsHttp = RestClient.builder().requestFactory(modelsFactory).build();
    }

    public record FilePart(String field, byte[] bytes, String filename) {
    }

    public JsonNode createVideo(Channel channel, Long taskId, String taskNo, String path,
                                Map<String, String> fields, java.util.List<FilePart> files) {
        String url = channel.getNormalizedBaseUrl() + path;
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        fields.forEach(body::add);
        for (FilePart file : files) {
            body.add(file.field(), new ByteArrayResource(file.bytes()) {
                @Override
                public String getFilename() {
                    return file.filename();
                }
            });
        }
        long start = System.currentTimeMillis();
        try {
            String raw = http.post().uri(url)
                    .headers(headers -> applyAuth(headers, channel))
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(body)
                    .retrieve()
                    .body(String.class);
            long latency = System.currentTimeMillis() - start;
            record(taskId, taskNo, "CREATE", 200, latency, null, null, raw);
            return objectMapper.readTree(raw == null ? "{}" : raw);
        } catch (RestClientResponseException ex) {
            long latency = System.currentTimeMillis() - start;
            record(taskId, taskNo, "CREATE", ex.getStatusCode().value(), latency, null, null, ex.getResponseBodyAsString());
            throw UpstreamException.of(channel, ex.getStatusCode().value(), ex.getResponseBodyAsString());
        } catch (Exception ex) {
            record(taskId, taskNo, "CREATE", null, System.currentTimeMillis() - start, null, null, ex.getMessage());
            throw new UpstreamException("UPSTREAM_UNREACHABLE", "无法连接上游服务", 502, ex.getMessage());
        }
    }

    public JsonNode postJson(Channel channel, Long taskId, String taskNo, String path, Map<String, Object> body) {
        String url = channel.getNormalizedBaseUrl() + path;
        long start = System.currentTimeMillis();
        try {
            String raw = http.post().uri(url)
                    .headers(headers -> applyAuth(headers, channel))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(objectMapper.writeValueAsString(body))
                    .retrieve()
                    .body(String.class);
            long latency = System.currentTimeMillis() - start;
            record(taskId, taskNo, "CREATE", 200, latency, null, null, raw);
            return objectMapper.readTree(raw == null ? "{}" : raw);
        } catch (RestClientResponseException ex) {
            long latency = System.currentTimeMillis() - start;
            record(taskId, taskNo, "CREATE", ex.getStatusCode().value(), latency, null, null, ex.getResponseBodyAsString());
            throw UpstreamException.of(channel, ex.getStatusCode().value(), ex.getResponseBodyAsString());
        } catch (Exception ex) {
            record(taskId, taskNo, "CREATE", null, System.currentTimeMillis() - start, null, null, ex.getMessage());
            throw new UpstreamException("UPSTREAM_UNREACHABLE", "无法连接上游服务", 502, ex.getMessage());
        }
    }

    public JsonNode getJson(Channel channel, Long taskId, String taskNo, String path) {
        String url = channel.getNormalizedBaseUrl() + path;
        long start = System.currentTimeMillis();
        try {
            String raw = http.get().uri(url)
                    .headers(headers -> applyAuth(headers, channel))
                    .retrieve()
                    .body(String.class);
            record(taskId, taskNo, "QUERY", 200, System.currentTimeMillis() - start, null, null, raw);
            return objectMapper.readTree(raw == null ? "{}" : raw);
        } catch (RestClientResponseException ex) {
            record(taskId, taskNo, "QUERY", ex.getStatusCode().value(), System.currentTimeMillis() - start, null, null, ex.getResponseBodyAsString());
            throw UpstreamException.of(channel, ex.getStatusCode().value(), ex.getResponseBodyAsString());
        } catch (Exception ex) {
            record(taskId, taskNo, "QUERY", null, System.currentTimeMillis() - start, null, null, ex.getMessage());
            throw new UpstreamException("UPSTREAM_UNREACHABLE", "无法连接上游服务", 502, ex.getMessage());
        }
    }

    public byte[] getBytes(Channel channel, Long taskId, String taskNo, String url, boolean withAuth) {
        long start = System.currentTimeMillis();
        try {
            byte[] bytes = http.get().uri(url)
                    .headers(headers -> {
                        if (withAuth) {
                            applyAuth(headers, channel);
                        }
                        headers.set(HttpHeaders.ACCEPT, "application/binary");
                    })
                    .retrieve()
                    .body(byte[].class);
            record(taskId, taskNo, "CONTENT", 200, System.currentTimeMillis() - start, null, null,
                    "bytes=" + (bytes == null ? 0 : bytes.length));
            if (bytes == null || bytes.length == 0) {
                throw new UpstreamException("UPSTREAM_BAD_BODY", "上游返回空内容", 502, "");
            }
            return bytes;
        } catch (RestClientResponseException ex) {
            record(taskId, taskNo, "CONTENT", ex.getStatusCode().value(), System.currentTimeMillis() - start, null, null, ex.getResponseBodyAsString());
            throw new UpstreamException("UPSTREAM_DOWNLOAD_FAILED", "下载视频失败", ex.getStatusCode().value(), ex.getResponseBodyAsString());
        } catch (UpstreamException ex) {
            throw ex;
        } catch (Exception ex) {
            record(taskId, taskNo, "CONTENT", null, System.currentTimeMillis() - start, null, null, ex.getMessage());
            throw new UpstreamException("UPSTREAM_DOWNLOAD_FAILED", "下载视频失败", 502, ex.getMessage());
        }
    }

    public java.util.List<String> listModels(Channel channel) {
        return listModels(channel, null);
    }

    public java.util.List<String> listModels(Channel channel, String modelsUrl) {
        return discoverModels(channel, modelsUrl).stream().map(DiscoveredModel::id).toList();
    }

    public record DiscoveredModel(String id, String capability) {}

    public java.util.List<DiscoveredModel> discoverModels(Channel channel, String modelsUrl) {
        String baseUrl = channel.getBaseUrl();
        if (baseUrl == null || baseUrl.isBlank()) baseUrl = channel.getNormalizedBaseUrl();
        java.util.List<String> urls = ModelDiscovery.urls(baseUrl, modelsUrl);
        for (int i = 0; i < urls.size(); i++) {
            String url = urls.get(i);
            ssrfGuard.assertBaseUrl(url);
            long start = System.currentTimeMillis();
            try {
                String raw = modelsHttp.get().uri(java.net.URI.create(url))
                        .headers(headers -> applyAuth(headers, channel))
                        .retrieve()
                        .onStatus(status -> status.is3xxRedirection(), (request, response) -> {
                            throw new UpstreamException("UPSTREAM_REDIRECT", "模型列表接口不允许重定向", 502, "");
                        })
                        .body(String.class);
                record(null, "", "QUERY", 200, System.currentTimeMillis() - start, null, null, null);
                return ModelDiscovery.parseDiscovered(objectMapper.readTree(raw == null ? "" : raw));
            } catch (RestClientResponseException ex) {
                int status = ex.getStatusCode().value();
                record(null, "", "QUERY", status, System.currentTimeMillis() - start, null, null, null);
                if ((status == 404 || status == 405) && i + 1 < urls.size()) continue;
                throw UpstreamException.of(channel, status, ex.getResponseBodyAsString());
            } catch (UpstreamException | IllegalArgumentException ex) {
                throw ex;
            } catch (com.fasterxml.jackson.core.JsonProcessingException ex) {
                throw new UpstreamException("UPSTREAM_BAD_BODY", "上游模型列表不是有效 JSON", 502, "");
            } catch (Exception ex) {
                throw new UpstreamException("UPSTREAM_UNREACHABLE", "无法连接上游模型列表服务", 502, "");
            }
        }
        throw new IllegalStateException("没有可用的模型列表地址");
    }

    void applyAuth(HttpHeaders headers, Channel channel) {
        String apiKey = cryptoService.decrypt(new String(channel.getApiKeyCipher(), java.nio.charset.StandardCharsets.UTF_8));
        if ("bearer".equalsIgnoreCase(channel.getAuthType())) {
            headers.setBearerAuth(apiKey);
        } else {
            headers.set(channel.getAuthHeader() == null || channel.getAuthHeader().isBlank() ? "Authorization" : channel.getAuthHeader(), apiKey);
        }
    }

    void record(Long taskId, String taskNo, String action, Integer status, long latencyMs,
                        String upstreamRequestId, String errorCode, String snippet) {
        try {
            UpstreamCallLog entry = new UpstreamCallLog();
            entry.setTaskId(taskId);
            entry.setTaskNo(taskNo == null ? "" : taskNo);
            entry.setAction(action);
            entry.setAttempt(1);
            entry.setHttpStatus(status);
            entry.setLatencyMs((int) latencyMs);
            entry.setUpstreamRequestId(upstreamRequestId);
            entry.setErrorCode(errorCode);
            entry.setResponseSnippet(snippet == null ? "" : snippet.substring(0, Math.min(4000, snippet.length())));
            entry.setCreatedAt(LocalDateTime.now());
            callLogMapper.insert(entry);
        } catch (Exception ex) {
            log.warn("failed to record upstream call log", ex);
        }
    }
}
