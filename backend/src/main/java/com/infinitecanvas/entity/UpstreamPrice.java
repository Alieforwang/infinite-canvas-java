package com.infinitecanvas.entity;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public class UpstreamPrice {
    private Long channelId;
    private String upstreamModel;
    private Integer quotaType;
    private BigDecimal modelPrice;
    private BigDecimal groupRatio;
    private LocalDateTime syncedAt;

    public Long getChannelId() { return channelId; }
    public void setChannelId(Long value) { channelId = value; }
    public String getUpstreamModel() { return upstreamModel; }
    public void setUpstreamModel(String value) { upstreamModel = value; }
    public Integer getQuotaType() { return quotaType; }
    public void setQuotaType(Integer value) { quotaType = value; }
    public BigDecimal getModelPrice() { return modelPrice; }
    public void setModelPrice(BigDecimal value) { modelPrice = value; }
    public BigDecimal getGroupRatio() { return groupRatio; }
    public void setGroupRatio(BigDecimal value) { groupRatio = value; }
    public LocalDateTime getSyncedAt() { return syncedAt; }
    public void setSyncedAt(LocalDateTime value) { syncedAt = value; }
}
