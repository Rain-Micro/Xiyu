import { api } from './apiClient'

// 客服 REST 封装。管理员接口由 JWT role 鉴权（adminEmail 参数已废弃，仅为兼容签名保留）

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
  return api<CSChatResponse>({
    method: 'POST',
    path: '/api/customer-service/chat',
    body: { userId, userNickname, message, ocrText },
    signal,
    timeoutMs: 120000,
  })
}

export async function getCSMessages(userId: string) {
  return api<{ messages: Record<string, unknown>[]; sessionClosed?: boolean }>({
    path: `/api/customer-service/messages/${encodeURIComponent(userId)}`,
  })
}

export async function reopenCSSession(userId: string) {
  return api({ method: 'POST', path: `/api/customer-service/reopen/${encodeURIComponent(userId)}` })
}

// ─── 管理员接口（服务端按 JWT role 判定，不再信任 x-admin-email 头） ───

export async function getCSSessions(_adminEmail?: string): Promise<CSSession[]> {
  const data = await api<{ sessions: CSSession[] }>({ path: '/api/customer-service/sessions' })
  return data.sessions || []
}

export async function getCSSessionDetail(userId: string, _adminEmail?: string) {
  const data = await api<{ messages: unknown[] }>({
    path: `/api/customer-service/sessions/${encodeURIComponent(userId)}/messages`,
  })
  return data.messages || []
}

export async function adminReplyCS(userId: string, content: string, _adminEmail?: string) {
  return api({ method: 'POST', path: '/api/customer-service/reply', body: { userId, content } })
}

export async function closeCSSession(userId: string, _adminEmail?: string) {
  return api({ method: 'POST', path: `/api/customer-service/close/${encodeURIComponent(userId)}` })
}
