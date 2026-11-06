package com.infinitecanvas.dto;

import java.util.List;
import java.util.Map;

public final class AssetDtos {

    private AssetDtos() {
    }

    public record AssetView(String assetNo, String kind, String title, TaskDtos.FileView file, String coverUrl,
                            String textContent, List<String> tags, String source, String note,
                            Map<String, Object> metadata, String createdAt, String updatedAt) {
    }

    public record AssetRequest(String kind, String title, String fileNo, String textContent, List<String> tags,
                               String source, String note, Map<String, Object> metadata) {
    }
}
