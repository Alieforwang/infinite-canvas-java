package com.infinitecanvas.dev;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** Dev-only fake upstream implementing the OpenAI-compatible video protocol. */
@RestController
@Profile("dev")
@RequestMapping("/mock")
public class MockUpstreamController {

    private record MockTask(String id, long createdAt, String prompt) {
    }

    private final Map<String, MockTask> tasks = new ConcurrentHashMap<>();
    private final AtomicLong counter = new AtomicLong();

    @GetMapping("/v1/models")
    public Map<String, Object> models() {
        return Map.of("data", java.util.List.of(Map.of("id", "mock-video-1", "object", "model")));
    }

    @PostMapping("/v1/videos")
    public Map<String, Object> create(HttpServletRequest request) {
        String prompt = request.getParameter("prompt");
        String id = "mock_" + counter.incrementAndGet();
        tasks.put(id, new MockTask(id, Instant.now().toEpochMilli(), prompt == null ? "" : prompt));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", id);
        body.put("object", "video");
        body.put("status", "queued");
        body.put("progress", 0);
        body.put("created_at", Instant.now().getEpochSecond());
        return body;
    }

    @GetMapping("/v1/videos/{id}")
    public ResponseEntity<Map<String, Object>> query(@PathVariable String id) {
        MockTask task = tasks.get(id);
        if (task == null) {
            return ResponseEntity.status(404).body(Map.of("error", Map.of("message", "mock task not found")));
        }
        long elapsed = (Instant.now().toEpochMilli() - task.createdAt()) / 1000;
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", id);
        body.put("object", "video");
        if (task.prompt().contains("FAIL")) {
            body.put("status", "failed");
            body.put("error", Map.of("code", "mock_failed", "message", "模拟失败（prompt 含 FAIL）"));
            return ResponseEntity.ok(body);
        }
        if (elapsed >= 4) {
            body.put("status", "completed");
            body.put("progress", 100);
            body.put("video_url", "http://127.0.0.1:8080/mock/v1/videos/" + id + "/content");
        } else if (elapsed >= 1) {
            body.put("status", "in_progress");
            body.put("progress", (int) Math.min(90, elapsed * 30));
        } else {
            body.put("status", "queued");
            body.put("progress", 0);
        }
        return ResponseEntity.ok(body);
    }

    @GetMapping("/v1/videos/{id}/content")
    public ResponseEntity<byte[]> content(@PathVariable String id) {
        if (!tasks.containsKey(id)) {
            return ResponseEntity.status(404).body("{\"error\":{\"message\":\"not found\"}}".getBytes(StandardCharsets.UTF_8));
        }
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("video/mp4"))
                .body(FakeMp4.bytes());
    }

    private static final class FakeMp4 {
        static byte[] bytes() {
            byte[] data = new byte[2048];
            // minimal ftyp box: size(4) + 'ftyp' + 'isom'
            data[0] = 0x00;
            data[1] = 0x00;
            data[2] = 0x00;
            data[3] = 0x18;
            data[4] = 'f';
            data[5] = 't';
            data[6] = 'y';
            data[7] = 'p';
            data[8] = 'i';
            data[9] = 's';
            data[10] = 'o';
            data[11] = 'm';
            return data;
        }
    }
}
