package com.infinitecanvas.controller;

import com.infinitecanvas.common.ApiResponse;
import com.infinitecanvas.common.PageResult;
import com.infinitecanvas.dto.AdminDtos;
import com.infinitecanvas.service.RedeemAdminService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/admin/redeem-codes")
public class AdminRedeemCodeController {

    private final RedeemAdminService redeemAdminService;

    public AdminRedeemCodeController(RedeemAdminService redeemAdminService) {
        this.redeemAdminService = redeemAdminService;
    }

    @GetMapping
    public ApiResponse<PageResult<AdminDtos.RedeemCodeView>> list(
            @RequestParam(value = "batchNo", required = false) String batchNo,
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "pageSize", defaultValue = "20") int pageSize) {
        return ApiResponse.ok(redeemAdminService.list(batchNo, status, Math.max(page, 1),
                Math.min(Math.max(pageSize, 1), 100)));
    }

    @PostMapping
    public ApiResponse<AdminDtos.RedeemGenerateResult> generate(@RequestBody AdminDtos.RedeemGenerateRequest request) {
        return ApiResponse.ok(redeemAdminService.generate(request));
    }

    @PostMapping("/{id}/disable")
    public ApiResponse<Void> disable(@PathVariable Long id) {
        redeemAdminService.disable(id);
        return ApiResponse.ok(null);
    }

    @GetMapping("/export")
    public ResponseEntity<byte[]> export(@RequestParam(value = "batchNo", required = false) String batchNo) {
        byte[] body = redeemAdminService.exportCsv(batchNo).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename("redeem-codes.csv").build().toString())
                .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
                .body(body);
    }
}
