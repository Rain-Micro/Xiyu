import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  X,
  Send,
  Plus,
  Image as ImageIcon,
  Type,
  Mail,
  RotateCcw,
  Lock,
  Square,
  Trash2,
  Pencil,
  Undo2,
  RefreshCw,
  Copy,
  Share2,
} from 'lucide-react'
import { useAuthStore, useCharacterStore } from '@/stores'
import { useChatStore } from '@/stores'
import { sendCSMessage, getCSMessages, reopenCSSession } from '@/services/customerServiceAPI'
import { getImageFromPasteEvent, compressImage, recognizeImage } from '@/utils/imageUtils'

interface ChatMessage {
  id: string
  role: 'user' | 'service'
  content: string
  type: 'text' | 'image'
  timestamp: number
}

export default function CustomerServicePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { characters } = useCharacterStore()
  const [forwardDialogVisible, setForwardDialogVisible] = useState(false)
  const [forwardTargetMsg, setForwardTargetMsg] = useState<ChatMessage | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      role: 'service',
      content: '您好，请问有什么问题可以帮助您？',
      type: 'text',
      timestamp: Date.now(),
    },
    {
      id: 'welcome-2',
      role: 'service',
      content: '客服邮箱：rain0153@foxmail.com',
      type: 'text',
      timestamp: Date.now() + 1,
    },
  ])
  const [inputValue, setInputValue] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [sessionClosed, setSessionClosed] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null)
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
    targetMsgId: string | null
  }>({ visible: false, x: 0, y: 0, targetMsgId: null })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 加载历史消息
  useEffect(() => {
    if (!user) return
    getCSMessages(user.id)
      .then((result) => {
        const msgs = result.messages
        if (msgs && msgs.length > 0) {
          setMessages(
            msgs.map((msg: Record<string, unknown>) => ({
              id: String(msg.id),
              role: (msg.sender === 'user' ? 'user' : 'service') as 'user' | 'service',
              content: msg.content as string,
              type: 'text' as const,
              timestamp: new Date(msg.created_at as string).getTime(),
            }))
          )
        }
        if (result.sessionClosed) {
          setSessionClosed(true)
        }
      })
      .catch((err) => console.error('[CS] 加载历史消息失败:', err))
  }, [user])

  // 点击外部关闭右键菜单
  useEffect(() => {
    if (!contextMenu.visible) return
    const handleClose = () => setContextMenu((prev) => ({ ...prev, visible: false }))
    window.addEventListener('click', handleClose)
    window.addEventListener('contextmenu', handleClose)
    return () => {
      window.removeEventListener('click', handleClose)
      window.removeEventListener('contextmenu', handleClose)
    }
  }, [contextMenu.visible])

  const handleSend = async () => {
    if ((!inputValue.trim() && pendingImages.length === 0) || !user || sessionClosed) return

    const hasImages = pendingImages.length > 0
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: hasImages ? (inputValue.trim() || '[图片]') : inputValue.trim(),
      type: hasImages ? 'image' : 'text',
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, userMessage])
    const sentContent = inputValue.trim()
    setInputValue('')
    setShowOptions(false)
    setIsTyping(true)

    // 创建 AbortController 用于停止生成
    const controller = new AbortController()
    abortRef.current = controller

    // 处理粘贴的图片：压缩 + OCR
    let ocrText: string | undefined
    if (hasImages && pendingImages.length > 0) {
      const allOcrTexts: string[] = []
      for (const img of pendingImages) {
        try {
          const compressed = await compressImage(img)
          const ocrResult = await recognizeImage(compressed)
          if (ocrResult.success && ocrResult.text) {
            allOcrTexts.push(ocrResult.text)
          }
        } catch (err) {
          console.error('[CS] 图片处理失败:', err)
        }
      }
      ocrText = allOcrTexts.length > 0 ? allOcrTexts.join('\n') : undefined
      setPendingImages([])
    }

    try {
      const result = await sendCSMessage(
        user.id,
        user.nickname || '用户',
        sentContent || '[图片]',
        ocrText,
        controller.signal
      )
      if (result.sessionClosed) {
        setSessionClosed(true)
        setMessages((prev) => [...prev, {
          id: `closed-${Date.now()}`,
          role: 'service',
          content: result.reply,
          type: 'text',
          timestamp: Date.now(),
        }])
      } else {
        const reply: ChatMessage = {
          id: `reply-${Date.now()}`,
          role: 'service',
          content: result.reply,
          type: 'text',
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, reply])
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        const stopMsg: ChatMessage = {
          id: `stop-${Date.now()}`,
          role: 'service',
          content: '已停止生成',
          type: 'text',
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, stopMsg])
      } else {
        console.error('[CS] 发送消息失败:', err)
        const errorMsg: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'service',
          content: '抱歉，服务暂时不可用，请稍后重试或发送邮件至 rain0153@foxmail.com',
          type: 'text',
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, errorMsg])
      }
    } finally {
      setIsTyping(false)
      abortRef.current = null
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const handleReopen = async () => {
    if (!user || reopening) return
    setReopening(true)
    try {
      await reopenCSSession(user.id)
      setSessionClosed(false)
      setMessages([
        {
          id: 'welcome-reopen',
          role: 'service',
          content: '您好，请问有什么问题可以帮助您？',
          type: 'text',
          timestamp: Date.now(),
        },
      ])
    } catch (err) {
      console.error('[CS] 重新发起会话失败:', err)
    } finally {
      setReopening(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleImageSelect = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    // 支持多张图片，添加到待发送列表
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      try {
        const compressed = await compressImage(file)
        setPendingImages(prev => [...prev, compressed])
      } catch (err) {
        console.error('[CS] 图片压缩失败:', err)
      }
    }
    setShowOptions(false)
    e.target.value = ''
  }

  const handleSendText = () => {
    setShowOptions(false)
    const input = document.getElementById('cs-input') as HTMLInputElement
    input?.focus()
  }

  // 粘贴图片处理
  const handlePaste = (e: React.ClipboardEvent) => {
    const file = getImageFromPasteEvent(e.nativeEvent)
    if (file) {
      e.preventDefault()
      const reader = new FileReader()
      reader.onload = () => {
        setPendingImages(prev => [...prev, reader.result as string])
      }
      reader.readAsDataURL(file)
    }
  }

  // 右键菜单
  const handleContextMenu = (e: React.MouseEvent, msgId: string) => {
    e.preventDefault()
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, targetMsgId: msgId })
  }

  // 删除消息
  const handleDeleteMsg = (msgId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== msgId))
    setContextMenu((prev) => ({ ...prev, visible: false }))
  }

  // 编辑消息
  const handleEditMsg = (msgId: string, content: string) => {
    setEditingMsgId(msgId)
    setEditContent(content)
    setContextMenu((prev) => ({ ...prev, visible: false }))
  }

  // 保存编辑
  const handleSaveEdit = (e: React.KeyboardEvent, msgId: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, content: editContent.trim() } : m))
      )
      setEditingMsgId(null)
      setEditContent('')
    }
    if (e.key === 'Escape') {
      setEditingMsgId(null)
      setEditContent('')
    }
  }

  // 撤回消息
  const handleRecallMsg = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, content: '已撤回' } : m))
    )
    setContextMenu((prev) => ({ ...prev, visible: false }))
  }

  // 重新生成：移除客服消息，重新发送上一条用户消息
  const handleRegenerate = async (msgId: string) => {
    setContextMenu((prev) => ({ ...prev, visible: false }))
    if (!user) return

    const msgIndex = messages.findIndex((m) => m.id === msgId)
    if (msgIndex === -1) return

    // 找到该客服消息之前的最后一条用户消息
    let prevUserContent = ''
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        prevUserContent = messages[i].content
        break
      }
    }
    if (!prevUserContent) return

    // 移除该客服消息
    setMessages((prev) => prev.filter((m) => m.id !== msgId))
    setIsTyping(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const result = await sendCSMessage(
        user.id,
        user.nickname || '用户',
        prevUserContent,
        undefined,
        controller.signal
      )
      if (result.sessionClosed) {
        setSessionClosed(true)
        setMessages((prev) => [...prev, {
          id: `closed-${Date.now()}`,
          role: 'service',
          content: result.reply,
          type: 'text',
          timestamp: Date.now(),
        }])
      } else {
        const reply: ChatMessage = {
          id: `reply-${Date.now()}`,
          role: 'service',
          content: result.reply,
          type: 'text',
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, reply])
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        const stopMsg: ChatMessage = {
          id: `stop-${Date.now()}`,
          role: 'service',
          content: '已停止生成',
          type: 'text',
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, stopMsg])
      } else {
        console.error('[CS] 重新生成失败:', err)
        const errorMsg: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'service',
          content: '抱歉，服务暂时不可用，请稍后重试或发送邮件至 rain0153@foxmail.com',
          type: 'text',
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, errorMsg])
      }
    } finally {
      setIsTyping(false)
      abortRef.current = null
    }
  }

  // 复制消息
  const handleCopyMsg = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId)
    if (!msg) return
    navigator.clipboard.writeText(msg.content).then(() => {
      // 复制成功
    }).catch(() => {
      // 复制失败
    })
    setContextMenu((prev) => ({ ...prev, visible: false }))
  }

  // 转发消息
  const handleForwardMsg = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId)
    if (!msg) return
    setForwardTargetMsg(msg)
    setForwardDialogVisible(true)
    setContextMenu((prev) => ({ ...prev, visible: false }))
  }

  // 选择转发目标
  const handleForwardSelect = (targetCharacterId: string) => {
    if (!forwardTargetMsg) return
    useChatStore.getState().addMessage(targetCharacterId, {
      id: `fwd-${Date.now()}`,
      characterId: targetCharacterId,
      role: 'user',
      content: forwardTargetMsg.content,
      timestamp: Date.now(),
      type: 'text',
    })
    setForwardDialogVisible(false)
    setForwardTargetMsg(null)
  }

  return (
    <div className="h-full w-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="返回"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white text-sm font-bold">
            客
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-800 dark:text-white leading-tight">
              客服中心
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">客服代表 · 人工转接</p>
          </div>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="关闭"
        >
          <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
      </div>

      {/* 客服邮箱 */}
      <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center gap-2 text-sm text-blue-700 dark:text-blue-300">
        <Mail className="w-4 h-4" />
        <span>客服邮箱：rain0153@foxmail.com</span>
      </div>

      {/* 会话已关闭提示 */}
      {sessionClosed && (
        <div className="px-4 py-3 bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-300">
            <Lock className="w-4 h-4 flex-shrink-0" />
            <span>会话已关闭，如有新问题请重新发起</span>
          </div>
          <button
            onClick={handleReopen}
            disabled={reopening}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {reopening ? '处理中...' : '重新发起会话'}
          </button>
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleContextMenu(e, msg.id)
              }}
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                msg.role === 'user'
                  ? 'bg-primary-500 text-white rounded-br-md'
                  : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-md shadow-sm'
              }`}
            >
              {editingMsgId === msg.id ? (
                <textarea
                  autoFocus
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={(e) => handleSaveEdit(e, msg.id)}
                  className="w-full bg-white/20 rounded-lg p-1.5 outline-none resize-none text-white placeholder:text-white/60"
                  rows={2}
                />
              ) : msg.type === 'image' ? (
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  <span>{msg.content}</span>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
              <span
                className={`text-[10px] mt-1 block ${
                  msg.role === 'user'
                    ? 'text-primary-100'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </motion.div>
        ))}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div
              onClick={handleStop}
              className="bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-2xl rounded-bl-md shadow-sm px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title="点击停止生成"
            >
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 右键菜单 */}
      {contextMenu.visible && contextMenu.targetMsgId && (
        <div
          className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 180),
            top: Math.min(contextMenu.y, window.innerHeight - 240),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const targetMsg = messages.find((m) => m.id === contextMenu.targetMsgId)
            if (!targetMsg) return null
            return targetMsg.role === 'user' ? (
              <>
                <button
                  onClick={() => handleCopyMsg(targetMsg.id)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Copy className="w-4 h-4" />
                  复制
                </button>
                <button
                  onClick={() => handleEditMsg(targetMsg.id, targetMsg.content)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Pencil className="w-4 h-4" />
                  修改
                </button>
                <button
                  onClick={() => handleRecallMsg(targetMsg.id)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Undo2 className="w-4 h-4" />
                  撤回
                </button>
                <button
                  onClick={() => handleDeleteMsg(targetMsg.id)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Trash2 className="w-4 h-4" />
                  删除
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleCopyMsg(targetMsg.id)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Copy className="w-4 h-4" />
                  复制
                </button>
                <button
                  onClick={() => handleForwardMsg(targetMsg.id)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Share2 className="w-4 h-4" />
                  转发
                </button>
                <button
                  onClick={() => handleRegenerate(targetMsg.id)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <RefreshCw className="w-4 h-4" />
                  让对方重新回复
                </button>
                <button
                  onClick={() => handleDeleteMsg(targetMsg.id)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Trash2 className="w-4 h-4" />
                  删除
                </button>
              </>
            )
          })()}
        </div>
      )}

      {/* 底部输入区 */}
      <div className="px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
        {sessionClosed ? (
          <div className="flex items-center justify-center py-2 text-sm text-gray-400">
            会话已关闭，请点击上方"重新发起会话"按钮
          </div>
        ) : (
          <>
            <AnimatePresence>
              {showOptions && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mb-2"
                >
                  <div className="flex gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-xl">
                    <button
                      onClick={handleImageSelect}
                      className="flex flex-col items-center gap-1 px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    >
                      <ImageIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                      <span className="text-xs text-gray-600 dark:text-gray-300">
                        发送图片
                      </span>
                    </button>
                    <button
                      onClick={handleSendText}
                      className="flex flex-col items-center gap-1 px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    >
                      <Type className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                      <span className="text-xs text-gray-600 dark:text-gray-300">
                        发送文字
                      </span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 待发送图片预览 */}
            {pendingImages.length > 0 && (
              <div className="flex gap-2 mb-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-xl overflow-x-auto">
                {pendingImages.map((img, index) => (
                  <div
                    key={index}
                    draggable
                    onDragStart={() => setDraggedImageIndex(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggedImageIndex === null || draggedImageIndex === index) return
                      setPendingImages(prev => {
                        const newArr = [...prev]
                        const [removed] = newArr.splice(draggedImageIndex, 1)
                        newArr.splice(index, 0, removed)
                        return newArr
                      })
                      setDraggedImageIndex(null)
                    }}
                    className="relative flex-shrink-0 group cursor-move"
                  >
                    <img src={img} alt={`图片${index+1}`} className="w-12 h-12 object-cover rounded-lg" />
                    <button
                      onClick={() => setPendingImages(prev => prev.filter((_, i) => i !== index))}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowOptions(!showOptions)}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="更多选项"
              >
                <Plus
                  className={`w-5 h-5 text-gray-600 dark:text-gray-300 transition-transform ${
                    showOptions ? 'rotate-45' : ''
                  }`}
                />
              </button>

              <input
                id="cs-input"
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                className="input-field flex-1 py-2.5"
                placeholder="请输入您的问题..."
              />

              <button
                onClick={handleImageSelect}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="上传图片"
              >
                <ImageIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>

              {isTyping ? (
                <button
                  onClick={handleStop}
                  className="p-2.5 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-all"
                  aria-label="停止生成"
                >
                  <Square className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() && pendingImages.length === 0}
                  className={`p-2.5 rounded-xl transition-all ${
                    inputValue.trim() || pendingImages.length > 0
                      ? 'bg-primary-500 text-white hover:bg-primary-600'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                  }`}
                  aria-label="发送"
                >
                  <Send className="w-5 h-5" />
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
          </>
        )}
      </div>

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
    </div>
  )
}
