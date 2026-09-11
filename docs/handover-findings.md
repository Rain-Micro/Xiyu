# 栖屿数字人交互平台 · 交接文档要点与代码核实差异（重点阅读）

> 整理于 2026-09-07。原负责人交接文档经浏览器渲染完整读取，并与代码逐项核实。
> **结论先行：交接文档整体结构准确、覆盖面好，但对"认证与 AI 调用的实现方式"存在美化/超前描述——文档写的是"应该的样子"，代码是"Demo 的样子"。以本文件核实结论为准。**

## 一、交接文档信息

- **来源**：https://share.traecontent.cn/artifact/GR-.JV0EFAR5-J （TraeWork 分享页，JS 渲染，需浏览器打开；直接抓取只得到空壳）
- **标题/署名**：《栖屿数字人交互平台 · 项目技术交接文档》，作者 qiyu，版本 1.0.0，最后更新 2026 年 9 月
- **结构**（8 节）：1 项目概览 / 2 技术选型 / 3 模块功能与实现思路 / 4 借鉴的开源项目与技术 / 5 各 API 标准 / 6 数据库情况 / 7 数据流动路径 / 8 环境配置与部署
- 各节要点已分别沉淀到本目录 [project-overview.md](./project-overview.md)、[modules-and-api.md](./modules-and-api.md)、[third-party-integrations.md](./third-party-integrations.md)，不在此重复。

文档中可信度较高的内容：技术选型版本号（与 package.json 一致）、API 路径与参数、数据库表结构、数据流描述、环境变量清单、TTS 三引擎优先级、内置助手设定（琉/飒/澈/熠/汐）。

## 二、文档 vs 代码核实差异对照（已逐项验证）

| # | 交接文档的说法 | 代码实际（证据） | 影响 |
|---|---|---|---|
| 1 | 认证 =「Supabase Auth + 自建验证码双轨制」 | **未用 Supabase Auth**。自建 users 表，`src/services/auth.ts:26` 明文比对 `password_hash`，token 为自制 `user_${id}_${Date.now()}` 存 localStorage（auth.ts:41-56） | 安全性远低于文档描述；迁移到 Supabase Auth 是最大的单点改造 |
| 2 | 后端认证用「jsonwebtoken + bcryptjs（9.0.2 / 2.4.3）」 | 两个依赖仅出现在 package.json，**全仓无 import**；JWT_SECRET 配置冗余 | 同上 |
| 3 | AI 对话用「openai (SDK) 4.52.7 封装 DeepSeek」 | routes/chat.ts:8-9,143 走**裸 fetch**；openai 依赖声明未用 | 可零成本迁移到官方推荐路径（DeepSeek 官方即推荐 OpenAI SDK 改 baseURL） |
| 4 | TTS 引擎含「edge-tts 1.0.1」 | edge-tts 声明未用；实际引擎 = 讯飞超拟人 WS / Operit HTTP / 讯飞标准 WS | 文档多列了一个不存在的引擎 |
| 5 | 消息存储「立即写 Dexie + 经后端 API 写云端」双写 | server 侧确认**只写 Supabase messages 表**（routes/messages.ts insert）；Dexie messages 表存在，但聊天主链路是否回写本地未在代码中找到证据 | 离线降级叙事打折；"双存储"主要对角色数据成立，对消息存疑 |
| 6 | 有 ChangeContactPage（/change-contact 四步换绑） | 本次代码核实**未发现该路由**（App.tsx 仅 13 条路由） | 文档可能描述了未合入或已移除的功能 |
| 7 | Base URL「ngrok 暴露时为 ngrok URL」 | 代码中 API 地址**硬编码 localhost:3001**（7 个 service 文件），无 ngrok/环境变量逻辑 | 外网联调需改代码，或文档描述的是历史做法 |
| 8 | 规模「24 组件 / 15 页面 / 8 路由模块」 | 实测 30+ 组件 / 15 个页面文件（13 条路由）/ 9 个路由文件 | 数量级一致，以实际代码为准 |

## 三、已知风险清单（按严重度排序）

1. **service_role 密钥打进前端**：`.env.local` 含 `VITE_SUPABASE_SERVICE_ROLE_KEY` 且已被 git 跟踪；`src/services/supabase.ts:13-15` 建 `supabaseAdmin` 客户端，`charactersAPI.ts` 全部增删改查绕过 RLS。任何拿到安装包/源码的人可完全控制数据库。
2. **认证 Demo 级**：明文密码比对（无哈希）、可预测的自制 token、无过期机制（见差异 #1/#2）。
3. **管理员鉴权可伪造**：前后端各一份硬编码白名单 `2968679835@qq.com`；管理接口只验 `x-admin-email` 请求头（routes/customerService.ts:16,29-32,328-334），头可任意伪造；前端入口仅靠菜单隐藏，路由无 guard。
4. **后端不随安装包分发/自启**：electron-builder files 只含 dist/dist-electron（根 package.json:59-65），main.ts 无 child_process——真实用户装完应用后 AI/语音功能全不可用，除非手动起 server。
5. **API 地址硬编码** `http://localhost:3001`（aiChatService.ts:1 等 7 处），无法配置指向远程。
6. **CORS 全开 + 全网卡监听**：`cors({ origin: true, credentials: true })`、`listen(PORT)` 未指定 host（server/src/index.ts:16-21,37）——局域网任意机器可访问 3001 并配合上述伪造头调管理接口。
7. **验证码存内存 Map**：重启即失效、多实例不共享；`verification_codes` 表建了没用；SMS_MODE 默认 mock（mockCode 直接回传给前端）。
8. **仓库卫生**：仅 1 个 commit（e427987d first commit），dist/、dist-electron/、.env.local 等构建产物与密钥已入库；server/ 下有 `r.blob())`、`{` 两个误操作残留文件；无 README。
9. **工程空白**：前后端均无测试；无任务队列（客服转人工靠同步邮件，无重试）；AI 回复无流式（一次性返回，长回复体验差）；`callDeepSeekVision` 死代码（V4 非多模态，图片走前端 OCR）。

## 四、改进方向备忘（未排期）

- 认证迁移 Supabase Auth（GoTrue），前端删掉明文比对与假 token；密码至少先上 bcrypt（依赖已装）。
- DeepSeek 调用切到 openai SDK（baseURL 指向 deepseek），统一重试/超时/错误处理。
- 后端随 Electron 打包（extraResources + 主进程 spawn）或改造成真正远程服务 + 前端 API 地址可配置。
- 把 service_role 收回服务端，前端仅 anon + RLS 策略；清理 git 历史中的密钥并轮换所有密钥。
- 管理端加真实鉴权（服务端会话/JWT 角色判定），废除 x-admin-email 头。

## 五、补充核实（2026-09-07 晚）

### 5.1 Supabase 项目确认已删除
- 代码/项目 `.env` 里的项目 ref（`ieqnqaydjglcros`**`hj`**`ciw`）与负责人备份 `后端/后端/.env.local.txt` 里的 ref（`...cros`**`bj`**`ciw`）相差一个字母（其一为笔误）；**两个域名 DNS 均 NXDOMAIN**，而 supabase.co 基础域名解析正常 → 判定为免费项目被回收释放。
- 后果：云端数据（账号/角色/消息/收藏）无法访问；除非另有导出备份，否则只能全新起库（注册时代码会自动播种 5 位内置助手，空库可跑）。

### 5.2 凭据目录
- 位置：`E:\agents\workspace\xiyu\后端\后端`（21 个明文文件，无代码）。
- 内容：Supabase 全套（URL / anon key / service_role×2 / 项目登录密码 / SMS Hook Secret / `.env.local.txt` 备份）、DeepSeek APIKey、讯飞 APPID/APIKey/APISecret、QQ 邮箱 SMTP 密码与 IMAP 授权码（rain0153@foxmail.com）、Spug Token + 模板 ID、**阿里云 API Key + CSV + 服务器凭据（`aliyun-fuwuqi-secret.txt`）**、ngrok 令牌、JWT_SECRET。
- `1.txt` 不是密钥：是控制台报错复制（`localhost:3001 ERR_CONNECTION_REFUSED` ×8 +「云端加载失败，回退到本地」）——印证"后端需手动启动"是历史痛点。
- 安全：该目录是全量明文钥匙串，且部分密钥已随 git 泄露；重建环境时应全部轮换作废，目录本身建议加密归档。

### 5.3 基础设施与演进方向
- 原团队**已有阿里云服务器**（凭据在上述目录）→「自建 PostgreSQL」有现成落点。
- 已讨论的方向（截至 2026-09-07 未拍板）：**自建 PostgreSQL + Express 唯一持有数据库凭证 + 前端删除 supabase 直连改走 REST + API 地址配置化**——一并消解 service_role 前置、CORS/鉴权、云上不可达三类问题。

### 5.4 本机启动条件核实（2026-09-07）
- **可启动**：Node v24.15.0 / npm 11.12.1；前后端 node_modules 已安装；dist/、dist-electron/、public/models 齐全；`.env.local` 与 `server/.env` 变量齐全；3001/5173 端口空闲 → `npm run dev` 与 `cd server && npm run dev` 均能拉起。
- **不可用**：Supabase 已删（登录/存储全断，主业务流程走不通）；Operit 内网 `192.168.1.76:8094` 不可达（`TTS_ENGINE` 默认 operit，靠降级链兜底）；DeepSeek/讯飞/SMTP/Spug 密钥有效性未实测。
- 结论：**能启动、不能用**。重建 Supabase 或切换自建 PostgreSQL 之前，主流程无法走通。
