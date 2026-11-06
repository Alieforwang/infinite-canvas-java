# 上游中转选型建议（2026-11）

> 目标：给本项目（OpenAI 兼容 `/v1/videos` 视频平台）挑**便宜、能长期用**的上游中转。
> 采集时间：2026-11-04（价格会变，接入前重抓一次）。
> 结论先行：
> 1. **现用的 duoyuanx 模型最全、协议已跑通，但对 Veo 3.1 Fast 的公开标价是 0.7/次（8 秒）**——如果这个 0.7 是美元，约 ¥4.7/条，比 88API 的 ¥1.2/8s 贵约 4 倍；如果是人民币，则约 ¥0.09/秒，已经很便宜。**先花 2 分钟用一笔 4s 任务的余额差把单位确认掉，再决定是否换。**
> 2. **要"可验证的便宜"：88API**（New API 底座，`POST /v1/videos` JSON，按秒计价公开可查）：Veo 3.1 Fast 720p ¥0.15/秒、1080p ¥0.20/秒、4K ¥0.30/秒；Gemini Omni 1.1 Flash 720p ¥0.20/秒。协议刚好是项目已有的 `openai-json` 档位，改后台配置即可接。注意：2026-08 核验时新用户注册入口曾关闭，先确认能注册。
> 3. **长期最优不是"更便宜的中转"，而是"自建中转"**：用 new-api / LiteLLM 把阿里云百炼、火山方舟、MiniMax、Google Vertex 的官方 key 包成 OpenAI 兼容的 `/v1/videos`，成本=官方价、无跑路风险、可开票、可对账；项目不用改代码。
> 4. **¥0.05/秒级别的站（Grok/Gemini 报价）基本是逆向/号池，只能小额试，不能当主业务上游。**
> 5. **Sora 2 API 已于 2026-09-24 停服**，`PRD` 里 `sora-2` 的模型位要换掉；Veo 3.1 的 `*-preview` ID 也于 2026-10-22 停用，接的时候确认上游映射到的是正式版/Vertex 渠道。

---

## 1. 项目对上游的硬要求

来自 `backend` 代码与 `docs/recon/openai-video-protocol.md`：

| 能力 | 现状 |
|---|---|
| 创建任务 | `POST /v1/videos`，支持 JSON（`openai-json`）与 multipart（`openai-official` / `newapi`）；Sub2API 使用 `POST /v1/videos/generations` JSON |
| 轮询 | `GET /v1/videos/{id}`，已兼容 `queued/in_progress/completed/succeeded/processing/pending/...` |
| 下载 | 优先读 `video_url/result_url/url`（含 `video`/`metadata`/`data`/`content` 嵌套及相对路径），失败再走 `/content` |
| 协议档位 | `openai-official`、`openai-json`、`newapi`、`json-envelope`、`dual-dialect`、`sub2api` |
| 渠道能力 | 每个渠道独立声明 `image` / `video`，可同时支持两者；模型类型必须在渠道能力范围内 |
| 计费 | 图片按“尺寸 + 每张积分”，视频按“分辨率 + 时长 + 每条积分”精确配置；旧的每秒基础价和分辨率系数仅作历史数据回退 |
| 模型路由 | 用户只看到逻辑模型；后台用相同 `modelKey` 配置多条渠道线路，并按正整数 `routeWeight` 加权选择可用线路 |
| 安全 | API Key AES-GCM 落库，仅返回掩码；渠道可单独设并发/超时 |

管理端新增/编辑模型可点击“同步当前渠道模型”，通过 `POST /api/admin/channels/{id}/models/sync` 获取上游目录。可选请求体 `{"modelsUrl":"/models"}` 指定列表路径，也可填写与渠道同源的完整 URL；该值仅用于当前同步请求，不持久保存。留空时自动尝试兼容列表地址；鉴权失败不会继续尝试其他地址。解析支持 OpenAI 的 `data[].id`、`models[].slug/id/name` 和根数组，并去重。列表保留上游公开的全部模型，不凭名称猜测媒体能力，也不自动创建线路或价格；图片模型仍须以渠道实际公开或文档提供的模型 ID 为准。

管理后台的规格价格规则格式如下，正常使用界面表格维护，无需手写 JSON：

```json
[
  {"resolution":"720p","seconds":4,"credits":30},
  {"resolution":"720p","seconds":8,"credits":55}
]
```

图片规则省略 `seconds`，例如 `{"resolution":"1024x1024","credits":12}`。视频创建时只有已配置价格的“分辨率 + 时长”组合可以提交，避免落入错误的通用价格。

客户画布可显式切换“生成图片 / 生成视频”，分别从 `/api/models?capability=image` 和 `capability=video` 加载目录。管理端尺寸预设仅供快速填写，需按渠道实际支持的尺寸保存；价格表中的每条规则就是客户端可选的完整规格，图片按张显示，视频按分辨率与时长组合显示，不交叉拼出未定价组合。

图片通过平台 `POST /api/image-tasks` 提交 `{modelKey,prompt,size,referenceFileNos:[]}`，携带 `Idempotency-Key`；该请求会等待同步生成，返回与视频任务兼容的 `TaskView`。服务端调用 OpenAI 兼容 `/v1/images/generations`（有参考图时为 multipart `/v1/images/edits`），将 `b64_json` 或下载的图片保存到平台文件存储；只返回本平台签名文件链接。图片任务编号以 `img_` 开头，恢复查询使用 `GET /api/image-tasks/{taskNo}`，不会进入视频轮询或视频取消接口。提交超时后保留原参数和幂等键，重试可恢复同一任务，避免重复冻结积分和重复生成。成功结算、失败退款、服务中断后逾期退款均由后端处理；上游 HTTP 请求不占用积分账户事务锁。图片暂不支持主动取消。


同一个用户可见模型需要多渠道时，为每条渠道线路创建一条模型记录，并填写相同的 `modelKey`。公开 `/api/models` 按 `modelKey + capability` 聚合，并直接以 `modelKey` 作为稳定的公开模型 ID；该组最早创建的记录是展示、能力和用户计费的规范配置，即使该物理线路停用也不会改变公开 ID。任务创建时先过滤停用渠道及不支持当前规格/音频/水印/参考图的线路，再按 `routeWeight` 比例随机选择，选定后整条任务固定使用该线路。旧客户端提交物理 `modelId` 时也会先解析回所属 `modelKey` 的规范配置，不能通过隐藏线路 ID 改变计费。各线路应保持展示名和用户价格一致，线路自身的规格规则同时用于上游兼容性过滤。

**结论：只要中转站说"OpenAI 兼容 `/v1/videos`"，本项目基本都能接；区别只在字段方言、状态词、结果 URL 和计费。** 新增渠道不需要发版。

---

## 2. 一手价锚点（2026-11）

> 用来判断"某个中转报价是不是真的便宜"。美元按 1 USD ≈ ¥7.1 粗算。

| 模型 | 规格 | 一手价 | 折合 ¥/秒 | 备注 |
|---|---|---|---|---|
| Veo 3.1 Fast | 720p / 1080p / 4K | $0.10 / $0.12 / $0.30 每秒 | ≈0.71 / 0.85 / 2.13 | Gemini API 正式版；带原生音频 |
| Veo 3.1 Lite | 720p / 1080p | $0.05 / $0.08 每秒 | ≈0.36 / 0.57 | 单条最长 8s，无 4K |
| Veo 3.1 标准版 | 720p/1080p / 4K | $0.40 / $0.60 每秒 | ≈2.84 / 4.26 | 贵，适合精品档 |
| Gemini Omni 1.1 Flash | 720p | ≈$0.10 每秒（token 折算） | ≈0.71 | Veo 预览版停用后的官方推荐视频模型 |
| MiniMax H3-Max | 480P / 768P | ¥0.33 / ¥0.50 每秒 | — | 中国站；H3 2K ¥0.80/秒 |
| Wan 3.0（万相） | 480P / 720P / 1080P | ¥0.30 / ¥0.60 / ¥1.20 每秒 | — | 阿里云百炼；按成功秒数收费 |
| Wan 2.7 | 720P / 1080P | ¥0.60 / ¥1.00 每秒 | — | 百炼 |
| Seedance 2.5 | 720p / 1080p | ¥1.51 / ¥3.74 每秒 | — | 火山方舟按 token 折算；BytePlus 约 $0.23/秒（720p） |
| Sora 2 / sora-2-pro | — | 已于 2026-09-24 从 OpenAI API 移除 | — | Azure 预览版最晚 2026-10-15 退役，**任何"低价 sora-2"都当风险项** |

> 判断口诀：**报价低于一手价 3 折的，问清楚是"官方 credits/批量采购"还是"逆向/号池"。** 前者可持续，后者随时断。

---

## 3. 候选对比

| 站点 | 底座/类型 | 视频协议 | 公开报价（采集日） | 充值/支付 | 评价与风险 |
|---|---|---|---|---|---|
| **duoyuanx（现用）** | New API 定制 | `POST /v1/videos` JSON（`openai-json`），已实测跑通 | 价目字段：`veo_3_1-fast=0.7/次`、`veo_3_1=0.8/次`、`MiniMax-H3=0.5/秒`、`kling-3.0-omni=1/秒`、`wan3.0-video=0.3/秒`、`grok-video=0.07`、Seedance 按 token 倍率 11.5–35 | 人民币，站内充值 | 模型最全（Veo/Omni/Grok/Kling/Wan/MiniMax/Seedance 都走 `/v1/videos`），2026-06 注册的较新站；**计价单位（美元/元）在价目里没写死，必须先实测一笔账单** |
| **88API** | New API | `POST /v1/videos` JSON；`/content` 只是归档跳转，结果用 `url` | 计费表达式（元/秒）：`veo-3.1-fast` 720p/1080p/4k = **0.15/0.20/0.30**；`gemini-omni-flash-1.1` = 0.20/0.25/0.35；`grok-imagine-video-1.5` = 0.08/0.16/0.22；`seedance-2.5` = 0.80/1.79/4.40；`wan3.0` = 0.35/0.60/0.90；`seedance-2.0-fast` = 0.27/0.57 | $1 起充（约 ¥6.65），支付宝/微信/USDT，可开票 | **Google/Grok 系约为官方 2 折，国产系接近官方+10~18%**；价格透明、协议匹配；2026-08 核验时新用户注册曾关闭，先确认 |
| **CheapBuddy** | 新站（2026-10 上线） | 明确 `POST /v1/videos` → `GET /v1/videos/{id}` → `/content`，OpenAI 风格 Bearer；有 `/v1/pricing` | 需注册后查（未公开） | 未公开 | 协议最贴项目、可只读询价；太新，先小额验证可用性与退款 |
| **Infistar（无限星河）** | 聚合 | `/v1/videos` multipart，状态词用官方 4 态，结果在 `metadata.url` | 需登录/询价 | 人民币 | 兼容性最稳，适合做**兜底**；价格不是最低 |
| **RouteAPI** | 自研路由 | 双方言：`/v1/videos` 与 `/v1/video/generations` | 美元，模型广场实时价 | USD | 有 `X-New-Api-Other-Ratios` 计费倍率头，适合对账；单价通常不是最低 |
| **APIMart** | 聚合 | `/v1/videos/generations` + `/v1/tasks/{id}`（json 信封） | 宣传：`sora-2 $0.08/秒`（模型已停服）、`Seedance 2.0 Mini $0.01056/秒` | $1 起，USD | 营销价低得反常（Seedance 比一手价低一个数量级），只能验真后小额用 |
| **island AI（codex789）** | 聚合 | OpenAI 视频风格 | 自报：Grok Imagine 1.5 **¥0.05/秒**、Gemini Omni 1.1 **¥0.05/秒**、Seedance 2.5 ¥2.50/15s | 未公开 | 约为官方 1 折，**疑似逆向/号池**；不要接正式业务 |
| **自建 new-api / LiteLLM** | 自建网关 | `/v1/videos`（OpenAI 兼容，new-api 支持按秒计费与视频模型） | = 官方价 + 服务器成本 | 自己的支付 | **长期最稳**：官方 key 自己管、无跑路、可开票、可对账；需 1–2 天部署与联调 |

> 价格口径提醒：88API 的 `/api/pricing` 只给计费表达式（`u("seconds") * 0.15`），本表按**元/秒**折算（与其人民币充值、国产模型定价一致）；duoyuanx 的 `model_price` 按 new-api 惯例应读作**每次/每秒的美元价**，但站内没标货币单位。**两家下单前都用一笔真实任务核对账单，别只看价目页。**

---

## 4. 推荐组合

### 方案 A（推荐，今天就能用）

1. **主渠道：继续 duoyuanx**（已跑通、模型最全、换渠道零代码）。
2. **备用/比价渠道：88API**（协议同档、Google 系便宜、人民币支付）。
3. **兜底渠道：Infistar 或 CheapBuddy**（只在主备同时故障时切，或按模型分流）。
4. 管理后台给每个渠道单独设并发/超时；同一 `modelKey` 的线路保持用户价格一致，渠道成本差异通过权重和运营对账管理。

切换成本：`/admin/channels` 新增渠道 → 协议选 `openai-json` → 填 Base URL/Key → 测试连接（`GET /v1/models`）→ `/admin/models` 为新渠道的模型配能力与价格 → 上架。**不需要改代码、不需要重启。**

### 方案 B（长期，成本最低）

自建 new-api（或 LiteLLM）作为统一视频网关：

```
平台后端 → http://gateway:3000/v1/videos（OpenAI 兼容）
              ├─ Google Vertex / Gemini（Veo 3.1 Fast、Omni）
              ├─ 阿里云百炼（Wan 3.0/2.7）
              ├─ 火山方舟（Seedance 2.5）
              └─ MiniMax 中国站（H3/H3-Max）
```

优点：成本=官方价；失败退款/计费口径可自己控；发票、合规、数据出境都可控；一个 `/v1/videos` 吃所有上游。  
代价：1–2 天部署 + 上游账号/企业认证；建议先跑通一个模型（Wan 3.0 最便宜、文档最全）再扩。

### 省钱操作（立刻能做）

- **duoyuanx 选对分组**：公开价目里的 `group_ratio` 显示 `gc-video=0.85`（国产视频 8.5 折）、`SD视频=0.9`（9 折）、`default=1.0`。买 Wan/MiniMax/Kling 走 `gc-video`，买 Seedance 走 `SD视频`，同样的模型直接省 10–15%。
- **88API 显式传低分辨率**：它按 `u("resolution")` 分档计价，不传时按模型默认档；请求里明确写 `720p`/`480p`，别让它按 1080p 预扣。
- **优先 fast/mini 档**：Seedance 2.0 Fast 720p ¥0.57/秒 vs 2.5 的 ¥1.79/秒；Veo 3.1 Fast ¥0.15/秒 vs 标准版约 ¥0.4+/秒。先用 cheap 档验证产品，精品档做付费升级项。
- **先用免费/赠送额度**：88API 新注册送测试额度；阿里云百炼华北 2 有 Wan 免费额度（万相 2.7 每模型 50 秒、3.0 30 秒，90 天有效），足够跑验证用例。

### 不建议

- 用 ¥0.05/秒级站点做**主渠道**（收入模型会被上游随时断供击穿）。
- 一次性充大额（任何中转都按"小额、按需、随用随走"）。
- 把同一个 Key 同时用于生产和高并发测试。

---

## 5. 现有定价必须校准（重要）

项目默认价是 `10 积分/秒`，按 `1 元=100 积分` 即 **¥0.1/秒**。用 88API 公开价做成本对照（8 秒 720p）：

| 模型 | 上游成本/8s | 现价收入/8s（80 积分=¥0.8） | 结论 | 建议价（约 30% 毛利） |
|---|---|---|---|---|
| Veo 3.1 Fast 720p | ¥1.20 | ¥0.80 | **亏 ¥0.40** | 20–25 积分/秒 |
| Gemini Omni 1.1 Flash 720p | ¥1.60 | ¥0.80 | 亏 | 25–30 积分/秒 |
| Grok Imagine 1.5 720p | ¥1.28 | ¥0.80 | 亏 | 20–25 积分/秒 |
| Wan 3.0 720p | ¥4.80 | ¥0.80 | 大亏 | 80–90 积分/秒 |
| Seedance 2.5 720p | ¥14.32 | ¥0.80 | 巨亏 | 230–250 积分/秒 |
| MiniMax H3-Max 768P | ≈¥4.00 | ¥0.80 | 大亏 | 65–75 积分/秒 |

校准公式（1 积分 = ¥0.01）：

```
积分/秒 = ceil( 上游 ¥/秒 × 失败与损耗系数(建议 1.10~1.15) × (1 + 目标毛利率) / 0.01 )
```

另外两点：

1. **分辨率系数要按上游实际加价改**：Veo Fast 1080p 只比 720p 贵约 33%（0.15→0.20），而当前系数 1.8 会收多；Seedance 1080p 是 720p 的 2.46 倍（1.79→4.40），系数 1.8 又不够。建议**按模型配置价格**，不要用一套全局系数。
2. **模型档位拆开卖**：Veo 3.1 Fast / Omni Flash / Grok 做走量档，Wan 3.0 做低价档，Seedance 2.5 / Veo 3.1 标准版做高价精品档。现在的"10 积分/秒一刀切"在真实上游面前必然倒挂。

---

## 6. 接入验证清单（每加一个渠道跑一遍，约 30 分钟）

1. **注册/充值**：最低充值、支付方式（支付宝/微信/USDT）、能否开票、注册是否开放。
2. **模型发现**：`GET /v1/models`，记下当前 Key 真正可用的 `id`（不要抄文档里的模型名）。
3. **最小任务**：4s、720p、文生视频一条；走 `POST /v1/videos`（`openai-json`）→ 轮询 → 取 `url` 下载 → 落盘 → 校验 `ftyp`/大小/时长。
4. **第二档**：8s、1080p 一条，确认 `seconds/size/resolution` 方言、状态词、以及**实际扣了多少余额**（充值前后余额差 = 这条的真实成本）。
5. **失败路径**：故意触发 4xx（错误模型名/超长秒数/敏感词），确认失败是否退款、错误体格式、任务是否卡死。
6. **并发**：同时 3 条，看 429/排队/进度；记录 P95 耗时。
7. **对账字段**：保存响应头（尤其 `X-New-Api-Other-Ratios`）、`usage`、余额差；写进 `upstream_call_log` 的 `response_headers`。
8. **后台配置**：渠道协议选 `openai-json`（88API/CheapBuddy）或 `openai-official`（Infistar），模型能力/价格/并发按实测填，上架一个小号灰度。

> 88API 的小坑：它的创建体只建议 `duration` **或** `seconds` 二选一、`ratio`/`aspect_ratio` 二选一。项目 `openai-json` 适配器目前是"超集"（同时发 `seconds`+`duration`、`size`+`aspect_ratio`+`resolution`）。duoyuanx 能容忍，88API 若返回 400，就把适配器改成**按渠道开关**只发一套字段（或对该模型用 `extra_request_params` 覆盖不了时就加一个小 profile）。

---

## 7. 风险与合规

| 风险 | 说明 | 应对 |
|---|---|---|
| 跑路/停服 | 中转站生命周期普遍 < 1 年；duoyuanx 2026-06 注册、88API 2026-05、CheapBuddy 2026-10 | 主备双渠道、小额充值、每日对账、余额预警 |
| 逆向/号池 | 报价 < 官方 3 折基本是共享号/反代，随时封禁、参数阉割、审核不可控 | 只做测试/活动，不接正式业务 |
| 计费不透明 | 按次/按秒/按 token 混用；失败不退；结果 URL 短命 | 落库 `usage`、抓倍率头、失败自动退款、完成后立即下载落盘 |
| 转售条款 | Google/字节/阿里/OpenAI 的服务条款可能限制转售、共享账号、跨境调用 | 商用优先企业协议/官方渠道；保留上游发票与调用日志 |
| 内容合规 | 视频生成涉及肖像/版权/敏感内容；平台需留存与审核能力 | 上游选有审核的官方渠道；平台侧加敏感词与人工审核（P1） |
| 密钥安全 | 渠道 Key 泄露=直接资金损失 | 一渠道一 Key、最小权限、轮换；现有 AES-GCM 掩码机制保持 |

---

## 8. 来源

- duoyuanx 公开价目：<https://duoyuanx.com/api/pricing>；文档：<https://docs.deepwl.cn/duoyuanx/zh/video-models>
- 88API 公开价目：<https://88api.ai/api/pricing>；视频规范：<https://88api.ai/zh/docs/api/video/video-api-standard/>；Google 规范：<https://88api.ai/zh/docs/api/video/google-video/>
- CheapBuddy 发布帖：<https://global.v2ex.co/t/1252929>
- Infistar 视频文档：<https://doc.infistar.cc/api-reference/video-generation>
- RouteAPI 模型定价：<https://www.routeapi.ai/docs/zh-tw/billing-quota/model-pricing/>
- APIMart 兼容说明：<https://docs.apimart.ai/cn/api-reference/videos/sora2/generation>
- Gemini 视频价格（Veo/Omni）：<https://ai.google.dev/gemini-api/docs/pricing>
- 阿里云百炼模型价格（Wan）：<https://help.aliyun.com/zh/model-studio/model-pricing>
- 火山方舟价格（Seedance）：<https://www.volcengine.com/docs/82379/1544106>
- MiniMax 价格：<https://platform.minimaxi.com/docs/guides/pricing-paygo>
- 一手/替代价参考：<https://www.aifreeapi.com/zh/posts/cheapest-sora-2-api>
- Veo 3.1 预览版停用说明：<https://ai.google.dev/gemini-api/docs/deprecations>
- new-api 视频协议：<https://github.com/QuantumNous/new-api-docs/blob/main/docs/en/api/openai-video.md>
- LiteLLM 视频代理：<https://docs.litellm.ai/docs/providers/openai/videos>
