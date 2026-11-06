package com.infinitecanvas.controller;

import com.infinitecanvas.common.ApiResponse;
import com.infinitecanvas.dto.TaskDtos;
import com.infinitecanvas.security.AuthUtils;
import com.infinitecanvas.service.FileStorageService;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.RandomAccessFile;
import java.nio.file.Path;
import java.util.Map;

@RestController
@RequestMapping("/api/files")
public class FileController {

    private final FileStorageService fileStorageService;

    public FileController(FileStorageService fileStorageService) {
        this.fileStorageService = fileStorageService;
    }

    @PostMapping
    public ApiResponse<TaskDtos.FileView> upload(@RequestParam("file") MultipartFile file) {
        return ApiResponse.ok(fileStorageService.upload(AuthUtils.userId(), file));
    }

    @GetMapping("/{fileNo}/signed-url")
    public ApiResponse<Map<String, Object>> signedUrl(@PathVariable String fileNo) {
        Long userId = AuthUtils.userId();
        var object = fileStorageService.byNo(fileNo);
        if (!userId.equals(object.getUserId())) {
            throw new com.infinitecanvas.common.BizException(com.infinitecanvas.common.ErrorCode.UPLOAD_41301,
                    "文件不存在", null, 404);
        }
        return ApiResponse.ok(Map.of(
                "url", fileStorageService.signedUrl(object),
                "expiresIn", 900,
                "fileNo", object.getFileNo(),
                "contentType", object.getContentType()));
    }

    @GetMapping("/{fileNo}/content")
    public ResponseEntity<ByteArrayResource> content(@PathVariable String fileNo,
                                                     @RequestParam long exp,
                                                     @RequestParam long u,
                                                     @RequestParam String sig,
                                                     @RequestHeader(value = HttpHeaders.RANGE, required = false) String range) {
        fileStorageService.verifySignature(fileNo, exp, u, sig);
        var object = fileStorageService.byNo(fileNo);
        Path path = fileStorageService.pathOf(object);
        try {
            long total = java.nio.file.Files.size(path);
            long start = 0;
            long end = total - 1;
            boolean partial = false;
            if (range != null && range.startsWith("bytes=")) {
                String[] parts = range.substring(6).split("-");
                start = Long.parseLong(parts[0]);
                if (parts.length > 1 && !parts[1].isBlank()) {
                    end = Math.min(Long.parseLong(parts[1]), total - 1);
                }
                partial = true;
            }
            if (start > end || start >= total) {
                return ResponseEntity.status(416).build();
            }
            int length = (int) (end - start + 1);
            byte[] data = new byte[length];
            try (RandomAccessFile raf = new RandomAccessFile(path.toFile(), "r")) {
                raf.seek(start);
                raf.readFully(data);
            }
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.parseMediaType(object.getContentType()));
            headers.set(HttpHeaders.ACCEPT_RANGES, "bytes");
            headers.setContentLength(length);
            headers.setContentDisposition(ContentDisposition.inline().filename(object.getFileNo()).build());
            if (partial) {
                headers.set(HttpHeaders.CONTENT_RANGE, "bytes " + start + "-" + end + "/" + total);
                return ResponseEntity.status(206).headers(headers).body(new ByteArrayResource(data) {
                    @Override
                    public String getFilename() {
                        return object.getFileNo();
                    }
                });
            }
            return ResponseEntity.ok().headers(headers).body(new ByteArrayResource(data));
        } catch (java.io.IOException ex) {
            return ResponseEntity.status(404).build();
        }
    }
}
