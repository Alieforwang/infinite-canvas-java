package com.infinitecanvas.security;

public record AuthPrincipal(Long id, String role, String emailOrUsername) {
}
