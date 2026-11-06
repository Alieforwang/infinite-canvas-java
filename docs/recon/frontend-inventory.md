# 前端盘点与裁剪方案（参考项目 infinite-canvas → 视频生成平台）

- 侦察对象（只读）：`D:\software\desk\infinite-canvas\web`（React 19.2.5 + Vite 7 + React Router 7.12 + TS 5 + antd 6.4 + Tailwind 4 + Zustand 5 + localforage）
- 目标工作区：`D:\software\desk\infinite-canvas-studio`（`backend/` 为 Spring Boot 骨架 `com.companyname.bank.App`，`frontend/admin_frontend`、`frontend/user_frontend` 为空目录，`docs/recon/` 为空）
- 结论全部来自实读源码（路径 + 行号），未做推测；文档与代码不一致处以代码为准并在文中标注。

---

## 0. 结论先行

1. **参考前端总量：174 个文件 / 33,854 行**（`web/src`，不含 `web/tests` 3 个测试文件 184 行）。单个最大文件 `pages/canvas/project.tsx` = **3,476 行 / 194KB**，占全部源码 10%，是裁剪的第一风险点。
2. **可直接物理删除 = 66 个文件 / 10,759 行（31.8%）**：画布助手 Agent（23 文件 6,084 行）、提示词库全栈（14 文件 1,196 行）、画布节点插件系统（8 文件 766 行）、WebDAV/同步（2 文件 550 行）、统计/版本/GitHub（7 文件 363 行）、音频生成（4 文件 434 行）、本地代理（2 文件 92 行）、生图工作台页面（2 文件 948 行）、死代码（4 文件 326 行）。
3. **任务书里"删 `services/api/model-plugin.ts`"会直接打断视频生成**：`services/api/video.ts` 的视频创建在 `L75-76` 一旦发现模型配置了"调用脚本"就走 `runModelPlugin` 分支；`services/api/audio.ts:L7,33` 同样依赖。且视频页/画布视频全部经过 `video.ts`。该方法只能在"后端接管视频任务 API"的同一改动里删，不能先删。
4. **任务书里"删 `services/api/image.ts`"同样不可行**：`pages/canvas/project.tsx:L8` 直接 import `requestEdit / requestGeneration / requestImageQuestion`，画布文本/图片/配置节点的生成全靠它，`components/canvas/canvas-node-generation.ts:L1` 还依赖其 `AiTextMessage` 类型。**生图工作台（页面）可删，生图服务不可删**，只能改写为调后端。
5. **"插件系统"其实是两套东西**：①画布节点插件（`lib/canvas/plugin-*.ts`、`use-plugin-store`、`canvas-plugin-manager-modal`）可整删；②"模型调用脚本"（`services/api/model-plugin.ts`、`model-script-editor.tsx`）是**视频渠道适配能力**，属于视频链路。
6. **视频链路是"前端直连 + 浏览器本地存储"模型**：`POST {baseUrl}/v1/videos`（multipart，字段见 §2.3）→ `GET /v1/videos/{id}` 轮询 120 次 × 2.5s → `GET /v1/videos/{id}/content` 或远端 URL 下载 → Blob 写入 localforage `infinite-canvas/media_files`，key `video:<nanoid>`。后端化需要替换的正是这 3 个端点 + 2 个 localforage store（`media_files`、`video_generation_logs`）。
7. **`pages/admin`、`pages/auth`、`pages/projects` 确认为空目录**（`web/src` 下空目录清单实测），参考项目**没有任何管理后台/登录/项目云端页面**可复用 → 管理后台必须新建；`docs/content/docs/business` 仅有商业授权说明，`docs/product/` 只有一个空目录 `evidence/`（0 文件），**没有 PRD 可提炼**。
8. **裁剪后规模估算：≈104 个文件 / ≈20,400 行**（约参考前端的 60%），其中 `project.tsx` 仍需从 3,476 行降到 ≈3,000 行左右（图片编辑工具 ≈2,100 行留待二期）。

---

## 1. 路由 / 导航 / 页面地图

### 1.1 路由表（`web/src/router.tsx`，35 行）

| 路径 | 组件 | 文件 | 行数 | 实际职责 | 处置 |
|---|---|---|---|---|---|
| `/` | `HomePage` | `pages/home/index.tsx` | 120 | 营销首页 + **提示词作品墙**（`L7,35` 调 `fetchPrompts`，`L68` 跳 `/prompts`） | 改造/重写为视频平台首页 |
| `/image` | `ImagePage` | `pages/image/index.tsx` | 902 | 生图工作台：提示词 → 生成 → 结果卡 → 本地生成日志 | **删除** |
| `/video` | `VideoPage` | `pages/video/index.tsx` | 802 | 视频创作台：提示词 + 最多 7 张参考图 → 异步任务 → 轮询 → 结果入库 | 保留改造 |
| `/assets` | `AssetsPage` | `pages/assets/index.tsx` | 565 | 我的资产（文本/图片/视频，localforage + 搜索/筛选/分页/导入导出） | 保留改造（改为调后端） |
| `/prompts` | `PromptsPage` | `pages/prompts/index.tsx` | 87 | 提示词库（多来源聚合、标签筛选、无限滚动） | **删除** |
| `/canvas` | `CanvasPage` | `pages/canvas/index.tsx` | 130 | 画布项目列表：新建/导入 zip/导出/批量删除；`L32-37,66-72` 支持 `?mode=new/recent` 供 Agent 直达 | 保留改造（去 agent 参数） |
| `/canvas/:id` | `CanvasProjectPage` | `pages/canvas/project.tsx` | **3,476** | 无限画布编辑器（节点/连线/生成/撤销/导入导出/插件/Agent/图片编辑） | 保留改造（重头） |
| `/config` | `ConfigPage` | `pages/config/index.tsx` | 19 | 仅包一层 `<AppConfigPanel/>`（`L3,15`） | 保留改造（配置改由后端） |
| `*` | `NotFound` | `pages/not-found/index.tsx` | 24 | 404 | 保留 |

`router.tsx:L3,19` 挂 `AnalyticsTracker`，`L17-22` 统一套 `UserLayout`。

### 1.2 布局与导航

| 文件 | 行数 | 关键行 | 作用 | 处置 |
|---|---|---|---|---|
| `layouts/user-layout.tsx` | 16 | `L3` import AgentPanel、`L13` `<AgentPanel/>` | 顶部导航 + 内容区 + 右侧 Agent 面板 | 改造（删 AgentPanel） |
| `components/layout/app-top-nav.tsx` | 99 | `L12,18-33` agent store 自动连接；`L25` `hideHeader` 正则 `/^\/canvas\/[^/]+/`（画布详情隐藏全站头，改用画布内 `canvas-top-bar`）；`L63-81` 按 `navigationTools` 渲染；`L86-88` Agent 按钮；`L96` `<AppConfigModal/>` | 全站顶栏 | 改造（去 agent / 配置弹窗改后端配置抽屉） |
| `components/layout/mobile-nav-drawer.tsx` | 41 | `L20-37` 遍历 `navigationTools` | 移动端抽屉导航 | 保留（随导航表自动收敛） |
| `constant/navigation-tools.ts` | 30 | `L3-28` 6 项：canvas / image / video / prompts / assets / config；`L30` 导出 slug 联合类型 | 导航单一数据源 | 改造（删 image、prompts → 4 项） |
| `pages/admin`、`pages/auth`、`pages/projects` | — | 空目录（实测无文件） | 无实现 | 删除或作为新后台挂载点 |
| `components/canvas/canvas-top-bar.tsx` | 220 | `L28,50,3160` 附近传入 `onOpenPlugins`、`agentOpen/compactAgentStatus/onToggleAgent` | 画布内顶栏（首页/项目/新建/删除/导出/导入图片/撤销重做/插件/Agent） | 改造（删插件与 Agent 入口） |

**导航裁剪结果**：`canvas`、`video`、`assets`、`config` 四项；`image`、`prompts` 从 `navigation-tools.ts` 删除后，顶栏/抽屉自动收敛，无需改两个导航组件内部逻辑。

---

## 2. 视频生成调用链（最重要）

### 2.1 调用链总览

```
pages/video/index.tsx
  generate()                                   L171-199
   ├─ buildRequestSnapshot()                    L223-235   （校验 prompt / isAiConfigReady）
   ├─ buildVideoConfig(effectiveConfig, model)  L773-785   （归一化 seconds/size/vquality/audio/watermark/mode）
   └─ createVideoGenerationTask(config, text, refs)   services/api/video.ts:L72-80
        ├─ resolveModelRequestConfig(config, model)    use-config-store.ts:L438-447（渠道 baseUrl/apiKey/apiFormat 覆盖）
        ├─ resolveModelScript(config, model)           use-config-store.ts:L206-208
        │    ├─ 有脚本  → createPluginVideoTask → runModelPlugin(new Function 沙箱)   video.ts:L93-123 / model-plugin.ts:L113-164
        │    ├─ apiFormat==="gemini" → createGeminiVideoTask                        video.ts:L221-251
        │    └─ 否则    → createOpenAIVideoTask（默认，OpenAI 兼容）                  video.ts:L149-191
        └─ 返回 VideoGenerationTask { id, provider: "openai"|"gemini"|"plugin", model }
   ├─ buildLog(...) + logStore.setItem(id, serializeLog(log))                   video/index.tsx:L188,292-295
   └─ pollGenerationLog(log, config, agentTaskId)                                L310-355
        └─ for attempt 0..119: pollVideoGenerationTask → delay(2500)             L318-341
             ├─ pollOpenAIVideoTask                                              video.ts:L193-208
             │    ├─ GET /videos/{id} → videoResultUrl 命中 → videoResultFromUrl
             │    ├─ status==="completed" → GET /videos/{id}/content (blob)
             │    ├─ status==="failed"|"cancelled" → { status:"failed", error }
             │    └─ 其他 → pending
             └─ storeGeneratedVideo(result)                                      video.ts:L137-147
                  └─ uploadMediaFile(blob,"video") → localforage media_files, key "video:<nanoid>"
```

### 2.2 请求字段（multipart，`services/api/video.ts:L149-191`）

`POST {baseUrl}/v1/videos`（`buildApiUrl` 自动补 `/v1`，已以 `/v1` 结尾则不重复；`use-config-store.ts:L487-492`，并套 `withLocalProxy`）

| 字段（FormData 名） | 值来源 | 代码位置 |
|---|---|---|
| `model` | `modelOptionName(model)`，去掉 `channelId::` 前缀（`use-config-store.ts:L404-406`） | `video.ts:L156` |
| `prompt` | 文本提示词（画布场景 = 上游文本节点 + `@` 引用展开后的文本） | `L157` |
| `seconds` | `clampVideoSeconds`，**4–30** 整数（`media-size.ts:L46-47,102-105`） | `L158` |
| `size` | `normalizeVideoSize(size, vquality)`：`auto`→null；`\d+x\d+` 直传；比例→`computeVideoSize` 偶数列宽高（`media-size.ts:L131-140`）；空则 `"1280x720"` | `L159`、`L330-336` |
| `ratio` | `inferVideoRatio(size)`，`auto` 时按 `16:9`（`L291-294`） | `L160-162` |
| `resolution_name` | `"480p" / "720p" / "1080p"`（`low`→480p；`auto/high/medium`→720p）`L338-343` | `L163` |
| `generate_audio` | `"true"/"false"`（`boolConfig`，默认 true） | `L164` |
| `watermark` | `"true"/"false"`（默认 false） | `L165` |
| `mode` | `"frames"` / `"reference"`；`reference` 条件：显式选 reference **或参考图 > 2 张**（`L325-328`） | `L166` |
| `first_frame` + `images` | frames 模式第 1 张图，文件名 `first.png` | `L167-171` |
| `last_frame` + `images` | frames 模式第 2 张图，文件名 `last.png` | `L172-175` |
| `image[]` + `images` | reference 模式全部参考图，文件名 `ref_{i}.png` | `L176-181` |
| `video[]` | 参考视频（画布视频/音频节点可作参考） | `L182` |
| `audio[]` | 参考音频 | `L183` |

请求头：`Authorization: Bearer <apiKey>`，**不设置 Content-Type**（交给浏览器加 boundary，`L39-44`）。
响应：必须含 `id`，否则抛 `apiErrors.noVideoTaskId`；支持 `{code:0,data:{...}}` 信封（`unwrapEnvelope`，`L345-357`）。

**Gemini 分支**（`video.ts:L221-265`）：`POST {base}/v1beta/models/{model}:predictLongRunning`，JSON body `{instances:[{prompt,image,lastFrame,referenceImages,video,audio}], parameters:{aspectRatio,durationSeconds,resolution,generateAudio,addWatermark}}`；轮询 `GET {base}/v1beta/{operationName}`；结果 `generatedSamples[0].video.uri`，未带 `key=` 时自动追加 `?key=<apiKey>`。

**脚本分支**（`video.ts:L93-123` + 模板 `model-plugin.ts:L435-555`）：脚本自行 `POST /v1/videos`、轮询、返回 `{url}` 或 Blob；`runModelPlugin` 用 `new Function` 注入 18 个变量（`model-plugin.ts:L118-157`）。结果只存在内存 `Map`（`L33,120-122`），**刷新页面即失效**。

### 2.3 轮询与状态判断

| 项 | 值 | 位置 |
|---|---|---|
| 轮询 URL | `GET {baseUrl}/v1/videos/{taskId}` | `video.ts:L195` |
| 轮询节奏 | 页面自管 **120 次 × 2500ms ≈ 5 分钟**；`waitForVideoGenerationTask` 另有一套 120×2500（画布用） | `video/index.tsx:L318,340`；`video.ts:L50-59` |
| 结果 URL 判定 | 依次取 `video_url`、`result_url`、`url`、`content.video_url`、`content.url`，要求 http(s) 或 `.mp4` | `video.ts:L359-361` |
| 完成 | 有结果 URL → 下载 Blob；否则 `status==="completed"` → `GET /videos/{id}/content` | `L196-202` |
| 失败 | `status==="failed" \| "cancelled"` → `error.message` | `L203` |
| 其他 | `pending`，继续轮询；超时文案 `apiErrors.videoTimeout` | `L204`、`L339` |
| 下载 | `axios.get(url, {responseType:"blob"})`，失败降级保留远端 URL（`mimeType: video/mp4`） | `L210-219` |
| Blob 校验 | `content-type` 含 `json` 时解析 `{code,msg,error.message}` 并抛错（防"200 返回错误 JSON"） | `L409-419` |
| 画布任务恢复 | 节点 `metadata.videoTaskId` + `videoTaskProvider` 持久化，刷新后自动续轮询 | `types/canvas.ts:L84-85`；`project.tsx:L319-329,331-395,478-483` |

### 2.4 本地存储格式

| 数据 | localforage 库 | store | key | 位置 |
|---|---|---|---|---|
| 视频 Blob | `infinite-canvas` | `media_files` | `video:<nanoid>` / `audio:<nanoid>` / `file:<nanoid>` | `file-storage.ts:L8,13` |
| 视频生成日志 | `infinite-canvas` | `video_generation_logs` | `nanoid()`（`LOG_STORE_KEY="infinite-canvas:video_generation_logs"`） | `video/index.tsx:L67-68` |
| 图片 Blob / 缩略图 | `infinite-canvas` | `image_files` / `image_previews` | `image:<nanoid>` | `image-storage.ts:L17-18,53` |
| 配置 | `infinite-canvas` | `app_state` | `infinite-canvas:ai_config_store`（apiKey 明文） | `use-config-store.ts:L75,249` |

日志对象 `GenerationLog`（`video/index.tsx:L44-61`）：`id/createdAt/title/prompt/time/model/config/references/durationMs/size/resolution/seconds/status/task?/video?/error?`。
序列化时把 `references[].dataUrl`、`video.url` 清空，仅留 `storageKey`（`L703-709`），读取时用 `resolveMediaUrl`/`resolveImageUrl` 回填（`L674-701`）——**后端化后这套"半元数据"逻辑应整体替换为服务端 URL**。

### 2.5 错误信息格式（`services/api/video.ts`）

- `readApiErrorMessage`（`L363-390`）：兼容字符串、嵌套 JSON 字符串、`{msg|message|error.message|detail}`；HTML 页面 → `apiErrors.htmlError`（截 80 字符）。
- `readAxiosError`（`L392-407`）：取消 → `requestCanceled`；`ERR_NETWORK` → `requestFailed`；401/403 → `authenticationFailed`；429 → `rateLimited`；其他 → `"<fallback>（<status>）"`。
- 失败类型标记：`videoTaskFailed` 设置 `error.name = "VideoTaskFailed"`（`L66-70`），调用方据此清空 `videoTaskId`（`project.tsx:L380,2751`）。
- 所有文案走 `i18n.t("apiErrors.*")`（`L19`），删除/替换时必须同步 i18n。

### 2.6 视频相关 UI 组件

| 文件 | 行数 | 职责 | 处置 |
|---|---|---|---|
| `components/video-settings-panel.tsx` | 219 | 分辨率（480/720/1080 + 自定义）、宽高、比例（1:1/3:4/4:3/16:9/9:16/21:9/auto）、时长滑杆 4–30s、模式（首尾帧/全能参考）；导出 `normalizeVideoSizeValue/normalizeVideoResolutionValue/videoModeLabel/videoSizeLabel` 等 | 保留 |
| `components/model-picker.tsx` | 117 | 按 capability 过滤的模型下拉；无模型时回调 `onMissingConfig`（`L42`）打开配置 | 保留改造（模型改由后端下发） |
| `components/canvas/canvas-video-settings-popover.tsx` | 111 | 画布节点内视频参数弹层（复用 `VideoSettingsPanel`） | 保留 |
| `lib/media-size.ts` | 151 | 时长边界、比例推断、像素尺寸计算、分辨率解析 | 保留（纯函数，被 video/canvas/config 共用） |

---

## 3. 无限画布

### 3.1 文件构成

| 区域 | 文件 | 行数 | 说明 |
|---|---|---|---|
| 页面 | `pages/canvas/index.tsx` | 130 | 项目列表 + zip 导入导出（`L40-64`）+ `?mode=new/recent` 自动进项目（`L66-72`） |
| 页面 | `pages/canvas/project.tsx` | **3,476** | 编辑器主文件，见 §3.2 |
| 页面 hook | `pages/canvas/hooks/use-agent-bridge.ts` | 98 | Agent 指令 → 画布操作 | 
| 页面 hook | `pages/canvas/hooks/use-plugin-host.tsx` | 155 | 插件宿主（暴露 AI/画布能力给插件） |
| 组件 | `components/canvas/*` | 39 文件 / 7,6xx 行 | 节点、工具栏、连线、面板、对话框 |
| 状态 | `stores/canvas/use-canvas-store.ts` | 146 | 项目持久化（400ms 防抖，`L56-65`） |
| 状态 | `stores/canvas/use-canvas-ui-store.ts` | 27 | 项目重命名/多选/删除确认 |
| 状态 | `stores/canvas/use-plugin-store.ts` | 45 | 插件安装记录 |
| 库 | `lib/canvas/*` | 15 文件 / 1,250 行 | 导出、几何、生成上下文、图片数据、节点工厂、registry |
| 类型 | `types/canvas.ts` | 166 | 节点/连线/会话/元数据 |

### 3.2 `project.tsx` 结构（3,476 行，按功能分段）

| 行区间 | 内容 | 裁剪动作 |
|---|---|---|
| L1-98 | imports（含 `api/image`、`api/audio`、`api/video`、agent store、plugin host、6 个图片编辑对话框） | 改（去 agent/plugin/audio） |
| L100-167 | 局部类型、常量（`VIDEO_NODE_MAX_WIDTH/HEIGHT=420`）、`applyGeneratedVideo` | 保留 |
| L169-287 | 80+ 个 `useState` / `useRef`（选择、视口、对话框、历史、生成请求表） | 改（删 chatSessions/activeChatId/agent 相关约 10 个） |
| L288-438 | 历史记录、生成请求管理、`completeVideoNodeTask`（L319-329）、`pollVideoNodeTask`（L331-395）、停止生成 | 保留（视频核心） |
| L440-543 | 项目加载/恢复（`hydrateCanvasImages` + `resetInterruptedGeneration`）、历史提交、自动保存、视口持久化 | 改（去 chatSessions） |
| L545-830 | 视口换算、连线命中、可见节点裁剪、`useAgentBridge`（L800-818）、`usePluginHost`（L820-831） | 改（删两段 hook 调用） |
| L832-1213 | 新建/删除/打组/复制粘贴/聚焦/撤销重做/导入导出入口 | 保留 |
| L1214-1680 | 鼠标/拖拽/框选/滚轮/全局键盘（快捷键见 §3.5） | 保留 |
| L1482-1580 | 文件拖入 → 图片/视频/音频节点（`createImageFileNode/createVideoFileNode/createAudioFileNode`） | 改（删音频） |
| L1806-1930 | 视频帧捕获、保存节点为资产、图片反推提示词 | 保留/改 |
| L1931-2142 | 裁剪/切分/蒙版/放大/角度（**图片编辑，约 700 行调用**） | 二期候选 |
| L2326-2763 | **`handleGenerateNode`（438 行）**：`builtinPanel`（插件节点，L2335-2366）→ image（L2392-2537）→ video（L2539-2587）→ audio（L2589-2619）→ text（L2621-2735） | 核心改造点 |
| L2768-2920 | `handleRetryNode`（重试含视频任务续查，L2770-2773） | 保留 |
| L2922-3132 | 批量图、文本生图、Agent 结果插入、资产插入、面板渲染（含插件面板 L3079-3080） | 改 |
| L3156-3476 | JSX：侧栏、顶栏、无限画布、连线 SVG、节点、悬浮预览、工具栏、对话框 | 改 |

### 3.3 节点类型

`types/canvas.ts:L12-19` 定义 **6 类**：`image`、`text`、`config`、`video`、`audio`、`group`（节点类型是开放字符串，插件可注册 `"<pluginId>:<name>"`，`L21-22`）。
默认尺寸/元数据：`constant/canvas.ts:L13-47`（视频 420×236，音频 340×120，组 760×480）。
`metadata` 关键字段（`L47-88`）：`content/storageKey/mimeType/bytes/naturalWidth/naturalHeight/status/errorDetails/prompt/composerContent/generationMode/model/size/count/images[]/primaryImageId/seconds/vquality/generateAudio/watermark/videoMode/references[]/videoTaskId/videoTaskProvider/groupId/fontSize/durationMs`。
节点注册表：`lib/canvas/node-registry.ts`（61 行，内置节点在 `components/canvas/nodes/builtin-nodes.tsx:L22-39` 注册；`getNodeDefinition().resource()` 让生成上下文统一读取节点资源）。

### 3.4 生成节点如何触发图片/视频生成

1. **入口**：`CanvasNodePromptPanel`（`components/canvas/canvas-node-prompt-panel.tsx`，节点下方对话框）或 `CanvasConfigNodePanel`（配置节点，模式 Segmented：image/text/video/audio，`canvas-config-node-panel.tsx:L43-70`）调用 `onGenerate(nodeId, mode, prompt)` → `handleGenerateNode`（`project.tsx:L2326`）。
2. **输入上下文**：`buildNodeGenerationContext`（`components/canvas/canvas-node-generation.ts:L40-64`）沿连线收集上游节点 → `NodeGenerationContext{prompt, referenceImages, referenceVideos, referenceAudios, text/image/video/audioCount}`；配置节点支持 `@[node:id]` 引用语法（`L66-126`）；Blob URL 在发送前转 data URL（`hydrateNodeGenerationContext`，`L172-175`）。
3. **配置合并**：`buildGenerationConfig(effectiveConfig, node, mode)`（`lib/canvas/canvas-generation-helpers.ts:L105-124`）——节点 metadata 优先，其次全局配置，最后 `defaultConfig`。
4. **视频分支**（`project.tsx:L2539-2587`）：新视频节点位置 = 源节点右侧 +96px；写入 `size/seconds/vquality/generateAudio/watermark/videoMode/references`；自动建连线；`completeVideoNodeTask` 先落 `videoTaskId` 再等待完成；`applyGeneratedVideo`（L135-144）按 420×420 上限等比并居中。
5. **图片分支**（L2392-2537）：按 `count` 建 N 个槽位（`metadata.images[]`，各自 `status`），有参考图走 `requestEdit`，否则 `requestGeneration`；`nodeRegenerateBehavior==="overwrite"` 时复用当前节点。
6. **文本分支**（L2621-2735）：`requestImageQuestion` 流式回填；**音频分支**（L2589-2619）：`requestAudioGeneration` → `storeGeneratedAudio`。

### 3.5 画布项目持久化 / 导入导出 / 快捷键

| 项 | 值 | 位置 |
|---|---|---|
| 项目 store key | `infinite-canvas:canvas_store`（localforage `app_state`） | `stores/canvas/use-canvas-store.ts:L43,134-140` |
| 写入策略 | 400ms 防抖 + 引用相等短路 | `L56-65` |
| Project 字段 | `id/title/createdAt/updatedAt/nodes/connections/chatSessions/activeChatId/backgroundMode/showImageInfo/viewport` | `L10-22`；注意 `showImageInfo` 文档未记载 |
| 单项目导出 | zip：`projects.json`（`app:"infinite-canvas"`, `version:3`）+ `projects/<id>/files/<key>.<ext>` | `lib/canvas/canvas-export.ts:L11-32` |
| 节点导出 | zip：每个节点一个文件（媒体 Blob / 文本 .txt / 其他 .json） | `L34-65` |
| 导入 | 读 zip → 回写 `setImageBlob`/`setMediaBlob` → `importProject` | `pages/canvas/index.tsx:L40-64` |
| 撤销/重做 | 最多 50 步，含节点/连线/会话/背景/视口；180ms 合并 | `project.tsx:L485-522,L509` |
| 快捷键 | `Ctrl/Cmd+Z` 撤销、`+Shift+Z`/`+Y` 重做、`+A` 全选、`+G` 打组、`+Shift+G` 解组、`+C/+V` 复制粘贴、`Delete/Backspace` 删除、`Esc` 取消；输入框内忽略 | `project.tsx:L1582-1668`；文档 `docs/content/docs/canvas/canvas-shortcuts.zh-CN.mdx` |
| 视口 | `{x,y,k}`，500ms 防抖持久化 | `project.tsx:L533-543` |

### 3.6 画布中"视频必需"与"依赖生图工作台"的切分

| 能力 | 视频平台是否必需 | 说明 |
|---|---|---|
| 节点/连线/框选/打组/撤销/复制粘贴/导入导出 | 必需 | `project.tsx` 主干 + `canvas-node.tsx` + `canvas-connections.tsx` + `canvas-node-geometry.ts` + `canvas-export.ts` |
| 视频节点 + 生成配置节点（video 模式）+ 参考图/参考视频连线 | 必需 | `canvas-node-generation.ts` + `canvas-generation-helpers.ts` + `video.ts` |
| 视频帧捕获为图片节点 | 强烈建议保留（做首帧/尾帧参考） | `lib/canvas/canvas-video-frame.ts` + `project.tsx:L1812-1844` |
| 图片节点（作为参考图）、文本节点（作为 prompt） | 必需 | `canvas-node.tsx` 内部渲染 6 类节点于一体 |
| 文本节点 AI 生成（`/v1/responses`） | 可选 | `services/api/image.ts:requestImageQuestion` |
| 图片生成/编辑节点（`/v1/images/*`） | 可选（视频平台可只留上传） | `services/api/image.ts:requestGeneration/requestEdit` |
| 裁剪/切分/蒙版/放大/角度/反推提示词 | 可选（≈2,100 行，二期） | `canvas-node-*-dialog.tsx`、`canvas-image-toolbar-*`、`canvas-image-data.ts`、`use-image-editor-viewport.ts` |
| 音频节点/音频生成 | 不需要 | `api/audio.ts`、`canvas-audio-settings-popover.tsx`、`audio-settings-panel.tsx` |
| 画布助手（右侧面板 + 会话 + Agent 指令） | 不需要 | `components/agent/**`、`use-agent-bridge`、`canvas-agent-ops`、`chatSessions` |
| 节点插件系统 | 不需要 | `plugin-*.ts`、`use-plugin-host`、`canvas-plugin-manager-modal` |

---

## 4. 我的资产

| 项 | 内容 | 位置 |
|---|---|---|
| 页面 | `pages/assets/index.tsx`（565 行）：搜索（`L57-64`）、类型筛选（`L55`）、分页（`L280-292`）、新增/编辑弹窗（`L296-400`）、详情 Drawer（`L484-544`）、导出/导入 zip（`L162-187`）、删除确认 | — |
| 导出/导入实现 | `pages/assets/asset-transfer.ts`（73 行）：`assets.json`(`app/version:1`) + `files/<key>.<ext>` | `L23-59` |
| store | `stores/use-asset-store.ts`（114 行） | — |
| 数据结构 | `Asset = TextAsset \| ImageAsset \| VideoAsset`（`L9-13`）；公共字段 `id/kind/title/coverUrl/tags/source/note/createdAt/updatedAt/metadata`（`L15-26`） | — |
| 图片资产 data | `{dataUrl, storageKey?, width, height, bytes, mimeType}`（`L11`） | — |
| 视频资产 data | `{url, storageKey?, width, height, bytes, mimeType}`（`L12`） | — |
| 存储 key | `infinite-canvas:asset_store`，写 localforage `app_state`（`L45`，序列化为 JSON 字符串） | `L47-73` |
| 读时迁移 | 视频：`resolveMediaUrl(storageKey)`；图片：`ensureImagePreview` + `resolveImageUrl`；无 storageKey 的 base64 自动 `uploadImage` 持久化（`L52-68`） | — |
| 缩略图 | `assetCoverUrl` 对自有图片优先用 WebP 缩略图（`L39-43`） | — |
| 与生成记录关系 | 视频页"加入资产"写 `kind:"video"`、`source: "视频工作台"`、`metadata.source="video-page"`（`pages/video/index.tsx:L245-256`）；画布"保存为资产"写 `source:"Canvas"`、`metadata.nodeId/prompt`（`project.tsx:L1846-1890`）。**资产 ≠ 生成记录**：生成记录在独立 store（video 页 `video_generation_logs`、生图 `image_generation_logs`），删除日志会删媒体 Blob（`video/index.tsx:L278-290`），但资产引用由 `cleanupImages` 统一回收（`use-asset-store.ts:L97-103`，内部动态 import `use-canvas-store`）。 | — |
| 存储用量 | `services/local-storage-usage.ts`（64 行）+ `config-local-storage.tsx`（130 行）：`navigator.storage.estimate()` + 遍历 IndexedDB 每个 store 统计条数/字节 | — |
| 后端化要点 | 资产结构可直接映射为后端 `asset` 表（kind/title/tags/source/note/metadata + media_url）；`asset-transfer.ts` 的 zip 导入导出保留给"离线备份"，或后端做批量导出 | — |

---

## 5. 配置体系

### 5.1 `AiConfig` 与渠道结构（`stores/use-config-store.ts`，507 行）

```ts
// L27-59
type AiConfig = {
  channelMode: "remote"|"local";        // merge 时强制 "local"（L264）
  baseUrl; apiKey; apiFormat: "openai"|"gemini";
  channels: ModelChannel[];             // L18-25 {id,name,baseUrl,apiKey,apiFormat,models[]}
  model; imageModel; videoModel; textModel; audioModel;
  audioVoice; audioFormat; audioSpeed; audioInstructions;
  videoSeconds; vquality; videoGenerateAudio; videoWatermark; videoMode;
  systemPrompt; reasoningEffort; models: string[];
  quality; size; background; count; canvasImageCount;
  proxyEnabled; proxyUrl;
  nodeRegenerateBehavior: "new-node"|"overwrite"; autoFocusOnSelect: boolean;
}
type ChannelModel = { name; capability: "image"|"video"|"text"|"audio"; script? };  // L12-16
```

- 模型值编码 `"<channelId>::<modelName>"`（`L76,390-402`），UI 展示 `model（渠道名）`（`L408-413`）。
- `defaultConfig`（`L82-128`）：默认渠道 `default`，4 个模型 `gpt-image-2 / grok-imagine-video / gpt-5.5 / gpt-4o-mini-tts`；`videoSeconds "6"`、`vquality "720"`、`videoMode "frames"`。
- 能力推断：`guessCapability`（`L162-168`，关键词表 `L153-159`）。
- 就绪校验：`isAiConfigReady`（`L210-213`）= 渠道 baseUrl + apiKey 非空。
- 请求拼装：`buildApiUrl`（`L487-492`）、`withLocalProxy`（`L501-507`）、`resolveModelRequestConfig`（`L438-447`）。

### 5.2 配置 UI 组成

| 文件 | 行数 | 作用 | 后端接管后 |
|---|---|---|---|
| `components/layout/app-config-modal.tsx` | 502 | Tabs：渠道（L185-217）/ 本地代理（219-222）/ 偏好（223-298）/ 提示词来源（299-303）/ WebDAV（304-347）/ 本地存储（348-352）；`AppConfigModal` 弹窗壳 L367-390；配置导入导出 L172-180 | 改造为"用户偏好 + 后端下发模型列表"，删 4 个 tab |
| `components/layout/channel-editor-drawer.tsx` | 129 | 渠道增删改：名称/协议/baseUrl/API Key/模型列表/能力切换（L104）/脚本入口（L105-107） | 二期删除（渠道由后台管理） |
| `components/layout/model-select-modal.tsx` | 155 | 调 `fetchChannelModels` 拉 `/v1/models` 勾选模型 | 二期改造（后端 `/models` 列表） |
| `components/layout/model-script-editor.tsx` | 184 | CodeMirror 编辑"模型调用脚本"，含变量表/返回约定/模板（`model-plugin.ts:L169-222`）与"AI 帮我写"提示词 | 二期删除 |
| `components/layout/config-local-proxy.tsx` | 80 | 本地转发代理开关/地址/`npx @basketikun/canvas-proxy@latest` 提示/连通性测试 | 删除 |
| `components/layout/config-prompt-sources.tsx` | 166 | 7 个内置提示词来源启停/刷新/定时/状态 | 删除 |
| `components/layout/config-local-storage.tsx` | 130 | IndexedDB 各 store 占用统计（`storeLabelKeys` L9-18 硬编码 8 个 store 名） | 可选保留（改造后仅剩 4 个 store） |
| `pages/config/index.tsx` | 19 | 页面壳 | 保留（挂新配置面板） |
| `services/config-file.ts` | 37 | 配置导入导出（含 webdav + promptSources） | 删除/改为后端设置备份 |
| `services/api/local-proxy.ts` | 12 | 代理健康检查 | 删除 |

**各司其职与后端取代关系**

| 概念 | 现状作用 | 后端接管方式 |
|---|---|---|
| provider / 渠道（`channels`） | 多个 OpenAI 兼容中转站，各自 baseUrl/apiKey/协议 | 后台维护 `channel` 表；前端只拿 `modelId`，请求走自家后端 |
| 模型（`models`） | 渠道下模型名 + capability + 自定义脚本 | 后台 `model` 表（能力/参数 schema/计费单价）；前端下拉来自 `GET /api/models?capability=video` |
| 自定义脚本（`script`） | 用 `new Function` 在浏览器内适配任意视频 API（`model-plugin.ts:L113-164`，视频模板 L435-555） | 后端做适配层（provider adapter），前端彻底移除脚本能力 |
| 本地代理（`proxyEnabled/proxyUrl`） | 绕过 CORS 把请求转发到中转站（`withLocalProxy` 应用到 video/image/webdav/file-storage 5+ 处） | 前端不再直连第三方 → 代理失去意义；保留字段会误伤，建议删除并清理调用点 |
| 提示词来源（`promptSources`） | 浏览器直连 GitHub 拉取第三方提示词 JSON 并缓存 IndexedDB | 功能删除；如需提示词，由后端内置 |
| 偏好（`nodeRegenerateBehavior/autoFocusOnSelect/canvasImageCount/systemPrompt`） | 用户偏好 | 保留（前端本地或后端用户设置表） |
| `audio*` 系列 | 音频生成参数 | 随音频功能删除 |

---

## 6. 删除清单与依赖影响

### 6.1 一期可物理删除（66 文件 / 10,759 行，"删了不炸"）

| 功能 | 直接删除的文件 | 行数 |
|---|---|---|
| **生图工作台** | `pages/image/index.tsx` 902、`components/image-generation-pending.tsx` 46（实测 0 引用，死代码） | 948 |
| **提示词库** | `pages/prompts/index.tsx` 87、`pages/prompts/components/prompt-detail-dialog.tsx` 47、`components/prompts/prompt-card.tsx` 51、`components/prompts/prompt-select-dialog.tsx` 84、`components/prompts/use-prompt-list.ts` 29、`services/api/prompts.ts` 226、`services/api/prompt-source-presets.ts` 38、`services/api/prompt-source-runtime.ts` 119、`stores/use-prompt-source-store.ts` 59、`components/layout/config-prompt-sources.tsx` 166、`components/layout/prompt-source-editor-drawer.tsx` 88、`components/layout/prompt-source-content-modal.tsx` 132、`hooks/use-prompt-source-scheduler.ts` 40、`components/canvas/canvas-prompt-library.tsx` 30 | 1,196 |
| **画布助手 Agent** | `components/agent/**`（15 文件：local-agent-panel 1,603、agent-chat-message 605、agent-event-formatters 597、agent-skills-view 454、agent-log-view 439、agent-chat-prompt-input 433、agent-chat-composer 235、agent-chat 190、agent-connect-view 155、agent-history-view 134、agent-panel 64、agent-canvas-reference-preview 36、agent-scroll-to-bottom 32、agent-panel-tabs 28、agent-chat-inline-tokens 48）、`stores/use-agent-store.ts` 173、`stores/use-agent-skill-store.ts` 122、`services/api/canvas-agent.ts` 139、`lib/agent/agent-site-tools.ts` 331、`lib/agent/agent-url-bootstrap.ts` 15、`lib/canvas/canvas-agent-ops.ts` 89、`pages/canvas/hooks/use-agent-bridge.ts` 98、`stores/use-workbench-agent-store.ts` 64 | 6,084 |
| **画布节点插件系统** | `lib/canvas/plugin-loader.ts` 170、`plugin-registry.ts` 50、`plugin-runtime.ts` 42、`plugin-node-context.ts` 30、`canvas-event-bus.ts` 47、`stores/canvas/use-plugin-store.ts` 45、`components/canvas/canvas-plugin-manager-modal.tsx` 227、`pages/canvas/hooks/use-plugin-host.tsx` 155 | 766 |
| **WebDAV 同步** | `services/webdav-sync.ts` 128、`services/app-sync.ts` 422 | 550 |
| **统计 / 版本 / GitHub** | `lib/analytics.ts` 84、`components/layout/analytics-tracker.tsx` 15、`constant/runtime-config.ts` 29、`hooks/use-version-check.ts` 92、`components/layout/version-release-modal.tsx` 95、`lib/release.ts` 24、`components/layout/github-link.tsx` 24 | 363 |
| **音频生成** | `components/audio-settings-panel.tsx` 102、`components/canvas/canvas-audio-settings-popover.tsx` 114、`services/api/audio.ts` 157、`lib/audio-generation.ts` 61 | 434 |
| **本地代理** | `components/layout/config-local-proxy.tsx` 80、`services/api/local-proxy.ts` 12 | 92 |
| **死代码** | `components/ui/dia-text-reveal.tsx` 226、`components/canvas/canvas-size-picker.tsx` 67、`stores/use-user-store.ts` 18、`services/api/request.ts` 15 | 326 |

> 上述"0 引用"经全仓 `Select-String` 验证：`dia-text-reveal`、`canvas-size-picker`、`image-generation-pending`、`use-user-store`、`api/request` 均无其他文件引用。

### 6.2 二期删除（必须与"后端接管"同一改动，否则编译/功能断裂）

| 文件 | 行数 | 阻塞原因 |
|---|---|---|
| `services/api/model-plugin.ts` | 991 | `video.ts:L10,76,100`、`audio.ts:L7,33`、`model-script-editor.tsx:L9` 依赖；删它必须同时删视频"脚本分支"和音频 |
| `components/layout/model-script-editor.tsx` | 184 | `channel-editor-drawer.tsx:L7,119` 依赖 |
| `components/layout/channel-editor-drawer.tsx` | 129 | `app-config-modal.tsx:L9,362` 依赖；渠道改后台管理后删 |
| `services/config-file.ts` | 37 | 依赖 `WebdavSyncConfig` + `promptSources`，与 §6.1 冲突，需重写 |
| `services/api/image.ts` | 893 | `project.tsx:L8`、`use-plugin-host.tsx:L4`、`canvas-node-generation.ts:L1` 依赖；后端化时整体重写（保留 3 个函数签名） |
| `services/api/video.ts` | 441 | 后端任务 API 重写（保留 `createVideoGenerationTask/pollVideoGenerationTask/storeGeneratedVideo` 三个函数名，内部换实现最省事） |

### 6.3 需改动的共享文件（删除引发的连带编辑）

| 文件 | 行数 | 必改点 |
|---|---|---|
| `router.tsx` | 35 | 删 `/image`、`/prompts` import + 路由；删 `AnalyticsTracker`（L3,19） |
| `constant/navigation-tools.ts` | 30 | 删 image/prompts 两项 |
| `layouts/user-layout.tsx` | 16 | 删 `AgentPanel`（L3,13） |
| `components/layout/app-top-nav.tsx` | 99 | 删 agent store/自动连接/Agent 按钮（L12,18-33,86-88）；`AppConfigModal` 换后端配置 |
| `components/layout/user-status-actions.tsx` | 68 | 删插件入口、文档链接、版本弹窗、GitHub（L7,8,41,45,59,60）；语言/主题保留 |
| `components/layout/app-config-modal.tsx` | 502 | 删 webdav tab（L15,16,41-50,118-166,304-347,429-496）、prompt-sources tab（L11,299-303）、local-proxy tab（L10,219-222）；渠道 tab 改只读列表 |
| `components/layout/client-root-init.tsx` | 39 | 删 `usePromptSourceScheduler`（L7,16）；URL 传 apiKey 逻辑（L18-36）与后端方案冲突，建议删除 |
| `pages/canvas/index.tsx` | 130 | 删 `hasAgentUrlBootstrap` 与 `mode=new/recent` 逻辑（L16,32-37,66-72,36） |
| `pages/canvas/project.tsx` | 3,476 | 删 agent/plugin/audio：imports（L9,45,47,48,74）、`useAgentStore` 5 个 selector（L178-184）、`chatSessions/activeChatId` state 与持久化（L230-231,288-298,451-455,524-527）、`useAgentBridge`（L800-818）、`usePluginHost`（L820-831）、audio 分支（L2589-2619）、`createAudioFileNode`（L1523-1541）、插件面板/工具栏（L3079-3080,3325,3423）、`builtinPanel` 分支（L2335-2366）。**预计 -400~-500 行** |
| `components/canvas/canvas-node.tsx` | 997 | 删 `pluginHost/pluginContext/renderPanel` 插件分支（L9-10,14,33,99,129-130,470）；audio 渲染分支 |
| `components/canvas/canvas-toolbar.tsx` | 385 | 删扩展节点面板（L7,73-74 与 extensions 面板）、音频按钮 |
| `components/canvas/canvas-top-bar.tsx` | 220 | 删 `onOpenPlugins`、agent 状态与按钮（L28,50,31-33,54-55） |
| `components/canvas/canvas-side-panel.tsx` | 692 | 删 prompts tab 与 `PromptDetailDialog/fetchSourcePrompts/usePromptSourceStore`（L12,13,17,27,106,114）；`storeLabelKeys` 另见配置文件 |
| `components/canvas/canvas-node-prompt-panel.tsx` | 204 | 删 `CanvasPromptLibrary`（L11）、音频设置（L12） |
| `components/canvas/canvas-config-node-panel.tsx` | 184 | 删音频模式 tab 与音频设置（L2,11,14） |
| `components/canvas/canvas-config-composer.tsx` | 380 | 删音频资源图标（L4,12） |
| `components/canvas/canvas-create-menus.tsx` | 118 | registry 动态类型 → 仅内置类型（L7,84-86） |
| `components/canvas/canvas-node-hover-toolbar.tsx` | 312 | 删图片编辑工具项/extraTools（与二期裁剪联动） |
| `pages/video/index.tsx` | 802 | 删 `PromptSelectDialog` 与"查看提示词"按钮（L11,398-400,503）、`useWorkbenchAgentStore` 命令处理（L20,99-103,171-221）；改为从后端任务 API 轮询 |
| `pages/home/index.tsx` | 120 | 重写（去掉 `fetchPrompts` 作品墙 L7,34-38,61-102） |
| `stores/use-config-store.ts` | 507 | 删 `webdav` 状态（L61-67,130-136,138-151,219,236-242,250-262）、`proxy*`（L55-56,124-125,283-284,494-507）、`channels/models/script` 结构改后端模型列表；保留视频/图片参数与偏好 |
| `services/api/video.ts` | 441 | 删 `withLocalProxy`、`resolveModelScript`/`runModelPlugin` 分支 |
| `services/image-storage.ts` | 278 | `cleanupUnusedImages` 要删掉对 `image_generation_logs` store 的遍历（L246-252） |
| `services/file-storage.ts` | 88 | 删 `withLocalProxy`（L4,12） |
| `lib/canvas/canvas-generation-helpers.ts` | 192 | 删 `audio*` 字段合并（L118-121）、`hydrateAssistantImages`（L69-89） |
| `lib/canvas/canvas-node-factory.ts` | 71 | 删 `audioMetadata`、`buildAudioGenerationMetadata`（L35-37,55-63） |
| `types/canvas.ts` | 166 | 删 `Audio` 枚举与音频 metadata 字段；`CanvasAssistant*`（L106-138）建议保留为"旧数据兼容类型" |
| `types/canvas-plugin.ts` | 147 | 裁成"内置节点定义"子集（`CanvasNodeDefinition`/`CanvasNodeResource` 仍需） |
| `main.tsx` | 23 | 删 `initAnalytics`（L10,13）、`streamdown/styles.css`（L4） |
| `index.html` | 23 | 删 `<script src="/config.js">`（L20）；主题引导脚本（L9-16）保留 |
| `vite.config.ts` | 53 | 删 `VERSION/CHANGELOG` 读取与 `__APP_VERSION__/__APP_RELEASES__` define（L10-11,49-52）、插件清单插件（L13-39,43） |
| `vite-env.d.ts` | 14 | 删版本全局声明 |
| `constant/env.ts` | 6 | 删 `PLUGIN_REGISTRY_URL`、改 `DOCS_URL` |
| `styles/globals.css` | 609 | 清理 agent/提示词/插件相关类（`prompt-filter-tag` 等被 assets 复用，需逐一确认） |
| `i18n/locales/{zh-CN,en-US}.ts` | 666 × 2 | 删 `agent`（zh-CN 17,970 字符）、`prompts`、`modelPlugin`、`config.webdav/proxy/promptSources`、`canvas.plugins`、`imageWorkbench`、`home`；保留 `videoWorkbench/workbench/apiErrors/assets/canvas/config(残)/common/settingsPanels/topNav/navigation` |
| `package.json` | 59 | 删依赖（均已实测引用面）：`@codemirror/*` + `@uiw/react-codemirror`（仅 `model-script-editor.tsx`）、`streamdown`（`agent-chat-message.tsx` + `main.tsx:L4` + `globals.css`）、`@ant-design/pro-components`（仅 `app-providers.tsx:L3,47`，可换掉）、`@ant-design/icons`（仅 `github-link.tsx:L1`）、`@tanstack/react-query`（5 处，全部随提示词库消失）、`dayjs`（agent 删除后仅剩 `app-providers.tsx` 的 antd locale，可换 `Intl`）、`class-variance-authority`（0 引用，已无用）；`radix-ui` 若保留 `components/ui/select.tsx` 则必须留 |
| `web/tests/model-selection.test.ts` | 100 | 直接构造 `channels` 结构（L25-40），渠道结构变更后必须重写；`tests/image-thumbnail.test.ts`(24)、`tests/canvas-focus-viewport.test.ts`(60) 可保留 |
| `web/docker-entrypoint.sh` | 22 | 只生成 analytics 的 `config.js`，随统计删除 |
| `web/public/config.js` | 3 | 删除 |

### 6.4 必须保留的"被复用公共代码"（别顺手删）

| 模块 | 保留的函数 | 被谁用 |
|---|---|---|
| `lib/image-utils.ts`（63） | `formatBytes`、`formatDuration`、`getDataUrlByteSize`、`readFileAsDataUrl`、`readImageMeta`、`dataUrlToFile` | video 页 L15、assets L8、canvas、`video.ts:L5,150` |
| `services/file-storage.ts`（88） | `uploadMediaFile`、`resolveMediaUrl`、`getMediaBlob`、`setMediaBlob`、`deleteStoredMedia`、`cleanupUnusedMedia`、`collectMediaStorageKeys` | 视频结果落盘、画布视频节点、资产、导出 |
| `services/image-storage.ts`（278） | `uploadImage`、`resolveImageUrl`、`getImageBlob`、`setImageBlob`、`imageToDataUrl`、`ensureImagePreview`、`previewUrlFor`、`subscribeImagePreviews`、`getImagePreviewRevision`、`deleteStoredImages`、`cleanupUnusedImages`、`collectImageStorageKeys` | 参考图上传/缩略图、video 页（`L17`）、canvas、assets、`video.ts:L8,96`（参考图转 data URL **视频必需**） |
| `lib/image-thumbnail.ts`（49） | `createImageThumbnail`（缩略图）、`pickImageSource`（清晰度选择） | image-storage、canvas-node |
| `lib/media-size.ts`（151） | 全部 | 视频设置、画布、配置 |
| `lib/canvas/canvas-export.ts`（89）、`lib/zip.ts`（21） | 全部 | 画布/资产导入导出 |
| `lib/canvas/node-registry.ts`（61）+ `nodes/builtin-nodes.tsx`（39）+ `constant/canvas.ts`（54） | 内置节点注册表（插件加载器删掉后仍需，类型来自 `types/canvas-plugin.ts` 的 `CanvasNodeDefinition`） | canvas-node / create-menus / toolbar / minimap |
| `components/ui/select.tsx`（194） | 自定义 Select（依赖 `radix-ui`） | `model-picker.tsx` |
| `hooks/use-copy-text.ts`（13） | 复制文本 | assets、prompts(删) |
| `lib/canvas/canvas-video-frame.ts`（51） | `captureVideoFrame` | 画布视频抽帧 → 参考图（视频平台加分项） |

### 6.5 最小可用保留集（目录级）

```
web/
├─ index.html                              改（去 config.js）
├─ package.json / tsconfig.json / vite.config.ts / postcss.config.mjs / prettier 配置
├─ public/{logo.svg, icons/}               保留（icons 供 model-picker 用）
├─ tests/{canvas-focus-viewport,image-thumbnail}.test.ts（重写 model-selection）
└─ src/
   ├─ main.tsx / router.tsx / vite-env.d.ts
   ├─ layouts/user-layout.tsx
   ├─ constant/{canvas.ts, env.ts, navigation-tools.ts}
   ├─ components/
   │   ├─ model-picker.tsx / video-settings-panel.tsx / text-settings-panel.tsx
   │   ├─ image-settings-panel.tsx         仅保留 ImageSettingsTheme（+可选 ImageSettingsPanel）
   │   ├─ ui/{select.tsx, animated-theme-toggler.tsx}
   │   ├─ layout/{app-providers, client-root-init, app-top-nav, mobile-nav-drawer,
   │   │           user-status-actions, app-config-modal, config-local-storage(可选)}
   │   └─ canvas/                          39 → 约 30 文件（例外：删 canvas-plugin-manager-modal、
   │                                        canvas-audio-settings-popover；改 side-panel/toolbar/top-bar/
   │                                        create-menus/node；二期候选 canvas-node-{crop,mask-edit,
   │                                        split,upscale,angle}-dialog + canvas-image-toolbar-* +
   │                                        use-image-editor-viewport + canvas-image-data）
   ├─ pages/{canvas/*, video/index.tsx, assets/*, config/index.tsx, home/index.tsx, not-found/index.tsx}
   ├─ services/{file-storage, image-storage, local-storage-usage(可选), api/{video,image}(重写)}
   ├─ stores/{use-config-store(改), use-asset-store, use-theme-store, use-canvas-side-panel-store}
   ├─ stores/canvas/{use-canvas-store, use-canvas-ui-store}
   ├─ lib/{image-utils, image-thumbnail, media-size, canvas-theme, localforage-storage, zip, utils,
   │        app-theme, image-reference-prompt, keyboard-event}
   ├─ lib/canvas/{canvas-export, canvas-generation-helpers, canvas-node-factory, canvas-node-geometry,
   │              canvas-node-size, canvas-resource-references, canvas-video-frame, node-registry,
   │              canvas-image-data(二期), canvas-node-size}
   ├─ types/{canvas.ts(改), canvas-export.ts, canvas-plugin.ts(裁), image.ts, media.ts}
   ├─ i18n/{index.ts, locales/*(裁)}
   └─ styles/globals.css
```

**新增（参考项目没有）**：登录/鉴权、API client（统一走自家后端）、任务中心（替代 localforage 日志）、计费与额度展示、管理后台（用户/模型/渠道/任务/账单）。参考项目 `pages/admin|auth|projects` 为空目录，无任何可复用实现。

---

## 7. 风险与坑

| # | 风险 | 具体位置/证据 | 影响 | 建议 |
|---|---|---|---|---|
| R1 | **硬编码外链**会残留"别人的产品"痕迹 | `hooks/use-version-check.ts:L7-8`（`raw.githubusercontent.com/basketikun/infinite-canvas/VERSION` 与 `CHANGELOG.md`）、`components/layout/github-link.tsx:L15`、`constant/env.ts:L3`（`https://docs.canvas.best`）、`constant/env.ts:L6`（jsDelivr 插件注册表）、`stores/use-config-store.ts:L79`（`@basketikun/canvas-proxy`） | 编译能过、上线泄底 | 全量 grep `basketikun` / `canvas.best` / `jsdelivr`，逐处删除；`use-version-check` 与 `github-link` 直接删文件 |
| R2 | **`public/config.js` 运行时注入链** | `index.html:L20` 加载、`constant/runtime-config.ts:L19`、`docker-entrypoint.sh:L17-22`、`main.tsx:L10-13` | 只删 ts 不删 html/入口脚本会 404 + 统计残留 | 四件一起删（html script、runtime-config、entrypoint、Dockerfile COPY） |
| R3 | **本地代理是全局横切** | `withLocalProxy`（`use-config-store.ts:L501-507`）被 `buildApiUrl`（L487-492）、`file-storage.ts:L12`、`image-storage.ts:L82`、`video.ts:L212,280,284`、`webdav-sync.ts:L81` 使用 | 直接删函数会连锁改 6 个文件 | 一期先"保留函数 + 强制返回原 URL"（最小改动），二期随直连 API 移除 |
| R4 | **i18n 体量与一致性** | 两个 locale 各 666 行（zh-CN 76KB / en-US 79KB）；`agent` 命名空间 zh-CN 17,970 字符 ≈ 24%；`canvas` 13,605、`config` 12,261；`i18n/index.ts:L11-22` 无 fallback 资源校验 | 删 key 漏改会运行时空字符串；两语言结构必须一致 | 用脚本按命名空间整体删除；`tsc --noEmit` 抓不到 i18n key，需人工核 `t("` 调用（全仓 100+ 处） |
| R5 | **antd 6 + React 19 兼容细节** | antd 6 已改名：`destroyOnHidden`（`pages/assets/index.tsx:L296`、`asset-picker-modal.tsx:L22`）、`Drawer size`（`mobile-nav-drawer.tsx:L18`）、`Button iconPlacement`（`pages/home/index.tsx:L52,68`）；`App.useApp()` 依赖 `<App>`（`app-providers.tsx:L48`）；`React.StrictMode`（`main.tsx:L18`）双执行 effect，Agent EventSource 与插件动态 `import(blobURL)` 会重复触发 | 降级 antd 5 会大面积报错；升级/替换组件库成本高 | 保持 antd 6；把 `web` 的 antd 6 用法清单化（上述 4 类），不要照抄 antd5 文档 |
| R6 | **`new Function` 脚本执行**（`model-plugin.ts:L113-164`） | 若前端加 CSP，模型脚本与插件动态 import 全部失效 | 视频生成可能全挂 | 后端化后整段删除，前端不再执行任意 JS |
| R7 | **强耦合高成本文件** | `project.tsx` 3,476 行（6 类功能纠缠）；`app-config-modal.tsx` 502；`canvas-node.tsx` 997；`use-config-store.ts` 507；`i18n` 2×666 | 一次性大重构不可 review、易回归 | 三步走：①先删路由/入口按钮（功能隐藏、代码保留，1 PR）②共享 store/类型解耦（1 PR）③按 agent→plugin→audio→webdav→prompts 顺序逐组物理删除（每组 1 PR，每步跑 `tsc --noEmit` + `bun test`） |
| R8 | **文档与代码不一致** | docs 说"三类节点"（`canvas-data-structure.zh-CN.mdx:L59,71`），代码 `types/canvas.ts:L12-19` 为 6 类；docs 未记录 `showImageInfo` | 用 docs 当需求会漏功能 | 以本盘点为准；PRD 阶段重新对齐 |
| R9 | **localforage 数据兼容** | 老数据 `image_files`/`media_files`/`video_generation_logs`/`canvas_store`/`asset_store` 都存在用户浏览器；删 store 名逻辑（`config-local-storage.tsx:L9-18` 硬编码）后旧数据变孤儿 | 前端改后端后老项目/资产丢失 | 提供"本地数据一次性迁移到后端"的导入工具（读 localforage → POST 后端），迁移完成后再删本地代码 |
| R10 | **视频任务续跑依赖浏览器** | `videoTaskId` 存节点、页面重开才恢复（`project.tsx:L478-483`）；`plugin` 任务结果只在内存 Map（`video.ts:L33,120-122`） | 用户关页面即丢任务 | 后端化正好解决；迁移期不要删 `videoTaskId` 字段语义（映射为后端 taskId） |
| R11 | **`pages/*` 空目录是伪需求信号** | `pages/admin`、`pages/auth`、`pages/projects` 三个空目录（实测无文件） | 误以为有后台可复用 | 直接删除空目录，后台另建（`frontend/admin_frontend`） |
| R12 | **删除 `image-generation-pending`/`dia-text-reveal` 等死代码前先确认** | 已实测 0 引用（§6.1 注） | 误删后 `tsc` 报错才发现 | 可安全删；建议独立 PR"dead code removal" |

---

## 8. 产品信息提取（可作为 PRD 输入的事实）

> `docs/product/` 下只有空目录 `evidence/`（0 文件），无 PRD。以下全部来自 `docs/content/docs/**` 与代码，标注来源。

| # | 事实 | 来源 |
|---|---|---|
| F1 | 画布项目支持多项目、重命名、删除、批量选择/删除、单项目/多项目导出 JSON(zip)、导入；**项目只存浏览器本地，不随账号同步** | `overview/features.zh-CN.mdx:L10-15` |
| F2 | 画布视图：拖动平移、滚轮缩放、缩放滑杆、重置视图、小地图开关、三种背景（点阵/网格线/空白）、深浅主题 | `features.zh-CN.mdx:L17-27` |
| F3 | 选择与编辑：框选、多选、全选、取消选择、删除选中、复制粘贴节点与连线、撤销/重做（含视口/背景/助手会话） | `features.zh-CN.mdx:L23-27`；`canvas-shortcuts.zh-CN.mdx:L11-33` |
| F4 | 节点三大类（文档）/实际六类（代码）：图片、文本、生成配置、视频、音频、组；支持拖拽、四角缩放、等比/自由比例、查看信息与 JSON、复制粘贴、左右连接点 | `features.zh-CN.mdx:L31-44`；`types/canvas.ts:L12-19` |
| F5 | 图片工作流：上传/拖入/替换/下载/存入素材/裁剪/多角度变换/失败重试/批量多图组（叠卡预览、设主图） | `features.zh-CN.mdx:L46-56` |
| F6 | 默认前台直连：浏览器本地 Base URL/API Key/Model 直连 OpenAI 兼容接口，不经项目服务端；`/v1/images/generations`、`/v1/images/edits`、`/v1/responses`、`/v1/models`；视频 `POST /v1/videos`、`GET /v1/videos/{id}`、`GET /v1/videos/{id}/content`；Base URL 以 `/v1` 结尾不再追加 | `features.zh-CN.mdx:L58-77` |
| F7 | 可配置项：Base URL、API Key、默认模型、图片质量、比例、数量、视频模型、视频比例/清晰度/时长/生成声音/水印、自定义生图/视频调用方式 | `features.zh-CN.mdx:L77-87` |
| F8 | 生成配置节点可读上游节点内容、按自身配置批量生成、预览并调整输入顺序；节点对话框与组装输入框支持 `@` 引用（图片显示真实缩略图，按连接自动编号） | `features.zh-CN.mdx:L89-91` |
| F9 | 视频生成：从文本节点读 prompt、图片节点读参考图；成功后插入为视频节点并用原生播放器预览 | `features.zh-CN.mdx:L93`；`canvas-node-manual.zh-CN.mdx:L48-57` |
| F10 | 视频规格：`480p/720p/1080p`；比例 `1:1、3:4、4:3、16:9、9:16、21:9、自动`；时长 4–30 秒滑杆；两种模式「首尾帧」「全能参考」；1 张图作首帧、2 张作首尾帧；>2 张强制全能参考 | `canvas-node-manual.zh-CN.mdx:L55`；代码 `lib/media-size.ts:L36-47,102-113`、`video.ts:L325-328` |
| F11 | 视频接口字段：OpenAI 风格按模式发 `first_frame`/`last_frame` 或 `image[]`，可附 `video[]`/`audio[]`；Gemini 用 `models/{model}:predictLongRunning` 轮询 operation，发 `image`/`lastFrame` 或 `referenceImages` | `canvas-node-manual.zh-CN.mdx:L56`；`video.ts:L167-183,226-234` |
| F12 | 任务恢复：创建远端任务后任务 ID 写入视频节点，刷新页面自动续查，也可手动"获取任务状态"，直到成功/失败/查询报错 | `canvas-node-manual.zh-CN.mdx:L57`；`project.tsx:L478-483` |
| F13 | 组节点：Ctrl/Cmd+G 打组、Ctrl/Cmd+Shift+G 解组、拖入/拖出自归属、组连到生成节点时组内资源整体作为输入 | `canvas-node-manual.zh-CN.mdx:L59-67` |
| F14 | 文本节点：双击编辑、工具栏"编辑文字"、字号调整；空节点生成回填、有内容生成新节点并连线；模型下拉只影响当前节点 | `canvas-node-manual.zh-CN.mdx:L10-46` |
| F15 | 画布助手：文本问答、生图、引用选中节点+自动纳入上游、粘贴图片插入、历史会话、删除会话、重试、把文本/图片插入画布、折叠面板 | `features.zh-CN.mdx:L95-109` |
| F16 | 提示词库：7 个内置来源独立启停/查看/拉取/定时批量更新、自定义 JSON 来源、失败保留上次缓存、跨来源搜索、标签筛选、详情、复制、插入画布 | `features.zh-CN.mdx:L123-142` |
| F17 | 素材：新增文本/图片素材、编辑标题/封面/标签/来源/备注/内容、删除、关键词搜索、类型筛选、分页、复制文本、下载图片、从提示词库/画布加入、在画布插入 | `features.zh-CN.mdx:L144-157` |
| F18 | 明确的产品限制（可直接进 PRD"已知限制"）：项目与素材仅存浏览器本地不随账号同步；API Key 存浏览器并由前端直连，仅适合个人/可信环境；画布更适合桌面端，移动端触控未系统完善 | `features.zh-CN.mdx:L165-169` |
| F19 | 画布本地数据结构：项目 JSON `app_state/infinite-canvas:canvas_store`、素材 `infinite-canvas:asset_store`、图片 Blob `image_files`、媒体 Blob `media_files`；JSON 不存 base64，只存 URL+`storageKey`+元信息；写图统一走 `uploadImage`；删除走引用计数清理 | `development/canvas-data-structure.zh-CN.mdx:L10-19,173-234` |
| F20 | 撤销/重做范围：节点、连线、视口、背景模式、助手会话；项目名称、账号状态、全局 AI 配置、素材保存不在历史内 | `canvas-shortcuts.zh-CN.mdx:L41-43` |
| F21 | 快捷键全表（视图/选择/编辑/素材四类，含 Ctrl/Cmd+C/V/G/Shift+G/A/Z/Shift+Z/Y、Delete、Esc、拖入图片） | `canvas-shortcuts.zh-CN.mdx:L11-39`；代码 `project.tsx:L1582-1668` |
| F22 | 商业/授权说明存在但极简（8–15 行），无定价、无计费模型 → 计费体系需完全新建 | `docs/content/docs/business/{business,license}.zh-CN.mdx` |
| F23 | 版本/更新说明：`VERSION` + `CHANGELOG.md` 在仓库根，前端构建时注入（`vite.config.ts:L10-11`） | `vite.config.ts` |

---

## 9. 文件 → 处理方式总表

图例：**保** = 原样保留；**改** = 需编辑；**删** = 物理删除；**二期** = 与后端接管同批删除；**裁** = 保留但裁剪内部实现。

### 9.1 入口 / 布局 / 常量 / 样式

| 文件 | 行数 | 处理 |
|---|---|---|
| `web/index.html` | 23 | 改（删 config.js） |
| `web/vite.config.ts` | 53 | 改 |
| `web/package.json` | 59 | 改 |
| `web/tsconfig.json` / `postcss.config.mjs` / `components.json` / `.prettierrc.json` | — | 保 |
| `web/docker-entrypoint.sh` | 22 | 删 |
| `web/public/config.js` | 3 | 删 |
| `web/public/{logo.svg, icons/*.svg}` | 8 | 保 |
| `web/tests/canvas-focus-viewport.test.ts` / `image-thumbnail.test.ts` | 60 / 24 | 保 |
| `web/tests/model-selection.test.ts` | 100 | 改（重写） |
| `src/main.tsx` | 23 | 改 |
| `src/router.tsx` | 35 | 改 |
| `src/vite-env.d.ts` | 14 | 改 |
| `src/layouts/user-layout.tsx` | 16 | 改 |
| `src/constant/{canvas.ts, navigation-tools.ts}` | 54 / 30 | 保 / 改 |
| `src/constant/{env.ts}` | 6 | 改 |
| `src/constant/runtime-config.ts` | 29 | 删 |
| `src/styles/globals.css` | 609 | 改（清 agent/prompts/plugin 类） |
| `src/i18n/index.ts` | 29 | 保 |
| `src/i18n/locales/{zh-CN,en-US}.ts` | 666 × 2 | 改（按命名空间裁剪） |

### 9.2 `components/`（除 canvas）

| 文件 | 行数 | 处理 |
|---|---|---|
| `model-picker.tsx` | 117 | 改（模型来源改后端） |
| `video-settings-panel.tsx` | 219 | 保 |
| `text-settings-panel.tsx` | 57 | 保 |
| `image-settings-panel.tsx` | 259 | 裁（保 `ImageSettingsTheme` L149-…；`ImageSettingsPanel` 视画布图片生成去留） |
| `image-generation-pending.tsx` | 46 | 删 |
| `audio-settings-panel.tsx` | 102 | 删 |
| `ui/select.tsx` / `ui/animated-theme-toggler.tsx` | 194 / 194 | 保 |
| `ui/dia-text-reveal.tsx` | 226 | 删 |
| `agent/**`（15 文件） | 5,053 | 删 |
| `prompts/**`（3 文件） | 164 | 删 |
| `layout/app-providers.tsx` | 56 | 保（可去 QueryClient/ProConfigProvider） |
| `layout/app-top-nav.tsx` | 99 | 改 |
| `layout/mobile-nav-drawer.tsx` | 41 | 保 |
| `layout/user-status-actions.tsx` | 68 | 改 |
| `layout/app-config-modal.tsx` | 502 | 改（大幅） |
| `layout/client-root-init.tsx` | 39 | 改 |
| `layout/channel-editor-drawer.tsx` | 129 | 二期 |
| `layout/model-select-modal.tsx` | 155 | 二期/改 |
| `layout/model-script-editor.tsx` | 184 | 二期 |
| `layout/config-local-proxy.tsx` | 80 | 删 |
| `layout/config-prompt-sources.tsx` | 166 | 删 |
| `layout/prompt-source-editor-drawer.tsx` | 88 | 删 |
| `layout/prompt-source-content-modal.tsx` | 132 | 删 |
| `layout/config-local-storage.tsx` | 130 | 保（可选，改 store 名表） |
| `layout/analytics-tracker.tsx` | 15 | 删 |
| `layout/version-release-modal.tsx` | 95 | 删 |
| `layout/github-link.tsx` | 24 | 删 |

### 9.3 `components/canvas/`（39 文件 / 7,6xx 行）

| 文件 | 行数 | 处理 |
|---|---|---|
| `infinite-canvas.tsx` | 256 | 保 |
| `canvas-node.tsx` | 997 | 改（去插件/音频分支） |
| `canvas-node-generation.ts` | 229 | 保（可去 audio） |
| `canvas-node-prompt-panel.tsx` | 204 | 改 |
| `canvas-node-hover-toolbar.tsx` | 312 | 改 |
| `canvas-node-reference-bar.tsx` | 57 | 保 |
| `canvas-node-crop-dialog.tsx` | 271 | 保/二期 |
| `canvas-node-mask-edit-dialog.tsx` | 438 | 保/二期 |
| `canvas-node-split-dialog.tsx` | 299 | 保/二期 |
| `canvas-node-upscale-dialog.tsx` | 110 | 保/二期 |
| `canvas-node-angle-dialog.tsx` | 93 | 保/二期 |
| `canvas-image-toolbar-tools.tsx` | 166 | 保/二期 |
| `canvas-image-toolbar-settings-modal.tsx` | 233 | 保/二期 |
| `canvas-image-settings-popover.tsx` | 126 | 保/二期 |
| `use-image-editor-viewport.ts` | 217 | 保/二期 |
| `canvas-config-composer.tsx` | 380 | 改 |
| `canvas-config-node-panel.tsx` | 184 | 改（去 audio tab） |
| `canvas-side-panel.tsx` | 692 | 改（去 prompts tab） |
| `canvas-toolbar.tsx` | 385 | 改（去扩展节点面板） |
| `canvas-top-bar.tsx` | 220 | 改 |
| `canvas-create-menus.tsx` | 118 | 改 |
| `canvas-connections.tsx` | 78 | 保 |
| `canvas-context-menu.tsx` | 56 | 保 |
| `canvas-delete-projects-dialog.tsx` | 40 | 保 |
| `canvas-mini-map.tsx` | 137 | 保 |
| `canvas-project-card.tsx` | 83 | 保 |
| `canvas-refresh-shell.tsx` | 34 | 保 |
| `canvas-resource-mention-textarea.tsx` | 352 | 保 |
| `canvas-selection-toolbar.tsx` | 85 | 保 |
| `canvas-text-settings-popover.tsx` | 105 | 保 |
| `canvas-video-settings-popover.tsx` | 111 | 保 |
| `canvas-zoom-controls.tsx` | 85 | 保 |
| `canvas-prompt-chip-input.tsx` | 426 | 保 |
| `canvas-prompt-library.tsx` | 30 | 删（依赖提示词库） |
| `asset-picker-modal.tsx` | 136 | 保 |
| `canvas-audio-settings-popover.tsx` | 114 | 删 |
| `canvas-plugin-manager-modal.tsx` | 227 | 删 |
| `nodes/builtin-nodes.tsx` | 39 | 保（去 audio 定义） |
| `canvas-size-picker.tsx`（死代码） | 67 | 删 |

### 9.4 `pages/`

| 文件 | 行数 | 处理 |
|---|---|---|
| `pages/canvas/project.tsx` | 3,476 | 改（重点） |
| `pages/canvas/index.tsx` | 130 | 改 |
| `pages/canvas/hooks/use-agent-bridge.ts` | 98 | 删 |
| `pages/canvas/hooks/use-plugin-host.tsx` | 155 | 删 |
| `pages/video/index.tsx` | 802 | 改 |
| `pages/assets/index.tsx` + `asset-transfer.ts` | 565 + 73 | 保（数据源改后端） |
| `pages/config/index.tsx` | 19 | 改 |
| `pages/home/index.tsx` | 120 | 改（重写） |
| `pages/not-found/index.tsx` | 24 | 保 |
| `pages/image/index.tsx` | 902 | 删 |
| `pages/prompts/index.tsx` + `components/prompt-detail-dialog.tsx` | 87 + 47 | 删 |
| `pages/{admin,auth,projects}/`（空目录） | 0 | 删 |

### 9.5 `services/` / `stores/` / `lib/` / `types/` / `hooks/`

| 文件 | 行数 | 处理 |
|---|---|---|
| `services/file-storage.ts` | 88 | 改（去 proxy） |
| `services/image-storage.ts` | 278 | 改（去 image_generation_logs 遍历、去 proxy） |
| `services/local-storage-usage.ts` | 64 | 保（可选） |
| `services/localforage-storage.ts` → 实为 `lib/localforage-storage.ts` | 34 | 保 |
| `services/config-file.ts` | 37 | 二期 |
| `services/webdav-sync.ts` / `app-sync.ts` | 128 / 422 | 删 |
| `services/api/video.ts` | 441 | 改 |
| `services/api/image.ts` | 893 | 改（保 3 函数） |
| `services/api/model-plugin.ts` | 991 | 二期 |
| `services/api/audio.ts` | 157 | 删 |
| `services/api/prompts.ts` / `prompt-source-presets.ts` / `prompt-source-runtime.ts` | 226 / 38 / 119 | 删 |
| `services/api/canvas-agent.ts` | 139 | 删 |
| `services/api/local-proxy.ts` / `request.ts` | 12 / 15 | 删 |
| `stores/use-config-store.ts` | 507 | 改（大幅） |
| `stores/use-asset-store.ts` | 114 | 改（数据源后端） |
| `stores/use-theme-store.ts` | 19 | 保 |
| `stores/use-canvas-side-panel-store.ts` | 68 | 保 |
| `stores/canvas/use-canvas-store.ts` | 146 | 改（去 chatSessions 可选） |
| `stores/canvas/use-canvas-ui-store.ts` | 27 | 保 |
| `stores/canvas/use-plugin-store.ts` | 45 | 删 |
| `stores/use-agent-store.ts` / `use-agent-skill-store.ts` / `use-prompt-source-store.ts` / `use-workbench-agent-store.ts` / `use-user-store.ts` | 173/122/59/64/18 | 删 |
| `hooks/use-copy-text.ts` | 13 | 保 |
| `hooks/use-prompt-source-scheduler.ts` / `use-version-check.ts` | 40 / 92 | 删 |
| `lib/{analytics, audio-generation, release}.ts` | 84 / 61 / 24 | 删 |
| `lib/{app-theme, canvas-theme, image-reference-prompt, image-thumbnail, image-utils, keyboard-event, media-size, utils, zip}.ts` | 82/63/14/49/63/22/151/18/21 | 保 |
| `lib/agent/{agent-site-tools, agent-url-bootstrap}.ts` | 331 / 15 | 删 |
| `lib/canvas/{canvas-export, canvas-generation-helpers, canvas-node-factory, canvas-node-geometry, canvas-node-size, canvas-resource-references, canvas-video-frame, node-registry}.ts` | 89/192/71/176/16/147/51/61 | 保（factory/generation-helpers 去 audio） |
| `lib/canvas/{canvas-image-data}.ts` | 174 | 保/二期 |
| `lib/canvas/{canvas-agent-ops, canvas-event-bus, plugin-loader, plugin-node-context, plugin-registry, plugin-runtime}.ts` | 89/47/170/30/50/42 | 删 |
| `types/{canvas.ts, canvas-export.ts, image.ts, media.ts}` | 166/20/8/20 | 改 / 保 / 保 / 保 |
| `types/canvas-plugin.ts` | 147 | 裁 |

### 9.6 规模估算

| 指标 | 参考前端 | 裁剪后（估算） | 说明 |
|---|---|---|---|
| 文件数 | 174 | **≈104** | 删 66 + 二期 4 |
| 代码行数 | 33,854 | **≈20,350** | 纯删 10,759 + 二期 1,341 + 改造削减 ≈1,400 |
| 其中 `project.tsx` | 3,476 | ≈3,000 | 图片编辑 ≈2,100 行留二期可再降 |
| i18n 行数 | 1,332 | ≈900 | 删 agent/prompts/modelPlugin/webdav 等命名空间 |
| 页面数 | 8 | 4（canvas/video/assets/config）+ 首页/404 | 新增登录、任务中心、计费（参考项目无） |
| 需新增 | — | 登录鉴权、后端 API client、任务中心、计费/额度、管理后台 | 无参考实现 |

**建议执行顺序（每步独立 PR，均可 `tsc --noEmit` 通过）**
1. 删死代码 + 硬编码外链 + 统计/版本/GitHub + WebDAV/本地代理（低风险，≈1,500 行）。
2. 删提示词库全栈 + 改 3 个消费点（video 页、canvas 侧栏、home）。
3. 删 Agent 全栈 + 改 5 处入口（layout/top-nav/project/canvas-top-bar/use-workbench-agent-store）。
4. 删画布插件系统（保 `node-registry` + `builtin-nodes` + `types/canvas-plugin` 子集）。
5. 删生图工作台页面 + 音频（保 `requestGeneration/requestEdit/requestImageQuestion` 签名）。
6. 后端接入：重写 `video.ts`/`image.ts`，删 `model-plugin.ts`/`model-script-editor`/渠道编辑，改 `use-config-store`，迁移 localforage 旧数据。

---

## 附：裁剪过程的验证手段

以下命令均在 `web/` 目录执行：

- **类型完整性**：`bun run typecheck`（即 `tsc --noEmit`，`tsconfig` 为 `strict: true`）。
- **单测**：`bun test`（现有 3 个用例：`canvas-focus-viewport`、`image-thumbnail`、`model-selection`；后者直接构造 `channels` 结构，渠道改造后必须重写）。
- **残留引用扫描**：分别 grep 已删模块，例如 `services/api/prompts`、`services/api/audio`、`services/api/canvas-agent`、`services/api/model-plugin`、`use-agent-store`、`plugin-loader`、`webdav`、`analytics`。
- **残留外链扫描**：grep `basketikun`、`canvas.best`、`jsdelivr`、`googletagmanager`、`hm.baidu`（覆盖 `src`、`public`、`index.html`）。
- **i18n 缺失 key**：抽取 `src` 中所有 `t("...")` 的 key 集合，与 `i18n/locales/*.ts` 的 key 集合作差集（`tsc` 不会报 i18n key 错误）。
- **构建**：`bun run build`；注意 SPA history fallback——参考项目用 `vercel.json` / `nginx.conf` 兜底，新项目部署时需同步配置。

