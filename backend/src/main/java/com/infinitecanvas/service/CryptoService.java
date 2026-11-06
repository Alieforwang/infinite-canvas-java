package com.infinitecanvas.service;

import com.infinitecanvas.config.AppProperties;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/** AES-GCM for upstream API keys. Ciphertext format: v1:base64(iv || ciphertext || tag). */
@Service
public class CryptoService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private final SecretKeySpec keySpec;

    public CryptoService(AppProperties props) {
        String raw = props.getCrypto().getKeyEncSecret();
        if (raw == null || raw.isBlank()) {
            throw new IllegalStateException("KEY_ENC_SECRET 未配置");
        }
        byte[] key;
        try {
            key = Base64.getDecoder().decode(raw);
        } catch (IllegalArgumentException ex) {
            key = raw.getBytes(StandardCharsets.UTF_8);
        }
        if (key.length != 32) {
            try {
                key = MessageDigest.getInstance("SHA-256").digest(key);
            } catch (Exception ex) {
                throw new IllegalStateException("无法初始化密钥", ex);
            }
        }
        this.keySpec = new SecretKeySpec(key, "AES");
    }

    public String encrypt(String plain) {
        try {
            byte[] iv = new byte[12];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, keySpec, new GCMParameterSpec(128, iv));
            byte[] encrypted = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            byte[] out = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(encrypted, 0, out, iv.length, encrypted.length);
            return "v1:" + Base64.getEncoder().encodeToString(out);
        } catch (Exception ex) {
            throw new IllegalStateException("加密失败", ex);
        }
    }

    public String decrypt(String cipherText) {
        try {
            if (cipherText == null || !cipherText.startsWith("v1:")) {
                throw new IllegalArgumentException("不支持的密文格式");
            }
            byte[] all = Base64.getDecoder().decode(cipherText.substring(3));
            byte[] iv = new byte[12];
            byte[] encrypted = new byte[all.length - 12];
            System.arraycopy(all, 0, iv, 0, 12);
            System.arraycopy(all, 12, encrypted, 0, encrypted.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, keySpec, new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (Exception ex) {
            throw new IllegalStateException("API Key 解密失败", ex);
        }
    }

    public String mask(String plain) {
        if (plain == null || plain.isBlank()) {
            return "";
        }
        if (plain.length() <= 8) {
            return "****";
        }
        return plain.substring(0, 4) + "****" + plain.substring(plain.length() - 4);
    }
}
