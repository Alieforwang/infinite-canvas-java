package com.infinitecanvas.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.common.BizException;
import com.infinitecanvas.common.ErrorCode;
import com.infinitecanvas.common.PageResult;
import com.infinitecanvas.common.Ulid;
import com.infinitecanvas.dto.AssetDtos;
import com.infinitecanvas.entity.Asset;
import com.infinitecanvas.entity.FileObject;
import com.infinitecanvas.mapper.AssetMapper;
import com.infinitecanvas.mapper.FileObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class AssetService {

    private final AssetMapper assetMapper;
    private final FileObjectMapper fileObjectMapper;
    private final FileStorageService fileStorageService;
    private final ObjectMapper objectMapper;

    public AssetService(AssetMapper assetMapper, FileObjectMapper fileObjectMapper,
                        FileStorageService fileStorageService, ObjectMapper objectMapper) {
        this.assetMapper = assetMapper;
        this.fileObjectMapper = fileObjectMapper;
        this.fileStorageService = fileStorageService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public AssetDtos.AssetView create(Long userId, AssetDtos.AssetRequest request) {
        String kind = normalizeKind(request.kind());
        FileObject file = null;
        if (!"TEXT".equals(kind)) {
            if (request.fileNo() == null || request.fileNo().isBlank()) {
                throw new BizException(ErrorCode.VALID_40001, "该类型资产需要先上传文件");
            }
            file = requireOwnedFile(userId, request.fileNo());
        }
        Asset asset = new Asset();
        asset.setAssetNo(Ulid.next());
        asset.setUserId(userId);
        asset.setKind(kind);
        asset.setTitle(request.title() == null || request.title().isBlank()
                ? ("TEXT".equals(kind) ? "未命名文本" : (file == null ? "未命名资产" : file.getOriginalName()))
                : request.title().trim());
        asset.setFileId(file == null ? null : file.getId());
        asset.setCoverFileId(null);
        asset.setTextContent(request.textContent());
        asset.setTags(toJson(request.tags() == null ? List.of() : request.tags()));
        asset.setSource(request.source() == null || request.source().isBlank() ? "UPLOAD" : request.source());
        asset.setNote(request.note() == null ? "" : request.note());
        asset.setMetadata(request.metadata() == null ? null : toJson(request.metadata()));
        asset.setCreatedAt(LocalDateTime.now(ZoneOffset.UTC));
        asset.setUpdatedAt(LocalDateTime.now(ZoneOffset.UTC));
        assetMapper.insert(asset);
        return toView(asset);
    }

    public PageResult<AssetDtos.AssetView> list(Long userId, String kind, String keyword, int page, int pageSize) {
        String kindFilter = (kind != null && !kind.isBlank() && !"all".equalsIgnoreCase(kind))
                ? kind.toUpperCase() : null;
        String keywordFilter = (keyword != null && !keyword.isBlank()) ? keyword.trim() : null;
        long total = assetMapper.countPage(userId, kindFilter, keywordFilter);
        long offset = (long) (page - 1) * pageSize;
        List<AssetDtos.AssetView> views = new ArrayList<>();
        for (Asset asset : assetMapper.selectPage(userId, kindFilter, keywordFilter, offset, pageSize)) {
            views.add(toView(asset));
        }
        return PageResult.of(views, page, pageSize, total);
    }

    public AssetDtos.AssetView detail(Long userId, String assetNo) {
        return toView(requireOwned(userId, assetNo));
    }

    @Transactional
    public AssetDtos.AssetView update(Long userId, String assetNo, AssetDtos.AssetRequest request) {
        Asset asset = requireOwned(userId, assetNo);
        if (request.title() != null && !request.title().isBlank()) {
            asset.setTitle(request.title().trim());
        }
        if (request.textContent() != null) {
            asset.setTextContent(request.textContent());
        }
        if (request.tags() != null) {
            asset.setTags(toJson(request.tags()));
        }
        if (request.source() != null) {
            asset.setSource(request.source());
        }
        if (request.note() != null) {
            asset.setNote(request.note());
        }
        if (request.metadata() != null) {
            asset.setMetadata(toJson(request.metadata()));
        }
        if (request.fileNo() != null && !request.fileNo().isBlank()) {
            FileObject file = requireOwnedFile(userId, request.fileNo());
            asset.setFileId(file.getId());
        }
        asset.setUpdatedAt(LocalDateTime.now(ZoneOffset.UTC));
        assetMapper.updateById(asset);
        return toView(asset);
    }

    @Transactional
    public void delete(Long userId, String assetNo) {
        Asset asset = requireOwned(userId, assetNo);
        asset.setDeletedAt(LocalDateTime.now(ZoneOffset.UTC));
        assetMapper.updateById(asset);
    }

    public Asset requireOwned(Long userId, String assetNo) {
        Asset asset = assetMapper.selectByAssetNoAndUserNotDeleted(assetNo, userId);
        if (asset == null) {
            throw new BizException("ASSET_40401", "资产不存在", null, 404);
        }
        return asset;
    }

    public AssetDtos.AssetView toView(Asset asset) {
        FileObject file = asset.getFileId() == null ? null : fileObjectMapper.selectById(asset.getFileId());
        FileObject cover = asset.getCoverFileId() == null ? null : fileObjectMapper.selectById(asset.getCoverFileId());
        var fileView = file == null ? null : fileStorageService.toView(file);
        String coverUrl = null;
        if (cover != null) {
            coverUrl = fileStorageService.signedUrl(cover);
        } else if (file != null && file.getContentType() != null && file.getContentType().startsWith("image/")) {
            coverUrl = fileStorageService.signedUrl(file);
        }
        return new AssetDtos.AssetView(asset.getAssetNo(), asset.getKind().toLowerCase(), asset.getTitle(),
                fileView, coverUrl, asset.getTextContent(), fromJsonList(asset.getTags()), asset.getSource(),
                asset.getNote(), fromJsonMap(asset.getMetadata()),
                format(asset.getCreatedAt()), format(asset.getUpdatedAt()));
    }

    private FileObject requireOwnedFile(Long userId, String fileNo) {
        FileObject file = fileObjectMapper.selectByFileNoAndUserNotDeleted(fileNo, userId);
        if (file == null) {
            throw new BizException(ErrorCode.VALID_40004, "文件不存在");
        }
        return file;
    }

    private static String normalizeKind(String kind) {
        if (kind == null) {
            throw new BizException(ErrorCode.VALID_40001, "资产类型不能为空");
        }
        return switch (kind.toUpperCase()) {
            case "VIDEO", "IMAGE", "TEXT" -> kind.toUpperCase();
            default -> throw new BizException(ErrorCode.VALID_40001, "资产类型只能是 VIDEO/IMAGE/TEXT");
        };
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new BizException(ErrorCode.VALID_40001, "无法序列化字段");
        }
    }

    private List<String> fromJsonList(String json) {
        try {
            return json == null ? List.of() : objectMapper.readValue(json, new TypeReference<List<String>>() {
            });
        } catch (Exception ex) {
            return List.of();
        }
    }

    private Map<String, Object> fromJsonMap(String json) {
        try {
            return json == null ? null : objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {
            });
        } catch (Exception ex) {
            return null;
        }
    }

    private static String format(LocalDateTime time) {
        return time == null ? null : time.toString() + "Z";
    }
}
