package com.infinitecanvas.gateway;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.service.SsrfGuard;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.util.List;
import java.util.Map;

/** OpenAI image requests are synchronous. Never follows redirects with channel credentials. */
@Component
public class OpenAiCompatImageAdapter {
    public static final int MAX_IMAGE_BYTES = 20 * 1024 * 1024;
    private static final int MAX_JSON_BYTES = 29 * 1024 * 1024;
    private final RestClient http;
    private final UpstreamClient upstream;
    private final SsrfGuard ssrf;
    private final ObjectMapper json;

    public OpenAiCompatImageAdapter(UpstreamClient upstream, SsrfGuard ssrf, ObjectMapper json) {
        this.upstream = upstream;
        this.ssrf = ssrf;
        this.json = json;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory() {
            @Override protected void prepareConnection(HttpURLConnection connection, String method) throws IOException {
                super.prepareConnection(connection, method);
                connection.setInstanceFollowRedirects(false);
            }
        };
        factory.setConnectTimeout(20_000);
        factory.setReadTimeout(180_000);
        http = RestClient.builder().requestFactory(factory).build();
    }

    public JsonNode generate(Channel channel, Long taskId, String taskNo, String model, String prompt,
                             String size, List<UpstreamClient.FilePart> references) {
        String base = channel.getNormalizedBaseUrl();
        String url = base + (references.isEmpty() ? "/v1/images/generations" : "/v1/images/edits");
        ssrf.assertResultUrl(url);
        long start = System.currentTimeMillis();
        try {
            var request = http.post().uri(url).headers(headers -> upstream.applyAuth(headers, channel));
            Object body;
            MediaType type;
            if (references.isEmpty()) {
                body = Map.of("model", model, "prompt", prompt, "size", size, "n", 1);
                type = MediaType.APPLICATION_JSON;
            } else {
                var multipart = new LinkedMultiValueMap<String, Object>();
                multipart.add("model", model);
                multipart.add("prompt", prompt);
                multipart.add("size", size);
                multipart.add("n", "1");
                for (var reference : references) {
                    var headers = new org.springframework.http.HttpHeaders();
                    headers.setContentType(org.springframework.http.MediaTypeFactory.getMediaType(reference.filename())
                            .orElse(MediaType.APPLICATION_OCTET_STREAM));
                    var resource = new ByteArrayResource(reference.bytes()) {
                        @Override public String getFilename() { return reference.filename(); }
                    };
                    multipart.add(references.size() == 1 ? "image" : "image[]",
                            new org.springframework.http.HttpEntity<>(resource, headers));
                }
                body = multipart;
                type = MediaType.MULTIPART_FORM_DATA;
            }
            return request.contentType(type).body(body).exchange((req, response) -> {
                int status = response.getStatusCode().value();
                upstream.record(taskId, taskNo, "IMAGE_CREATE", status, System.currentTimeMillis() - start,
                        response.getHeaders().getFirst("x-request-id"), null, "image response (body omitted)");
                if (!response.getStatusCode().is2xxSuccessful()) throw UpstreamException.of(channel, status, "");
                byte[] bytes = response.getBody().readNBytes(MAX_JSON_BYTES + 1);
                if (bytes.length > MAX_JSON_BYTES) throw invalid("图片响应超过大小限制");
                return json.readTree(bytes);
            });
        } catch (UpstreamException ex) {
            throw ex;
        } catch (Exception ex) {
            upstream.record(taskId, taskNo, "IMAGE_CREATE", null, System.currentTimeMillis() - start,
                    null, "UPSTREAM_UNREACHABLE", "image request failed");
            throw new UpstreamException("UPSTREAM_UNREACHABLE", "图片上游请求失败或超时", 502, "");
        }
    }

    public record ImageDownload(byte[] bytes, String contentType) { }

    /** Generated URLs are untrusted and receive no channel Authorization header. */
    public ImageDownload download(String url, Long taskId, String taskNo) {
        ssrf.assertResultUrl(url);
        long start = System.currentTimeMillis();
        try {
            return http.get().uri(url).exchange((request, response) -> {
                int status = response.getStatusCode().value();
                upstream.record(taskId, taskNo, "IMAGE_DOWNLOAD", status, System.currentTimeMillis() - start,
                        null, null, "image download (URL and body omitted)");
                if (!response.getStatusCode().is2xxSuccessful()) throw invalid("图片下载失败");
                MediaType type = response.getHeaders().getContentType();
                String contentType = type == null ? "" : type.getType() + "/" + type.getSubtype();
                if (!List.of("image/png", "image/jpeg", "image/webp").contains(contentType)) {
                    throw invalid("上游返回的文件不是支持的图片类型");
                }
                if (response.getHeaders().getContentLength() > MAX_IMAGE_BYTES) throw invalid("图片超过大小限制");
                byte[] bytes = response.getBody().readNBytes(MAX_IMAGE_BYTES + 1);
                if (bytes.length == 0 || bytes.length > MAX_IMAGE_BYTES) throw invalid("图片为空或超过大小限制");
                return new ImageDownload(bytes, contentType);
            });
        } catch (UpstreamException ex) {
            throw ex;
        } catch (Exception ex) {
            upstream.record(taskId, taskNo, "IMAGE_DOWNLOAD", null, System.currentTimeMillis() - start,
                    null, "UPSTREAM_INVALID_IMAGE", "image download failed (URL omitted)");
            throw invalid("图片下载失败");
        }
    }

    static UpstreamException invalid(String message) {
        return new UpstreamException("UPSTREAM_INVALID_IMAGE", message, 502, "");
    }
}
