import type { ReactNode } from "react";
import { Tag } from "antd";

import type { StatusMeta } from "../lib/format";

interface StatusTagProps {
    meta: StatusMeta | undefined;
    fallback?: ReactNode;
}

export function StatusTag({ meta, fallback }: StatusTagProps) {
    if (!meta) {
        return <Tag>{fallback ?? "未知"}</Tag>;
    }
    return <Tag color={meta.color}>{meta.text}</Tag>;
}
