package com.infinitecanvas.service;

import com.infinitecanvas.common.BizException;
import com.infinitecanvas.common.ErrorCode;
import com.infinitecanvas.common.Ulid;
import com.infinitecanvas.config.AppProperties;
import com.infinitecanvas.dto.TaskDtos;
import com.infinitecanvas.entity.FileObject;
import com.infinitecanvas.mapper.FileObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;

@Service
public class FileStorageService {

    private static final long MB = 1024L * 1024L;
    private static final Map<String, String> EXT_BY_TYPE = Map.of(
            "image/jpeg", "jpg", "image/png", "png", "image/webp", "webp",
            "video/mp4", "mp4", "video/webm", "webm");

    private final AppProperties props;
    private final FileObjectMapper fileObjectMapper;
    private final SettingService settingService;
    private final Path root;

    public FileStorageService(AppProperties props, FileObjectMapper fileObjectMapper, SettingService settingService) {
        this.props = props;
        this.fileObjectMapper = fileObjectMapper;
        this.settingService = settingService;
        this.root = Paths.get(props.getStorage().getRoot()).toAbsolutePath().normalize();
        try {
            Files.createDirectories(root);
        } catch (IOException ex) {
            throw new IllegalStateException("无法创建存储目录: " + root, ex);
        }
    }

    public TaskDtos.FileView upload(Long userId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BizException(ErrorCode.VALID_40001, "文件为空");
        }
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase(Locale.ROOT);
        String ext = EXT_BY_TYPE.get(contentType);
        if (ext == null) {
            throw new BizException(ErrorCode.VALID_40004, "不支持的文件类型");
        }
        boolean image = contentType.startsWith("image/");
        long maxBytes = (image ? settingService.getLong("file.max_upload_image_mb", 20)
                : settingService.getLong("file.max_upload_video_mb", 200)) * MB;
        if (file.getSize() > maxBytes) {
            throw new BizException(ErrorCode.UPLOAD_41301, "文件超过大小限制", Map.of("maxBytes", maxBytes), 413);
        }
        try (InputStream in = file.getInputStream()) {
            byte[] bytes = in.readAllBytes();
            validateMagic(bytes, contentType);
            return toView(writeBytes(userId, bytes, contentType, "UPLOAD", file.getOriginalFilename(), null));
        } catch (IOException ex) {
            throw new BizException(ErrorCode.SYS_50001, "文件保存失败");
        }
    }

    public FileObject writeBytes(Long userId, byte[] bytes, String contentType, String kind,
                                 String originalName, Long sourceTaskId) {
        if (bytes == null || bytes.length == 0) {
            throw new BizException(ErrorCode.UPSTREAM_50205, "下载内容为空");
        }
        String ext = EXT_BY_TYPE.getOrDefault(contentType, "mp4");
        String fileNo = Ulid.next();
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        Path dir = root.resolve(String.valueOf(userId)).resolve(String.format("%04d%02d", now.getYear(), now.getMonthValue()));
        Path target = dir.resolve(fileNo + "." + ext);
        try {
            Files.createDirectories(dir);
            Files.write(target, bytes);
        } catch (IOException ex) {
            throw new BizException(ErrorCode.SYS_50001, "文件写入失败");
        }
        FileObject object = new FileObject();
        object.setFileNo(fileNo);
        object.setUserId(userId);
        object.setKind(kind);
        object.setStorageProvider("local");
        object.setStorageKey(root.relativize(target).toString().replace('\\', '/'));
        object.setOriginalName(originalName == null ? "" : originalName.substring(0, Math.min(255, originalName.length())));
        object.setContentType(contentType);
        object.setBytes((long) bytes.length);
        object.setSha256(sha256(bytes));
        object.setRefCount(0);
        object.setStatus("READY");
        object.setSourceTaskId(sourceTaskId);
        object.setCreatedAt(now);
        fileObjectMapper.insert(object);
        return object;
    }

    public FileObject byNo(String fileNo) {
        FileObject object = fileObjectMapper.selectByFileNoNotDeleted(fileNo);
        if (object == null) {
            throw new BizException(ErrorCode.UPLOAD_41301, "文件不存在", null, 404);
        }
        return object;
    }

    public Path pathOf(FileObject object) {
        Path path = root.resolve(object.getStorageKey()).normalize();
        if (!path.startsWith(root) || !Files.exists(path)) {
            throw new BizException(ErrorCode.UPLOAD_41301, "文件不存在", null, 404);
        }
        return path;
    }

    public TaskDtos.FileView toView(FileObject object) {
        return new TaskDtos.FileView(object.getFileNo(), signedUrl(object), object.getContentType(),
                object.getBytes(), object.getWidth(), object.getHeight(), object.getDurationMs());
    }

    public String signedUrl(FileObject object) {
        long exp = LocalDateTime.now(ZoneOffset.UTC).toEpochSecond(ZoneOffset.UTC) + 900;
        long user = object.getUserId();
        String sig = sign(object.getFileNo() + "|" + exp + "|" + user);
        return "/api/files/" + object.getFileNo() + "/content?exp=" + exp + "&u=" + user + "&sig=" + sig;
    }

    public void verifySignature(String fileNo, long exp, long userId, String sig) {
        if (exp < LocalDateTime.now(ZoneOffset.UTC).toEpochSecond(ZoneOffset.UTC)) {
            throw new BizException(ErrorCode.UPLOAD_41301, "下载链接已过期", null, 403);
        }
        String expected = sign(fileNo + "|" + exp + "|" + userId);
        if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), sig.getBytes(StandardCharsets.UTF_8))) {
            throw new BizException(ErrorCode.UPLOAD_41301, "下载链接无效", null, 403);
        }
    }

    private String sign(String content) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(props.getCrypto().getDownloadTokenSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(content.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("签名失败", ex);
        }
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private void validateMagic(byte[] bytes, String contentType) {
        if (bytes.length < 12) {
            throw new BizException(ErrorCode.VALID_40004, "文件内容不合法");
        }
        boolean ok;
        switch (contentType) {
            case "image/jpeg" -> ok = (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8;
            case "image/png" -> ok = (bytes[0] & 0xFF) == 0x89 && bytes[1] == 'P' && bytes[2] == 'N' && bytes[3] == 'G';
            case "image/webp" -> ok = bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F';
            case "video/mp4" -> ok = bytes[4] == 'f' && bytes[5] == 't' && bytes[6] == 'y' && bytes[7] == 'p';
            case "video/webm" -> ok = (bytes[0] & 0xFF) == 0x1A && (bytes[1] & 0xFF) == 0x45
                    && (bytes[2] & 0xFF) == 0xDF && (bytes[3] & 0xFF) == 0xA3;
            default -> ok = false;
        }
        if (!ok) {
            throw new BizException(ErrorCode.VALID_40004, "文件内容与类型不匹配");
        }
    }
}
