# 栖屿数字人交互平台

AI 角色扮演对话（DeepSeek）+ Live2D/3D 数字人渲染 + 多引擎语音（讯飞 TTS/ASR、Operit）+ AI/人工客服，Electron 桌面应用形态，C/S 架构。

## 架构

```
Electron 28 壳（主窗 + 桌宠窗）
  └─ React 18 SPA（HashRouter，zustand，Dexie 本地缓存）
       └─ REST ← Express 4（server/，qiyu-server，唯一持有数据库凭证）
            └─ PostgreSQL 16（生产部署于阿里云轻量应用服务器，只听 127.0.0.1）
```

- 客户端不持有任何数据库密钥，全部数据访问经 Express REST API。
- 本地 Dexie（IndexedDB）为缓存，云端 PostgreSQL 为权威源。

## 目录结构

| 目录 | 说明 |
|---|---|
| `electron/` | Electron 主进程与 preload |
| `src/` | React 前端 |
| `server/` | Express 后端（独立 npm 包，端口 3001） |
| `server/db/migrations/` | 权威数据库 schema 与迁移脚本 |
| `public/` | Live2D 模型、Cubism 运行时、静态资源 |
| `docs/` | 架构/模块/API/第三方对接文档与交接核实记录 |
| `deploy/ci/` | 本机 CI/CD 集群（Gitea + Act Runner）编排 |

## 启动

```bash
# 后端（先起）
cd server && npm install && npm run dev        # http://localhost:3001

# 前端（另开终端）
npm install
npm run dev                                    # Vite http://localhost:5173

# Electron 模式 / 打包
npm run electron:dev
npm run electron:build
```

前端 API 地址经 `.env.local` 的 `VITE_API_URL` 配置（默认 `http://localhost:3001`）。参考 `.env.example` 与 `server/.env.example`。

> **拿到源码如何完整跑起来（环境准备/本地开发/生产部署/密钥配置/踩坑）**：见 [`docs/deployment-guide.md`](docs/deployment-guide.md)。

## 端口登记表

占用前先对照本表，新增端口必须登记。

| 端口 | 用途 | 归属 |
|---|---|---|
| 3001 | qiyu-server API（本地开发） | 项目 |
| 5173 | Vite dev server | 项目 |
| 3080 | Gitea Web（CI） | CI 集群 |
| 3022 | Gitea SSH（CI） | CI 集群 |
| 8080 | OpenSandbox 服务端 | 本机既有设施，**禁止占用** |
| 5432 | PostgreSQL | 仅容器内/127.0.0.1，不对局域网暴露 |

## 构建与发布

```bash
# 1) 前端+Electron 产物（注入生产 API 地址）
VITE_API_URL=http://<服务器>:443 npm run build

# 2) 打包 win-unpacked（验收中间产物）
npx electron-builder --dir

# 3) asar 字节断言（必须全过再出包，防"旧产物进包"事故）
node -e "const fs=require('fs');const a='win-unpacked/resources/app.asar';const has=n=>fs.readFileSync(a).indexOf(n)!==-1;console.log(has('startsWith(\"/api/\")'),!has('disableHardwareAcceleration'))"

# 4) Inno 安装包（输出 releases 同级的发布目录）
"D:/Program_files/Inno Setup 6/ISCC.exe" /DMyAppVersion=x.y.z deploy/windows/qiyu.iss
```

发布物按版本归档于 `releases/<版本>/`（不入库）；版本状态与哈希见 `RELEASES.md`；变更明细见 `CHANGELOG.md`。

## 规范

- **提交**：Conventional Commits（`feat:`/`fix:`/`chore:`/`docs:`/`refactor:`/`ci:`…）。
- **版本**：SemVer，根 `package.json` 为唯一版本源，server 与 UI 从中派生；变更写入 `CHANGELOG.md`（Keep a Changelog 格式）。
- **Node**：版本以 `.nvmrc`（24）为准，本地/CI/生产三处统一；依赖一律 `npm ci` 按平台安装，禁止跨平台复制 `node_modules`。
- **平台无关**：源码禁止硬编码盘符路径与 `process`/`__dirname` 直入渲染进程（ESLint 强制）。

## CI/CD

本机 Docker 运行 Gitea + Act Runner（`deploy/ci/`），双平台门禁：Linux 容器跑 lint/单测/集成测试；Windows 原生 runner 跑 NSIS 打包、Electron 启动探活与 Windows 服务端冒烟。见 `deploy/ci/README.md`。

## 代码托管与迁移说明

- 当前主远端为**本地 Gitea**（`deploy/ci/` 页签，`origin`）。
- 曾计划将仓库迁移至 GitHub（`Liu-bit264/xiyu`）并交由新负责人（单主）接管，但因 **GitHub 偶发故障未能完成转仓**。原 GitHub 仓库已删除，将在新负责人（单主）名下**重新创建并推送**。
- 内部协作一律以本地 Gitea `origin` 为准；若日后迁移恢复或确定新的 GitHub 远端，重新 `git remote add` 即可，无需改动本仓库其它内容。历史与运维情况详见 `docs/developer-onboarding.md`。

