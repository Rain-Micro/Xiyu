import { Router, Request, Response } from 'express'
import { PLATFORM_KNOWLEDGE } from '../services/platformKnowledge'
import { sendCustomerServiceEmail } from '../services/emailService'
import { query } from '../db'
import { requireAuth, requireAdmin } from '../auth'
import { getRuntimeConfig } from '../config'

const router = Router()
// 出站 AI 端点固定为官方地址（杜绝 SSRF）；密钥/模型名支持后台运行时覆盖
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'
const DEEPSEEK_MODEL_FALLBACK = 'deepseek-v4-flash'

const CS_CHARACTER_ID = 'customer-service'

const TRANSFER_MARKER = 'TRANSFER_TO_HUMAN'
const HUMAN_KEYWORDS = ['转人工', '人工客服', '真人客服', '找人工', '人工服务']
const CLOSE_MARKER = '__CLOSED__:'
const ADMIN_REPLY_PREFIX = '[客服] '

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

// 获取客服对话历史（最近 N 条，按时间正序）
async function getCSHistory(userId: string, limit: number = 20) {
  const { rows } = await query<{ role: string; content: string; created_at: Date }>(
    `SELECT role, content, created_at FROM (
       SELECT role, content, created_at FROM messages
       WHERE character_id=$1 AND user_id=$2
       ORDER BY created_at DESC LIMIT $3
     ) recent ORDER BY created_at ASC`,
    [CS_CHARACTER_ID, userId, limit],
  )
  return rows
}

// 检查用户是否已有人工客服介入（有 [客服] 前缀的消息）
async function hasHumanIntervention(userId: string): Promise<boolean> {
  const { rows } = await query<{ content: string }>(
    `SELECT content FROM messages
     WHERE character_id=$1 AND user_id=$2 AND role='assistant'`,
    [CS_CHARACTER_ID, userId],
  )
  return rows.some((msg) => {
    const content = msg.content || ''
    return content.startsWith(ADMIN_REPLY_PREFIX) || content.startsWith(CLOSE_MARKER)
  })
}

// 检查会话是否已关闭
async function isSessionClosed(userId: string): Promise<boolean> {
  const { rows } = await query<{ content: string }>(
    `SELECT content FROM messages
     WHERE character_id=$1 AND user_id=$2
     ORDER BY created_at DESC LIMIT 1`,
    [CS_CHARACTER_ID, userId],
  )
  if (rows.length === 0) return false
  return (rows[0].content || '').startsWith(CLOSE_MARKER)
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
      'Authorization': `Bearer ${await getRuntimeConfig('DEEPSEEK_API_KEY')}`,
    },
    body: JSON.stringify({
      model: (await getRuntimeConfig('DEEPSEEK_MODEL')) ?? DEEPSEEK_MODEL_FALLBACK,
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

// 用户发送客服消息（userId 取自 JWT）
router.post('/chat', requireAuth, async (req: Request, res: Response) => {
  const auth = req.auth!
  const userId = auth.userId
  const { userNickname, message, ocrText } = req.body

  if (!message) {
    res.status(400).json({ error: '缺少必要参数' })
    return
  }

  // 构建 AI 可见的消息内容（包含 OCR 识别文本）
  const aiMessage = ocrText && ocrText.trim()
    ? `[用户发送了一张图片，通过OCR识别到以下文字内容：\n${String(ocrText).slice(0, 2000)}\n\n用户消息：${message}]`
    : message

  try {
    // 0. 检查会话是否已关闭
    const closed = await isSessionClosed(userId)
    if (closed) {
      res.json({
        reply: '会话已关闭，如有新问题请重新发起',
        transferred: false,
        sessionClosed: true,
      })
      return
    }

    // 1. 存储用户消息
    await query(
      'INSERT INTO messages (user_id, character_id, role, content) VALUES ($1, $2, $3, $4)',
      [userId, CS_CHARACTER_ID, 'user', String(message)],
    )

    // 2. 检查是否已有人工客服介入
    const humanIntervened = await hasHumanIntervention(userId)
    if (humanIntervened) {
      console.log(`[CS] 已有人工介入，发送邮件通知: userId=${userId}, userNickname=${userNickname}`)
      const emailSent = await sendCustomerServiceEmail({
        userNickname: userNickname || '未知用户',
        userMessage: String(message),
        sentAt: new Date().toLocaleString('zh-CN'),
      })
      console.log(`[CS] 邮件发送结果: ${emailSent ? '成功' : '失败'}`)
      res.json({
        reply: '您的问题已转达给人工客服，请稍候。',
        transferred: true,
      })
      return
    }

    // 3. 检查用户是否明确要求转人工
    const wantsHuman = HUMAN_KEYWORDS.some((kw) => String(message).includes(kw))
    if (wantsHuman) {
      console.log(`[CS] 用户要求转人工，发送邮件通知: userId=${userId}, userNickname=${userNickname}`)
      await sendCustomerServiceEmail({
        userNickname: userNickname || '未知用户',
        userMessage: String(message),
        sentAt: new Date().toLocaleString('zh-CN'),
      })
      const transferNotice = '您的问题我将为您转接人工客服，请稍候...'
      await query(
        'INSERT INTO messages (user_id, character_id, role, content) VALUES ($1, $2, $3, $4)',
        [userId, CS_CHARACTER_ID, 'assistant', transferNotice],
      )
      res.json({ reply: transferNotice, transferred: true })
      return
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
        userMessage: String(message),
        sentAt: new Date().toLocaleString('zh-CN'),
      })
      const fallbackMsg = '抱歉，我暂时无法解答您的问题，已为您转接人工客服，请稍候...'
      await query(
        'INSERT INTO messages (user_id, character_id, role, content) VALUES ($1, $2, $3, $4)',
        [userId, CS_CHARACTER_ID, 'assistant', fallbackMsg],
      )
      res.json({ reply: fallbackMsg, transferred: true })
      return
    }

    // 5. 检查 AI 是否无法解答
    if (aiReply.includes(TRANSFER_MARKER) || !aiReply.trim()) {
      await sendCustomerServiceEmail({
        userNickname: userNickname || '未知用户',
        userMessage: String(message),
        sentAt: new Date().toLocaleString('zh-CN'),
        aiReply: aiReply.replace(TRANSFER_MARKER, '').trim() || undefined,
      })
      const transferMsg = '您的问题我将为您转接人工客服，请稍候...'
      await query(
        'INSERT INTO messages (user_id, character_id, role, content) VALUES ($1, $2, $3, $4)',
        [userId, CS_CHARACTER_ID, 'assistant', transferMsg],
      )
      res.json({ reply: transferMsg, transferred: true })
      return
    }

    // 6. AI 成功解答
    await query(
      'INSERT INTO messages (user_id, character_id, role, content) VALUES ($1, $2, $3, $4)',
      [userId, CS_CHARACTER_ID, 'assistant', aiReply],
    )

    res.json({ reply: aiReply, transferred: false })
  } catch (error) {
    console.error('[CS API 错误]', error)
    res.status(500).json({ error: '客服服务异常' })
  }
})

// 获取客服对话记录（用户侧，仅本人；路径参数仅作兼容，实际以 JWT 为准）
router.get('/messages/:userId', requireAuth, async (req: Request, res: Response) => {
  const auth = req.auth!
  const targetUserId = req.params.userId

  if (targetUserId && targetUserId !== auth.userId) {
    res.status(403).json({ error: '只能查看自己的会话' })
    return
  }

  const { rows } = await query<{ id: string; role: string; content: string; created_at: Date }>(
    `SELECT id, role, content, created_at FROM messages
     WHERE character_id=$1 AND user_id=$2 ORDER BY created_at ASC`,
    [CS_CHARACTER_ID, auth.userId],
  )

  // 过滤标记消息，剥离 [客服] 前缀，添加 sender 字段
  const messages = rows
    .filter((msg) => !(msg.content || '').startsWith(CLOSE_MARKER))
    .map((msg) => {
      const content = msg.content || ''
      if (content.startsWith(ADMIN_REPLY_PREFIX)) {
        return { ...msg, content: content.substring(ADMIN_REPLY_PREFIX.length), sender: 'admin' }
      }
      return { ...msg, sender: msg.role === 'user' ? 'user' : 'ai' }
    })

  const closed = rows.some((msg) => (msg.content || '').startsWith(CLOSE_MARKER))

  res.json({ messages, sessionClosed: closed })
})

// 人工客服回复（管理员；body.userId 为目标用户）
router.post('/reply', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const { userId, content } = req.body

  if (!userId || !content) {
    res.status(400).json({ error: '缺少必要参数' })
    return
  }

  const cleanContent = stripMarkdown(String(content))

  try {
    const { rows } = await query(
      `INSERT INTO messages (user_id, character_id, role, content)
       VALUES ($1, $2, 'assistant', $3)
       RETURNING id, user_id, character_id, role, content, created_at`,
      [String(userId), CS_CHARACTER_ID, `${ADMIN_REPLY_PREFIX}${cleanContent}`],
    )
    res.json({ success: true, message: rows[0] })
  } catch (err) {
    console.error('[CS] 人工回复存储失败:', err)
    res.status(500).json({ error: '回复存储失败' })
  }
})

// ─── 管理员接口（requireAdmin：JWT role 驱动，彻底替代可伪造的 x-admin-email） ───

// 获取所有客服会话列表
router.get('/sessions', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { rows } = await query<{ user_id: string; role: string; content: string; created_at: Date }>(
      `SELECT user_id, role, content, created_at FROM messages
       WHERE character_id=$1 ORDER BY created_at DESC`,
      [CS_CHARACTER_ID],
    )

    // 按用户分组，提取每个用户的最新消息和统计信息
    const sessionMap = new Map<string, {
      userId: string
      lastRole: string
      lastContent: string
      lastTime: Date
      messageCount: number
      isClosed: boolean
    }>()

    for (const msg of rows) {
      const uid = msg.user_id
      if (!sessionMap.has(uid)) {
        // 第一条就是最新消息（已按 created_at 降序排列）
        const content = msg.content || ''
        sessionMap.set(uid, {
          userId: uid,
          lastRole: msg.role,
          lastContent: content,
          lastTime: msg.created_at,
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
      const { rows: usersData } = await query<{ id: string; nickname: string | null; email: string | null; phone: string | null }>(
        'SELECT id, nickname, email, phone FROM users WHERE id = ANY($1::uuid[])',
        [userIds],
      )
      for (const u of usersData) {
        userInfoMap.set(u.id, {
          nickname: u.nickname || '',
          email: u.email || '',
          phone: u.phone || '',
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
router.get('/sessions/:userId/messages', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const { userId } = req.params

  if (!userId) {
    res.status(400).json({ error: '缺少 userId' })
    return
  }

  const { rows } = await query<{ id: string; role: string; content: string; created_at: Date }>(
    `SELECT id, role, content, created_at FROM messages
     WHERE character_id=$1 AND user_id=$2 ORDER BY created_at ASC`,
    [CS_CHARACTER_ID, userId],
  )

  const messages = rows
    .filter((msg) => !(msg.content || '').startsWith(CLOSE_MARKER))
    .map((msg) => {
      const content = msg.content || ''
      if (content.startsWith(ADMIN_REPLY_PREFIX)) {
        return { ...msg, content: content.substring(ADMIN_REPLY_PREFIX.length), sender: 'admin' }
      }
      return { ...msg, sender: msg.role === 'user' ? 'user' : 'ai' }
    })

  res.json({ messages })
})

// 管理员关闭会话
router.post('/close/:userId', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const { userId } = req.params

  if (!userId) {
    res.status(400).json({ error: '缺少 userId' })
    return
  }

  try {
    await query(
      'INSERT INTO messages (user_id, character_id, role, content) VALUES ($1, $2, $3, $4)',
      [userId, CS_CHARACTER_ID, 'assistant', `${CLOSE_MARKER}会话已关闭`],
    )
    res.json({ success: true })
  } catch (err) {
    console.error('[CS Admin] 关闭会话失败:', err)
    res.status(500).json({ error: '关闭会话失败' })
  }
})

// 用户重新发起会话（清空历史消息，仅本人）
router.post('/reopen/:userId', requireAuth, async (req: Request, res: Response) => {
  const auth = req.auth!
  const targetUserId = req.params.userId

  if (targetUserId !== auth.userId) {
    res.status(403).json({ error: '只能重开自己的会话' })
    return
  }

  try {
    await query('DELETE FROM messages WHERE character_id=$1 AND user_id=$2', [CS_CHARACTER_ID, auth.userId])
    res.json({ success: true })
  } catch (err) {
    console.error('[CS] 重新发起会话失败:', err)
    res.status(500).json({ error: '重新发起会话失败' })
  }
})

export default router
