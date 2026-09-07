// 用户相关
export interface User {
  id: string              // Dexie 自增/随机主键
  userId: string          // 用户编号，格式：U20260705001
  username: string        // 登录账号（手机号/邮箱）
  password: string
  nickname?: string       // 用户昵称（可选）
  phone?: string          // 绑定手机号
  email?: string
  birthDate: string
  birthday?: string
  isAutoLogin: boolean
  isNewUser: boolean
  createdAt: number
  pendingDeletion?: boolean
  pendingDeletionAt?: number
  avatarUrl?: string         // 用户自定义头像（Base64 或 URL）
}

// 角色档案
export interface CharacterProfile {
  id: string
  userId: string
  name: string
  age?: number
  birthday?: string
  gender?: 'male' | 'female' | 'other'
  personality: string[]
  tone: string
  address: string
  hobbies: string[]
  background: string
  avatar?: string
  createdAt: number
  updatedAt: number
}

// 角色完整信息
export interface Character {
  id: string
  userId: string
  name?: string  // 快捷访问名称（等同于 profile.name）
  profile: CharacterProfile
  settings: CharacterSettings
  createdAt: number
  // 通讯录扩展字段
  tags?: string[]              // 角色标签（用于通讯录搜索）
  isPinned?: boolean           // 是否置顶（通讯录中置顶显示）
  chatBackground?: string      // 聊天背景图（base64 或 URL）
  formData?: Record<string, unknown>  // 完整表单数据（用于编辑模式恢复）
  modelDisplay?: ModelDisplay  // 左栏模型展示数据
  // 内置AI助手标识
  isAssistant?: boolean        // true 表示这是平台内置AI助手
  assistantId?: string         // 助手标识：'liu' | 'sa' | 'che' | 'yi' | 'xi'
  // 助手可编辑字段（仅助手使用）
  assistantEditable?: AssistantEditableData
}

// 助手可编辑数据
export interface AssistantEditableData {
  relationship?: string          // 助手与用户的关系
  relationshipCustom?: string    // 自定义关系
  userTitle?: string             // 对用户的称呼
  userNote?: string              // 用户对助手的备注
  anniversary?: string           // 与助手的重要纪念日
  userDislikes?: string[]        // 用户特别不喜欢的事
}

// 模型展示数据
export interface ModelDisplay {
  type: 'image' | 'video' | 'live2d' | '3d' | 'json'  // 文件类型
  url: string        // 图片/视频为 base64 Data URL，3D 为 Object URL，其他为文件名
  fileName: string   // 原始文件名
  mtlUrl?: string    // .obj 材质文件的 Object URL（可选）
}

// 角色设置
export interface CharacterSettings {
  voiceType: string
  voiceSpeed: 'slow' | 'normal' | 'fast' | number  // 支持字符串或数字（0-100）
  voicePitch: 'low' | 'normal' | 'high' | number  // 支持字符串或数字（0-100）
  voiceVolume?: number  // 音量（0-100）
  backgroundImage?: string
  decorations: Decoration[]
}

// 装饰物
export interface Decoration {
  id: string
  type: string
  name: string
  x: number
  y: number
  opacity: number
}

// 动作
export interface Action {
  id: string
  name: string
  description: string
  speed: 'slow' | 'normal' | 'fast'
  magnitude: 'small' | 'medium' | 'large'
  isDefault: boolean
}

// 消息
export interface Message {
  id: string
  characterId: string
  role: 'user' | 'character'
  content: string
  timestamp: number
  type?: 'text' | 'image' | 'file' | 'voice'  // 消息类型
  fileInfo?: {                       // 文件信息（当type为image或file时）
    name: string
    url: string
    thumbnailUrl?: string
    size?: number
  }
  voiceInfo?: {                      // 语音信息（当type为voice时）
    url: string         // 音频数据 URL
    duration: number    // 时长（秒）
  }
  isWithdrawn?: boolean              // 是否已撤回
}

// 收藏
export interface Favorite {
  id: string                    // 唯一 ID
  type: 'text' | 'image' | 'file' | 'voice' | 'link'  // 收藏内容类型
  content: string               // 文本内容 / 文件 URL / 图片描述
  fileInfo?: {                  // 文件信息（图片/文件类型时）
    name: string
    url: string
    thumbnailUrl?: string
    size?: number
  }
  voiceInfo?: {                 // 语音信息（语音类型时）
    url: string
    duration: number
  }
  sourceRole: string            // 来源角色名称
  sourceCharacterId?: string    // 来源角色 ID
  createdAt: number             // 收藏时间
  isPinned: boolean             // 是否置顶
}

// 应用设置
export interface AppSettings {
  language: 'zh-CN' | 'en'
  fontSize: 'small' | 'medium' | 'large'
  theme: 'light' | 'dark' | 'system'
  autoSavePath: string
  autoSaveInterval: number
  emergencySavePath: string
  defaultCharacterId?: string
  autoStart: boolean
  desktopNotifications: boolean
  healthReminders: boolean
  healthReminderInterval: number
  messageBubbleOpacity: number  // 消息气泡透明度 0-100，默认100
  autoJumpToChat: boolean       // 创建角色后自动跳转聊天界面
  micPermission: boolean        // 麦克风权限（用户已授权）
  fileReadPermission: boolean   // 读取本地文件权限（用户已授权）
  live2dFaceMode: 'auto' | 'front-only'  // Live2D 正脸模式：auto=空闲时自动回正, front-only=仅正前方时正面
  defaultAssistantId?: string             // 用户选择的默认AI助手ID
}

// 聊天记录
export interface ChatHistory {
  id: string
  characterId: string
  messages: Message[]
  updatedAt: number
}

// 通知
export interface Notification {
  id: string
  type: 'info' | 'warning' | 'error' | 'success'
  title: string
  message: string
  timestamp: number
  read: boolean
  duration?: number
}

// 教程进度
export interface TutorialProgress {
  userId: string
  completedSteps: string[]
  isCompleted: boolean
}

// 日志
export interface LogEntry {
  id: string
  level: 'info' | 'warn' | 'error'
  message: string
  detail?: string
  timestamp: number
}
