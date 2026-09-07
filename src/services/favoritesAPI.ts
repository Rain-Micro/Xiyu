const API_URL = 'http://localhost:3001/api/favorites'

import type { Favorite } from '@/types'

export async function getFavorites(userId: string): Promise<Favorite[]> {
  const response = await fetch(`${API_URL}?userId=${userId}`)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '获取收藏列表失败')
  return data.favorites || []
}

export async function addFavoriteAPI(favorite: Favorite, userId: string): Promise<void> {
  const response = await fetch(`${API_URL}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ favorite, userId }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '添加收藏失败')
}

export async function updateFavoriteAPI(id: string, updates: Partial<Favorite>): Promise<void> {
  const response = await fetch(`${API_URL}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '更新收藏失败')
}

export async function deleteFavoriteAPI(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/${id}`, {
    method: 'DELETE',
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '删除收藏失败')
}
