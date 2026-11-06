package com.infinitecanvas.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.common.ApiResponse;
import com.infinitecanvas.common.ErrorCode;
import com.infinitecanvas.common.RequestIdFilter;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final ObjectMapper objectMapper;

    public JwtAuthenticationFilter(JwtService jwtService, ObjectMapper objectMapper) {
        this.jwtService = jwtService;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            chain.doFilter(request, response);
            return;
        }
        String token = header.substring(7).trim();
        try {
            Claims claims = jwtService.parse(token);
            String ctx = claims.get("ctx", String.class);
            String role = claims.get("role", String.class);
            if (!"access".equals(ctx)) {
                writeError(response, ErrorCode.AUTH_40102, "令牌类型错误", 401);
                return;
            }
            Long id = Long.valueOf(claims.getSubject());
            String expectedRole = request.getRequestURI().startsWith("/api/admin/") ? "admin" : "user";
            if (!expectedRole.equals(role)) {
                writeError(response, ErrorCode.AUTH_40301, "令牌与接口不匹配", 403);
                return;
            }
            String principalName = claims.get("name", String.class);
            AuthPrincipal principal = new AuthPrincipal(id, role, principalName == null ? "" : principalName);
            var auth = new UsernamePasswordAuthenticationToken(principal, null,
                    List.of(new SimpleGrantedAuthority("ROLE_" + role.toUpperCase())));
            SecurityContextHolder.getContext().setAuthentication(auth);
            chain.doFilter(request, response);
        } catch (io.jsonwebtoken.ExpiredJwtException ex) {
            writeError(response, ErrorCode.AUTH_40103, "登录已过期，请重新登录", 401);
        } catch (Exception ex) {
            writeError(response, ErrorCode.AUTH_40102, "登录状态无效", 401);
        }
    }

    private void writeError(HttpServletResponse response, String code, String message, int status) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        String requestId = MDC.get(RequestIdFilter.MDC_KEY);
        objectMapper.writeValue(response.getWriter(),
                ApiResponse.fail(code, message, java.util.Map.of("requestId", requestId == null ? "" : requestId)));
    }
}
