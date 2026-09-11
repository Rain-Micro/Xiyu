# 开发者交接文档（Onboarding）

> 给接手本项目的开发者：**凭据/密钥/运维现状一次性说清楚**。
> 其它规范性内容见 `docs/development-guide.md`（开发规范）与 `docs/security-constraints.md`（安全约束）。

## 0. 一句定位

社团 AI 数字人陪伴平台：AI 角色扮演（DeepSeek）+ Live2D/3D 渲染 + 语音（讯飞）+ AI/人工客服 + 管理后台。
纯远程 C/S：Electron 客户端（`Liu-bit264/xiyu`）+ 云端 Express + PostgreSQL（阿里云轻量 Win）。

## 1. 管理员账户

| 项 | 值 | 说明 |
|---|---|---|
| 内置管理员 | `+00Root` | 唯一管理员；**不可封禁**（受保护，换密钥走后台重置密码） |
| 登录方式 | 账号名 `+00Root` + 密钥 | 登录框账号栏输 `+00Root`，密码栏输密钥（电话/邮箱/账号名三路匹配） |
| 密钥位置 | `<工作区>\.deploy-tools\root-secret.txt`（32 字符定长，**仅此一处明文**） | 首次建号时生成；**泄露即重置**：登录后台 → 用户管理 → 搜 +00Root → 重置密码（新钥仅回显一次） |
| 职能 | 管理后台全部功能：用户管理（搜/封禁即全端下线/重置密码）、数据看板、系统配置（公告/版本/客服邮箱）、**服务密钥**（DeepSeek/SMTP/短信/JWT 运行时更新）、操作审计 | 后台入口：客户端设置面板 → 管理后台；或 `#/admin` |

> 安全提醒：root 密钥切勿外发；后台「服务密钥」页能改多数三方密钥、也能改 JWT_SECRET（JWT 改动 ≈5 秒全员下线，可当紧急踢人开关）。

## 2. 服务器 SSH

| 项 | 值 |
|---|---|
| 地址 | `administrator@101.132.47.12`（端口 **22**） |
| 密钥认证 | `<工作区>\.deploy-tools\deploy_ed25519`（私钥）+ 对应公钥已登记服务器 `administrators_authorized_keys` |
| 密码（备用） | 位于本地 `后端\后端\aliyun-fuwuqi-secret.txt`（**勿入库；优先用密钥认证**，密码仅供 RDP/应急） |
| 便捷脚本 | `askpass.cmd` + `SSH_ASKPASS` 可免交互；但推荐直接：`ssh -i .deploy-tools/deploy_ed25519 -p 22 administrator@101.132.47.12` |

## 3. 三方密钥（已交接到后台运行时配置，**不再需要改 .env 重启**）

| 密钥 | 后台管理键 | 配套口令 |
|---|---|---|
| DeepSeek | DEEPSEEK_API_KEY / DEEPSEEK_MODEL | 对话/客服/解析 LLM |
| 讯飞 | （未接入运行时，仍在 .env）AppID/APIKey/APISecret | ASR 识别；TTS 前端入口已关 |
| QQ SMTP | SMTP_HOST/PORT/USER/PASS + NOTIFY_EMAIL | 邮箱验证码/客服通知 |
| Spug 短信 | SMS_API_URL / SMS_API_TOKEN / SMS_MODE | 注册/找回验证码；**白名单已加 101.132.47.12** |
| JWT | JWT_SECRET | 会话签名，后台可换（≈5s 全员下线） |

- **生产 .env**：`101.132.47.12:C:\qiyu\server\.env`（SSH 可读）；后台改的设置存 `app_config`（`sk:` 前缀覆盖层，5s 缓存，优先于 .env）
- **数据库口令**：`<工作区>\.deploy-tools\db-password.txt`

> 真实密钥位置暂不随文档入库——本文件是给人看的轮廓，实际值在各 gitignored 文件与服务器上。

## 4. 一键快捷操作

| 想做什么 | 命令/路径 |
|---|---|
| 登录服务器 | `ssh -i <.deploy-tools/deploy_ed25519> -p 22 administrator@101.132.47.12` |
| 建/重置管理员 | `scp .deploy-tools/setup-root.js server: && ssh … "cd C:\qiyu\server & set PGPW=<dbpw>& set ROOT_PW=<新钥>& node setup-root.js"` |
| 部署服务端 dist | 本地 `cd server && npm run build && tar -czf qiyu-server.tgz package.json package-lock.json dist db` → scp → 远端解压 → `node db\migrate.mjs` → `net start qiyu-server`（先杀 443 监听进程） |
| 出客户端安装包 | `VITE_API_URL=http://101.132.47.12:443 npm run build && npx electron-builder --dir && node -e "(asar断言)" && ISCC.exe /DMyAppVersion=x.y.z deploy/windows/qiyu.iss` |
| 热更新发版 | 后台「系统配置」改 latest_version/download_url；客户端启动查 `GET /api/version` |
| GitHub 发版 | `git tag vX.Y.Z && git push github vX.Y.Z`（Actions 自动构建并挂 Release） |

## 5. 必须知晓的坑（经验沉淀）

1. **乱码**：Git Bash `curl` 传中文 payload 必坏（GBK→U+FFFD）。含中文的写操作走 **node fetch（UTF-8 源文件）** 或 `curl --data-binary @文件`；取证用 `\uXXXX` 转义打印
2. **asar 断言用 node indexOf**，别用 grep（压缩单行产物有假阴性）
3. 修改源码必先 `npx tsc` 再打包；打包后必须 asar 字节断言（防"旧产物进包"事故，2.0.1 教训）
4. 服务端改动后，`net start qiyu-server` 报 2186 但进程实际存活属于正常；可靠重启 = 先杀 443 监听进程再 net start
5. 本机 CI（Gitea+双 runner）依赖 Docker Desktop；windows runner 用启动文件夹脚本自启，掉线就手动跑 `C:\qiyu-ci\start.cmd`
