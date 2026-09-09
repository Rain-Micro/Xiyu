# API 与模块文档（2.2.0）

> 本文是**权威接口文档**，与 `server/src/routes/` 一一对应。旧版（2.0.0 前）接口形态已废止，旧文档留档于 `modules-and-api.old.md`。
> 配套：`development-guide.md`（规范）、`security-constraints.md`（安全）、`README.md`（启动/端口）。

## 通用约定

- **Base URL**：开发 `http://localhost:3001`，生产 `http://101.132.47.12:443`
- **鉴权**：除"公开端点"外全部要求 `Authorization: Bearer <JWT>`（登录签发，7 天有效；单会话互斥——同账号新登录使旧 token 失效，5s 容差；封禁用户全端拒绝）
- **鉴权失败**：401 `{"error":"未登录|登录已过期…"}`；权限不足 403；封禁 403（含明确文案）
- **body 上限** 10MB（图片 base64）；JSON 错误响应统一 `{"error": string}`
- **CORS**：白名单（env `CORS_ORIGINS`，默认 `http://localhost:5173`；无 Origin 请求放行）
- 角色与状态在每次鉴权时按库中现值刷新（管理员变更即时生效）

## 端点总览

### 公开端点（无鉴权）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/health | 健康检查 `{status,timestamp}` |
| POST | /api/auth/register | 注册（body: phone/email 至少其一 + password + nickname? + smsCode；**手机与邮箱都强制验证码**；自动播种 5 内置助手）→ `{token, user}` |
| POST | /api/auth/login | 密码登录（`{account, password}`，account=手机/邮箱）→ `{token, user, restored?}` |
| POST | /api/auth/login/sms | 验证码登录（`{phone, code}`）→ `{token, user}` |
| POST | /api/sms/send | 发验证码（`{target, channel?}`；手机走 Spug（SMS_MODE=real）/邮箱走 SMTP；5 分钟过期、重发作废） |
| POST | /api/sms/verify | 独立校验验证码 |
| GET | /api/version | **热更新版本源**：`{tag_name, html_url}`（app_config 优先，env 兜底；未配置返回 `{}`） |
| GET | /api/announcements | 全站公告 `{announcement?}`（后台配置） |

### 受保护端点（Bearer）

**认证自助** `/api/auth`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /me | 当前用户（含 role/status/avatar_url 等） |
| POST | /change-password | `{oldPassword, newPassword}` |
| POST | /reset-password | 忘记密码（`{phone, code, newPassword}`，验证码校验） |
| POST | /change-contact | 换绑（`{phone?/email?, code}`，code 发往**新**联系方式；查重防抢占） |

**用户资料** `/api/users`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /me | 资料 |
| PATCH | /me | 更新昵称/生日/头像（头像=png/jpeg/webp dataURL ≤2MB，落盘 `data/avatars/`，库存相对路径 `/api/avatars/<file>`；前端经 `avatarSrc()` 拼接+带 token） |
| POST | /me/deletion | 注销排期（14 天，`{cancel?}` 可撤销） |

**头像文件** `GET /api/avatars/:file` —— 受保护静态（Bearer **或** `?t=<jwt>` 供 `<img>`；文件名白名单防穿越）

**消息** `/api/messages`：POST 存一条（`{characterId, role, content}`，userId 取自 JWT）；GET `/:characterId` 列表；DELETE `/:characterId` 清空；DELETE `/` 清空本人全部（注销场景）

**角色** `/api/characters`：GET 列表（data JSONB 整对象）；POST upsert `{character}`；PATCH/DELETE `/:id`（归属校验）。另有 `/assistants` GET 与 `/assistants/:id` PATCH/DELETE（内置助手简版行：relationship/userTitle/userNote/isPinned）

**AI 对话** `/api/chat`：POST `/completion`（角色对话；客户端已将 OCR 文本并入 content；imageContent/documentContent 可选）；POST `/assistant`（悬浮球，平台知识库）；POST `/parse-character`（设定文本→结构化角色字段 JSON）

**客服** `/api/customer-service`：POST `/chat`（AI 客服+转人工判定）；GET `/messages/:userId`（仅本人）；POST `/reopen/:userId`（仅本人）；**管理员**：GET `/sessions`、GET `/sessions/:userId/messages`、POST `/reply`、POST `/close/:userId`

**语音** `/api/speech/recognize`（multipart audio → 讯飞 ASR）；`/api/voice/*`（TTS；`TTS_ENABLED=false` 前端入口已关，接口保留）

### 管理后台 `/api/admin`（Bearer + role=admin）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /users?q=&page=&pageSize= | 搜索（昵称/手机/邮箱 ILIKE）+ 分页 |
| GET | /users/:id | 详情 + 角色/消息统计 |
| PATCH | /users/:id/status | 封禁/解封 `{banned, reason?}`；封禁即全会话下线 |
| POST | /users/:id/reset-password | 生成临时密码（仅回显一次，全会话下线） |
| GET | /stats/overview | 六项总览 |
| GET | /stats/trend?days=14 | 注册/消息/DAU 按日 |
| GET | /stats/top-characters?limit=10 | 热门角色 |
| GET·PUT | /config · /config/:key | app_config（键白名单：announcement / latest_version / download_url / notify_email） |
| GET | /secrets | 服务密钥清单（**密钥类仅掩码回显，全值永不出服务端**；source=后台覆盖/.env/未配置） |
| PUT | /secrets/:key | 更新密钥（空串=清除覆盖回退 .env；已接线键见下；审计只记掩码） |
| GET | /audit-logs?page=&action= | 操作审计（封禁/重置/改配置均落 audit_logs） |

**运行时配置分层**：`app_config`（`sk:` 前缀覆盖层）> 环境变量 > 代码默认值（5 秒缓存）。
已接线的可管理键：DEEPSEEK_API_KEY / DEEPSEEK_MODEL / SMTP_HOST/PORT/USER/PASS / NOTIFY_EMAIL /
SMS_MODE / SMS_API_URL / SMS_API_TOKEN / JWT_SECRET（修改后约 5 秒全会话失效）。
讯飞语音类密钥仍走 env（模块初始化读取），接入后再列入清单。

## 数据库（server/db/migrations/，权威 schema）

| 表 | 要点 |
|---|---|
| users | UUID；phone/email 唯一；password_hash=bcrypt；role(user/admin)；status(active/banned)+banned_reason/at；last_token_iat（单会话）；pending_deletion 系 |
| characters | 内置助手简版行（id=`assistant-<aid>-<uid>`） |
| user_characters | 自定义角色（data JSONB 存完整 Character） |
| messages | (user_id,character_id,created_at) 索引；客服复用（character_id='customer-service'，`[客服] `/`__CLOSED__:` 前缀协议） |
| favorites / verification_codes | data JSONB；验证码 sha256+过期+一次性 |
| audit_logs / app_config | 2.2.0 新增（迁移 003） |

## 模块速览

```
server/src/
  index.ts      入口：CORS 白名单/公开端点(含 version,announcements)/受保护挂载/admin 挂载/404+错误兜底
  auth.ts       bcrypt+JWT、requireAuth(Bearer或?t=)、requireAdmin、单会话/封禁拦截
  db.ts         pg 连接池（唯一 DB 入口）
  routes/       auth users messages characters chat customerService favorites sms speech voice admin
  services/     voiceService(TTS调度+SSRF白名单) iflytek(ASR) emailService platformKnowledge sms(Spug)

src/（客户端）
  services/apiClient.ts  唯一出网通道（VITE_API_URL + JWT + 超时/错误统一 + avatarSrc 头像直链）
  pages/                 Welcome/Chat/Main/AdminConsole(/admin 四标签)/AdminCustomerService…
  stores/                auth(JWT 会话) characters(云端-Dexie 双源合一) chat(OCR 并入内容)…
  config/features.ts     功能开关（TTS_ENABLED）
```
