import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  User,
  Character,
  AppSettings,
  Message,
  Notification,
  TutorialProgress
} from '@/types'
import { db } from '@/services/db'
import { seedAssistantsForUser } from '@/services/assistantData'
import {
  getCharacters,
  createCharacterAPI,
  updateCharacterAPI,
  deleteCharacterAPI,
} from '@/services/charactersAPI'

// Re-export create character store
export { useCreateCharacterStore } from './createCharacterStore'
export type { CharacterFormData } from './createCharacterStore'

// Re-export chat store
export { useChatStore } from './chatStore'
export type { CharacterChatStatus } from './chatStore'

// Re-export favorites store
export { useFavoritesStore } from './favoritesStore'

/**
 * 角色归一化：兜底 profile/settings 为合法对象。
 * 防御强行导入/历史脏数据（缺 profile 的残缺对象）进入渲染层导致白屏。
 */
function normalizeCharacter(c: Character): Character {
  const profile = c.profile ?? ({
    id: `profile-${c.id}`,
    userId: c.userId,
    name: c.name || '未知角色',
    personality: [],
    tone: '',
    address: '',
    hobbies: [],
    background: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as Character['profile'])
  const settings = c.settings ?? ({
    voiceType: 'default',
    voiceSpeed: 'normal',
    voicePitch: 'normal',
    decorations: [],
  } as Character['settings'])
  return { ...c, profile, settings }
}

// 认证状态
interface AuthState {
  user: User | null
  isLoggedIn: boolean
  isLoading: boolean
  login: (user: User) => void
  logout: () => void
  setLoading: (loading: boolean) => void
  updateUser: (updates: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoggedIn: false,
      isLoading: false,
      login: (user) => set({ user, isLoggedIn: true }),
      logout: () => {
        set({ user: null, isLoggedIn: false })
        useSettingsStore.getState().updateSettings({ defaultAssistantId: undefined })
      },
      setLoading: (loading) => set({ isLoading: loading }),
      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        isLoggedIn: state.isLoggedIn,
      }),
    }
  )
)

// 角色状态
interface CharacterState {
  characters: Character[]
  currentCharacter: Character | null
  messages: Message[]
  setCharacters: (characters: Character[]) => void
  setCurrentCharacter: (character: Character | null) => void
  addCharacter: (character: Character) => void
  updateCharacter: (character: Character) => void
  deleteCharacter: (id: string) => void
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  loadCharacters: (userId: string) => Promise<void>
}

export const useCharacterStore = create<CharacterState>((set) => ({
  characters: [],
  currentCharacter: null,
  messages: [],
  setCharacters: (characters) => {
    // 根据 id 去重，再根据 assistantId 去重
    const seenIds = new Set<string>()
    const seenAssistantIds = new Set<string>()
    const deduped = characters.filter(c => {
      if (seenIds.has(c.id)) return false
      seenIds.add(c.id)
      if (c.isAssistant && c.assistantId) {
        if (seenAssistantIds.has(c.assistantId)) return false
        seenAssistantIds.add(c.assistantId)
      }
      return true
    })
    set({ characters: deduped.map(normalizeCharacter) })
  },
  setCurrentCharacter: (character) => set({ currentCharacter: character }),
  addCharacter: (character) => {
    set((state) => ({ characters: [...state.characters, character] }))
    createCharacterAPI(character, character.userId).catch((err) => {
      console.error('[CharacterStore] 云端创建失败，回退到本地:', err)
      db.characters.add(character)
    })
  },
  updateCharacter: (character) => {
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === character.id ? character : c
      ),
      currentCharacter:
        state.currentCharacter?.id === character.id ? character : state.currentCharacter,
    }))
    updateCharacterAPI(character).catch((err) => {
      console.error('[CharacterStore] 云端更新失败，回退到本地:', err)
      db.characters.update(character.id, character)
    })
  },
  deleteCharacter: (id) => {
    // 立即从本地状态和 Dexie 删除
    set((state) => ({
      characters: state.characters.filter((c) => c.id !== id)
    }))
    db.characters.delete(id).catch(() => {})
    // 同时从云端删除
    deleteCharacterAPI(id).catch((err) => {
      console.error('[CharacterStore] 云端删除失败:', err)
    })
  },
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => {
    set((state) => ({ messages: [...state.messages, message] }))
    db.messages.add(message)
  },
  loadCharacters: async (userId) => {
    await seedAssistantsForUser(userId, db)

    // 迁移：修正旧账号中汐的性别从 'female' 到 'other'
    try {
      const localChars = await db.characters.where('userId').equals(userId).toArray()
      for (const char of localChars) {
        if (char.isAssistant && char.assistantId === 'xi' && char.profile.gender === 'female') {
          char.profile.gender = 'other'
          await db.characters.update(char.id, { 'profile.gender': 'other' })
          try {
            await updateCharacterAPI(char)
          } catch { /* ignore cloud sync error */ }
        }
      }
    } catch (err) {
      console.error('[CharacterStore] 汐性别迁移失败:', err)
    }

    try {
      const cloudCharsRaw = await getCharacters(userId)
      // 提取云端已有的 assistant_id（兼容 snake_case 和 camelCase）
      const cloudAssistantIds = new Set<string>()
      for (const c of cloudCharsRaw) {
        const aid = (c as unknown as Record<string, unknown>).assistant_id || c.assistantId
        if (aid) cloudAssistantIds.add(aid as string)
      }

      const cloudIds = new Set(cloudCharsRaw.map((c) => c.id))

      const localChars = await db.characters.where('userId').equals(userId).toArray()

      // 同步本地缺失的角色到云端
      const missingChars = localChars.filter((c) => !cloudIds.has(c.id))
      for (const char of missingChars) {
        // 跳过已在云端存在相同 assistantId 的助手（避免重复同步）
        if (char.isAssistant && char.assistantId && cloudAssistantIds.has(char.assistantId)) {
          continue
        }
        try {
          await createCharacterAPI(char, userId)
        } catch {
          // ignore individual sync errors
        }
      }

      // 仅使用本地 Dexie 数据作为角色源（完整的 Character 对象）
      let finalChars = await db.characters.where('userId').equals(userId).toArray()

      // 如果云端已有某 assistantId 的助手，删除本地 Dexie 中重复的旧记录
      if (cloudAssistantIds.size > 0) {
        const charsToKeep: typeof finalChars = []
        const charsToDelete: string[] = []
        const seenAssistantIds = new Set<string>()
        for (const c of finalChars) {
          if (c.isAssistant && c.assistantId) {
            if (seenAssistantIds.has(c.assistantId)) {
              charsToDelete.push(c.id)
              continue
            }
            seenAssistantIds.add(c.assistantId)
          }
          charsToKeep.push(c)
        }
        if (charsToDelete.length > 0) {
          console.log('[CharacterStore] 清理重复助手:', charsToDelete.length, '条')
          for (const id of charsToDelete) {
            await db.characters.delete(id)
          }
          finalChars = charsToKeep
        }
      }

      // 根据 id 和 assistantId 严格去重
      const seenIds = new Set<string>()
      const seenAsstIds = new Set<string>()
      const deduped = finalChars.filter(c => {
        if (seenIds.has(c.id)) return false
        seenIds.add(c.id)
        if (c.isAssistant && c.assistantId) {
          if (seenAsstIds.has(c.assistantId)) return false
          seenAsstIds.add(c.assistantId)
        }
        return true
      })
      set({ characters: deduped.map(normalizeCharacter) })
    } catch (err) {
      console.error('[CharacterStore] 云端加载失败，回退到本地:', err)
      const characters = await db.characters.where('userId').equals(userId).toArray()
      set({ characters: characters.map(normalizeCharacter) })
    }
  }
}))

// 设置状态
interface SettingsState {
  settings: AppSettings | null
  setSettings: (settings: AppSettings) => void
  updateSettings: (partial: Partial<AppSettings>) => void
  loadSettings: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  setSettings: (settings) => {
    set({ settings })
    db.settings.put(settings)
  },
  updateSettings: (partial) => {
    set((state) => {
      const current = state.settings || ({} as AppSettings)
      const newSettings = { ...current, ...partial }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db.settings.put({ ...newSettings, id: 'default' } as any)
      return { settings: newSettings }
    })
  },
  loadSettings: async () => {
    const settings = await db.settings.get('default')
    if (settings) {
      // 合并默认值，确保新增字段有值（兼容旧数据）
      const merged: AppSettings = {
        ...settings,
        messageBubbleOpacity: settings.messageBubbleOpacity ?? 100,
        autoJumpToChat: settings.autoJumpToChat ?? false,
        micPermission: settings.micPermission ?? false,
        fileReadPermission: settings.fileReadPermission ?? false,
        live2dFaceMode: (settings as unknown as Record<string, unknown>).live2dFaceMode === 'front-only' ? 'front-only' : 'auto',
        defaultAssistantId: (settings as unknown as Record<string, unknown>).defaultAssistantId as string | undefined,
      }
      set({ settings: merged })
    }
  }
}))

// UI 状态
interface UIState {
  isSettingsOpen: boolean
  isTutorialOpen: boolean
  isCharacterSelectorOpen: boolean
  isCreateCharacterOpen: boolean
  isRefreshConfirmOpen: boolean
  notifications: Notification[]
  onlineTime: number
  setSettingsOpen: (open: boolean) => void
  setTutorialOpen: (open: boolean) => void
  setCharacterSelectorOpen: (open: boolean) => void
  setCreateCharacterOpen: (open: boolean) => void
  setRefreshConfirmOpen: (open: boolean) => void
  addNotification: (notification: Notification) => void
  removeNotification: (id: string) => void
  incrementOnlineTime: () => void
  resetOnlineTime: () => void
}

export const useUIStore = create<UIState>((set) => ({
  isSettingsOpen: false,
  isTutorialOpen: false,
  isCharacterSelectorOpen: false,
  isCreateCharacterOpen: false,
  isRefreshConfirmOpen: false,
  notifications: [],
  onlineTime: 0,
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  setTutorialOpen: (open) => set({ isTutorialOpen: open }),
  setCharacterSelectorOpen: (open) => set({ isCharacterSelectorOpen: open }),
  setCreateCharacterOpen: (open) => set({ isCreateCharacterOpen: open }),
  setRefreshConfirmOpen: (open) => set({ isRefreshConfirmOpen: open }),
  addNotification: (notification) =>
    set((state) => ({ notifications: [notification, ...state.notifications] })),
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id)
    })),
  incrementOnlineTime: () =>
    set((state) => ({ onlineTime: state.onlineTime + 1 })),
  resetOnlineTime: () => set({ onlineTime: 0 })
}))

// 教程状态
interface TutorialState {
  progress: TutorialProgress | null
  currentStep: number
  setProgress: (progress: TutorialProgress) => void
  setCurrentStep: (step: number) => void
  completeStep: (step: string) => void
  loadProgress: (userId: string) => Promise<void>
}

export const useTutorialStore = create<TutorialState>((set) => ({
  progress: null,
  currentStep: 0,
  setProgress: (progress) => {
    set({ progress })
    db.tutorialProgress.put(progress)
  },
  setCurrentStep: (step) => set({ currentStep: step }),
  completeStep: (step) => {
    set((state) => {
      const newProgress = state.progress
        ? {
            ...state.progress,
            completedSteps: [...state.progress.completedSteps, step]
          }
        : null
      if (newProgress) {
        db.tutorialProgress.update(newProgress.userId, {
          completedSteps: newProgress.completedSteps
        })
      }
      return { progress: newProgress }
    })
  },
  loadProgress: async (userId) => {
    const progress = await db.tutorialProgress.get(userId)
    if (progress) {
      set({ progress })
    } else {
      const newProgress: TutorialProgress = {
        userId,
        completedSteps: [],
        isCompleted: false
      }
      await db.tutorialProgress.add(newProgress)
      set({ progress: newProgress })
    }
  }
}))
