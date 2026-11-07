package com.infinitecanvas.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.config.AppProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JwtAuthenticationFilterTest {

    private JwtService jwtService;
    private JwtAuthenticationFilter filter;

    @BeforeEach
    void setUp() {
        AppProperties properties = new AppProperties();
        AppProperties.Jwt jwt = new AppProperties.Jwt();
        jwt.setSecret("test-secret-0123456789abcdef0123456789abcdef");
        jwt.setIssuer("infinite-canvas");
        properties.setJwt(jwt);
        jwtService = new JwtService(properties);
        filter = new JwtAuthenticationFilter(jwtService, new ObjectMapper());
    }

    /** 回归：管理端 CurrencyProvider 在管理态下携带管理员 token 读取公共人民币设置。 */
    @Test
    void adminTokenCanReadPublicSettings() throws Exception {
        assertPasses("/api/public/settings", adminToken());
    }

    /** 公开文件内容（permitAll）同样不应被 audience 拦截。 */
    @Test
    void adminTokenCanReadPublicFileContent() throws Exception {
        assertPasses("/api/files/01HXYZABCDE/content", adminToken());
    }

    /** 公开接口对用户 token 保持放开（现值行为，防回归）。 */
    @Test
    void userTokenCanReadPublicSettings() throws Exception {
        assertPasses("/api/public/settings", userToken());
    }

    @Test
    void adminTokenCanCallAdminApi() throws Exception {
        assertPasses("/api/admin/dashboard", adminToken());
    }

    /** 管理接口仍只接受管理员 token。 */
    @Test
    void userTokenCannotCallAdminApi() throws Exception {
        assertRejected("/api/admin/dashboard", userToken());
    }

    /** 用户接口仍只接受用户 token，避免管理员身份被用于用户语义接口。 */
    @Test
    void adminTokenCannotCallUserApi() throws Exception {
        assertRejected("/api/account", adminToken());
    }

    private String adminToken() {
        return jwtService.createAccessToken(1L, "admin", "admin");
    }

    private String userToken() {
        return jwtService.createAccessToken(1L, "user", "user");
    }

    private void assertPasses(String path, String token) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        filter.doFilter(request(path, token), response, chain);
        assertEquals(200, response.getStatus(), "expected pass-through for " + path);
        assertNotNull(chain.getRequest(), "filter should continue the chain for " + path);
    }

    private void assertRejected(String path, String token) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        filter.doFilter(request(path, token), response, chain);
        assertEquals(403, response.getStatus(), "expected rejection for " + path);
        assertNull(chain.getRequest(), "filter should stop the chain for " + path);
        assertTrue(response.getContentAsString().contains("AUTH_40301"));
    }

    private MockHttpServletRequest request(String path, String token) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        request.addHeader("Authorization", "Bearer " + token);
        return request;
    }
}
