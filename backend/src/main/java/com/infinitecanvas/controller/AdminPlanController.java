package com.infinitecanvas.controller;

import com.infinitecanvas.common.ApiResponse;
import com.infinitecanvas.dto.AdminDtos;
import com.infinitecanvas.entity.Plan;
import com.infinitecanvas.service.PlanAdminService;
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
@RequestMapping("/api/admin/plans")
public class AdminPlanController {

    private final PlanAdminService planAdminService;

    public AdminPlanController(PlanAdminService planAdminService) {
        this.planAdminService = planAdminService;
    }

    @GetMapping
    public ApiResponse<List<Plan>> list() {
        return ApiResponse.ok(planAdminService.list());
    }

    @PostMapping
    public ApiResponse<Plan> create(@RequestBody AdminDtos.PlanRequest request) {
        return ApiResponse.ok(planAdminService.create(request));
    }

    @PutMapping("/{id}")
    public ApiResponse<Plan> update(@PathVariable Long id, @RequestBody AdminDtos.PlanRequest request) {
        return ApiResponse.ok(planAdminService.update(id, request));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        planAdminService.delete(id);
        return ApiResponse.ok(null);
    }
}
