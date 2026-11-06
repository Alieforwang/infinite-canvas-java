package com.infinitecanvas.controller;

import com.infinitecanvas.common.ApiResponse;
import com.infinitecanvas.dto.TaskDtos;
import com.infinitecanvas.security.AuthUtils;
import com.infinitecanvas.service.ImageTaskService;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.MDC;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/image-tasks")
public class ImageTaskController {
    private final ImageTaskService service;
    public ImageTaskController(ImageTaskService service) { this.service = service; }

    @PostMapping(consumes = "application/json")
    public ApiResponse<TaskDtos.TaskView> create(@RequestBody ImageTaskService.CreateCommand command,
            @RequestHeader(value = "Idempotency-Key", required = false) String key, HttpServletRequest request) {
        return ApiResponse.ok(service.create(AuthUtils.userId(), command, key,
                request.getRemoteAddr(), MDC.get("requestId")));
    }

    @GetMapping("/{taskNo}")
    public ApiResponse<TaskDtos.TaskView> get(@PathVariable String taskNo) {
        return ApiResponse.ok(service.get(AuthUtils.userId(), taskNo));
    }
}
