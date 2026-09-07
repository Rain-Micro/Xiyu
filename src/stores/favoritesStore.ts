import { create } from 'zustand'
import { Favorite, Message } from '@/types'
import {
  getFavorites,
  addFavoriteAPI,
  updateFavoriteAPI,
  deleteFavoriteAPI,
} from '@/services/favoritesAPI'

function getUserId(): string | null {
  try {
    const stored = localStorage.getItem('auth-storage')
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed.state?.user?.id || null
    }
  } catch {
    // ignore
  }
  return null
}

function sortFavorites(list: Favorite[]): Favorite[] {
  return list.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
    return b.createdAt - a.createdAt
  })
}

interface FavoritesState {
  favorites: Favorite[]
  isLoading: boolean
  loadFavorites: () => Promise<void>
  addFavorite: (favorite: Favorite) => Promise<void>
  addFavoriteFromMessage: (message: Message, sourceRole: string, sourceCharacterId?: string) => Promise<void>
  deleteFavorite: (id: string) => Promise<void>
  togglePin: (id: string) => Promise<void>
  batchDelete: (ids: string[]) => Promise<void>
  searchFavorites: (keyword: string) => Favorite[]
  filterByType: (type: string) => Favorite[]
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favorites: [],
  isLoading: false,

  loadFavorites: async () => {
    const userId = getUserId()
    if (!userId) {
      set({ favorites: [] })
      return
    }
    set({ isLoading: true })
    try {
      const favorites = await getFavorites(userId)
      set({ favorites: sortFavorites(favorites) })
    } catch (err) {
      console.error('[FavoritesStore] 云端加载失败:', err)
      set({ favorites: [] })
    } finally {
      set({ isLoading: false })
    }
  },

  addFavorite: async (favorite) => {
    const userId = getUserId()
    if (!userId) return
    try {
      await addFavoriteAPI(favorite, userId)
      set((state) => ({
        favorites: sortFavorites([...state.favorites, favorite]),
      }))
    } catch (err) {
      console.error('[FavoritesStore] 云端添加失败:', err)
    }
  },

  addFavoriteFromMessage: async (message, sourceRole, sourceCharacterId?) => {
    let type: Favorite['type'] = 'text'
    if (message.type === 'image') type = 'image'
    else if (message.type === 'file') type = 'file'
    else if (message.type === 'voice') type = 'voice'
    else {
      const linkRegex = /https?:\/\/\S+|www\.\S+|[a-z0-9-]+\.(com|cn|org|net|edu|gov|io|xyz|top|vip|me|info|biz|tv|cc|co)\b/i
      if (linkRegex.test(message.content)) type = 'link'
    }

    const favorite: Favorite = {
      id: crypto.randomUUID(),
      type,
      content: message.content,
      fileInfo: message.fileInfo,
      voiceInfo: message.voiceInfo,
      sourceRole,
      sourceCharacterId,
      createdAt: Date.now(),
      isPinned: false,
    }
    await get().addFavorite(favorite)
  },

  deleteFavorite: async (id) => {
    const userId = getUserId()
    if (!userId) return
    try {
      await deleteFavoriteAPI(id)
      set((state) => ({
        favorites: state.favorites.filter((f) => f.id !== id),
      }))
    } catch (err) {
      console.error('[FavoritesStore] 云端删除失败:', err)
    }
  },

  togglePin: async (id) => {
    const userId = getUserId()
    if (!userId) return
    const fav = get().favorites.find((f) => f.id === id)
    if (!fav) return
    const newPinned = !fav.isPinned
    try {
      await updateFavoriteAPI(id, { isPinned: newPinned })
      set((state) => {
        const updated = state.favorites.map((f) =>
          f.id === id ? { ...f, isPinned: newPinned } : f
        )
        return { favorites: sortFavorites(updated) }
      })
    } catch (err) {
      console.error('[FavoritesStore] 云端更新失败:', err)
    }
  },

  batchDelete: async (ids) => {
    const userId = getUserId()
    if (!userId) return
    for (const id of ids) {
      try {
        await deleteFavoriteAPI(id)
      } catch (err) {
        console.error('[FavoritesStore] 批量删除中云端失败:', id, err)
      }
    }
    set((state) => ({
      favorites: state.favorites.filter((f) => !ids.includes(f.id)),
    }))
  },

  searchFavorites: (keyword) => {
    if (!keyword.trim()) return get().favorites
    const lower = keyword.toLowerCase()
    return get().favorites.filter(
      (f) =>
        f.content.toLowerCase().includes(lower) ||
        f.sourceRole.toLowerCase().includes(lower)
    )
  },

  filterByType: (type) => {
    if (type === 'all') return get().favorites
    return get().favorites.filter((f) => f.type === type)
  },
}))
