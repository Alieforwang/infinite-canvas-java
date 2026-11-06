package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.FileObject;
import org.apache.ibatis.annotations.Param;

/**
 * 文件对象表 Mapper（原生 MyBatis，SQL 见 resources/mapper/FileObjectMapper.xml）。
 */
public interface FileObjectMapper {

    FileObject selectById(Long id);

    FileObject selectByFileNo(@Param("fileNo") String fileNo);

    FileObject selectByFileNoNotDeleted(@Param("fileNo") String fileNo);

    FileObject selectByFileNoAndUser(@Param("fileNo") String fileNo, @Param("userId") Long userId);

    FileObject selectByFileNoAndUserNotDeleted(@Param("fileNo") String fileNo, @Param("userId") Long userId);

    int insert(FileObject file);

    int updateById(FileObject file);
}