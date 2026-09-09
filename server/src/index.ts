import dotenv from 'dotenv'
dotenv.config() // 必须最先加载，确保后续 import 能读取到环境变量

import express from 'express'
import cors from 'cors'
import path from 'path'
import authRoutes from './routes/auth'
import userRoutes from './routes/users'
import messageRoutes from './routes/messages'
import chatRoutes from './routes/chat'
import customerServiceRoutes from './routes/customerService'
import favoritesRoutes from './routes/favorites'
import charactersRoutes from './routes/characters'
import smsRoutes from './routes/sms'
import speechRoutes from './routes/speech'
import voiceRoutes from './routes/voice'
import { requireAuth } from './auth'

const app = express()
const PORT = process.env.PORT || 3001
const AVATAR_DIR = process.env.AVATAR_DIR || 'data/avatars'

// CORS 白名单：无 Origin 的请求（Electron/curl/同源）放行；浏览器跨域来源必须命中列表
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) {
      cb(null, true)
      return
    }
    cb(new Error('CORS_FORBIDDEN'))
  },
  credentials: false, // 认证走 Authorization 头，不使用 Cookie
}))
app.use(express.json({ limit: '10mb' }))

// ─── 公开端点 ───
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})
app.use('/api/auth', authRoutes) // 登录/注册/验证码本身即认证前置
app.use('/api/sms', smsRoutes)

// 头像文件（受保护：文件名白名单防穿越；JWT 经 Bearer 头或 ?t= 查询参数，后者供 <img> 使用）
app.get('/api/avatars/:file', requireAuth, (req, res) => {
  const file = String(req.params.file || '')
  if (!/^[A-Za-z0-9_-]+\.(png|jpe?g|webp)$/.test(file)) {
    res.status(400).json({ error: '非法文件名' })
    return
  }
  res.sendFile(path.resolve(AVATAR_DIR, file), { maxAge: '7d' }, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: '头像不存在' })
    }
  })
})

// ─── 受保护端点（JWT Bearer） ───
app.use('/api/users', requireAuth, userRoutes)
app.use('/api/messages', requireAuth, messageRoutes)
app.use('/api/favorites', requireAuth, favoritesRoutes)
app.use('/api/characters', requireAuth, charactersRoutes)
app.use('/api/chat', chatRoutes) // 路由内部已逐端点挂 requireAuth
app.use('/api/customer-service', customerServiceRoutes) // 同上（含 requireAdmin）
app.use('/api/speech', requireAuth, speechRoutes)
app.use('/api/voice', requireAuth, voiceRoutes)

// 404 兜底
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' })
})

// 全局错误处理（含 CORS 拒绝）
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.message === 'CORS_FORBIDDEN') {
    res.status(403).json({ error: '来源不在白名单' })
    return
  }
  console.error('[server] 未处理异常:', err)
  if (res.headersSent) {
    next(err)
    return
  }
  res.status(500).json({ error: '服务器内部错误' })
})

app.listen(PORT, () => {
  console.log('📡 栖屿后端服务已启动: http://localhost:' + PORT)
})
