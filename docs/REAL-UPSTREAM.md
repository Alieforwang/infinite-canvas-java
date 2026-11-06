# 真实上游接入记录（duoyuanx / 多元探索）

> 目标：把「支持 OpenAI 接口协议」的真实视频平台接入平台后端，验证端到端生成、落盘、计费。
> **所有渠道、模型、API Key、计费与系统参数都保存在 MySQL（`channel` / `model` / `system_setting` 表），由管理后台写入和修改，代码里没有写死任何供应商、模型名或密钥。**

## 1. 上游信息（来自官方文档）

| 项 | 值 |
|---|---|
| 文档 | https://document.duoyuanx.com/ （镜像：https://docs.deepwl.cn/duoyuanx/zh） |
| API Base URL | `https://duoyuanx.com` |
| 认证 | `Authorization: Bearer <API_KEY>` |
| OpenAI 视频兼容入口 | `POST /v1/videos`（JSON）、`GET /v1/videos/{task_id}`、`GET /v1/videos/{task_id}/content` |
| 统一视频入口（备选） | `POST /v1/video/generations`、`GET /v1/video/generations/{task_id}` |
| 状态值 | `queued` / `in_progress` / `completed` / `failed` / `cancelled` |
| 完成结果 | `video_url`（平台代理地址，可直接带 Key 下载）或 `/content` 二进制 |

## 2. 平台侧配置（数据库驱动，管理后台操作）

### 2.1 渠道（`channel` 表）

| 字段 | 值 |
|---|---|
| name | 多元探索 duoyuanx |
| protocol | **openai-json**（新增的协议档位：`/v1/videos` 使用 JSON body，而不是 multipart） |
| base_url | https://duoyuanx.com |
| api_key | **AES-GCM 加密存储在 `api_key_cipher`**，列表只返回 `api_key_mask`（`sk-u****Cb8e`） |
| enabled | 1 |

> 管理后台操作路径：`/admin/channels` → 新增渠道 → 选择协议档位 `openai-json` → 填写 Base URL 与 API Key → 保存 →「测试连接」（GET `/v1/models`，本机实测 1.08s、返回 90 个模型）。

### 2.2 模型（`model` 表，已上架）

| 字段 | 值 |
|---|---|
| upstream_model | `veo_3_1-fast` |
| display_name | Veo 3.1 Fast |
| supported_seconds | `4, 6, 8` |
| supported_sizes | `1280x720, 720x1280` |
| resolutions / ratios | `720p, 1080p` / `16:9, 9:16, 1:1` |
| pricing | 10 积分/秒，720p 系数 1.0、1080p 系数 1.8 |
| enabled / sort | 1 / 0（默认第一个模型） |

> 当前 Key 的分组中 `veo_3_1-fast` 可用；`grok-imagine-video` / `grok-imagine-video-1.5` 返回 503「该模型在您可用的分组中均未启用」。模型清单里还有 kling / seedance / wan / MiniMax / omni 等，可按需在后台增加 `model` 行（无需改代码、无需重启）。

### 2.3 请求映射（`OpenAiCompatVideoAdapter`，协议档位 `openai-json`）

创建请求发送 JSON 超集，兼容不同 JSON 方言：

```json
{
  "model": "veo_3_1-fast",
  "prompt": "...",
  "seconds": "4",
  "duration": 4,
  "size": "1280x720",
  "aspect_ratio": "16:9",
  "resolution": "720p"
}
```

模型级 `extra_request_params`（管理后台 JSON 字段）会合并进请求体，用于供应商私有参数；前端与后端均不写死字段。

## 3. 实测结果

| 项 | 结果 |
|---|---|
| 平台任务 | `01M6JNW8BFM1N6NC6K540N7G9T` → `succeeded`，耗时约 3 分钟 |
| 结果文件 | 平台落盘 9,696,535 bytes，`ffprobe`：h264 / 1280x720 / aac / duration 7.93s |
| 预览 | 平台签名 URL 播放正常（截图 `docs/screenshots/video-real.png`） |
| 计费 | 预扣 40 积分（4s × 10）→ 成功结算，available 540→500，consumed +40 |
| 上游调用日志 | `upstream_call_log` 记录 create/query/content 的状态码、耗时、脱敏响应片段 |
| 管理端 | 渠道/模型/任务页面均从 MySQL 读取并展示（截图 `admin-channels.png` / `admin-models.png`） |

## 4. 安全与配置约束

- API Key 只在创建/更新渠道时以请求体传入，落库前 AES-GCM 加密；任何接口都不返回明文，管理端仅展示掩码。
- 渠道和模型均存 MySQL，前端通过 `GET /api/models` 获取上架模型与计价快照；系统设置通过 `system_setting` 表下发。
- 修改价格/上下架/新增模型：管理后台操作，即时生效，不需要改代码或重启。
- 仓库与文档中不包含 API Key；本文档同样不记录明文 Key。
- 本地 Mock 渠道/模型是 dev profile 写入数据库的测试数据，可在管理后台停用或删除，不影响真实渠道。

## 5. 追加更多模型的步骤

1. 用 `GET /v1/models` 确认该 Key 分组可用的模型名（后台「测试连接」会返回模型列表）。
2. `/admin/models` 新增模型：填上游模型名、展示名、时长/尺寸/比例能力、积分定价，上架。
3. 用户端刷新即可在模型下拉看到并按新价格计费；失败时自动全额退款。
4. 若某模型字段方言不同，优先用模型级 `extra_request_params` 配置，仍不满足时再扩展 `ChannelProfile` 档位。
