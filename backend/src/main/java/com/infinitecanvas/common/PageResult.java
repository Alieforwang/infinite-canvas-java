package com.infinitecanvas.common;

import java.util.List;

public record PageResult<T>(List<T> items, long page, long pageSize, long total, boolean hasNext) {

    public static <T> PageResult<T> of(List<T> items, long page, long pageSize, long total) {
        return new PageResult<>(items, page, pageSize, total, page * pageSize < total);
    }
}
