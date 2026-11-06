package com.infinitecanvas.job;

import com.infinitecanvas.config.AppProperties;
import com.infinitecanvas.entity.VideoTask;
import com.infinitecanvas.service.VideoTaskService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

@Component
public class TaskPoller {

    private static final Logger log = LoggerFactory.getLogger(TaskPoller.class);
    private final VideoTaskService taskService;
    private final AppProperties props;
    private final AtomicBoolean busy = new AtomicBoolean(false);

    public TaskPoller(VideoTaskService taskService, AppProperties props) {
        this.taskService = taskService;
        this.props = props;
    }

    @Scheduled(fixedDelayString = "${app.poller.interval-ms:1000}")
    public void tick() {
        if (!props.getPoller().isEnabled() || !busy.compareAndSet(false, true)) {
            return;
        }
        try {
            List<VideoTask> tasks = taskService.dueTasks(props.getPoller().getBatchSize());
            for (VideoTask task : tasks) {
                if (!taskService.lease(task, props.getPoller().getLeaseSeconds())) {
                    continue;
                }
                taskService.process(task);
            }
        } catch (Exception ex) {
            log.error("TaskPoller tick failed", ex);
        } finally {
            busy.set(false);
        }
    }
}
