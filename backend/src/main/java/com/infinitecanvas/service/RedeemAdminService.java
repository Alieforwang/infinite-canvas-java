package com.infinitecanvas.service;

import com.infinitecanvas.common.BizException;
import com.infinitecanvas.common.ErrorCode;
import com.infinitecanvas.common.PageResult;
import com.infinitecanvas.common.Ulid;
import com.infinitecanvas.dto.AdminDtos;
import com.infinitecanvas.entity.RedeemCode;
import com.infinitecanvas.entity.User;
import com.infinitecanvas.mapper.RedeemCodeMapper;
import com.infinitecanvas.mapper.UserMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

@Service
public class RedeemAdminService {

    private static final char[] ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private final RedeemCodeMapper redeemCodeMapper;
    private final UserMapper userMapper;

    public RedeemAdminService(RedeemCodeMapper redeemCodeMapper, UserMapper userMapper) {
        this.redeemCodeMapper = redeemCodeMapper;
        this.userMapper = userMapper;
    }

    @Transactional
    public AdminDtos.RedeemGenerateResult generate(AdminDtos.RedeemGenerateRequest request) {
        int count = request.count() == null ? 1 : request.count();
        if (count < 1 || count > 1000) {
            throw new BizException(ErrorCode.VALID_40001, "生成数量需在 1–1000");
        }
        if ((request.credits() == null || request.credits() <= 0) && request.planId() == null) {
            throw new BizException(ErrorCode.VALID_40001, "积分或套餐至少填写一个");
        }
        String prefix = request.prefix() == null ? "" : request.prefix().trim().toUpperCase();
        String batchNo = "B" + LocalDateTime.now(ZoneOffset.UTC).toString().replaceAll("[^0-9]", "").substring(0, 14);
        List<String> plainCodes = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            String code = (prefix.isEmpty() ? "" : prefix + "-") + randomPart(4) + "-" + randomPart(4);
            RedeemCode entity = new RedeemCode();
            entity.setCode(code);
            entity.setBatchNo(batchNo);
            entity.setPrefix(prefix);
            entity.setCredits(request.credits() == null ? 0 : request.credits());
            entity.setPlanId(request.planId());
            entity.setStatus("UNUSED");
            entity.setCreatedByAdminId(null);
            entity.setCreatedAt(LocalDateTime.now(ZoneOffset.UTC));
            if (request.validDays() != null && request.validDays() > 0) {
                entity.setExpiresAt(LocalDateTime.now(ZoneOffset.UTC).plusDays(request.validDays()));
            }
            redeemCodeMapper.insert(entity);
            plainCodes.add(code);
        }
        return new AdminDtos.RedeemGenerateResult(batchNo, plainCodes);
    }

    public PageResult<AdminDtos.RedeemCodeView> list(String batchNo, String status, int page, int pageSize) {
        String batch = batchNo == null || batchNo.isBlank() ? null : batchNo.trim();
        String statusFilter = status == null || status.isBlank() ? null : status.trim();
        long total = redeemCodeMapper.countByBatchAndStatus(batch, statusFilter);
        List<AdminDtos.RedeemCodeView> views = new ArrayList<>();
        for (RedeemCode code : redeemCodeMapper.selectPageByBatchAndStatus(batch, statusFilter,
                (long) (page - 1) * pageSize, pageSize)) {
            String email = null;
            if (code.getUsedByUserId() != null) {
                User user = userMapper.selectById(code.getUsedByUserId());
                email = user == null ? null : user.getEmail();
            }
            views.add(new AdminDtos.RedeemCodeView(code.getId(), mask(code.getCode()), code.getBatchNo(),
                    code.getPrefix(), code.getCredits(), code.getPlanId(), code.getStatus(), email,
                    code.getUsedAt(), code.getExpiresAt(), code.getCreatedAt()));
        }
        return PageResult.of(views, page, pageSize, total);
    }

    @Transactional
    public void disable(Long id) {
        RedeemCode code = redeemCodeMapper.selectById(id);
        if (code == null) {
            throw new BizException("REDEEM_40401", "兑换码不存在", null, 404);
        }
        if ("UNUSED".equals(code.getStatus())) {
            code.setStatus("DISABLED");
            redeemCodeMapper.updateById(code);
        }
    }

    public String exportCsv(String batchNo) {
        String batch = batchNo == null || batchNo.isBlank() ? null : batchNo.trim();
        StringBuilder csv = new StringBuilder("code,batch,prefix,credits,planId,status,expiresAt,createdAt\n");
        for (RedeemCode code : redeemCodeMapper.selectByBatch(batch)) {
            csv.append(mask(code.getCode())).append(',')
                    .append(code.getBatchNo()).append(',')
                    .append(code.getPrefix()).append(',')
                    .append(code.getCredits()).append(',')
                    .append(code.getPlanId() == null ? "" : code.getPlanId()).append(',')
                    .append(code.getStatus()).append(',')
                    .append(code.getExpiresAt() == null ? "" : code.getExpiresAt()).append(',')
                    .append(code.getCreatedAt() == null ? "" : code.getCreatedAt()).append('\n');
        }
        return csv.toString();
    }

    private static String randomPart(int length) {
        StringBuilder builder = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            builder.append(ALPHABET[RANDOM.nextInt(ALPHABET.length)]);
        }
        return builder.toString();
    }

    private static String mask(String code) {
        if (code == null || code.length() <= 8) {
            return "****";
        }
        return code.substring(0, 4) + "****" + code.substring(code.length() - 4);
    }
}
