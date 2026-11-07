package com.infinitecanvas.controller;

import com.infinitecanvas.common.ApiResponse;
import com.infinitecanvas.service.UpstreamPriceService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/upstream-prices")
public class AdminUpstreamPriceController {
    private final UpstreamPriceService service;

    public AdminUpstreamPriceController(UpstreamPriceService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResponse<UpstreamPriceService.SnapshotView> get(@RequestParam Long channelId) {
        return ApiResponse.ok(service.get(channelId));
    }

    @PostMapping("/sync")
    public ApiResponse<UpstreamPriceService.SnapshotView> sync(@RequestParam Long channelId) {
        return ApiResponse.ok(service.sync(channelId));
    }
}
