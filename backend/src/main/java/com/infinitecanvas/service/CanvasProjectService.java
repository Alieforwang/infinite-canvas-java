package com.infinitecanvas.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.common.BizException;
import com.infinitecanvas.common.ErrorCode;
import com.infinitecanvas.common.Ulid;
import com.infinitecanvas.dto.CanvasDtos;
import com.infinitecanvas.entity.CanvasProject;
import com.infinitecanvas.entity.FileObject;
import com.infinitecanvas.mapper.CanvasProjectMapper;
import com.infinitecanvas.mapper.FileObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class CanvasProjectService {

    private static final int MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

    private final CanvasProjectMapper projectMapper;
    private final FileObjectMapper fileObjectMapper;
    private final FileStorageService fileStorageService;
    private final ObjectMapper objectMapper;

    public CanvasProjectService(CanvasProjectMapper projectMapper, FileObjectMapper fileObjectMapper,
                                FileStorageService fileStorageService, ObjectMapper objectMapper) {
        this.projectMapper = projectMapper;
        this.fileObjectMapper = fileObjectMapper;
        this.fileStorageService = fileStorageService;
        this.objectMapper = objectMapper;
    }

    public List<CanvasDtos.ProjectSummary> list(Long userId) {
        List<CanvasDtos.ProjectSummary> result = new ArrayList<>();
        for (CanvasProject project : projectMapper.selectByUserNotDeleted(userId, 200)) {
            result.add(new CanvasDtos.ProjectSummary(project.getProjectNo(), project.getTitle(),
                    coverUrl(project.getDocumentJson()), project.getNodeCount() == null ? 0 : project.getNodeCount(),
                    project.getVersion() == null ? 1 : project.getVersion(), format(project.getUpdatedAt())));
        }
        return result;
    }

    @Transactional
    public CanvasDtos.ProjectDetail create(Long userId, CanvasDtos.ProjectCreateRequest request) {
        Map<String, Object> document = request.document() == null ? Map.of() : request.document();
        String json = serialize(document);
        CanvasProject project = new CanvasProject();
        project.setProjectNo(Ulid.next());
        project.setUserId(userId);
        project.setTitle(request.title() == null || request.title().isBlank() ? "未命名画布" : request.title().trim());
        project.setDocumentJson(json);
        project.setDocumentBytes(json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
        project.setNodeCount(nodeCount(document));
        project.setFileCount(0);
        project.setVersion(1);
        project.setCreatedAt(LocalDateTime.now(ZoneOffset.UTC));
        project.setUpdatedAt(LocalDateTime.now(ZoneOffset.UTC));
        projectMapper.insert(project);
        return toDetail(project, document);
    }

    public CanvasDtos.ProjectDetail get(Long userId, String projectNo) {
        CanvasProject project = requireOwned(userId, projectNo);
        return toDetail(project, parse(project.getDocumentJson()));
    }

    @Transactional
    public CanvasDtos.ProjectDetail update(Long userId, String projectNo, CanvasDtos.ProjectUpdateRequest request) {
        CanvasProject project = requireOwned(userId, projectNo);
        if (request.version() == null || request.version() != project.getVersion()) {
            throw new BizException(ErrorCode.CANVAS_40901, "画布已在其他地方被修改，请重新加载",
                    Map.of("currentVersion", project.getVersion()), 409);
        }
        Map<String, Object> document = request.document() == null
                ? parse(project.getDocumentJson()) : request.document();
        String json = serialize(document);
        if (json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > MAX_DOCUMENT_BYTES) {
            throw new BizException(ErrorCode.UPLOAD_41301, "画布文档超过 4MB", null, 413);
        }
        int updated = projectMapper.updateWithVersion(
                project.getId(),
                request.title() == null || request.title().isBlank() ? project.getTitle() : request.title().trim(),
                json,
                json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length,
                nodeCount(document),
                project.getVersion(),
                LocalDateTime.now(ZoneOffset.UTC));
        if (updated == 0) {
            throw new BizException(ErrorCode.CANVAS_40901, "画布已被并发修改，请重新加载",
                    Map.of("currentVersion", project.getVersion()), 409);
        }
        CanvasProject fresh = projectMapper.selectById(project.getId());
        return toDetail(fresh, document);
    }

    @Transactional
    public void delete(Long userId, String projectNo) {
        CanvasProject project = requireOwned(userId, projectNo);
        projectMapper.softDelete(project.getId(), userId, LocalDateTime.now(ZoneOffset.UTC));
    }

    private CanvasProject requireOwned(Long userId, String projectNo) {
        CanvasProject project = projectMapper.selectByProjectNoAndUserNotDeleted(projectNo, userId);
        if (project == null) {
            throw new BizException(ErrorCode.CANVAS_40401, "画布不存在", null, 404);
        }
        return project;
    }

    private CanvasDtos.ProjectDetail toDetail(CanvasProject project, Map<String, Object> document) {
        return new CanvasDtos.ProjectDetail(project.getProjectNo(), project.getTitle(), document,
                project.getVersion() == null ? 1 : project.getVersion(),
                format(project.getCreatedAt()), format(project.getUpdatedAt()));
    }

    private String coverUrl(String documentJson) {
        return findImageCover(parse(documentJson));
    }

    @SuppressWarnings("unchecked")
    private String findImageCover(Object value) {
        if (value instanceof Map<?, ?> map) {
            Object key = map.get("storageKey");
            if (key instanceof String raw && !raw.isBlank()) {
                String fileNo = raw.startsWith("file:") || raw.startsWith("image:")
                        ? raw.substring(raw.indexOf(':') + 1) : raw;
                FileObject file = fileObjectMapper.selectByFileNoNotDeleted(fileNo);
                if (file != null && file.getContentType() != null && file.getContentType().startsWith("image/")) {
                    return fileStorageService.signedUrl(file);
                }
            }
            for (Object child : map.values()) {
                String found = findImageCover(child);
                if (found != null) {
                    return found;
                }
            }
        } else if (value instanceof java.util.List<?> list) {
            for (Object child : list) {
                String found = findImageCover(child);
                if (found != null) {
                    return found;
                }
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private String findStorageKey(Object value) {
        if (value instanceof Map<?, ?> map) {
            Object key = map.get("storageKey");
            if (key instanceof String s && !s.isBlank()) {
                return s;
            }
            for (Object child : map.values()) {
                String found = findStorageKey(child);
                if (found != null) {
                    return found;
                }
            }
        } else if (value instanceof List<?> list) {
            for (Object child : list) {
                String found = findStorageKey(child);
                if (found != null) {
                    return found;
                }
            }
        }
        return null;
    }

    private int nodeCount(Map<String, Object> document) {
        Object nodes = document.get("nodes");
        return nodes instanceof List<?> list ? list.size() : 0;
    }

    private String serialize(Map<String, Object> document) {
        try {
            return objectMapper.writeValueAsString(document);
        } catch (Exception ex) {
            throw new BizException(ErrorCode.VALID_40001, "画布文档无法序列化");
        }
    }

    private Map<String, Object> parse(String json) {
        try {
            return objectMapper.readValue(json == null ? "{}" : json, new TypeReference<Map<String, Object>>() {
            });
        } catch (Exception ex) {
            return Map.of();
        }
    }

    private static String format(LocalDateTime time) {
        return time == null ? null : time.toString() + "Z";
    }
}
