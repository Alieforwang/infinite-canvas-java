package com.infinitecanvas.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.common.BizException;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.entity.VideoModel;
import com.infinitecanvas.mapper.ChannelMapper;
import com.infinitecanvas.mapper.VideoModelMapper;
import com.infinitecanvas.mapper.VideoTaskMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminDeletionTest {
    private final ChannelMapper channels = mock(ChannelMapper.class);
    private final VideoModelMapper models = mock(VideoModelMapper.class);
    private final VideoTaskMapper tasks = mock(VideoTaskMapper.class);

    @Test
    void referencedModelIsNotDeletedOrDisabled() {
        VideoModel model = new VideoModel();
        model.setId(2L);
        model.setEnabled(1);
        when(models.selectById(2L)).thenReturn(model);
        when(tasks.countByModelId(2L)).thenReturn(3L);

        BizException error = assertThrows(BizException.class,
                () -> new ModelService(models, channels, tasks, new ObjectMapper()).delete(2L));

        assertEquals(409, error.getHttpStatus());
        assertEquals("模型已有历史任务，无法删除；请在编辑中停用该模型", error.getMessage());
        assertEquals(1, model.getEnabled());
        verify(models, never()).deleteById(2L);
        verify(models, never()).updateById(model);
    }

    @Test
    void unreferencedModelIsPhysicallyDeleted() {
        VideoModel model = new VideoModel();
        model.setId(5L);
        when(models.selectById(5L)).thenReturn(model);

        new ModelService(models, channels, tasks, new ObjectMapper()).delete(5L);

        verify(models).deleteById(5L);
        verify(models, never()).updateById(model);
    }

    @Test
    void channelWithModelsIsNotDeletedOrDisabled() {
        Channel channel = channel(3L);
        when(channels.selectById(3L)).thenReturn(channel);
        when(models.countByChannelId(3L)).thenReturn(1L);

        BizException error = assertThrows(BizException.class,
                () -> channelService().delete(3L));

        assertEquals(409, error.getHttpStatus());
        assertEquals("渠道下仍有模型，无法删除；请先删除模型或在编辑中停用该渠道", error.getMessage());
        assertEquals(1, channel.getEnabled());
        verify(channels, never()).deleteById(3L);
        verify(channels, never()).updateById(channel);
    }

    @Test
    void channelWithHistoricalTasksButNoModelsIsNotDeleted() {
        Channel channel = channel(4L);
        when(channels.selectById(4L)).thenReturn(channel);
        when(tasks.countByChannelId(4L)).thenReturn(2L);

        BizException error = assertThrows(BizException.class,
                () -> channelService().delete(4L));

        assertEquals(409, error.getHttpStatus());
        assertEquals("渠道已有历史任务，无法删除；请在编辑中停用该渠道", error.getMessage());
        verify(channels, never()).deleteById(4L);
    }

    @Test
    void emptyUnreferencedChannelIsPhysicallyDeleted() {
        when(channels.selectById(6L)).thenReturn(channel(6L));

        channelService().delete(6L);

        verify(channels).deleteById(6L);
    }

    private ChannelService channelService() {
        return new ChannelService(channels, models, tasks, null, null, null, null, new ObjectMapper());
    }

    private Channel channel(long id) {
        Channel channel = new Channel();
        channel.setId(id);
        channel.setEnabled(1);
        return channel;
    }
}
