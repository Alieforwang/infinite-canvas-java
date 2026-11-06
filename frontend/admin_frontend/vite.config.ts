import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 管理后台统一部署在 /admin/ 路径下，开发端口固定 3001，
// 通过 Vite 代理把 /api 转发到本地运行的后端（8080）。
export default defineConfig({
    base: "/admin/",
    plugins: [react()],
    server: {
        host: "127.0.0.1",
        port: 3001,
        strictPort: true,
        proxy: {
            "/api": {
                target: "http://localhost:8080",
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: "dist",
        emptyOutDir: true,
    },
});
