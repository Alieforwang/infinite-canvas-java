package com.infinitecanvas.service;

import com.infinitecanvas.common.BizException;
import com.infinitecanvas.common.ErrorCode;
import com.infinitecanvas.dto.AccountDtos;
import com.infinitecanvas.entity.Plan;
import com.infinitecanvas.entity.RedeemCode;
import com.infinitecanvas.mapper.PlanMapper;
import com.infinitecanvas.mapper.RedeemCodeMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

@Service
public class RedeemService {

    private final RedeemCodeMapper redeemCodeMapper;
    private final PlanMapper planMapper;
    private final BillingService billingService;

    public RedeemService(RedeemCodeMapper redeemCodeMapper, PlanMapper planMapper, BillingService billingService) {
        this.redeemCodeMapper = redeemCodeMapper;
        this.planMapper = planMapper;
        this.billingService = billingService;
    }

    @Transactional
    public AccountDtos.RedeemResult redeem(Long userId, String code) {
        if (code == null || code.isBlank()) {
            throw new BizException(ErrorCode.BILL_40202, "请输入兑换码");
        }
        RedeemCode redeemCode = redeemCodeMapper.selectByCode(code.trim().toUpperCase());
        if (redeemCode == null || "DISABLED".equals(redeemCode.getStatus())) {
            throw new BizException(ErrorCode.BILL_40202, "兑换码无效");
        }
        if (!"UNUSED".equals(redeemCode.getStatus())) {
            throw new BizException(ErrorCode.BILL_40202, "兑换码已被使用");
        }
        if (redeemCode.getExpiresAt() != null && redeemCode.getExpiresAt().isBefore(LocalDateTime.now(ZoneOffset.UTC))) {
            throw new BizException(ErrorCode.BILL_40202, "兑换码已过期");
        }
        int updated = redeemCodeMapper.markUsedIfUnused(redeemCode.getId(), userId,
                LocalDateTime.now(ZoneOffset.UTC));
        if (updated == 0) {
            throw new BizException(ErrorCode.BILL_40202, "兑换码已被使用");
        }
        long credits = redeemCode.getCredits() == null ? 0 : redeemCode.getCredits();
        String planName = null;
        if (redeemCode.getPlanId() != null) {
            Plan plan = planMapper.selectById(redeemCode.getPlanId());
            if (plan != null) {
                planName = plan.getName();
                long planCredits = (plan.getCredits() == null ? 0 : plan.getCredits())
                        + (plan.getBonusCredits() == null ? 0 : plan.getBonusCredits());
                credits = credits > 0 ? credits : planCredits;
            }
        }
        billingService.addCredits(userId, credits, "REDEEM", "redeem:" + redeemCode.getId(),
                "兑换码：" + redeemCode.getCode(), null);
        return new AccountDtos.RedeemResult(credits, planName);
    }
}
