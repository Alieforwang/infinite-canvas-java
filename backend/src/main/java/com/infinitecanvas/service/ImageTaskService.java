package com.infinitecanvas.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.common.BizException;
import com.infinitecanvas.common.ErrorCode;
import com.infinitecanvas.common.Ulid;
import com.infinitecanvas.dto.TaskDtos;
import com.infinitecanvas.entity.*;
import com.infinitecanvas.gateway.OpenAiCompatImageAdapter;
import com.infinitecanvas.gateway.UpstreamClient;
import com.infinitecanvas.gateway.UpstreamException;
import com.infinitecanvas.mapper.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import javax.imageio.ImageIO;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;

@Service
public class ImageTaskService {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(ImageTaskService.class);
    public record CreateCommand(String modelKey, String prompt, String size, List<String> referenceFileNos) { }
    private record Prepared(VideoTask task, Channel channel, VideoModel route, boolean created) { }
    private record Image(byte[] bytes, String type, int width, int height) { }
    private final VideoTaskMapper tasks;
    private final VideoModelMapper models;
    private final ChannelMapper channels;
    private final FileObjectMapper files;
    private final VideoTaskEventMapper events;
    private final PricingService pricing;
    private final BillingService billing;
    private final SettingService settings;
    private final FileStorageService storage;
    private final OpenAiCompatImageAdapter adapter;
    private final VideoTaskService views;
    private final ObjectMapper json;
    private final TransactionTemplate tx;

    public ImageTaskService(VideoTaskMapper tasks, VideoModelMapper models, ChannelMapper channels,
                            FileObjectMapper files, VideoTaskEventMapper events, PricingService pricing,
                            BillingService billing, SettingService settings, FileStorageService storage,
                            OpenAiCompatImageAdapter adapter, VideoTaskService views, ObjectMapper json,
                            PlatformTransactionManager transactionManager) {
        this.tasks = tasks; this.models = models; this.channels = channels; this.files = files;
        this.events = events; this.pricing = pricing; this.billing = billing; this.settings = settings;
        this.storage = storage; this.adapter = adapter; this.views = views; this.json = json;
        this.tx = new TransactionTemplate(transactionManager);
    }

    public TaskDtos.TaskView create(Long userId, CreateCommand cmd, String key, String ip, String requestId) {
        if (cmd == null || cmd.modelKey() == null || cmd.modelKey().isBlank()
                || cmd.prompt() == null || cmd.prompt().isBlank() || cmd.prompt().length() > 2000
                || cmd.size() == null || !cmd.size().matches("[1-9][0-9]{1,4}x[1-9][0-9]{1,4}")) {
            throw invalid("请提供图片模型、2000字以内提示词及有效尺寸");
        }
        if (key != null && key.length() > 128) throw invalid("幂等键不能超过128字符");
        List<String> refs = cmd.referenceFileNos() == null ? List.of() : cmd.referenceFileNos();
        if (refs.size() > 7 || refs.stream().anyMatch(value -> value == null || value.isBlank())) {
            throw invalid("参考图片参数不合法");
        }
        String hash = hash(serialize(List.of("image", cmd.modelKey().trim(), cmd.prompt(), cmd.size(), refs)));
        Prepared prepared = tx.execute(status -> prepare(userId, cmd, refs, key, hash, ip, requestId));
        if (!prepared.created()) return views.toView(prepared.task());
        VideoTask task = prepared.task();
        Image image;
        try {
            List<UpstreamClient.FilePart> parts = new ArrayList<>();
            for (String ref : refs) {
                FileObject file = files.selectByFileNoAndUser(ref, userId);
                byte[] bytes;
                try (var in = Files.newInputStream(storage.pathOf(file))) {
                    bytes = in.readNBytes(OpenAiCompatImageAdapter.MAX_IMAGE_BYTES + 1);
                }
                validateImage(bytes, file.getContentType());
                parts.add(new UpstreamClient.FilePart("image", bytes, "reference." + extension(file.getContentType())));
            }
            JsonNode result = adapter.generate(prepared.channel(), task.getId(), task.getTaskNo(),
                    prepared.route().getUpstreamModel(), cmd.prompt(), cmd.size(), parts);
            image = decode(result, task);
        } catch (Exception ex) {
            String code = ex instanceof UpstreamException upstream ? upstream.getCode() : "UPSTREAM_INVALID_IMAGE";
            String message = ex instanceof UpstreamException ? ex.getMessage() : "图片生成或保存失败，积分已退回";
            tx.executeWithoutResult(status -> fail(task, code, message));
            return get(userId, task.getTaskNo());
        }
        try {
            tx.executeWithoutResult(status -> complete(task, image));
        } catch (Exception ex) {
            tx.executeWithoutResult(status -> fail(task, "IMAGE_STORAGE_ERROR", "图片保存或结算失败，积分已退回"));
        }
        return get(userId, task.getTaskNo());
    }

    private Prepared prepare(Long userId, CreateCommand cmd, List<String> refs, String key,
                             String hash, String ip, String requestId) {
        // Serialize creates for a user before the idempotency lookup. No network call holds this lock.
        billing.lockAccount(userId);
        if (key != null && !key.isBlank()) {
            VideoTask old = tasks.selectByUserAndIdempotencyKey(userId, key);
            if (old != null) {
                if (!isImage(old) || !hash.equals(old.getRequestHash())) {
                    throw new BizException(ErrorCode.TASK_40902, "幂等键已被不同参数使用", null, 409);
                }
                return new Prepared(old, null, null, false);
            }
        }
        VideoModel model = models.selectCanonicalByModelKey(cmd.modelKey().trim(), "image");
        if (model == null || !"image".equals(model.getCapability())) {
            throw invalid("图片模型不存在或未上架");
        }
        if (!pricing.supportsImageSpecification(model, cmd.size())) throw invalid("当前图片模型未配置该尺寸价格");
        if (!supportsReferences(model, refs.size())) throw invalid("当前图片模型不支持所选参考图数量");
        for (String ref : refs) {
            FileObject file = files.selectByFileNoAndUser(ref, userId);
            if (file == null || !"READY".equals(file.getStatus())
                    || !List.of("image/png", "image/jpeg", "image/webp").contains(file.getContentType())
                    || file.getBytes() == null || file.getBytes() > OpenAiCompatImageAdapter.MAX_IMAGE_BYTES) {
                throw invalid("参考图片不存在、不可用或类型不支持");
            }
        }
        long limit = settings.getLong("task.max_concurrency_per_user", 2);
        if (tasks.countActiveByUser(userId) >= limit) {
            throw new BizException(ErrorCode.TASK_42901, "同时进行的任务已达上限", null, 429);
        }
        List<VideoModel> available = new ArrayList<>();
        for (VideoModel route : models.selectEnabledByModelKey(cmd.modelKey().trim(), "image")) {
            Channel channel = channels.selectById(route.getChannelId());
            if ("image".equals(route.getCapability()) && Integer.valueOf(1).equals(route.getEnabled())
                    && channel != null && Integer.valueOf(1).equals(channel.getEnabled())
                    && stringList(channel.getCapabilities()).contains("image")
                    && (route.getRouteWeight() == null || route.getRouteWeight() > 0)
                    && pricing.supportsImageSpecification(route, cmd.size()) && supportsReferences(route, refs.size())) {
                available.add(route);
            }
        }
        if (available.isEmpty()) throw invalid("当前图片规格暂无可用渠道线路");
        VideoModel route = WeightedRouteSelector.select(available);
        LocalDateTime now = now();
        VideoTask task = new VideoTask();
        task.setTaskNo("img_" + Ulid.next().substring(4));
        task.setUserId(userId); task.setChannelId(route.getChannelId()); task.setModelId(route.getId());
        task.setStatus("RUNNING"); task.setProgress(0); task.setRequestHash(hash);
        task.setIdempotencyKey(key == null || key.isBlank() ? null : key);
        task.setPrompt(cmd.prompt());
        long credits = pricing.quoteImage(model, cmd.size());
        task.setParamsJson(serialize(Map.of("capability", "image", "modelKey", cmd.modelKey().trim(),
                "size", cmd.size(), "pricing", Map.of("credits", credits))));
        task.setReferencesJson(serialize(Map.of("fileNos", refs)));
        task.setHeldCredits(0L); task.setSettledCredits(0L); task.setAttemptCount(1); task.setPollCount(0);
        task.setDeadlineAt(now.plusMinutes(10)); task.setSubmittedAt(now);
        task.setClientIp(ip == null ? "" : ip); task.setClientRequestId(requestId == null ? "" : requestId);
        task.setCreatedAt(now); task.setUpdatedAt(now);
        tasks.insert(task);
        billing.hold(userId, task.getId(), task.getTaskNo(), credits, requestId);
        task.setHeldCredits(credits); tasks.updateById(task);
        event(task, "", "RUNNING", "图片任务创建并预扣积分");
        return new Prepared(task, channels.selectById(route.getChannelId()), route, true);
    }

    public TaskDtos.TaskView get(Long userId, String taskNo) {
        VideoTask task = tasks.selectByTaskNoAndUser(taskNo, userId);
        if (task == null || !isImage(task)) throw new BizException(ErrorCode.TASK_40401, "图片任务不存在", null, 404);
        return views.toView(task);
    }

    private void complete(VideoTask task, Image image) {
        billing.lockAccount(task.getUserId());
        VideoTask fresh = tasks.selectById(task.getId());
        if (fresh == null || !"RUNNING".equals(fresh.getStatus())) return;
        FileObject file = storage.writeBytes(task.getUserId(), image.bytes(), image.type(), "IMAGE_RESULT",
                task.getTaskNo() + "." + extension(image.type()), task.getId());
        file.setWidth(image.width()); file.setHeight(image.height()); file.setRefCount(1);
        files.updateById(file);
        if (tasks.finalizeSuccess(task.getId(), file.getId(), now()) != 1
                || !billing.settle(task.getUserId(), task.getId(), task.getTaskNo(), task.getHeldCredits(), task.getHeldCredits())) {
            throw new IllegalStateException("图片任务结算失败");
        }
        event(task, "RUNNING", "SUCCEEDED", "图片已保存并结算");
    }

    private void fail(VideoTask task, String code, String message) {
        billing.lockAccount(task.getUserId());
        if (tasks.failActive(task.getId(), "FAILED", code, message, now(), List.of("RUNNING")) == 1) {
            if (!billing.refund(task.getUserId(), task.getId(), task.getTaskNo(), task.getHeldCredits(), "图片任务失败退款")) {
                throw new IllegalStateException("图片任务退款失败");
            }
            event(task, "RUNNING", "FAILED", message);
        }
    }

    /** Recover holds after process interruption; image tasks never enter the video poller. */
    @Scheduled(fixedDelay = 60_000, initialDelay = 60_000)
    public void expireInterruptedTasks() {
        for (VideoTask task : tasks.selectExpiredImages(now(), 100)) {
            try {
                tx.executeWithoutResult(status -> fail(task, "IMAGE_TIMEOUT", "图片任务超时，积分已退回"));
            } catch (Exception ex) {
                log.error("image task expiry failed task={}", task.getTaskNo(), ex);
            }
        }
    }

    private Image decode(JsonNode result, VideoTask task) {
        JsonNode first = result == null ? null : result.path("data").path(0);
        if (first == null || first.isMissingNode()) throw invalid("上游未返回图片");
        String b64 = first.path("b64_json").asText("");
        if (!b64.isBlank()) {
            if (b64.length() > ((long) OpenAiCompatImageAdapter.MAX_IMAGE_BYTES + 2) / 3 * 4) throw invalid("图片超过大小限制");
            byte[] bytes = Base64.getDecoder().decode(b64);
            return validateImage(bytes, detectType(bytes));
        }
        String url = first.path("url").asText("");
        if (url.isBlank()) throw invalid("上游未返回图片数据或URL");
        var download = adapter.download(url, task.getId(), task.getTaskNo());
        return validateImage(download.bytes(), download.contentType());
    }

    private Image validateImage(byte[] bytes, String type) {
        if (bytes.length == 0 || bytes.length > OpenAiCompatImageAdapter.MAX_IMAGE_BYTES || !detectType(bytes).equals(type)) {
            throw invalid("图片内容与类型不匹配或超过大小限制");
        }
        try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(input);
            if (readers.hasNext()) {
                var reader = readers.next();
                try {
                    reader.setInput(input);
                    int width = reader.getWidth(0), height = reader.getHeight(0);
                    if (width <= 0 || height <= 0 || (long) width * height > 40_000_000) throw invalid("图片尺寸超过限制");
                    // Parse actual image data, rather than accepting a forged signature/header.
                    if (reader.read(0) == null) throw invalid("图片数据损坏");
                    return new Image(bytes, type, width, height);
                } finally { reader.dispose(); }
            }
            // The JDK has no WebP codec; validate the RIFF container, encoded chunk and dimensions.
            if ("image/webp".equals(type)) return validateWebp(bytes);
        } catch (Exception ex) {
            throw invalid("图片数据损坏或格式不支持");
        }
        throw invalid("图片数据损坏或格式不支持");
    }

    private Image validateWebp(byte[] bytes) {
        if (littleEndian(bytes, 4) + 8 != bytes.length) throw invalid("WebP容器长度不合法");
        int width = 0, height = 0;
        int position = 12;
        while (position + 8 <= bytes.length) {
            long length = littleEndian(bytes, position + 4);
            long end = (long) position + 8 + length;
            if (end > bytes.length) throw invalid("WebP图片数据损坏");
            int data = position + 8;
            String chunk = new String(bytes, position, 4, StandardCharsets.US_ASCII);
            if ("VP8 ".equals(chunk) && length >= 10 && bytes[data + 3] == (byte) 0x9d
                    && bytes[data + 4] == 1 && bytes[data + 5] == 0x2a) {
                width = ((bytes[data + 6] & 255) | (bytes[data + 7] & 255) << 8) & 0x3fff;
                height = ((bytes[data + 8] & 255) | (bytes[data + 9] & 255) << 8) & 0x3fff;
            } else if ("VP8L".equals(chunk) && length >= 5 && bytes[data] == 0x2f) {
                long dimensions = littleEndian(bytes, data + 1);
                width = (int) (dimensions & 0x3fff) + 1;
                height = (int) (dimensions >> 14 & 0x3fff) + 1;
            }
            position = (int) (end + (length & 1));
        }
        if (position != bytes.length || width <= 0 || height <= 0 || (long) width * height > 40_000_000) {
            throw invalid("WebP图片编码或尺寸不合法");
        }
        return new Image(bytes, "image/webp", width, height);
    }
    private long littleEndian(byte[] bytes, int offset) {
        return (bytes[offset] & 255L) | (bytes[offset + 1] & 255L) << 8
                | (bytes[offset + 2] & 255L) << 16 | (bytes[offset + 3] & 255L) << 24;
    }

    private String detectType(byte[] b) {
        if (b.length >= 8 && b[0] == (byte) 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G'
                && b[4] == 13 && b[5] == 10 && b[6] == 26 && b[7] == 10) return "image/png";
        if (b.length >= 3 && b[0] == (byte) 0xff && b[1] == (byte) 0xd8 && b[2] == (byte) 0xff) return "image/jpeg";
        if (b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return "image/webp";
        throw invalid("上游返回的内容不是有效图片");
    }

    private boolean supportsReferences(VideoModel model, int count) {
        return count == 0 || Integer.valueOf(1).equals(model.getSupportsReferenceImages())
                && count <= (model.getMaxReferenceImages() == null ? 1 : model.getMaxReferenceImages());
    }
    private boolean isImage(VideoTask task) {
        try { return "image".equals(json.readTree(task.getParamsJson()).path("capability").asText()); }
        catch (Exception ex) { return false; }
    }
    private List<String> stringList(String value) {
        try { return json.readValue(value, new TypeReference<List<String>>() { }); }
        catch (Exception ex) { return List.of(); }
    }
    private String extension(String type) { return switch (type) { case "image/jpeg" -> "jpg"; case "image/webp" -> "webp"; default -> "png"; }; }
    private String serialize(Object value) {
        try { return json.writeValueAsString(value); } catch (Exception ex) { throw new IllegalStateException(ex); }
    }
    private String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception ex) { throw new IllegalStateException(ex); }
    }
    private void event(VideoTask task, String from, String to, String detail) {
        VideoTaskEvent event = new VideoTaskEvent();
        event.setTaskId(task.getId()); event.setFromStatus(from); event.setToStatus(to);
        event.setSource("IMAGE"); event.setDetail(detail); event.setCreatedAt(now()); events.insert(event);
    }
    private static BizException invalid(String message) { return new BizException(ErrorCode.VALID_40002, message); }
    private static LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }
}
