# 无限画布 用户端（user_frontend）

React 19 + Vite 7 + TypeScript + Ant Design 6 + Tailwind 4 + Zustand，对接平台后端 `/api/**`。

## 运行

依赖已共享在 `frontend/node_modules`（无需 npm install）。Vite/esbuild 需要子进程与可写临时目录：

```powershell
cd frontend\user_frontend
$env:TEMP="D:\software\desk\infinite-canvas-studio\.tmp"; $env:TMP=$env:TEMP
node ..\node_modules\vite\bin\vite.js --port 3000
# 打开 http://localhost:3000（/api 代理到 8080）
```

构建：

```powershell
node ..\node_modules\vite\bin\vite.js build
# dist/ 为静态产物；SPA 需 history fallback
```

## 页面（已接入平台 API）

| 路由 | 页面 | 说明 |
|---|---|---|
| `/login`、`/register` | 登录/注册 | 邮箱+密码，注册赠送积分 |
| `/video` | 视频创作台 | 服务端模型/参数/计价、参考图上传、异步任务轮询、签名 URL 播放/下载、保存资产、历史记录 |
| `/canvas` | 无限画布列表 | 云端项目列表、创建/重命名/删除、封面 |
| `/canvas/:projectNo` | 画布编辑器 | 平移缩放、文本/图片/视频节点、拖拽、双击编辑文本、选中素材生成视频并自动插入、自动保存（版本乐观锁） |
| `/assets` | 我的资产 | 视频/图片/文本资产上传、搜索筛选、编辑、下载、删除 |
| `/account` | 我的账户 | 积分/冻结/消耗、流水、兑换码、套餐展示、改昵称/密码 |

## 与参考项目的关系

从 `D:\software\desk\infinite-canvas\web` 复制后，重写了路由、布局、登录注册、视频创作台、资产、账户与画布（新的轻量画布编辑器）。
未使用的参考功能（生图工作台、提示词库、画布助手 Agent、插件、音频、WebDAV）代码仍在 `src` 中作为后续清理对象，**未挂载路由、不会打包进产物**。

## 验证

- `vite build` 成功（约 1.6MB gzip 533KB）。
- Chrome CDP 截图与页面渲染校验：`frontend/scripts/pages-smoke.ps1`，截图见 `docs/screenshots/{login,video,canvas-list,canvas-editor,assets,account}.png`。
- 后端 API 联调：注册 → 模型列表 → 创建任务 → 轮询成功 → 签名下载 → 扣费/流水，均通过前端 3000 端口代理验证。
