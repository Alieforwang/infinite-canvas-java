package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.Asset;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 素材资产表 Mapper（原生 MyBatis，SQL 见 resources/mapper/AssetMapper.xml）。
 */
public interface AssetMapper {

    Asset selectById(Long id);

    Asset selectByAssetNoAndUserNotDeleted(@Param("assetNo") String assetNo, @Param("userId") Long userId);

    int insert(Asset asset);

    int updateById(Asset asset);

    long countPage(@Param("userId") Long userId, @Param("kind") String kind, @Param("keyword") String keyword);

    List<Asset> selectPage(@Param("userId") Long userId,
                           @Param("kind") String kind,
                           @Param("keyword") String keyword,
                           @Param("offset") long offset,
                           @Param("limit") int limit);
}