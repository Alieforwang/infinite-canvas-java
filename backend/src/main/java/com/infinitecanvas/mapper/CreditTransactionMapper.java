package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.CreditTransaction;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 积分流水表 Mapper（原生 MyBatis，SQL 见 resources/mapper/CreditTransactionMapper.xml）。
 */
public interface CreditTransactionMapper {

    int insert(CreditTransaction tx);

    long creditsGrantedToday();

    long countFinalize(@Param("taskId") long taskId);

    List<CreditTransaction> selectByTask(@Param("taskId") long taskId);

    List<CreditTransaction> selectByUserPaged(@Param("userId") Long userId,
                                              @Param("offset") long offset,
                                              @Param("limit") int limit);

    long countByUser(@Param("userId") Long userId);
}