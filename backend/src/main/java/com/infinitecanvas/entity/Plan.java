package com.infinitecanvas.entity;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class Plan {
    private Long id;
    private String code;
    private String name;
    private String type;
    private BigDecimal priceAmount;
    private Long credits;
    private Long bonusCredits;
    private Integer validDays;
    private String description;
    private Integer sort;
    private Integer enabled;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
