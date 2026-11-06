package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.CanvasProject;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 画布项目表 Mapper（原生 MyBatis，SQL 见 resources/mapper/CanvasProjectMapper.xml）。
 */
public interface CanvasProjectMapper {

    CanvasProject selectById(Long id);

    CanvasProject selectByProjectNoAndUserNotDeleted(@Param("projectNo") String projectNo,
                                                     @Param("userId") Long userId);

    List<CanvasProject> selectByUserNotDeleted(@Param("userId") Long userId, @Param("limit") int limit);

    int insert(CanvasProject project);

    int updateById(CanvasProject project);

    /** 乐观锁更新：version = version + 1，条件为 id + version + 未删除。 */
    int updateWithVersion(@Param("id") Long id,
                          @Param("title") String title,
                          @Param("documentJson") String documentJson,
                          @Param("documentBytes") int documentBytes,
                          @Param("nodeCount") int nodeCount,
                          @Param("expectedVersion") int expectedVersion,
                          @Param("updatedAt") LocalDateTime updatedAt);

    int softDelete(@Param("id") Long id, @Param("userId") Long userId, @Param("deletedAt") LocalDateTime deletedAt);
}