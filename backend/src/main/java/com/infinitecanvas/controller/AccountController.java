package com.infinitecanvas.controller;

import com.infinitecanvas.common.ApiResponse;
import com.infinitecanvas.common.PageResult;
import com.infinitecanvas.dto.AccountDtos;
import com.infinitecanvas.entity.CreditAccount;
import com.infinitecanvas.entity.CreditTransaction;
import com.infinitecanvas.entity.Plan;
import com.infinitecanvas.entity.UserPlan;
import com.infinitecanvas.entity.VideoTask;
import com.infinitecanvas.mapper.PlanMapper;
import com.infinitecanvas.mapper.UserPlanMapper;
import com.infinitecanvas.mapper.VideoTaskMapper;
import com.infinitecanvas.security.AuthUtils;
import com.infinitecanvas.service.BillingService;
import com.infinitecanvas.service.RedeemService;
import com.infinitecanvas.service.SettingService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class AccountController {

    private final BillingService billingService;
    private final SettingService settingService;
    private final RedeemService redeemService;
    private final VideoTaskMapper taskMapper;
    private final UserPlanMapper userPlanMapper;
    private final PlanMapper planMapper;

    public AccountController(BillingService billingService, SettingService settingService, RedeemService redeemService,
                             VideoTaskMapper taskMapper, UserPlanMapper userPlanMapper, PlanMapper planMapper) {
        this.billingService = billingService;
        this.settingService = settingService;
        this.redeemService = redeemService;
        this.taskMapper = taskMapper;
        this.userPlanMapper = userPlanMapper;
        this.planMapper = planMapper;
    }

    @GetMapping("/account")
    public ApiResponse<AccountDtos.AccountView> account() {
        Long userId = AuthUtils.userId();
        CreditAccount account = billingService.account(userId);
        long running = taskMapper.countActiveByUser(userId);
        Map<String, Object> plan = currentPlan(userId);
        return ApiResponse.ok(new AccountDtos.AccountView(
                account.getAvailable() == null ? 0 : account.getAvailable(),
                account.getFrozen() == null ? 0 : account.getFrozen(),
                account.getTotalConsumed() == null ? 0 : account.getTotalConsumed(),
                account.getTotalRecharged() == null ? 0 : account.getTotalRecharged(),
                settingService.getLong("credit.exchange_per_yuan", 100),
                settingService.getLong("task.max_concurrency_per_user", 2),
                running, plan));
    }

    @GetMapping("/account/transactions")
    public ApiResponse<PageResult<AccountDtos.TransactionView>> transactions(
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "pageSize", defaultValue = "20") int pageSize) {
        Long userId = AuthUtils.userId();
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(pageSize, 1), 100);
        List<CreditTransaction> transactions = billingService.transactions(userId, safePage, safeSize);
        long total = billingService.transactionCount(userId);
        List<AccountDtos.TransactionView> views = new ArrayList<>();
        for (CreditTransaction tx : transactions) {
            String taskNo = null;
            if (tx.getTaskId() != null) {
                VideoTask task = taskMapper.selectById(tx.getTaskId());
                taskNo = task == null ? null : task.getTaskNo();
            }
            views.add(new AccountDtos.TransactionView(tx.getId(), tx.getBizType(), label(tx.getBizType()),
                    tx.getAvailableDelta(), tx.getBalanceAfter(), taskNo, tx.getRemark(),
                    tx.getCreatedAt() == null ? null : tx.getCreatedAt().toString() + "Z"));
        }
        return ApiResponse.ok(PageResult.of(views, safePage, safeSize, total));
    }

    @PostMapping("/account/redeem")
    public ApiResponse<AccountDtos.RedeemResult> redeem(@RequestBody AccountDtos.RedeemRequest request) {
        return ApiResponse.ok(redeemService.redeem(AuthUtils.userId(), request.code()));
    }

    @GetMapping("/plans")
    public ApiResponse<List<Map<String, Object>>> plans() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Plan plan : planMapper.selectEnabledSorted()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", plan.getId());
            item.put("code", plan.getCode());
            item.put("name", plan.getName());
            item.put("type", plan.getType());
            item.put("priceAmount", plan.getPriceAmount());
            item.put("credits", (plan.getCredits() == null ? 0 : plan.getCredits())
                    + (plan.getBonusCredits() == null ? 0 : plan.getBonusCredits()));
            item.put("validDays", plan.getValidDays());
            item.put("description", plan.getDescription());
            result.add(item);
        }
        return ApiResponse.ok(result);
    }

    private Map<String, Object> currentPlan(Long userId) {
        UserPlan userPlan = userPlanMapper.selectActiveLatest(userId);
        if (userPlan == null) {
            return null;
        }
        Plan plan = planMapper.selectById(userPlan.getPlanId());
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("name", plan == null ? "" : plan.getName());
        map.put("expiresAt", userPlan.getExpiresAt() == null ? null : userPlan.getExpiresAt().toString() + "Z");
        map.put("creditsTotal", userPlan.getCreditsTotal());
        map.put("creditsUsed", userPlan.getCreditsUsed());
        return map;
    }

    private static String label(String bizType) {
        return switch (bizType) {
            case "HOLD" -> "预扣";
            case "SETTLE" -> "消费";
            case "REFUND" -> "退款";
            case "RECHARGE" -> "充值";
            case "GIFT" -> "注册赠送";
            case "REDEEM" -> "兑换";
            case "PLAN_GRANT" -> "套餐";
            case "ADJUST" -> "管理员调整";
            case "SETTLE_ADJUST" -> "补差";
            default -> bizType;
        };
    }
}
