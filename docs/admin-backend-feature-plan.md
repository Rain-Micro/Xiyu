# 管理后台 Feature 计划（待审批，未实现）

> 状态：规划稿 v1 —— 审批通过后按 P0→P2 排期实现
> 鉴权基础：复用现有 JWT + users.role（admin）；本文档只做规划

## 现状

- 已有：客服会话管理页 `/admin/customer-service`（会话列表/详情/回复/关闭）
- 缺失：用户管理、数据看板、系统配置、操作审计；所有管理端点靠 JWT role 判定（已安全）

## 模块规划

### M1 用户管理（P0）
| 功能点 | 说明 |
|---|---|
| 用户查询 | 按手机号/邮箱/昵称模糊搜索，分页列表（注册时间/最近活跃/状态） |
| 用户详情 | 资料 + 角色列表 + 最近消息统计 |
| 封禁/解封 | users 加 `status` 列（active/banned）；封禁后登录返回明确错误 |
| 注销审核 | 查看 pending_deletion 队列，手动提前清理 |
| 重置密码 | 管理员生成临时密码（bcrypt 落库），强制用户下次修改 |

所需 API：`GET /api/admin/users`、`GET /api/admin/users/:id`、`PATCH /api/admin/users/:id/status`、`POST /api/admin/users/:id/reset-password`
表变更：users 加 `status TEXT DEFAULT 'active'`、`banned_at TIMESTAMPTZ`；登录与鉴权中间件拒绝 banned 用户

### M2 客服工作台增强（P1）
| 功能点 | 说明 |
|---|---|
| 多会话并行 | 已有列表；增加未读角标与轮询增量拉取 |
| 快捷回复 | 管理员常用语配置（system_config 表），一键插入 |
| 转接 | 会话在多个管理员间转移标记 |
| 会话标注/备注 | 会话级 tag（咨询/投诉/反馈），存 messages 元数据或新表 |

所需 API：`GET /api/admin/cs/sessions?since=`、`POST /api/admin/cs/quick-replies`、`PATCH /api/admin/cs/sessions/:userId/tag`
表变更：新增 `cs_session_meta`（user_id 主键、tag、assignee、unread）

### M3 数据看板（P1）
| 功能点 | 说明 |
|---|---|
| 注册趋势 | users.created_at 按日聚合 |
| 活跃与消息量 | messages 按日聚合（DAU 以 distinct user_id 计） |
| 热门角色 | messages 按 character_id 聚合 TOP N |
| 留存 | 次日/7 日留存（注册日 vs 后续活跃日） |

所需 API：`GET /api/admin/stats/overview|trend|top-characters|retention?days=`
表变更：无（聚合查询）；数据量大后可加物化视图或按日汇总表

### M4 系统配置（P2）
| 功能点 | 说明 |
|---|---|
| 公告推送 | 全员公告：客户端启动时 GET /api/announcements 展示 |
| 敏感词库 | 词表管理；chat/customer-service 发送前过滤替换 |
| 客服邮箱配置 | 现硬编码/默认值收敛到配置 |
| 版本发布配置 | latest 版本号 + 下载页 URL（热更新提示式检查的服务端源，优先级高于 GitHub） |

所需 API：`GET/PUT /api/admin/config/:key`、`GET /api/announcements`（公开）
表变更：新增 `app_config`（key 主键、value JSONB、updated_at）

### M5 操作审计（P2）
| 功能点 | 说明 |
|---|---|
| 管理员操作流水 | 记录谁在何时对哪个资源做了什么（封禁/回复/关闭/改配置） |
| 查询界面 | 按管理员/时间/动作过滤 |

所需 API：`GET /api/admin/audit-logs`
表变更：新增 `audit_logs`（id、admin_user_id、action、target_type、target_id、detail JSONB、created_at）；所有 admin 写端点统一埋点

## 通用约束

- 全部管理 API 挂 `requireAuth + requireAdmin`（现有机制）
- 前端新增 `/admin/*` 布局与路由守卫（非 admin 拒绝渲染）
- 迁移编号顺延（002_admin_base.sql：status 列 + cs_session_meta + app_config + audit_logs）
- 短信/邮件通知能力复用现有 services

## 排期建议

1. P0：M1 用户管理（含迁移 002）→ M4 的公告与版本配置（与热更新检查联动）
2. P1：M2 客服增强 → M3 看板
3. P2：M5 审计（可在 P0 实现时就埋点建表，界面后补）
