import type { Favorite } from '@/types'
import { api } from './apiClient'

// 收藏 REST 封装（userId 由 JWT 携带，参数保留仅为兼容旧调用点）

export async function getFavorites(_userId: string): Promise<Favorite[]> {
  const data = await api<{ favorites: Favorite[] }>({ path: '/api/favorites' })
  return data.favorites || []
}

export async function addFavoriteAPI(favorite: Favorite, _userId?: string): Promise<void> {
  await api({ method: 'POST', path: '/api/favorites', body: { favorite } })
}

export async function updateFavoriteAPI(id: string, updates: Partial<Favorite>): Promise<void> {
  await api({ method: 'PATCH', path: `/api/favorites/${encodeURIComponent(id)}`, body: { updates } })
}

export async function deleteFavoriteAPI(id: string): Promise<void> {
  await api({ method: 'DELETE', path: `/api/favorites/${encodeURIComponent(id)}` })
}
