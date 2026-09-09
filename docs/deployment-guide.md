# 部署指南（Deployment Guide）

> 面向**拿到源码包（qiyu-src.tar.gz）的开发者/新负责人**。目标是"从零把平台跑起来"。
> 分两条路径：**A. 纯本地开发跑通**（推荐先做，无需服务器）；**B. 生产部署**（需一台可公网访问的服务器 + 第三方 API 密钥）。

---

## 0. 前置环境（A/B 都需）

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | **24.x**（`.nvmrc` 指定） | 前后端统一；`node -v` 确认 |
| npm | 随 Node | 源走 `npmmirror`（`.npmrc` 已配），无需手动 |
| PostgreSQL | **16** | 生产必装；本地可选（见 A） |
| Git | 任意 | 非必需（有源码包即可） |

> 源码包**不含** `node_modules`、`.env`、密钥——都要按下面步骤自己装/配。

---

## A. 路径一：本地开发跑通（推荐先做）

**无需服务器、无需第三方密钥**（短信/邮件走 mock/本地兜底，AI 对话需 DeepSeek 密钥才真正有回复）。

### A1. 解压
```bash
tar -xzf qiyu-src.tar.gz -C <你的目录>
cd <你的目录>/digital-human-platform   # 若包是 . 打包，解压后即是仓库根
```

### A2. 安装依赖（两端）
```bash
npm ci --no-audit --no-fund              # 根（前端）
cd server && npm ci --no-audit --no-fund # 服务端
```

### A3. 数据库（本地用 Docker 或本机 PG16）
```bash
# 用 Docker 一次性起库（最快）
docker run -d --name qiyu-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=qiyu_local -e POSTGRES_DB=qiyu postgres:16
```

### A4. 配置 .env
两份，从模板复制：
```bash
cp .env.example .env.local            # 前端：设 VITE_API_URL=http://localhost:3001
cp server/.env.example server/.env     # 服务端：设 DATABASE_URL，其余可先留空
```
`server/.env` 关键两项：
```
DATABASE_URL=postgresql://postgres:qiyu_local@127.0.0.1:5432/qiyu
JWT_SECRET=<任意≥32位随机串>          # 必填，否则服务拒绝启动
```

### A5. 迁移 + 启动
```bash
cd server
npm run migrate                        # 或：DATABASE_URL=... node db/migrate.mjs
npm run dev                            # 后端 3001
# 另开终端
cd .. && npm run dev                   # 前端 Vite 5173
```
浏览器开 `http://localhost:5173` → 注册账号（本地 mock 短信验证码会显示在通知里）即可用。
> 无 DeepSeek 密钥时，AI 回复走模拟文本；注册了管理员后到「服务密钥」页填入即可恢复真对话。

---

## B. 路径二：生产部署（需服务器 + 密钥）

前提：一台可公网访问的机器（本项目用阿里云轻量 **Windows 2C2G**，Linux 同理但命令换 shell 语法）。

### B1. 数据库初始化（PG16）
```bash
# Linux：apt/官方安装后
sudo -u postgres psql -c "CREATE USER qiyu WITH PASSWORD '<强口令>';"
sudo -u postgres psql -c "CREATE DATABASE qiyu OWNER qiyu;"
# Windows：用 pg_ctl register 注册服务 + initdb（详见 developer-onboarding）
```

### B2. 服务端配置 `server/.env`
```ini
PORT=443                      # 或 3001（前端 VITE_API_URL 随之）
DATABASE_URL=postgresql://qiyu:<口令>@127.0.0.1:5432/qiyu
JWT_SECRET=<随机≥48位>
DEEPSEEK_API_KEY=<填或后台填>
SMS_MODE=real                 # 开放真实短信注册；mock 则验证码回显
```

### B3. 迁移 + 服务化
```bash
cd server && npm ci --omit=dev --no-audit --no-fund
DATABASE_URL=... node db/migrate.mjs
# Windows 服务：参考 deploy/windows/ 与 developer-onboarding；Linux 用 pm2/systemd
```

### B4. 前端打包 + 填后端地址
```bash
VITE_API_URL=http://<服务器IP>:<端口> npm run build
npx electron-builder              # 出 NSIS 安装包，产物 release/
```
用户安装客户端后连的就是这个地址。

### B5. 创建管理员
```bash
# 首次登录用内置管理员 +00Root，密钥在交接文档/根目录 .deploy-tools/root-secret.txt
# 或后台「用户管理 → 重置密码」生成新钥
```

---

## 1. 密钥配置（B 路径必看）

全部**可在管理后台「服务密钥」页运行时修改**，无需改 .env 重启：
- DeepSeek（API Key / 模型名）、QQ SMTP（验证码邮件）、Spug 短信（`SMS_MODE` / URL / Token）、JWT_SECRET（改后全员下线）
- 未接入的讯飞语音密钥仍走 `server/.env`（ASR；TTS 前端入口已关）
- 管理后台入口：客户端设置面板 → 管理后台，或 `#/admin`

> 密钥仅存服务器 `.env` 与后台 `app_config`；**任何情况下不要提交到 git**（`release*`/`.env*` 已在 .gitignore）。

---

## 2. 常见坑（部署即踩）

1. **Git Bash 的 curl 发中文必乱码**（GBK→黑方块）：中文写操作走 node fetch 或 `curl --data-binary @UTF8文件`
2. **打包后必须 asar 字节断言**（node indexOf，勿用 grep）——防"旧产物进包"（2.0.1 事故）
3. 服务端 `net start qiyu-server` 报 **2186** 但进程存活属正常；可靠重启=先杀 443 监听进程再启动
4. Spug 短信要把**服务器公网 IP** 加进白名单，否则短信报 403
5. 本地/CI/生产 Node 版本三处统一为 `.nvmrc`(24)；`npm ci` 按平台装，勿复制 node_modules

---

## 3. 我要不要服务器？

只做**本地体验/教学/单人自用** → 走 A 即可，零成本。
要做**对外给社团/多人用** → 走 B，需要：一台服务器（2C2G 即可）+ 域名(可选，TLS)+ DeepSeek/短信/邮件密钥 + 一定运维投入。
