import type { ReactNode } from "react";
import { Typography } from "antd";

interface PageHeadProps {
    title: string;
    description?: ReactNode;
    extra?: ReactNode;
}

export function PageHead({ title, description, extra }: PageHeadProps) {
    return (
        <div className="page-head">
            <div>
                <Typography.Title level={4} className="page-head__title">
                    {title}
                </Typography.Title>
                {description ? <p className="page-head__desc">{description}</p> : null}
            </div>
            {extra ? <div className="toolbar__actions">{extra}</div> : null}
        </div>
    );
}
