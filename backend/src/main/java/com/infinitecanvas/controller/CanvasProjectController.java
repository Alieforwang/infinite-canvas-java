package com.infinitecanvas.controller;

import com.infinitecanvas.common.ApiResponse;
import com.infinitecanvas.dto.CanvasDtos;
import com.infinitecanvas.security.AuthUtils;
import com.infinitecanvas.service.CanvasProjectService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/canvas-projects")
public class CanvasProjectController {

    private final CanvasProjectService canvasProjectService;

    public CanvasProjectController(CanvasProjectService canvasProjectService) {
        this.canvasProjectService = canvasProjectService;
    }

    @GetMapping
    public ApiResponse<List<CanvasDtos.ProjectSummary>> list() {
        return ApiResponse.ok(canvasProjectService.list(AuthUtils.userId()));
    }

    @PostMapping
    public ApiResponse<CanvasDtos.ProjectDetail> create(@RequestBody CanvasDtos.ProjectCreateRequest request) {
        return ApiResponse.ok(canvasProjectService.create(AuthUtils.userId(), request));
    }

    @GetMapping("/{projectNo}")
    public ApiResponse<CanvasDtos.ProjectDetail> get(@PathVariable String projectNo) {
        return ApiResponse.ok(canvasProjectService.get(AuthUtils.userId(), projectNo));
    }

    @PutMapping("/{projectNo}")
    public ApiResponse<CanvasDtos.ProjectDetail> update(@PathVariable String projectNo,
                                                        @RequestBody CanvasDtos.ProjectUpdateRequest request) {
        return ApiResponse.ok(canvasProjectService.update(AuthUtils.userId(), projectNo, request));
    }

    @DeleteMapping("/{projectNo}")
    public ApiResponse<Void> delete(@PathVariable String projectNo) {
        canvasProjectService.delete(AuthUtils.userId(), projectNo);
        return ApiResponse.ok(null);
    }
}
