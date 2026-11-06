package com.infinitecanvas.dto;

import java.util.List;
import java.util.Map;

public final class TaskDtos {

    private TaskDtos() {
    }

    public record FileView(String fileNo, String url, String contentType, Long bytes,
                           Integer width, Integer height, Integer durationMs) {
    }

    public record TaskView(String taskNo, String status, int progress, String modelName,
                           String prompt, Map<String, Object> params, List<String> referenceFileNos,
                           Long heldCredits, Long settledCredits, String errorCode, String errorMessage,
                           FileView file, String createdAt, String finishedAt) {
    }

    public record CreateResult(String taskNo, String status, long estimatedCredits, long heldCredits, long pollAfterMs) {
    }

    public record CancelResult(String taskNo, String status, long refundCredits) {
    }
}
