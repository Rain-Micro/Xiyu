# 栖屿数字人交互平台 · 模块、API 与数据库

> 整理于 2026-09-07。来源：原负责人交接文档 + 代码实测核实。差异项以 ⚠ 标注，详见 [handover-findings.md](./handover-findings.md)。

## 一、模块功能与实现要点

### 1. 用户认证
- 实际实现：**自建账号体系**（Supabase `users` 表），`src/services/auth.ts` 按手机号/邮箱查表、**明文比对 password_hash**、自制 token（`user_${id}_${Date.now()}`）存 localStorage；未用 Supabase Auth。⚠
- 注册时自动批量创建 5 位内置助手（ASSISTANT_SEEDS → seedAssistantsForUser → Dexie + Supabase characters 表）。
- 页面：WelcomePage（登录：密码/验证码双模式；注册：选默认助手 + 密码强度检测）、ForgetPasswordPage（三步找回）、ChangePasswordPage（三步改密）。交接文档另提到 ChangeContactPage（/change-contact 四步换绑），本次代码核实未确认该路由。

### 2. 角色管理
- 内置助手（characters 表，type=builtin_assistant，assistant_id: liu/sa/che/yi/xi）与自定义角色（user_characters 表，JSONB data 存完整对象）。
- CreateCharacterPage：5 区块表单（基本信息/相处设定/喜好性格/对话行为/声音设置），文件导入（mammoth/OCR）+ AI 解析（/api/chat/parse-character）+ undo/redo。
- CharacterContactList：通讯录（拼音首字母 A-Z 分组 + 置顶 + 搜索 + 右键，借鉴微信范式）。
- CharacterSettingsPage：标签、聊天背景、清空记录、删除、云端备份。
- AssistantProfileEditor：助手仅关系/称呼/备注/纪念日/不喜欢的事可编辑。

### 3. 聊天核心
- chatStore 按 characterId 分组缓存；aiChatService → POST /api/chat/completion；后端构建 system prompt（优先前端传的 characterProfile，回退查 characters 表）+ 最近 20 条历史 → DeepSeek → `stripMarkdown()` 去格式 → 存 messages 表。
- 消息类型 text/image/file/voice；右键菜单：复制/编辑/删除/撤回/转发/收藏/重新生成；多图粘贴 + 拖拽排序。
- OCR：Tesseract.js 浏览器端识别，文本随消息发给 AI（DeepSeek V4 非多模态，视觉函数 `callDeepSeekVision` 定义了但从未被调用 ⚠）。
- 中断：AbortController + signal。角色情绪/动作/表情：关键词匹配触发。

### 4. 虚拟角色渲染
- Live2DViewer：解析 model3.json / vtube.json，PixiJS 挂载，setExpression / triggerAction / 正脸模式；模型 Blob 存 Dexie modelFiles 表，运行时 Object URL 加载。
- ThreeDViewer：OBJ/FBX/GLTF/GLB + OrbitControls + MorphTarget 表情 + 骨骼动作；ThreeDErrorBoundary 防卡死。
- ExpressionManualMatch / ActionManualMatch：场景→表情(.exp3.json)/动作(.motion3.json) 映射，持久化 localStorage。
- 模型类型由 `characterModelType` 工具管理，ChatPage 统一切换（forwardRef + useImperativeHandle 暴露方法）。

### 5. 客服系统
- 用户消息 → /api/customer-service/chat（平台知识库 system prompt）→ AI 可答则答，否则返回 `TRANSFER_TO_HUMAN` → nodemailer 邮件通知管理员。
- 会话状态用消息内容前缀标记：`[客服]` = 人工回复，`__CLOSED__:` = 已关闭。
- 管理端 AdminCustomerServicePage：待处理/已处理/已关闭列表 + 30 秒轮询 + 回复/关闭；用户端可 reopen（清空历史）。
- 管理员鉴权：`x-admin-email` 请求头 ∈ 硬编码白名单 `['2968679835@qq.com']`（前后端各一份）⚠ 可伪造。

### 6. 语音
- TTS 三引擎优先级：**讯飞超拟人 > Operit > 讯飞标准**（server/src/services/voiceService.ts）。讯飞走 WebSocket（HMAC-SHA256 手写签名）收 base64 PCM 分片 → ffmpeg 转 WAV；Operit 走内网 HTTP `…/api/external-chat` 发 `/voice_bar:say <text>` 命令再取 wav。
- ASR：multer 收音频 → ffmpeg 转 PCM（16kHz/16bit/mono）→ 讯飞 IAT WebSocket（server/src/services/iflytek.ts）。
- 前端另有 Web Speech API 实时识别填输入框；TTS 播报直接 fetch /api/voice/synthesize 取字节流 `new Audio(blobUrl)` 播放。

### 7. 收藏
- 仅 Supabase 云端 favorites 表（JSONB data），本地 Dexie favorites 为旧表已弃用；五种类型（文字/图片/文件/语音/链接，链接正则自动推断）；置顶优先 + 时间倒序；无离线降级。

### 8. 全局功能
- AIAssistant 悬浮球（平台知识库 + 自定义性格）、AITools（系统检查/数据保存）、SettingsPanel（三 Tab）、FirstTimeGuide（CSS 选择器高亮引导）、NotificationToast、HealthReminder（6h/8h 在线提醒）。

## 二、API 标准（端口 3001，前缀 /api）

统一约定：Base URL `http://localhost:3001/api`（文档提到 ngrok 暴露场景，代码未见配置 ⚠）；JSON body 上限 10MB（支持图片 base64）；成功 `{ success: true, ... }` 或直接数据对象；错误 HTTP 4xx/5xx + `{ error }`；管理员接口用 `x-admin-email` 头（白名单 2968679835@qq.com）；CORS `origin: true, credentials: true` 全放行。

### /api/chat
| 方法 | 路径 | 请求 | 响应 | 说明 |
|---|---|---|---|---|
| POST | /api/chat/completion | `{ characterId, userId, message, documentContent?, imageContent?, ocrText?, characterProfile? }` | `{ reply }` | 角色对话，自动存 AI 回复 |
| POST | /api/chat/assistant | `{ userId, message, assistantName?, assistantPersonality? }` | `{ reply }` | 悬浮球助手（平台知识库） |
| POST | /api/chat/parse-character | `{ text }` | `{ data: { name, age, gender, personalityTraits[]… } }` | 自然语言→结构化角色 |

### /api/messages
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/messages | 存消息 `{ userId, characterId, role: 'user'\|'assistant', content }` |
| GET | /api/messages/:characterId?userId= | 角色全部消息（时间升序） |
| DELETE | /api/messages/:characterId?userId= | 清空角色聊天记录 |

### /api/characters
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/characters?userId= | 用户角色列表 |
| POST | /api/characters | 创建/更新（upsert by id） |
| PATCH | /api/characters/:id | 更新 data 字段 |
| DELETE | /api/characters/:id | 删除角色 |

### /api/customer-service
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /chat | 用户发消息，返回 AI 回复 + 是否转人工 + 会话状态 |
| GET | /messages/:userId | 用户客服对话记录 |
| POST | /reply | 管理员人工回复（adminEmail 白名单） |
| GET | /sessions | 管理员会话列表（Header: x-admin-email） |
| GET | /sessions/:userId/messages | 指定会话详情 |
| POST | /close/:userId | 管理员关闭会话 |
| POST | /reopen/:userId | 用户重新发起（清空历史） |

### /api/favorites
GET `?userId=`（置顶优先+时间倒序）｜ POST（upsert）｜ PATCH /:id（置顶等）｜ DELETE /:id

### /api/sms
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/sms/send | 发验证码（手机 Spug / 邮箱 SMTP），5 分钟有效，mock 模式回传 mockCode |
| POST | /api/sms/verify | 校验（一次性） |
| POST | /api/sms/supabase-hook | Supabase Auth Hook 回调（Header 验 secret，转发 Spug） |

### /api/speech 与 /api/voice
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/speech/recognize | 音频→文字（multipart/form-data → ffmpeg → 讯飞 IAT） |
| GET | /api/voice/voices | 可用音色列表 |
| POST | /api/voice/synthesize | 合成（text/voice/speed/pitch/volume → 音频二进制流） |
| GET | /api/voice/status | TTS 引擎状态 |
| GET/POST | /api/voice/operit/config | Operit 运行时配置（不持久化） |

另有 `GET /api/health`。验证码实际存**后端进程内存 Map**（`verification_codes` 表有建表 SQL 但未被使用 ⚠）。

## 三、数据库

### 3.1 本地 Dexie（src/services/db.ts，DigitalHumanDB，3 个 schema 版本，11 张表）

| 表 | 主键 | 索引 | 用途 |
|---|---|---|---|
| users | ++id | userId, username | 用户信息 |
| characters | id | userId | 角色完整数据（内置+自定义） |
| profiles | id | userId | 角色档案（v2 已废弃） |
| messages | id | characterId | 聊天消息（聊天链路实际以云端为主 ⚠） |
| settings | id | — | 应用设置 |
| actions | id | characterId | 角色动作 |
| notifications | id | — | 通知 |
| tutorialProgress | id | — | 教程进度 |
| logs | ++id | — | 系统日志 |
| favorites | id | — | 收藏（已迁移 Supabase） |
| modelFiles | id | — | 模型文件 Blob（v3 新增） |

### 3.2 云端 Supabase（RLS 全部禁用，靠 service_role 绕过）

**characters**（内置助手）：id TEXT PK、user_id、name、type('builtin_assistant')、assistant_id(liu/sa/che/yi/xi)、personality_traits TEXT[]、tone、background、character_sayings TEXT[]、greeting、is_pinned、relationship/user_title/user_note（助手可编辑）、created_at BIGINT。

**user_characters**（自定义角色）：id TEXT PK、user_id、data JSONB（完整 Character 对象）、created_at。

**messages**：id UUID、user_id、character_id（客服用 'customer-service'）、role('user'|'assistant')、content、created_at TIMESTAMP。

**favorites**：id TEXT PK、user_id、data JSONB、created_at、is_pinned BOOLEAN。

**verification_codes**：id UUID、phone、code、expires_at、used —— 存在但后端实际用内存 Map ⚠。

### 3.3 Supabase 客户端双模式（三处客户端）

| 客户端 | 密钥 | RLS | 用途 |
|---|---|---|---|
| supabase（前端） | anon_key | 受限 | 登录/注册表读写 |
| supabaseAdmin（前端） | **service_role_key** | 绕过 | 角色/收藏写入 ⚠ 密钥打进前端包 |
| supabase（后端） | service_role_key | 绕过 | 全部数据库操作 |

## 四、核心数据流

1. **登录**：WelcomePage → auth.ts 查 users → 查 characters（内置助手，缺失则 ASSISTANT_SEEDS 补）→ 查 user_characters → Dexie 补本地未同步 → id+assistantId 双重去重 → Zustand → /main。
2. **AI 对话**：ChatPage → chatStore.sendMessage → aiChatService → POST /api/chat/completion → system prompt（characterProfile 优先）+ 最近 20 条历史 → DeepSeek → stripMarkdown → 存 messages 表 → chatStore 更新 UI；失败降级 PRESET_REPLIES。
3. **角色创建**：表单（undo/redo）→ 文件导入（mammoth/OCR）→ AI 解析 parse-character → 合并 formData → addCharacter：Zustand + Dexie 立即写 + Supabase 异步写（失败仅留本地）。
4. **客服**：用户消息 → AI（知识库 prompt）→ 可答即答 / TRANSFER_TO_HUMAN → 邮件通知 → 管理员 reply（`[客服]` 前缀）→ close（`__CLOSED__`）。
5. **同步策略**：角色增删改 = 本地立即 + 云端异步，云端失败回退本地；消息 = 经后端 API 写云端，断网仅本地；收藏 = 仅云端无降级；刷新恢复 = Dexie 先加载 + 云端补缺。
6. **模型文件**：上传（.moc3/.model3.json、.obj+.mtl、.glb）→ Blob 存 Dexie modelFiles → Object URL → Live2DViewer/ThreeDViewer 加载；表情/动作映射持久化 localStorage。
