package com.infinitecanvas.mapper;

import com.infinitecanvas.entity.VideoTask;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 视频任务表 Mapper（原生 MyBatis，SQL 见 resources/mapper/VideoTaskMapper.xml）。
 * 分页统一用 LIMIT #{offset}, #{limit}。
 */
public interface VideoTaskMapper {

    VideoTask selectById(Long id);

    VideoTask selectByTaskNo(@Param("taskNo") String taskNo);

    VideoTask selectByTaskNoAndUser(@Param("taskNo") String taskNo, @Param("userId") Long userId);

    VideoTask selectByUserAndIdempotencyKey(@Param("userId") Long userId,
                                            @Param("idempotencyKey") String idempotencyKey);

    List<VideoTask> selectExpiredImages(@Param("now") LocalDateTime now, @Param("limit") int limit);

    int insert(VideoTask task);

    /** 只更新非 null 字段（与 MyBatis-Plus updateById 行为一致）。 */
    int updateById(VideoTask task);

    int deleteById(Long id);

    long countAll();

    long countRunning();

    long countCreatedToday();

    long countFinishedToday();

    long countSucceededToday();

    long countFailedToday(@Param("since") LocalDateTime since);

    long creditsConsumedToday();

    long countActiveByUser(@Param("userId") Long userId);

    long countByUser(@Param("userId") Long userId);

    List<Map<String, Object>> trend7d();

    long countUserPage(@Param("userId") Long userId, @Param("statuses") List<String> statuses);

    List<VideoTask> selectUserPage(@Param("userId") Long userId,
                                   @Param("statuses") List<String> statuses,
                                   @Param("offset") long offset,
                                   @Param("limit") int limit);

    long countAdminPage(@Param("statuses") List<String> statuses,
                        @Param("userId") Long userId,
                        @Param("taskNo") String taskNo);

    List<VideoTask> selectAdminPage(@Param("statuses") List<String> statuses,
                                    @Param("userId") Long userId,
                                    @Param("taskNo") String taskNo,
                                    @Param("offset") long offset,
                                    @Param("limit") int limit);

    /** 轮询器取到期任务：状态在 statuses 中、next_poll_at <= now，按 next_poll_at 升序。 */
    List<VideoTask> selectDue(@Param("statuses") List<String> statuses,
                              @Param("now") LocalDateTime now,
                              @Param("limit") int limit);

    /** 抢占租约：更新 next_poll_at、poll_count + 1（乐观条件）。 */
    int lease(@Param("id") Long id,
              @Param("nextPollAt") LocalDateTime nextPollAt,
              @Param("now") LocalDateTime now,
              @Param("statuses") List<String> statuses);

    int markQueued(@Param("id") Long id,
                   @Param("upstreamTaskId") String upstreamTaskId,
                   @Param("upstreamStatus") String upstreamStatus,
                   @Param("submittedAt") LocalDateTime submittedAt,
                   @Param("nextPollAt") LocalDateTime nextPollAt);

    int markRunning(@Param("id") Long id,
                    @Param("upstreamStatus") String upstreamStatus,
                    @Param("progress") int progress,
                    @Param("nextPollAt") LocalDateTime nextPollAt,
                    @Param("statuses") List<String> statuses);

    int markDownloading(@Param("id") Long id,
                        @Param("upstreamStatus") String upstreamStatus,
                        @Param("progress") int progress,
                        @Param("nextPollAt") LocalDateTime nextPollAt,
                        @Param("statuses") List<String> statuses);

    /** 用户/管理员取消：仅活动状态可改。clearNextPoll=true 时同时把 next_poll_at 置空。 */
    int cancelActive(@Param("id") Long id,
                     @Param("finishedAt") LocalDateTime finishedAt,
                     @Param("clearNextPoll") boolean clearNextPoll,
                     @Param("statuses") List<String> statuses);

    /** 成功结算：settled_credits = held_credits，next_poll_at 置空。 */
    int finalizeSuccess(@Param("id") Long id,
                        @Param("fileId") Long fileId,
                        @Param("finishedAt") LocalDateTime finishedAt);

    /** 失败/过期：写入错误信息，next_poll_at 置空。 */
    int failActive(@Param("id") Long id,
                   @Param("status") String status,
                   @Param("errorCode") String errorCode,
                   @Param("errorMessage") String errorMessage,
                   @Param("finishedAt") LocalDateTime finishedAt,
                   @Param("statuses") List<String> statuses);

    /** 重新排队：只改状态和下次轮询时间。 */
    int schedule(@Param("id") Long id,
                 @Param("status") String status,
                 @Param("nextPollAt") LocalDateTime nextPollAt,
                 @Param("statuses") List<String> statuses);
}