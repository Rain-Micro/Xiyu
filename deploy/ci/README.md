# 本机 CI/CD 集群运维手册

拓扑：本机 Docker 内 Gitea + Act Runner（Linux job 容器），本机另驻一个 Windows 原生 runner。
与 OpenSandbox（8080）共用 Docker daemon 但网络/命名隔离；job 容器 ephemeral 不占宿主端口。

## 常用操作

```bash
cd deploy/ci
export RUNNER_REGISTRATION_TOKEN=$(cat .secrets/runner-token.txt)   # 仅首次注册需要
docker compose -p qiyu-ci up -d          # 启动 Gitea + Linux runner
docker compose -p qiyu-ci down           # 停止（gitea-data 卷保留）
docker logs qiyu-act-runner --since 5m   # 看 runner 日志
```

- Gitea Web：http://localhost:3080 （账号 qiyu，密码在 `.secrets/gitea-admin.txt`，该目录不入库）
- runner 凭据：`runner/data/.runner`（不入库；删除它并重启容器即重新注册）
- 注册令牌：`.secrets/runner-token.txt`（由 `gitea actions generate-runner-token` 生成）

## Runner 标签（镜像经 docker.1ms.run 加速）

| 标签 | 执行方式 |
|---|---|
| `docker-linux` / `ubuntu-latest` | Docker 容器 `docker.1ms.run/node:24-bookworm` |
| `windows-native` | 宿主 Windows 原生执行（`C:\qiyu-ci\`，独立于开发目录） |

## Windows 原生 runner

位置 `C:\qiyu-ci\`（act_runner.exe + config.yaml + start.cmd），**不装系统服务、不改注册表/环境变量**：

- 手动启动：运行 `C:\qiyu-ci\start.cmd`（内部注入 fnm node 的 PATH，仅进程内生效）
- 开机自启：启动文件夹脚本 `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\qiyu-act-runner-win.cmd`（最小化窗口拉起 start.cmd）
- 日志：`C:\qiyu-ci\runner.log`；runner 凭据 `C:\qiyu-ci\.runner`（删除后用 register 子命令重新注册，instance 填 `http://127.0.0.1:3080`，勿用 localhost——IPv6 回环不通）

## 端口约定

见仓库根 README「端口登记表」：Gitea 3080/3022，不占用 8080（OpenSandbox）、3001、5173。

## 流水线

- `server.yml`：linux 容器 lint+tsc；windows 原生 tsc+构建+`boot-smoke.mjs`（/api/health 探活）
- `client.yml`：linux 容器 lint+盘符路径检查+tsc+vite build；windows 原生 tsc+vite build+electron-builder `--dir`
- NSIS 完整安装包、部署与性能验收走 tag 流水线（Phase 5 接入）
