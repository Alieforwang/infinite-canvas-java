package com.infinitecanvas.security;

import com.infinitecanvas.config.AppProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;

@Service
public class JwtService {

    private final AppProperties props;
    private final SecretKey key;

    public JwtService(AppProperties props) {
        this.props = props;
        String secret = props.getJwt().getSecret();
        if (secret == null || secret.length() < 32) {
            throw new IllegalStateException("JWT_SECRET 必须至少 32 个字符");
        }
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public String createAccessToken(long subjectId, String aud, String role) {
        Instant now = Instant.now();
        return Jwts.builder()
                .issuer(props.getJwt().getIssuer())
                .audience().add(aud).and()
                .subject(String.valueOf(subjectId))
                .claim("ctx", "access")
                .claim("role", role)
                .id(java.util.UUID.randomUUID().toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(props.getJwt().getAccessTtlMinutes() * 60)))
                .signWith(key)
                .compact();
    }

    public Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .requireIssuer(props.getJwt().getIssuer())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public long accessTtlSeconds() {
        return props.getJwt().getAccessTtlMinutes() * 60;
    }

    public long refreshTtlSeconds() {
        return props.getJwt().getRefreshTtlDays() * 24 * 3600;
    }
}
