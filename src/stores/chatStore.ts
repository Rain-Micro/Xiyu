import { create } from 'zustand'
import { Message } from '@/types'
import { db } from '@/services/db'
import { sendMessage as sendMessageToAPI, getMessages as getMessagesFromAPI, clearMessages as clearMessagesFromAPI } from '@/services/messageService'
import { getAIResponse, type CharacterProfileData } from '@/services/aiChatService'
import { useAuthStore, useCharacterStore } from '@/stores'
import { compressImage, recognizeImage } from '@/utils/imageUtils'

// 角色聊天状态（用于顶部显示）
export type CharacterChatStatus = 
  | '在线' | '离线' | '开心' | '不开心' | '生气' 
  | '学习' | '工作' | '思考' | '疲惫' | '专注'

// 预设回复库
const PRESET_REPLIES: string[] = [
  '嗯，我在听。',
  '我知道了。',
  '好。',
  '……你高兴就行。',
  '我在想你说的话。',
  '然后呢？',
  '你继续说。',
  '原来是这样。',
  '我不太确定该怎么回，但我听着。',
  '那你现在感觉怎么样？',
]

// 状态关键词映射
const STATUS_KEYWORDS: { keywords: string[]; status: CharacterChatStatus }[] = [
  { keywords: ['开心', '高兴', '快乐', '太好了', '哈哈', '嘻嘻', '好开心', '好棒', '真好', '耶', '嘻嘻', '幸福'], status: '开心' },
  { keywords: ['难过', '伤心', '不开心', '郁闷', '难受', '不开心', '唉', '糟糕', '烦', '苦', '哭', '失落', '沮丧'], status: '不开心' },
  { keywords: ['生气', '烦死', '气死', '讨厌', '怒', '受不了', '火大', '可恶'], status: '生气' },
  { keywords: ['学习', '看书', '复习', '考试', '作业', '上课', '读书', '学'], status: '学习' },
  { keywords: ['工作', '上班', '加班', '开会', '忙', '项目', '任务', '干活'], status: '工作' },
  { keywords: ['想', '思考', '思考一下', '想想', '琢磨', '考虑'], status: '思考' },
  { keywords: ['累', '疲惫', '困', '好困', '没精神', '疲惫', '乏力', '好累', '疲劳'], status: '疲惫' },
  { keywords: ['专注', '集中', '认真', '专心', '投入', '全神贯注'], status: '专注' },
]

// 从 data URL 中解析 base64 内容和 MIME 类型
function parseDataUrl(dataUrl: string): { base64: string; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return { mimeType: match[1], base64: match[2] }
}

// 根据 MIME 类型或文件名判断文档类型
function getDocumentFileType(mimeType: string, fileName: string): 'docx' | 'pdf' | 'txt' | null {
  if (mimeType.includes('wordprocessingml.document') || fileName.endsWith('.docx')) return 'docx'
  if (mimeType.includes('pdf') || fileName.endsWith('.pdf')) return 'pdf'
  if (mimeType.includes('text/plain') || fileName.endsWith('.txt')) return 'txt'
  return null
}

// OCR 回调类型
export type OCRProgressCallback = (progress: number) => void
export type OCRCancelChecker = () => boolean

function getCharacterProfile(characterId: string): CharacterProfileData | undefined {
  const character = useCharacterStore.getState().characters.find(c => c.id === characterId)
  if (!character?.profile) return undefined
  const profile = character.profile
  // 从 formData 中提取额外角色信息（创建/编辑时保存的完整表单数据）
  const fd = character.formData as Record<string, unknown> | undefined
  // 从 assistantEditable 中提取关系（内置助手角色）
  const ae = character.assistantEditable
  return {
    name: profile.name,
    personality: profile.personality?.length ? profile.personality : ['温柔', '友好'],
    tone: profile.tone || '温和',
    background: profile.background || '',
    hobbies: profile.hobbies?.length ? profile.hobbies : (fd?.hobbies as string[]) || [],
    greeting: (fd?.greeting as string) || '',
    characterSayings: (fd?.characterSayings as string[]) || [],
    relationship: ae?.relationship || (fd?.relationship as string) || '',
    likedFoods: (fd?.likedFoods as string[]) || [],
    dislikedThings: (fd?.dislikedThings as string[]) || [],
    oocBehaviors: (fd?.oocBehaviors as string[]) || [],
  }
}

interface ChatState {
  // 消息管理
  messages: Record<string, Message[]>  // characterId -> messages
  isTyping: boolean

  // 角色聊天状态
  characterStatus: Record<string, CharacterChatStatus>  // characterId -> status

  // 自动跳转偏好
  autoJumpToChat: boolean | null  // null = 未设置

  // 中断控制
  abortController: AbortController | null

  // 操作方法
  loadMessages: (characterId: string) => Promise<void>
  addMessage: (characterId: string, message: Message) => void
  sendMessage: (characterId: string, content: string, type?: 'text' | 'image' | 'file' | 'voice', fileInfo?: Message['fileInfo'], voiceInfo?: Message['voiceInfo']) => Promise<void>
  setTyping: (typing: boolean) => void
  updateCharacterStatus: (characterId: string, userMessage: string) => void
  getCharacterStatus: (characterId: string) => CharacterChatStatus
  setAutoJumpToChat: (auto: boolean) => void
  clearMessages: (characterId: string) => void
  clearMessagesDB: (characterId: string) => Promise<void>
  deleteMessage: (characterId: string, messageId: string) => void
  updateMessage: (characterId: string, messageId: string, content: string) => void
  editMessageAndRegenerate: (characterId: string, messageId: string, content: string) => Promise<void>
  withdrawMessage: (characterId: string, messageId: string) => void
  regenerateReply: (characterId: string) => Promise<void>
  abortGeneration: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: {},
  isTyping: false,
  characterStatus: {},
  autoJumpToChat: null,
  abortController: null,

  loadMessages: async (characterId: string) => {
    // 优先从 Supabase 加载
    const user = useAuthStore.getState().user
    if (user) {
      try {
        const messages = await getMessagesFromAPI(characterId, user.id)
        if (messages && messages.length > 0) {
          set((state) => ({
            messages: {
              ...state.messages,
              [characterId]: messages.map((msg: Record<string, unknown>) => ({
                id: msg.id as string,
                characterId: msg.character_id as string,
                role: (msg.role === 'assistant' ? 'character' : 'user') as Message['role'],
                content: msg.content as string,
                timestamp: new Date(msg.created_at as string).getTime(),
                type: 'text' as const,
              })),
            },
          }))
          return
        }
      } catch (err) {
        console.warn('[Chat] 从 Supabase 加载消息失败，回退到本地:', err)
      }
    }
    // 回退到本地 IndexedDB
    const msgs = await db.messages
      .where('characterId')
      .equals(characterId)
      .sortBy('timestamp')
    set((state) => ({
      messages: { ...state.messages, [characterId]: msgs }
    }))
  },

  addMessage: (characterId: string, message: Message) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [characterId]: [...(state.messages[characterId] || []), message]
      }
    }))
    db.messages.add(message)
  },

  sendMessage: async (characterId: string, content: string, type: 'text' | 'image' | 'file' | 'voice' = 'text', fileInfo?: Message['fileInfo'], voiceInfo?: Message['voiceInfo']) => {
    // 1. 添加用户消息
    const userMessage: Message = {
      id: crypto.randomUUID(),
      characterId,
      role: 'user',
      content,
      timestamp: Date.now(),
      type,
      fileInfo,
      voiceInfo,
    }
    get().addMessage(characterId, userMessage)

    // 存储用户消息到 Supabase（异步，不阻塞前端）
    const user = useAuthStore.getState().user
    if (user) {
      sendMessageToAPI(user.id, characterId, 'user', content).catch((err) => {
        console.error('[Chat] 存储用户消息失败:', err)
      })
    }

    // 2. 更新角色状态
    get().updateCharacterStatus(characterId, content)

    // 3. 显示正在输入状态
    set({ isTyping: true })

    // 中断之前的回复（如果有）
    get().abortGeneration()
    const controller = new AbortController()
    set({ abortController: controller })

    // 4. 调用 AI 接口获取回复，失败时降级到模拟回复
    let replyContent: string
    let aiSuccess = false
    let wasAborted = false

    // 解析附件内容（图片/文档）
    let imageContent: { base64: string; mimeType: string } | undefined
    let documentContent: { fileType: 'docx' | 'pdf' | 'txt'; base64: string } | undefined
    let ocrText: string | undefined
    if (fileInfo?.url) {
      const parsed = parseDataUrl(fileInfo.url)
      if (parsed) {
        if (type === 'image') {
          // 压缩图片后再 OCR
          const compressedUrl = await compressImage(fileInfo.url)
          const parsedCompressed = parseDataUrl(compressedUrl)
          if (parsedCompressed) {
            imageContent = parsedCompressed
          }
          const ocrResult = await recognizeImage(compressedUrl, { timeout: 30000 })
          if (ocrResult.success) {
            ocrText = ocrResult.text
          } else if (ocrResult.timedOut) {
            ocrText = '[图片识别超时]'
          }
        } else if (type === 'file') {
          const fileType = getDocumentFileType(parsed.mimeType, fileInfo.name)
          if (fileType) {
            documentContent = { fileType, base64: parsed.base64 }
          }
        }
      }
    }

    try {
      if (user) {
        const profile = getCharacterProfile(characterId)
        replyContent = await getAIResponse(characterId, user.id, content, documentContent, imageContent, ocrText, controller.signal, profile)
        aiSuccess = true
      } else {
        replyContent = PRESET_REPLIES[Math.floor(Math.random() * PRESET_REPLIES.length)]
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        wasAborted = true
        replyContent = '已停止生成'
      } else {
        console.error('[Chat] AI 回复失败，降级到模拟回复:', err)
        replyContent = PRESET_REPLIES[Math.floor(Math.random() * PRESET_REPLIES.length)]
      }
    }

    // 5. 添加角色回复
    const characterMessage: Message = {
      id: crypto.randomUUID(),
      characterId,
      role: 'character',
      content: replyContent,
      timestamp: Date.now(),
      type: 'text',
    }
    get().addMessage(characterId, characterMessage)
    set({ isTyping: false, abortController: null })

    // 6. 存储角色回复到 Supabase
    // AI 调用成功时后端已存储回复；降级到模拟回复时由前端存储；中断时不存储
    if (user && !aiSuccess && !wasAborted) {
      sendMessageToAPI(user.id, characterId, 'assistant', replyContent).catch((err) => {
        console.error('[Chat] 存储角色回复失败:', err)
      })
    }
  },

  setTyping: (typing: boolean) => set({ isTyping: typing }),

  updateCharacterStatus: (characterId: string, userMessage: string) => {
    let newStatus: CharacterChatStatus = '在线'
    for (const { keywords, status } of STATUS_KEYWORDS) {
      if (keywords.some((kw) => userMessage.includes(kw))) {
        newStatus = status
        break
      }
    }
    set((state) => ({
      characterStatus: { ...state.characterStatus, [characterId]: newStatus }
    }))
  },

  getCharacterStatus: (characterId: string) => {
    return get().characterStatus[characterId] || '在线'
  },

  setAutoJumpToChat: (auto: boolean) => set({ autoJumpToChat: auto }),

  clearMessages: (characterId: string) => {
    set((state) => ({
      messages: { ...state.messages, [characterId]: [] }
    }))
  },

  clearMessagesDB: async (characterId: string) => {
    await db.messages.where('characterId').equals(characterId).delete()
    const user = useAuthStore.getState().user
    if (user) {
      try {
        await clearMessagesFromAPI(characterId, user.id)
      } catch (err) {
        console.error('[Chat] 删除服务器消息失败:', err)
      }
    }
    set((state) => ({
      messages: { ...state.messages, [characterId]: [] }
    }))
  },

  deleteMessage: (characterId: string, messageId: string) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [characterId]: (state.messages[characterId] || []).filter((m) => m.id !== messageId),
      },
    }))
    db.messages.delete(messageId)
  },

  updateMessage: (characterId: string, messageId: string, content: string) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [characterId]: (state.messages[characterId] || []).map((m) =>
          m.id === messageId ? { ...m, content } : m
        ),
      },
    }))
    db.messages.update(messageId, { content })
  },

  editMessageAndRegenerate: async (characterId: string, messageId: string, content: string) => {
    // 1. 更新用户消息内容
    set((state) => ({
      messages: {
        ...state.messages,
        [characterId]: (state.messages[characterId] || []).map((m) =>
          m.id === messageId ? { ...m, content } : m
        ),
      },
    }))
    db.messages.update(messageId, { content })

    // 2. 找到被修改消息的索引，删除其后的角色回复（如果有）
    const currentMsgs = get().messages[characterId] || []
    const editIndex = currentMsgs.findIndex((m) => m.id === messageId)
    if (editIndex !== -1) {
      // 删除该用户消息之后紧接的角色回复（可能有多条连续角色消息）
      const toDelete: string[] = []
      for (let i = editIndex + 1; i < currentMsgs.length; i++) {
        if (currentMsgs[i].role === 'character') {
          toDelete.push(currentMsgs[i].id)
        } else {
          // 遇到下一条用户消息则停止
          break
        }
      }
      if (toDelete.length > 0) {
        set((state) => ({
          messages: {
            ...state.messages,
            [characterId]: (state.messages[characterId] || []).filter((m) => !toDelete.includes(m.id)),
          },
        }))
        // 从数据库删除旧回复
        for (const id of toDelete) {
          db.messages.delete(id)
        }
      }
    }

    // 3. 更新角色状态
    get().updateCharacterStatus(characterId, content)

    // 4. 显示正在输入状态
    set({ isTyping: true })

    get().abortGeneration()
    const controller = new AbortController()
    set({ abortController: controller })

    // 5. 调用 AI 生成新回复
    let replyContent: string
    let aiSuccess = false
    let wasAborted = false
    const user = useAuthStore.getState().user

    try {
      if (user) {
        const profile = getCharacterProfile(characterId)
        replyContent = await getAIResponse(characterId, user.id, content, undefined, undefined, undefined, controller.signal, profile)
        aiSuccess = true
      } else {
        replyContent = PRESET_REPLIES[Math.floor(Math.random() * PRESET_REPLIES.length)]
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        wasAborted = true
        replyContent = '已停止生成'
      } else {
        console.error('[Chat] AI 回复失败，降级到模拟回复:', err)
        replyContent = PRESET_REPLIES[Math.floor(Math.random() * PRESET_REPLIES.length)]
      }
    }

    const characterMessage: Message = {
      id: crypto.randomUUID(),
      characterId,
      role: 'character',
      content: replyContent,
      timestamp: Date.now(),
      type: 'text',
    }
    get().addMessage(characterId, characterMessage)
    set({ isTyping: false, abortController: null })

    if (user && !aiSuccess && !wasAborted) {
      sendMessageToAPI(user.id, characterId, 'assistant', replyContent).catch((err) => {
        console.error('[Chat] 存储角色回复失败:', err)
      })
    }
  },

  withdrawMessage: (characterId: string, messageId: string) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [characterId]: (state.messages[characterId] || []).map((m) =>
          m.id === messageId ? { ...m, isWithdrawn: true, content: '已撤回' } : m
        ),
      },
    }))
    db.messages.update(messageId, { isWithdrawn: true, content: '已撤回' })
  },

  regenerateReply: async (characterId: string) => {
    set({ isTyping: true })

    get().abortGeneration()
    const controller = new AbortController()
    set({ abortController: controller })

    // 获取最后一条用户消息
    const currentMsgs = get().messages[characterId] || []
    const lastUserMsg = [...currentMsgs].reverse().find((m) => m.role === 'user')
    const content = lastUserMsg?.content || ''

    let replyContent: string
    let aiSuccess = false
    let wasAborted = false
    const user = useAuthStore.getState().user

    try {
      if (user && content) {
        const profile = getCharacterProfile(characterId)
        replyContent = await getAIResponse(characterId, user.id, content, undefined, undefined, undefined, controller.signal, profile)
        aiSuccess = true
      } else {
        replyContent = PRESET_REPLIES[Math.floor(Math.random() * PRESET_REPLIES.length)]
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        wasAborted = true
        replyContent = '已停止生成'
      } else {
        console.error('[Chat] AI 回复失败，降级到模拟回复:', err)
        replyContent = PRESET_REPLIES[Math.floor(Math.random() * PRESET_REPLIES.length)]
      }
    }

    const characterMessage: Message = {
      id: crypto.randomUUID(),
      characterId,
      role: 'character',
      content: replyContent,
      timestamp: Date.now(),
      type: 'text',
    }
    get().addMessage(characterId, characterMessage)
    set({ isTyping: false, abortController: null })

    if (user && !aiSuccess && !wasAborted) {
      sendMessageToAPI(user.id, characterId, 'assistant', replyContent).catch((err) => {
        console.error('[Chat] 存储角色回复失败:', err)
      })
    }
  },

  abortGeneration: () => {
    const controller = get().abortController
    if (controller) {
      controller.abort()
      set({ abortController: null })
    }
  },
}))
