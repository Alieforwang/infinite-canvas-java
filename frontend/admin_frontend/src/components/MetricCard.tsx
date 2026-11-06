import type { ReactNode } from "react";
import { Card } from "antd";

interface MetricCardProps {
    label: string;
    value: ReactNode;
    suffix?: ReactNode;
    icon?: ReactNode;
}

export function MetricCard({ label, value, suffix, icon }: MetricCardProps) {
    return (
        <Card className="metric-card" variant="outlined">
            <div className="metric-card__label">
                {icon ? <span className="metric-card__icon">{icon}</span> : null}
                <span>{label}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>
                    {value}
                </span>
                {suffix ? <span className="muted" style={{ fontSize: 13 }}>{suffix}</span> : null}
            </div>
        </Card>
    );
}
