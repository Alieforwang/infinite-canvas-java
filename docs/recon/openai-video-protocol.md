# OpenAI 兼容视频生成协议侦察报告

> 面向「视频生成平台」后端（Java 17 + Spring Boot + MySQL）的接口协议与技术要点。
> 目标：精确掌握上游「OpenAI 兼容」视频协议，作为**代理层、任务状态机、文件落盘、计费**的设计依据。
>
> - 文档版本：v1（2026-11-03）
> - 侦察范围：OpenAI 官方 Sora 风格 `/v1/videos` + 参考实现 `D:\software\desk\infinite-canvas`（只读）+ 主流聚合站/中转站公开文档
> - 标记约定：**✅ 已核实**（有官方/源码/文档原文）｜**⚠️ 待实测**（无权威来源或来源冲突，必须用真实 Key 打一次）｜**📌 推断**（由其它字段/倍率反推，需验证）

## 0. 三分钟结论

1. **官方 Sora 协议极简**：官方 OpenAI 视频接口的入参只有 `prompt`（必填）、`model`、`seconds`、`size`、`input_reference` **五个字段**；**没有** `image[]`、`first_frame`、`last_frame`、`generate_audio`、`watermark`、`mode`、`ratio` 这些字段。后者全部是聚合站/中转站的**私有扩展**（✅ 见 [openai-python video_create_params.py](https://github.com/openai/openai-python/blob/main/src/openai/types/video_create_params.py)）。
2. **真正的兼容风险不在"协议字段"，而在"方言"**：同样是「OpenAI 兼容视频」，市面上至少 4 种方言并存——① 官方 multipart `/v1/videos`；② 网关流（new-api 系）multipart `/v1/videos` 但状态词是 `processing/succeeded/failed`；③ JSON 信封流（`POST /v1/videos/generations` + `{code,data:[{task_id}]}`）；④ 完全私有 API（AtlasCloud `/api/v1/model/generateVideo`）。**后端必须做成"适配器 + 协议档位（profile）"而不是硬编码一套字段**。
3. **官方 Sora API 已被标注下线计划**：`openai-python` 主干所有 videos 方法都带 `deprecated("The Sora API is scheduled to permanently shut down on September 24, 2026.")`（✅ [resources/videos.py](https://github.com/openai/openai-python/blob/main/src/openai/resources/videos.py)）。这意味着平台**不能把产品能力绑死在官方 Sora 上**，聚合站与国产模型（veo/seedance/kling/wan/hailuo）才是长期主战场——这进一步要求协议层可插拔。
4. **后端绝不能透传上游 URL**：下载链接普遍短命（聚合站常见 1 小时～24 小时，官方对象有 `expires_at` 字段），必须"完成后立刻下载落盘 + 校验 + 生成自有 CDN 地址"。

---

## 1. 标准 OpenAI 视频 API（Sora 风格，2025 官方 `/v1/videos`）

> **来源与可信度说明**：`platform.openai.com` / `developers.openai.com` 对脚本抓取返回 403，本节内容以 **OpenAI 官方 SDK 生成的类型定义与资源代码**为准（SDK 由官方 OpenAPI spec 生成，属于一手权威源），并用第三方文档交叉验证。链接见每条末尾。
>
> 官方文档入口（浏览器可读）：
> - 创建：<https://platform.openai.com/docs/api-reference/videos/create>
> - 查询：<https://platform.openai.com/docs/api-reference/videos/retrieve>
> - 下载内容：<https://platform.openai.com/docs/api-reference/videos/download-content>
> - 新版文档站：<https://developers.openai.com/api/reference/resources/videos.md>

### 1.1 Endpoint 总表

| 方法 | 路径 | 用途 | 官方 SDK 是否标注弃用 |
|---|---|---|---|
| `POST` | `/v1/videos` | 创建视频任务（multipart/form-data） | 是（2026-09-24 下线计划） |
| `GET` | `/v1/videos/{video_id}` | 查询任务状态 / 取 Video 对象 | 是 |
| `GET` | `/v1/videos` | 列表（`after`/`limit`/`order=asc\|desc`，游标分页） | 是 |
| `GET` | `/v1/videos/{video_id}/content` | 下载视频字节（`variant=video\|thumbnail\|spritesheet`） | 是 |
| `DELETE` | `/v1/videos/{video_id}` | 删除已完成/失败任务及其资产 | 是 |
| `POST` | `/v1/videos/{video_id}/remix` | 用新 prompt 重混 | 是 |
| `POST` | `/v1/videos/edits` | 基于已有视频编辑（`prompt` + `video`） | 是 |
| `POST` | `/v1/videos/extensions` | 延长视频（`prompt` + `seconds` + `video`） | 是 |
| `POST` | `/v1/videos/characters` | 上传角色视频创建 character | 是 |
| `GET` | `/v1/videos/characters/{id}` | 查询 character | 是 |

✅ 依据：[openai-python resources/videos.py](https://github.com/openai/openai-python/blob/main/src/openai/resources/videos.py)（create/retrieve/list/delete/download_content/edit/extend/remix/create_character）。

**最小可用集只有 3 个**：`POST /videos`、`GET /videos/{id}`、`GET /videos/{id}/content`。这是后端第一版必须吃下的协议。

### 1.2 创建任务：`POST /v1/videos`（multipart/form-data）

#### 字段（官方全集，仅 5 个）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `prompt` | string | **是** | 文本描述 |
| `model` | string | 否 | `sora-2` \| `sora-2-pro`，默认 `sora-2` |
| `seconds` | string | 否 | **字符串枚举** `"4"` \| `"8"` \| `"12"`，默认 4 |
| `size` | string | 否 | **枚举** `720x1280` \| `1280x720` \| `1024x1792` \| `1792x1024`，默认 `720x1280` |
| `input_reference` | file **或** object | 否 | 参考图。文件走 multipart；对象形式 `{file_id}` / `{image_url}`（URL 或 base64 data URL） |

✅ 依据：
- [video_create_params.py](https://github.com/openai/openai-python/blob/main/src/openai/types/video_create_params.py)（`prompt` Required，其余 optional；`seconds` 允许值 4/8/12；`size` 允许值四选一；`InputReference = FileTypes | ImageInputReferenceParam`）
- [video_seconds.py](https://github.com/openai/openai-python/blob/main/src/openai/types/video_seconds.py)、[video_size.py](https://github.com/openai/openai-python/blob/main/src/openai/types/video_size.py)、[image_input_reference_param.py](https://github.com/openai/openai-python/blob/main/src/openai/types/image_input_reference_param.py)
- 官方 SDK 在 `create()` 中显式设置 `Content-Type: multipart/form-data`，并把 `input_reference` 作为文件字段提取（`extract_files(paths=[["input_reference"]])`）——✅ 说明**官方创建接口就是 multipart，不是 JSON**。

> ⚠️ 注意：官方**不支持多参考图、首尾帧、`ratio`、`resolution`、`generate_audio`、`watermark`、`negative_prompt`、`seed`、`callback_url`**。任何文档里出现这些字段，都是第三方网关的扩展（见第 3 节）。`sora-2-pro` 才支持 `1024x1792` / `1792x1024`（第三方速查表同口径，⚠️ 需实测确认 model 与 size 的绑定关系是否强校验）。

#### 请求示例（官方形态）

```bash
# 文生视频
curl -X POST https://api.openai.com/v1/videos \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F "model=sora-2" \
  -F "prompt=A calico cat playing a piano on a stage, cinematic lighting" \
  -F "seconds=8" \
  -F "size=1280x720"

# 图生视频（参考图必须与 size 一致）
curl -X POST https://api.openai.com/v1/videos \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F "model=sora-2-pro" \
  -F "prompt=The cat slowly turns its head toward the camera" \
  -F "seconds=4" \
  -F "size=1024x1792" \
  -F "input_reference=@first_frame.png"
```

> 官方要求 `input_reference` 的宽高比与目标 `size` 匹配（社区速查表同样口径："Input reference should match the target size"，⚠️ 官方原文抓取受限，属**强校验待实测**项）。支持 jpg/png/webp（第三方速查表口径，⚠️ 待实测）。

#### 返回 JSON（Video 对象）

```json
{
  "id": "video_1234567890",
  "object": "video",
  "model": "sora-2",
  "status": "queued",
  "progress": 0,
  "created_at": 1762000000,
  "completed_at": null,
  "expires_at": null,
  "prompt": "A calico cat playing a piano on a stage, cinematic lighting",
  "seconds": "8",
  "size": "1280x720",
  "remixed_from_video_id": null,
  "error": null
}
```

字段全集（✅ [video.py](https://github.com/openai/openai-python/blob/main/src/openai/types/video.py)）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 任务 ID（后续查询/下载的唯一凭据） |
| `object` | `"video"` | 固定值 |
| `model` | string | 实际使用的模型 |
| `status` | enum | `queued` \| `in_progress` \| `completed` \| `failed` |
| `progress` | int | 0–100 的近似进度 |
| `created_at` | int | Unix 秒 |
| `completed_at` | int \| null | 完成时间 |
| `expires_at` | int \| null | **可下载资产到期时间**（做落盘调度的关键字段） |
| `prompt` | string \| null | 回显 prompt |
| `seconds` | string \| 枚举 | 成片时长；扩展（extend）时为拼接后总时长 |
| `size` | string | 分辨率 |
| `remixed_from_video_id` | string \| null | remix 来源 |
| `error` | object \| null | 失败原因，见 1.7 |

HTTP 状态码：`200`/`201` 都可能出现（官方 SDK 不校验具体值；new-api 文档写 `201 Created`）。**后端按 2xx 判定成功，不要写死 200**。

### 1.3 状态枚举与语义

```
create → queued → in_progress → completed
                        └──────→ failed
```

| 状态 | 语义 | 后端动作 |
|---|---|---|
| `queued` | 已受理，排队等算力 | 继续轮询 |
| `in_progress` | 渲染中（`progress` 递增） | 继续轮询 |
| `completed` | 成功，可下载 | 下载落盘 → 结算 |
| `failed` | 失败（含内容风控） | 读 `error` → 退款 → 终态 |

⚠️ **没有官方 `cancelled` 状态**。但参考实现与多个聚合站都按 `failed | cancelled` 处理终态（见 2.4、第 3 节），所以后端状态机必须把 `cancelled` 当作兼容输入。`expired`/`succeeded`/`success`/`processing`/`pending`/`submitted` 也都在真实站点出现过（第 3 节表格）。

### 1.4 查询：`GET /v1/videos/{video_id}`

```bash
curl https://api.openai.com/v1/videos/video_1234567890 \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

返回同一个 Video 对象（1.2）。轮询建议：

- 官方 SDK 的 `poll()` 读取响应头 **`openai-poll-after-ms`** 作为建议间隔，缺省 **1000ms**，并发送 `X-Stainless-Poll-Helper: true`（✅ [resources/videos.py](https://github.com/openai/openai-python/blob/main/src/openai/resources/videos.py) 中 `poll()` 实现）。
- 社区/聚合站实践建议 **10–20 秒**一次（⚠️ [Sora 速查](https://github.com/davila7/claude-code-templates/blob/e9313e608066c3170d101caa4a689c8b58b0a12a/cli-tool/components/skills/video/sora/references/video-api.md)），RouteAPI 文档建议 **10–15 秒**（✅ 见 3.5）。
- **后端采用：3s → 5s → 8s → 12s → 20s 指数退避 + ±20% 抖动，上限 20s；总超时 15–30 分钟**（视频常见 1–5 分钟，长片/高峰期更久）。
- 官方 SDK 支持 poll 建议头，但**不要依赖**：多数聚合站不返回该头。

### 1.5 下载内容：`GET /v1/videos/{video_id}/content`

```bash
curl -L https://api.openai.com/v1/videos/video_1234567890/content \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Accept: application/binary" \
  -o output.mp4
```

- 官方 SDK 会显式发送 `Accept: application/binary`（✅ [resources/videos.py](https://github.com/openai/openai-python/blob/main/src/openai/resources/videos.py) `download_content`），并支持 query `variant=video|thumbnail|spritesheet`（默认 mp4）。
- 响应是**二进制流**，`Content-Type` 通常为 `video/mp4`；缩略图为 `image/webp`，雪碧图为 `image/jpeg`（⚠️ 具体 MIME 待实测，官方文档对 `variant` 的 MIME 描述不完整）。
- 聚合站常见 `Content-Length` + `Content-Disposition`（✅ new-api 文档明确列出这两个响应头）。

**必须做的二进制校验**（参考实现已踩坑）：

1. `Content-Type` 含 `json` → 说明错误被 200 包装成 JSON，读出 `{message|msg|error.message}` 抛业务错误；
2. `Content-Type` 不是 `video/*` 且不是 `application/octet-stream` → 拒绝；
3. 校验前 12 字节 magic：mp4 的 `ftyp` box（偏移 4 处 `66 74 79 70`），webm 的 `1A 45 DF A3`；
4. 校验大小 > 0 且 ≤ 平台上限（建议单文件 200–500MB，可配置）。

### 1.6 鉴权

- 官方：`Authorization: Bearer <API_KEY>`，SDK 里 `security={"bearer_auth": True}`（✅ 同上）。无额外 header、无签名、无时间戳。
- 官方文档站/控制台 API Key 以 `sk-` 开头；聚合站多为 `sk-` 或 `sk-` 变体（88api 文档明确 `sk-` 开头，`rat_` 开头的是管理密钥不能调模型 —— ✅ [88API](https://88api.ai/zh/docs/api/video/video-api-standard/)）。
- ⚠️ 少数站点用 `api-key: <key>`（Azure 风格）或 `x-api-key`，本报告未找到权威证据，**列为待实测项**（第 6 节 R6）。

### 1.7 错误格式

**HTTP 层错误（非 2xx）**：标准 OpenAI ErrorResponse。

```json
{
  "error": {
    "message": "Invalid value for 'size': must be one of 1280x720, 720x1280, 1024x1792, 1792x1024.",
    "type": "invalid_request_error",
    "param": "size",
    "code": "invalid_value"
  }
}
```

- `error.message` / `error.type` / `error.param` / `error.code` 是标准四件套；`type` 常见 `invalid_request_error`、`server_error`、`rate_limit_error`、`authentication_error`。✅ 参考 new-api 文档（其错误体与此一致：[OpenAI Video Format](https://github.com/QuantumNous/new-api-docs/blob/main/docs/en/api/openai-video.md)）。
- 部分 4xx 响应体可能是 **`text/plain` 包裹的 JSON 字符串**（官方 spec 中 401/403 有 `text/plain` 分支，⚠️ 视频端点是否如此待实测）。**解析时先按 JSON 解，失败再当纯文本**。

**任务内错误（HTTP 200，`status=failed`）**：`error` 是结构化对象，比标准错误体更丰富：

```json
{
  "status": "failed",
  "error": {
    "code": "moderation_blocked",
    "message": "Your request was blocked by our moderation system.",
    "param": null,
    "type": "invalid_request_error",
    "headers": { "Retry-After": "20" },
    "misalignment": null
  }
}
```

✅ 字段依据 [video_create_error.py](https://github.com/openai/openai-python/blob/main/src/openai/types/video_create_error.py)：`code`（必填）、`message`（必填）、`headers`（原始错误里的 Retry-After/Retry-After-Ms）、`misalignment`（内容审查相关：`detailed_explanation` / `error_type` / `review_target` / `steer`）、`param`、`type`。

> 设计含义：**"失败"是一条 200 响应里的业务状态，不是 HTTP 错误**。后端解析必须同时覆盖「HTTP 错误」和「HTTP 200 + failed」两条路径，否则会漏掉扣费/退款。

### 1.8 常见限制（官方口径 + 交叉验证）

| 项 | 值 | 可信度 |
|---|---|---|
| 时长 | `"4"` / `"8"` / `"12"`（字符串）；extensions 支持 4/8/12/16/20 | ✅ SDK 类型 |
| 尺寸 | `720x1280`、`1280x720`、`1024x1792`、`1792x1024` | ✅ SDK 类型 |
| 模型与尺寸绑定 | `sora-2` 仅 720p 档；`sora-2-pro` 支持 1792 档 | ⚠️ 第三方速查表口径，待实测 |
| 参考图 | 1 张，jpg/png/webp，需与 `size` 匹配 | ⚠️ 待实测（官方文档抓取 403） |
| 提示词长度 | 无官方公开上限；社区经验 ~500 字符内更稳 | ⚠️ 待实测 |
| 任务保留/下载有效期 | 对象含 `expires_at`；社区口径"下载 URL 约 1 小时后过期" | ⚠️ **必须实测**：官方未公开固定保留期，聚合站差异极大（24h / 7天 / 1h） |
| 轮询建议 | 建议头 `openai-poll-after-ms`（缺省 1000ms）；实践 10–20s | ✅ 源码 / ⚠️ 实践值 |
| 内容风控 | 仅适合未成年人内容；禁止版权角色/版权音乐；禁止真实人物（含公众人物）；**输入含人脸的图片当前会被拒绝** | ⚠️ 第三方速查表，需实测（这条直接影响"数字人/换脸"类产品需求） |
| API 生命周期 | Sora API 计划 **2026-09-24 永久关停** | ✅ 官方 SDK `@deprecated` 注解 |

`expires_at` 的工程含义：**创建成功后就要把"到期时间"写进任务表**，并在到期前完成下载；不能等用户来点播放。

---

## 2. 参考实现映射（`infinite-canvas`，只读分析）

路径前缀：`D:\software\desk\infinite-canvas\web\src\`。前端是**浏览器直连上游**（本地优先、无后端），所以它解决的是"CORS + 多供应商字段差异 + 轮询"，没有解决"密钥保护、落盘、计费、幂等"——这正是我们要补的部分。

### 2.1 URL 拼接：`buildApiUrl` 到底加不加 `/v1`？

`stores/use-config-store.ts:487-492`：

```ts
export function buildApiUrl(baseUrl: string, path: string) {
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return withLocalProxy(`${apiBaseUrl}${path}`);
}
```

结论：**智能补 `/v1`**——baseUrl 已以 `/v1` 结尾则不加，否则加。因此 `video.ts` 里传的是**不带 `/v1` 的路径**：

- 创建：`aiApiUrl(config, "/videos")` → `video.ts:185`
- 查询：`aiApiUrl(config, `/videos/${task.id}`)` → `video.ts:195`
- 下载：`aiApiUrl(config, `/videos/${task.id}/content`)` → `video.ts:199`
- URL 组装入口 `aiApiUrl` → `video.ts:35-37`

最终实际请求：

| 管理员填的 Base URL | 实际创建地址 |
|---|---|
| `https://api.openai.com` | `https://api.openai.com/v1/videos` ✅ |
| `https://api.openai.com/v1` | `https://api.openai.com/v1/videos` ✅（不重复） |
| `https://api.openai.com/v1/videos` | `https://api.openai.com/v1/videos/v1/videos` ❌ |

⚠️ **易错点**：如果管理员把「完整 endpoint」粘进 Base URL，就会双 `/v1`。后端配置项应做**规范化 + 校验**（拒绝 path 已含 `/videos` 的值），并在保存时给出明确提示。同类规范化代码：`use-config-store.ts:375-383`（`normalizeImportedBaseUrl` / `stripTrailingApiVersion`）。

**两套 URL 逻辑并存（关键差异）**：

1. `video.ts` 走 `buildApiUrl`（补 `/v1`）；
2. `model-plugin.ts` 的 OpenAI 视频脚本模板里，是**手写** `` `${baseUrl}/v1/videos` ``（`model-plugin.ts:511`、`model-plugin.ts:520`、`model-plugin.ts:532`），而 `request()` 对绝对 URL 只做代理包装、不再补 `/v1`（`model-plugin.ts:42-45` `pluginUrl`，正则 `/^https?:/i`）。

→ 同一份配置，**内置调用链与脚本模板的行为不一致**：脚本模板要求 baseUrl **不带** `/v1`。这是参考实现的已知坑；后端不要照抄脚本模板的写法。

### 2.2 multipart 字段（内置 OpenAI 分支）

`video.ts:149-191`（`createOpenAIVideoTask`），字段逐个 append：

| 字段 | 来源 / 值 | 行号 |
|---|---|---|
| `model` | `modelOptionName(model)`（剥掉 `channelId::` 前缀） | 156 |
| `prompt` | 用户输入 | 157 |
| `seconds` | `clampVideoSeconds` → 4–30 的整数字符串 | 158 |
| `size` | `normalizeVideoSize(size, quality)`，缺省 `1280x720` | 159 |
| `ratio` | `inferVideoRatio`，`auto` 时不发 | 160-162 |
| `resolution_name` | `normalizeVideoResolution`（`low→480p`，`auto/high/medium→720p`，其余 `${n}p`） | 163 |
| `generate_audio` | `"true"/"false"` 字符串 | 164 |
| `watermark` | `"true"/"false"` 字符串 | 165 |
| `mode` | `frames` \| `reference` | 166 |
| `first_frame` | `frames` 模式，`images[0]`（同时再 append 一份到 `images`） | 167-171 |
| `last_frame` | `frames` 模式，`images[1]`（同时再 append 一份到 `images`） | 172-175 |
| `image[]` | `reference` 模式，**每张图一次 append**（多值字段） | 177-181 |
| `images` | 与 `image[]` **双写**（兼容只认 `images` 的上游） | 170/174/179 |
| `video[]` | 参考视频（多值） | 182 |
| `audio[]` | 参考音频（多值） | 183 |

模式判定 `video.ts:325-328`：

```ts
function resolveVideoMode(mode: string | undefined, imageCount: number) {
    if (mode === "reference" || imageCount > 2) return "reference";
    return "frames";
}
```

→ 图 > 2 张时强制 `reference`；其余默认 `frames`（首尾帧）。

**Controller 侧未做的两件事（后端必须做）**：

- 未设置 `Content-Type`：`aiHeaders`（`video.ts:39-44`）只加 `Authorization`，让浏览器自动生成 boundary。这在浏览器里对，但在 **Java/OkHttp/RestTemplate 里必须显式 `multipart/form-data` 并交给框架生成 boundary**（不要手写；`HttpEntity<MultiValueMap>` + `MediaType.MULTIPART_FORM_DATA` 即可）。
- 没有 `Idempotency-Key` / `request_id`，重试即重复下单（见 4.4）。

脚本模板（`model-plugin.ts:435-556`，`openai` 视频模板）字段更少，只有：`model`、`prompt`、`seconds`、`size`、`resolution_name`、`generate_audio`、`watermark`、`mode`、`first_frame`/`last_frame`（frames）或 `image[]`（reference）、`video[]`、`audio[]`（`model-plugin.ts:478-504`）。**注意它没有双写 `images`，也不发 `ratio`**——这就是"两套实现不一致"的第二个证据。

### 2.3 轮询：间隔与上限

| 实现 | 间隔 | 上限 | 位置 |
|---|---|---|---|
| 内置 `waitForVideoGenerationTask` | **2500ms** | **120 次 = 300s** | `video.ts:50-60`（`for attempt < 120`；`delay(2500)` 在 57 行） |
| 脚本模板 `poll` | `intervalMs: 2500` | `timeoutMs: 300000` | `model-plugin.ts:540`；默认值 `model-plugin.ts:94-97` |
| 可中止 | `AbortSignal` 支持（`delay` 内监听 abort） | — | `video.ts:425-440` |

**300 秒总超时对真实视频偏短**：官方/聚合站生成常 1–5 分钟，高峰期更久；RouteAPI 平台侧任务超时是 24 小时（✅ 3.5）。后端建议 **15–30 分钟** + 分级退避，并把"超时"定义成**可重试的失败**而非终态失败（先查一次上游最终状态再判死）。

### 2.4 响应包装与错误解析

**信封解包** `video.ts:345-357`（`unwrapEnvelope`）：

```ts
if (typeof payload === "object" && "code" in payload && payload.code !== undefined) {
    if (payload.code !== 0 && payload.code !== "0") throw new Error(readApiErrorMessage(payload) || ...);
    if (!payload.data) throw new Error(emptyMessage);
    return payload.data;
}
return payload as T;
```

→ 兼容两种上游：**裸 Video 对象** 与 **`{code:0, data:{...}}` 信封**（`code` 支持 number 和 string `"0"`）。创建时若解包后无 `id` 直接报"无任务 ID"（`video.ts:186`）。

**错误消息优先级** `video.ts:363-390`（`readApiErrorMessage`，递归实现）：`msg` → `message` → `error`（string 或 `error.message`）→ `detail`；并且：

- 值是 JSON 字符串 → 递归解析（`video.ts:365-374`）；
- 值是 HTML 字符串 → 折叠成"HTML 错误页"提示（`video.ts:372`）；
- `error` 既可能是 string 也可能是 object（`video.ts:379-382`）。

**axios 错误映射** `video.ts:392-407`：`ERR_NETWORK` → 网络错误；`401/403` → 鉴权失败；`429` → 限流；其余带状态码拼接。

这套"多层兜底"是实战教训的沉淀，后端建议照搬语义（但用 Jackson 安全解析 + 深度/长度上限防 DoS）。

### 2.5 结果 URL 字段优先级 + content 下载 + 二进制校验

**URL 优先级** `video.ts:359-361`：

```ts
return [payload.video_url, payload.result_url, payload.url, payload.content?.video_url, payload.content?.url]
    .find((url) => typeof url === "string" && (isPublicMediaUrl(url) || /\.mp4(\?|#|$)/i.test(url)));
```

即：`video_url` → `result_url` → `url` → `content.video_url` → `content.url`，且必须 `http(s)://` 或形如 `.mp4`。类型定义见 `video.ts:14`（`VideoResponse`）。

**完成判定顺序**（`pollOpenAIVideoTask`，`video.ts:193-208`）——注意这里有一个反直觉的设计：

1. **先看有没有结果 URL**：有 → 直接下载（`videoResultFromUrl`）→ 完成；
2. 没有 URL 且 `status === "completed"` → 调 `/content` 取 blob，校验后完成（`video.ts:198-201`）；
3. `status === "failed" || "cancelled"` → 失败，错误取 `error.message`（`video.ts:203`）；
4. 其它 → `pending`。

→ 这意味着**即使 status 还没到 completed，只要上游提前给了 URL 就算完成**。这对某些聚合站（完成前就下发 `video_url`）有用，但后端要更严格：**必须有 URL 或 completed 才算成功，且 URL 下载失败要能回退到 `/content`**。

**URL 下载容错** `video.ts:210-219`：`withLocalProxy(url)` 下载 blob；成功则返回 blob；**下载失败（非用户取消）时降级为返回 URL**（`{url, mimeType:"video/mp4"}`）——因为没有后端，URL 失效是必然的，这是纯前端的妥协。**后端不要这么做**，见 4.5。

**二进制校验** `video.ts:409-419`（`assertVideoBlob`）：

```ts
if (!blob.type.includes("json")) return;   // 不是 json 就放行
// 是 json：解析出 {code,msg,error.message}，有业务错误就抛异常
```

→ 只做了"JSON 伪装成视频"的检测，**没有校验 magic bytes / 大小 / MIME 白名单**。`videoResultFromUrl` 里也是 `assertVideoBlob` 后直接当 blob 返回（`video.ts:212-214`）。后端要补全（1.5 的四步校验）。

**落盘策略** `video.ts:137-147`（`storeGeneratedVideo`）：有 blob → `uploadMediaFile`；否则尝试把 URL **抓下来再上传**；再失败才退化成"直接存 URL、bytes=0"。这是"本地优先、无后端"下的最优解，也印证了**"必须落盘"是刚性需求**。

### 2.6 Gemini 格式 vs OpenAI 格式的分支

分支入口 `video.ts:72-91`：`resolveModelScript`（有自定义脚本优先）→ `apiFormat === "gemini"` → Gemini；否则 OpenAI。

| 维度 | OpenAI 分支 | Gemini 分支（Veo `predictLongRunning`） |
|---|---|---|
| 创建 URL | `{base}/v1/videos`（`buildApiUrl`） | `{base}/v1beta/models/{model}:predictLongRunning`（`video.ts:279-281`） |
| Base URL 规范化 | 补 `/v1` | **补 `/v1beta`**（已以 `/v1` 或 `/v1beta` 结尾则不加，`video.ts:273-277`） |
| 鉴权 | `Authorization: Bearer` | **`x-goog-api-key`**（`video.ts:287-289`） |
| 请求体 | multipart | JSON `{instances:[...], parameters:{...}}`（`video.ts:236-245`） |
| 首尾帧 | `first_frame` / `last_frame` | `image` / `lastFrame`（`video.ts:227-229`） |
| 多参考图 | `image[]` | `referenceImages:[{image, referenceType:"asset"}]`（`video.ts:230-232`） |
| 参考视频/音频 | `video[]` / `audio[]` 文件 | inline base64（`video.ts:233-234`） |
| 任务 ID | `id`（video_xxx） | `name`（`operations/...`，`video.ts:246`） |
| 查询 | `GET /v1/videos/{id}` | `GET {base}/v1beta/{operationName}`（`video.ts:283-285`） |
| 完成判定 | `status === completed` + URL/content | `done === true`（`video.ts:257`） |
| 结果 | `video_url`/`content` 下载 | `response.generateVideoResponse.generatedSamples[0].video.uri`（`video.ts:258`） |
| 下载鉴权 | Bearer | **URL 追加 `?key=<apiKey>`**（`video.ts:260`） |

> 结论：Gemini 分支是**完全不同的一套协议**，只是被同一个 `AiConfig` 承载（`apiFormat` 字段，`use-config-store.ts:8`、`27-59`、`479-481`）。平台第一版建议**只做 OpenAI 档位**，把 Gemini 作为第二个适配器排期（4.9 的 profile 设计已预留）。

### 2.7 配置模型（后端表结构的参考）

`stores/use-config-store.ts`：

- `ApiCallFormat = "openai" | "gemini"`（`:8`）——**协议档位的雏形**；
- `ModelChannel`：`{ id, name, baseUrl, apiKey, apiFormat, models[] }`（`:18-25`）——**一个渠道 = 一套 Base URL + Key + 协议**；
- `ChannelModel`：`{ name, capability, script? }`（`:12-16`）——模型级可覆盖脚本（等价于"自定义适配器"）；
- 模型值编码 `channelId::model`（`encodeChannelModel`，`:390-406`），`resolveModelRequestConfig` 按 `::` 反查渠道（`:438-447`）；
- 默认 baseUrl `https://api.openai.com`（`:77`）、Gemini `https://generativelanguage.googleapis.com`（`:78`）。

→ 后端直接映射为 `provider_channel`（base_url, api_key_cipher, protocol, extra_headers, timeout_profile）+ `provider_model`（model_name, capability, price_rule, profile_override）。**模型名必须挂在渠道下**，不能全局唯一——不同聚合站的同名模型能力和价格完全不同。

### 2.8 媒体参数归一化（可直接借鉴的领域规则）

`lib/media-size.ts`：

- `VIDEO_SECONDS_MIN = 4`、`VIDEO_SECONDS_MAX = 30`，`clampVideoSeconds` 取整并夹逼；
- `videoRatioOptions`：`1:1 / 3:4 / 4:3 / 16:9 / 9:16 / 21:9 / auto`；
- `inferVideoRatio(size)`：从像素尺寸反推最接近的比例；
- `computeVideoSize(resolution, ratio)`：由 `720p` + `16:9` 算出 `1280x720`，**宽高都做偶数对齐**（`evenRound`）。

→ 后端要维护一份"**模型能力表**"：该模型支持的 `seconds` 枚举、`size`/`ratio` 枚举、是否支持参考图/首尾帧/音频。参考实现是把这些**硬编码成通用值再尽量兼容**，后端必须反过来：**能力表驱动，不支持的组合在创建前就拒绝**（否则上游 400，还白扣一次预授权）。

---

## 3. 聚合站 / 中转站兼容性差异（重点）

> 结论先行：**「OpenAI 兼容」只是"长得像"，不是"协议一致"**。差异集中在 6 个维度：Base URL 是否含 `/v1`、创建路径、同步/异步、状态词表、结果 URL 字段、错误信封。下面每个站点都给出真实文档依据；查不到的一律标 ⚠️。

### 3.1 差异对照总表

| 站点 | Base URL | 创建路径 | 请求编码 | 查询路径 | 状态词 | 结果字段 | 参考图能力 | 特有坑 |
|---|---|---|---|---|---|---|---|---|
| **OpenAI 官方** ✅ | `https://api.openai.com`（+`/v1`） | `/v1/videos` | multipart | `/v1/videos/{id}` | `queued/in_progress/completed/failed` | 无 URL，必须 `/content` 下载 | 1 张 `input_reference` | SDK 标注 2026-09-24 下线 |
| **new-api 系**（大量中转站底座）✅ | 站点域名 | `/v1/videos` | multipart | `/v1/videos/{id}` | `processing/succeeded/failed` | `url` | `input_reference` | 状态词与官方不一致 |
| **88API** ✅ | `https://api.88api.ai` | `/v1/videos` | **JSON** | `/v1/videos/{id}` | 见 3.4 ⚠️ | `url`/`video_url`/`result_url` | `images[]`（URL 数组）、`metadata.firstFrame/lastFrame`、`metadata.referenceVideos/Audios` | `/content` 只是"归档视频兼容跳转"；本地文件要先申请 `/v1/media/uploads` 再 PUT |
| **APIMart** ✅ | `https://api.apimart.ai` | **`/v1/videos/generations`** | JSON | ⚠️ 待实测（文档索引未展开） | `pending/processing/completed/failed` | 文档 24h 有效链接 | `image_urls[]`（URL，≤10MB） | 响应是 `{code, data:[{status:"submitted", task_id}]}`；402 余额不足 |
| **Infistar（无限星河）** ✅ | 站点域名 | `/v1/videos` | multipart | `/v1/videos/{id}` | **官方 4 态**（`queued/in_progress/completed/failed`） | `metadata.url` | `input_reference` | 结果 URL 在 `metadata.url`，不在顶层 |
| **RouteAPI** ✅ | `https://api.routeapi.ai` | `/v1/video/generations`（任务方言）**或** `/v1/videos`（OpenAI 方言） | JSON 或 multipart | `/v1/videos/{id}` | `queued/in_progress/completed/failed` | `metadata.url` + `/content` | `input_reference`（Sora/Wan 适配器） | **双方言并存**；错误体也两套；计费倍率透出在 header |
| **AtlasCloud** ✅ | `https://api.atlascloud.ai` | **`/api/v1/model/generateVideo`** | JSON | **`/api/v1/model/prediction/{id}`** | `completed/succeeded/failed/timeout` | `data.outputs[0]` | 模型 schema 决定 | **不是 OpenAI 协议**，必须专用适配器 |
| **LiteLLM Proxy** ✅ | 自建 `:4000` | `/v1/videos`（**也支持无 `/v1`**） | JSON 或 multipart | `/v1/videos/{id}` | 透传上游 | 透传 | 视上游 | 也可用 `x-litellm-api-key` 鉴权 |

### 3.2 new-api 系：最像官方、但状态词不一样

new-api 是开源的 OpenAI 兼容网关，**大量"中转站/聚合站"是它的二次开发**，因此它的口径极具代表性（✅ [new-api 文档：OpenAI Video Format](https://github.com/QuantumNous/new-api-docs/blob/main/docs/en/api/openai-video.md)）：

- 创建：`POST /v1/videos`，**multipart**，字段 `prompt`（必填）、`model`（默认 `sora-2`）、`seconds`（默认 4）、`size`（默认 720x1280）、`input_reference`（文件，"输入图片必须与 size 的宽高匹配"）、`metadata`（**JSON 字符串**，用于透传非 Sora 模型私有参数）。
- 创建响应：`{id, object:"video", model, created_at, status:"processing", progress:0}`，HTTP **201**。
- 查询响应：`{id, object, model, created_at, status:"succeeded", progress:100, expires_at, size, seconds, quality, remixed_from_video_id, error, url?}`。
- 状态词：**`processing` / `succeeded` / `failed`**（另有 `queued` 语义待实测）。
- 下载：`GET /v1/videos/{id}/content`，返回 `video/mp4` 流，带 `Content-Length` / `Content-Disposition`。
- 错误：标准 `{error:{message,type}}`，`type` 为 `invalid_request_error` / `server_error`。
- `metadata` 的玩法（**重要**）：非 Sora 模型（万相 2.5、Kling、即梦、Vidu）通过 `metadata` 透传私有参数，如 `{"img_url":"https://...","watermark":false,"prompt_extend":true}`；万相首尾帧用 `metadata.first_frame_url` / `metadata.last_frame_url`。

→ **状态词映射是后端第一优先级兼容点**：`processing≈in_progress`、`succeeded≈completed`、`submitted≈queued`。任何"只认官方 4 态"的实现都会在 90% 的中转站上把"成功"判成"未知"。

### 3.3 88API：JSON 而非 multipart，参考图传 URL

✅ [88API 视频 API 完整调用规范](https://88api.ai/zh/docs/api/video/video-api-standard/)（2026-10-10 更新）：

- **统一入口**：`GET /v1/models` 取真实 model id → `POST /v1/videos` → `GET /v1/videos/{id}` → 用返回的 `url`/`video_url`/`result_url` 下载。
- **请求是 JSON**（`Content-Type: application/json`），不是 multipart：

```bash
curl -X POST https://api.88api.ai/v1/videos \
  -H "Authorization: Bearer sk-xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"<MODEL_ID>","prompt":"雨夜城市中的银色跑车，低机位跟拍","duration":8,"ratio":"16:9"}'
```

- 字段：`model`、`prompt`、`negative_prompt`、`duration`(int) **或** `seconds`(string)、`ratio`/`aspect_ratio`、`size`（兼容字段，新接入别用）、`resolution`（`480p/720p/1080p/4k`）、`image`/`images[]`、`video`/`videos[]`、`seed`、`generateAudio`/`generate_audio`、`metadata`（`referenceVideos` / `referenceAudios` / `firstFrame` / `lastFrame`）。
- 明确说：**新接入不要用旧 `/v1/video/generations`，不要依赖 `task_id`，不要传 `callback_url`**；所有视频模型都靠轮询。
- **`/v1/videos/{id}/content` 只是"已归档视频的兼容跳转"，不是通用下载方式**——必须用结果 URL。
- 本地素材：先 `POST /v1/media/uploads` 拿 `upload_url` + `X-Media-Upload-Token`，再 `PUT` 原始二进制（**不是 multipart、不是 base64**），拿到的 `url` 有效期 30 天；引用时该 URL 必须在生成期间有效（建议 ≥60 分钟）。
- 分辨率策略：部分模型"分辨率写死在模型 ID 里"，`resolution` 不能越权；不支持组合返回 `400`。
- 素材 URL 硬性要求：公网 HTTPS、匿名可下、不能 `localhost`/私网/Docker 服务名、不能依赖 Cookie/Referer、视频 ≤50MB、音频 ≤15MB。
- 错误：标准 `{error:{code,message,type}}`，`type` 有 `authentication_error` / `payment_required` / `permission_error` / `rate_limit_error` / `bad_gateway`。
- 状态词：⚠️ 本次抓取页面在"提交/查询响应示例"处截断，未拿到完整枚举；从上下文推断为 `pending/processing/completed/failed` 一系，**待实测**。

### 3.4 APIMart：路径与信封都不同

✅ [APIMart Sora2 视频生成文档](https://docs.apimart.ai/cn/api-reference/videos/sora2/generation)（本机网络直连 `docs.apimart.ai` 不通，经官方镜像 `docs.apib.ai` 的 `.md` 版本读取；同源内容）：

```bash
curl -X POST https://api.apimart.ai/v1/videos/generations \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"model":"sora-2","prompt":"A waterfall ...","duration":5,"aspect_ratio":"16:9","image_urls":["https://example.com/image.png"]}'
```

- **创建路径是 `/v1/videos/generations`**（不是 `/v1/videos`），**JSON 入参**。
- 提交响应：

```json
{ "code": 200, "data": [ { "status": "submitted", "task_id": "task_01K8SGYNNNVBQTXNR4MM964S7K" } ] }
```

→ **`data` 是数组**！这跟参考实现的 `unwrapEnvelope`（假设 `data` 是对象）不兼容，必须单独处理。
- 任务态对象字段：`created`、`id`、`model`、`object:"video.generation.task"`、`progress`、`status`、`task_info{can_cancel, estimated_time, type}`、`usage{total_tokens}`。
- 状态词：**`pending` / `processing` / `completed` / `failed`**（无 `queued`、无 `in_progress`）。
- 结果链接：**生成后 24 小时有效**，要求"及时保存"。
- 错误：`{error:{code,message,type}}`，含 **402 `payment_required`**（余额不足）、`rate_limit_error`、`bad_gateway`。`402` 是官方协议里没有的，**计费链路必须显式处理**。
- 参考图：`image_urls[]`，公网 URL，≤10MB，jpeg/jpg/png/webp。
- ⚠️ 待实测：是否**同时**支持 OpenAI 原生 `/v1/videos` multipart（文档只给了 generations 方言）；查询任务的确切路径（`/v1/videos/generations/{task_id}` 还是 `/v1/videos/{id}`）。

### 3.5 RouteAPI：双方言 + 计费倍率透出（信息量最大的一份文档）

✅ [创建视频生成任务](https://www.routeapi.ai/docs/zh-tw/relay/videos/create-task/)、[OpenAI / Sora 格式](https://www.routeapi.ai/docs/zh-tw/relay/videos/openai-videos/)：

- **同一平台两套路径**：`POST /v1/video/generations`（通用任务方言）与 `POST /v1/videos`（OpenAI video 方言）。两者提交体字段相同，**区别只在响应**：前者返回任务记录，后者返回 **OpenAI Video 对象**。`GET` 端点也不同，不能混用。
- 提交响应（OpenAI 方言）：

```json
{ "id": "task_...", "task_id": "task_...", "object": "video",
  "model": "sora-2", "status": "queued", "progress": 0, "created_at": 1792048458 }
```

→ **`id` 与 `task_id` 双写**；文档明确"`task_id` 是兼容别名，后续可能不再返回，请读 `id`"。
- 查询响应附加 `metadata.url`（供应商回传的视频 URL）；**统一拿字节用 `/content`**。`/content` 带 `Cache-Control: public, max-age=86400` 和上游 `Content-Type`。
- 状态：`queued` / `in_progress` / `completed` / `failed`；**只有 completed 与 failed 是终态**，"返回 failed 的任务预扣金额已退回，重试没有意义"。
- **计费倍率透出**：提交响应头 `X-New-Api-Other-Ratios`，如 Sora 的 `{"seconds":5,"size":1}`；1792 档为 `size:1.666667`。→ 这是**对账的黄金字段**（见第 5 节）。
- 错误分两套信封：路由后被拒 → `{"code":"invalid_request","message":"...","data":null}`；路由前被拒（无 Key/IP 限制/无权限）→ 标准 `{"error":{...}}`。
- 错误码极细：`invalid_request` / `invalid_seconds`（**负值或 >3600 拒绝**）/ `invalid_size` / `missing_model` / `invalid_json` / `model_price_error`（无法计价→不提交上游）/ `insufficient_user_quota`、`pre_consume_token_quota_failed`（403）/ `model_not_found`（503）/ `upstream_task_id_missing`（502）/ `fail_to_fetch_task`（沿用上游状态码）/ **`not_implemented`（501）**——某平台没有 OpenAI video 转换能力时 GET 会 501。
- 提交后失败（风控、供应商超时、取消）**不以 HTTP 错误呈现**，而是任务记录里 `FAILURE` + `fail_reason`，同时退款。
- 平台侧任务超时默认 **24 小时**后标失败并退款；平台自身每 ~15s 轮询一次上游。

### 3.6 Infistar（无限星河）：官方 4 态 + `metadata.url`

✅ [视频生成与管理接口](https://doc.infistar.cc/api-reference/video-generation)（含 `.md` 机器可读版）：

- `POST /v1/videos`（multipart）+ `Authorization: Bearer`，参数 `model`（必填）、`prompt`（必填）、`input_reference`、`seconds`、`size`。
- 状态词**完全对齐官方**：`queued` / `in_progress` / `completed` / `failed`；建议轮询 **5–10 秒**。
- 结果：`GET /v1/videos/{id}/content` 下载；或读 `metadata.url` 直接播放。
- 明确警告："查询用 GET，**不要重复 POST**，可能创建并计费第二个任务"。
- 重混 `POST /v1/videos/{video_id}/remix` 仅部分线路支持。

→ 这是"最像官方"的中转站，适合作为**官方档位的兼容目标**。

### 3.7 AtlasCloud：不是 OpenAI 协议（说明"聚合站"不等于"兼容"）

✅ [AtlasCloud 官方 n8n/provider 仓库](https://github.com/AtlasCloudAI/openclaw-atlascloud-provider)、[Atlas Cloud Media skill 文档](https://github.com/sickn33/agentic-awesome-skills/blob/6d4ea18320984083107f07ff69587fa355ee94c0/plugins/agentic-awesome-skills-claude/skills/atlas-cloud-media/SKILL.md)：

```
GET  https://api.atlascloud.ai/api/v1/models          # 含每个模型的 schema URL
POST https://api.atlascloud.ai/api/v1/model/generateVideo
GET  https://api.atlascloud.ai/api/v1/model/prediction/{id}
```

- 提交返回 `.data.id`；查询返回 `.data.status`（`completed` / `succeeded` / `failed` / `timeout`）与 `.data.outputs[0]`（临时 URL）。
- **模型参数是 schema 驱动的**（"`size`/`ratio`/`aspect_ratio`/`image`/`image_url` 因模型而异，不要跨模型猜参数"）。
- 输出 URL 临时有效，要求立即下载；**下载时不得携带 Atlas 的 Authorization 头**（防密钥泄漏到第三方 host）。
- 明确"**不要自动重试可计费请求**，原任务可能已被接受"。

→ 这类供应商需要**专用适配器**（profile=`atlascloud`），不能塞进 OpenAI 档位。**这正是要求后端"适配器化"的最强证据。**

### 3.8 LiteLLM Proxy（自建中转的常见选择）

✅ [LiteLLM OpenAI Video Generation](https://docs.litellm.ai/docs/providers/openai/videos)：

- 提供 `/v1/videos`、`/v1/videos/{id}`、`/v1/videos/{id}/content`、`/v1/videos/{id}/remix`，**"Each route is also served without the `/v1` prefix"**（⚠️ 对 Base URL 规范化是个陷阱：既可能吃到 `/v1/v1`，也可能吃到无前缀）。
- 请求既可用 **JSON**（官方文档示例是 JSON）也可 multipart；鉴权 `Authorization: Bearer` 或 `x-litellm-api-key`。
- 支持 `custom_llm_provider`（header / query / body 三处）。

### 3.9 差异收敛：后端必须容忍的"同一语义的 N 种写法"

| 语义 | 真实出现过的字段/取值 |
|---|---|
| 任务 ID | `id`、`task_id`、`data.id`、`data[0].task_id`、`name`（Gemini operation）、`task.id` |
| 模型名 | `model`、`model_name`、`engine`；`sora-2` / `sora-2-pro` / `sora_2` ⚠️ |
| 时长 | `seconds`（string）、`duration`（int）、`durationSeconds`、`metadata.durationSeconds` |
| 尺寸 | `size`（`1280x720` / `1920*1080` / `1280P` / `720p`）、`resolution`、`ratio`、`aspect_ratio` |
| 参考图 | `input_reference`（file/对象）、`image`、`images[]`、`image[]`、`image_urls[]`、`image_url`、`metadata.img_url`、`metadata.referenceImages`、`referenceImages[]` |
| 首尾帧 | `first_frame`/`last_frame`、`firstFrame`/`lastFrame`、`metadata.firstFrame/lastFrame`、`metadata.first_frame_url/last_frame_url`、`image`+`lastFrame`（Gemini）、`media[]`（万相） |
| 音频/水印 | `generate_audio`/`generateAudio`、`watermark`/`addWatermark` |
| 状态 | `queued`/`in_progress`/`completed`/`failed`/`cancelled`/`processing`/`pending`/`submitted`/`succeeded`/`success`/`done`/`timeout`/`expired`/`FAILURE` |
| 结果 URL | `video_url`/`result_url`/`url`/`content.video_url`/`content.url`/`output`/`video.url`/`data.outputs[0]`/`metadata.url` |
| 错误 | `{error:{message,type,code,param}}`/`{code,message,data}`/`{msg}`/`{message}`/`{error:"字符串"}`/`{detail}` |
| 鉴权 | `Authorization: Bearer` / `api-key` ⚠️ / `x-api-key` ⚠️ / `x-goog-api-key`（Gemini） |

### 3.10 本报告未能核实、必须实测的聚合站

| 对象 | 状态 | 说明 |
|---|---|---|
| **heyroute** | ⚠️ 仅找到营销页（[prolaunch 收录](https://prolaunch.net/projects/heyroute)），未找到 API 文档 | 需注册后用真实 Key 打 `GET /v1/models` + `POST /v1/videos` |
| APIMart 是否兼容官方 `/v1/videos` | ⚠️ 文档只写 `/v1/videos/generations` | 实测两个路径 |
| 88API 状态枚举全集 | ⚠️ 文档截断 | 实测 poll 全流程 |
| 各站是否同步返回 URL（非异步） | ⚠️ 未找到确证 | 注意：个别站点对 Kling/Wan 包装会在创建响应里直接给 URL，**必须实测**，这决定状态机是否要支持"创建即完成" |
| `api-key` / `x-api-key` 鉴权变体 | ⚠️ 未找到权威证据 | 配置项应支持自定义 header（见 4.2） |
| 各站任务/链接保留时长 | ⚠️ 差异大（1h / 24h / 7d） | 以 `expires_at` + 实测为准 |

---

## 4. 后端代理设计要点

### 4.1 总体架构

```
用户/浏览器
   │  (平台自有 API，JWT)
   ▼
[API 层] VideoTaskController
   │  创建任务 → 落库(PENDING) → 立即返回 taskId（不阻塞）
   ▼
[video_task 表]  ←── [调度器 VideoTaskPoller]（定时扫描，ShedLock 分片）
   │                        │
   │                        ├─ 提交器：PENDING → 调上游 create（幂等）→ 存 upstream_task_id
   │                        └─ 轮询器：RUNNING → 调上游 query → 状态映射 → 结算/退款
   ▼
[上游适配器 SPI]  OpenAiVideosAdapter / NewApiAdapter / JsonEnvelopeAdapter / GeminiAdapter / AtlasCloudAdapter
   │
   ▼
[结果处理器] 下载 content → 校验(magic/size/mime) → 存对象存储 → 生成平台内 URL
   │
   ▼
[计费] 预扣 → 成功结算 / 失败退款（ledger 双写）
```

**三条硬约束**：

1. **前端绝不直连上游**：浏览器直连 = 密钥泄漏 + CORS 依赖 + 无法计费/审计（参考实现是纯前端，这是它的结构性缺陷）。
2. **创建与轮询解耦**：创建接口只负责"接单 + 预授权 + 入队"，上游调用全部异步化（否则 HTTP 线程被 3 分钟的视频生成拖死）。
3. **上游 ID 与平台 ID 分离**：平台 `task_id`（对外）+ `upstream_task_id`（对内），永不复用。参考实现把上游 ID 直接当平台 ID 用（`video.ts:187`），一旦换渠道/迁移就断链。

### 4.2 领域模型（MySQL 建议）

```sql
-- 渠道：一套 Base URL + Key + 协议档位
CREATE TABLE provider_channel (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  name          VARCHAR(64)  NOT NULL,
  base_url      VARCHAR(255) NOT NULL,           -- 原样保存，另存 normalized_base_url
  normalized_base_url VARCHAR(255) NOT NULL,     -- 已剥离 /v1、/videos 等后缀
  api_key_cipher VARBINARY(512) NOT NULL,        -- AES-GCM 加密，禁止明文
  protocol      VARCHAR(32)  NOT NULL,           -- openai-official | newapi | json-envelope | atlascloud | gemini
  auth_type     VARCHAR(32)  NOT NULL DEFAULT 'bearer',  -- bearer | api-key | x-api-key | custom
  auth_header   VARCHAR(64)  NULL,               -- 自定义 header 名
  extra_headers JSON NULL,                       -- 渠道级附加 header
  connect_timeout_ms INT NOT NULL DEFAULT 5000,
  read_timeout_ms    INT NOT NULL DEFAULT 30000,
  max_concurrency    INT NOT NULL DEFAULT 8,
  enabled       TINYINT NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 模型：挂在渠道下（同名模型在不同站能力/价格不同）
CREATE TABLE provider_model (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  channel_id      BIGINT NOT NULL,
  model_name      VARCHAR(128) NOT NULL,   -- 原样透传给上游
  capability      VARCHAR(16)  NOT NULL DEFAULT 'video',
  seconds_options JSON NULL,              -- ["4","8","12"]，null=透传
  size_options    JSON NULL,              -- ["720x1280",...]
  supports_input_reference TINYINT NOT NULL DEFAULT 1,
  supports_multi_image     TINYINT NOT NULL DEFAULT 0,
  supports_frames          TINYINT NOT NULL DEFAULT 0,
  supports_audio           TINYINT NOT NULL DEFAULT 0,
  price_rule_id   BIGINT NULL,
  enabled         TINYINT NOT NULL DEFAULT 1,
  UNIQUE KEY uk_channel_model (channel_id, model_name)
);

-- 任务主表
CREATE TABLE video_task (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_no           CHAR(26) NOT NULL,            -- ULID，对外暴露
  user_id           BIGINT NOT NULL,
  channel_id        BIGINT NOT NULL,
  model_id          BIGINT NOT NULL,
  idempotency_key   VARCHAR(128) NULL,            -- 客户端幂等键
  request_hash      CHAR(64) NOT NULL,            -- 入参指纹，防"同键不同参"
  status            VARCHAR(24) NOT NULL,         -- 见 4.3
  prompt            TEXT NOT NULL,
  params_json       JSON NOT NULL,                -- 归一化后的入参（seconds/size/ratio/...）
  upstream_task_id  VARCHAR(191) NULL,
  upstream_status   VARCHAR(32) NULL,             -- 上游原始状态词，原样留档
  upstream_request_id VARCHAR(191) NULL,
  result_url        VARCHAR(2048) NULL,           -- 上游结果（仅审计，不对外）
  result_expires_at DATETIME NULL,
  asset_id          BIGINT NULL,                  -- 落盘后的资产
  error_code        VARCHAR(64) NULL,
  error_message     VARCHAR(1024) NULL,           -- 已脱敏
  attempt_count     INT NOT NULL DEFAULT 0,
  next_poll_at      DATETIME NULL,
  submitted_at      DATETIME NULL,
  finished_at       DATETIME NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_task_no (task_no),
  UNIQUE KEY uk_idem (user_id, idempotency_key),
  KEY idx_poll (status, next_poll_at),
  KEY idx_user (user_id, created_at)
);

-- 每次上游调用一条（审计 + 排障 + 成本分析）
CREATE TABLE upstream_call_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_no VARCHAR(26) NOT NULL,
  action  VARCHAR(16) NOT NULL,        -- create | query | content | cancel
  http_status INT NULL,
  latency_ms INT NULL,
  attempt INT NOT NULL,
  request_id VARCHAR(128) NULL,        -- 平台 traceId
  upstream_request_id VARCHAR(191) NULL,
  error_code VARCHAR(64) NULL,
  cost_ratio_hint JSON NULL,           -- 如 X-New-Api-Other-Ratios
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_task (task_no, created_at)
);

-- 资产
CREATE TABLE media_asset (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  storage_key   VARCHAR(512) NOT NULL,
  content_type  VARCHAR(64)  NOT NULL,
  bytes         BIGINT NOT NULL,
  sha256        CHAR(64) NOT NULL,
  width INT NULL, height INT NULL, duration_ms INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 计费流水（双分录）
CREATE TABLE billing_ledger (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  task_no VARCHAR(26) NULL,
  entry_type VARCHAR(16) NOT NULL,   -- HOLD | SETTLE | REFUND | ADJUST
  credits    BIGINT NOT NULL,        -- 正负
  balance_after BIGINT NOT NULL,
  idempotent_key VARCHAR(128) NOT NULL,
  remark VARCHAR(254) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_idem (idempotent_key),
  KEY idx_user (user_id, created_at)
);
```

> 关键点：`provider_channel.protocol` 是**适配器选择器**；`provider_model` 的 `supports_*` 是**创建前校验依据**；`upstream_status` 原样留档，方便日后补充映射而不用回放请求。

### 4.3 状态机

平台内部状态（对用户只暴露 5 个）：

```
        ┌──────────── cancel ────────────┐
        ▼                                │
 CREATED ──submit──> SUBMITTING ──ok──> QUEUED ──> RUNNING ──> SUCCEEDED
    │                    │                 │           │
    │                    └─fail──> FAILED ◄┘           ├──> FAILED
    │                                                   ├──> CANCELLED
    └────────────── timeout ────────────────────────────┴──> EXPIRED
```

| 内部状态 | 对用户 | 含义 | 触发迁移 |
|---|---|---|---|
| `CREATED` | `queued` | 已接单、已预扣，待提交上游 | 调度器拾取 |
| `SUBMITTING` | `queued` | 正在调上游 create | 成功→QUEUED；确定失败→FAILED；**结果未知→SUBMIT_UNKNOWN** |
| `SUBMIT_UNKNOWN` | `queued` | 提交超时/连接中断，**可能已在上游创建** | 有上游 ID 入账→QUEUED；宽限期（如 2 分钟）后按"未创建"重试（带幂等键） |
| `QUEUED` | `queued` | 上游已受理 | 查询到 in_progress→RUNNING |
| `RUNNING` | `running` | 生成中 | completed→SUCCEEDED；failed→FAILED |
| `SUCCEEDED` | `succeeded` | 已落盘 + 已结算 | 终态（落盘失败可短暂回退到 `DOWNLOADING`） |
| `FAILED` | `failed` | 上游失败/内容风控 | 终态 + 退款 |
| `CANCELLED` | `cancelled` | 用户取消 | 终态 + 退款（上游不支持取消时"逻辑取消 + 丢弃结果"） |
| `EXPIRED` | `failed(code=EXPIRED)` | 超总时限 | 终态 + 退款 |

**状态映射表（上游 → 平台）**必须做成配置/常量，而不是散落 if-else：

| 上游词 | 平台 |
|---|---|
| `queued`、`pending`、`submitted`、`created`、`waiting` | QUEUED |
| `in_progress`、`processing`、`running`、`generating` | RUNNING |
| `completed`、`succeeded`、`success`、`done`、`finished` | SUCCEEDED（**但必须先拿到可下载结果**，否则读 `error`/重试） |
| `failed`、`error`、`FAILURE` | FAILED |
| `cancelled`、`canceled` | CANCELLED |
| `expired`、`timeout` | EXPIRED |
| 未知词 | **不迁移**，只记 `upstream_status` + 告警（连续 N 次未知→按超时兜底） |

**取消语义**（重要）：官方**没有** cancel 端点（只有 DELETE 删除已结束任务）。因此：

- 若上游有 cancel（部分聚合站有 `can_cancel` 字段，如 APIMart `task_info.can_cancel`）→ 调它，成功后置 CANCELLED；
- 若没有 → **平台侧标记取消**，停止轮询，忽略后续结果；**费用是否退还要看渠道计费策略**（很多上游提交即扣费，退款只能由平台承担，见 5.4）。

**重试边界**：

| 场景 | 是否重试 | 说明 |
|---|---|---|
| create 连接失败/超时（未拿到响应） | 谨慎：进 `SUBMIT_UNKNOWN`，先查（若上游无按幂等键查询能力） | 直接重试可能双重扣费 |
| create 明确 4xx（400/401/402/403/422） | ❌ 不重试 | 参数/鉴权/余额问题，重试无意义；直接 FAILED 并退预扣 |
| create 429 / 5xx | ✅ 退避重试（带幂等键，最多 3 次） | 注意有些站 5xx 可能已创建 |
| query 网络错误/5xx | ✅ 继续轮询（不消耗重试额度，只记失败次数） | 查询是幂等的 |
| query 404 | ⚠️ 有限重试（3 次）后 FAILED，防"上游丢任务" | 同时告警 |
| content 下载失败 | ✅ 最多 3 次（指数退避） | 同时保留 `result_url` 兜底，但**不对外暴露** |
| 任何重试 | ❌ 不得在"已成功落盘/已结算"后发生 | 结算用 `task_no` 唯一键保证幂等 |

### 4.4 创建接口设计（平台对外）

```http
POST /api/v1/video/tasks
Authorization: Bearer <platform-jwt>
Idempotency-Key: 5f0c1a2e-...        # 客户端生成，24h 内同键同参返回同一任务
Content-Type: application/json

{
  "modelId": 1024,
  "prompt": "雨夜城市中的银色跑车，低机位跟拍，霓虹倒影",
  "seconds": 8,
  "size": "1280x720",
  "ratio": "16:9",
  "generateAudio": true,
  "referenceImages": ["https://cdn.example.com/first.png"],
  "mode": "frames"
}
```

响应（**立即返回，不阻塞生成**）：

```json
{
  "code": 0,
  "data": {
    "taskNo": "01JCV8Z3K9WQ7YH2N5R8T6B4XM",
    "status": "queued",
    "estimatedCredits": 80,
    "pollAfterMs": 3000
  }
}
```

要点：

1. **幂等**：`(user_id, idempotency_key)` 唯一索引；同键但 `request_hash` 不同 → 409，防"改参重放"。
2. **预扣在同步路径完成**（DB 事务内：余额校验 + HOLD 流水 + 任务落库），失败直接返回 402 `INSUFFICIENT_CREDITS`（对齐 APIMart/RouteAPI 的 402 语义）。
3. **能力校验在创建前**：`seconds`/`size`/参考图数量对照 `provider_model` 能力表，不支持 → 400（避免上游 400 + 白扣一次）。
4. **响应带 `pollAfterMs`**：前端按建议间隔轮询，平台可随负载调整（参考实现固定 2500ms，`video.ts:57`）。
5. **不做上传透传**：参考图由平台先收（`POST /api/v1/media`）拿到平台 URL，再由后端转成上游需要的形式（文件流 / URL / base64），避免把用户 URL 直接甩给上游（SSRF + 可用性问题，88API 明确要求公网 HTTPS、不能私网）。

查询/取消/下载：

```http
GET  /api/v1/video/tasks/{taskNo}            # 返回平台状态 + progress + 结果(平台CDN URL)
POST /api/v1/video/tasks/{taskNo}/cancel
GET  /api/v1/video/tasks/{taskNo}/content    # 平台自托管流式下载，支持 Range
GET  /api/v1/video/tasks?status=&cursor=     # 列表（游标分页）
```

### 4.5 轮询调度

**不要用 `@Scheduled` + `Thread.sleep` 一把梭**，用"**DB 驱动的到期扫描**"：

```sql
-- 每 1s 扫描一批到期任务；SKIP LOCKED 天然支持多实例
SELECT id FROM video_task
WHERE status IN ('CREATED','SUBMITTING','QUEUED','RUNNING')
  AND next_poll_at <= NOW(3)
ORDER BY next_poll_at
LIMIT 200
FOR UPDATE SKIP LOCKED;
```

- **单实例多线程**：`ThreadPoolTaskExecutor`（核心 8–16，队列有界，拒绝策略=记日志丢弃，下一轮自然重扫）。
- **多实例**：`FOR UPDATE SKIP LOCKED` 或 ShedLock（`@SchedulerLock`）二选一；前者不需要额外表。
- **退避表**：`[3s, 5s, 8s, 12s, 20s]`（±20% 抖动），到顶后固定 20s；`attempt_count` 递增用于超时判定。
- **总超时**：`created_at + 30min`（可配），超时前**强制查一次最终状态**；仍非终态 → EXPIRED + 退款。
- **限流/并发**：每渠道信号量（`provider_channel.max_concurrency`）+ 全局限流；429 时读 `Retry-After`（官方 `VideoCreateError.headers` 会带，✅ 1.7）并整体降速。
- **轮询抖动**：同一秒创建的任务不要同时打上游（加 `hash(taskNo) % 1000ms` 偏移）。
- **严禁**：前端每次刷新触发一次上游查询（参考实现是前端轮询，`video.ts:50-60`；后端化后必须由服务端节流并复用结果）。

### 4.6 结果落盘：下载 vs 透传

| 方案 | 优点 | 风险 | 结论 |
|---|---|---|---|
| **A. 下载落盘 + 平台 CDN**（推荐） | 上游链接失效无影响；可控鉴权/防盗链/审计；可转码/压缩；可生成封面 | 存储成本、带宽成本、下载耗时要纳入任务状态 | ✅ 默认 |
| B. 直接透传上游 URL | 实现最省事 | **链接 1h–24h 失效**（APIMart 24h、官方 `expires_at`、社区"约 1h"）；跨域/防盗链；暴露上游域名；无法计费追溯 | ❌ 仅作为下载失败时的**内部兜底**，绝不返回给用户 |
| C. 代理流式（边下边转） | 不占存储 | 每次播放都打上游；上游鉴权头暴露风险；无法离线 | 仅用于"试看/预览"短片段 |

**落盘流程**：

```
completed → 取结果 URL（优先级见 2.5）或 /content
          → 下载到临时文件（流式，边下边算 sha256，限制 maxBytes）
          → 校验：HTTP 200 / Content-Type ∈ {video/mp4,video/webm,application/octet-stream}
                  / magic bytes / size ∈ (0, maxBytes]
          → 上传对象存储（key: video/{userId}/{yyyyMM}/{taskNo}.mp4）
          → media_asset 落库 + video_task.asset_id
          → 事务内：SETTLE 结算 + status=SUCCEEDED
          → 删除临时文件
```

- 下载超时：connect 5s / read **600s**（大文件）；分块写盘防止 OOM（**绝不能 `byte[]` 全量读**）。
- 落盘幂等：同一 `task_no` 只允许一个 SUCCEEDED 结算（`billing_ledger.idempotent_key = "settle:"+taskNo`）。
- 若下载失败：**最多重试 3 次**（退避 5s/15s/60s），仍失败 → 任务 FAILED（退款）+ 告警；**不要**降级返回上游 URL（这是参考实现的妥协，`video.ts:215-218`，后端不可接受）。

### 4.7 SSRF 防护（必做清单）

上游 Base URL 由**管理员**配置（半可信），结果 URL 由**上游**返回（不可信），参考图 URL 由**用户**提交（不可信）。三道入口都要防：

1. **只允许 https**（可选允许 http 用于内网自建，需显式开关）。
2. **域名/IP 双校验**：解析 DNS 后检查所有 A/AAAA 记录，拒绝 `127.0.0.0/8`、`10/8`、`172.16/12`、`192.168/16`、`169.254/16`（含云元数据 `169.254.169.254`）、`::1`、`fc00::/7`、`fe80::/10`、`0.0.0.0`、多播/保留段。
3. **重定向**：手动处理（`RedirectStrategy` 关闭自动跟随），每一跳重新校验 host+IP，最多 3 跳。
4. **端口白名单**：443（+ 显式配置的 80/自定义）。
5. **响应限制**：`Content-Type` 白名单、`Content-Length`/实际字节上限、读超时、禁止 gzip bomb（限制解压比）。
6. **主机名黑名单**：`localhost`、`*.local`、`metadata.google.internal`、Docker 服务名。
7. **网络隔离**：代理出口走独立 NAT/安全组，禁止访问控制面网段；必要时用固定出站代理。
8. **Base URL 校验**：保存渠道时校验 scheme/host/无 userinfo/无 path 里的 `..`；**禁止把路径拼进 base_url**（防 `/v1/videos` 被拼成 `/v1/videos/v1/videos`，见 2.1）。
9. **永不把上游 Authorization 头带到第三方 host**（AtlasCloud 文档明确要求，✅ 3.7）。

### 4.8 超时与重试参数（建议默认值）

| 调用 | connect | read | 总预算 | 重试 |
|---|---|---|---|---|
| create（multipart，含图） | 5s | 60s | 90s | 仅 429/5xx，≤2 次（配合幂等键） |
| query（GET JSON） | 3s | 15s | 20s | 网络错误继续轮询，不单独重试 |
| content（下载） | 5s | 600s | 15min | ≤3 次 |
| 列表/模型探测 | 3s | 10s | — | 1 次 |
| 任务总时限 | — | — | **30min**（可配 60min） | 超时→EXPIRED+退款 |

重试必须带**指数退避 + 抖动 + 上限**，并且对"计费型写请求"（create/remix）默认**不盲重试**（AtlasCloud/RouteAPI 都明确警告会重复扣费，✅ 3.5/3.7）。

### 4.9 适配器 SPI（协议档位）

```java
public interface VideoProviderAdapter {
    String protocol();                                   // 与 provider_channel.protocol 对应
    CreateResult create(CreateCommand cmd) throws UpstreamException;   // 返回 upstreamTaskId
    TaskState query(String upstreamTaskId, String model) throws UpstreamException;
    Optional<MediaStream> content(String upstreamTaskId);              // 有的站只给 URL
    default Optional<String> resultUrl(TaskState state) { return Optional.empty(); }
    default void cancel(String upstreamTaskId) { /* 默认不支持 */ }
    default Map<String, Object> buildCreateBody(CreateCommand cmd) { ... } // 字段差异收敛点
}
```

档位（profile）与首版优先级：

| profile | 覆盖对象 | 首版 |
|---|---|---|
| `openai-official` | OpenAI 官方、Infistar、LiteLLM、多数"真兼容"站 | ✅ P0 |
| `newapi` | new-api 系（multipart + `processing/succeeded` + `url`） | ✅ P0（覆盖面最大） |
| `json-envelope` | 88API 风格（JSON + `images[]` + `metadata.firstFrame`）、APIMart 风格（`data[]` + `task_id`） | ✅ P1 |
| `dual-dialect` | RouteAPI（`/v1/video/generations` + `/v1/videos`） | P1 |
| `atlascloud` | AtlasCloud（`generateVideo` + `prediction`） | P2 |
| `gemini` | Veo `predictLongRunning`（参考实现已实现，`video.ts:221-265`） | P2 |

**配置里加"探测"能力**：保存渠道时自动跑一次 `GET /v1/models` + 一次最小 create（可选），把探测结果（支持的路径、状态词样本、字段回显）存下来供适配器选择——比让管理员手选 profile 可靠得多。

### 4.10 上游错误透传与脱敏

- **映射为平台错误码**（不要原样透传上游 message，里面常含上游域名/内部错误栈）：
  `UPSTREAM_AUTH` / `UPSTREAM_RATE_LIMITED` / `UPSTREAM_INVALID_PARAM` / `UPSTREAM_INSUFFICIENT_BALANCE`(402) / `UPSTREAM_CONTENT_BLOCKED`（内容风控）/ `UPSTREAM_TIMEOUT` / `UPSTREAM_UNAVAILABLE` / `UPSTREAM_UNKNOWN`。
- 对外 message：中文可读 + `requestId`（便于客服定位），**不回显上游原始 JSON**。
- 日志脱敏：`Authorization`、`api_key`、带签名的结果 URL、用户 prompt 中的手机号/身份证（可选 PII 脱敏）、`expires_at` 后的临时 URL。
- 保留原文：`upstream_call_log` 存**脱敏后**的响应摘要（截断 4KB），原始 body 只在 DEBUG 短期落盘。

### 4.11 日志与审计

每条任务至少落：`task_no`、`user_id`、`channel_id`、`model`、`upstream_task_id`、`upstream_status`、`http_status`、`latency_ms`、`attempt`、`error_code`、`credits_hold/settle/refund`、`request_id`（MDC traceId，贯穿 create→poll→download）、`expires_at`。

- 一次任务的生命周期应能用 `task_no` 一条 SQL 拼出完整时间线（`video_task` + `upstream_call_log` + `billing_ledger`）。
- 对账：每日跑"上游账单 vs 平台 ledger"差异报表（按 channel 维度），差异 >0 告警。
- 指标（Micrometer）：创建 QPS/成功率、轮询耗时分布、上游 P95 延迟、各状态停留时长、下载失败率、每渠道余额/429 比例、单任务平均成本。
- 告警：某渠道连续 5 次 5xx、402 余额不足、未知状态词出现、单任务耗时 > 20min。

---

## 5. 计费维度观察

### 5.1 上游计费模式（真实差异）

| 模式 | 代表 | 特点 | 对平台的影响 |
|---|---|---|---|
| **按秒 × 分辨率** | OpenAI Sora 2 | `sora-2` 约 $0.10/秒；`sora-2-pro` 720p 约 $0.30/秒、1792 档约 $0.50/秒（📌 由 RouteAPI 尺寸倍率 1.666667 反推验证：0.30×5/3=0.50） | 秒数必须进计费公式；分辨率要乘系数 |
| **按次** | 部分 Kling/Hailuo 包装、Veo fast | 一次任务固定价，与秒数弱相关 | 用户选 4s 还是 8s 成本一样 → 定价要留毛利 |
| **按 token / 复杂计价** | APIMart（`usage.total_tokens`）、部分国产模型 | 上游返回 usage，价格随质量/时长浮动 | 平台需存 `usage` 才能对账 |
| **预扣 + 结算/退款** | RouteAPI、APIMart、官方 | 提交时预授权，成功结算，失败/超时退回 | 平台必须实现同样的三段式（5.4） |
| **固定倍率透出** | RouteAPI `X-New-Api-Other-Ratios` | 响应头给出实际倍率（如 `{"seconds":5,"size":1}`） | **对账黄金字段**，必须抓取落库 |

> ⚠️ 以上官方价格是**转述+倍率反推**，不是本站点抓到的官方定价页原文（`platform.openai.com/docs/pricing` 抓取受限）。**上线前必须以官方定价页 + 自己的上游账单校准**（6.3 R4）。

### 5.2 模型命名与规格差异（定价必须按"模型+规格"维度）

| 系列 | 常见上游 ID | 规格维度 | 备注 |
|---|---|---|---|
| Sora | `sora-2`、`sora-2-pro` | 时长 4/8/12s × 尺寸（720p / 1792 档） | pro 的 1792 档更贵（≈1.67×） |
| Veo | `veo-3`、`veo-3.1`、`veo3.1-fast` | 分辨率 720p/1080p、是否带音频 | 部分站把 fast/pro 拆成不同模型 ID |
| Seedance | `seedance-1.5-pro`、`seedance-2.0-fast`、`doubao-seedance-*` | 分辨率 480p/720p/1080p、时长 4–12s | 模型 ID 里常内嵌档位（88API 明示） |
| Kling | `kling-v2-master`、`kling-v3.0-pro`、`kling-v2-6` | 时长 5/10s、有无音频、标准/专业 | 命名最混乱，必须按渠道配能力表 |
| Wan 万相 | `wan2.5-t2v-preview`、`wan2.5-i2v-preview`、`wan2.2-kf2v-flash` | t2v/i2v/kf2v/s2v × 480P/720P/1080P | 首尾帧走 `metadata.first_frame_url` |
| Hailuo | `hailuo-2.3`、`minimax-h3` | 时长 6/10s、768p/1080p | 参考图字段有私有变体 |
| Vidu | `viduq1`、`vidu/q3` | 时长/分辨率 | — |

**结论**：定价表的主键必须是 **`(channel_id, model_name, resolution, seconds)`**，不是 `model_name`。参考实现把 `resolution_name`/`size` 拼进请求（`video.ts:159-163`）却**完全没有价格概念**——这是我们要新建的部分。

### 5.3 平台计费模型建议

**用"积分（credit）"而非"人民币"做内部计价单位**（便于运营调价、活动赠送、多币种）。

```
credits = ceil( baseRate[modelTier]                          # 模型倍率（积分/秒）
              × resolutionFactor[resolution]                  # 480p=0.6, 720p=1.0, 1080p=1.8, 1792=2.0
              × audioFactor                                   # 带音频 ×1.2（若上游加价）
              × seconds                                       # 时长
              × channelMarkup )                               # 渠道成本系数（默认 1.0）
```

示例（示意，非最终定价）：

| 模型档 | 720p 每秒 | 1s | 4s | 8s | 12s |
|---|---|---|---|---|---|
| 标准档（sora-2 / seedance-fast） | 10 积分 | 10 | 40 | 80 | 120 |
| 专业档（sora-2-pro / kling-pro / veo-3.1） | 30 积分 | 30 | 120 | 240 | 360 |
| 1792 档（sora-2-pro） | 50 积分 | 50 | 200 | 400 | 600 |

规则：

1. **最小计费单位 1 积分**，向上取整；设 `minChargeCredits`（如 20）防"1 秒任务"亏本。
2. **倍率可配置**（DB 表 `price_rule`），支持按时段/渠道/用户等级覆盖。
3. **成本核算**：`price_rule` 同时存 `costCredits`（上游成本）与 `saleCredits`（售价），毛利率可监控。
4. **不可退的沉没成本**：上游"提交即扣费、失败不退"的渠道，要在 `price_rule` 标记 `refundable=false`，运营定价时把失败率（经验 5–15%）计入。
5. **音频/水印**：官方 Sora 默认带音频；部分站 `generate_audio` 单独加价 → 作为 `audioFactor` 而非独立费用。
6. **参考图**：官方 1 张免费；多参考图的站可能加价 → `imageCountFactor = 1 + 0.1 × max(0, n-1)`（可选）。

### 5.4 扣费时机（三段式）

```
创建 ──> HOLD（预扣，可用余额 = 余额 - hold）
          │
          ├─ 成功 ──> SETTLE（hold 转实扣，差额退回）
          ├─ 失败/取消/超时 ──> REFUND（hold 全额退回）
          └─ 部分成功（如只出 4s 而非 8s）──> 按实际 SETTLE_ADJUST（差额退回）
```

| 时机 | 动作 | 幂等键 | 说明 |
|---|---|---|---|
| 创建接口同步事务内 | `HOLD` + 余额校验 | `hold:{taskNo}` | 余额不足 → 402，不落任务（或落 `REJECTED` 不扣费） |
| 提交上游成功 | 无（已 hold） | — | 记录 `submitted_at` |
| 上游明确失败 | `REFUND` | `refund:{taskNo}` | 与状态迁移同事务 |
| 落盘成功 | `SETTLE` | `settle:{taskNo}` | 以"实际 seconds/size"为准，多退少补 |
| 平台超时 | `REFUND` | `refund:{taskNo}` | 30min 兜底；若上游事后又成功，做 `ADJUST` 人工/自动补偿 |
| 用户取消 | `REFUND`（若渠道可退）/ 不退款（若上游已扣） | `refund:{taskNo}` | 需在 UI 明示"取消可能不退款" |

**关键工程点**：

- `billing_ledger` 用**唯一键幂等**，任何重试/并发都不会双扣双退；
- 余额校验用 `UPDATE user SET balance = balance - ? WHERE id=? AND balance >= ?`（乐观并发），不要"先查再改"；
- **hold 不能依赖定时任务释放**（宕机会泄漏），用"任务超时清理器 + 幂等 REFUND"兜底；
- 结算金额与预扣不一致时，写 `ADJUST` 流水并记录原因（不覆盖历史）。

### 5.5 对账字段（从上游抓什么）

| 字段 | 来源 | 用途 |
|---|---|---|
| `usage` / `total_tokens` | APIMart 等 | 按用量计价的上游成本 |
| `X-New-Api-Other-Ratios` | RouteAPI/new-api 系 | 上游实际倍率，验证我方定价 |
| `expires_at` | 官方/聚合站 | 落盘紧迫度、缓存策略 |
| `model`（回显） | 全部 | 验证"下单模型 = 实际执行模型"（有的站会静默降级） |
| `seconds`（回显） | 官方/聚合站 | 验证实际时长，用于结算 |
| `size`（回显） | 官方/聚合站 | 验证分辨率档位 |
| `progress` | 官方/聚合站 | 前端进度、卡死告警 |
| `error.code` | 官方 | 失败归因（风控/参数/额度） |

---

## 6. 结论清单

### 6.1 最小协议集（MUST，第一版必须支持）

| # | 能力 | 规格 |
|---|---|---|
| M1 | 创建任务 | `POST {base}/v1/videos`，`multipart/form-data`，字段 `model`、`prompt`、`seconds`、`size`、`input_reference`（文件） |
| M2 | 查询任务 | `GET {base}/v1/videos/{id}`，解析 Video 对象（`status`/`progress`/`error`/`expires_at`） |
| M3 | 下载内容 | `GET {base}/v1/videos/{id}/content`，`Accept: application/binary`，二进制校验后落盘 |
| M4 | 鉴权 | `Authorization: Bearer <key>`（可配置 header 名） |
| M5 | 状态映射 | 官方 4 态 + **`succeeded/success/processing/pending/submitted/cancelled/expired/timeout`** 别名表 |
| M6 | 错误解析 | HTTP 错误体 `{error:{message,type,param,code}}` + **200+failed 的任务内 `error`** + `{code,message,data}` + `{msg}`/`{message}` |
| M7 | 结果获取 | 优先 `/content`；无 content 时按 `video_url → result_url → url → content.video_url → content.url → metadata.url` 兜底 |
| M8 | URL 规范化 | Base URL 智能补 `/v1`，拒绝已含 `/videos` 的值，防双 `/v1` |
| M9 | 轮询调度 | 服务端 DB 扫描 + 指数退避（3→20s）+ 30min 总超时；前端只轮询平台 |
| M10 | 落盘 | 下载→magic byte/MIME/size 校验→对象存储→平台 URL；**绝不透传上游 URL** |
| M11 | 计费三段式 | HOLD → SETTLE / REFUND，ledger 唯一键幂等 |
| M12 | 安全 | SSRF 三重防护（渠道 baseURL / 用户素材 / 上游结果 URL）、密钥加密存储、日志脱敏 |

### 6.2 可选兼容集（SHOULD，按真实客户渠道排期）

| # | 能力 | 覆盖站点 | 优先级 |
|---|---|---|---|
| O1 | 多参考图字段：`image[]`+`images` 双写、`images[]`、`image_urls[]` | 参考实现/88API/APIMart | P1 |
| O2 | 首尾帧字段：`first_frame`/`last_frame`、`metadata.firstFrame/lastFrame`、`metadata.first_frame_url/last_frame_url` | 多数国产模型站 | P1 |
| O3 | JSON 入参 + `{code,data}` 信封（含 `data` 为数组的 APIMart 变体） | APIMart/88API 系 | P1 |
| O4 | `duration`/`ratio`/`aspect_ratio`/`resolution`/`generate_audio`/`watermark` 语义映射 | 88API/RouteAPI | P1 |
| O5 | 双方言路径：`/v1/video/generations` + `/v1/videos` | RouteAPI、部分国产站 | P1 |
| O6 | 上游任务态附加字段：`task_id` 别名、`metadata.url`、`task_info.can_cancel` | RouteAPI/Infistar/APIMart | P1 |
| O7 | 素材上传协议（申请凭证 + PUT 二进制） | 88API 及同类 | P2 |
| O8 | 计费倍率头 `X-New-Api-Other-Ratios` 抓取落库 | new-api/RouteAPI 系 | P1（对账） |
| O9 | `remix` / `list` / `delete` / `variant=thumbnail` | 官方/部分聚合站 | P2 |
| O10 | Gemini Veo `predictLongRunning` 适配器 | Google 系渠道 | P2 |
| O11 | AtlasCloud `generateVideo`/`prediction` 适配器 | AtlasCloud | P2 |
| O12 | 同步返回 URL（创建即完成）的兜底路径 | 个别包装站 ⚠️ | P2（待实测后再做） |

### 6.3 待实测风险点（上线前必须逐条打掉）

| # | 风险 | 实测方法 | 判定标准 |
|---|---|---|---|
| R1 | **官方 Sora 是否已下线**（SDK 标注 2026-09-24 关停） | 用真实 Key 打 `GET /v1/models` 看是否还有 `sora-2`；再打一次 create | 若 404/410 → 官方档位降级为"历史兼容"，主推聚合站 |
| R2 | 各站状态词全集与终态判定 | 每个渠道跑 1 次完整任务，记录**所有**轮询响应 `status` | 覆盖 4 官方态 + 至少 `processing/succeeded` |
| R3 | 结果 URL 究竟在哪个字段 | 同一任务打印查询响应全文，比对 6 个候选字段 | 至少命中 1 个；建议抓 3 个渠道验证兜底链 |
| R4 | **真实计费口径**（秒数/分辨率倍率/是否含音频/失败是否退费） | 每渠道跑 2 个任务（4s 与 8s、720p 与 1080p），对比上游账单 | 得出 `$/秒` 与倍率；校准 5.3 的 `baseRate` |
| R5 | 任务/链接保留时长（1h / 24h / 7d） | 创建后隔 1h、24h、72h 分别 GET content | 确定落盘 SLA（建议 <10min 完成） |
| R6 | 鉴权 header 变体（`api-key` / `x-api-key`） | 对可疑渠道用 3 种 header 各打一次 | 命中即写入 `auth_type` |
| R7 | 参考图/首尾帧/多图支持矩阵 | 每个模型分别传 1 图 / 2 图 / 3 图 / 首尾帧 | 填入 `provider_model.supports_*` |
| R8 | 内容风控边界（含人脸图片是否被拒） | 用人脸图打一次 create | 若被拒 → 产品需求（数字人）需换渠道 |
| R9 | 创建接口是否幂等（同参重放是否双扣） | 同 `Idempotency-Key` 连打 2 次 | 若上游无幂等 → 平台侧强幂等 + 不盲重试 |
| R10 | 是否支持取消、取消是否退费 | 创建后立刻 cancel，看账单 | 决定 UI 文案与退款策略 |
| R11 | `seconds`/`size` 是强校验还是静默降级 | 传非法值看是否 400，或传 12s 看回显 `seconds` | 决定"创建前校验"的必要性 |
| R12 | 同步返回 URL 的站点 | 创建响应里直接找 `video_url`/`output` | 命中则加"创建即完成"路径 |

### 6.4 建议的落地顺序

1. **P0（1–2 周）**：`openai-official` + `newapi` 两个适配器 → M1–M12 全链路 → 用 Infistar/new-api 实测跑通（它们最接近官方）。
2. **P1**：`json-envelope` / `dual-dialect` 适配器 + 多参考图/首尾帧能力表 + 计费倍率头 → 覆盖 80% 聚合站。
3. **P2**：Gemini / AtlasCloud 适配器、remix、缩略图、素材上传。
4. **持续**：每个新渠道上线前跑一遍 6.3 的 R2/R3/R4/R5 四项（半天），把结果写进 `provider_channel`/`provider_model`，再开放售卖。

---

## 附录 A：协议探针 curl（实测清单）

```bash
# 0) 环境
export BASE="https://api.example.com"      # 渠道 Base URL（不要带 /v1）
export KEY="sk-xxx"

# 1) 模型列表（探测是否 OpenAI 兼容 + 可用模型）
curl -s "$BASE/v1/models" -H "Authorization: Bearer $KEY" | jq '.data[].id'

# 2) 创建任务（官方/网关多数形态：multipart）
curl -s -X POST "$BASE/v1/videos" \
  -H "Authorization: Bearer $KEY" \
  -F "model=sora-2" -F "prompt=a cat on a piano" \
  -F "seconds=4" -F "size=1280x720" | tee create.json

# 3) 创建任务（JSON 方言，88API/APIMart）
curl -s -X POST "$BASE/v1/videos" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"model":"sora-2","prompt":"a cat","duration":4,"ratio":"16:9"}' | tee create-json.json

# 4) 轮询（把所有 status 打出来，确认词表）
TASK=$(jq -r '.id // .data.id // .data[0].task_id // .task_id // empty' create.json)
for i in $(seq 1 60); do
  R=$(curl -s "$BASE/v1/videos/$TASK" -H "Authorization: Bearer $KEY")
  echo "$i $(echo "$R" | jq -c '{status,progress,seconds,size,url,video_url,result_url,metadata}')"
  echo "$R" | grep -qE '"status":"(completed|succeeded|success|failed|cancelled|expired)"' && break
  sleep 5
done
echo "$R" > last.json

# 5) 下载并校验二进制（防 JSON 伪装）
curl -s -D headers.txt "$BASE/v1/videos/$TASK/content" \
  -H "Authorization: Bearer $KEY" -H "Accept: application/binary" -o out.bin
grep -i "content-type\|content-length" headers.txt
xxd -l 16 out.bin            # 期望偏移 4 处为 6674 7970 ("ftyp")
file out.bin

# 6) 计费倍率头（new-api / RouteAPI 系）
curl -s -D - -o /dev/null -X POST "$BASE/v1/videos" \
  -H "Authorization: Bearer $KEY" -F "model=sora-2" -F "prompt=t" -F "seconds=4" \
  | grep -i "x-new-api-other-ratios"
```

判定表：

| 观察项 | 结论 |
|---|---|
| `GET /v1/models` 200 且有模型 | 至少 OpenAI 兼容层可用 |
| 创建返回 `{"id":"video_..."}` | profile = `openai-official` |
| 创建返回 `{"code":0,"data":{"id":...}}` | profile = `newapi`/信封流 |
| 创建返回 `{"code":200,"data":[{...,"task_id":...}]}` | profile = `json-envelope`（APIMart 系） |
| 查询状态出现 `processing/succeeded` | 必须启用状态别名映射 |
| 查询有 `metadata.url` | 结果字段链要加 `metadata.url` |
| `/content` 返 404 但查询有 `url` | 该站只给 URL，下载走 URL（仍要落盘） |
| `/content` 返 501 | 该站无 OpenAI video 转换（RouteAPI 文档同款） |

## 附录 B：参考实现行号速查

| 主题 | 位置 |
|---|---|
| URL 智能补 `/v1` | `web/src/stores/use-config-store.ts:487-492` |
| 渠道/模型配置模型 | `use-config-store.ts:8`、`:12-25`、`:27-59`、`:438-447` |
| 默认 baseUrl | `use-config-store.ts:77-78`、`:474-477` |
| 创建任务（multipart 全字段） | `web/src/services/api/video.ts:149-191`（字段 155-183，POST 185） |
| 轮询（2500ms × 120） | `video.ts:50-60`、`:193-208` |
| 结果 URL 优先级 | `video.ts:359-361` |
| 信封解包 `code/data` | `video.ts:345-357` |
| 错误消息优先级 | `video.ts:363-390` |
| axios 错误映射 | `video.ts:392-407` |
| 二进制 JSON 伪装检测 | `video.ts:409-419` |
| 下载失败降级为 URL | `video.ts:210-219` |
| 落盘策略 | `video.ts:137-147` |
| 模式判定（frames/reference） | `video.ts:325-328` |
| 秒数/尺寸/分辨率归一化 | `video.ts:321-343`；`web/src/lib/media-size.ts` |
| Gemini 分支 | `video.ts:221-265`、`:273-289` |
| 插件脚本运行时 | `model-plugin.ts:42-45`、`:94-107`、`:113-164` |
| OpenAI 视频脚本模板 | `model-plugin.ts:435-556`（字段 478-504，POST 511，轮询 516-541，间隔 540） |

## 附录 C：本文引用清单

**官方 / 一手**
- OpenAI 视频 API 文档（浏览器）：<https://platform.openai.com/docs/api-reference/videos/create>
- OpenAI 新版文档（markdown）：<https://developers.openai.com/api/reference/resources/videos.md>
- openai-python `Video` 对象：<https://github.com/openai/openai-python/blob/main/src/openai/types/video.py>
- openai-python 创建参数：<https://github.com/openai/openai-python/blob/main/src/openai/types/video_create_params.py>
- openai-python `seconds` 枚举：<https://github.com/openai/openai-python/blob/main/src/openai/types/video_seconds.py>
- openai-python `size` 枚举：<https://github.com/openai/openai-python/blob/main/src/openai/types/video_size.py>
- openai-python 任务内错误对象：<https://github.com/openai/openai-python/blob/main/src/openai/types/video_create_error.py>
- openai-python `input_reference` 参数：<https://github.com/openai/openai-python/blob/main/src/openai/types/image_input_reference_param.py>
- openai-python `Videos` 资源（含 poll/弃用注解）：<https://github.com/openai/openai-python/blob/main/src/openai/resources/videos.py>

**聚合站 / 中转站**
- new-api（OpenAI Video Format）：<https://github.com/QuantumNous/new-api-docs/blob/main/docs/en/api/openai-video.md>
- 88API 视频 API 完整规范：<https://88api.ai/zh/docs/api/video/video-api-standard/>
- APIMart Sora2 视频生成：<https://docs.apimart.ai/cn/api-reference/videos/sora2/generation>（本机直连不通，经镜像 <https://docs.apib.ai/cn/api-reference/videos/sora2/generation> 读取）
- Infistar 视频生成与管理接口：<https://doc.infistar.cc/api-reference/video-generation>
- RouteAPI 创建视频任务：<https://www.routeapi.ai/docs/zh-tw/relay/videos/create-task/>
- RouteAPI OpenAI/Sora 格式：<https://www.routeapi.ai/docs/zh-tw/relay/videos/openai-videos/>
- AtlasCloud provider 仓库：<https://github.com/AtlasCloudAI/openclaw-atlascloud-provider>
- Atlas Cloud Media skill（端点/状态/输出字段）：<https://github.com/sickn33/agentic-awesome-skills/blob/6d4ea18320984083107f07ff69587fa355ee94c0/plugins/agentic-awesome-skills-claude/skills/atlas-cloud-media/SKILL.md>
- LiteLLM OpenAI Video：<https://docs.litellm.ai/docs/providers/openai/videos>

**第三方速查（仅用于交叉验证，非权威）**
- Sora Video API quick reference：<https://github.com/davila7/claude-code-templates/blob/e9313e608066c3170d101caa4a689c8b58b0a12a/cli-tool/components/skills/video/sora/references/video-api.md>
- Sora 2 参考（含价格转述）：<https://github.com/captaincrouton89/.claude/blob/24375dea78fd0381b5ecd2f3c3b38384e8419ef0/examples/docs/external/sora.md>
