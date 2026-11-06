package com.infinitecanvas.controller;

import com.infinitecanvas.common.ApiResponse;
import com.infinitecanvas.common.PageResult;
import com.infinitecanvas.dto.AssetDtos;
import com.infinitecanvas.security.AuthUtils;
import com.infinitecanvas.service.AssetService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/assets")
public class AssetController {

    private final AssetService assetService;

    public AssetController(AssetService assetService) {
        this.assetService = assetService;
    }

    @GetMapping
    public ApiResponse<PageResult<AssetDtos.AssetView>> list(
            @RequestParam(value = "kind", required = false) String kind,
            @RequestParam(value = "keyword", required = false) String keyword,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "pageSize", defaultValue = "20") int pageSize) {
        return ApiResponse.ok(assetService.list(AuthUtils.userId(), kind, keyword, Math.max(page, 1),
                Math.min(Math.max(pageSize, 1), 100)));
    }

    @PostMapping
    public ApiResponse<AssetDtos.AssetView> create(@RequestBody AssetDtos.AssetRequest request) {
        return ApiResponse.ok(assetService.create(AuthUtils.userId(), request));
    }

    @GetMapping("/{assetNo}")
    public ApiResponse<AssetDtos.AssetView> detail(@PathVariable String assetNo) {
        return ApiResponse.ok(assetService.detail(AuthUtils.userId(), assetNo));
    }

    @PutMapping("/{assetNo}")
    public ApiResponse<AssetDtos.AssetView> update(@PathVariable String assetNo,
                                                   @RequestBody AssetDtos.AssetRequest request) {
        return ApiResponse.ok(assetService.update(AuthUtils.userId(), assetNo, request));
    }

    @DeleteMapping("/{assetNo}")
    public ApiResponse<Void> delete(@PathVariable String assetNo) {
        assetService.delete(AuthUtils.userId(), assetNo);
        return ApiResponse.ok(null);
    }
}
