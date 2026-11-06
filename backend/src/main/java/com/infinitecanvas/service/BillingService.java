package com.infinitecanvas.service;

import com.infinitecanvas.common.BizException;
import com.infinitecanvas.common.ErrorCode;
import com.infinitecanvas.entity.CreditAccount;
import com.infinitecanvas.entity.CreditTransaction;
import com.infinitecanvas.mapper.CreditAccountMapper;
import com.infinitecanvas.mapper.CreditTransactionMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
public class BillingService {

    private final CreditAccountMapper accountMapper;
    private final CreditTransactionMapper transactionMapper;
    private final SettingService settingService;

    public BillingService(CreditAccountMapper accountMapper, CreditTransactionMapper transactionMapper,
                          SettingService settingService) {
        this.accountMapper = accountMapper;
        this.transactionMapper = transactionMapper;
        this.settingService = settingService;
    }

    public CreditAccount account(Long userId) {
        CreditAccount account = accountMapper.selectById(userId);
        if (account == null) {
            account = new CreditAccount();
            account.setUserId(userId);
            account.setAvailable(0L);
            account.setFrozen(0L);
            account.setTotalConsumed(0L);
            account.setTotalRecharged(0L);
            account.setUpdatedAt(LocalDateTime.now());
            accountMapper.insert(account);
        }
        return account;
    }

    @Transactional
    public void giftRegister(Long userId) {
        long credits = settingService.getLong("user.register_gift_credits", 100);
        if (credits <= 0) {
            return;
        }
        addCredits(userId, credits, "GIFT", "gift:" + userId, "注册赠送", null);
    }

    /** Must be called inside an outer transaction (task creation). Locks the account row first. */
    public CreditAccount lockAccount(Long userId) {
        CreditAccount account = accountMapper.selectForUpdate(userId);
        if (account == null) {
            account = account(userId);
            account = accountMapper.selectForUpdate(userId);
        }
        return account;
    }

    public long hold(Long userId, Long taskId, String taskNo, long credits, String requestId) {
        CreditAccount account = accountMapper.selectForUpdate(userId);
        long available = account.getAvailable() == null ? 0 : account.getAvailable();
        if (available < credits) {
            throw new BizException(ErrorCode.BILL_40201,
                    "积分不足：本次需要 " + credits + " 积分，当前可用 " + available + " 积分",
                    java.util.Map.of("required", credits, "available", available), 402);
        }
        accountMapper.hold(userId, credits);
        long balanceAfter = available - credits;
        insertTransaction(userId, "HOLD", -credits, credits, balanceAfter, taskId, null, null,
                "hold:" + taskNo, null, "创建视频任务预扣", requestId);
        return balanceAfter;
    }

    public boolean settle(Long userId, Long taskId, String taskNo, long held, long actual) {
        CreditAccount account = accountMapper.selectForUpdate(userId);
        long frozen = account.getFrozen() == null ? 0 : account.getFrozen();
        if (frozen < held) {
            return false;
        }
        long back = held - actual;
        accountMapper.settle(userId, held, actual);
        long balanceAfter = (account.getAvailable() == null ? 0 : account.getAvailable()) + back;
        return insertTransaction(userId, "SETTLE", back, -held, balanceAfter, taskId, null, null,
                "finalize:" + taskNo, null, "任务完成结算", "");
    }

    public boolean refund(Long userId, Long taskId, String taskNo, long held, String reason) {
        CreditAccount account = accountMapper.selectForUpdate(userId);
        long frozen = account.getFrozen() == null ? 0 : account.getFrozen();
        if (frozen < held) {
            return false;
        }
        accountMapper.refund(userId, held);
        long balanceAfter = (account.getAvailable() == null ? 0 : account.getAvailable()) + held;
        return insertTransaction(userId, "REFUND", held, -held, balanceAfter, taskId, null, null,
                "finalize:" + taskNo, null, reason == null ? "任务失败退款" : reason, "");
    }

    @Transactional
    public void addCredits(Long userId, long amount, String bizType, String idempotencyKey,
                           String remark, Long operatorAdminId) {
        account(userId);
        CreditAccount account = accountMapper.selectForUpdate(userId);
        long available = account.getAvailable() == null ? 0 : account.getAvailable();
        long next = available + amount;
        if (next < 0) {
            throw new BizException(ErrorCode.BILL_40201, "积分不足，不能扣减到负数", java.util.Map.of("available", available));
        }
        accountMapper.recharge(userId, amount);
        insertTransaction(userId, bizType, amount, 0L, next, null, null, null, idempotencyKey,
                operatorAdminId, remark, "");
    }

    @Transactional
    public void adjust(Long userId, long amount, String reason, Long adminId, String requestId) {
        account(userId);
        CreditAccount account = accountMapper.selectForUpdate(userId);
        long available = account.getAvailable() == null ? 0 : account.getAvailable();
        long next = available + amount;
        if (next < 0) {
            throw new BizException(ErrorCode.BILL_40201, "调整后余额不能为负", java.util.Map.of("available", available));
        }
        accountMapper.adjustAvailable(userId, amount);
        insertTransaction(userId, "ADJUST", amount, 0L, next, null, null, null,
                "admin-adjust:" + java.util.UUID.randomUUID(), adminId, reason, requestId);
    }

    private boolean insertTransaction(Long userId, String bizType, long availableDelta, long frozenDelta,
                                      long balanceAfter, Long taskId, Long orderId, Long redeemCodeId,
                                      String idempotencyKey, Long operatorAdminId, String remark, String requestId) {
        CreditTransaction tx = new CreditTransaction();
        tx.setUserId(userId);
        tx.setBizType(bizType);
        tx.setAvailableDelta(availableDelta);
        tx.setFrozenDelta(frozenDelta);
        tx.setBalanceAfter(balanceAfter);
        tx.setTaskId(taskId);
        tx.setOrderId(orderId);
        tx.setRedeemCodeId(redeemCodeId);
        tx.setIdempotencyKey(idempotencyKey);
        tx.setOperatorAdminId(operatorAdminId);
        tx.setRemark(remark == null ? "" : remark);
        tx.setRequestId(requestId == null ? "" : requestId);
        tx.setCreatedAt(LocalDateTime.now());
        try {
            transactionMapper.insert(tx);
            return true;
        } catch (DuplicateKeyException ex) {
            return false;
        }
    }

    public java.util.List<CreditTransaction> transactions(Long userId, int page, int pageSize) {
        long offset = (long) (page - 1) * pageSize;
        return transactionMapper.selectByUserPaged(userId, offset, pageSize);
    }

    public long transactionCount(Long userId) {
        return transactionMapper.countByUser(userId);
    }
}
