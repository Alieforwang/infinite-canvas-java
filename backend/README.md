# Canvas Studio Backend（M1 后端基座）

无限画布 · 视频生成平台后端：Java 17 + Spring Boot 3.3 + MySQL 5.7 + 原生 MyBatis + Flyway。

## 目录

```
backend/
├─ pom.xml
├─ scripts/
│  └─ smoke.ps1                 # 端到端 smoke：注册→兑换→创建任务→轮询→下载→对账
└─ src/main/
   ├─ java/com/infinitecanvas/
   │  ├─ common/                # ApiResponse/错误码/异常/RequestId/ULID
   │  ├─ config/                # 安全链、AppProperties（MyBatis 配置在 application.yml）
   │  ├─ controller/            # 用户端 + 管理员认证接口
   │  ├─ dev/                   # dev 专用：管理员播种、示例渠道/模型/兑换码、Mock 上游
   │  ├─ dto/                   # 请求/响应 DTO
   │  ├─ entity/ + mapper/      # 19 张表实体与 Mapper 接口
   │  ├─ gateway/               # OpenAI 兼容视频适配层 + 上游调用客户端
   │  ├─ job/                   # DB 驱动任务轮询器
   │  ├─ security/              # JWT、鉴权过滤器、当前用户
   │  └─ service/               # 认证、计费、渠道/模型、文件、任务、兑换
   └─ resources/
      ├─ application.yml
      ├─ mapper/*.xml          # ★ 手写 SQL（原生 MyBatis，改这里就能改行为）
      └─ db/migration/{V1__init.sql,V2__seed.sql}
```

## 本地启动（Windows / 本机已验证）

1. **MySQL 5.7**：本机 phpstudy MySQL 5.7.26，`127.0.0.1:3306`，root 密码 `123456`，库 `infinite_canvas_studio`（连接参数带 `createDatabaseIfNotExist=true`，空库会自动建表）。换机器只需改 `DB_URL/DB_USERNAME/DB_PASSWORD`。

2. **用 IntelliJ IDEA 启动（推荐，零环境变量）**

   - `File → Open` 选择 `backend/pom.xml`（或 backend 目录），Project SDK 选 **17**；
   - 打开 `Settings → Build, Execution, Deployment → Build Tools → Maven`，把 **User settings file** 指到仓库根目录的 `.mvn/settings.xml`（本地仓库 `.m2repo` + 阿里云镜像），然后在 Maven 面板点 **Reload** 拉依赖；
   - 直接运行 `com.infinitecanvas.CanvasStudioApplication`：
     - 默认 profile 就是 `dev`；`src/main/resources/application-dev.yml` 已内置本机数据库（3306 / root / 123456）与存储目录默认值，**无需配置任何环境变量**；
     - 默认工作目录是模块目录 `backend/`，所以存储根目录 `../storage` 正好落在工作区 `storage/`；
     - IDEA 控制台会打印 Mapper 执行的 SQL（`logging.level.com.infinitecanvas.mapper=debug`），方便对照 `resources/mapper/*.xml` 学习。
   - 启动后：`http://localhost:8080/actuator/health`、`/swagger-ui.html`。

3. **命令行方式（等价）**

```powershell
cd backend
mvn -s ..\.mvn\settings.xml -DskipTests package
java -jar target\canvas-studio-server.jar
```

   需要覆盖默认值时设置环境变量：`DB_URL / DB_USERNAME / DB_PASSWORD / STORAGE_ROOT`。

dev profile 自动创建：
- 管理员 `admin / Admin@123456`
- Mock 渠道 + 模型（`Mock 视频模型（本地联调）`）
- 兑换码 `WELCOME-1000`（1000 积分）；smoke 脚本另用 `SMOKE-5000`

3. **端到端 smoke**：

```powershell
cd backend\scripts
powershell -NoProfile -ExecutionPolicy Bypass -File .\smoke.ps1          # 用户链路
powershell -NoProfile -ExecutionPolicy Bypass -File .\smoke-admin.ps1    # 管理端/资产/画布
```

`smoke.ps1`：注册赠送 → 兑换码 → 模型列表 → 创建任务（预扣 60）→ 排队/生成/成功 → 签名 URL 下载（Range 206）→ 账户与流水 → 历史记录。
`smoke-admin.ps1`：管理员登录 → 概览 → 设置/公告 → 渠道 CRUD+连通测试 → 模型 CRUD → 用户调账/充值/开通套餐 → 套餐 CRUD → 兑换码生成/禁用/导出 → 任务监控详情 → 资产 CRUD → 画布创建/更新/乐观锁 409/删除。

4. **OpenAPI**：后端启动后访问 `/swagger-ui.html` 或 `/v3/api-docs`；已导出到 [docs/api/openapi.json](../docs/api/openapi.json)。

## 已验证行为（本轮）

| 用例 | 结果 |
|---|---|
| 注册赠送 100 / 登录 / refresh / me / 改昵称 | ✅ |
| 兑换码兑换 5000，流水 REDEEM | ✅ |
| 模型下发（参数、分辨率系数） | ✅ |
| 创建任务：能力校验、定价 60、HOLD、幂等键重放同 taskNo | ✅ |
| 轮询：queued → running → succeeded，结果落盘 2048B mp4 | ✅ |
| 成功结算：available 5100→5040，frozen 0，consumed 60 | ✅ |
| 失败退款：上游 failed → 积分全额退回 | ✅ |
| 签名 URL 下载、Range 206、篡改签名 403 | ✅ |
| 管理员登录、用户 Token 访问管理接口 403 | ✅ |
| 管理端概览/渠道/模型/用户/套餐/兑换码/任务/设置 | ✅（`smoke-admin.ps1`） |
| 资产库 CRUD（文本/图片/视频）与签名 URL | ✅ |
| 画布项目创建/列表/更新（乐观锁 409）/软删 | ✅ |
| 中文 UTF-8 端到端（模型名/资产标题/流水） | ✅（`verify-encoding.ps1`） |

> 2026-11 复验（MySQL 5.7 + 原生 MyBatis + Flyway 7.15.0）：`smoke.ps1`、`smoke-admin.ps1`、`verify-encoding.ps1` 全部通过；另单独验证了「用户取消任务 → 全额退款（冻结归零）」与后台概览（趋势/成功率/今日积分）接口。

> 编码说明：`pom.xml` 已显式设置 `project.build.sourceEncoding=UTF-8`；Windows PowerShell 5.1 控制台显示中文可能乱码，但数据库与 HTTP 响应均为 UTF-8（可用 `verify-encoding.ps1` 验证）。
> 运行脚本时若使用 Windows PowerShell 5.1，脚本需保存为 **UTF-8 with BOM**，否则中文字符串会被按 ANSI 解析。

## 本轮改造（数据访问层）

- **MyBatis-Plus → 原生 MyBatis**：删掉 `com.baomidou.*` 依赖与 `Wrappers` 用法；19 个 Mapper 接口 + `src/main/resources/mapper/*.xml` 手写 SQL；分页统一 `ORDER BY ... LIMIT #{offset}, #{limit}`；条件查询用 `<if>` / `<where>` / `<foreach>`。
- **数据库切到 MySQL 5.7**：`127.0.0.1:3306`、库 `infinite_canvas_studio`、`root/123456`；迁移脚本排序规则改为 `utf8mb4_unicode_ci`。
- **Flyway 固定 7.15.0**：Flyway 8+/9+/10 的社区版都不再支持 MySQL 5.7（划给 Teams 版），7.15.0 是最后仍支持 5.7 的社区版。因此 `application.yml` 里 `spring.autoconfigure.exclude` 关闭了 Boot 自带 Flyway 自动配置，改由 `config/FlywayConfig.java` 显式装配（启动时自动执行 `db/migration/V1、V2`；以后加表结构就新增 `V3__xxx.sql`）。
- **IDEA 零配置启动**：`application-dev.yml` 内置本机默认值，直接 Run `CanvasStudioApplication`（见上）。
- 想看 SQL 直接在 IDEA 控制台搜 `==>  Preparing`（轮询器每秒查询的 `VideoTaskMapper` 默认降到 info 防刷屏，需要时改成 debug）。

## 已知说明

- 管理员与用户两套 JWT `aud`，过滤器链 `securityMatcher` 隔离；JWT 过滤器已禁用 Boot 自动注册，避免拦截 `/mock` 等公开路径。
- 时区统一 UTC：JDBC `connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true` + Hikari `SET time_zone='+00:00'`。
- 积分流水 `HOLD/SETTLE/REFUND` 共用 `finalize:{taskNo}` 幂等键，结算与退款物理互斥。
- Mock 上游仅在 `dev` profile 启用（`/mock/**`），生产不会加载。
