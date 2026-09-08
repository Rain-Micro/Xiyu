# 本机 CI/CD 集群运维手册

拓扑：本机 Docker 内 Gitea + Act Runner（Linux job 容器），本机另驻一个 Windows 原生 runner。
与 OpenSandbox（8080）共用 Docker daemon 但网络/命名隔离；job 容器 ephemeral 不占宿主端口。
**全链路不依赖外网**：git 服务/检出/Action 均本地自持，npm 走 npmmirror，Docker 镜像走 daocloud，Electron 二进制走 npmmirror。

## 常用操作

```bash
cd deploy/ci
export RUNNER_REGISTRATION_TOKEN=$(cat .secrets/runner-token.txt)   # 仅 runner 首次注册需要（令牌一次性，失效需在 gitea 容器内重新生成）
docker compose -p qiyu-ci up -d          # 启动 Gitea + Linux runner
docker compose -p qiyu-ci down           # 停止（gitea-data 卷保留）
docker logs qiyu-act-runner --since 5m   # 看 runner 日志
```

- Gitea Web：http://127.0.0.1:3080 （账号 qiyu，密码在 `.secrets/gitea-admin.txt`，该目录不入库）
- runner 凭据：`runner/data/.runner`（不入库；删除它并用新 token 重启容器即重新注册）
- 检出凭据：仓库 Secret `CI_TOKEN`（读写仓库权限的 access token，值为 `.secrets/ci-clone-token.txt`，name=ci-clone）

## 关键设计决策（踩坑记录）

1. **实例地址用 `http://host.docker.internal:3080`**（非 `http://qiyu-gitea:3000`）：act 给每个 job 建独立网络，
   job 容器解析不了 gitea 别名；host.docker.internal 在 Docker Desktop 下任何容器/宿主都可达。
2. **检出不用 actions/checkout**（gitea.com/github.com 均被墙且不稳）：每条流水线第一步用
   `git fetch http://qiyu:${{ secrets.CI_TOKEN }}@...` 从本地 Gitea 克隆。
3. **步骤级 `working-directory` 在 act_runner 0.2.11 不可靠**：统一写 `cd server && <cmd>`。
4. **server 携带自己的 eslint 工具链**（`server/.eslintrc.cjs` + devDeps）：C/S 分离后 server 自持 lint。
5. **ffmpeg 二进制用 `@ffmpeg-installer/ffmpeg`**（随 npm 分发）；`ffmpeg-static` 的 postinstall 从 GitHub 下载，国内 CI 必挂。
6. **electron / electron-builder 二进制镜像**已写入 `.npmrc` 与 workflow env；宿主已预热
   `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0`。
7. **注册令牌一次性**：`docker exec --user git qiyu-gitea gitea actions generate-runner-token` 生成后旧令牌即失效；
   同名 runner 重复注册会留下离线的孤儿记录（无害，管理页可见）。
8. **取任务日志**：Gitea 1.23 无日志 REST API。原始日志在容器内
   `/data/gitea/actions_log/qiyu/digital-human-platform/<任务id的hex>/<id>.log.zst`，
   `docker cp` 出来后用纯 JS 解压器（fzstd）解码。

## Runner 标签

| 标签 | 执行方式 |
|---|---|
| `docker-linux` / `ubuntu-latest` | Docker 容器 `docker.m.daocloud.io/library/node:24-bookworm` |
| `windows-native` | 宿主 Windows 原生执行（`C:\qiyu-ci\`，独立于开发目录） |

## Windows 原生 runner

位置 `C:\qiyu-ci\`（act_runner.exe + config.yaml + start.cmd），**不装系统服务、不改注册表/环境变量**：

- 手动启动：运行 `C:\qiyu-ci\start.cmd`（内部注入 fnm node 的 PATH，仅进程内生效）
- 开机自启：启动文件夹脚本 `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\qiyu-act-runner-win.cmd`
- 日志：`C:\qiyu-ci\runner.log`；凭据 `C:\qiyu-ci\.runner`（重新注册用 register 子命令，instance 填 `http://127.0.0.1:3080`，加 `--no-interactive`，`-c` 必须放在子命令前）

## 流水线

- `server.yml`：linux 容器 lint+tsc；windows 原生 npm ci+tsc+`boot-smoke.mjs`（/api/health 探活）
- `client.yml`：linux 容器 lint+盘符路径检查+tsc+vite build；windows 原生 tsc+vite build+electron-builder `--dir`
- NSIS 完整安装包、部署与性能验收走 tag 流水线（Phase 5 接入）
