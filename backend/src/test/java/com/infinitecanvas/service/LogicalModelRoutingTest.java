package com.infinitecanvas.service;

import com.infinitecanvas.dto.ModelDtos;
import com.infinitecanvas.dto.TaskDtos;
import com.infinitecanvas.entity.VideoModel;
import com.infinitecanvas.mapper.VideoModelMapper;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Proxy;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class LogicalModelRoutingTest {

    @Test
    void legacyHiddenRouteIdResolvesToCanonicalModel() {
        VideoModel hiddenRoute = model(20L, "veo-fast", "低价隐藏线路");
        VideoModel canonical = model(10L, "veo-fast", "Veo Fast");
        VideoModelMapper mapper = mapper(hiddenRoute, canonical);
        VideoTaskService service = new VideoTaskService(null, null, mapper, null, null, null,
                null, null, null, null, null, null);

        VideoModel resolved = service.resolveCanonicalModel(new VideoTaskService.CreateCommand(
                null, hiddenRoute.getId(), "prompt", 8, "720p", null, null,
                false, false, "frames", List.of()));

        assertEquals(canonical.getId(), resolved.getId());
        assertEquals("Veo Fast", resolved.getDisplayName());
    }

    @Test
    void publicContractsUseLogicalIdAndDoNotExposeChannel() {
        assertEquals(String.class, ModelDtos.ModelView.class.getRecordComponents()[0].getType());
        assertFalse(Arrays.stream(TaskDtos.TaskView.class.getRecordComponents())
                .anyMatch(component -> component.getName().equals("channelName")));
    }

    private VideoModelMapper mapper(VideoModel hiddenRoute, VideoModel canonical) {
        return (VideoModelMapper) Proxy.newProxyInstance(
                VideoModelMapper.class.getClassLoader(), new Class<?>[]{VideoModelMapper.class},
                (proxy, method, args) -> switch (method.getName()) {
                    case "selectById" -> hiddenRoute;
                    case "selectCanonicalByModelKey" -> canonical;
                    case "toString" -> "VideoModelMapperTestProxy";
                    default -> throw new UnsupportedOperationException(method.getName());
                });
    }

    private VideoModel model(long id, String modelKey, String displayName) {
        VideoModel model = new VideoModel();
        model.setId(id);
        model.setModelKey(modelKey);
        model.setCapability("video");
        model.setDisplayName(displayName);
        return model;
    }
}
