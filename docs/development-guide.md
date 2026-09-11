# 开发规范（Development Guide）

> 适用：栖屿数字人平台（本仓库）。配套阅读：`docs/security-constraints.md`（安全约束）、`README.md`（启动/构建/端口）、`RELEASES.md`（发布清单）。

## 1. 仓库结构与职责边界

```
/                     客户端根（React SPA + Electron 壳）
  src/                渲染进程源码（pages/components/stores/services/utils/types/config）
  electron/           主进程与 preload
  public/             静态资源（Live2D 模型/Cubism 运行时）
  server/             服务端独立子包（Express + pg，可独立构建部署）
    src/              路由/服务/鉴权
    db/migrations/    权威数据库 schema（幂等迁移）
    scripts/          运维脚本
  deploy/             CI 编排（deploy/ci）与 Windows 打包（deploy/windows/qiyu.iss）
  docs/               项目文档（本文件所在）
  releases/           本地发布物归档（gitignored）
```

**边界纪律**：
- 客户端唯一出网通道是 `src/services/apiClient.ts`（VITE_API_URL + JWT 注入）；**禁止**在任何组件里直连数据库或绕过 apiClient 发业务请求
- 服务端是唯一持有数据库凭证的角色；前端不得出现任何密钥
- 两端零共享代码目录；类型各自维护

## 2. 分支与提交策略

- **单主干**：`main` 为唯一长期分支，保护方式 = CI 双平台门禁 + 约定式提交
- **何时开分支**：破坏性重构/长周期特性（如管理后台）建议 `feat/<名>` 分支，完成后快进合入；日常修复直接 main
- **提交规范（Conventional Commits，强制）**：
  - 格式 `<type>(<scope>): <主题>`；scope 固定值：`client` / `server` / `ci` / `docs` / `repo`
  - type 限定：feat / fix / docs / style / refactor / perf / test / build / ci / chore / revert
  - 破坏性变更：type 后加 `!`（如 `feat(server)!:`）并在正文写迁移说明
  - 主题行祈使语气 ≤50 字；**一个提交只做一件事**，混合改动拆分
- **标签**：发布打 `vX.Y.Z`，与 `RELEASES.md`/`CHANGELOG.md` 对应

## 3. 版本与发布

- SemVer；**根 package.json 是唯一版本源**，UI 经 `__APP_VERSION__` 注入（vite define），server 版本手动同步
- 版本号语义：破坏性→主版本；新功能→次版本；修复→补丁
- **构建验收流程（强制，防"旧产物进包"事故——2.0.1 教训）**：
  1. `VITE_API_URL=<生产地址> npm run build`
  2. `npx electron-builder --dir`
  3. **asar 字节断言**（node indexOf；勿用 grep——压缩单行产物上有假阴性）：
     无 `disableHardwareAcceleration`、含当次新特性特征串、含既有回归项
  4. `ISCC.exe /DMyAppVersion=x.y.z deploy/windows/qiyu.iss`
  5. 安装包落 `releases/<版本>/`，哈希记入 `SHA256SUMS.txt` 与 `RELEASES.md`
- 服务端部署：构建 dist → scp bundle → 服务器解压 →（有迁移时）`node db/migrate.mjs` → 杀 443 监听进程 → `net start qiyu-server`（net start 报 2186 但 node 子进程存活属正常）→ `/api/health` 验证

## 4. 代码风格与依赖

- ESLint 双端各自配置（根 + server/.eslintrc.cjs），CI 零警告通过；server lint 需 `--ext .ts`
- TypeScript strict；禁 `any` 滥用（现有遗留 any 不新增）
- **平台无关纪律**：渲染进程禁 `process`/`__dirname`/`require`（ESLint 强制）；禁硬编码盘符路径；node_modules 一律 `npm ci` 按平台安装，禁止跨平台复制
- Node 版本以 `.nvmrc`（24）为准，本地/CI/生产三处统一
- 依赖纪律：npm 源 npmmirror（.npmrc）；优先选**随 npm 分发二进制**的包（如 @ffmpeg-installer），避免 postinstall 走 GitHub 的包（ffmpeg-static 教训）
- CI 全链路不依赖外网 action 市场：检出走自持 git fetch + Secret `CI_TOKEN`（Gitea + 双 runner 详见 `deploy/ci/README.md`）

## 5. 数据库规范

- schema 唯一真源：`server/db/migrations/`，按序号追加，**禁止改已发布的历史迁移**
- 迁移必须幂等（`IF NOT EXISTS` 等），migrate.mjs 自动跳过已应用项
- 新表/新列先写迁移再写代码；生产迁移在部署时执行并验证

## 6. CI/CD

- 流水线：`.gitea/workflows/server.yml`（linux 容器 lint+tsc+PG16 迁移验证；windows 原生 tsc+构建+启动冒烟）、`client.yml`（linux lint+盘符检查+tsc+vite build；windows 同+electron-builder --dir）
- 提交前本地自检：双端 `tsc --noEmit` + `eslint --max-warnings 0`
- act_runner 0.2.11 已知坑：步骤级 working-directory 不可靠（用 `cd server &&`）；勿在 job 内假设外网可达

## 7. 新人上手路径

1. 读 `README.md` 起服务端(3001)+前端(5173)
2. 架构与三方对接速查：`docs/project-overview.md` / `docs/modules-and-api.md` / `docs/third-party-integrations.md`（注意：三者写于 2.0.0 改造前，认证/数据层以 CHANGELOG 与本文件为准）
3. 改动前必读 `docs/security-constraints.md`
