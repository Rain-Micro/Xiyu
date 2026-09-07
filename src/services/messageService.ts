const API_URL = 'http://localhost:3001/api'

// 发送消息
export async function sendMessage(userId: string, characterId: string, role: 'user' | 'assistant', content: string) {
  const response = await fetch(`${API_URL}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, characterId, role, content }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '发送消息失败')
  return data.message
}

// 获取角色的所有消息
export async function getMessages(characterId: string, userId: string) {
  const response = await fetch(`${API_URL}/messages/${characterId}?userId=${userId}`)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '获取消息失败')
  return data.messages
}

// 清空角色的所有消息
export async function clearMessages(characterId: string, userId: string) {
  const response = await fetch(`${API_URL}/messages/${characterId}?userId=${userId}`, {
    method: 'DELETE',
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '清空消息失败')
  return data
}