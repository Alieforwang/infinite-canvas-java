package com.infinitecanvas.service;

import com.infinitecanvas.common.BizException;
import com.infinitecanvas.common.ErrorCode;
import com.infinitecanvas.common.PageResult;
import com.infinitecanvas.common.Ulid;
import com.infinitecanvas.dto.AdminDtos;
import com.infinitecanvas.entity.CreditAccount;
import com.infinitecanvas.entity.CreditTransaction;
import com.infinitecanvas.entity.Plan;
import com.infinitecanvas.entity.PlanOrder;
import com.infinitecanvas.entity.User;
import com.infinitecanvas.entity.UserPlan;
import com.infinitecanvas.mapper.CreditAccountMapper;
import com.infinitecanvas.mapper.PlanMapper;
import com.infinitecanvas.mapper.PlanOrderMapper;
import com.infinitecanvas.mapper.UserMapper;
import com.infinitecanvas.mapper.UserPlanMapper;
import com.infinitecanvas.mapper.VideoTaskMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

@Service
public class AdminUserService {

    private final UserMapper userMapper;
    private final CreditAccountMapper accountMapper;
    private final VideoTaskMapper taskMapper;
    private final PlanMapper planMapper;
    private final PlanOrderMapper planOrderMapper;
    private final UserPlanMapper userPlanMapper;
    private final BillingService billingService;
    private final AuditService auditService;

    public AdminUserService(UserMapper userMapper, CreditAccountMapper accountMapper, VideoTaskMapper taskMapper,
                            PlanMapper planMapper, PlanOrderMapper planOrderMapper, UserPlanMapper userPlanMapper,
                            BillingService billingService, AuditService auditService) {
        this.userMapper = userMapper;
        this.accountMapper = accountMapper;
        this.taskMapper = taskMapper;
        this.planMapper = planMapper;
        this.planOrderMapper = planOrderMapper;
        this.userPlanMapper = userPlanMapper;
        this.billingService = billingService;
        this.auditService = auditService;
    }

    public PageResult<AdminDtos.AdminUserView> list(String keyword, String status, int page, int pageSize) {
        String kw = keyword == null || keyword.isBlank() ? null : keyword.trim();
        String st = status == null || status.isBlank() ? null : status;
        long total = userMapper.countByKeywordAndStatus(kw, st);
        List<AdminDtos.AdminUserView> views = new ArrayList<>();
        for (User user : userMapper.selectPage(kw, st, (long) (page - 1) * pageSize, pageSize)) {
            views.add(toView(user));
        }
        return PageResult.of(views, page, pageSize, total);
    }

    public AdminDtos.AdminUserView detail(Long id) {
        User user = requireUser(id);
        return toView(user);
    }

    @Transactional
    public void setStatus(Long id, String status, String reason, Long adminId, String requestId) {
        User user = requireUser(id);
        if (!"ACTIVE".equals(status) && !"DISABLED".equals(status)) {
            throw new BizException(ErrorCode.VALID_40001, "状态只能是 ACTIVE / DISABLED");
        }
        String before = user.getStatus();
        user.setStatus(status);
        userMapper.updateById(user);
        auditService.record("ADMIN", adminId, "USER_STATUS", "USER", String.valueOf(id),
                "{\"before\":\"" + before + "\",\"after\":\"" + status + "\",\"reason\":\"" + safe(reason) + "\"}",
                "", requestId);
    }

    @Transactional
    public void adjust(Long id, Long amount, String reason, Long adminId, String requestId) {
        if (amount == null || amount == 0) {
            throw new BizException(ErrorCode.VALID_40001, "调账数量不能为 0");
        }
        if (reason == null || reason.trim().length() < 2) {
            throw new BizException(ErrorCode.VALID_40001, "调账原因至少 2 个字");
        }
        requireUser(id);
        billingService.adjust(id, amount, reason.trim(), adminId, requestId);
        auditService.record("ADMIN", adminId, "USER_ADJUST", "USER", String.valueOf(id),
                "{\"amount\":" + amount + ",\"reason\":\"" + safe(reason) + "\"}", "", requestId);
    }

    @Transactional
    public void recharge(Long id, Long amount, String remark, Long adminId, String requestId) {
        if (amount == null || amount <= 0) {
            throw new BizException(ErrorCode.VALID_40001, "充值积分必须大于 0");
        }
        requireUser(id);
        PlanOrder order = new PlanOrder();
        order.setOrderNo(Ulid.next());
        order.setUserId(id);
        order.setType("MANUAL");
        order.setPayMethod("MANUAL");
        order.setAmount(BigDecimal.ZERO);
        order.setCredits(amount);
        order.setStatus("PAID");
        order.setOperatorAdminId(adminId);
        order.setRemark(remark == null ? "" : remark);
        order.setPaidAt(LocalDateTime.now(ZoneOffset.UTC));
        planOrderMapper.insert(order);
        billingService.addCredits(id, amount, "RECHARGE", "order:" + order.getOrderNo(),
                remark == null || remark.isBlank() ? "管理员手工充值" : remark, adminId);
        auditService.record("ADMIN", adminId, "USER_RECHARGE", "USER", String.valueOf(id),
                "{\"amount\":" + amount + ",\"orderNo\":\"" + order.getOrderNo() + "\"}", "", requestId);
    }

    @Transactional
    public void grantPlan(Long id, Long planId, String reason, Long adminId, String requestId) {
        requireUser(id);
        Plan plan = planMapper.selectById(planId);
        if (plan == null || plan.getEnabled() == null || plan.getEnabled() != 1) {
            throw new BizException(ErrorCode.VALID_40001, "套餐不存在或未上架");
        }
        long credits = (plan.getCredits() == null ? 0 : plan.getCredits())
                + (plan.getBonusCredits() == null ? 0 : plan.getBonusCredits());
        PlanOrder order = new PlanOrder();
        order.setOrderNo(Ulid.next());
        order.setUserId(id);
        order.setPlanId(plan.getId());
        order.setType("GRANT");
        order.setPayMethod("MANUAL");
        order.setAmount(BigDecimal.ZERO);
        order.setCredits(credits);
        order.setStatus("PAID");
        order.setOperatorAdminId(adminId);
        order.setRemark(reason == null ? "" : reason);
        order.setPaidAt(LocalDateTime.now(ZoneOffset.UTC));
        planOrderMapper.insert(order);
        UserPlan userPlan = new UserPlan();
        userPlan.setUserId(id);
        userPlan.setPlanId(plan.getId());
        userPlan.setOrderId(order.getId());
        userPlan.setCreditsTotal(credits);
        userPlan.setCreditsUsed(0L);
        userPlan.setStartedAt(LocalDateTime.now(ZoneOffset.UTC));
        userPlan.setExpiresAt(plan.getValidDays() == null || plan.getValidDays() <= 0
                ? null : LocalDateTime.now(ZoneOffset.UTC).plusDays(plan.getValidDays()));
        userPlan.setStatus("ACTIVE");
        userPlan.setCreatedAt(LocalDateTime.now(ZoneOffset.UTC));
        userPlanMapper.insert(userPlan);
        billingService.addCredits(id, credits, "PLAN_GRANT", "plan:" + order.getOrderNo(),
                "开通套餐：" + plan.getName(), adminId);
        auditService.record("ADMIN", adminId, "USER_PLAN_GRANT", "USER", String.valueOf(id),
                "{\"planId\":" + planId + ",\"credits\":" + credits + "}", "", requestId);
    }

    public List<CreditTransaction> transactions(Long id, int page, int pageSize) {
        requireUser(id);
        return billingService.transactions(id, page, pageSize);
    }

    public User requireUser(Long id) {
        User user = userMapper.selectById(id);
        if (user == null) {
            throw new BizException("USER_40401", "用户不存在", null, 404);
        }
        return user;
    }

    private AdminDtos.AdminUserView toView(User user) {
        CreditAccount account = accountMapper.selectById(user.getId());
        long taskCount = taskMapper.countByUser(user.getId());
        return new AdminDtos.AdminUserView(user.getId(), user.getEmail(), user.getDisplayName(), user.getStatus(),
                account == null || account.getAvailable() == null ? 0 : account.getAvailable(),
                account == null || account.getFrozen() == null ? 0 : account.getFrozen(),
                account == null || account.getTotalConsumed() == null ? 0 : account.getTotalConsumed(),
                taskCount, user.getCreatedAt(), user.getLastLoginAt());
    }

    private static String safe(String value) {
        return value == null ? "" : value.replace("\"", "'");
    }
}
