import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App as AntApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import "antd/dist/reset.css";

import { AppRouter } from "./router";
import "./styles.css";

dayjs.locale("zh-cn");

const container = document.getElementById("root");
if (!container) {
    throw new Error("缺少 #root 挂载节点");
}

createRoot(container).render(
    <StrictMode>
        <ConfigProvider
            locale={zhCN}
            theme={{
                token: {
                    colorPrimary: "#4f46e5",
                    colorInfo: "#4f46e5",
                    borderRadius: 8,
                    fontSize: 14,
                },
            }}
        >
            <AntApp>
                <AppRouter />
            </AntApp>
        </ConfigProvider>
    </StrictMode>,
);
