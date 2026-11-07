package com.infinitecanvas.controller;

import com.infinitecanvas.common.ApiResponse;
import com.infinitecanvas.dto.AdminDtos;
import com.infinitecanvas.dto.ModelDtos;
import com.infinitecanvas.service.ModelService;
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
@RequestMapping("/api/admin/models")
public class AdminModelController {

    private final ModelService modelService;

    public AdminModelController(ModelService modelService) {
        this.modelService = modelService;
    }

    @GetMapping
    public ApiResponse<List<ModelDtos.ModelAdminView>> list(
            @org.springframework.web.bind.annotation.RequestParam(required = false) String capability) {
        return ApiResponse.ok(modelService.adminList(capability));
    }

    @GetMapping("/classification-preview")
    public ApiResponse<List<ModelDtos.ClassificationSuggestion>> classificationPreview() {
        return ApiResponse.ok(modelService.classificationPreview());
    }

    @PostMapping("/classification-apply")
    public ApiResponse<ModelDtos.ClassificationApplyResult> classificationApply(
            @RequestBody ModelDtos.ClassificationApplyRequest request) {
        return ApiResponse.ok(modelService.classificationApply(request));
    }

    @PostMapping
    public ApiResponse<ModelDtos.ModelAdminView> create(@RequestBody AdminDtos.ModelRequest request) {
        return ApiResponse.ok(modelService.create(request));
    }

    @PutMapping("/{id}")
    public ApiResponse<ModelDtos.ModelAdminView> update(@PathVariable Long id,
                                                        @RequestBody AdminDtos.ModelRequest request) {
        return ApiResponse.ok(modelService.update(id, request));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        modelService.delete(id);
        return ApiResponse.ok(null);
    }
}
