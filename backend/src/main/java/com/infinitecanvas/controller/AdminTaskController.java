package com.infinitecanvas.controller;

import com.infinitecanvas.common.ApiResponse;
import com.infinitecanvas.common.PageResult;
import com.infinitecanvas.dto.AdminDtos;
import com.infinitecanvas.dto.TaskDtos;
import com.infinitecanvas.security.AuthUtils;
import com.infinitecanvas.service.AdminTaskService;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/tasks")
public class AdminTaskController {

    private final AdminTaskService adminTaskService;

    public AdminTaskController(AdminTaskService adminTaskService) {
        this.adminTaskService = adminTaskService;
    }

    public record RefundRequest(String reason) {
    }

    @GetMapping
    public ApiResponse<PageResult<AdminDtos.AdminTaskView>> list(
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "userId", required = false) Long userId,
            @RequestParam(value = "taskNo", required = false) String taskNo,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "pageSize", defaultValue = "20") int pageSize) {
        return ApiResponse.ok(adminTaskService.list(status, userId, taskNo, Math.max(page, 1),
                Math.min(Math.max(pageSize, 1), 100)));
    }

    @GetMapping("/{taskNo}")
    public ApiResponse<AdminDtos.AdminTaskDetail> detail(@PathVariable String taskNo) {
        return ApiResponse.ok(adminTaskService.detail(taskNo));
    }

    @PostMapping("/{taskNo}/retry")
    public ApiResponse<TaskDtos.CreateResult> retry(@PathVariable String taskNo) {
        return ApiResponse.ok(adminTaskService.retry(taskNo, AuthUtils.adminId()));
    }

    @PostMapping("/{taskNo}/refund")
    public ApiResponse<Void> refund(@PathVariable String taskNo, @RequestBody(required = false) RefundRequest request) {
        adminTaskService.refund(taskNo, request == null ? null : request.reason(), AuthUtils.adminId());
        return ApiResponse.ok(null);
    }

    @PostMapping("/{taskNo}/cancel")
    public ApiResponse<Void> cancel(@PathVariable String taskNo) {
        adminTaskService.cancel(taskNo, AuthUtils.adminId());
        return ApiResponse.ok(null);
    }
}
