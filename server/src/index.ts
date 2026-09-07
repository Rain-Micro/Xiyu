import dotenv from 'dotenv'
dotenv.config()  // 必须最先加载，确保后续 import 能读取到环境变量

import messageRoutes from './routes/messages'
import chatRoutes from './routes/chat'
import customerServiceRoutes from './routes/customerService'
import favoritesRoutes from './routes/favorites'
import charactersRoutes from './routes/characters'
import smsRoutes from './routes/sms'
import express from 'express'
import cors from 'cors'
import speechRoutes from './routes/speech'
import voiceRoutes from './routes/voice';

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({
  origin: true,
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use('/api/voice', voiceRoutes);

// 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/messages', messageRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/customer-service', customerServiceRoutes)
app.use('/api/favorites', favoritesRoutes)
app.use('/api/characters', charactersRoutes)
app.use('/api/sms', smsRoutes)
app.use('/api/speech', speechRoutes)
app.listen(PORT, () => {
  console.log('📡 栖屿后端服务已启动: http://localhost:' + PORT)
})