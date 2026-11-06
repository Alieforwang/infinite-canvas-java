package com.infinitecanvas.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.common.ApiResponse;
import com.infinitecanvas.common.PageResult;
import com.infinitecanvas.dto.TaskDtos;
import com.infinitecanvas.security.AuthUtils;
import com.infinitecanvas.service.VideoTaskService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/video-tasks")
public class VideoTaskController {

    private final VideoTaskService taskService;
    private final ObjectMapper objectMapper;

    public VideoTaskController(VideoTaskService taskService, ObjectMapper objectMapper) {
        this.taskService = taskService;
        this.objectMapper = objectMapper;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<TaskDtos.CreateResult> create(
            @RequestParam(value = "modelKey", required = false) String modelKey,
            @RequestParam(value = "modelId", required = false) Long modelId,
            @RequestParam("prompt") String prompt,
            @RequestParam(value = "seconds", defaultValue = "6") int seconds,
            @RequestParam(value = "resolution", required = false) String resolution,
            @RequestParam(value = "size", required = false) String size,
            @RequestParam(value = "ratio", required = false) String ratio,
            @RequestParam(value = "generateAudio", defaultValue = "false") boolean generateAudio,
            @RequestParam(value = "watermark", defaultValue = "false") boolean watermark,
            @RequestParam(value = "mode", defaultValue = "frames") String mode,
            @RequestParam(value = "referenceFileNos", required = false) String referenceFileNos,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            HttpServletRequest http) {
        List<String> refs = List.of();
        if (referenceFileNos != null && !referenceFileNos.isBlank()) {
            try {
                refs = objectMapper.readValue(referenceFileNos, new TypeReference<List<String>>() {
                });
            } catch (Exception ex) {
                throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.VALID_40001,
                        "referenceFileNos 必须是 JSON 数组");
            }
        }
        String requestId = org.slf4j.MDC.get(com.infinitecanvas.common.RequestIdFilter.MDC_KEY);
        return ApiResponse.ok(taskService.create(AuthUtils.userId(),
                new VideoTaskService.CreateCommand(modelKey, modelId, prompt, seconds, resolution, size, ratio,
                        generateAudio, watermark, mode, refs),
                idempotencyKey, http.getRemoteAddr(), requestId));
    }

    @GetMapping
    public ApiResponse<PageResult<TaskDtos.TaskView>> list(@RequestParam(value = "status", required = false) String status,
                                                           @RequestParam(value = "page", defaultValue = "1") int page,
                                                           @RequestParam(value = "pageSize", defaultValue = "20") int pageSize) {
        return ApiResponse.ok(taskService.list(AuthUtils.userId(), status, Math.max(page, 1), Math.min(Math.max(pageSize, 1), 100)));
    }

    @GetMapping("/{taskNo}")
    public ApiResponse<TaskDtos.TaskView> detail(@PathVariable String taskNo) {
        return ApiResponse.ok(taskService.detail(AuthUtils.userId(), taskNo));
    }

    @PostMapping("/{taskNo}/cancel")
    public ApiResponse<TaskDtos.CancelResult> cancel(@PathVariable String taskNo) {
        return ApiResponse.ok(taskService.cancel(AuthUtils.userId(), taskNo));
    }

    @DeleteMapping("/{taskNo}")
    public ApiResponse<Void> delete(@PathVariable String taskNo) {
        taskService.delete(AuthUtils.userId(), taskNo);
        return ApiResponse.ok(null);
    }
}
