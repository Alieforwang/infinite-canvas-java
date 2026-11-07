package com.infinitecanvas.service;

import com.infinitecanvas.entity.Channel;

import java.util.Arrays;
import java.util.Objects;

/** Immutable source identity for cached costs; contains encrypted credentials only. */
record ChannelCostSource(String endpoint, String protocol, String authType, String authHeader,
                         String extraHeaders, byte[] credentials) {
    ChannelCostSource {
        credentials = credentials == null ? null : credentials.clone();
    }

    @Override public byte[] credentials() { return credentials == null ? null : credentials.clone(); }

    static ChannelCostSource of(Channel channel) {
        if (channel == null) return null;
        String endpoint = channel.getNormalizedBaseUrl();
        if (endpoint == null || endpoint.isBlank()) endpoint = channel.getBaseUrl();
        return new ChannelCostSource(endpoint, channel.getProtocol(), channel.getAuthType(),
                channel.getAuthHeader(), channel.getExtraHeaders(), channel.getApiKeyCipher());
    }

    @Override public boolean equals(Object other) {
        return other instanceof ChannelCostSource source
                && Objects.equals(endpoint, source.endpoint) && Objects.equals(protocol, source.protocol)
                && Objects.equals(authType, source.authType) && Objects.equals(authHeader, source.authHeader)
                && Objects.equals(extraHeaders, source.extraHeaders) && Arrays.equals(credentials, source.credentials);
    }

    @Override public int hashCode() {
        return Objects.hash(endpoint, protocol, authType, authHeader, extraHeaders, Arrays.hashCode(credentials));
    }
}
