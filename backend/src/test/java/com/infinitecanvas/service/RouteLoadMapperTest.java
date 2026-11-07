package com.infinitecanvas.service;

import com.infinitecanvas.mapper.VideoTaskMapper;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RouteLoadMapperTest {
    @Test
    void channelLoadIncludesEveryActiveStatusAcrossModelsAndMedia() throws Exception {
        var dataSource = new DriverManagerDataSource("jdbc:h2:mem:load_" + UUID.randomUUID()
                + ";MODE=MySQL", "sa", "");
        try (var connection = dataSource.getConnection()) {
            var jdbc = new JdbcTemplate(dataSource);
            jdbc.execute("CREATE TABLE video_task (channel_id BIGINT, model_id BIGINT, status VARCHAR(32), media_type VARCHAR(16))");
            String[] active = { "CREATED", "SUBMITTING", "SUBMIT_UNKNOWN", "QUEUED", "RUNNING", "DOWNLOADING" };
            for (int i = 0; i < active.length; i++) {
                jdbc.update("INSERT INTO video_task VALUES (7, ?, ?, ?)", i % 2 + 1, active[i], i % 2 == 0 ? "video" : "image");
            }
            for (String status : new String[] { "SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED" }) {
                jdbc.update("INSERT INTO video_task VALUES (7, 1, ?, 'video')", status);
            }
            jdbc.update("INSERT INTO video_task VALUES (8, 3, 'RUNNING', 'image')");
            var factory = new SqlSessionFactoryBean();
            factory.setDataSource(dataSource);
            factory.setMapperLocations(new ClassPathResource("mapper/VideoTaskMapper.xml"));
            var mapper = new SqlSessionTemplate(factory.getObject()).getMapper(VideoTaskMapper.class);
            assertEquals(6, mapper.countActiveByChannel(7L));
            assertEquals(1, mapper.countActiveByChannel(8L));
            assertEquals(0, mapper.countActiveByChannel(999L));
            assertEquals(3, mapper.countActiveByModel(1L));
            assertEquals(3, mapper.countActiveByModel(2L));
            assertEquals(1, mapper.countActiveByModel(3L));
            assertEquals(0, mapper.countActiveByModel(999L));
        }
    }
}
