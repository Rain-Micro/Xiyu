import { Router, Request, Response } from 'express'
import { supabase } from '../supabase'
import { PLATFORM_KNOWLEDGE } from '../services/platformKnowledge'
import { sendCustomerServiceEmail } from '../services/emailService'

const router = Router()
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'
const CS_CHARACTER_ID = 'customer-service'

const TRANSFER_MARKER = 'TRANSFER_TO_HUMAN'
const HUMAN_KEYWORDS = ['转人工', '人工客服', '真人客服', '找人工', '人工服务']
const CLOSE_MARKER = '__CLOSED__:'
const ADMIN_REPLY_PREFIX = '[客服] '

const ADMIN_EMAILS = ['2968679835@qq.com']

function stripMarkdown(text: string): string {
  if (!text) return text
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-+]\s+/gm, '')
}

function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

// 获取客服对话历史
async function getCSHistory(userId: string, limit: number = 20) {
  const { data, error } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('character_id', CS_CHARACTER_ID)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) return []
  return data || []
}

// 检查用户是否已有人工客服介入（有 [客服] 前缀的消息）
async function hasHumanIntervention(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('messages')
    .select('content')
    .eq('character_id', CS_CHARACTER_ID)
    .eq('user_id', userId)
    .eq('role', 'assistant')

  if (error) return false
  return (data || []).some((msg) => {
    const content = (msg.content as string) || ''
    return content.startsWith(ADMIN_REPLY_PREFIX) || content.startsWith(CLOSE_MARKER)
  })
}

// 检查会话是否已关闭
async function isSessionClosed(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('messages')
    .select('content')
    .eq('character_id', CS_CHARACTER_ID)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return false
  const content = (data.content as string) || ''
  return content.startsWith(CLOSE_MARKER)
}

// 调用 DeepSeek AI 客服
async function callAICustomerService(userMessage: string, history: { role: string; content: string }[]): Promise<string> {
  const systemPrompt = `${PLATFORM_KNOWLEDGE}\n\n## 重要指示\n你现在作为栖屿平台的客服代表回答用户的问题。请以"客服"的身份自称，不要自称"AI助手"。\n- 如果你无法基于以上平台信息回答用户的问题，请只回复"${TRANSFER_MARKER}"，不要回复其他内容。\n- 如果用户明确要求转人工客服，请只回复"${TRANSFER_MARKER}"。\n- 回复中不使用任何Markdown格式符号（如星号*、下划线_等），直接用纯文本回复。`

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((h) => ({
      role: (h.role === 'user' ? 'user' : 'assistant') as string,
      content: h.content,
    })),
    { role: 'user', content: userMessage },
  ]

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      messages,
      temperature: 0.5,
      max_tokens: 1024,
      stream: false,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[CS DeepSeek API 错误]', response.status, errorText)
    throw new Error('AI 服务调用失败')
  }

  const data = await response.json() as { choices?: { message?: { content?: string } }[] }
  return stripMarkdown(data.choices?.[0]?.message?.content || '')
}

// 用户发送客服消息
router.post('/chat', async (req: Request, res: Response) => {
  const { userId, userNickname, message, ocrText } = req.body

  if (!userId || !message) {
    return res.status(400).json({ error: '缺少必要参数' })
  }

  // 构建 AI 可见的消息内容（包含 OCR 识别文本）
  const aiMessage = ocrText && ocrText.trim()
    ? `[用户发送了一张图片，通过OCR识别到以下文字内容：\n${ocrText.slice(0, 2000)}\n\n用户消息：${message}]`
    : message

  try {
    // 0. 检查会话是否已关闭
    const closed = await isSessionClosed(userId)
    if (closed) {
      return res.json({
        reply: '会话已关闭，如有新问题请重新发起',
        transferred: false,
        sessionClosed: true,
      })
    }

    // 1. 存储用户消息
    await supabase.from('messages').insert({
      user_id: userId,
      character_id: CS_CHARACTER_ID,
      role: 'user',
      content: message,
    })

    // 2. 检查是否已有人工客服介入
    const humanIntervened = await hasHumanIntervention(userId)
    if (humanIntervened) {
      // 已有人工介入，直接通知人工
      console.log(`[CS] 已有人工介入，发送邮件通知: userId=${userId}, userNickname=${userNickname}`)
      const emailSent = await sendCustomerServiceEmail({
        userNickname: userNickname || '未知用户',
        userMessage: message,
        sentAt: new Date().toLocaleString('zh-CN'),
      })
      console.log(`[CS] 邮件发送结果: ${emailSent ? '成功' : '失败'}`)
      return res.json({
        reply: '您的问题已转达给人工客服，请稍候。',
        transferred: true,
      })
    }

    // 3. 检查用户是否明确要求转人工
    const wantsHuman = HUMAN_KEYWORDS.some((kw) => message.includes(kw))
    if (wantsHuman) {
      console.log(`[CS] 用户要求转人工，发送邮件通知: userId=${userId}, userNickname=${userNickname}`)
      const emailSent = await sendCustomerServiceEmail({
        userNickname: userNickname || '未知用户',
        userMessage: message,
        sentAt: new Date().toLocaleString('zh-CN'),
      })
      console.log(`[CS] 邮件发送结果: ${emailSent ? '成功' : '失败'}`)
      // 存储转人工消息
      await supabase.from('messages').insert({
        user_id: userId,
        character_id: CS_CHARACTER_ID,
        role: 'assistant',
        content: '您的问题我将为您转接人工客服，请稍候...',
      })
      return res.json({
        reply: '您的问题我将为您转接人工客服，请稍候...',
        transferred: true,
      })
    }

    // 4. AI 客服尝试解答
    const history = await getCSHistory(userId, 20)
    // 排除刚存入的用户消息（避免重复）
    const historyWithoutLast = history.slice(0, -1)

    let aiReply: string
    try {
      aiReply = await callAICustomerService(aiMessage, historyWithoutLast)
    } catch (err) {
      console.error('[CS] AI 调用失败，转人工:', err)
      await sendCustomerServiceEmail({
        userNickname: userNickname || '未知用户',
        userMessage: message,
        sentAt: new Date().toLocaleString('zh-CN'),
      })
      await supabase.from('messages').insert({
        user_id: userId,
        character_id: CS_CHARACTER_ID,
        role: 'assistant',
        content: '抱歉，我暂时无法解答您的问题，已为您转接人工客服，请稍候...',
      })
      return res.json({
        reply: '抱歉，我暂时无法解答您的问题，已为您转接人工客服，请稍候...',
        transferred: true,
      })
    }

    // 5. 检查 AI 是否无法解答
    if (aiReply.includes(TRANSFER_MARKER) || !aiReply.trim()) {
      await sendCustomerServiceEmail({
        userNickname: userNickname || '未知用户',
        userMessage: message,
        sentAt: new Date().toLocaleString('zh-CN'),
        aiReply: aiReply.replace(TRANSFER_MARKER, '').trim() || undefined,
      })
      const transferMsg = '您的问题我将为您转接人工客服，请稍候...'
      await supabase.from('messages').insert({
        user_id: userId,
        character_id: CS_CHARACTER_ID,
        role: 'assistant',
        content: transferMsg,
      })
      return res.json({
        reply: transferMsg,
        transferred: true,
      })
    }

    // 6. AI 成功解答
    await supabase.from('messages').insert({
      user_id: userId,
      character_id: CS_CHARACTER_ID,
      role: 'assistant',
      content: aiReply,
    })

    res.json({ reply: aiReply, transferred: false })
  } catch (error) {
    console.error('[CS API 错误]', error)
    res.status(500).json({ error: '客服服务异常' })
  }
})

// 获取客服对话记录（用户侧）
router.get('/messages/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params

  if (!userId) {
    return res.status(400).json({ error: '缺少 userId' })
  }

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('character_id', CS_CHARACTER_ID)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[CS] 获取消息失败:', error)
    return res.status(500).json({ error: error.message })
  }

  // 过滤标记消息，剥离 [客服] 前缀，添加 sender 字段
  const messages = (data || [])
    .filter((msg) => {
      const content = (msg.content as string) || ''
      return !content.startsWith(CLOSE_MARKER)
    })
    .map((msg) => {
      const content = (msg.content as string) || ''
      if (content.startsWith(ADMIN_REPLY_PREFIX)) {
        return { ...msg, content: content.substring(ADMIN_REPLY_PREFIX.length), sender: 'admin' }
      }
      return { ...msg, sender: msg.role === 'user' ? 'user' : 'ai' }
    })

  // 检查会话是否已关闭
  const closed = (data || []).some((msg) => {
    const content = (msg.content as string) || ''
    return content.startsWith(CLOSE_MARKER)
  })

  res.json({ messages, sessionClosed: closed })
})

// 人工客服回复（标记为人工介入，即管理员回复）
router.post('/reply', async (req: Request, res: Response) => {
  const { userId, content, adminEmail } = req.body

  if (!userId || !content) {
    return res.status(400).json({ error: '缺少必要参数' })
  }

  if (!isAdminEmail(adminEmail)) {
    return res.status(403).json({ error: '无权限' })
  }

  const cleanContent = stripMarkdown(content)

  const { data, error } = await supabase.from('messages').insert({
    user_id: userId,
    character_id: CS_CHARACTER_ID,
    role: 'assistant',
    content: `${ADMIN_REPLY_PREFIX}${cleanContent}`,
  }).select().single()

  if (error) {
    console.error('[CS] 人工回复存储失败:', error)
    return res.status(500).json({ error: error.message })
  }

  res.json({ success: true, message: data })
})

// ─── 管理员接口 ───────────────────────────────────────────────

// 管理员鉴权中间件
function adminAuth(req: Request, res: Response, next: () => void) {
  const adminEmail = req.headers['x-admin-email'] as string || req.body?.adminEmail
  if (!isAdminEmail(adminEmail)) {
    return res.status(403).json({ error: '无权限访问' })
  }
  next()
}

// 获取所有客服会话列表
router.get('/sessions', adminAuth, async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('user_id, role, content, created_at')
      .eq('character_id', CS_CHARACTER_ID)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[CS Admin] 获取会话列表失败:', error)
      return res.status(500).json({ error: error.message })
    }

    // 按用户分组，提取每个用户的最新消息和统计信息
    const sessionMap = new Map<string, {
      userId: string
      lastRole: string
      lastContent: string
      lastTime: string
      messageCount: number
      isClosed: boolean
    }>()

    for (const msg of data || []) {
      const uid = msg.user_id as string
      if (!sessionMap.has(uid)) {
        // 第一条就是最新消息（已按 created_at 降序排列）
        const content = (msg.content as string) || ''
        sessionMap.set(uid, {
          userId: uid,
          lastRole: msg.role as string,
          lastContent: content,
          lastTime: msg.created_at as string,
          messageCount: 1,
          isClosed: content.startsWith(CLOSE_MARKER),
        })
      } else {
        sessionMap.get(uid)!.messageCount++
      }
    }

    // 获取用户信息
    const userIds = Array.from(sessionMap.keys())
    const userInfoMap = new Map<string, { nickname: string; email: string; phone: string }>()

    if (userIds.length > 0) {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, nickname, email, phone')
        .in('id', userIds)

      for (const u of usersData || []) {
        userInfoMap.set(u.id as string, {
          nickname: u.nickname as string || '',
          email: u.email as string || '',
          phone: u.phone as string || '',
        })
      }
    }

    // 构建会话列表
    const sessions = Array.from(sessionMap.values()).map((s) => {
      const userInfo = userInfoMap.get(s.userId)
      let status: 'pending' | 'handled' | 'closed'
      if (s.isClosed) {
        status = 'closed'
      } else if (s.lastRole === 'user') {
        status = 'pending'
      } else {
        status = 'handled'
      }
      return {
        userId: s.userId,
        nickname: userInfo?.nickname || userInfo?.email || userInfo?.phone || '未知用户',
        lastMessage: s.lastContent.startsWith(CLOSE_MARKER)
          ? '会话已关闭'
          : s.lastContent.startsWith(ADMIN_REPLY_PREFIX)
            ? s.lastContent.substring(ADMIN_REPLY_PREFIX.length)
            : s.lastContent,
        lastMessageTime: s.lastTime,
        messageCount: s.messageCount,
        status,
      }
    })

    // 排序：待处理优先，然后按时间倒序
    sessions.sort((a, b) => {
      const order = { pending: 0, handled: 1, closed: 2 }
      if (order[a.status] !== order[b.status]) {
        return order[a.status] - order[b.status]
      }
      return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
    })

    res.json({ sessions })
  } catch (err) {
    console.error('[CS Admin] 获取会话列表异常:', err)
    res.status(500).json({ error: '获取会话列表失败' })
  }
})

// 获取指定会话的完整对话记录
router.get('/sessions/:userId/messages', adminAuth, async (req: Request, res: Response) => {
  const { userId } = req.params

  if (!userId) {
    return res.status(400).json({ error: '缺少 userId' })
  }

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('character_id', CS_CHARACTER_ID)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[CS Admin] 获取会话详情失败:', error)
    return res.status(500).json({ error: error.message })
  }

  // 过滤标记消息，剥离 [客服] 前缀，添加 sender 字段
  const messages = (data || [])
    .filter((msg) => {
      const content = (msg.content as string) || ''
      return !content.startsWith(CLOSE_MARKER)
    })
    .map((msg) => {
      const content = (msg.content as string) || ''
      if (content.startsWith(ADMIN_REPLY_PREFIX)) {
        return { ...msg, content: content.substring(ADMIN_REPLY_PREFIX.length), sender: 'admin' }
      }
      return { ...msg, sender: msg.role === 'user' ? 'user' : 'ai' }
    })

  res.json({ messages })
})

// 管理员关闭会话
router.post('/close/:userId', adminAuth, async (req: Request, res: Response) => {
  const { userId } = req.params

  if (!userId) {
    return res.status(400).json({ error: '缺少 userId' })
  }

  const { error } = await supabase.from('messages').insert({
    user_id: userId,
    character_id: CS_CHARACTER_ID,
    role: 'assistant',
    content: `${CLOSE_MARKER}会话已关闭`,
  })

  if (error) {
    console.error('[CS Admin] 关闭会话失败:', error)
    return res.status(500).json({ error: error.message })
  }

  res.json({ success: true })
})

// 用户重新发起会话（清空历史消息）
router.post('/reopen/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params

  if (!userId) {
    return res.status(400).json({ error: '缺少 userId' })
  }

  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('character_id', CS_CHARACTER_ID)
    .eq('user_id', userId)

  if (error) {
    console.error('[CS] 重新发起会话失败:', error)
    return res.status(500).json({ error: error.message })
  }

  res.json({ success: true })
})

export default router
