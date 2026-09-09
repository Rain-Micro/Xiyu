# Changelog

本项目的所有显著变更都记录在本文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [2.0.3] - 2026-09-09

实测修复版（客户端 + 服务端）。

### Fixed 修复
- 聊天页图片 OCR 失效：OCR 文本并入消息内容（角色可读图；内容随消息落库，
  历史/重生成/转发不再丢失图片语义）；MIME 为空的截图/剪贴板文件按扩展名走图片流
- 自建角色"消失"（点教程后最易复现）：修复双源缺陷——云端创建的角色现在同步写本地，
  加载时云端有本地无的角色合并回本地（此前任何重载都会用本地覆盖掉云端角色）
- 登录后残留"验证码"通知：登录/注册/找回密码流程的常驻验证码通知补齐清理时机
- 新账号不被询问偏好（R3 回归）：残留会话直达改为仅冷启动判定，不再抢跳登录引导流程
- 自定义头像不显示：相对路径经 avatarSrc() 拼接 API_BASE（Electron/dev 双环境修复）
- 生日/纪念日选择器占位与年月日重叠：改受控值驱动的 date-empty class（伪类方案失效根因修正）

### Security 安全
- /api/avatars 头像端点由公开静态改为 JWT 受保护（Bearer 头或 <img> 场景的 ?t= 查询参数），
  文件名白名单校验防路径穿越

## [2.0.2] - 2026-09-09

实测修复版（客户端 + 服务端）。**重要：2.0.1 安装包因构建流程失误打包了旧产物（R2 修复未进包），
本版起构建后增加 asar 字节验收环节；2.0.1 用户请直接升级本版。**

### Fixed 修复
- 【2.0.1 未进包的修复在本版真正生效】Logo 相对路径、Live2D 相对路径+XHR 探测、双教程去重、GPU 加速恢复、悬浮球缩小避让
- 登录页悬浮球显示"上次使用的角色"：未登录路由强制显示客服身份；会话过期(401)同步登出本地状态；残留登录态自动回主页
- 语音转文字：服务端管道实测正常；客户端补齐麦克风权限处理器（Electron media 权限），
  录音/识别失败由静默 console 改为用户可见提示
- 非法角色文件白屏卡死：4 处无守卫访问补可选链；新增路由级 ErrorBoundary（回主页/刷新兜底）；
  角色入库归一化（profile/settings 缺失自动补默认值）
- 生日选择器"选择日期"占位与年月日重叠：聚焦即隐藏占位，修正失效的 CSS 属性选择器（四处同款组件一并生效）

### Changed 变更
- TTS（文字转语音）入口全部关闭（feature flag `TTS_ENABLED=false`，代码保留）：AI 消息语音播报条、创建角色音色设置与试听
- 单会话互斥：同一账号新登录会使旧设备会话失效（服务端 last_token_iat 比对，60s 容差；迁移 002）
- 性能：Live2D 限帧 30fps + 独显优先 + 页面隐藏暂停计算；3D 页面隐藏跳过渲染；顶栏新增"回到主页"按钮

## [2.0.1] - 2026-09-08

客户端修复版（服务端无改动）。

### Fixed 修复
- 登录页/找回密码页 Logo 打包后不显示（根绝对路径改相对路径）
- **Live2D 打包后完全不显示**：模型路径探测改为相对路径（file:// 下解析到 dist/models），
  探测函数由 fetch 改为 XHR（Chromium 在 file:// 下拒绝 fetch 本地文件）
- 新手教程双教程同屏（全局教程激活期间不再渲染主界面欢迎引导）
- 动画卡顿：移除 `disableHardwareAcceleration`，恢复 GPU 硬件加速渲染
- AI 悬浮球过大（60→48px）且遮挡聊天输入栏（聊天页底部停靠自动上抬避让）

## [2.0.0] - 2026-09-08

架构级重建版本：数据层从已删除的 Supabase 迁移到自建 PostgreSQL，认证体系重建，
C/S 彻底分离，工程与 CI/CD 全部规范化。**与 1.0.0 不兼容**（旧安装包无法连接新后端，云端数据全新建库）。

### Added 新增
- 自建 PostgreSQL 16 权威 schema 与幂等迁移执行器（`server/db/migrations/`、`server/db/migrate.mjs`）
- 基于 JWT 的认证体系：`/api/auth/register|login|login/sms|me|change-password|reset-password|change-contact`，
  密码 bcrypt 哈希存储，验证码 sha256 落库（修复原内存 Map 重启丢失）
- 用户资料端点 `/api/users/me`（昵称/生日/头像文件化上传）与注销排期 `/api/users/me/deletion`
- 全部 `/api` 端点 JWT 鉴权与资源归属校验；管理员由 `users.role` 驱动（替代可伪造的 `x-admin-email` 头）
- 统一前端 API 客户端 `src/services/apiClient.ts`（`VITE_API_URL` 配置化 + JWT 注入 + 超时/错误统一）
- 本机 CI/CD 集群（`deploy/ci/`）：Gitea + Act Runner（Linux 容器）+ Windows 原生 runner，
  双平台门禁流水线（lint/类型/前端构建/Electron 打包链路/服务端启动冒烟/PG16 迁移验证）
- README、`.env.example`（前后端）、`.nvmrc`（Node 24）、`.editorconfig`、`.gitattributes`、ESLint 配置（含跨平台纪律）

### Changed 变更
- 数据访问：前后端全部 Supabase 直连改经 Express REST + `pg` 连接池；service_role 密钥不再进浏览器
- `favorites.created_at` 统一为 TIMESTAMPTZ（修复 BIGINT 与 ISO 字符串混用）
- 头像从 base64-in-JSON 改为服务端文件端点 `/api/avatars/*` + HTTP 缓存
- 消息历史改为取"最近 20 条"（原实现取的是最旧 20 条）
- 产品名统一为「栖屿数字人平台」；版本号以根 `package.json` 为唯一来源，UI 经 `__APP_VERSION__` 注入
- 依赖：`ffmpeg-static`（GitHub 下载）→ `@ffmpeg-installer/ffmpeg`（npm 分发）

### Removed 移除
- Supabase JS SDK（前端与后端）及全部直连代码、`x-admin-email` 机制、运行时改写 Operit 配置的公开端点
- 仓库历史中的 node_modules、构建产物与全部明文密钥（git 重置，仓库由 524MB 瘦身至源码级）

### Security 安全
- 修复：service_role 密钥打包进前端、全表拉取用户（含密码列）到浏览器、明文密码比对、
  资源无归属校验（可改/删他人角色收藏）、CORS 全开、kill-port 命令注入、TTS 出站 SSRF 面
- 所有曾泄露的密钥需在部署时轮换（见 Phase 5 运维清单）

## [1.0.0] - 2026-08（历史基线）

由原负责人交接的 Demo 版本：Electron 28 + React 18 + Express 4 + Supabase 云库，
含 AI 角色扮演、Live2D/3D 渲染、讯飞/Operit 语音、AI/人工客服。该版本后端云已删除，不可用。
