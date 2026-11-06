package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.RedeemCode;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 兑换码表 Mapper（原生 MyBatis，SQL 见 resources/mapper/RedeemCodeMapper.xml）。
 */
public interface RedeemCodeMapper {

    RedeemCode selectById(Long id);

    RedeemCode selectByCode(@Param("code") String code);

    int insert(RedeemCode code);

    int updateById(RedeemCode code);

    long countAll();

    long countByBatchAndStatus(@Param("batchNo") String batchNo, @Param("status") String status);

    List<RedeemCode> selectPageByBatchAndStatus(@Param("batchNo") String batchNo,
                                                @Param("status") String status,
                                                @Param("offset") long offset,
                                                @Param("limit") int limit);

    /** 导出用：按批次查全部，按 id 升序。 */
    List<RedeemCode> selectByBatch(@Param("batchNo") String batchNo);

    /** 原子占用：只有 UNUSED 才能改成 USED。 */
    int markUsedIfUnused(@Param("id") Long id, @Param("userId") Long userId, @Param("usedAt") LocalDateTime usedAt);
}