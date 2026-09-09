# 代码安全约束（Security Constraints）

> 本仓库的硬性安全规则，来自 2.0.x 改造与历次安全审计的沉淀。**提交前自检，CI 与 Mimosa 钩子强制把关。**
> 已知遗留披露见文末。

## 1. 密钥管理

- **任何密钥/密码/令牌禁止入库**：真实凭据只存在于 gitignored 的 `.env` / `server/.env` 与部署机；仓库只放 `.env.example`（变量名+空值）
- 前端**永不**持有数据库凭证或服务级密钥（历史上 service_role key 打包进浏览器的教训）；客户端唯一凭据是用户 JWT（localStorage `qiyu-token`）
- 生产 `server/.env` 权限仅限部署通道；轮换密钥时同步更新部署机并重启

## 2. SQL：必须参数化

- 一律 `$1/$2` 占位符 + 参数数组（`server/src/db.ts` 的 `query()`）
- **禁止**把任何用户输入拼进 SQL 字符串——包括"看似常量"的模板拼接（INTERVAL 用 `$3::int * INTERVAL '1 minute'` 参数化）
- 动态更新字段用**静态 SQL + 哨兵**模式（参考 `users.ts` PATCH 的 COALESCE/CASE 写法），不要拼 SET 子串

## 3. 鉴权与授权

- 除公开白名单（`/api/health`、`/api/auth/*`、`/api/sms/*`、`/api/avatars`、`/api/announcements`、`/api/version`）外，**全部端点挂 `requireAuth`**
- 资源写/删操作必须带**归属校验**（`WHERE id=$1 AND user_id=$2`）——JWT 只回答"你是谁"，不回答"是不是你的"
- 管理端点叠加 `requireAdmin`；**管理员身份只由 `users.role` 驱动**（JWT 携带 + requireAuth 按库中现值刷新），**禁止**信任任何请求头自报身份（x-admin-email 旧案）
- 单会话互斥：`last_token_iat` 比对（5s 容差），新登录使旧设备 token 失效
- 封禁用户（users.status='banned'）登录与鉴权一律拒绝

## 4. 出站请求：URL 白名单（SSRF 防护）

- 出站第三方端点**固定字面量**（DeepSeek = `https://api.deepseek.com/...`），不做 env 可配
- 局域网设备（Operit）走 `parseAllowedOutboundUrl(url,'lan')` 白名单校验（仅环回/私网段），响应回传的 URL 强制同源
- **禁止**新增"按用户/配置任意 URL 发起服务端请求"的功能面；确需可配域名时必须域白名单 + 禁重定向

## 5. 命令执行与文件

- 子进程一律 `execFileSync` 参数数组（参考 `server/kill-port.js`），**禁止** shell 字符串拼接
- 用户上传文件：类型/大小白名单校验（头像 png/jpeg/webp ≤2MB），**文件名服务端生成**（userId+随机+白名单扩展名），静态下发走白名单正则防路径穿越
- 写源码/配置只能经编辑工具（Write/Edit）提交给 Mimosa 钩子审查，**禁止**用 shell 重定向绕过（`>`、`cp` 到源码路径都会被拦截）

## 6. 前端纪律

- 图片等 `<img>` 资源用服务端相对路径时必须经 `avatarSrc()`（拼 API_BASE + 短时 token 查询参数），禁止裸用 `/api/...`（file:// 下必裂）
- 敏感操作入口（管理台）由 `role` 驱动渲染 + 服务端二次校验（前端隐藏不是安全边界）
- 不引入新的 inline `dangerouslySetInnerHTML`；OCR/文档解析等重输入走既有 utils

## 7. 验证码与通知

- 验证码服务端 sha256 落库（5 分钟过期、一次性、重发作废旧码），**禁止**回显明文到生产响应（mock 模式的 devCode 仅限 `SMS_MODE=mock` 联调）
- 常驻通知（duration:0）必须有清理时机（登录成功/视图切换/页面卸载）

## 8. 安全工具链

- **Mimosa 钩子**：写入与提交前自动扫描（SQL 注入/命令注入/SSRF/污点），高危强制拦截；命中误报时按其建议改写法（正则 .exec → .match 之类），不要绕过
- CI 门禁：lint 规则含跨平台纪律（禁 process/盘符路径入渲染层）
- 生产部署后最小验证：`/api/health`、鉴权 401/403 用例、新端点正反用例各一

## 9. 已知遗留披露（待办）

| 项 | 状态 |
|---|---|
| `server/src/routes/sms.ts:68` 疑似跨文件污点（Mimosa 中危） | 评估为低风险误报（查询参数经 axios 编码，URL 来自运维 env）；保留观察 |
| 生产 API 为 443 明文 HTTP | 域名 + TLS 待办（上线公网前必须） |
| 邮箱注册验证码校验 | 随注册通道开放补齐（见 CHANGELOG 2.2.0） |
