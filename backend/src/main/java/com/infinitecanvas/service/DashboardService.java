package com.infinitecanvas.service;

import com.infinitecanvas.dto.AdminDtos;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.entity.VideoTask;
import com.infinitecanvas.mapper.ChannelMapper;
import com.infinitecanvas.mapper.CreditTransactionMapper;
import com.infinitecanvas.mapper.UserMapper;
import com.infinitecanvas.mapper.VideoTaskMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class DashboardService {

    private final UserMapper userMapper;
    private final VideoTaskMapper taskMapper;
    private final CreditTransactionMapper transactionMapper;
    private final ChannelMapper channelMapper;

    public DashboardService(UserMapper userMapper, VideoTaskMapper taskMapper,
                            CreditTransactionMapper transactionMapper, ChannelMapper channelMapper) {
        this.userMapper = userMapper;
        this.taskMapper = taskMapper;
        this.transactionMapper = transactionMapper;
        this.channelMapper = channelMapper;
    }

    public AdminDtos.DashboardView overview() {
        long users = userMapper.countAll();
        long todayNewUsers = userMapper.countCreatedToday();
        long tasksToday = taskMapper.countCreatedToday();
        long tasksTotal = taskMapper.countAll();
        long running = taskMapper.countRunning();
        long failedToday = taskMapper.countFailedToday(
                java.time.LocalDateTime.now(java.time.ZoneOffset.UTC).toLocalDate().atStartOfDay());
        long finishedToday = taskMapper.countFinishedToday();
        long succeededToday = taskMapper.countSucceededToday();
        double successRate = finishedToday == 0 ? 0 : Math.round(succeededToday * 10000.0 / finishedToday) / 100.0;
        long creditsConsumedToday = taskMapper.creditsConsumedToday();
        long creditsGrantedToday = transactionMapper.creditsGrantedToday();
        List<Map<String, Object>> trend = new ArrayList<>();
        for (Map<String, Object> row : taskMapper.trend7d()) {
            trend.add(new LinkedHashMap<>(row));
        }
        List<Map<String, Object>> channels = new ArrayList<>();
        for (Channel channel : channelMapper.selectAllSorted()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", channel.getId());
            item.put("name", channel.getName());
            item.put("enabled", channel.getEnabled());
            item.put("lastTestOk", channel.getLastTestOk());
            item.put("lastTestMessage", channel.getLastTestMessage());
            item.put("lastTestAt", channel.getLastTestAt());
            channels.add(item);
        }
        return new AdminDtos.DashboardView(users, todayNewUsers, tasksToday, tasksTotal, running, failedToday,
                successRate, creditsConsumedToday, creditsGrantedToday, trend, channels);
    }
}
