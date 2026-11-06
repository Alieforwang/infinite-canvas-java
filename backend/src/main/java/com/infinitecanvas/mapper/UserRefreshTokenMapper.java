package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.UserRefreshToken;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

/**
 * 刷新令牌表 Mapper（原生 MyBatis，SQL 见 resources/mapper/UserRefreshTokenMapper.xml）。
 */
public interface UserRefreshTokenMapper {

    UserRefreshToken selectById(Long id);

    UserRefreshToken selectByTokenHash(@Param("tokenHash") String tokenHash);

    int insert(UserRefreshToken token);

    int updateById(UserRefreshToken token);

    /** 撤销某用户所有未撤销的 refresh token（用于改密 / 复用检测）。 */
    int revokeAllByUserId(@Param("userId") Long userId, @Param("revokedAt") LocalDateTime revokedAt);
}