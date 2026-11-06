# 三份文档交叉评审报告（doc-review）

| 项 | 内容 |
|---|---|
| 评审对象 | `docs/product-scope.md`（范围基线）、`docs/PRD.md`（FR 编号）、`docs/TECH-DESIGN.md`（DDL/API/适配/计费/迁移/排期） |
| 参考输入 | `docs/recon/frontend-inventory.md`、`docs/recon/openai-video-protocol.md`、参考实现 `D:\software\desk\infinite-canvas\web`（只读） |
| 评审快照 | **2026-11-03 23:42**（scope 23:30:13 / TECH 23:40:41 / PRD 23:31:20）。评审期间三份文档被持续修订，本报告已按最新版本复核；TECH 在 23:40 新增 `GET /api/public/settings`、`PUT /api/auth/profile` 两行，全文行号相对早期版本 +1/+2，引用以本快照为准。若文档继续变更，请按「章节 + 关键字段」定位。 |
| 严重级别 | **P0 = 必须改**（不改则主链路失败 / 资金或安全错误 / P0 需求无实现路径）；**P1 = 建议改**（会造成返工、AC 不达成或运营风险）；**P2 = 可选**（一致性、体验、文档治理） |
| 已核验的外部事实 | ① Spring Boot 3.3.5 的 `spring-boot-dependencies` 托管 `flyway.version=10.10.0`，且 BOM 含 `flyway-mysql`（TECH 说法正确）；② MyBatis-Plus 官方文档：v3.5.9 起 `PaginationInnerInterceptor` 已从主包分离，必须单独引入 `mybatis-plus-jsqlparser`（TECH pom 缺失）；③ MySQL 8.0.12 支持 `FOR UPDATE SKIP LOCKED`（8.0.1+）、`utf8mb4_0900_ai_ci`（8.0.0+）、`DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)`（5.6.5+），TECH 的 DDL 规避项判断成立。 |

**评审期间已被作者修复、不再计入本报告的问题（记录备查）**

| # | 原问题 | 现状 |
|---|---|---|
| 1 | 管理员重试语义在 PRD §9.3.4 / FR-ADMIN-08 与 TECH §6.4 之间矛盾（「沿用原 HOLD 不重复扣费」vs「重新 HOLD」） | PRD 已改为「新建任务并按当前价格重新预扣，原失败任务已自动退款」（PRD L271、L365），与 TECH §6.4 retry 一致，冲突消解 |
| 2 | 维护公告（FR-GLOBAL-03 P0）无用户端读取接口 | TECH 已补 `GET /api/public/settings`（L575，返回 `registrationOpen/notice/exchangePerYuan`），接口层已具备；前端展示任务待补（见 P2-08） |
| 3 | FR-AUTH-04「修改昵称」无接口 | TECH 已补 `PUT /api/auth/profile`（L581） |

---

## 1. 结论

**不建议按当前版本直接进入 M1，但结论是「有条件通过」：7 个 P0 全部是设计/配置层修补，不涉及产品范围变更，关闭后即可开工。**

三份文档的三方一致性总体好于同类项目：Q1–Q10 一一对应、M1–M5 划分、计费公式与默认系数、路由与角色矩阵基本对齐，协议适配层与前端五步裁剪的设计质量高。真正的风险集中在 **工程可实现性**：时区基准、轮询领取的事务边界、结算/退款互斥、`storageKey→fileNo` 语义替换后的媒体链路，以及「本地 mock 上游」与 SSRF 防护的设计冲突——这四项若不先裁决，M1/M5 会出现「代码写完但链路跑不通」或「账对不上」。

前端方案中「保留函数签名、画布/导出代码几乎不用改」的判断在 `fileNo` 语义下不成立（参考实现有两处按 `:` 前缀判定媒体，见 P0-06），这是最容易被低估的返工点。建议 M0 的验收口径改为：**P0 全部关闭 + scope 回写 3 项 + OpenAPI/mock 上游两份交付物补齐**，再冻结接口契约进入 M1。

---

## 2. P0 问题表（7 项）

> 证据格式：`文档 §章节 L行号`。行号基于 2026-11-03 23:42 快照。

| 编号 | 维度 | 文档位置（证据） | 问题 | 建议修改 |
|---|---|---|---|---|
| **P0-01** | C | TECH §4.1 L266、§4.3 L282（`DATETIME(3) ... DEFAULT CURRENT_TIMESTAMP(3)`）、§7.9 L766-771（`next_poll_at <= NOW(3)`）、§8.7 L888（`expires_at < NOW(3)`）、§12.3 L1227（`DB_URL` 只写 `serverTimezone=UTC`） | **时间基准不自洽**：方案声明「DATETIME(3) 存 UTC」，但建表默认值、轮询条件、兑换过期判定都走 MySQL 的 `CURRENT_TIMESTAMP(3)` / `NOW(3)`（取会话 `time_zone`；本机未设置 `default-time-zone`，默认即系统时区，通常为 +08:00）；连接串的 `serverTimezone` 在 Connector/J 8.0.23+ 只影响驱动转换，**不会**设置会话 `time_zone`（需 `connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true`）。若应用侧按 UTC 生成 `next_poll_at`/`deadline_at`（§7.9 语义即如此），则 `next_poll_at <= NOW(3)` 恒为真（差 8 小时）→ 3/5/8/12/20s 退避全部失效、每秒打上游；兑换码过期判断偏差 8 小时；`deadline_at = created_at + 30min` 跨时区口径不一致。 | 三选一并写进方案，禁止留空：①MySQL 配 `default-time-zone='+00:00'`，并在连接串加 `connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true`；②所有时间由应用生成（DDL 去掉 `DEFAULT CURRENT_TIMESTAMP`，SQL 不用 `NOW()`，统一以参数传入）；③统一使用 +08 并显式换算。同时在 §7.9 注明 `next_poll_at`、`deadline_at`、`created_at` 各自由谁写入，并加一条「退避生效」集成测试（断言下一次 `next_poll_at` ≈ now+3s）。 |
| **P0-02** | C | TECH §2.1 L109、§2.7 L177（依赖清单）、L201（MP 冲突备注） | **MyBatis-Plus 3.5.9 分页依赖缺失**：官方文档明确「于 v3.5.9 起 `PaginationInnerInterceptor` 已分离出来，需单独引入 `mybatis-plus-jsqlparser`」。当前 pom 只引 `mybatis-plus-spring-boot3-starter`，而所有列表接口（资产/任务/画布/流水/管理端）都依赖分页拦截器 → `MybatisPlusConfig` 编译或启动即失败。L201 的兜底只讨论「升 3.5.10.1」，没有覆盖该缺依赖问题。 | 在 §2.7 pom 增加 `com.baomidou:mybatis-plus-jsqlparser:${mybatis-plus.version}`（版本与主包一致），并在 T1.1 验收里加「启动后分页接口 `total` 正确」；若团队坚持不引 jsqlparser，则所有分页查询改写为手写 `COUNT` + `LIMIT`（不推荐）。 |
| **P0-03** | C/A | TECH §1.4 I2 L91、§8.3 L847-848、§8.5 L884、§7.9 L777（30min deadline）、§7.10 L796（下载总预算 900s）；PRD §9.3.5 L366 | **结算/退款互斥不足，可能「又退又扣」**：I2 声称「`idempotency_key` 唯一索引保证一个 task 最多一条 SETTLE、一条 REFUND」，但两个键不同（`settle:{taskNo}` / `refund:{taskNo}`），唯一索引只防同类重复，**不能阻止同一任务同时落 SETTLE 与 REFUND**。§8.5 的「若 SETTLE 已存在则拒绝 REFUND」是先查后写；具体并发窗口：轮询到 `completed` → 进入 `DOWNLOADING`（下载预算最长 900s）→ 30min `deadline_at` 到点走 `EXPIRED`+REFUND，同时下载线程写 SETTLE，两笔幂等键互不冲突 → 用户既退款又被结算，8.9 对账②只检查「SUCCEEDED 必有 SETTLE / 非 SUCCEEDED 必有 REFUND」，两条都满足，**对账查不出来**。 | ①终态资金操作统一用单键 `finalize:{taskNo}`（SETTLE 与 REFUND 共用同一唯一键），使二者物理互斥；或给 `video_task` 加 `finalized_at DATETIME(3) NULL` + `UPDATE ... WHERE finalized_at IS NULL` 做 CAS；②把 `DOWNLOADING` 排除在 deadline 判超之外（或 deadline 取 `max(created+30min, download_started+900s+缓冲)`）；③明确 SETTLE/REFUND 的 `balance_after` 取值规则；④补并发单测：20 线程对同一 task 同时触发 settle/refund，断言只有一笔落地、`available+frozen` 守恒。 |
| **P0-04** | C/B | TECH §8.8 L893、§4.3 L350（状态枚举）、§4.4 L406-407；PRD FR-BILL-07 L205、§9.4 L371 | **并发上限校验有竞态且漏计状态**：8.8 写「创建事务内 `SELECT COUNT(*)` 活跃任务 + 锁 `credit_account` 行（与 HOLD 同事务天然串行）」，但未规定两条语句的先后。若先 COUNT 后锁：两个并发请求都看到 1 个任务 → 都通过 → 第 3 个任务被放行（FR-BILL-07 AC 失败）。另外计数集合若只取 `QUEUED/RUNNING`，会漏掉 `CREATED/SUBMITTING/SUBMIT_UNKNOWN/DOWNLOADING`——创建事务先插 `CREATED` 再异步提交，正是最容易越限的窗口。 | 事务内固定顺序：先 `SELECT ... FROM credit_account WHERE user_id=? FOR UPDATE`（锁账户行）→ 再统计「全部未终态任务」（`CREATED/SUBMITTING/SUBMIT_UNKNOWN/QUEUED/RUNNING/DOWNLOADING`）→ 再 HOLD + 插任务；或给 `credit_account` 加 `running_count` 计数列，HOLD/REFUND/SETTLE 时原子增减，创建时以计数判断。补 20 线程并发创建测试（上限 2，断言成功数恰为 2）。 |
| **P0-05** | C | TECH §7.9 L762-781、§1.3 L63-85、§12.4 L1242-1243（Hikari `maximum-pool-size: 10`）、L1253（poller threads 8） | **轮询领取的事务边界未定义，存在长事务/重复领取两难**：`SELECT id ... FOR UPDATE SKIP LOCKED` 必须在事务内才有意义。若与上游调用同事务：create 预算 90s、query 20s、content 900s，单线程持锁数十秒到 15 分钟，8 个 poller 线程 + Hikari 10 连接会被打满，且行锁阻塞其它轮询；若不在同一事务：语句结束即释放锁，而 `next_poll_at` 未改变，多实例/多线程会**重复领取同一个 `CREATED` 任务 → 重复 create → 上游重复扣费**（7.9 自己也强调 create 绝不盲重试）。 | 明确两阶段领取：①短事务只做「领取」：`UPDATE video_task SET status='SUBMITTING', next_poll_at=#{leaseUntil} WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)` 后立即提交；②出网调用在事务外；③回写用 `UPDATE ... WHERE id=? AND status='SUBMITTING'` 的 CAS；④加 `poll_owner`/`poll_lease_until`（或复用 `next_poll_at` 做租约）并写进 §7.9；⑤崩溃恢复逻辑（L780）按租约过期处理。 |
| **P0-06** | D/C | TECH §10.4 L1025（「保留函数签名，`storageKey` 语义改为 fileNo（画布节点/导出代码几乎不用改）」）、§10.8 L1104、§10.6 L1069；参考实现 `web/src/services/file-storage.ts:63-67`、`web/src/lib/canvas/canvas-export.ts:17-18,67-71`、`web/src/pages/canvas/index.tsx:53`、`web/src/lib/canvas/canvas-generation-helpers.ts:38-39` | **`storageKey→fileNo` 后媒体链路断**：参考实现用「key 里是否含 `:`」来识别媒体（`collectMediaStorageKeys` / `collectStorageKeys` 均判断 `typeof key === "string" && key.includes(":")`），用 `startsWith("image:")` 区分图片/视频 Blob 库。fileNo 是 26 位 ULID **不含冒号** → ①画布「导出 ZIP」的 `files[]` 为空（FR-CANVAS-09 AC「导出后在另一账号导入仍可播放」直接失败）；②`cleanupUnusedMedia` 把 fileNo 当非媒体、清理逻辑失效；③`canvas-generation-helpers.ts:38-39` 的 `startsWith("image:")` 判定让画布图片节点无法作为 `@` 参考图；④`pages/canvas/index.tsx:53` 导入时按前缀选 Blob 库，导入重写 fileNo 后会走错分支。「保留函数签名」只解决了签名，没解决这些前缀启发式。 | 在 §10.4/10.8 明列 4 处改动并给验收：①删除「含冒号/`image:`」判定，改为按 `file_object.kind/content_type`（或统一元数据）判断媒体类型；②导出前统一 `fileNo → fetch(signedUrl)`；③导入写回 fileNo 并保留旧前缀兼容分支（一次性迁移）；④`pages/canvas/index.tsx`、`pages/video/index.tsx` 补入改造清单（见 P1-12）；⑤加回归用例：画布含图片+视频节点 → 导出 ZIP → 另一账号导入 → 两类节点均可播放。 |
| **P0-07** | C/E | TECH §5.7 L507-525（`SsrfGuard`：禁 loopback/私网/非白名单端口/非 https）、§4.5 L422（`security.allow_private_upstream=false`）、§15.2 Q1 L1403（「无，先用 MockWebServer」）、§13.2 L1307（MockWebServer 集成测试）；PRD §15 Q1 L474、scope §9 Q1 L178 | **「本地 mock 上游」与 SSRF 防护互斥，Q1 默认方案不可执行**：MockWebServer/本地 mock 只能跑在 `127.0.0.1:随机端口 + http`，必然命中 `SsrfGuard` 的 loopback / 私网 / 非 443 / 非 https 拒绝，且 seed 默认 `allow_private_upstream=false`。若集成测试走真实渠道校验链路，13.2 的四种方言用例全部会被拦；M1「用 mock 上游跑通创建→轮询→成功→扣费→下载」与 M2/M5 的「真实上游（或 mock）端到端」都没有可执行路径。 | ①在 `application-dev.yml/it.yml` 显式设置 `security.allow_private_upstream=true` + `allowHttp=true` + 端口白名单（并写明只允许 dev/test profile）；②`SsrfGuard` 增加 profile 开关的测试用例（dev 放行、prod 拒绝）；③交付一个可独立运行的 `mock-upstream`（4 种方言 + 可控延迟/失败/`200+failed`/JSON 伪装，见附录 B），M2–M5 用它联调；④§12.8 种子数据给 mock 渠道（dev profile）。 |

---

## 3. P1 问题表

| 编号 | 维度 | 文档位置（证据） | 问题 | 建议修改 |
|---|---|---|---|---|
| **P1-01** | A | TECH §10.7 L1076-1086（`/` 在 `RequireAuth` children 内）；scope §2 L20（访客可浏览产品介绍页）、§3.4 L97；PRD §5.1 L120、§8.2 L298 | 访客首页被鉴权包住：`/` 放在 `RequireAuth` 路由组，未登录访问首页会 302 到 `/login`，与「访客可浏览产品介绍页」「未登录：产品介绍 + 登录/注册按钮」矛盾，也影响注册转化（无法先看产品）。 | 把 `/` 移出受保护组，做 `PublicLayout`（未登录=产品介绍，已登录=工作台概览）；或在 `RequireAuth` 内对 `/` 特判。补 AC：未登录打开 `/` 200 且可见登录/注册入口。 |
| **P1-02** | A | scope §3.4 L119（`/admin/redeem-codes` 独立路由）；PRD §5.2 L137；TECH §11.2 L1146（`pages/{login,dashboard,channels,models,users,plans,tasks,settings}`）、L1159（兑换码塞进 settings 页） | 管理端页面清单缺「兑换码」独立页：TECH 只规划 8 个页面，把批次生成/导出/作废塞进系统设置页；而 scope 与 PRD 都要求独立路由 `/admin/redeem-codes`，FR-ADMIN-07 的能力（批量生成、列表、作废、导出）在一张「设置」页里既超出页面职责也没有列任务号。 | 二选一并回写：①新增 `pages/redeem-codes/index.tsx` + 菜单 + `T4.3` 拆分；②若合并进设置页，需在 scope/PRD 回写路由变化并经用户确认（scope 是唯一基线，不能单方面改）。 |
| **P1-03** | B | PRD FR-ADMIN-08 L271（退款、取消）、§5.2 L138（任务监控含退款）、§8.7 L329（详情抽屉「重试/退款按钮」）、权限矩阵 L405、M4 L436（「调账/退款/重试可用」）；TECH §6.4 L627-629（只有 retry）、§11.2 L1158（详情 Drawer 只写「失败重试」） | 管理端「退款 / 取消」无接口也无页面动作：PRD 将退款、取消列为 P0（FR-ADMIN-08、M4 完成标准、权限矩阵），TECH 的管理端任务接口只有 `retry`，没有 `refund`/`cancel` 端点，也没有幂等键、审计与状态校验规则；M4 完成标准无法验收。 | 补 `POST /api/admin/tasks/{taskNo}/refund`（仅终态且无退款时、幂等键 `admin-refund:{taskNo}`、写 `REFUND` + 审计 + 原因必填）与 `POST .../cancel`（仅非终态，走用户取消同一条状态机）；在 §6.4/§11.2/§13.4 增加对应契约、按钮与 E2E；或经用户确认后把这两项降级为 P1 并回写 PRD。 |
| **P1-04** | B | PRD FR-BILL-03 L201、scope §3.2 L46、§2 L64（手工充值）；TECH §6.4 L623-624（`credits` 调账只写 ADJUST，`plan` 开通只写 PLAN_GRANT）、§8.3 L849-851（`RECHARGE`/`order:{no}` 幂等键） | 手工充值到账链路缺接口：scope/PRD 要求管理员后台手工充值（FR-BILL-03 的「联系管理员」），TECH 只有 `POST /users/{id}/credits`（ADJUST 流水）与 `plan` 开通，没有写 `RECHARGE` + `plan_order` 的充值端点 → 用户流水类型是「管理员调整」而非 PRD 的「充值」，`RECHARGE`/`order:{no}` 两个设计元素在接口层不可达。 | 增 `POST /api/admin/users/{id}/recharge {amount, remark}`：写 `plan_order(MANUAL, PAID)` + `RECHARGE` 流水（幂等键 `order:{orderNo}`）+ 审计；或在 PRD §9.4 明确「手工充值即 ADJUST + 备注」并回写语义。 |
| **P1-05** | B | TECH §4.3 L314-324（`plan_order`/`user_plan` DDL）、§8.3 L849（`order:{no}`/`plan:{orderNo}` 幂等键）、§6.4 L624（管理员开通套餐 `{planId, reason}`，不产生 order） | 订单/套餐链路悬空：`plan_order`、`total_recharged`、`RECHARGE` 在接口层没有创建路径；管理员手工开通套餐只写 `PLAN_GRANT` 流水，不生成 `plan_order`，于是 `plan:{orderNo}` 里的 `orderNo` 未定义，两套幂等键无法落地。 | 明确三种入账路径与幂等键：①兑换码（`redeem:{codeId}`，无 order）；②管理员充值（生成 `plan_order(MANUAL)`，`order:{orderNo}`）；③管理员开通套餐（生成 `plan_order(GRANT)`，`plan:{orderNo}`）。同步补 `plan_order` 状态机与 `user_plan.expires_at` 计算规则；未使用的字段/键删除。 |
| **P1-06** | B | TECH §8.3 L842-851（HOLD/SETTLE/REFUND 各写一行）；PRD FR-BILL-02 L200（流水类型仅 6 类：注册赠送/充值/兑换/消费/退款/管理员调整）、§9.1 L343 | 用户可见流水语义未定义：数据库会为每个任务写 HOLD（`available -X`）和 SETTLE（`available +(held-actual)`）两行，若 `/api/account/transactions` 直出，用户会看到「预扣 -120」「结算 +0」两条，与 PRD 的 6 类流水（没有 HOLD/SETTLE 类型）对不上，AC「每笔扣费可点进关联任务」也无法对应到哪一行。 | 定义用户流水视图：`HOLD` 展示为「冻结/预扣」且不计入消费，`SETTLE` 展示为「消费」（金额=`settled_credits`），`REFUND` 展示为「退款」，或在服务端按 task 聚合为一行；`biz_type` 对用户映射为中文枚举；`balance_after` 统一为「该笔完成后的可用余额」并写测例。 |
| **P1-07** | A/B | TECH §6.4 L630（批量生成「明文只出现一次」）、L632（`GET /redeem-codes/export` CSV）、§8.7 L888（`redeem_code.code` 明文存库） | 兑换码「明文只出现一次」与「导出 CSV」互斥：既然提供导出，就必然能在任意时刻取回明文；而 DDL 又明文存储 `code`（未哈希）。安全承诺与功能同时成立不了，运营也可能导出泄露。 | 明确口径并落实现：①`code` 不入库、只存哈希 + 掩码，导出只给掩码（推荐，但兑换需按哈希查）；或②保留明文与导出，但去掉「只出现一次」文案，导出加二次确认 + 权限 + 审计（写 `audit_log`），并限制导出频率。 |
| **P1-08** | A | TECH §12.7 L1280（Nginx `client_max_body_size 120m`）vs §5.6 L501、§12.4 L1245（200MB 单文件 / 220MB 请求）；PRD FR-ASSET-02 L252（视频 ≤200MB） | 生产 Nginx 只放行 120MB，而上限是 200MB：>120MB 的上传会在 Nginx 层 413，与 PRD「视频 ≤200MB」和 TECH「multipart 200MB」冲突，且用户看到的是网关错误而非中文提示。 | 统一为 `client_max_body_size 220m`（与 `max-request-size` 对齐）或按运营上限收紧到 120MB 并回写 PRD/TECH；在 §12.7 标注三处上限必须同源（system_setting / servlet / Nginx）。 |
| **P1-09** | C/D | TECH §9.3 L955-959（签名 URL TTL 900s、前端过期前 60s 重取）、§10.8 L1104（节点渲染走 `resolveMediaUrl(fileNo)`）、§9.4 L962 | 签名 URL 15 分钟过期与长会话冲突：画布/资产页的 `<video>` 与 `<img>` 在打开时取一次 URL，编辑超过 15 分钟后播放、拖动进度条、重新渲染缩略图会 403；§9.3 只对「任务详情内联 URL」给了 60s 重取，画布/资产列表没有刷新策略。 | 在 `resolveMediaUrl` 层做 URL 缓存（记录 `expiresAt`，到期前 60s 静默重取）并给 `onError` 重试一次；或对画布/资产场景发 1h TTL 的 URL；§10.8 明确「长会话播放失败 → 自动刷新 URL + 续播位置」的交互，并在 E2E-10 增「打开画布 >15min 后播放」用例。 |
| **P1-10** | C | TECH §9.3 L959（「校验 sig + 未过期 + `u == 当前登录用户`」）vs L952-955（`<video>`/`<img>` 无法带 `Authorization`） | 媒体鉴权描述自相矛盾：`<video src>`/`<img src>` 不会携带 Authorization 头，服务端拿不到「当前登录用户」，`u == 当前登录用户` 无法校验；若实现为需要登录态，媒体播放必然 401。 | 明确媒体端点 `permitAll`、仅凭 `HMAC(secret, fileNo/exp/u) + exp` 鉴权（携带 `u` 只为审计/防盗链定位），删除「与当前登录用户比对」的描述；若要绑定会话，只能改为 HttpOnly Cookie + 签名，成本更高（P1 再评估）。 |
| **P1-11** | A/D | scope §3.3 L85、§9 Q9 L186、PRD FR-CANVAS-12 L243（隐藏入口、代码保留）vs TECH §10.6 L1067（⑤ 清残留含「project.tsx 的图片编辑对话框」）、L1069（裁剪后目标 1,800–2,200 行，括号「保留图片编辑则 ≈3,000」） | 画布图片编辑工具的处置自相矛盾：Q9/FR-CANVAS-12 已定「隐藏入口、代码保留、P1 再评估」，但五步法第⑤步把「图片编辑对话框」列入删除/清残留，且行数目标 1,800–2,200 只有删掉这约 700 行调用才成立，与「保留」互斥。按不同理解排期会差 2–3 人日且回归风险不同。 | 明确第⑤步「只删入口与不可达调用，不删对话框组件与 `lib/canvas/canvas-image-data.ts`」；行数目标改为 ≈3,000；把「图片编辑工具 P1 删除」单列为后续任务；在 T3.5 验收里加「入口不存在、无残留报错、代码仍可编译」。 |
| **P1-12** | D | TECH §10.4 L1006-1033（改造文件表）；参考实现盘点 §9.4/§9.3 | 五步裁剪的「文件级清单」遗漏关键改造点：`pages/video/index.tsx`（802 行，GenerationLog/localforage 日志→服务端历史的核心页面）、`pages/canvas/index.tsx`（130 行，项目列表/导入导出，`storageKey` 前缀分支在这）、`components/canvas/canvas-config-node-panel.tsx`（184）与 `canvas-config-composer.tsx`（380）的 image/text/audio 模式、`canvas-node-generation.ts`/`canvas-generation-helpers.ts` 的 dataURL/Blob→fileNo 参考图链路、`asset-picker-modal.tsx`（资产选参考图）。这些都不在 10.4 表内，却直接决定 FR-VID-03/07/08、FR-CANVAS-04/08、FR-ASSET-06/07 能否落地。 | 在 §10.4 补齐上述文件与动作：①`pages/video` 历史改服务端 + 删除 `video_generation_logs`；②`pages/canvas/index` 项目列表接云端 CRUD + 导入重写 fileNo；③配置节点/对话框只剩 video 模式（image/text/audio 不可达）；④`NodeGenerationContext.referenceImages` 改携带 fileNo（删除 dataURL 转换）；⑤`asset-picker` 接入服务端分页资产。每项给验收命令（typecheck + 手测路径）。 |
| **P1-13** | D | TECH §10.6 L1069（「`taskNo` 写入 `metadata.videoTaskNo`（复用原 `videoTaskId` 字段）」）；参考实现 `project.tsx:323,333,380`、`canvas-generation-helpers.ts:126`（`hasResumableVideoTask` 依赖 `videoTaskId`/`videoTaskProvider`） | 刷新恢复的字段命名自相矛盾：既说 `metadata.videoTaskNo`，又说「复用原 `videoTaskId` 字段」；参考实现恢复逻辑（`hasResumableVideoTask`、`completeVideoNodeTask`、`pollVideoNodeTask`、清理失败态时 `videoTaskId: undefined`）都绑定 `videoTaskId`/`videoTaskProvider`，若改名会牵动 5 处以上判断且容易漏改导致「刷新后重复提交任务」。 | 保留字段名 `videoTaskId`（值存平台 `taskNo`），删除 `videoTaskProvider` 分支（平台统一 taskNo），并明列需改的 4 处：`hasResumableVideoTask`、`completeVideoNodeTask`、`pollVideoNodeTask`、`handleRetryNode`；加 E2E「生成中刷新→不新建任务且能恢复」。 |
| **P1-14** | C | TECH §4.3 L341（`capability VARCHAR(16) NOT NULL DEFAULT 'VIDEO'`）vs §6.3 L583（`GET /api/models?capability=video`）、§4.4 L402-411（枚举字典未登记 capability） | 模型能力大小写不一致：DB 默认写 `'VIDEO'`，用户端查询参数是 `capability=video`，若按字面过滤（`WHERE capability='video'`）则查不到任何模型 → 用户端模型下拉为空、创作台不可用；管理端能力标签也未约定大小写。 | 统一小写（`video`）并改 DDL 默认值 + seed；或在 API 层统一 `toLowerCase()` 归一化；在 4.4 枚举表登记 `ModelCapability`，并在 6.3 明确入参枚举；加集成测试「后台建模型→用户端列表可见」。 |
| **P1-15** | C | TECH §4.3 L354（`next_poll_at DATETIME(3) NULL`）、§7.9 L768（`next_poll_at <= NOW(3)`）、§1.3 L67（INSERT `status=CREATED`，未提 `next_poll_at` 初值） | 创建任务时未规定 `next_poll_at` 初值：DDL 允许 NULL，扫描条件 `NULL <= NOW(3)` 恒为 NULL，新任务永远不会被轮询器领取 → 卡在 `CREATED`（M1 主链路直接失败）。 | 创建事务内写 `next_poll_at = created_at`（或 `UTC_TIMESTAMP(3)`），并在 T1.7 验收里加「创建后 ≤2s 任务进入 SUBMITTING」；或在 SQL 中 `WHERE (next_poll_at IS NULL OR next_poll_at <= NOW(3))`。 |
| **P1-16** | A | TECH §14 L1346（阶段人日）、L1381-1382（4 人并行 5 周；串行链 M2→M3→M4→M5） | 排期与人力不匹配：前端 C 承担 M2 17 + M3 14 = **31 人日**，且 M2→M3 串行；5 周按 25 个工作日算只有 25 人日，乐观估算仍差 6 人日（≈1.5 周），再叠加 M5 的 7 人日与 20% 缓冲更不可达。文档说「D 在 T4.1 后可完全并行」，但未把 M3 的 T3.1/T3.4 分给 D。 | 二选一并写进 §14：①把 T3.1（删 Agent/插件/音频，3 人日）与 T3.4（导入导出，2 人日）交给 D，C 只留 19 人日；②把总工期改为 6.5 周，或明确「5 周只到 M4，M5 另计 1 周」。同时把 M5 对 Q1 真实上游的依赖写成门禁（无账号则 M5 验收降级为 mock 出片，需用户确认）。 |
| **P1-17** | C | TECH §6.3 L584（multipart 含 `references(文件)`）、§7.4 L513（「用户参考图只收 `fileNo`，不接受 URL」）、§10.5 L1038-1044（前端先 `POST /api/files` 再传 `referenceFileNos`） | 创建接口入参自相矛盾：契约里同时允许「文件 part」和「fileNo 数组」，而 7.4 的信任模型（参考图只信任平台已上传文件）与 10.5 的前端实现都只发 fileNo。若实现文件 part，会把 200MB 级 multipart 放进创建接口，破坏「同键同参可重放」的幂等语义（重放要重新上传），也让 `request_hash` 无法覆盖文件内容。 | 6.3 删除 `references(文件)`，只保留 `referenceFileNos`（JSON 数组，≤7）；在 6.1 补充幂等语义「同键重放不再上传参考图」；`request_hash` 的组成写清（modelId/prompt/seconds/…/fileNo 列表），文件内容一致性由 fileNo 的唯一性保证。 |
| **P1-18** | C | TECH §4.6 L439 / §9.5 L968（`file_object.ref_count=0` 且 >7 天再删物理文件）、§6.3 L589（删除任务「结果文件引用计数 -1」）vs §4.3 L371-377（`file_object` DDL 无 `ref_count` 列） | 引用计数不存在：三处依赖 `file_object.ref_count`，但 19 张表里没有该列也没有引用关系表；而资产的 `file_id`、画布 `document_json` 里的 fileNo 都是隐式引用，无法用一条 SQL 维护计数 → 删除任务/资产后的物理清理与「删除任务不影响已保存资产」（FR-VID-07 AC）无法实现。 | 增加 `file_object.ref_count INT NOT NULL DEFAULT 0` + 明确增减时机（资产保存/删除、任务删除、画布保存时登记/回收），或新增 `file_ref(file_id, owner_type, owner_id)` 表；画布 JSON 内的引用在保存时解析登记；补删除任务/资产后「文件仍在、引用归零后 7 天清理」的单测。 |
| **P1-19** | B | PRD FR-ASSET-03 L253（封面「上传或自动取视频首帧」）、FR-VID-08 L222（历史卡缩略图/首帧）；TECH §9.4 L962（ffmpeg P1、MVP 前端 `preload="metadata" #t=0.5`）、§4.3 L380（`asset.cover_file_id`） | 封面/缩略图无实现路径：FR-ASSET-03 的「自动取视频首帧」在 MVP 没有服务端实现（ffmpeg P1），也没有规定 MVP 由谁生成并上传 `COVER` 文件；FR-VID-08 的历史卡首帧缩略图同理。前端用 `<video>` 渲染大量卡片会带来明显性能问题（列表 20 条=20 个视频解码器）。 | MVP 落地「浏览器截图」方案：复用参考实现 `captureVideoFrame`（`lib/canvas/canvas-video-frame.ts`）在保存资产/任务完成时截首帧 → `POST /api/files(kind=COVER)` → `asset.cover_file_id`；或明确 MVP 不做自动封面、支持手工上传，并回写 PRD AC。 |
| **P1-20** | B | PRD FR-ADMIN-02 L265（「近 7 日任务与消耗趋势」）；TECH §6.4 L613（dashboard 只回聚合指标）、§11.4 L1183（6 个 StatCard + 纯 Tailwind 条形图） | 概览「近 7 日趋势」缺数据：dashboard 接口没有按天的序列（`tasksByDay/creditsByDay`），前端只有静态条形图，FR-ADMIN-02 的 AC「数据与列表页一致」无法验证趋势部分。 | dashboard 响应增加 `trend: {date, tasks, credits}[]`（7 天，一次 GROUP BY），前端条形图接该序列；补 AC「改价/生成后趋势数值与列表一致」。 |
| **P1-21** | B | PRD FR-ADMIN-09 L272（单文件大小上限「修改后即时生效（无需重启）」）；TECH §5.6 L501（servlet `max-file-size` 启动固定）、§12.4 L1245、§4.5 L419（setting `file.max_upload_*_mb`） | 「单文件大小上限即时生效」只能部分实现：应用层可读 setting 拒绝超限文件（可即时调小），但**调大**超过启动时 `spring.servlet.multipart.max-file-size` 不允许（Tomcat 在解析阶段就拒绝），AC 在任何情况下都无法 100% 达成。 | 明确口径：setting 只能 ≤ 启动配置，UI 上加提示；或改为「Nginx/Tomcat 上限固定、应用层可调小」并回写 PRD AC 为「≤ 启动上限时即时生效」；同时在 §12.4 增加 `server.tomcat.max-swallow-size=-1`（否则 200MB 超限请求可能被重置而不是返回 413 中文提示，见 P2-17）。 |
| **P1-22** | B | PRD FR-ADMIN-07 L270（批量生成可设「前缀」）；TECH §4.3 L325-330（`redeem_code` 只有 `batch_no`，无 `prefix`）、§6.4 L630（生成参数无 prefix） | 兑换码「前缀」缺失：FR-ADMIN-07 要求生成时可按前缀组织（便于区分渠道/活动），DDL 与 API 都没有 prefix 字段，只能用 `batch_no` 近似，运营无法按前缀检索/导出。 | 增加 `redeem_code.prefix VARCHAR(8) NULL` 或让 code 生成规则包含前缀（`PREFIX-XXXX-XXXX`），在生成接口与列表筛选中暴露；或经用户确认去掉「前缀」需求并回写 PRD。 |
| **P1-23** | C | TECH §5.2 L461-469（「`@Order(2)` UserJwtAuthFilter / `@Order(1)` AdminJwtAuthFilter」，未写 `securityMatcher`） | JWT 双链的安全边界没有写成可实现的规则：若只注册两个 Filter，`/api/admin/**` 在 Admin 过滤链「无 admin token 就 continue」时会落到 User 链，被用户 token 通过（越权）；若实现为两条 `SecurityFilterChain`，必须显式 `securityMatcher("/api/admin/**")` + `.anyRequest().hasRole("ADMIN")`，否则顺序/默认链不可靠。FR-AUTH-07 的 AC（用户 token 调管理接口 403、admin token 调用户接口 403）目前只是文字承诺。 | 在 §5.2 写清：链 1 `securityMatcher("/api/admin/**")` + `.authorizeHttpRequests(anyRequest().hasRole("ADMIN"))` + `permitAll` 仅 `/api/admin/auth/login`；链 2 `securityMatcher("/api/**")` + 用户鉴权；`/api/admin/**` 在链 2 显式 deny。§13.1 `JwtServiceTest` 增加两条越权断言（真实 MockMvc 请求，而非只测 token 解析）。 |
| **P1-24** | C | TECH §5.1 L456-457（refresh 轮换 + 「检测到已吊销 token 复用 → 吊销该用户全部 token」） | 多标签页并发刷新会误判：两个标签同时 `POST /auth/refresh`，一个先轮换成功，另一个用旧 token 触发「复用检测」→ 吊销该用户全部 token，用户被强制登出（Chrome 多标签是最常见场景）。 | 增加 60s 复用宽限（旧 token 在 `revoked_at + 60s` 内复用视为并发刷新，返回同一个新 token 或让客户端重试）或按 token family 判定复用；在 §5.1 写明并补单测「两并发 refresh 只轮换一次且不吊销」。 |
| **P1-25** | A | scope §3.2 L53（渠道「协议类型（openai）」）、§3.2 L60（运营审计 P1）、PRD FR-ADMIN-10 L273（P1）；TECH §6.4 L634（已实现 `GET /api/admin/audit-logs`）、§7.2 L677-682（4 种协议档位）、§4.4 L410（`AVATAR`）、§8.3 L851（`SETTLE_ADJUST`）、§6.4 L613（渠道健康） | scope 基线与 TECH 实现/预留不一致，且 TECH §16（L1423-1435）的差异表未登记：①scope 只写 openai 单协议，TECH 落地 4 档位；②审计是 P1，TECH 已建表 + 接口 + 仪表盘；③`AVATAR`、`SETTLE_ADJUST`、`auth_type/auth_header/extra_headers`、渠道健康均为 scope 未列项。scope 自述「唯一范围基线，冲突以本文为准」，若不回写会让后续验收口径分裂。 | 在 scope §3.2 回写：协议档位（至少 openai-official/newapi，JSON/dual 为 P1）、审计是否随 M4 交付（建议：表+写审计随 M1，查询接口 P1）、渠道鉴权变体与额外 header；TECH §16 增加一行「协议档位 4 种 + 审计查询接口超出 scope，需回写」。若用户不接受范围变更，则 TECH 需把 P1 项移出 M1–M4 排期。 |
| **P1-26** | B/C | TECH §6.3 L596（`POST /api/assets/{assetNo}/publish-to-canvas` `{projectNo,x,y}` → `{nodeId,version}`）vs §4.6 L441（设计决策：「画布文档是前端 schema，**后端不应理解其内部结构**，只校验大小与版本」）、§10.8 L1102-1103（前端 800ms 防抖 + 版本号串行保存） | 资产「插入画布」的 API 与画布文档所有权矛盾：服务端要追加节点就必须解析/改写 `document_json`（理解 node schema、分配 nodeId、+version），与 4.1 的设计决策直接冲突；且该接口会并发修改 `version`，与前端 800ms 防抖自动保存的乐观锁形成竞态（前端拿着旧 version PUT 会 409，甚至覆盖插入的节点）。FR-ASSET-06 是 P0，必须有确定实现。 | 二选一：①改为纯前端实现——`GET /api/assets/{assetNo}` 拿到 fileNo 后，由前端在画布 store 里构造节点并走既有 `PUT /api/canvas-projects`（推荐，符合 4.1）；②若保留后端插入，则在 §4.1 明确「node schema 由后端理解、版本随画布升级」，并定义与自动保存的互斥协议（插入时前端暂停保存、返回 version 后强制 reload），同时补并发测试。 |

---

## 4. P2 / 建议表

| 编号 | 维度 | 文档位置 | 问题/建议 |
|---|---|---|---|
| **P2-01** | A | PRD §9.3.2 L363（`frozen -= fee、consumed += fee`）vs TECH §8.2 L833（`available += (held-actual)`、`total_consumed += actual`） | 结算口径措辞不同：PRD 写成整笔结算，TECH 允许按实际价格多退少补（`settled_credits`）。建议 PRD §9.3.2 补「按实际参数结算，差额退回「可用」并写 SETTLE 一条（含差额）」；并明确 `SETTLE_ADJUST` 是否 P1。 |
| **P2-02** | C | TECH §4.4 L406-407（对外状态只写 `queued`(前 4 态)/`running`/…） | `DOWNLOADING` 的对外映射缺失（既不在前 4 态，也不在 `running` 的说明里），前端可能收到未知状态。建议显式写 `DOWNLOADING → running`。 |
| **P2-03** | C | TECH §6.3 L591（媒体下载 `?dt=`）vs §9.3 L955（`?exp&u&sig=`） | 同一端点的鉴权参数出现两种形式（token vs 三参数），实现会二选一导致另一处文档失效。建议统一为 §9.3 的 `exp/u/sig` 并改 6.3。 |
| **P2-04** | D | TECH §11.2 L1139（`basename="/admin"`）vs L1150-1159（路由表写 `/admin/login`、`/admin/channels`） | 路由表与 basename 重复前缀（会变成 `/admin/admin/login`）。建议路由表改为 `/login`、`/channels`…，或去掉 basename。 |
| **P2-05** | A | PRD FR-AUTH-01 L186（密码 8–32 位）vs TECH §5.3 L477（8–64 字符） | 密码长度规则不一致，前后端提示与校验会打架。建议统一为 PRD 口径（8–32）并同步后端 `@StrongPassword`。 |
| **P2-06** | A | PRD FR-VID-02 L216（提示词 ≤2000 字）vs TECH §7.4 L712（prompt ≤4000 字） | 上限不一致。建议统一（建议 2000，参考实现也是前端限制）并写进 §6.3 契约。 |
| **P2-07** | A | PRD FR-VID-05 L219（预估 = 单价×时长×分辨率系数）vs PRD §9.2 L348（含音频系数） | 预估公式漏音频系数：当 `audio_factor≠1` 时前端预估与后端 `PricingService` 不一致。建议前端预估直接调后端报价接口（或返回 pricing 快照后本地算），禁止两处公式。 |
| **P2-08** | A | PRD §8.2 L297（首页「最近 3 条生成 + 积分卡」）、§5.1 L125（账户页）、scope §3.4 L103（`/account/recharge`）；TECH §10.7 L1083、§14 T2.6 L1364、§6.3 L575（新增 `/api/public/settings`） | 页面细节未落到任务/文件清单：首页已登录概览（最近生成/积分卡）、公告条展示（新接口已备）、`/account/recharge` 独立路由均未在 10.3/10.4/T2.6 出现；`/canvas/:projectNo` 与 scope `/canvas/:id` 命名不一致。建议在 T2.6 拆出「首页两态 + 公告条」验收，并在路由对照表统一参数名。 |
| **P2-09** | A | scope §3.1 L35（导入/导出「JSON/ZIP」）vs TECH §10.8 L1106（仅 ZIP）、§10.4 L1028（资产 zip 降级 JSON 导出） | scope 提到 JSON 导出，TECH 只实现 ZIP；资产页由 zip 改 JSON 的 UX 变化未在 PRD 页面设计体现。建议回写 scope 或补 JSON 导出说明。 |
| **P2-10** | A | TECH §4.1 L268（「软删除：仅 user/asset/canvas_project 用 deleted_at」）vs §4.3 L280-284（`user` 无 `deleted_at`）、§4.6 L437（只列 asset/canvas_project） | `user` 软删除表述与 DDL 不符（用户侧只有 `status=DISABLED`）。建议改为「用户不软删，仅禁用」，并在 §4.1 与 §4.6 统一。 |
| **P2-11** | C/E | TECH §4.3 L344（`max_reference_images INT NOT NULL DEFAULT 1`）、§4.5 L424-427（seed 只有套餐）、§12.8 L1289（DemoDataSeeder 无示例字段） | 示例/种子数据不足且默认值反产品：`max_reference_images` 默认 1，而 PRD 卖点是「最多 7 张参考图」，管理员不配置时用户只能传 1 张；seed 没有真实形态的渠道/模型示例（`supported_seconds`/`sizes`/`resolution_factors`）。建议 seed 给一个 7 张、480p/720p/1080p 系数齐全的示例模型（dev profile），并在 §12.8 写明演示数据清单。 |
| **P2-12** | C/E | TECH §7.11 L798（每条 `upstream_call_log` 必落，含 4KB `response_snippet`）、§4.3 L365-370 | 写放大与保留策略缺失：一个 30min 任务按 3→20s 退避会产生 90–600 条 query 日志，每条约 4KB → 单任务 0.4–2.4MB；100 并发任务时日志表会超过业务表。建议 query 调用按需采样（成功且状态未变的只留 1 条/窗口）、`response_snippet` 只在异常/状态未知时落、并给 `upstream_call_log/video_task_event` 定保留期（如 90 天）。 |
| **P2-13** | C | TECH §2.1 L108（MySQL 8.0.12） | 版本事实正确（`SKIP LOCKED`/`utf8mb4_0900_ai_ci`/`DATETIME(3)` 默认值均可用），但 8.0.12 是 2018 年版本、早已停维护，缺安全补丁。建议 M5 前评估升级到 8.0.3x+（PHPStudy 可替换版本），或至少在 §15.1 风险表登记「数据库版本安全风险」。 |
| **P2-14** | C | TECH §6.4 L616（连通性测试「`GET /v1/models` + 可选最小 create 探测」） | 最小 create 探测会**真实消耗上游额度/计费**，管理员点一次「测试连接」可能扣费。建议默认只做 `GET /v1/models`，create 探测需二次确认并提示「会消耗上游额度」，结果写入 `last_test_message`。 |
| **P2-15** | A | scope §5 D4 L136（套餐「管理员开通，周期赠积分」）vs PRD §9.4 L375（本期不做自动续费/到期扣减，套餐积分一次性入 available） | 「周期赠积分」与「一次性入账」语义不同。建议 scope D4 明确「本期套餐=一次性积分包+有效期标签，周期赠积分 P1」。 |
| **P2-16** | C | TECH §4.4 L402-411（枚举字典只有 TaskStatus/CreditBizType/ChannelProtocol/AssetKind/…） | 缺少 `ModelCapability` 与大小写契约：DDL 用大写（`VIDEO/IMAGE/TEXT`、`UPLOAD/VIDEO_RESULT`），API 查询参数用小写（`?kind=video`、`?capability=video`），未定义映射。建议在 6.1/6.2 统一「API 层小写、DB 层大写，Mapper/DTO 归一化」。 |
| **P2-17** | C | TECH §12.4 L1245（`spring.servlet.multipart`） | 未设 `server.tomcat.max-swallow-size`：上传超过 200MB 被 Tomcat 拒绝时，默认只 swallow 2MB，剩余请求体可能导致连接重置/413 无响应，用户看不到中文超限提示。建议 `max-swallow-size: -1`（或 220MB）并配合前端预校验。 |
| **P2-18** | C | TECH §8.9 L901-922（对账 SQL） | 对账②只能发现「缺 SETTLE/缺 REFUND」，发现不了「又 SETTLE 又 REFUND」（P0-03）与「`balance_after` 错」；建议增加③「同一 task 同时存在 SETTLE 与 REFUND」与④「`balance_after` 与账户差值不一致」两条检查，纳入 T5.2。 |
| **P2-19** | E | TECH §14 L1344-1381（任务拆解） | 缺少以下任务号：软删/孤儿文件清理 Job（4.6/9.5 有策略无任务）、日志/数据保留、磁盘容量检查（9.5 的 <5GB 策略）、备份恢复演练（9.5）、mock 上游（13.2 只有测试内嵌）。建议在 M5 增加 T5.5「运维与数据治理」2 人日。 |

---

## 5. 三份文档已知的良好设计（避免误伤）

1. **计费三段式 + 幂等键 + 定价快照**：`HOLD→SETTLE/REFUND`、以任务状态机 + 唯一键防重复扣退、创建时把 `credits_per_second/resolution_factor/seconds` 写进 `params_json.pricing`（TECH §8.2-8.4），事后调价不影响历史账。方向与取舍（先扣后结算防超额）正确。
2. **资金 SQL 的单语句条件更新**：`UPDATE ... WHERE available >= ?` / `WHERE frozen >= ?` 是正确思路（优于先查后改），并明确「只有 BillingService 能改余额」（§3.2），把资金正确性收敛到一个包。
3. **对外 ULID + 不建物理外键 + 显式 `ENGINE=InnoDB`/`utf8mb4`**：DDL 覆盖了 phpstudy 的 MyISAM/utf8 默认值（§12.2），这是本机环境最容易踩的坑，处理得当；不建外键 + 软删除的组合也避免了迁移地狱。
4. **管理员与用户物理分离**（独立表 + 独立 `aud` + 独立 SPA + 独立存储键，§5.2）：比 `user.role` 方案安全，能挡住「注册 DTO 漏 `@JsonIgnore` 即提权」这类问题。
5. **结果强制落盘 + HMAC 签名 URL + Range**（§9.3/§10.10）：`<video>` 不能带 Authorization 的论证、静态目录可枚举盗链的风险、下载失败绝不回退上游 URL（§7.10）——这三条都对，且是参考实现最大的结构性缺陷的正解。
6. **协议适配层的正确抽象**（§7）：`ChannelProfile` 档位 + `VideoProviderAdapter` SPI + 状态别名表 + 信封解包 + 结果 URL 优先级 + `SUBMIT_UNKNOWN` 宽限，与侦察报告高度一致；「Poller 只认 CreateCommand/TaskState」的边界很清晰。
7. **DB 驱动轮询 + SKIP LOCKED + 退避 + deadline**（§7.9）：不用 `@Scheduled`+内存队列、天然多实例安全、宕机不丢任务；退避表、抖动、429 冷却、崩溃恢复都写到了。
8. **版本矩阵基本正确**：Boot 3.3.5 托管 Flyway 10.10.0 且 BOM 含 `flyway-mysql`（已核验）；MySQL 8.0.12 对 DDL 用到的 `FOR UPDATE SKIP LOCKED`、`utf8mb4_0900_ai_ci`、`DATETIME(3)` 默认值全部支持，且 DDL 主动规避了 `DEFAULT (expr)` 与 `CHECK`（8.0.13+/8.0.16+），说明作者查过 8.0.12 的边界。
9. **前端五步裁剪法 + 每步 typecheck/test 必绿**（§10.6）与「先删路由→再删入口→最后清代码」的顺序，针对 `project.tsx` 3,476 行的强耦合是合理策略；保留函数名/字段名只换实现的思路本身正确（问题只在 `:` 前缀启发式，见 P0-06）。
10. **SSRF 三道入口 + 解析后逐 IP 校验 + 关闭重定向 + 不带上游 Authorization 到第三方 host**（§5.7）：覆盖了 Base URL、结果 URL 两道不可信入口，且明确「用户参考图只收 fileNo」从根上消除用户 URL 被上游拉取，设计优于侦察报告的建议。
11. **Q1–Q10 三份文档一一对应**（scope §9 L176-187 / PRD §15 L472-483 / TECH §15.2 L1401-1410 附近），编号、默认值、影响面一致；这是很多项目做不到的基线纪律。
12. **M1–M5 划分与 §14 任务拆解自洽**：五个阶段的人日加总（26/17/14/11/7=75）正确，依赖关系（`T1.7←T1.6` 等）基本合理，M1 先冻结接口契约、前端对 mock 并行的策略正确。

---

## 6. 附录 A：需要作者确认的开放问题（新增，不重复 Q1–Q10）

| # | 问题 | 为什么必须回答 | 影响 |
|---|---|---|---|
| O-01 | 媒体（`<video>`/`<img>`）鉴权是否接受「凭签名 URL 即可播放」（链接可被转发）？TTL 900s 内被分享的责任边界？ | §9.3 同时写了「签名」和「校验当前登录用户」，物理上不可兼得（P1-10） | 安全模型与客服口径 |
| O-02 | `publish-to-canvas`（FR-ASSET-06）由前端 PUT 画布文档实现，还是后端解析 `document_json` 追加节点？若后端解析，画布 node schema 升级如何兼容？ | 与 4.1「后端不解析画布 schema」直接冲突（P1-26）；并影响前端 800ms 自动保存的乐观锁竞态 | API 契约、T3.3 工作量 |
| O-03 | 结算/退款互斥用「单幂等键 `finalize:{taskNo}`」还是「`finalized_at` + 状态 CAS」？M5 对账是否要覆盖已发生的双写历史？ | 决定 P0-03 的修法，影响对账口径 | 资金正确性、测试用例 |
| O-04 | 用户可见流水是否展示 HOLD（预扣）与 SETTLE（结算）两行？「消费」金额取 `held` 还是 `settled`？ | PRD 的 6 类流水与实现的 9 类 `biz_type` 需要映射（P1-06） | 前端流水页、财务对账 |
| O-05 | 管理员重试「按当前价格重新预扣」意味着同一作品用户可能付两次钱（原任务已退款），是否接受？UI 是否需要明示？ | PRD 已改成这个语义，但用户视角是「失败重试还要再扣一次」 | 计费投诉风险、文案 |
| O-06 | 手工充值是否需要生成 `plan_order`（用于财务对账/开票）？谁开票、如何冲正？ | `plan_order`/`RECHARGE`/`total_recharged` 目前无入口（P1-04/P1-05） | 财务流程、M4 范围 |
| O-07 | 时区基准最终选 UTC 还是 +08？MySQL 能否改 `default-time-zone`（phpstudy 的 my.ini 可改？） | P0-01 的三条修法各有运维成本 | 全链路时间、轮询、对账 |
| O-08 | 数据库是否允许从 MySQL 8.0.12 升级到 8.0.3x+（或换 3306 端口/改字符集）？ | 8.0.12 已停维护（P2-13）；升级会触发一次回归 | 安全、M5 风险 |
| O-09 | 「本地 mock 上游」是否升级为「可独立运行的 mock 服务」（含 4 方言与可控故障）？M5 在无真实账号时是否接受 mock 出片作为验收通过？ | Q1 默认方案与 SSRF 冲突（P0-07）；M5 验收标准「全绿」需要定义 | M5 验收、交付物 |
| O-10 | C/D 前端联调契约以哪份为准：springdoc 自动生成，还是手写 `docs/openapi.yaml` 并做契约测试？ | 现在只有「M1 交付第 6 章 + Swagger」，没有冻结产物（附录 B） | M2/M4 返工量 |
| O-11 | 套餐是否需要「周期赠积分」？若本期只做一次性积分包，scope D4 是否回写？ | scope D4 与 PRD §9.4 语义不一致（P2-15） | 套餐模型、`user_plan` 设计 |
| O-12 | 生成结果永久保留（Q7 默认 `retention_days=0`）与容量估算（TECH §9.5：约 150GB/月）如何取舍？谁负责扩容与清理？ | 文件保留策略会变成运营事故点 | 存储成本、清理 Job |

---

## 7. 附录 B：实现前缺失的交付物（E 维度建议补充项，仅列清单，不代写）

| # | 交付物 | 现状 | 建议做法 |
|---|---|---|---|
| E-01 | 冻结的 OpenAPI 契约（`docs/openapi.yaml`） | 只有「Swagger + 第 6 章表格」 | M1 用 springdoc 导出并提交仓库；前端以该文件生成类型/ mock；CI 做 `openapi-diff` 防破坏性变更 |
| E-02 | 可独立运行的 mock 上游服务 | 只有测试内嵌 MockWebServer（§13.2） | 提供 `tools/mock-upstream`（Node/Java 均可），实现 4 种方言 + 慢响应/失败/`200+failed`/JSON 伪装/私网地址样例；`application-dev.yml` 配 mock 渠道与 SSRF 例外 |
| E-03 | 真实形态的种子数据 | seed 只有 settings/plan；DemoDataSeeder 仅「enabled=false 示例渠道+模型」 | 给 3 个示例模型（含 `supported_seconds`/`sizes`/`resolution_factors`/`max_reference_images=7`/音频位）、1 个套餐、演示画布与资产；生产用 `AdminSeeder` 不写死哈希 |
| E-04 | 错误码 → 前端中文文案表 | §6.2 有错误码表，i18n 只写「新增 errors」 | 以 §6.2 为源生成 `src/i18n/errors.ts`（code→文案），后端保证 `message` 中文兜底；FR-GLOBAL-01 的 AC 用它验收 |
| E-05 | 数据库迁移回滚/基线策略 | Flyway 只前滚；M5 只演练「删库→恢复」 | 写 runbook：发布前备份、失败回滚（前滚修复脚本 vs 恢复备份）判定、`repair` 使用条件；禁止改已执行迁移文件 |
| E-06 | 数据保留与清理 Job | §4.6/§9.5 有策略（软删 30 天、tmp 24h、孤儿文件 7 天、`retention_days`）但无任务号/实现 | 增加定时任务与配置项（Cron）、清理顺序（DB→文件）、失败重试；在 §14 增加 T5.5 |
| E-07 | 日志脱敏规则落地 | §5.5 只有原则 | 产出脱敏字段清单（Authorization/api_key/password/签名 URL/prompt PII）+ `LogSanitizer` 正则样例 + 一条「日志中 grep 不到密钥」的验收命令 |
| E-08 | 磁盘容量与告警实现 | §9.5 有 `<5GB 拒绝接单` 策略，无实现细节 | 定时检查 + Micrometer gauge + 告警通道（邮件/webhook）；写运营清理 SOP；M5 演练一次「模拟磁盘满 → 503 且无半截文件」 |
| E-09 | 可执行的验收 smoke 脚本 | 只有手工 E2E 表（§13.4/13.5） | 提供 `scripts/smoke.ps1`：注册→建任务（mock）→轮询→下载→退款→对账 SQL 全 0 行；`scripts/seed-reset.ps1` 重建测试库 |
| E-10 | 前端 mock 方案 | 文档说 C/D 对 mock 开发，但没给 mock 形式 | 二选一：msw 拦截（推荐，契约来自 E-01）或静态 JSON + Vite mock 插件；给 `T2.1` 一个「无后端可跑通登录+模型列表」的验收 |
| E-11 | 性能/容量验证方案 | PRD §10 有指标（P95<300ms、100 进行中任务、100 节点 30fps），无测试方法 | 建议压测脚本（k6/JMeter）+ 画布 100 节点基准场景（拖拽/缩放 FPS）+ 前端 bundle 预算（TECH 13.3 已有 <1.5MB） |
| E-12 | 密钥与部署运维清单 | §12.3 列了环境变量，缺生成/轮换/注入 | 提供 `gen-secrets.ps1`（JWT_SECRET/DOWNLOAD_TOKEN_SECRET/KEY_ENC_SECRET）、密钥轮换方案（`v1:` 前缀已预留）、`systemd`/Nginx 安装步骤与健康检查 |
| E-13 | 上游成本对账流程与模板 | §8.9 有平台侧 SQL，无上游账单侧 | 定义每渠道账单录入/导出模板、差异阈值与处理流程（补单/退款/告警），R7「成本倒挂」需要它闭环 |
| E-14 | 定价与成本核算表 | 只有占位定价；`price_rule` 的 `costCredits` 是 P1 | M5 前给一张「上游 $/秒 × 系数 → 平台积分/秒 → 毛利率」表，至少覆盖 2 个真实渠道（依赖 Q1/Q2） |

---

## 8. 附录 C：A 维度逐项核对结果（速查）

| A 维度项 | 结论 | 证据/差异 |
|---|---|---|
| 功能范围（保留/删除） | **基本一致，3 处需回写** | 保留集三份一致；scope §3.3 删图片编辑→TECH 五步法第⑤步疑似删除（P1-11）；scope §3.2 单协议 vs TECH 4 档位（P1-25）；scope §3.1 JSON/ZIP vs TECH 仅 ZIP（P2-09） |
| 页面与路由 | **1 处矛盾 + 2 处缺失** | 访客首页被鉴权（P1-01）；管理端缺 `/admin/redeem-codes` 页（P1-02）；`/account/recharge`、`/canvas/:id` 命名（P2-08） |
| 角色权限 | **一致，1 处待明确** | 用户/管理员/访客能力三份一致；JWT 双链规则未写成 `securityMatcher`（P1-23）；管理员「退款/取消」无接口（P1-03） |
| 计费公式与系数 | **一致** | `ceil(积分/秒 × 分辨率系数 × 音频系数 × 秒)`、480p 1.0/720p 1.5/1080p 2.0、最低 1 积分、注册赠送 100 三份一致；PRD FR-VID-05 表述漏音频系数（P2-07） |
| 文件大小限制 | **一致，1 处部署冲突** | 20MB 图片/200MB 视频三份一致；Nginx 120m（P1-08）；单文件上限「即时生效」只能部分实现（P1-21） |
| 登录态时长 | **一致** | access 2h / refresh 30d 可吊销（PRD FR-AUTH-02 L187 / TECH §5.1 L455-457） |
| 软删除策略 | **基本一致，1 处内部矛盾** | asset/canvas_project 软删 30 天；`user` 表表述与 DDL 不符（P2-10）；`file_object.ref_count` 不存在（P1-18） |
| 里程碑 M1–M5 划分 | **一致，排期不可达** | 三段文档阶段内容与完成标准一致；C 的 31 人日 vs 5 周（P1-16） |
| 待确认问题 Q1–Q10 | **一一对应** | 编号、默认值、影响面三份一致；但 TECH 把「本地 mock 上游」具体化为 MockWebServer，与 PRD/scope 的「可运行 mock」不是同一事物（P0-07） |
