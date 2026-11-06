package com.infinitecanvas.controller;

import com.infinitecanvas.common.ApiResponse;
import com.infinitecanvas.common.PageResult;
import com.infinitecanvas.dto.AdminDtos;
import com.infinitecanvas.entity.CreditTransaction;
import com.infinitecanvas.security.AuthUtils;
import com.infinitecanvas.service.AdminUserService;
import org.slf4j.MDC;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/users")
public class AdminUserController {

    private final AdminUserService adminUserService;

    public AdminUserController(AdminUserService adminUserService) {
        this.adminUserService = adminUserService;
    }

    @GetMapping
    public ApiResponse<PageResult<AdminDtos.AdminUserView>> list(
            @RequestParam(value = "keyword", required = false) String keyword,
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "pageSize", defaultValue = "20") int pageSize) {
        return ApiResponse.ok(adminUserService.list(keyword, status, Math.max(page, 1),
                Math.min(Math.max(pageSize, 1), 100)));
    }

    @GetMapping("/{id}")
    public ApiResponse<AdminDtos.AdminUserView> detail(@PathVariable Long id) {
        return ApiResponse.ok(adminUserService.detail(id));
    }

    @PostMapping("/{id}/status")
    public ApiResponse<Void> setStatus(@PathVariable Long id, @RequestBody AdminDtos.UserStatusRequest request) {
        adminUserService.setStatus(id, request.status(), request.reason(), AuthUtils.adminId(), requestId());
        return ApiResponse.ok(null);
    }

    @PostMapping("/{id}/credits")
    public ApiResponse<Void> adjust(@PathVariable Long id, @RequestBody AdminDtos.CreditAdjustRequest request) {
        adminUserService.adjust(id, request.amount(), request.reason(), AuthUtils.adminId(), requestId());
        return ApiResponse.ok(null);
    }

    @PostMapping("/{id}/recharge")
    public ApiResponse<Void> recharge(@PathVariable Long id, @RequestBody AdminDtos.RechargeRequest request) {
        adminUserService.recharge(id, request.amount(), request.remark(), AuthUtils.adminId(), requestId());
        return ApiResponse.ok(null);
    }

    @PostMapping("/{id}/plan")
    public ApiResponse<Void> grantPlan(@PathVariable Long id, @RequestBody AdminDtos.PlanGrantRequest request) {
        adminUserService.grantPlan(id, request.planId(), request.reason(), AuthUtils.adminId(), requestId());
        return ApiResponse.ok(null);
    }

    @GetMapping("/{id}/transactions")
    public ApiResponse<List<CreditTransaction>> transactions(@PathVariable Long id,
                                                             @RequestParam(defaultValue = "1") int page,
                                                             @RequestParam(defaultValue = "20") int pageSize) {
        return ApiResponse.ok(adminUserService.transactions(id, Math.max(page, 1),
                Math.min(Math.max(pageSize, 1), 100)));
    }

    private static String requestId() {
        return MDC.get(com.infinitecanvas.common.RequestIdFilter.MDC_KEY);
    }
}
