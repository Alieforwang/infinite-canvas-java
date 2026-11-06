package com.infinitecanvas.dto;

import java.util.Map;

public final class CanvasDtos {

    private CanvasDtos() {
    }

    public record ProjectSummary(String projectNo, String title, String coverUrl, int nodeCount,
                                 int version, String updatedAt) {
    }

    public record ProjectDetail(String projectNo, String title, Map<String, Object> document, int version,
                                String createdAt, String updatedAt) {
    }

    public record ProjectCreateRequest(String title, Map<String, Object> document) {
    }

    public record ProjectUpdateRequest(Integer version, String title, Map<String, Object> document) {
    }
}
