package com.infinitecanvas.service;

import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ImageTaskMapperIsolationTest {
    @Test void imageAndVideoSelectorsHaveSeparateCapabilityBoundaries() throws Exception {
        var configuration = new Configuration();
        String resource = "mapper/VideoTaskMapper.xml";
        try (var input = getClass().getClassLoader().getResourceAsStream(resource)) {
            assertNotNull(input);
            new XMLMapperBuilder(input, configuration, resource, configuration.getSqlFragments()).parse();
        }
        Map<String, Object> parameters = new HashMap<>();
        parameters.put("userId", 7L); parameters.put("statuses", List.of("RUNNING"));
        parameters.put("now", LocalDateTime.now()); parameters.put("limit", 100); parameters.put("offset", 0);
        String prefix = "com.infinitecanvas.mapper.VideoTaskMapper.";
        for (String selector : List.of("selectUserPage", "countUserPage", "selectDue")) {
            String sql = configuration.getMappedStatement(prefix + selector).getBoundSql(parameters).getSql();
            assertTrue(sql.contains("COALESCE(JSON_UNQUOTE(JSON_EXTRACT(params_json, '$.capability')), 'video') = 'video'"), selector);
        }
        String expiry = configuration.getMappedStatement(prefix + "selectExpiredImages").getBoundSql(parameters).getSql();
        assertTrue(expiry.contains("JSON_UNQUOTE(JSON_EXTRACT(params_json, '$.capability')) = 'image'"));
        assertTrue(expiry.contains("deadline_at <="));
        assertTrue(expiry.contains("status = 'RUNNING'"));
    }
}
