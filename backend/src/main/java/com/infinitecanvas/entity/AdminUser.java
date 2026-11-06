package com.infinitecanvas.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AdminUser {
    private Long id;
    private String username;
    private String passwordHash;
    private String displayName;
    private String role;
    private String status;
    private LocalDateTime lastLoginAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
