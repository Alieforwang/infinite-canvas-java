package com.infinitecanvas.service;

import com.infinitecanvas.common.BizException;
import com.infinitecanvas.common.ErrorCode;
import com.infinitecanvas.config.AppProperties;
import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Set;

/** Basic SSRF guard dedicated to upstream base URLs and result URLs. */
@Component
public class SsrfGuard {

    private static final Set<String> BLOCKED_HOSTS = Set.of(
            "localhost", "metadata.google.internal", "metadata", "instance-data");

    private final AppProperties props;

    public SsrfGuard(AppProperties props) {
        this.props = props;
    }

    public void assertBaseUrl(String normalizedBaseUrl) {
        URI uri = parse(normalizedBaseUrl);
        if (!"https".equalsIgnoreCase(uri.getScheme()) && !props.getSecurity().isAllowHttpUpstream()) {
            throw new BizException(ErrorCode.CHANNEL_42201, "上游地址必须使用 https");
        }
        if (!props.getSecurity().isAllowPrivateUpstream()) {
            requirePublicHost(uri.getHost());
        }
    }

    public void assertResultUrl(String url) {
        URI uri = parse(url);
        if (!"https".equalsIgnoreCase(uri.getScheme()) && !props.getSecurity().isAllowHttpUpstream()) {
            throw new BizException(ErrorCode.UPSTREAM_50205, "上游结果地址不是 https");
        }
        if (!props.getSecurity().isAllowPrivateUpstream()) {
            requirePublicHost(uri.getHost());
        }
    }

    private URI parse(String url) {
        try {
            URI uri = URI.create(url);
            if (uri.getHost() == null) {
                throw new IllegalArgumentException("缺少 host");
            }
            return uri;
        } catch (Exception ex) {
            throw new BizException(ErrorCode.UPSTREAM_50205, "上游地址非法");
        }
    }

    private void requirePublicHost(String host) {
        if (host == null || BLOCKED_HOSTS.contains(host.toLowerCase())) {
            throw new BizException(ErrorCode.UPSTREAM_50205, "上游地址不允许访问内网");
        }
        try {
            for (InetAddress address : InetAddress.getAllByName(host)) {
                if (address.isLoopbackAddress() || address.isSiteLocalAddress() || address.isLinkLocalAddress()
                        || address.isAnyLocalAddress() || address.isMulticastAddress()) {
                    throw new BizException(ErrorCode.UPSTREAM_50205, "上游地址不允许访问内网");
                }
            }
        } catch (UnknownHostException ex) {
            throw new BizException(ErrorCode.UPSTREAM_50205, "上游域名无法解析");
        }
    }
}
