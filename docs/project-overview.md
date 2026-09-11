# 栖屿数字人平台 · 项目总览（2.2.0）

> 旧版总览（2.0.0 前的交接核实笔记）留档于 `project-overview.old.md`；历史差异考证见 `handover-findings.md`。
> 本文描述**当前架构**。接口细节见 `modules-and-api.md`。

## 定位

社团级 AI 数字人陪伴平台：AI 角色扮演对话（DeepSeek）+ Live2D/3D 渲染 + 语音（讯飞 ASR/TTS）+ AI/人工客服 + 管理后台。Clay 设计系统（暖奶油/色板/签名交互）。

## 架构（纯远程 C/S）

```
Electron 28 壳（主窗+桌宠窗）
  └─ React 18 SPA（HashRouter / zustand / Dexie 本地缓存 / Clay 换肤）
       └─ apiClient（VITE_API_URL + JWT，唯一出网通道）
            └─ Express（server/，唯一持库角色，Windows 服务 qiyu-server）
                 └─ PostgreSQL 16（本机 127.0.0.1，权威数据源）
```

- 部署：阿里云轻量 Windows 2C2G（`http://101.132.47.12:443`）；DB/服务同机
- CI/CD：本机 Gitea + 双 runner 双平台门禁（`deploy/ci/`）；发布物 Inno Setup 归档 `releases/<版本>/`
- 热更新：提示式检查，版本源 `GET /api/version`（后台可配）

## 关键机制（区别于普通 CRUD 之处）

| 机制 | 一句话 |
|---|---|
| 单会话互斥 | 新登录踢旧设备（last_token_iat，5s 容差） |
| 封禁即全端下线 | status=banned 同时推未来会话基准 + 登录/鉴权双拦截 |
| 角色“双源合一” | 云端 user_characters 与本地 Dexie 双向合并，任何重载不丢角色 |
| 图片语义随消息落库 | 客户端 OCR 文本并入 content，历史/重生成/转发不丢失 |
| 客服协议 | 复用 messages 表（character_id='customer-service' + `[客服] `/`__CLOSED__:` 前缀） |
| 验证码 | sha256 落库一次性；手机走 Spug（IP 白名单），邮箱走 QQ SMTP |

## 版本史（详见 CHANGELOG / RELEASES）

1.0.0 交接基线（Supabase，已死）→ 2.0.0 自建 PG+JWT+C/S+CI → 2.0.2/2.0.3 修复轮 → 2.1.0 Clay 换肤 → **2.2.0 管理后台+真实短信+GitHub 开源**
