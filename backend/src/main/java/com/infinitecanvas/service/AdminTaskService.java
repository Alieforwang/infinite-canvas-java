package com.infinitecanvas.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.common.BizException;
import com.infinitecanvas.common.ErrorCode;
import com.infinitecanvas.common.PageResult;
import com.infinitecanvas.dto.AdminDtos;
import com.infinitecanvas.dto.TaskDtos;
import com.infinitecanvas.entity.CreditTransaction;
import com.infinitecanvas.entity.UpstreamCallLog;
import com.infinitecanvas.entity.User;
import com.infinitecanvas.entity.VideoTask;
import com.infinitecanvas.entity.VideoTaskEvent;
import com.infinitecanvas.mapper.CreditTransactionMapper;
import com.infinitecanvas.mapper.UpstreamCallLogMapper;
import com.infinitecanvas.mapper.UserMapper;
import com.infinitecanvas.mapper.VideoTaskEventMapper;
import com.infinitecanvas.mapper.VideoTaskMapper;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AdminTaskService {

    private final VideoTaskMapper taskMapper;
    private final UserMapper userMapper;
    private final VideoTaskEventMapper eventMapper;
    private final UpstreamCallLogMapper callLogMapper;
    private final CreditTransactionMapper transactionMapper;
    private final VideoTaskService taskService;
    private final BillingService billingService;
    private final AuditService auditService;
    private final ObjectMapper objectMapper;

    public AdminTaskService(VideoTaskMapper taskMapper, UserMapper userMapper, VideoTaskEventMapper eventMapper,
                            UpstreamCallLogMapper callLogMapper, CreditTransactionMapper transactionMapper,
                            VideoTaskService taskService, BillingService billingService,
                            AuditService auditService, ObjectMapper objectMapper) {
        this.taskMapper = taskMapper;
        this.userMapper = userMapper;
        this.eventMapper = eventMapper;
        this.callLogMapper = callLogMapper;
        this.transactionMapper = transactionMapper;
        this.taskService = taskService;
        this.billingService = billingService;
        this.auditService = auditService;
        this.objectMapper = objectMapper;
    }

    public PageResult<AdminDtos.AdminTaskView> list(String status, Long userId, String taskNo, int page, int pageSize) {
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
        String taskNoLike = taskNo == null || taskNo.isBlank() ? null : taskNo.trim();
        long total = taskMapper.countAdminPage(statuses, userId, taskNoLike);
        long offset = (long) (page - 1) * pageSize;
        List<AdminDtos.AdminTaskView> views = new ArrayList<>();
        for (VideoTask task : taskMapper.selectAdminPage(statuses, userId, taskNoLike, offset, pageSize)) {
            views.add(new AdminDtos.AdminTaskView(taskService.toView(task), task.getUserId(),
                    emailOf(task.getUserId())));
        }
        return PageResult.of(views, page, pageSize, total);
    }

    public AdminDtos.AdminTaskDetail detail(String taskNo) {
        VideoTask task = requireTask(taskNo);
        List<Map<String, Object>> events = new ArrayList<>();
        for (VideoTaskEvent event : eventMapper.selectByTaskId(task.getId())) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("from", event.getFromStatus());
            item.put("to", event.getToStatus());
            item.put("source", event.getSource());
            item.put("detail", event.getDetail());
            item.put("at", event.getCreatedAt());
            events.add(item);
        }
        List<Map<String, Object>> calls = new ArrayList<>();
        for (UpstreamCallLog call : callLogMapper.selectLatestByTaskId(task.getId(), 100)) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("action", call.getAction());
            item.put("httpStatus", call.getHttpStatus());
            item.put("latencyMs", call.getLatencyMs());
            item.put("errorCode", call.getErrorCode());
            item.put("snippet", call.getResponseSnippet());
            item.put("at", call.getCreatedAt());
            calls.add(item);
        }
        List<Map<String, Object>> transactions = new ArrayList<>();
        for (CreditTransaction tx : transactionMapper.selectByTask(task.getId())) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("bizType", tx.getBizType());
            item.put("availableDelta", tx.getAvailableDelta());
            item.put("frozenDelta", tx.getFrozenDelta());
            item.put("remark", tx.getRemark());
            item.put("at", tx.getCreatedAt());
            transactions.add(item);
        }
        return new AdminDtos.AdminTaskDetail(taskService.toView(task), task.getUserId(), emailOf(task.getUserId()),
                events, calls, transactions);
    }

    @Transactional
    public TaskDtos.CreateResult retry(String taskNo, Long adminId) {
        VideoTask task = requireTask(taskNo);
        if (!List.of("FAILED", "EXPIRED", "CANCELLED").contains(task.getStatus())) {
            throw new BizException(ErrorCode.TASK_40901, "仅失败的终态任务可重试", null, 409);
        }
        Map<String, Object> params = readMap(task.getParamsJson());
        List<String> refs = new ArrayList<>();
        Object raw = readMap(task.getReferencesJson()).get("fileNos");
        if (raw instanceof List<?> list) {
            list.forEach(item -> refs.add(String.valueOf(item)));
        }
        int seconds = ((Number) params.getOrDefault("seconds", 6)).intValue();
        String resolution = String.valueOf(params.getOrDefault("resolution", "720p"));
        String size = String.valueOf(params.getOrDefault("size", "1280x720"));
        String ratio = String.valueOf(params.getOrDefault("ratio", "16:9"));
        boolean audio = Boolean.parseBoolean(String.valueOf(params.getOrDefault("generateAudio", false)));
        boolean watermark = Boolean.parseBoolean(String.valueOf(params.getOrDefault("watermark", false)));
        String mode = String.valueOf(params.getOrDefault("mode", "frames"));
        TaskDtos.CreateResult result = taskService.create(task.getUserId(),
                new VideoTaskService.CreateCommand(null, task.getModelId(), task.getPrompt(), seconds, resolution,
                        size, ratio, audio, watermark, mode, refs),
                null, "admin-retry", MDC.get(com.infinitecanvas.common.RequestIdFilter.MDC_KEY));
        auditService.record("ADMIN", adminId, "TASK_RETRY", "TASK", taskNo,
                "{\"newTaskNo\":\"" + result.taskNo() + "\"}", "", MDC.get(com.infinitecanvas.common.RequestIdFilter.MDC_KEY));
        return result;
    }

    @Transactional
    public void refund(String taskNo, String reason, Long adminId) {
        VideoTask task = requireTask(taskNo);
        if ("SUCCEEDED".equals(task.getStatus())) {
            throw new BizException(ErrorCode.TASK_40901, "已成功任务不支持直接退款", null, 409);
        }
        if (transactionMapper.countFinalize(task.getId()) > 0) {
            throw new BizException(ErrorCode.TASK_40901, "该任务已完成退款/结算，请勿重复操作", null, 409);
        }
        boolean refunded = billingService.refund(task.getUserId(), task.getId(), task.getTaskNo(),
                task.getHeldCredits() == null ? 0 : task.getHeldCredits(),
                reason == null || reason.isBlank() ? "管理员手工退款" : reason);
        if (!refunded) {
            throw new BizException(ErrorCode.TASK_40901, "退款失败：无可退积分", null, 409);
        }
        auditService.record("ADMIN", adminId, "TASK_REFUND", "TASK", taskNo,
                "{\"reason\":\"" + (reason == null ? "" : reason) + "\"}", "", MDC.get(com.infinitecanvas.common.RequestIdFilter.MDC_KEY));
    }

    @Transactional
    public void cancel(String taskNo, Long adminId) {
        VideoTask task = requireTask(taskNo);
        if (!VideoTaskService.ACTIVE_STATUSES.contains(task.getStatus())) {
            throw new BizException(ErrorCode.TASK_40901, "任务已结束，无法取消", null, 409);
        }
        int updated = taskMapper.cancelActive(task.getId(), LocalDateTime.now(ZoneOffset.UTC),
                true, VideoTaskService.ACTIVE_STATUSES);
        if (updated == 0) {
            throw new BizException(ErrorCode.TASK_40901, "任务状态已变化，请刷新", null, 409);
        }
        billingService.refund(task.getUserId(), task.getId(), task.getTaskNo(),
                task.getHeldCredits() == null ? 0 : task.getHeldCredits(), "管理员取消退款");
        auditService.record("ADMIN", adminId, "TASK_CANCEL", "TASK", taskNo, "{}", "",
                MDC.get(com.infinitecanvas.common.RequestIdFilter.MDC_KEY));
    }

    private VideoTask requireTask(String taskNo) {
        VideoTask task = taskMapper.selectByTaskNo(taskNo);
        if (task == null) {
            throw new BizException(ErrorCode.TASK_40401, "任务不存在", null, 404);
        }
        return task;
    }

    private String emailOf(Long userId) {
        User user = userMapper.selectById(userId);
        return user == null ? "" : user.getEmail();
    }

    private Map<String, Object> readMap(String json) {
        try {
            return objectMapper.readValue(json == null ? "{}" : json, new TypeReference<Map<String, Object>>() {
            });
        } catch (Exception ex) {
            return Map.of();
        }
    }
}
