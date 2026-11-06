package com.infinitecanvas.controller;

import com.infinitecanvas.common.ApiResponse;
import com.infinitecanvas.dto.AdminDtos;
import com.infinitecanvas.security.AuthUtils;
import com.infinitecanvas.service.ChannelService;
import jakarta.validation.Valid;
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
@RequestMapping("/api/admin/channels")
public class AdminChannelController {

    private final ChannelService channelService;

    public AdminChannelController(ChannelService channelService) {
        this.channelService = channelService;
    }

    @GetMapping
    public ApiResponse<List<AdminDtos.ChannelView>> list() {
        return ApiResponse.ok(channelService.list());
    }

    @PostMapping
    public ApiResponse<AdminDtos.ChannelView> create(@Valid @RequestBody AdminDtos.ChannelRequest request) {
        return ApiResponse.ok(channelService.create(request, AuthUtils.adminId()));
    }

    @PutMapping("/{id}")
    public ApiResponse<AdminDtos.ChannelView> update(@PathVariable Long id,
                                                     @RequestBody AdminDtos.ChannelRequest request) {
        return ApiResponse.ok(channelService.update(id, request, AuthUtils.adminId()));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        channelService.delete(id);
        return ApiResponse.ok(null);
    }

    public record ModelsSyncRequest(String modelsUrl) {}

    @PostMapping("/{id}/models/sync")
    public ApiResponse<AdminDtos.ChannelTestResult> syncModels(@PathVariable Long id,
            @RequestBody(required = false) ModelsSyncRequest request) {
        return ApiResponse.ok(channelService.syncModels(id, request == null ? null : request.modelsUrl()));
    }

    @PostMapping("/{id}/test")
    public ApiResponse<AdminDtos.ChannelTestResult> test(@PathVariable Long id) {
        return ApiResponse.ok(channelService.test(id));
    }
}
