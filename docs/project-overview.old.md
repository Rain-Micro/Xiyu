# 栖屿数字人交互平台 · 项目总览

> 笔记整理于 2026-09-07。来源：原负责人交接文档（Trae 分享页，v1.0.0，2026-09）+ 代码实测核实。
> 文档与代码不一致之处见 [handover-findings.md](./handover-findings.md)，**以代码核实结论为准**。

## 项目定位

社团级数字人交互系统（产品名「栖屿数字人平台 · Demo版」），核心能力：

- **AI 角色扮演对话**：DeepSeek 大模型，系统提示词携带角色性格/语气/背景/爱好，多轮上下文（最近 20 条）+ 文档解析 + 图片 OCR；断网降级为预设回复
- **Live2D / 3D 渲染**：PixiJS + pixi-live2d-display 渲染 Live2D（Cubism 3/4），Three.js 渲染 3D（OBJ/FBX/GLTF/GLB），支持表情触发、动作播放、正脸模式
- **语音**：三引擎 TTS（优先级：讯飞超拟人 > Operit > 讯飞标准）+ 讯飞 IAT 识别 + Web Speech API 前端实时识别
- **客服系统**：AI 客服优先 → 无法解答转人工（`TRANSFER_TO_HUMAN`）→ 邮件通知管理员 → 后台人工回复（`[客服]` 前缀）/ 关闭（`__CLOSED__`）/ 重开
- **角色管理**：5 位内置助手（琉 liu / 飒 sa / 澈 che / 熠 yi / 汐 xi）+ 自定义角色（5 区块表单、undo/redo、文件导入、AI 文字解析）
- **双存储**：Dexie (IndexedDB) 本地优先 + Supabase (PostgreSQL) 云端备份，写本地失败回退云端（收藏仅云端，无降级）

## 四层架构

| 层 | 位置 | 说明 |
|---|---|---|
| Electron 壳 | `electron/`（main.ts + preload.ts） | 主窗口 1280×800 + 透明置顶桌宠窗口 200×250；`contextIsolation: true, nodeIntegration: false, webSecurity: false`（后者为加载本地模型文件）；preload 经 contextBridge 暴露窗口控制/桌宠 API |
| 前端 SPA | `src/`（约 2.77 万行） | React 18 + TS + Vite 5 + HashRouter（适配 Electron file://） |
| 本地后端 | `server/`（qiyu-server，约 2400 行） | Express 4 + TS，端口 3001，负责密钥保护与第三方服务编排 |
| 云数据库 | Supabase（`ieqnqaydjglcroshjciw.supabase.co`） | PostgreSQL，RLS 已禁用（全靠 service_role key 绕过）。**⚠ 2026-09-07 核实：项目已被删除（双 ref 均 NXDOMAIN），云端不可用** |

核心链路：前端 → `localhost:3001` Express → DeepSeek / 讯飞 WS / Operit → 回复 + TTS 音频 → 前端 `<audio>` 播放驱动 Live2D；数据落在 Supabase 云 + IndexedDB 本地。

## 目录结构（实测）

```
digital-human-platform/
├── electron/          # Electron 主进程（main.ts 242 行）+ preload.ts
├── src/               # React 前端
│   ├── components/    # 30+ 组件（Live2DViewer / ThreeDViewer / AIAssistant / SettingsPanel …）
│   ├── pages/         # 13 条路由（App.tsx 注册，15 个页面文件）
│   ├── stores/        # zustand：index.ts（auth/character/settings/ui/tutorial）+ chatStore / createCharacterStore / favoritesStore
│   ├── services/      # supabase 双客户端、auth、db(Dexie)、aiChatService、messageService、speechAPI、smsAPI、customerServiceAPI、favoritesAPI、characterImportAPI
│   ├── types/  utils/
├── server/            # Express 后端
│   └── src/           # index.ts + routes/（9 个文件）+ services/（5 个：voiceService / iflytek / sms / emailService / supabase）
├── public/            # Live2D 模型（models/006/…）、cubism 运行时（lib/）、图标
├── docs/              # 本笔记 + superpowers/specs/ 设计文档
├── supabase_*.sql     # 云端建表 / RLS / 验证码表脚本（3 个）
├── .env.local         # 前端 Supabase 密钥（已被 git 跟踪 ⚠）
└── vite.config.ts     # vite-plugin-electron 双入口构建（main + preload）
```

## 技术栈（版本号来自交接文档，与 package.json 核对一致）

### 前端

| 类别 | 技术 | 版本 | 选型理由 |
|---|---|---|---|
| 框架 | React | 18.2.0 | 生态成熟，适合复杂交互 |
| 语言 | TypeScript | 5.2.2 | 类型安全 |
| 构建 | Vite | 5.0.8 | HMR 快，Electron 集成插件 |
| 样式 | TailwindCSS | 3.3.6 | 原子化 CSS，darkMode: class |
| 组件工具 | clsx + tailwind-merge | 2.0.0 / 2.2.0 | cn() 合并 className |
| 图标 | lucide-react | 0.294.0 | SVG 图标 |
| 动画 | framer-motion | 10.16.16 | 声明式动画 |
| 状态 | Zustand | 4.4.7 | persist 中间件 → localStorage |
| 路由 | react-router-dom | 6.20.0 | HashRouter 适配 file:// |
| 本地库 | Dexie | 3.2.4 | IndexedDB Promise 封装（3 个 schema 版本，11 张表） |
| 云端库 | @supabase/supabase-js | 2.112.2 | anon / service_role 双客户端 |

### 渲染

| 技术 | 版本 | 用途 |
|---|---|---|
| pixi.js | 7.4.3 | 2D WebGL，Live2D 底层 |
| pixi-live2d-display | 0.5.0-beta | Live2D Cubism 3/4 渲染、表情/动作触发 |
| three | 0.185.1 | 3D 模型 + OrbitControls |
| live2dcubismcore.min.js | — | Cubism 核心运行时（public/lib/，index.html 手动引入） |

### 后端（server/package.json）

| 类别 | 技术 | 版本 | 用途 |
|---|---|---|---|
| Web 框架 | Express | 4.21.2 | REST API，业务内联在路由 |
| 数据库 | @supabase/supabase-js | 2.45.0 | service_role 绕过 RLS 直写 |
| AI 对话 | （裸 fetch → DeepSeek） | — | ⚠ openai SDK 已声明**未使用** |
| 认证 | （未实现） | — | ⚠ jsonwebtoken / bcryptjs 已声明**未使用**，实际明文比对 |
| 文件上传 | multer | 2.2.0 | 音频接收（/speech/recognize） |
| 语音 | ws + fluent-ffmpeg + ffmpeg-static | 8.21.3 / 5.3.0 | 讯飞 WS 音频分片、格式转换（⚠ edge-tts 已声明未使用） |
| 文档解析 | mammoth + pdf-parse | 1.12.1 / 2.4.5 | docx / pdf 文本提取 |
| 邮件 | nodemailer | 9.0.5 | SMTP（客服通知 + 验证码） |
| HTTP | axios | 1.19.0 | Spug 短信推送 |

### 桌面端

| 技术 | 版本 | 用途 |
|---|---|---|
| electron | 28.0.0 | 桌面壳（主窗 + 桌宠窗） |
| electron-builder | 24.9.1 | Windows NSIS x64 安装包 |
| vite-plugin-electron | 0.28.0 | 双入口构建 |

### 前端文档/图像处理

mammoth 1.12.0（浏览器端 docx 解析）、tesseract.js 7.0.0（OCR 中英文）、dexie-react-hooks 1.1.7。

## 运行方式

```bash
npm run dev                      # 前端开发（Vite + Electron，5173）
npm run electron:dev             # Electron 开发
cd server && npm run dev         # 后端开发（tsx watch，3001；predev 会先杀 3001 端口）
npm run build                    # 前端构建
cd server && npm run build && npm start   # 后端构建/生产
npm run build:win                # Electron 打包（Windows NSIS x64）
```

## 部署形态（重要事实）

- **后端不进安装包**：electron-builder `files` 只含 `dist/**` 与 `dist-electron/**`（根 package.json:59-65），无 extraResources；`electron/main.ts` 无 child_process——**装完应用后端不会自启**，须人工在项目里 `cd server && npm run dev`。
- 前端 7 个 service 文件**硬编码 `http://localhost:3001`**，无环境变量可配置。
- server CORS `origin: true` 全放行；`listen` 未指定 host（实际绑 0.0.0.0，局域网可访问）。
- 无 Dockerfile / nginx / 公网部署配置；无「服务器部署、浏览器访问」的形态。
- **实际使用形态 = 单机桌面应用 + 云数据库**：账号/角色/消息全存 Supabase 云，换机登录数据仍在；"服务端"被拆成本地伴生进程 + Supabase 直连。
