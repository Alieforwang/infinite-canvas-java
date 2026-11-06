package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.CreditAccount;
import org.apache.ibatis.annotations.Param;

/**
 * 积分账户表 Mapper（原生 MyBatis，SQL 见 resources/mapper/CreditAccountMapper.xml）。
 * 主键是 user_id（无自增）。
 */
public interface CreditAccountMapper {

    CreditAccount selectById(Long userId);

    /** 行锁：SELECT ... FOR UPDATE，必须在事务中调用。 */
    CreditAccount selectForUpdate(@Param("userId") Long userId);

    int insert(CreditAccount account);

    /** 预扣：available - credits，frozen + credits。 */
    int hold(@Param("userId") Long userId, @Param("credits") long credits);

    /** 结算：frozen - held，available + (held - actual)，total_consumed + actual。 */
    int settle(@Param("userId") Long userId, @Param("held") long held, @Param("actual") long actual);

    /** 退款：frozen - held，available + held。 */
    int refund(@Param("userId") Long userId, @Param("held") long held);

    /** 充值/赠送/套餐：available + amount，total_recharged + GREATEST(amount, 0)。 */
    int recharge(@Param("userId") Long userId, @Param("amount") long amount);

    /** 管理员调账：只加 available（可为负）。 */
    int adjustAvailable(@Param("userId") Long userId, @Param("amount") long amount);
}