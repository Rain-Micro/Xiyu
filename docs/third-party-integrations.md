# 栖屿数字人交互平台 · 第三方集成与官方 SDK 对照

> 整理于 2026-09-07。来源：代码实测 + 官方文档检索（2026-09）。

## 一、外部服务端点

| 服务 | 用途 | 端点 | 项目调用方式 |
|---|---|---|---|
| DeepSeek | AI 对话 / 角色解析 | `https://api.deepseek.com/v1/chat/completions` | 裸 fetch + Bearer（routes/chat.ts:9,143；customerService.ts:93-105），模型 `deepseek-v4-flash`（`-pro` 仅出现在从未调用的视觉函数中） |
| 讯飞 IAT（语音听写） | 语音转文字 | `wss://iat-api.xfyun.cn/v2/iat` | 手写 HMAC-SHA256 签名 + 裸 WebSocket（services/iflytek.ts:20-52），ffmpeg-static 转 PCM 16k/16bit/mono |
| 讯飞 TTS（在线合成） | 语音合成 | `wss://tts-api.xfyun.cn/v2/tts` | 手写签名 + WebSocket，base64 PCM 分片 → WAV（services/voiceService.ts） |
| 讯飞超拟人 TTS | 高质量合成 | `wss://cbm01.cn-huabei-1.xf-yun.com/…`（XFYUN_SUPERNATURAL_URL） | WebSocket，音色 x5_/x6_（聆玉昭/聆小璇等） |
| Operit（数字人盒子） | 局域网 TTS | `http://{OPERIT_HOST}:{OPERIT_PORT}/api/external-chat` | HTTP 发 `/voice_bar:say <text>` 命令 → 从返回 voice_tag 下载 wav（voiceService.ts:144-199）；私有协议，默认 TTS_ENGINE=operit |
| Spug 推送助手 | 短信验证码 | `https://push.spug.cc/sms/{template}` | axios GET + Bearer（services/sms.ts:22-34），SMS_MODE=mock 默认不真发 |
| QQ SMTP | 邮件（客服通知 + 验证码） | `smtp.qq.com:465` | nodemailer（services/emailService.ts），默认通知邮箱 rain0153@foxmail.com |
| Supabase | 数据库 | `https://ieqnqaydjglcroshjciw.supabase.co` | 官方 @supabase/supabase-js（前端 anon+service_role 双客户端；后端 service_role）。**⚠ 2026-09-07 核实：项目已被删除（代码 ref 与负责人备份 ref 均 NXDOMAIN），需重建或改自建 PostgreSQL** |

## 二、环境变量清单

### 前端 `.env.local`（已被 git 跟踪 ⚠）

| 变量 | 说明 |
|---|---|
| VITE_SUPABASE_URL | Supabase 项目 URL |
| VITE_SUPABASE_ANON_KEY | anon 公钥（supabase.ts 有硬编码兜底） |
| VITE_SUPABASE_SERVICE_ROLE_KEY | **service_role 密钥打进前端包** ⚠ 最高风险 |

### 后端 `server/.env`

| 变量 | 必要性 | 说明 |
|---|---|---|
| PORT | 可选 | 默认 3001 |
| SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY | **必需** | 无则登录/存储全挂 |
| DEEPSEEK_API_KEY | **必需** | 无则所有 AI 功能不可用 |
| SUPABASE_HOOK_SECRET | 按功能 | /api/sms/supabase-hook 验证 |
| JWT_SECRET | 冗余 | ⚠ 代码未用 JWT |
| SMTP_HOST/PORT/USER/PASS、NOTIFY_EMAIL | 按功能 | 无则邮件不发（mock 打日志） |
| SMS_MODE / SMS_API_URL / SMS_TEMPLATE_ID / SMS_API_TOKEN | 按功能 | SMS_MODE=mock|real，默认 mock |
| IFLYTEK_APPID / IFLYTEK_APIKEY / IFLYTEK_APISECRET | 按功能 | ASR + 标准 TTS |
| XFYUN_SUPERNATURAL_URL | 可选 | 超拟人 TTS（降级链第一优先） |
| TTS_ENGINE / OPERIT_HOST / OPERIT_PORT / OPERIT_TOKEN / OPERIT_API_URL | 可选 | Operit 引擎，默认 TTS_ENGINE=operit，需局域网可达 |

## 三、官方 SDK 检索结论

| 服务 | 项目现状 | 官方 SDK / 推荐接入 | 结论 |
|---|---|---|---|
| DeepSeek | 裸 fetch | **无自有 SDK，官方推荐复用 OpenAI SDK**：baseURL 改 `https://api.deepseek.com` 即可（也支持 Anthropic 格式 `/anthropic`）。[api-docs.deepseek.com](https://api-docs.deepseek.com/) | server 已声明 `openai` 依赖但未 import——**唯一"有现成官方推荐 SDK 却没用"的集成**，可零成本迁移 |
| 讯飞 TTS | 手写签名 + WS | 官方主推即 **WebSocket API**（轻量跨语言）；官方提供 Java/Python3/JS/**Node.js** Demo 下载，GitHub SDK 仅 websdk-python / websdk-java；平台 SDK（MSC/SparkChain/HarmonyOS）无 Node 版。[在线语音合成 API](https://www.xfyun.cn/doc/tts/online_tts/API.html) | Node 服务端下项目做法合规；可对照官方 Node.js Demo 完善（二进制帧 output_proto=binary、错误码处理等） |
| 讯飞 IAT（ASR） | 手写签名 + WS | 同上：WebSocket 流式 API 为主，Demo 含 Java/Python3/JS/Go/Node.js，SDK 仅 Python/Java。[语音听写 API](https://www.xfyun.cn/doc/asr/voicedictation/API.html) | 项目做法合规；音频约束 16k/8k、16bit、mono、单次 ≤60s |
| Supabase | 官方 SDK | @supabase/supabase-js。[JS 参考](https://supabase.com/docs/reference/javascript/introduction) | 已是官方 SDK；问题在 service_role 用法（见风险清单），可考虑迁移 Supabase Auth |
| 邮件 | nodemailer | Node 生态事实标准 | ✓ |
| Spug 推送 | 裸 HTTP | 定位即"一个 HTTP 请求完成推送"，无官方 SDK，裸 HTTP 就是官方用法。[push.spug.cc](https://push.spug.cc) | ✓ |
| Operit | 内网 HTTP 私有协议 | **无公开官方 SDK**。公开的同名项目 Operit 是 Android AI 助手（[operit.app](https://operit.app/) / [GitHub](https://github.com/AAswordman/Operit)），与本项目的数字人盒子/`external-chat` 无匹配——属自研或厂商私有固件协议 | 只能依赖私有文档/抓包维护 |

## 四、死依赖（package.json 声明但全仓无 import）

| 依赖 | 声明用途 | 实际 |
|---|---|---|
| `openai` 4.52.7 | 封装 DeepSeek | chat.ts 走裸 fetch；**建议真正用起来**（DeepSeek 官方推荐路径） |
| `edge-tts` 1.0.1 | TTS 引擎 | 未使用；且 edge-tts 是非官方逆向项目（Python 生态），无微软官方 SDK |
| `bcryptjs` 2.4.3 | 密码哈希 | auth 实际明文比对 |
| `jsonwebtoken` 9.0.2 | JWT 签发 | 实际自制假 token 存 localStorage |

另：`ws` 仅作讯飞 WS 客户端（本服务不对外提供 WS）；全项目无 WebSocket/SSE/WebRTC 对外通道，无任务队列（全同步 request/response）。
