package com.infinitecanvas.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.common.BizException;
import com.infinitecanvas.common.ErrorCode;
import com.infinitecanvas.common.PageResult;
import com.infinitecanvas.common.Ulid;
import com.infinitecanvas.dto.TaskDtos;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.entity.CreditAccount;
import com.infinitecanvas.entity.FileObject;
import com.infinitecanvas.entity.VideoModel;
import com.infinitecanvas.entity.VideoTask;
import com.infinitecanvas.entity.VideoTaskEvent;
import com.infinitecanvas.gateway.OpenAiCompatVideoAdapter;
import com.infinitecanvas.gateway.UpstreamException;
import com.infinitecanvas.mapper.ChannelMapper;
import com.infinitecanvas.mapper.FileObjectMapper;
import com.infinitecanvas.mapper.VideoModelMapper;
import com.infinitecanvas.mapper.VideoTaskEventMapper;
import com.infinitecanvas.mapper.VideoTaskMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class VideoTaskService {

    private static final Logger log = LoggerFactory.getLogger(VideoTaskService.class);
    public static final List<String> ACTIVE_STATUSES = List.of(
            "CREATED", "SUBMITTING", "SUBMIT_UNKNOWN", "QUEUED", "RUNNING", "DOWNLOADING");
    public static final List<String> TERMINAL_STATUSES = List.of("SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED");

    private final VideoTaskMapper taskMapper;
    private final VideoTaskEventMapper eventMapper;
    private final VideoModelMapper modelMapper;
    private final ChannelMapper channelMapper;
    private final FileObjectMapper fileObjectMapper;
    private final PricingService pricingService;
    private final BillingService billingService;
    private final SettingService settingService;
    private final FileStorageService fileStorageService;
    private final OpenAiCompatVideoAdapter adapter;
    private final SsrfGuard ssrfGuard;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate tx;

    public VideoTaskService(VideoTaskMapper taskMapper, VideoTaskEventMapper eventMapper, VideoModelMapper modelMapper,
                            ChannelMapper channelMapper, FileObjectMapper fileObjectMapper,
                            PricingService pricingService, BillingService billingService, SettingService settingService,
                            FileStorageService fileStorageService, OpenAiCompatVideoAdapter adapter,
                            SsrfGuard ssrfGuard, ObjectMapper objectMapper, PlatformTransactionManager transactionManager) {
        this.taskMapper = taskMapper;
        this.eventMapper = eventMapper;
        this.modelMapper = modelMapper;
        this.channelMapper = channelMapper;
        this.fileObjectMapper = fileObjectMapper;
        this.pricingService = pricingService;
        this.billingService = billingService;
        this.settingService = settingService;
        this.fileStorageService = fileStorageService;
        this.adapter = adapter;
        this.ssrfGuard = ssrfGuard;
        this.objectMapper = objectMapper;
        this.tx = new TransactionTemplate(transactionManager);
    }

    public record CreateCommand(String modelKey, Long modelId, String prompt, int seconds, String resolution, String size,
                                String ratio, boolean generateAudio, boolean watermark, String mode,
                                List<String> referenceFileNos) {
    }

    @Transactional
    public TaskDtos.CreateResult create(Long userId, CreateCommand cmd, String idempotencyKey,
                                        String clientIp, String requestId) {
        if (cmd.prompt() == null || cmd.prompt().isBlank()) {
            throw new BizException(ErrorCode.VALID_40001, "提示词不能为空");
        }
        if (cmd.prompt().length() > 2000) {
            throw new BizException(ErrorCode.VALID_40001, "提示词不能超过 2000 字");
        }
        VideoModel model = resolveCanonicalModel(cmd);
        List<String> seconds = readStringList(model.getSupportedSeconds());
        if (!pricingService.hasPricingRules(model) && !seconds.contains(String.valueOf(cmd.seconds()))) {
            throw new BizException(ErrorCode.VALID_40002, "当前模型不支持该时长");
        }
        Map<String, java.math.BigDecimal> factors = pricingService.resolutionFactors(model);
        String resolution = cmd.resolution() == null || cmd.resolution().isBlank()
                ? model.getResolutionDefault() : cmd.resolution();
        if (!pricingService.supportsVideoSpecification(model, cmd.seconds(), resolution)) {
            throw new BizException(ErrorCode.VALID_40002, "当前模型不支持该时长与分辨率组合");
        }
        List<String> references = cmd.referenceFileNos() == null ? List.of() : cmd.referenceFileNos();
        int maxRefs = model.getMaxReferenceImages() == null ? 1 : model.getMaxReferenceImages();
        if (references.size() > maxRefs || references.size() > 7) {
            throw new BizException(ErrorCode.VALID_40002, "参考图数量超过模型上限");
        }
        if (references.size() > 2 && "frames".equals(cmd.mode())) {
            throw new BizException(ErrorCode.VALID_40002, "首尾帧模式最多 2 张参考图");
        }
        for (String fileNo : references) {
            FileObject file = fileObjectMapper.selectByFileNoAndUser(fileNo, userId);
            if (file == null) {
                throw new BizException(ErrorCode.VALID_40004, "参考图不存在：" + fileNo);
            }
        }
        String logicalModelKey = model.getModelKey() == null || model.getModelKey().isBlank()
                ? model.getUpstreamModel() : model.getModelKey();
        String hash = sha256(logicalModelKey + "|" + cmd.prompt() + "|" + cmd.seconds() + "|" + resolution + "|"
                + cmd.size() + "|" + cmd.ratio() + "|" + cmd.generateAudio() + "|" + cmd.watermark() + "|"
                + cmd.mode() + "|" + String.join(",", references));
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            VideoTask existing = taskMapper.selectByUserAndIdempotencyKey(userId, idempotencyKey);
            if (existing != null) {
                if (hash.equals(existing.getRequestHash())) {
                    return new TaskDtos.CreateResult(existing.getTaskNo(), toPublicStatus(existing.getStatus()),
                            existing.getHeldCredits() == null ? 0 : existing.getHeldCredits(),
                            existing.getHeldCredits() == null ? 0 : existing.getHeldCredits(), 3000);
                }
                throw new BizException(ErrorCode.TASK_40902, "幂等键已被不同参数使用", null, 409);
            }
        }
        CreditAccount account = billingService.lockAccount(userId);
        long active = taskMapper.countActiveByUser(userId);
        long limit = settingService.getLong("task.max_concurrency_per_user", 2);
        if (active >= limit) {
            throw new BizException(ErrorCode.TASK_42901, "同时进行的任务已达上限（" + limit + " 个），请等待完成", null, 429);
        }
        long credits = pricingService.quote(model, cmd.seconds(), resolution, cmd.generateAudio());
        if ((account.getAvailable() == null ? 0 : account.getAvailable()) < credits) {
            throw new BizException(ErrorCode.BILL_40201,
                    "余额不足：本次需要 " + MoneyAmounts.format(credits, settingService)
                            + "，当前可用 " + MoneyAmounts.format(account.getAvailable() == null ? 0 : account.getAvailable(), settingService),
                    Map.of("required", credits, "available", account.getAvailable() == null ? 0 : account.getAvailable()), 402);
        }
        VideoModel routeModel = selectRoute(model, cmd, resolution, references, credits);
        Channel channel = channelMapper.selectById(routeModel.getChannelId());
        int pollTimeout = (int) settingService.getLong("task.poll_timeout_minutes", 30);
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        VideoTask task = new VideoTask();
        task.setTaskNo(Ulid.next());
        task.setUserId(userId);
        task.setChannelId(channel.getId());
        task.setModelId(routeModel.getId());
        task.setStatus("CREATED");
        task.setIdempotencyKey(idempotencyKey == null || idempotencyKey.isBlank() ? null : idempotencyKey);
        task.setRequestHash(hash);
        task.setPrompt(cmd.prompt());
        task.setParamsJson(adapter.toJson(params(cmd, resolution, factors)));
        task.setReferencesJson(adapter.toJson(Map.of("fileNos", references)));
        task.setProgress(0);
        task.setHeldCredits(0L);
        task.setSettledCredits(0L);
        task.setAttemptCount(0);
        task.setPollCount(0);
        task.setNextPollAt(now);
        task.setDeadlineAt(now.plusMinutes(pollTimeout));
        task.setClientIp(clientIp == null ? "" : clientIp);
        task.setClientRequestId(requestId == null ? "" : requestId);
        taskMapper.insert(task);
        billingService.hold(userId, task.getId(), task.getTaskNo(), credits, requestId);
        task.setHeldCredits(credits);
        taskMapper.updateById(task);
        modelMapper.incrementLoad(routeModel.getId());
        event(task, "", "CREATED", "USER", "创建任务，预扣 " + MoneyAmounts.format(credits, settingService));
        return new TaskDtos.CreateResult(task.getTaskNo(), "queued", credits, credits, 3000);
    }

    VideoModel resolveCanonicalModel(CreateCommand cmd) {
        String modelKey = cmd.modelKey();
        if (modelKey == null || modelKey.isBlank()) {
            VideoModel legacyRoute = cmd.modelId() == null ? null : modelMapper.selectById(cmd.modelId());
            if (legacyRoute != null) {
                if (!"video".equals(legacyRoute.getCapability())) {
                    throw new BizException(ErrorCode.VALID_40003, "视频模型不存在或未上架");
                }
                modelKey = legacyRoute.getModelKey() == null || legacyRoute.getModelKey().isBlank()
                        ? legacyRoute.getUpstreamModel() : legacyRoute.getModelKey();
            }
        }
        VideoModel canonical = modelKey == null || modelKey.isBlank()
                ? null : modelMapper.selectCanonicalByModelKey(modelKey.trim(), "video");
        if (canonical == null || !"video".equals(canonical.getCapability())) {
            throw new BizException(ErrorCode.VALID_40003, "视频模型不存在或未上架");
        }
        return canonical;
    }

    private VideoModel selectRoute(VideoModel logicalModel, CreateCommand cmd, String resolution,
                                   List<String> references, long salePrice) {
        String modelKey = logicalModel.getModelKey() == null || logicalModel.getModelKey().isBlank()
                ? logicalModel.getUpstreamModel() : logicalModel.getModelKey();
        List<VideoModel> available = new ArrayList<>();
        for (VideoModel route : modelMapper.selectEnabledByModelKey(modelKey, "video")) {
            Channel routeChannel = channelMapper.selectById(route.getChannelId());
            List<String> channelCapabilities = routeChannel == null
                    ? List.of() : readStringList(routeChannel.getCapabilities());
            boolean channelSupportsVideo = channelCapabilities.isEmpty() || channelCapabilities.contains("video");
            int maxReferences = route.getMaxReferenceImages() == null ? 1 : route.getMaxReferenceImages();
            List<String> routeSeconds = readStringList(route.getSupportedSeconds());
            boolean supportsSeconds = routeSeconds.isEmpty()
                    ? pricingService.hasPricingRules(route) : routeSeconds.contains(String.valueOf(cmd.seconds()));
            if (routeChannel == null || routeChannel.getEnabled() == null || routeChannel.getEnabled() != 1
                    || !channelSupportsVideo || route.getRouteWeight() != null && route.getRouteWeight() <= 0
                    || !supportsSeconds
                    || !pricingService.supportsVideoSpecification(route, cmd.seconds(), resolution)
                    || references.size() > maxReferences
                    || !references.isEmpty() && !enabled(route.getSupportsReferenceImages())
                    || cmd.generateAudio() && !enabled(route.getSupportsAudio())
                    || cmd.watermark() && !enabled(route.getSupportsWatermark())
                    || references.size() == 2 && "frames".equals(cmd.mode())
                    && !enabled(route.getSupportsFirstLastFrame())) {
                continue;
            }
            available.add(route);
        }
        if (available.isEmpty()) {
            throw new BizException(ErrorCode.VALID_40003, "当前模型暂无支持该规格的可用渠道线路");
        }
        return new CostAwareRouteSelector(settingService, channelMapper, taskMapper)
                .select(available, salePrice, cmd.seconds());
    }

    private boolean enabled(Integer value) {
        return value != null && value == 1;
    }

    public PageResult<TaskDtos.TaskView> list(Long userId, String status, int page, int pageSize) {
        List<String> statuses = null;
        if (status != null && !status.isBlank()) {
            statuses = switch (status) {
                case "queued" -> List.of("CREATED", "SUBMITTING", "SUBMIT_UNKNOWN", "QUEUED");
                case "running" -> List.of("RUNNING", "DOWNLOADING");
                case "succeeded" -> List.of("SUCCEEDED");
                case "failed" -> List.of("FAILED", "EXPIRED");
                case "cancelled" -> List.of("CANCELLED");
                default -> List.of(status.toUpperCase());
            };
        }
        long total = taskMapper.countUserPage(userId, statuses);
        long offset = (long) (page - 1) * pageSize;
        List<TaskDtos.TaskView> views = new ArrayList<>();
        for (VideoTask task : taskMapper.selectUserPage(userId, statuses, offset, pageSize)) {
            views.add(toView(task));
        }
        return PageResult.of(views, page, pageSize, total);
    }

    public TaskDtos.TaskView detail(Long userId, String taskNo) {
        return toView(requireOwned(userId, taskNo));
    }

    public VideoTask requireOwned(Long userId, String taskNo) {
        VideoTask task = taskMapper.selectByTaskNoAndUser(taskNo, userId);
        if (task == null || "image".equals(readMap(task.getParamsJson()).get("capability"))) {
            throw new BizException(ErrorCode.TASK_40401, "任务不存在", null, 404);
        }
        return task;
    }

    @Transactional
    public TaskDtos.CancelResult cancel(Long userId, String taskNo) {
        return cancelTask(requireOwned(userId, taskNo), false);
    }

    /** Shared by user video cancellation and administrator video/image cancellation. */
    public TaskDtos.CancelResult cancelTask(VideoTask task, boolean admin) {
        return tx.execute(status -> {
            if (!ACTIVE_STATUSES.contains(task.getStatus())) {
                throw new BizException(ErrorCode.TASK_40901, "任务已结束，无法取消", null, 409);
            }
            billingService.lockAccount(task.getUserId());
            int updated = taskMapper.cancelActive(task.getId(), LocalDateTime.now(ZoneOffset.UTC),
                    admin, ACTIVE_STATUSES);
            if (updated == 0) {
                throw new BizException(ErrorCode.TASK_40901, "任务状态已变化，请刷新", null, 409);
            }
            modelMapper.decrementLoad(task.getModelId());
            long held = task.getHeldCredits() == null ? 0 : task.getHeldCredits();
            if (!billingService.refund(task.getUserId(), task.getId(), task.getTaskNo(), held,
                    admin ? "管理员取消退款" : "用户取消任务退款")) {
                throw new IllegalStateException("task cancellation refund failed");
            }
            event(task, task.getStatus(), "CANCELLED", admin ? "ADMIN" : "USER", admin ? "管理员取消" : "用户取消");
            return new TaskDtos.CancelResult(task.getTaskNo(), "cancelled", held);
        });
    }

    public void delete(Long userId, String taskNo) {
        VideoTask task = requireOwned(userId, taskNo);
        if (!TERMINAL_STATUSES.contains(task.getStatus())) {
            throw new BizException(ErrorCode.TASK_40901, "任务未结束，不能删除", null, 409);
        }
        taskMapper.deleteById(task.getId());
    }

    // ---------- poller support ----------

    public List<VideoTask> dueTasks(int limit) {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        return taskMapper.selectDue(ACTIVE_STATUSES, now, limit);
    }

    public boolean lease(VideoTask task, int leaseSeconds) {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        int updated = taskMapper.lease(task.getId(), now.plusSeconds(leaseSeconds), now, ACTIVE_STATUSES);
        return updated > 0;
    }

    public void process(VideoTask task) {
        VideoTask fresh = taskMapper.selectById(task.getId());
        if (fresh == null || "image".equals(readMap(fresh.getParamsJson()).get("capability"))
                || !ACTIVE_STATUSES.contains(fresh.getStatus())) {
            return;
        }
        VideoModel model = modelMapper.selectById(fresh.getModelId());
        Channel channel = channelMapper.selectById(fresh.getChannelId());
        if (model != null && !"video".equals(model.getCapability())) {
            fail(fresh, "MODEL_CAPABILITY_CHANGED", "视频模型类型已变更，金额已退回");
            return;
        }
        if (model == null || channel == null || channel.getEnabled() == null || channel.getEnabled() != 1) {
            fail(fresh, "CHANNEL_DISABLED", "模型或渠道已下架");
            return;
        }
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (fresh.getDeadlineAt() != null && now.isAfter(fresh.getDeadlineAt()) && !"DOWNLOADING".equals(fresh.getStatus())) {
            fail(fresh, "EXPIRED", "生成超时，金额已退回");
            return;
        }
        try {
            if (fresh.getUpstreamTaskId() == null || fresh.getUpstreamTaskId().isBlank()) {
                submit(fresh, model, channel);
            } else {
                poll(fresh, channel);
            }
        } catch (UpstreamException ex) {
            log.warn("upstream call failed task={} code={} status={}", fresh.getTaskNo(), ex.getCode(), ex.getHttpStatus());
            if (List.of("UPSTREAM_AUTH", "UPSTREAM_BALANCE", "UPSTREAM_INVALID_PARAM").contains(ex.getCode())
                    || fresh.getAttemptCount() != null && fresh.getAttemptCount() >= 2) {
                fail(fresh, ex.getCode(), ex.getMessage());
            } else {
                schedule(fresh, "CREATED".equals(fresh.getStatus()) ? "CREATED" : fresh.getStatus(), backoff(fresh.getAttemptCount() == null ? 0 : fresh.getAttemptCount()));
            }
        } catch (Exception ex) {
            log.error("poll task failed task=" + fresh.getTaskNo(), ex);
            fail(fresh, "PLATFORM_ERROR", "平台内部错误，金额已退回");
        }
    }

    private void submit(VideoTask task, VideoModel model, Channel channel) {
        List<byte[]> images = new ArrayList<>();
        Map<String, Object> refs = readMap(task.getReferencesJson());
        Object raw = refs.get("fileNos");
        if (raw instanceof List<?> list) {
            for (Object item : list) {
                FileObject file = fileObjectMapper.selectByFileNo(String.valueOf(item));
                if (file != null) {
                    try {
                        images.add(Files.readAllBytes(fileStorageService.pathOf(file)));
                    } catch (Exception ex) {
                        throw new BizException(ErrorCode.UPSTREAM_50205, "读取参考图失败");
                    }
                }
            }
        }
        Map<String, Object> params = readMap(task.getParamsJson());
        int seconds = ((Number) params.getOrDefault("seconds", 6)).intValue();
        String resolution = String.valueOf(params.getOrDefault("resolution", "720p"));
        String size = String.valueOf(params.getOrDefault("size", "1280x720"));
        String ratio = String.valueOf(params.getOrDefault("ratio", "16:9"));
        boolean audio = Boolean.parseBoolean(String.valueOf(params.getOrDefault("generateAudio", false)));
        boolean watermark = Boolean.parseBoolean(String.valueOf(params.getOrDefault("watermark", false)));
        String mode = String.valueOf(params.getOrDefault("mode", "frames"));
        task.setAttemptCount((task.getAttemptCount() == null ? 0 : task.getAttemptCount()) + 1);
        taskMapper.updateById(task);
        JsonNode created = adapter.create(new OpenAiCompatVideoAdapter.CreateContext(
                channel, task, model, task.getPrompt(), seconds, size, ratio, resolution, audio, watermark, mode, images));
        String upstreamId = adapter.extractTaskId(created);
        if (upstreamId == null) {
            throw new UpstreamException("UPSTREAM_BAD_BODY", "上游未返回任务 ID", 502, created.toString());
        }
        taskMapper.markQueued(task.getId(), upstreamId, adapter.extractStatus(created),
                LocalDateTime.now(ZoneOffset.UTC), LocalDateTime.now(ZoneOffset.UTC).plusSeconds(2));
        event(task, task.getStatus(), "QUEUED", "SYSTEM", "上游任务已创建：" + upstreamId);
    }

    private void poll(VideoTask task, Channel channel) {
        JsonNode state = adapter.query(channel, task);
        String rawStatus = adapter.extractStatus(state);
        int progress = adapter.extractProgress(state);
        String mapped = mapStatus(rawStatus);
        switch (mapped) {
            case "QUEUED" -> schedule(task, "QUEUED", backoff(task.getPollCount() == null ? 0 : task.getPollCount()));
            case "RUNNING" -> {
                taskMapper.markRunning(task.getId(), rawStatus,
                        Math.max(progress, task.getProgress() == null ? 0 : task.getProgress()),
                        LocalDateTime.now(ZoneOffset.UTC).plusSeconds(backoff(task.getPollCount() == null ? 0 : task.getPollCount())),
                        ACTIVE_STATUSES);
            }
            case "COMPLETED" -> {
                taskMapper.markDownloading(task.getId(), rawStatus, 100,
                        LocalDateTime.now(ZoneOffset.UTC).plusSeconds(120), ACTIVE_STATUSES);
                downloadAndFinalize(task.getId(), state);
            }
            case "FAILED" -> fail(task, "UPSTREAM_TASK_FAILED", adapter.extractErrorMessage(state) == null
                    ? "上游生成失败，金额已退回" : "上游生成失败：" + adapter.extractErrorMessage(state));
            case "CANCELLED" -> fail(task, "CANCELLED_UPSTREAM", "上游任务已取消，金额已退回");
            case "EXPIRED" -> fail(task, "EXPIRED", "生成超时，金额已退回");
            default -> schedule(task, task.getStatus(), 5);
        }
        if (adapter.extractResultUrl(state) != null && "COMPLETED".equals(mapped)) {
            // handled inside downloadAndFinalize
        }
    }

    private void downloadAndFinalize(Long taskId, JsonNode state) {
        VideoTask task = taskMapper.selectById(taskId);
        Channel channel = channelMapper.selectById(task.getChannelId());
        byte[] bytes;
        String resultUrl = adapter.resolveResultUrl(channel, adapter.extractResultUrl(state));
        if (resultUrl != null) {
            ssrfGuard.assertResultUrl(resultUrl);
            try {
                bytes = adapter.downloadResultUrl(channel, task, resultUrl);
            } catch (UpstreamException ex) {
                bytes = adapter.content(channel, task);
            }
        } else {
            bytes = adapter.content(channel, task);
        }
        String contentType = "video/mp4";
        if (!looksLikeMp4(bytes) && !looksLikeWebm(bytes)) {
            throw new UpstreamException("UPSTREAM_BAD_BODY", "下载内容不是有效视频", 502, "");
        }
        FileObject file = fileStorageService.writeBytes(task.getUserId(), bytes, contentType, "VIDEO_RESULT", null, task.getId());
        finalizeSuccess(taskId, file.getId());
    }

    public void finalizeSuccess(Long taskId, Long fileId) {
        // Workers call this method on the same instance, so a proxy annotation is insufficient.
        tx.executeWithoutResult(status -> {
            VideoTask task = taskMapper.selectById(taskId);
            if (task == null || !ACTIVE_STATUSES.contains(task.getStatus())) {
                return;
            }
            billingService.lockAccount(task.getUserId());
            int updated = taskMapper.finalizeSuccess(taskId, fileId, LocalDateTime.now(ZoneOffset.UTC));
            if (updated == 0) {
                return;
            }
            FileObject file = fileObjectMapper.selectById(fileId);
            if (file == null) {
                throw new IllegalStateException("task result file missing");
            }
            file.setRefCount(1);
            fileObjectMapper.updateById(file);
            modelMapper.decrementLoad(task.getModelId());
            long held = task.getHeldCredits() == null ? 0 : task.getHeldCredits();
            if (!billingService.settle(task.getUserId(), taskId, task.getTaskNo(), held, held)) {
                throw new IllegalStateException("task settlement failed");
            }
            event(task, task.getStatus(), "SUCCEEDED", "SYSTEM", "生成完成，已结算");
        });
    }

    public void fail(VideoTask task, String code, String message) {
        tx.executeWithoutResult(status -> {
            billingService.lockAccount(task.getUserId());
            String terminal = "EXPIRED".equals(code) ? "EXPIRED" : "FAILED";
            int updated = taskMapper.failActive(task.getId(), terminal,
                    code, message, LocalDateTime.now(ZoneOffset.UTC), ACTIVE_STATUSES);
            if (updated == 0) {
                return;
            }
            modelMapper.decrementLoad(task.getModelId());
            if (!billingService.refund(task.getUserId(), task.getId(), task.getTaskNo(),
                    task.getHeldCredits() == null ? 0 : task.getHeldCredits(), message)) {
                throw new IllegalStateException("task failure refund failed");
            }
            event(task, task.getStatus(), terminal, "SYSTEM", message);
        });
    }

    private void schedule(VideoTask task, String status, int seconds) {
        taskMapper.schedule(task.getId(), status,
                LocalDateTime.now(ZoneOffset.UTC).plusSeconds(seconds), ACTIVE_STATUSES);
    }

    private int backoff(int pollCount) {
        int[] values = {3, 5, 8, 12, 20};
        return values[Math.min(pollCount, values.length - 1)];
    }

    private String mapStatus(String raw) {
        return switch (raw) {
            case "queued", "pending", "submitted", "created", "waiting" -> "QUEUED";
            case "in_progress", "processing", "running", "generating" -> "RUNNING";
            case "completed", "succeeded", "success", "done", "finished" -> "COMPLETED";
            case "failed", "error", "failure" -> "FAILED";
            case "cancelled", "canceled" -> "CANCELLED";
            case "expired", "timeout" -> "EXPIRED";
            default -> "UNKNOWN";
        };
    }

    public String toPublicStatus(String internal) {
        return switch (internal) {
            case "CREATED", "SUBMITTING", "SUBMIT_UNKNOWN", "QUEUED" -> "queued";
            case "RUNNING", "DOWNLOADING" -> "running";
            case "SUCCEEDED" -> "succeeded";
            case "CANCELLED" -> "cancelled";
            default -> "failed";
        };
    }

    public TaskDtos.TaskView toView(VideoTask task) {
        VideoModel routeModel = modelMapper.selectById(task.getModelId());
        VideoModel model = routeModel == null ? null : modelMapper.selectCanonicalByModelKey(
                routeModel.getModelKey() == null || routeModel.getModelKey().isBlank()
                        ? routeModel.getUpstreamModel() : routeModel.getModelKey(), routeModel.getCapability());
        Map<String, Object> params = readMap(task.getParamsJson());
        List<String> refs = new ArrayList<>();
        Object fileNos = readMap(task.getReferencesJson()).get("fileNos");
        if (fileNos instanceof List<?> list) {
            list.forEach(item -> refs.add(String.valueOf(item)));
        }
        TaskDtos.FileView file = null;
        if (task.getFileId() != null) {
            FileObject object = fileObjectMapper.selectById(task.getFileId());
            if (object != null) {
                file = fileStorageService.toView(object);
            }
        }
        return new TaskDtos.TaskView(
                task.getTaskNo(), toPublicStatus(task.getStatus()), task.getProgress() == null ? 0 : task.getProgress(),
                model == null ? "" : model.getDisplayName(),
                task.getPrompt(), params, refs, task.getHeldCredits(), task.getSettledCredits(),
                task.getErrorCode(), task.getErrorMessage(), file,
                format(task.getCreatedAt()), format(task.getFinishedAt()));
    }

    private Map<String, Object> params(CreateCommand cmd, String resolution, Map<String, java.math.BigDecimal> factors) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("seconds", cmd.seconds());
        map.put("resolution", resolution);
        map.put("size", cmd.size() == null || cmd.size().isBlank() ? defaultSize(cmd.ratio(), resolution) : cmd.size());
        map.put("ratio", cmd.ratio() == null || cmd.ratio().isBlank() ? "16:9" : cmd.ratio());
        map.put("generateAudio", cmd.generateAudio());
        map.put("watermark", cmd.watermark());
        map.put("mode", cmd.mode() == null || cmd.mode().isBlank() ? "frames" : cmd.mode());
        map.put("pricing", Map.of("resolutionFactors", factors, "creditsPerSecond", "snapshot"));
        return map;
    }

    private String defaultSize(String ratio, String resolution) {
        int height = switch (resolution) {
            case "480p" -> 480;
            case "1080p" -> 1080;
            default -> 720;
        };
        double r = switch (ratio == null ? "16:9" : ratio) {
            case "1:1" -> 1.0;
            case "3:4" -> 0.75;
            case "4:3" -> 4.0 / 3.0;
            case "9:16" -> 9.0 / 16.0;
            case "21:9" -> 21.0 / 9.0;
            default -> 16.0 / 9.0;
        };
        int width = (int) Math.round(height * r / 2.0) * 2;
        return width + "x" + height;
    }

    private void event(VideoTask task, String from, String to, String source, String detail) {
        VideoTaskEvent event = new VideoTaskEvent();
        event.setTaskId(task.getId());
        event.setFromStatus(from == null ? "" : from);
        event.setToStatus(to);
        event.setSource(source);
        event.setDetail(detail == null ? "" : detail);
        event.setCreatedAt(LocalDateTime.now(ZoneOffset.UTC));
        eventMapper.insert(event);
    }

    private List<String> readStringList(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {
            });
        } catch (Exception ex) {
            return List.of();
        }
    }

    private Map<String, Object> readMap(String json) {
        try {
            return objectMapper.readValue(json == null ? "{}" : json, new TypeReference<Map<String, Object>>() {
            });
        } catch (Exception ex) {
            return Map.of();
        }
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static String format(LocalDateTime time) {
        return time == null ? null : time.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME) + "Z";
    }

    private static boolean looksLikeMp4(byte[] bytes) {
        return bytes.length > 8 && bytes[4] == 'f' && bytes[5] == 't' && bytes[6] == 'y' && bytes[7] == 'p';
    }

    private static boolean looksLikeWebm(byte[] bytes) {
        return bytes.length > 4 && (bytes[0] & 0xFF) == 0x1A && (bytes[1] & 0xFF) == 0x45
                && (bytes[2] & 0xFF) == 0xDF && (bytes[3] & 0xFF) == 0xA3;
    }
}
