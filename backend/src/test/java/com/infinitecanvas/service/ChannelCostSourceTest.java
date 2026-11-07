package com.infinitecanvas.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.infinitecanvas.dto.AdminDtos;
import com.infinitecanvas.entity.Channel;
import com.infinitecanvas.gateway.UpstreamClient;
import com.infinitecanvas.mapper.ChannelMapper;
import com.infinitecanvas.mapper.VideoModelMapper;
import com.infinitecanvas.mapper.VideoTaskMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChannelCostSourceTest {
    @ParameterizedTest
    @ValueSource(strings = {"baseUrl", "protocol", "apiKey", "authType", "authHeader"})
    void sourceChangeClearsChannelCost(String field) {
        var channels = mock(ChannelMapper.class);
        var models = mock(VideoModelMapper.class);
        var crypto = mock(CryptoService.class);
        var channel = source();
        when(channels.selectByIdForUpdate(7L)).thenReturn(channel);
        when(crypto.encrypt("new-key")).thenReturn("new-cipher");
        String value = switch (field) {
            case "baseUrl" -> "https://other.example/v1";
            case "protocol" -> "newapi";
            case "apiKey" -> "new-key";
            case "authType" -> "none";
            default -> "X-New-Auth";
        };
        new ChannelService(channels, models, mock(VideoTaskMapper.class), crypto,
                new BaseUrlNormalizer(), mock(SsrfGuard.class), mock(UpstreamClient.class), new ObjectMapper())
                .update(7L, request(Map.of(field, value)), 1L);
        verify(channels).selectByIdForUpdate(7L);
        verify(models).clearCostsByChannel(7L);
    }

    @Test
    void nameCapacityAndEquivalentNormalizedUrlKeepExistingCost() {
        var channels = mock(ChannelMapper.class);
        var models = mock(VideoModelMapper.class);
        when(channels.selectByIdForUpdate(7L)).thenReturn(source());
        new ChannelService(channels, models, mock(VideoTaskMapper.class), mock(CryptoService.class),
                new BaseUrlNormalizer(), mock(SsrfGuard.class), mock(UpstreamClient.class), new ObjectMapper())
                .update(7L, request(Map.of("name", "renamed", "maxConcurrency", 8,
                        "baseUrl", "https://DUOYUANX.com/v1/")), 1L);
        verify(models, never()).clearCostsByChannel(anyLong());
    }

    @Test
    void identityCapturesCredentialsInsteadOfRetainingMutableArray() {
        Channel channel = source();
        byte[] credentials = channel.getApiKeyCipher();
        ChannelCostSource captured = ChannelCostSource.of(channel);
        credentials[0] = 9;
        assertNotEquals(captured, ChannelCostSource.of(channel));
        channel.setApiKeyCipher(new byte[]{1, 2});
        assertEquals(captured, ChannelCostSource.of(channel));
        assertEquals(captured.hashCode(), ChannelCostSource.of(channel).hashCode());
    }

    private AdminDtos.ChannelRequest request(Map<String, Object> values) {
        return new ObjectMapper().convertValue(values, AdminDtos.ChannelRequest.class);
    }

    private Channel source() {
        var channel = new Channel();
        channel.setId(7L);
        channel.setName("source");
        channel.setNormalizedBaseUrl("https://duoyuanx.com");
        channel.setBaseUrl("https://duoyuanx.com/v1");
        channel.setProtocol("openai-official");
        channel.setCapabilities("[\"video\"]");
        channel.setEnabled(1);
        channel.setAuthType("bearer");
        channel.setAuthHeader("");
        channel.setApiKeyCipher(new byte[]{1, 2});
        return channel;
    }
}
