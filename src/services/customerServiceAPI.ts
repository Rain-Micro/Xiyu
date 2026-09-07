const API_URL = 'http://localhost:3001/api/customer-service'

interface CSChatResponse {
  reply: string
  transferred: boolean
  sessionClosed?: boolean
}

export interface CSSession {
  userId: string
  nickname: string
  lastMessage: string
  lastMessageTime: string
  messageCount: number
  status: 'pending' | 'handled' | 'closed'
}

export async function sendCSMessage(userId: string, userNickname: string, message: string, ocrText?: string, signal?: AbortSignal): Promise<CSChatResponse> {
  const response = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, userNickname, message, ocrText }),
    signal,
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '客服消息发送失败')
  return { reply: data.reply, transferred: data.transferred, sessionClosed: data.sessionClosed }
}

export async function getCSMessages(userId: string) {
  const response = await fetch(`${API_URL}/messages/${userId}`)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '获取客服消息失败')
  return data
}

export async function reopenCSSession(userId: string) {
  const response = await fetch(`${API_URL}/reopen/${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '重新发起会话失败')
  return data
}

// ─── 管理员接口 ───────────────────────────────────────────────

export async function getCSSessions(adminEmail: string): Promise<CSSession[]> {
  const response = await fetch(`${API_URL}/sessions`, {
    headers: { 'x-admin-email': adminEmail },
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '获取会话列表失败')
  return data.sessions || []
}

export async function getCSSessionDetail(userId: string, adminEmail: string) {
  const response = await fetch(`${API_URL}/sessions/${userId}/messages`, {
    headers: { 'x-admin-email': adminEmail },
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '获取会话详情失败')
  return data.messages || []
}

export async function adminReplyCS(userId: string, content: string, adminEmail: string) {
  const response = await fetch(`${API_URL}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, content, adminEmail }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '回复失败')
  return data
}

export async function closeCSSession(userId: string, adminEmail: string) {
  const response = await fetch(`${API_URL}/close/${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-email': adminEmail },
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '关闭会话失败')
  return data
}
