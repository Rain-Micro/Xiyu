import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, ChevronRight, MessageCircle, Headphones, Image as ImageIcon, Square } from 'lucide-react'
import { useUIStore, useSettingsStore, useCharacterStore, useAuthStore } from '@/stores'
import { useChatStore } from '@/stores'
import { useNavigate } from 'react-router-dom'
import { getAssistantSeed } from '@/services/assistantData'
import { getAssistantResponse } from '@/services/aiChatService'
import { sendCSMessage } from '@/services/customerServiceAPI'
import { getImageFromPasteEvent, compressImage, recognizeImage } from '@/utils/imageUtils'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  images?: string[]
  recalled?: boolean
}

interface TutorialStep {
  assistantMessage: string
  text: string
  targetId: string
  supplementaryText?: string
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    assistantMessage: '欢迎来到栖屿！我是你的第一位伙伴。让我带你熟悉一下这里吧～',
    text: '在这里输入文字，按回车或点击发送按钮，就可以和我聊天了。',
    targetId: 'chat-input',
  },
  {
    assistantMessage: '点击这里，可以看到通讯录。里面有你创建的角色和所有AI助手。',
    text: '点击进入通讯录，可以查看所有聊天对象。',
    targetId: 'btn-select-character',
  },
  {
    assistantMessage: '在通讯录中，点击任意一个角色或助手，就可以切换聊天对象。',
    text: '点击任意一个，试试切换聊天对象吧。',
    targetId: 'contact-list',
  },
  {
    assistantMessage: '点击这里，可以查看和编辑助手的档案。比如你希望我怎么称呼你，或者你有哪些不喜欢的事，都可以在这里设置。',
    text: '点击进入档案页面，修改助手的相关设置。',
    targetId: 'btn-chat-settings',
  },
  {
    assistantMessage: '如果你想拥有一个完全属于你的数字人，可以点击这里创建角色。输入姓名、生日、性格等信息，ta就会出现在通讯录中。',
    text: '点击进入创建角色页面，开始创建你的第一个数字人吧。',
    targetId: 'btn-create-character',
  },
  {
    assistantMessage: '这里会显示角色或助手的模型。你可以拖拽移动、滚轮缩放、双击重置视角。',
    text: '试试拖拽移动模型，或滚动滚轮缩放。双击模型可重置视角。',
    targetId: 'model-display',
    supplementaryText: '点击左下角的"更换模型"按钮，还可以导入你喜欢的模型文件。',
  },
  {
    assistantMessage: '聊天中遇到喜欢的消息，右键点击选择"收藏"，就可以保存下来。',
    text: '右键点击任意消息，试试收藏功能吧。',
    targetId: 'chat-area',
    supplementaryText: '在用户模块的"收藏设置"中，可以查看和管理所有收藏内容。',
  },
  {
    assistantMessage: '点击这里进入用户模块，可以查看个人信息、管理收藏、调整应用偏好。',
    text: '点击进入用户模块，探索更多设置吧。',
    targetId: 'btn-user',
  },
  {
    assistantMessage: '好啦，这就是栖屿的基本功能了！剩下的就等你慢慢探索啦～随时可以点击右上角的"教程"按钮复习哦。',
    text: '',
    targetId: '',
  },
]

const DEMO_MESSAGES: Record<number, { title: string; text: string }> = {
  1: {
    title: '这就是通讯录',
    text: '你可以在这里看到所有角色和助手，点击任意对象即可切换聊天。',
  },
  3: {
    title: '这就是助手档案页面',
    text: '在这里可以修改你与助手的关系、称呼、备注、纪念日和不喜欢的事。',
  },
  4: {
    title: '这就是创建角色页面',
    text: '填写角色信息后提交，新角色就会出现在通讯录中。',
  },
  7: {
    title: '这就是用户模块',
    text: '在这里可以查看个人信息、管理收藏、调整应用偏好设置。',
  },
}

const EDGE_THRESHOLD = 50
const NORMAL_SIZE = 60
const MINIMIZED_SIZE = 40

function AssistantAvatar({ size = 60, assistantId }: { size?: number; assistantId?: string }) {
  const seed = assistantId ? getAssistantSeed(assistantId) : undefined

  if (seed) {
    return (
      <div
        className={`rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${seed.avatarColor}`}
        style={{ width: size, height: size }}
      >
        <span
          className="text-white font-bold"
          style={{ fontSize: size * 0.45 }}
        >
          {seed.name}
        </span>
      </div>
    )
  }

  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 bg-primary-500"
      style={{ width: size, height: size }}
    >
      <span
        className="text-white font-bold"
        style={{ fontSize: size * 0.45 }}
      >
        客
      </span>
    </div>
  )
}

export default function AIAssistant() {
  const navigate = useNavigate()
  const { isTutorialOpen, setTutorialOpen, setCharacterSelectorOpen } = useUIStore()
  const { settings } = useSettingsStore()
  const { characters, setCurrentCharacter } = useCharacterStore()
  const { user, isLoggedIn } = useAuthStore()
  const selectedAssistant = settings?.defaultAssistantId
  const assistantId = isLoggedIn && selectedAssistant ? selectedAssistant : undefined
  const assistantSeed = assistantId ? getAssistantSeed(assistantId) : undefined
  const assistantName = assistantSeed?.name || '客服'

  // 教程状态
  const [isTutorialActive, setIsTutorialActive] = useState(false)
  const [tutorialStep, setTutorialStep] = useState(0)
  const [demoStep, setDemoStep] = useState<number | null>(null)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)

  // 悬浮球状态
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isAssistantTyping, setIsAssistantTyping] = useState(false)
  const [isAssistantOcrProcessing, setIsAssistantOcrProcessing] = useState(false)
  const [pendingAssistantImages, setPendingAssistantImages] = useState<string[]>([])
  const assistantAbortRef = useRef<AbortController | null>(null)
  const assistantFileInputRef = useRef<HTMLInputElement>(null)

  // 客服浮层状态
  const [isServicePanelOpen, setIsServicePanelOpen] = useState(false)
  const [serviceMessages, setServiceMessages] = useState<ChatMessage[]>([])
  const [serviceInputValue, setServiceInputValue] = useState('')
  const [isServiceTyping, setIsServiceTyping] = useState(false)
  const [isOcrProcessing, setIsOcrProcessing] = useState(false)
  const serviceFileInputRef = useRef<HTMLInputElement>(null)
  const [pendingServiceImages, setPendingServiceImages] = useState<string[]>([])
  const serviceAbortRef = useRef<AbortController | null>(null)

  // 右键菜单与行内编辑状态
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
    targetMsg: ChatMessage | null
    panel: 'assistant' | 'service' | null
  }>({ visible: false, x: 0, y: 0, targetMsg: null, panel: null })
  const [editingMessage, setEditingMessage] = useState<{
    id: string
    panel: 'assistant' | 'service'
    content: string
  } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // 转发弹窗状态
  const [forwardDialogVisible, setForwardDialogVisible] = useState(false)
  const [forwardTargetMsg, setForwardTargetMsg] = useState<ChatMessage | null>(null)

  // 图片拖拽排序状态
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const genId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  // 拖拽状态
  const [bubblePos, setBubblePos] = useState({ x: 0, y: 0 })
  const [isMinimized, setIsMinimized] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const hasDragged = useRef(false)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const bubbleRef = useRef<HTMLDivElement>(null)
  const bubbleInitialized = useRef(false)
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 初始化悬浮球位置（右下角）
  useEffect(() => {
    if (!bubbleInitialized.current) {
      setBubblePos({ x: window.innerWidth - NORMAL_SIZE - 24, y: window.innerHeight - NORMAL_SIZE - 24 })
      bubbleInitialized.current = true
    }
  }, [])

  // 监听教程触发
  useEffect(() => {
    if (isTutorialOpen) {
      setIsTutorialActive(true)
      setTutorialStep(0)
      setDemoStep(null)
      setIsPanelOpen(false)
      // 进入步骤0：导航到聊天页面
      enterStep(0)
    } else {
      setIsTutorialActive(false)
      setDemoStep(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTutorialOpen])

  // 教程步骤进入逻辑：确保正确的页面和界面状态
  const enterStep = useCallback((stepIndex: number) => {
    switch (stepIndex) {
      case 0: // 步骤1：聊天输入框 → 需要在聊天页
        if (assistantId) {
          const assistant = characters.find((c) => c.isAssistant && c.assistantId === assistantId)
          if (assistant) setCurrentCharacter(assistant)
        }
        navigate('/chat')
        break
      case 1: // 步骤2：通讯录入口 → 需要在主界面
        setCharacterSelectorOpen(false)
        navigate('/main')
        break
      case 2: // 步骤3：通讯录列表项 → 通讯录应已打开
        setCharacterSelectorOpen(true)
        break
      case 3: // 步骤4：设置按钮 → 需要在聊天页（确保当前角色是助手）
        setCharacterSelectorOpen(false)
        if (assistantId) {
          const assistant = characters.find((c) => c.isAssistant && c.assistantId === assistantId)
          if (assistant) setCurrentCharacter(assistant)
        }
        navigate('/chat')
        break
      case 4: // 步骤5：创建角色按钮 → 需要在主界面
        navigate('/main')
        break
      case 5: // 步骤6：模型展示区 → 需要在聊天页
        navigate('/chat')
        break
      case 6: // 步骤7：收藏功能 → 留在聊天页
        break
      case 7: // 步骤8：用户图标 → 需要在主界面
        navigate('/main')
        break
      case 8: // 步骤9：教程结束 → 回到主界面
        navigate('/main')
        break
    }
  }, [assistantId, characters, setCurrentCharacter, navigate, setCharacterSelectorOpen])

  // 教程模式下追踪目标元素位置
  useEffect(() => {
    if (!isTutorialActive || demoStep !== null) {
      setTargetRect(null)
      return
    }

    const step = TUTORIAL_STEPS[tutorialStep]
    if (!step || !step.targetId) {
      setTargetRect(null)
      return
    }

    const updateRect = () => {
      const el = document.getElementById(step.targetId)
      if (el) {
        setTargetRect(el.getBoundingClientRect())
      } else {
        setTargetRect(null)
      }
    }

    updateRect()

    const observer = new MutationObserver(updateRect)
    observer.observe(document.body, { attributes: true, subtree: true, childList: true })

    const resizeHandler = () => updateRect()
    window.addEventListener('resize', resizeHandler)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resizeHandler)
    }
  }, [isTutorialActive, tutorialStep, demoStep])

  // 清理过渡定时器
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current)
      }
    }
  }, [])

  // 点击外部关闭右键菜单
  useEffect(() => {
    if (!contextMenu.visible) return
    const handleMouseDown = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        closeContextMenu()
      }
    }
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleMouseDown)
    }, 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', handleMouseDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextMenu.visible])

  const handleTutorialNext = () => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current)
      transitionTimerRef.current = null
    }

    // Phase 2: 退出 demo 模式，进入下一步
    if (demoStep !== null) {
      setDemoStep(null)

      if (tutorialStep < TUTORIAL_STEPS.length - 1) {
        const nextStep = tutorialStep + 1
        setTutorialStep(nextStep)
        // 延迟执行下一步的进入动作（让 demo 页面关闭）
        transitionTimerRef.current = setTimeout(() => enterStep(nextStep), 300)
      } else {
        setIsTutorialActive(false)
        setTutorialOpen(false)
        navigate('/main')
      }
      return
    }

    // Phase 1: 检查当前步骤是否有 demo（需要进入功能页面）
    const demoSteps = [1, 3, 4, 7]

    if (demoSteps.includes(tutorialStep)) {
      // 执行进入功能页面的动作
      switch (tutorialStep) {
        case 1: // 步骤2：打开通讯录
          setCharacterSelectorOpen(true)
          break
        case 3: // 步骤4：打开助手档案
          window.dispatchEvent(new CustomEvent('tutorial:open-assistant-profile'))
          break
        case 4: // 步骤5：跳转创建角色页面
          navigate('/create-character')
          break
        case 7: // 步骤8：打开用户模块
          navigate('/user-module')
          break
      }
      // 进入 demo 模式（不递进步骤，等用户再次点击"继续"）
      setDemoStep(tutorialStep)
    } else {
      // 无 demo 步骤，直接进入下一步
      if (tutorialStep < TUTORIAL_STEPS.length - 1) {
        const nextStep = tutorialStep + 1
        setTutorialStep(nextStep)
        transitionTimerRef.current = setTimeout(() => enterStep(nextStep), 150)
      } else {
        setIsTutorialActive(false)
        setTutorialOpen(false)
        navigate('/main')
      }
    }
  }

  const handleTutorialSkip = () => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current)
      transitionTimerRef.current = null
    }
    setDemoStep(null)
    setCharacterSelectorOpen(false)
    setIsTutorialActive(false)
    setTutorialOpen(false)
    navigate('/main')
  }

  const handleSendMessage = async () => {
    if (isAssistantTyping) return
    const text = inputValue.trim()
    const images = pendingAssistantImages
    if (!text && images.length === 0) return

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content: text,
      ...(images.length > 0 ? { images } : {}),
    }
    setChatMessages((prev) => [...prev, userMsg])
    setInputValue('')
    setPendingAssistantImages([])
    setIsAssistantTyping(true)

    const controller = new AbortController()
    assistantAbortRef.current = controller

    // 图片 OCR 识别
    let ocrText = ''
    if (images.length > 0) {
      setIsAssistantOcrProcessing(true)
      const allOcrTexts: string[] = []
      for (const img of images) {
        try {
          const ocrResult = await recognizeImage(img)
          if (ocrResult.success && ocrResult.text) {
            allOcrTexts.push(ocrResult.text)
          }
        } catch (err) {
          console.error('[AIAssistant] OCR 失败:', err)
        }
      }
      ocrText = allOcrTexts.join('\n')
      setIsAssistantOcrProcessing(false)
    }

    // 组合消息内容：用户文字 + 图片OCR文字
    const sentContent = ocrText ? (text ? `${text}\n[图片识别内容]\n${ocrText}` : `[图片识别内容]\n${ocrText}`) : text

    try {
      let reply: string
      if (user) {
        const personality = assistantSeed?.personality?.join('、')
        reply = await getAssistantResponse(user.id, sentContent, assistantName, personality, controller.signal)
      } else {
        reply = '请先登录后再使用助手功能。'
      }
      setChatMessages((prev) => [...prev, { id: genId(), role: 'assistant', content: reply }])
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        setChatMessages((prev) => [...prev, { id: genId(), role: 'assistant', content: '已停止生成' }])
      } else {
        console.error('[AIAssistant] AI 回复失败:', err)
        setChatMessages((prev) => [...prev, {
          id: genId(),
          role: 'assistant',
          content: '抱歉，我暂时无法回复。请稍后再试。',
        }])
      }
    } finally {
      setIsAssistantTyping(false)
      assistantAbortRef.current = null
    }
  }

  const handleStopAssistant = () => {
    assistantAbortRef.current?.abort()
  }

  const handleServiceSendMessage = async () => {
    if (isServiceTyping || isOcrProcessing) return
    const text = serviceInputValue.trim()
    const images = pendingServiceImages
    if (!text && images.length === 0) return

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content: text,
      ...(images.length > 0 ? { images } : {}),
    }
    setServiceMessages((prev) => [...prev, userMsg])
    setServiceInputValue('')
    setPendingServiceImages([])
    setIsServiceTyping(true)

    const controller = new AbortController()
    serviceAbortRef.current = controller

    // 图片 OCR 识别
    let ocrText = ''
    if (images.length > 0) {
      setIsOcrProcessing(true)
      const allOcrTexts: string[] = []
      for (const img of images) {
        try {
          const ocrResult = await recognizeImage(img)
          if (ocrResult.success && ocrResult.text) {
            allOcrTexts.push(ocrResult.text)
          }
        } catch (err) {
          console.error('[AIAssistant] 客服 OCR 失败:', err)
        }
      }
      ocrText = allOcrTexts.join('\n')
      setIsOcrProcessing(false)
    }

    // 组合消息内容：用户文字 + 图片OCR文字
    const sentContent = ocrText ? (text ? `${text}\n[图片识别内容]\n${ocrText}` : `[图片识别内容]\n${ocrText}`) : (text || '请帮我看看这张图片')

    try {
      const userId = user?.id || 'guest'
      const userNickname = user?.nickname || '游客'
      const result = await sendCSMessage(userId, userNickname, sentContent, undefined, controller.signal)
      setServiceMessages((prev) => [...prev, { id: genId(), role: 'assistant', content: result.reply }])
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        setServiceMessages((prev) => [...prev, { id: genId(), role: 'assistant', content: '已停止生成' }])
      } else {
        console.error('[AIAssistant] 客服回复失败:', err)
        setServiceMessages((prev) => [...prev, {
          id: genId(),
          role: 'assistant',
          content: '抱歉，我暂时无法回复。请稍后再试，或点击下方"转人工"联系客服。',
        }])
      }
    } finally {
      setIsServiceTyping(false)
      serviceAbortRef.current = null
    }
  }

  const handleStopService = () => {
    serviceAbortRef.current?.abort()
  }

  const handleServiceImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || isServiceTyping || isOcrProcessing) return

    // 重置 input 以便重复选择同一文件
    e.target.value = ''

    // 读取图片为 data URL，压缩后加入待发送列表
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      try {
        const compressed = await compressImage(dataUrl)
        setPendingServiceImages((prev) => [...prev, compressed])
      } catch {
        setPendingServiceImages((prev) => [...prev, dataUrl])
      }
    }
    reader.readAsDataURL(file)
  }

  const handleAssistantImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || isAssistantTyping) return

    // 重置 input 以便重复选择同一文件
    e.target.value = ''

    // 读取图片为 data URL，压缩后加入待发送列表
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      try {
        const compressed = await compressImage(dataUrl)
        setPendingAssistantImages((prev) => [...prev, compressed])
      } catch {
        setPendingAssistantImages((prev) => [...prev, dataUrl])
      }
    }
    reader.readAsDataURL(file)
  }

  // ─── 粘贴图片处理 ──────────────────────────────────────────
  const handleAssistantPaste = async (e: React.ClipboardEvent) => {
    const file = getImageFromPasteEvent(e.nativeEvent)
    if (!file) return
    e.preventDefault()
    try {
      const compressed = await compressImage(file)
      setPendingAssistantImages((prev) => [...prev, compressed])
    } catch (err) {
      console.error('[AIAssistant] 粘贴图片失败:', err)
    }
  }

  const handleServicePaste = async (e: React.ClipboardEvent) => {
    const file = getImageFromPasteEvent(e.nativeEvent)
    if (!file) return
    e.preventDefault()
    try {
      const compressed = await compressImage(file)
      setPendingServiceImages((prev) => [...prev, compressed])
    } catch (err) {
      console.error('[AIAssistant] 粘贴图片失败:', err)
    }
  }

  // ─── 右键菜单处理 ──────────────────────────────────────────
  const handleMessageContextMenu = (
    e: React.MouseEvent,
    msg: ChatMessage,
    panel: 'assistant' | 'service'
  ) => {
    e.preventDefault()
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      targetMsg: msg,
      panel,
    })
  }

  const closeContextMenu = () =>
    setContextMenu((prev) => ({ ...prev, visible: false }))

  const handleDeleteMessage = () => {
    if (!contextMenu.targetMsg || !contextMenu.panel) return
    const id = contextMenu.targetMsg.id
    if (contextMenu.panel === 'assistant') {
      setChatMessages((prev) => prev.filter((m) => m.id !== id))
    } else {
      setServiceMessages((prev) => prev.filter((m) => m.id !== id))
    }
    closeContextMenu()
  }

  const handleEditMessage = () => {
    if (!contextMenu.targetMsg || !contextMenu.panel) return
    setEditingMessage({
      id: contextMenu.targetMsg.id,
      panel: contextMenu.panel,
      content: contextMenu.targetMsg.content,
    })
    closeContextMenu()
  }

  const handleSaveEdit = async () => {
    if (!editingMessage) return
    const { id, panel, content } = editingMessage

    if (panel === 'assistant') {
      // 找到被编辑消息的位置，删除其后所有消息（包括旧回复）
      const msgIndex = chatMessages.findIndex((m) => m.id === id)
      if (msgIndex === -1) {
        setEditingMessage(null)
        return
      }
      // 保留编辑后的消息，删除后续所有消息
      setChatMessages((prev) => {
        const updated = prev.map((m) => (m.id === id ? { ...m, content } : m))
        return updated.slice(0, msgIndex + 1)
      })
      setEditingMessage(null)

      // 触发 AI 重新生成回复
      setIsAssistantTyping(true)
      const controller = new AbortController()
      assistantAbortRef.current = controller
      try {
        let reply: string
        if (user) {
          const personality = assistantSeed?.personality?.join('、')
          reply = await getAssistantResponse(user.id, content, assistantName, personality, controller.signal)
        } else {
          reply = '请先登录后再使用助手功能。'
        }
        setChatMessages((prev) => [...prev, { id: genId(), role: 'assistant', content: reply }])
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          setChatMessages((prev) => [...prev, { id: genId(), role: 'assistant', content: '已停止生成' }])
        } else {
          console.error('[AIAssistant] 修改后重新生成失败:', err)
          setChatMessages((prev) => [...prev, {
            id: genId(),
            role: 'assistant',
            content: '抱歉，我暂时无法回复。请稍后再试。',
          }])
        }
      } finally {
        setIsAssistantTyping(false)
        assistantAbortRef.current = null
      }
    } else {
      // 客服面板：同样删除后续消息并重新生成
      const msgIndex = serviceMessages.findIndex((m) => m.id === id)
      if (msgIndex === -1) {
        setEditingMessage(null)
        return
      }
      setServiceMessages((prev) => {
        const updated = prev.map((m) => (m.id === id ? { ...m, content } : m))
        return updated.slice(0, msgIndex + 1)
      })
      setEditingMessage(null)

      // 触发客服重新生成回复
      setIsServiceTyping(true)
      const controller = new AbortController()
      serviceAbortRef.current = controller
      try {
        const userId = user?.id || 'guest'
        const userNickname = user?.nickname || '游客'
        const result = await sendCSMessage(userId, userNickname, content, undefined, controller.signal)
        setServiceMessages((prev) => [...prev, { id: genId(), role: 'assistant', content: result.reply }])
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          setServiceMessages((prev) => [...prev, { id: genId(), role: 'assistant', content: '已停止生成' }])
        } else {
          console.error('[AIAssistant] 客服修改后重新生成失败:', err)
          setServiceMessages((prev) => [...prev, {
            id: genId(),
            role: 'assistant',
            content: '抱歉，我暂时无法回复。请稍后再试。',
          }])
        }
      } finally {
        setIsServiceTyping(false)
        serviceAbortRef.current = null
      }
    }
  }

  const handleRecallMessage = () => {
    if (!contextMenu.targetMsg || !contextMenu.panel) return
    const id = contextMenu.targetMsg.id
    if (contextMenu.panel === 'assistant') {
      setChatMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, content: '已撤回', recalled: true } : m))
      )
    } else {
      setServiceMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, content: '已撤回', recalled: true } : m))
      )
    }
    closeContextMenu()
  }

  const handleRegenerateMessage = async () => {
    if (!contextMenu.targetMsg || !contextMenu.panel) return
    const id = contextMenu.targetMsg.id
    const panel = contextMenu.panel

    if (panel === 'assistant') {
      const msgIndex = chatMessages.findIndex((m) => m.id === id)
      if (msgIndex === -1) return
      let userMsg: ChatMessage | undefined
      for (let i = msgIndex - 1; i >= 0; i--) {
        if (chatMessages[i].role === 'user') {
          userMsg = chatMessages[i]
          break
        }
      }
      if (!userMsg) return
      setChatMessages((prev) => prev.filter((m) => m.id !== id))
      closeContextMenu()
      setIsAssistantTyping(true)
      const controller = new AbortController()
      assistantAbortRef.current = controller
      try {
        let reply: string
        if (user) {
          const personality = assistantSeed?.personality?.join('、')
          reply = await getAssistantResponse(user.id, userMsg.content, assistantName, personality, controller.signal)
        } else {
          reply = '请先登录后再使用助手功能。'
        }
        setChatMessages((prev) => [...prev, { id: genId(), role: 'assistant', content: reply }])
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          setChatMessages((prev) => [...prev, { id: genId(), role: 'assistant', content: '已停止生成' }])
        } else {
          console.error('[AIAssistant] AI 回复失败:', err)
          setChatMessages((prev) => [...prev, {
            id: genId(),
            role: 'assistant',
            content: '抱歉，我暂时无法回复。请稍后再试。',
          }])
        }
      } finally {
        setIsAssistantTyping(false)
        assistantAbortRef.current = null
      }
    } else {
      const msgIndex = serviceMessages.findIndex((m) => m.id === id)
      if (msgIndex === -1) return
      let userMsg: ChatMessage | undefined
      for (let i = msgIndex - 1; i >= 0; i--) {
        if (serviceMessages[i].role === 'user') {
          userMsg = serviceMessages[i]
          break
        }
      }
      if (!userMsg) return
      setServiceMessages((prev) => prev.filter((m) => m.id !== id))
      closeContextMenu()
      setIsServiceTyping(true)
      const controller = new AbortController()
      serviceAbortRef.current = controller
      try {
        const userId = user?.id || 'guest'
        const userNickname = user?.nickname || '游客'
        const result = await sendCSMessage(userId, userNickname, userMsg.content, undefined, controller.signal)
        setServiceMessages((prev) => [...prev, { id: genId(), role: 'assistant', content: result.reply }])
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          setServiceMessages((prev) => [...prev, { id: genId(), role: 'assistant', content: '已停止生成' }])
        } else {
          console.error('[AIAssistant] 客服回复失败:', err)
          setServiceMessages((prev) => [...prev, {
            id: genId(),
            role: 'assistant',
            content: '抱歉，我暂时无法回复。请稍后再试，或点击下方"转人工"联系客服。',
          }])
        }
      } finally {
        setIsServiceTyping(false)
        serviceAbortRef.current = null
      }
    }
  }

  const handleCopyMessage = () => {
    if (!contextMenu.targetMsg) return
    const text = contextMenu.targetMsg.content
    navigator.clipboard.writeText(text).then(() => {
      // 复制成功
    }).catch(() => {
      // 复制失败，忽略
    })
    closeContextMenu()
  }

  const handleForwardMessage = () => {
    if (!contextMenu.targetMsg) return
    setForwardTargetMsg(contextMenu.targetMsg)
    setForwardDialogVisible(true)
    closeContextMenu()
  }

  const handleForwardSelect = (targetCharacterId: string) => {
    if (!forwardTargetMsg) return
    const targetChar = characters.find((c) => c.id === targetCharacterId)
    if (!targetChar) return

    // 通过 chatStore 添加消息到目标角色的聊天
    useChatStore.getState().addMessage(targetCharacterId, {
      id: genId(),
      characterId: targetCharacterId,
      role: 'user',
      content: forwardTargetMsg.content,
      timestamp: Date.now(),
      type: 'text',
    })

    setForwardDialogVisible(false)
    setForwardTargetMsg(null)
  }

  // 拖拽逻辑
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isPanelOpen || isServicePanelOpen) return
      e.preventDefault()
      setIsDragging(true)
      hasDragged.current = false
      dragStartPos.current = { x: e.clientX, y: e.clientY }
      dragOffset.current = {
        x: e.clientX - bubblePos.x,
        y: e.clientY - bubblePos.y
      }
    },
    [isPanelOpen, isServicePanelOpen, bubblePos.x, bubblePos.y]
  )

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartPos.current.x
      const dy = e.clientY - dragStartPos.current.y
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        hasDragged.current = true
      }
      const newX = e.clientX - dragOffset.current.x
      const newY = e.clientY - dragOffset.current.y
      setBubblePos({ x: newX, y: newY })

      // 实时检测是否在边缘
      const w = window.innerWidth
      const h = window.innerHeight
      const nearEdge =
        newX < EDGE_THRESHOLD ||
        newX > w - NORMAL_SIZE - EDGE_THRESHOLD ||
        newY < EDGE_THRESHOLD ||
        newY > h - NORMAL_SIZE - EDGE_THRESHOLD
      setIsMinimized(nearEdge)
    }

    const handleMouseUp = () => {
      setIsDragging(false)

      // 吸附到边缘
      setBubblePos((prev) => {
        const w = window.innerWidth
        const h = window.innerHeight
        const size = NORMAL_SIZE
        let { x, y } = prev

        // 限制在屏幕范围内
        x = Math.max(0, Math.min(x, w - size))
        y = Math.max(0, Math.min(y, h - size))

        const nearLeft = x < EDGE_THRESHOLD
        const nearRight = x > w - size - EDGE_THRESHOLD
        const nearTop = y < EDGE_THRESHOLD
        const nearBottom = y > h - size - EDGE_THRESHOLD

        if (nearLeft) {
          x = 0
          if (!nearTop && !nearBottom) {
            setIsMinimized(true)
          }
        } else if (nearRight) {
          x = w - size
          if (!nearTop && !nearBottom) {
            setIsMinimized(true)
          }
        }

        if (nearTop) {
          y = 0
          if (!nearLeft && !nearRight) {
            setIsMinimized(true)
          }
        } else if (nearBottom) {
          y = h - size
          if (!nearLeft && !nearRight) {
            setIsMinimized(true)
          }
        }

        // 如果不在任何边缘附近，恢复原大小
        const stillNearEdge =
          x < EDGE_THRESHOLD ||
          x > w - size - EDGE_THRESHOLD ||
          y < EDGE_THRESHOLD ||
          y > h - size - EDGE_THRESHOLD

        if (!stillNearEdge) {
          setIsMinimized(false)
        }

        return { x, y }
      })
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  const handleBubbleClick = () => {
    if (hasDragged.current) {
      hasDragged.current = false
      return
    }
    // 未选择助手时，点击悬浮球弹出客服浮层
    if (!assistantId && !isTutorialActive) {
      if (isServicePanelOpen) {
        setIsServicePanelOpen(false)
      } else {
        setIsServicePanelOpen(true)
      }
      return
    }
    if (isMinimized) {
      // 从最小化状态恢复
      setIsMinimized(false)
      setBubblePos((prev) => {
        const w = window.innerWidth
        const h = window.innerHeight
        let { x, y } = prev
        if (x < EDGE_THRESHOLD) x = EDGE_THRESHOLD
        if (x > w - NORMAL_SIZE - EDGE_THRESHOLD) x = w - NORMAL_SIZE - EDGE_THRESHOLD
        if (y < EDGE_THRESHOLD) y = EDGE_THRESHOLD
        if (y > h - NORMAL_SIZE - EDGE_THRESHOLD) y = h - NORMAL_SIZE - EDGE_THRESHOLD
        return { x, y }
      })
    } else {
      setIsPanelOpen(!isPanelOpen)
    }
  }

  const currentStep = TUTORIAL_STEPS[tutorialStep]

  // 计算教程气泡定位（在目标元素旁边）
  const getTooltipStyle = (): React.CSSProperties => {
    if (!targetRect) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      }
    }

    const tooltipWidth = 380
    const tooltipHeight = 220
    const vw = window.innerWidth
    const vh = window.innerHeight

    let top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2
    let left = targetRect.right + 16

    // 如果右侧放不下，放左侧
    if (left + tooltipWidth > vw) {
      left = targetRect.left - tooltipWidth - 16
    }
    // 如果左侧也放不下，放下方
    if (left < 16) {
      left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2
      top = targetRect.bottom + 16
    }
    // 如果下方也放不下，放上方
    if (top + tooltipHeight > vh) {
      top = targetRect.top - tooltipHeight - 16
    }

    // 确保不超出边界
    top = Math.max(16, Math.min(top, vh - tooltipHeight - 16))
    left = Math.max(16, Math.min(left, vw - tooltipWidth - 16))

    return { position: 'fixed' as const, top, left }
  }

  return (
    <>
      {/* 教程模式 - 高亮遮罩层 */}
      <AnimatePresence>
        {isTutorialActive && (
          <motion.div
            key="tutorial-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[99] pointer-events-none"
          >
            {/* 半透明遮罩 - 使用 clip-path 在目标位置挖洞 */}
            {targetRect && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  clipPath: `polygon(
                    0% 0%,
                    0% 100%,
                    ${targetRect.left - 8}px 100%,
                    ${targetRect.left - 8}px ${targetRect.top - 8}px,
                    ${targetRect.right + 8}px ${targetRect.top - 8}px,
                    ${targetRect.right + 8}px ${targetRect.bottom + 8}px,
                    ${targetRect.left - 8}px ${targetRect.bottom + 8}px,
                    ${targetRect.left - 8}px 100%,
                    100% 100%,
                    100% 0%
                  )`
                }}
              />
            )}
            {!targetRect && (
              <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }} />
            )}

            {/* 目标元素高亮边框 */}
            {targetRect && (
              <motion.div
                key={currentStep?.targetId}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="absolute pointer-events-none rounded-lg"
                style={{
                  left: targetRect.left - 6,
                  top: targetRect.top - 6,
                  width: targetRect.width + 12,
                  height: targetRect.height + 12,
                  border: '3px solid #3b82f6',
                  borderRadius: '12px',
                  boxShadow: '0 0 20px rgba(59, 130, 246, 0.5), 0 0 40px rgba(59, 130, 246, 0.2)'
                }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 教程悬浮窗 */}
      <AnimatePresence>
        {isTutorialActive && currentStep && (
          <motion.div
            key={`tutorial-tooltip-${tutorialStep}-${demoStep}`}
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.3 }}
            className="fixed z-[100] pointer-events-auto"
            style={getTooltipStyle()}
          >
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-5 w-[380px] border border-primary-200 dark:border-primary-800">
              {demoStep !== null && DEMO_MESSAGES[demoStep] ? (
                <>
                  <div className="flex items-start gap-3">
                    <AssistantAvatar size={48} assistantId={assistantId} />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-800 dark:text-white mb-1.5 text-sm">
                        {DEMO_MESSAGES[demoStep].title}
                      </h3>
                      <p className="text-gray-700 dark:text-gray-200 text-sm leading-relaxed">
                        {DEMO_MESSAGES[demoStep].text}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <AssistantAvatar size={48} assistantId={assistantId} />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-800 dark:text-white mb-1.5 text-sm">{assistantName}</h3>
                      <p className="text-gray-700 dark:text-gray-200 text-sm leading-relaxed">
                        {currentStep.assistantMessage}
                      </p>
                    </div>
                  </div>

                  {/* 提示文字 */}
                  {currentStep.text && (
                    <div className="mt-3 px-3 py-2 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                      <p className="text-primary-700 dark:text-primary-300 text-xs leading-relaxed">
                        {currentStep.text}
                      </p>
                    </div>
                  )}

                  {/* 补充说明 */}
                  {currentStep.supplementaryText && (
                    <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 leading-relaxed pl-1">
                      {currentStep.supplementaryText}
                    </p>
                  )}
                </>
              )}

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={handleTutorialSkip}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  跳过教程
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    {tutorialStep + 1} / {TUTORIAL_STEPS.length}
                  </span>
                  <button
                    onClick={handleTutorialNext}
                    className="inline-flex items-center gap-1 px-4 py-1.5 text-sm font-medium rounded-lg bg-primary-500 hover:bg-primary-600 text-white transition-colors"
                  >
                    {demoStep !== null
                      ? '继续'
                      : tutorialStep < TUTORIAL_STEPS.length - 1
                        ? '下一步'
                        : '完成'}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 常驻悬浮球 */}
      <AnimatePresence>
        {!isTutorialActive && (
          <motion.div
            ref={bubbleRef}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed z-[90] select-none"
            style={{
              left: bubblePos.x,
              top: bubblePos.y,
              cursor: isDragging ? 'grabbing' : 'grab'
            }}
            onMouseDown={handleMouseDown}
          >
            {/* 悬浮球主体 */}
            <motion.div
              animate={{
                width: isMinimized && !isPanelOpen ? MINIMIZED_SIZE : NORMAL_SIZE,
                height: isMinimized && !isPanelOpen ? MINIMIZED_SIZE : NORMAL_SIZE
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="rounded-full shadow-lg hover:shadow-xl overflow-hidden relative"
              style={{
                background: isPanelOpen ? 'transparent' : undefined
              }}
              onClick={handleBubbleClick}
            >
              {!isPanelOpen && (
                <div className="w-full h-full rounded-full flex items-center justify-center">
                  <AssistantAvatar
                    size={isMinimized ? MINIMIZED_SIZE : NORMAL_SIZE}
                    assistantId={assistantId}
                  />
                </div>
              )}
            </motion.div>

            {/* 助手对话框 */}
            <AnimatePresence>
              {isPanelOpen && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.8, opacity: 0, y: 10 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                  className="absolute bottom-full right-0 mb-3 w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
                  style={{ height: '420px' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* 面板头部 */}
                  <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      <AssistantAvatar size={32} assistantId={assistantId} />
                      <h3 className="font-bold text-gray-800 dark:text-white text-sm">{assistantName}</h3>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setIsPanelOpen(false)
                          navigate('/customer-service')
                        }}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        title="联系客服"
                      >
                        <Headphones className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => setIsPanelOpen(false)}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <MessageCircle className="w-4 h-4 text-gray-500" />
                      </button>
                    </div>
                  </div>

                  {/* 聊天消息区域 */}
                  <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
                    {chatMessages.length === 0 && (
                      <div className="text-center text-gray-400 dark:text-gray-500 text-sm mt-8">
                        <p className="flex items-center justify-center gap-2">
                          <MessageCircle className="w-5 h-5" />
                        </p>
                        <p className="mt-2">你好，我是{assistantName}~</p>
                        <p className="mt-1">有什么问题可以问我哦</p>
                      </div>
                    )}
                    {chatMessages.map((msg, index) => (
                      <motion.div
                        key={msg.id || index}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${
                          msg.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                        onContextMenu={(e) => handleMessageContextMenu(e, msg, 'assistant')}
                      >
                        {msg.role === 'assistant' && (
                          <div className="w-6 h-6 rounded-full mr-2 flex-shrink-0 mt-1 overflow-hidden">
                            <AssistantAvatar size={24} assistantId={assistantId} />
                          </div>
                        )}
                        <div
                          className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${
                            msg.recalled
                              ? 'bg-gray-50 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 italic'
                              : msg.role === 'user'
                                ? 'bg-primary-500 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                          }`}
                        >
                          {editingMessage?.id === msg.id ? (
                            <textarea
                              value={editingMessage.content}
                              onChange={(e) =>
                                setEditingMessage((prev) =>
                                  prev ? { ...prev, content: e.target.value } : prev
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault()
                                  handleSaveEdit()
                                }
                                if (e.key === 'Escape') setEditingMessage(null)
                              }}
                              autoFocus
                              rows={2}
                              className="w-full bg-white/20 outline-none resize-none text-sm rounded p-1"
                            />
                          ) : (
                            <>
                              {msg.images && msg.images.map((img, i) => (
                                <img key={i} src={img} alt="" className="w-full rounded-lg mb-1 max-h-32 object-cover" />
                              ))}
                              {msg.content}
                            </>
                          )}
                        </div>
                      </motion.div>
                    ))}
                    {isAssistantTyping && (
                      <div className="flex justify-start">
                        {assistantId && (
                          <div className="w-6 h-6 rounded-full mr-2 flex-shrink-0 mt-1 overflow-hidden">
                            <AssistantAvatar size={24} assistantId={assistantId} />
                          </div>
                        )}
                        <div className="bg-gray-100 dark:bg-gray-700 rounded-xl px-3 py-2">
                          {isAssistantOcrProcessing ? (
                            <span className="text-xs text-gray-500">正在识别图片内容...</span>
                          ) : (
                            <div className="flex gap-1">
                              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 输入框 */}
                  <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                    {pendingAssistantImages.length > 0 && (
                      <div className="mb-2 flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
                        {pendingAssistantImages.map((img, index) => (
                          <div
                            key={index}
                            draggable
                            onDragStart={() => setDraggedIndex(index)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => {
                              if (draggedIndex === null || draggedIndex === index) return
                              setPendingAssistantImages((prev) => {
                                const newArr = [...prev]
                                const [removed] = newArr.splice(draggedIndex, 1)
                                newArr.splice(index, 0, removed)
                                return newArr
                              })
                              setDraggedIndex(null)
                            }}
                            className="relative flex-shrink-0 cursor-grab active:cursor-grabbing"
                          >
                            <img src={img} alt="待发送" className="w-12 h-12 rounded-lg object-cover border border-gray-200 dark:border-gray-600" />
                            <button
                              onClick={() => setPendingAssistantImages((prev) => prev.filter((_, i) => i !== index))}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-xs leading-none hover:bg-red-600 transition-colors"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        onPaste={handleAssistantPaste}
                        placeholder="输入你的问题..."
                        className="flex-1 text-sm py-1.5 px-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                      />
                      <input
                        ref={assistantFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleAssistantImageSelect}
                        className="hidden"
                      />
                      {isAssistantTyping ? (
                        <button
                          onClick={handleStopAssistant}
                          className="p-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
                          title="停止生成"
                        >
                          <Square className="w-4 h-4" />
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => assistantFileInputRef.current?.click()}
                            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
                            title="上传图片"
                          >
                            <ImageIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleSendMessage}
                            disabled={!inputValue.trim() && pendingAssistantImages.length === 0}
                            className="p-2 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-30 text-white transition-colors disabled:cursor-not-allowed"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 客服浮层（未选择助手时） */}
            <AnimatePresence>
              {isServicePanelOpen && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.8, opacity: 0, y: 10 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                  className="absolute bottom-full right-0 mb-3 w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
                  style={{ height: '460px' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* 面板头部 */}
                  <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-indigo-500 text-white">
                        <Headphones className="w-4 h-4" />
                      </div>
                      <h3 className="font-bold text-gray-800 dark:text-white text-sm">客服小助手</h3>
                    </div>
                    <button
                      onClick={() => setIsServicePanelOpen(false)}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <MessageCircle className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>

                  {/* 聊天消息区域 */}
                  <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
                    {serviceMessages.length === 0 && (
                      <div className="text-center text-gray-400 dark:text-gray-500 text-sm mt-8">
                        <p className="flex items-center justify-center gap-2">
                          <Headphones className="w-5 h-5" />
                        </p>
                        <p className="mt-2">你好，我是客服小助手~</p>
                        <p className="mt-1">有什么问题可以问我哦</p>
                        <p className="mt-1 text-xs">如果无法解决，可以点击下方"转人工"</p>
                      </div>
                    )}
                    {serviceMessages.map((msg, index) => (
                      <motion.div
                        key={msg.id || index}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${
                          msg.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                        onContextMenu={(e) => handleMessageContextMenu(e, msg, 'service')}
                      >
                        {msg.role === 'assistant' && (
                          <div className="w-6 h-6 rounded-full mr-2 flex-shrink-0 mt-1 flex items-center justify-center bg-gradient-to-br from-blue-400 to-indigo-500 text-white">
                            <Headphones className="w-3 h-3" />
                          </div>
                        )}
                        <div
                          className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${
                            msg.recalled
                              ? 'bg-gray-50 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 italic'
                              : msg.role === 'user'
                                ? 'bg-primary-500 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                          }`}
                        >
                          {editingMessage?.id === msg.id ? (
                            <textarea
                              value={editingMessage.content}
                              onChange={(e) =>
                                setEditingMessage((prev) =>
                                  prev ? { ...prev, content: e.target.value } : prev
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault()
                                  handleSaveEdit()
                                }
                                if (e.key === 'Escape') setEditingMessage(null)
                              }}
                              autoFocus
                              rows={2}
                              className="w-full bg-white/20 outline-none resize-none text-sm rounded p-1"
                            />
                          ) : (
                            <>
                              {msg.images && msg.images.map((img, i) => (
                                <img key={i} src={img} alt="" className="w-full rounded-lg mb-1 max-h-32 object-cover" />
                              ))}
                              {msg.content}
                            </>
                          )}
                        </div>
                      </motion.div>
                    ))}
                    {isServiceTyping && (
                      <div className="flex justify-start">
                        <div className="w-6 h-6 rounded-full mr-2 flex-shrink-0 mt-1 flex items-center justify-center bg-gradient-to-br from-blue-400 to-indigo-500 text-white">
                          <Headphones className="w-3 h-3" />
                        </div>
                        <div className="bg-gray-100 dark:bg-gray-700 rounded-xl px-3 py-2">
                          {isOcrProcessing ? (
                            <span className="text-xs text-gray-500">正在识别图片内容...</span>
                          ) : (
                            <div className="flex gap-1">
                              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 输入框 */}
                  <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                    {pendingServiceImages.length > 0 && (
                      <div className="mb-2 flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
                        {pendingServiceImages.map((img, index) => (
                          <div
                            key={index}
                            draggable
                            onDragStart={() => setDraggedIndex(index)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => {
                              if (draggedIndex === null || draggedIndex === index) return
                              setPendingServiceImages((prev) => {
                                const newArr = [...prev]
                                const [removed] = newArr.splice(draggedIndex, 1)
                                newArr.splice(index, 0, removed)
                                return newArr
                              })
                              setDraggedIndex(null)
                            }}
                            className="relative flex-shrink-0 cursor-grab active:cursor-grabbing"
                          >
                            <img src={img} alt="待发送" className="w-12 h-12 rounded-lg object-cover border border-gray-200 dark:border-gray-600" />
                            <button
                              onClick={() => setPendingServiceImages((prev) => prev.filter((_, i) => i !== index))}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-xs leading-none hover:bg-red-600 transition-colors"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={serviceInputValue}
                        onChange={(e) => setServiceInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleServiceSendMessage()}
                        onPaste={handleServicePaste}
                        placeholder="输入你的问题..."
                        className="flex-1 text-sm py-1.5 px-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                      />
                      <input
                        ref={serviceFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleServiceImageSelect}
                        className="hidden"
                      />
                      {isServiceTyping ? (
                        <button
                          onClick={handleStopService}
                          className="p-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
                          title="停止生成"
                        >
                          <Square className="w-4 h-4" />
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => serviceFileInputRef.current?.click()}
                            disabled={isOcrProcessing}
                            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 text-gray-600 dark:text-gray-300 transition-colors disabled:cursor-not-allowed"
                            title="上传图片"
                          >
                            <ImageIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleServiceSendMessage}
                            disabled={(!serviceInputValue.trim() && pendingServiceImages.length === 0) || isOcrProcessing}
                            className="p-2 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-30 text-white transition-colors disabled:cursor-not-allowed"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 转人工按钮 */}
                  <div className="px-3 pb-3">
                    <button
                      onClick={() => {
                        setIsServicePanelOpen(false)
                        navigate('/customer-service')
                      }}
                      className="w-full py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 border-t border-gray-100 dark:border-gray-700 pt-2 transition-colors flex items-center justify-center gap-1"
                    >
                      <Headphones className="w-3.5 h-3.5" />
                      转人工 / 进入客服中心
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 右键消息菜单 */}
      <AnimatePresence>
        {contextMenu.visible && contextMenu.targetMsg && (
          <motion.div
            ref={contextMenuRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="fixed z-[200] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[120px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {contextMenu.targetMsg.role === 'user' ? (
              <>
                <button
                  onClick={handleCopyMessage}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  复制
                </button>
                <button
                  onClick={handleEditMessage}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  修改
                </button>
                <button
                  onClick={handleRecallMessage}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  撤回
                </button>
                <button
                  onClick={handleDeleteMessage}
                  className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  删除
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleCopyMessage}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  复制
                </button>
                <button
                  onClick={handleForwardMessage}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  转发
                </button>
                <button
                  onClick={handleRegenerateMessage}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  让对方重新回复
                </button>
                <button
                  onClick={handleDeleteMessage}
                  className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  删除
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 转发弹窗 */}
      <AnimatePresence>
        {forwardDialogVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40"
            onClick={() => setForwardDialogVisible(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-4 w-80 max-h-[60vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">转发到</h3>
              <div className="flex-1 overflow-y-auto scrollbar-thin space-y-1">
                {characters.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">暂无可转发的对象</p>
                ) : (
                  characters.map((char) => (
                    <button
                      key={char.id}
                      onClick={() => handleForwardSelect(char.id)}
                      className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-medium text-primary-600 dark:text-primary-300">
                          {char.profile.name.charAt(0)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                          {char.assistantEditable?.userNote || char.profile.name}
                        </p>
                        {char.isAssistant && (
                          <p className="text-xs text-gray-400">AI助手</p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
              <button
                onClick={() => setForwardDialogVisible(false)}
                className="mt-3 w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                取消
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
