import Dexie, { Table } from 'dexie'
import {
  User,
  Character,
  CharacterProfile,
  Message,
  AppSettings,
  Action,
  Notification,
  TutorialProgress,
  LogEntry,
  Favorite
} from '@/types'

export class DigitalHumanDB extends Dexie {
  users!: Table<User>
  characters!: Table<Character>
  profiles!: Table<CharacterProfile>
  messages!: Table<Message>
  settings!: Table<AppSettings>
  actions!: Table<Action>
  notifications!: Table<Notification>
  tutorialProgress!: Table<TutorialProgress>
  logs!: Table<LogEntry>
  favorites!: Table<Favorite>
  modelFiles!: Table<{ id: string; blob: Blob; fileName: string; createdAt: number }>

  constructor() {
    super('DigitalHumanDB')
    
    this.version(1).stores({
      users: 'id, userId, username',
      characters: 'id, userId, [userId+createdAt]',
      profiles: 'id, userId',
      messages: 'id, characterId, timestamp',
      settings: 'id',
      actions: 'id, isDefault',
      notifications: 'id, timestamp',
      tutorialProgress: 'userId',
      logs: 'id, timestamp'
    })

    this.version(2).stores({
      users: 'id, userId, username',
      characters: 'id, userId, [userId+createdAt]',
      profiles: 'id, userId',
      messages: 'id, characterId, timestamp',
      settings: 'id',
      actions: 'id, isDefault',
      notifications: 'id, timestamp',
      tutorialProgress: 'userId',
      logs: 'id, timestamp',
      favorites: 'id, type, createdAt, isPinned'
    })

    this.version(3).stores({
      users: 'id, userId, username',
      characters: 'id, userId, [userId+createdAt]',
      profiles: 'id, userId',
      messages: 'id, characterId, timestamp',
      settings: 'id',
      actions: 'id, isDefault',
      notifications: 'id, timestamp',
      tutorialProgress: 'userId',
      logs: 'id, timestamp',
      favorites: 'id, type, createdAt, isPinned',
      modelFiles: 'id, fileName, createdAt'
    })
  }

  async initializeDefaults() {
    try {
      // 初始化默认动作
      const defaultActions: Action[] = [
        { id: 'action-1', name: '拥抱', description: '温暖的拥抱', speed: 'normal', magnitude: 'medium', isDefault: true },
        { id: 'action-2', name: '安抚', description: '轻柔的安抚', speed: 'slow', magnitude: 'small', isDefault: true },
        { id: 'action-3', name: '吃东西', description: '开心地吃东西', speed: 'normal', magnitude: 'medium', isDefault: true },
        { id: 'action-4', name: '待机', description: '静静地待着', speed: 'slow', magnitude: 'small', isDefault: true },
        { id: 'action-5', name: '玩耍', description: '欢快地玩耍', speed: 'fast', magnitude: 'large', isDefault: true },
        { id: 'action-6', name: '开心', description: '表现出开心', speed: 'normal', magnitude: 'medium', isDefault: true },
        { id: 'action-7', name: '思考', description: '陷入思考', speed: 'slow', magnitude: 'small', isDefault: true },
        { id: 'action-8', name: '挥手', description: '友好地挥手', speed: 'normal', magnitude: 'small', isDefault: true }
      ]

      try {
        const existingActions = await this.actions.count()
        if (existingActions === 0) {
          await this.actions.bulkAdd(defaultActions)
        } else {
          await this.actions.bulkPut(defaultActions)
        }
      } catch (err) {
        console.warn('[DB] 初始化默认动作失败，已跳过:', err)
      }

      // 初始化默认设置
      try {
        const existingSettings = await this.settings.count()
        if (existingSettings === 0) {
          const defaultSettings: any = {
            id: 'default',
            language: 'zh-CN',
            fontSize: 'medium',
            theme: 'system',
            autoSavePath: './saves',
            autoSaveInterval: 5,
            emergencySavePath: './emergency',
            autoStart: false,
            desktopNotifications: true,
            healthReminders: true,
            healthReminderInterval: 360,
            messageBubbleOpacity: 100,
            autoJumpToChat: false,
            micPermission: false,
            fileReadPermission: false
          }
          await this.settings.put(defaultSettings)
        }
      } catch (err) {
        console.warn('[DB] 初始化默认设置失败，已跳过:', err)
      }
    } catch (err) {
      console.error('[DB] 初始化数据库失败:', err)
    }
  }
}

export const db = new DigitalHumanDB()

// ─── 模型文件持久化存储工具函数 ────────────────────────────────────────────

export async function saveModelFile(file: File): Promise<string> {
  const id = `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  try {
    await db.modelFiles.put({
      id,
      blob: file,
      fileName: file.name,
      createdAt: Date.now(),
    })
    console.log('[DB] 模型文件已持久化保存:', id, file.name)
    return `indexeddb:${id}`
  } catch (err) {
    console.error('[DB] 模型文件保存失败:', err)
    throw err
  }
}

export async function loadModelFile(ref: string): Promise<string | null> {
  if (!ref.startsWith('indexeddb:')) return null
  const id = ref.substring('indexeddb:'.length)
  try {
    const record = await db.modelFiles.get(id)
    if (!record) {
      console.warn('[DB] 模型文件不存在:', id)
      return null
    }
    const url = URL.createObjectURL(record.blob)
    console.log('[DB] 模型文件已从持久化存储加载:', id, record.fileName)
    return url
  } catch (err) {
    console.error('[DB] 模型文件加载失败:', err)
    return null
  }
}

export async function deleteModelFile(ref: string): Promise<void> {
  if (!ref.startsWith('indexeddb:')) return
  const id = ref.substring('indexeddb:'.length)
  try {
    await db.modelFiles.delete(id)
    console.log('[DB] 模型文件已删除:', id)
  } catch (err) {
    console.error('[DB] 模型文件删除失败:', err)
  }
}

export function isPersistentModelRef(url: string): boolean {
  return url.startsWith('indexeddb:')
}