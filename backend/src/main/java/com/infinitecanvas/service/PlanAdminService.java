package com.infinitecanvas.service;

import com.infinitecanvas.common.BizException;
import com.infinitecanvas.common.ErrorCode;
import com.infinitecanvas.dto.AdminDtos;
import com.infinitecanvas.entity.Plan;
import com.infinitecanvas.mapper.PlanMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Service
public class PlanAdminService {

    private final PlanMapper planMapper;

    public PlanAdminService(PlanMapper planMapper) {
        this.planMapper = planMapper;
    }

    public List<Plan> list() {
        return planMapper.selectAllSorted();
    }

    @Transactional
    public Plan create(AdminDtos.PlanRequest request) {
        Plan plan = new Plan();
        apply(plan, request, true);
        planMapper.insert(plan);
        return plan;
    }

    @Transactional
    public Plan update(Long id, AdminDtos.PlanRequest request) {
        Plan plan = planMapper.selectById(id);
        if (plan == null) {
            throw new BizException("PLAN_40401", "套餐不存在", null, 404);
        }
        apply(plan, request, false);
        planMapper.updateById(plan);
        return plan;
    }

    @Transactional
    public void delete(Long id) {
        Plan plan = planMapper.selectById(id);
        if (plan == null) {
            throw new BizException("PLAN_40401", "套餐不存在", null, 404);
        }
        plan.setEnabled(0);
        planMapper.updateById(plan);
    }

    private void apply(Plan plan, AdminDtos.PlanRequest request, boolean create) {
        if (create) {
            if (request.code() == null || request.code().isBlank()) {
                throw new BizException(ErrorCode.VALID_40001, "套餐 code 不能为空");
            }
            if (request.name() == null || request.name().isBlank()) {
                throw new BizException(ErrorCode.VALID_40001, "套餐名称不能为空");
            }
        }
        if (request.code() != null && !request.code().isBlank()) {
            plan.setCode(request.code().trim());
        }
        if (request.name() != null && !request.name().isBlank()) {
            plan.setName(request.name().trim());
        }
        if (request.type() != null) {
            if (!"CREDIT_PACK".equals(request.type()) && !"PLAN".equals(request.type())) {
                throw new BizException(ErrorCode.VALID_40001, "套餐类型只能是 CREDIT_PACK / PLAN");
            }
            plan.setType(request.type());
        } else if (create) {
            plan.setType("CREDIT_PACK");
        }
        plan.setPriceAmount(request.priceAmount() == null ? (create ? BigDecimal.ZERO : plan.getPriceAmount()) : request.priceAmount());
        plan.setCredits(request.credits() == null ? (create ? 0L : plan.getCredits()) : request.credits());
        plan.setBonusCredits(request.bonusCredits() == null ? (create ? 0L : plan.getBonusCredits()) : request.bonusCredits());
        plan.setValidDays(request.validDays() == null ? (create ? 0 : plan.getValidDays()) : request.validDays());
        plan.setDescription(request.description() == null ? (create ? "" : plan.getDescription()) : request.description());
        plan.setSort(request.sort() == null ? (create ? 0 : plan.getSort()) : request.sort());
        plan.setEnabled(request.enabled() == null ? (create ? 1 : plan.getEnabled()) : (request.enabled() ? 1 : 0));
    }
}
