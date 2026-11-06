# 无限画布管理后台（admin_frontend）

React 19 + Vite 7 + TypeScript + Ant Design 6 的管理后台，对接后端 `/api/admin/**`。

## 运行

依赖与用户端共享在 `frontend/node_modules`（工作区已预置，无需 npm install）：

```powershell
cd frontend\admin_frontend
$env:TEMP="D:\software\desk\infinite-canvas-studio\.tmp"; $env:TMP=$env:TEMP
node ..\node_modules\vite\bin\vite.js --port 3001
# 打开 http://localhost:3001/admin/login
# 管理员：admin / Admin@123456（dev 种子）
```

生产构建：

```powershell
node ..\node_modules\typescript\bin\tsc --noEmit
node ..\node_modules\vite\bin\vite.js build
# 产物 dist/，部署在 /admin/ 子路径（base="/admin/"），后端 /api 反代到 8080
```

> 注意：Vite/esbuild 需要子进程与可写临时目录；在 DSH 工作区沙箱下运行需放宽权限并把 `TEMP/TMP` 指向工作区 `.tmp`。

## 页面

| 路由 | 功能 |
|---|---|
| `/admin/login` | 管理员登录（独立 token：`ic_admin_access_token`） |
| `/admin/` | 概览：用户/任务/成功率/积分指标、近 7 日趋势、渠道健康 |
| `/admin/channels` | 渠道 CRUD、API Key 掩码、连通性测试 |
| `/admin/models` | 模型 CRUD（能力位、分辨率系数、定价、上下架） |
| `/admin/users` | 用户搜索/详情、禁用、调账、手工充值、开通套餐、流水 |
| `/admin/plans` | 套餐/积分包 CRUD |
| `/admin/redeem-codes` | 兑换码批次生成（明文仅展示一次）、列表、作废、CSV 导出 |
| `/admin/tasks` | 任务监控、详情（事件/上游调用/流水）、重试/退款/取消 |
| `/admin/settings` | 系统设置（后端白名单键） |

## 验证

- `tsc --noEmit` 0 error；`vite build` 成功。
- 与后端联调通过 `frontend/scripts/admin-ui-smoke.ps1`（Chrome CDP 截图 9 个页面，见 `docs/screenshots/admin-*.png`）。
