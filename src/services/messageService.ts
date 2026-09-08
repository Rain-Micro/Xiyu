import { api } from './apiClient'

// 发送消息（userId 由 JWT 携带）
export async function sendMessage(_userId: string, characterId: string, role: 'user' | 'assistant', content: string) {
  const data = await api<{ success: boolean; message: unknown }>({
    method: 'POST',
    path: '/api/messages',
    body: { characterId, role, content },
  })
  return data.message
}

// 获取角色的所有消息
export async function getMessages(characterId: string, _userId: string) {
  const data = await api<{ messages: Record<string, unknown>[] }>({ path: `/api/messages/${encodeURIComponent(characterId)}` })
  return data.messages
}

// 清空角色的所有消息
export async function clearMessages(characterId: string, _userId: string) {
  return api({ method: 'DELETE', path: `/api/messages/${encodeURIComponent(characterId)}` })
}
