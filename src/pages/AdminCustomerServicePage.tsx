import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Send,
  RefreshCw,
  XCircle,
  Clock,
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  Search,
} from 'lucide-react'
import { useAuthStore } from '@/stores'
import {
  getCSSessions,
  getCSSessionDetail,
  adminReplyCS,
  closeCSSession,
  type CSSession,
} from '@/services/customerServiceAPI'

interface AdminMessage {
  id: string
  role: string
  sender: 'user' | 'ai' | 'admin'
  content: string
  created_at: string
}

const STATUS_CONFIG = {
  pending: { label: '待处理', color: 'text-orange-600 bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  handled: { label: '已处理', color: 'text-green-600 bg-green-50 border-green-200', dot: 'bg-green-500' },
  closed: { label: '已关闭', color: 'text-gray-500 bg-gray-50 border-gray-200', dot: 'bg-gray-400' },
}

function formatTime(timeStr: string): string {
  const date = new Date(timeStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function formatMessageTime(timeStr: string): string {
  return new Date(timeStr).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminCustomerServicePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [sessions, setSessions] = useState<CSSession[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AdminMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [closingSession, setClosingSession] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const adminEmail = user?.email || ''

  const loadSessions = useCallback(async () => {
    try {
      const data = await getCSSessions(adminEmail)
      setSessions(data)
    } catch (err) {
      console.error('[Admin CS] 加载会话列表失败:', err)
    } finally {
      setLoading(false)
    }
  }, [adminEmail])

  const loadMessages = useCallback(async (userId: string) => {
    setLoadingMessages(true)
    try {
      const data = await getCSSessionDetail(userId, adminEmail)
      setMessages(data as AdminMessage[])
    } catch (err) {
      console.error('[Admin CS] 加载对话记录失败:', err)
      setMessages([])
    } finally {
      setLoadingMessages(false)
    }
  }, [adminEmail])

  useEffect(() => {
    loadSessions()
    const interval = setInterval(loadSessions, 30000)
    return () => clearInterval(interval)
  }, [loadSessions])

  useEffect(() => {
    if (selectedUserId) {
      loadMessages(selectedUserId)
    }
  }, [selectedUserId, loadMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!inputValue.trim() || !selectedUserId || sending) return

    const content = inputValue.trim()
    setInputValue('')
    setSending(true)

    try {
      await adminReplyCS(selectedUserId, content, adminEmail)
      await loadMessages(selectedUserId)
      await loadSessions()
    } catch (err) {
      console.error('[Admin CS] 回复失败:', err)
      setInputValue(content)
    } finally {
      setSending(false)
    }
  }

  const handleCloseSession = async () => {
    if (!selectedUserId || closingSession) return
    setClosingSession(true)
    try {
      await closeCSSession(selectedUserId, adminEmail)
      await loadMessages(selectedUserId)
      await loadSessions()
    } catch (err) {
      console.error('[Admin CS] 关闭会话失败:', err)
    } finally {
      setClosingSession(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const filteredSessions = searchQuery
    ? sessions.filter((s) =>
        s.nickname.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sessions

  const selectedSession = sessions.find((s) => s.userId === selectedUserId)
  const isSelectedClosed = selectedSession?.status === 'closed'

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
        <h1 className="text-base font-bold text-gray-800 dark:text-white">客服管理后台</h1>
        <button
          onClick={loadSessions}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="刷新"
        >
          <RefreshCw className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
      </div>

      {/* 主体区域：双栏布局 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左栏：会话列表 */}
        <div className={`w-full md:w-80 lg:w-96 flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${selectedUserId ? 'hidden md:flex' : 'flex'}`}>
          {/* 搜索框 */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索用户或消息..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* 会话列表 */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                加载中...
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <MessageCircle className="w-8 h-8 mb-2" />
                <p className="text-sm">暂无客服会话</p>
              </div>
            ) : (
              filteredSessions.map((session) => {
                const config = STATUS_CONFIG[session.status]
                const isSelected = session.userId === selectedUserId
                return (
                  <button
                    key={session.userId}
                    onClick={() => setSelectedUserId(session.userId)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 transition-colors ${
                      isSelected
                        ? 'bg-primary-50 dark:bg-primary-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    } ${session.status === 'pending' ? 'border-l-4 border-l-orange-400' : 'border-l-4 border-l-transparent'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm text-gray-800 dark:text-white truncate max-w-[60%]">
                        {session.nickname}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${config.color} flex-shrink-0`}>
                        {config.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-1">
                      {session.lastMessage}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span className="flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" />
                        {session.messageCount} 条
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(session.lastMessageTime)}
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* 右栏：会话详情 */}
        <div className={`flex-1 flex flex-col ${selectedUserId ? 'flex' : 'hidden md:flex'}`}>
          {!selectedUserId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <MessageCircle className="w-12 h-12 mb-3" />
              <p className="text-sm">选择左侧会话查看详情</p>
            </div>
          ) : (
            <>
              {/* 会话详情头部 */}
              <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedUserId(null)}
                    className="md:hidden p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  </button>
                  <div>
                    <h2 className="text-sm font-bold text-gray-800 dark:text-white">
                      {selectedSession?.nickname || '用户'}
                    </h2>
                    {selectedSession && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_CONFIG[selectedSession.status].color}`}>
                        {STATUS_CONFIG[selectedSession.status].label}
                      </span>
                    )}
                  </div>
                </div>
                {selectedSession && selectedSession.status !== 'closed' && (
                  <button
                    onClick={handleCloseSession}
                    disabled={closingSession}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    {closingSession ? '关闭中...' : '关闭会话'}
                  </button>
                )}
              </div>

              {/* 消息列表 */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50 dark:bg-gray-900">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-12 text-gray-400">
                    <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                    加载中...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <AlertCircle className="w-8 h-8 mb-2" />
                    <p className="text-sm">暂无对话记录</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isService = msg.sender === 'admin'
                    const isAI = msg.sender === 'ai'
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${isService ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[75%] ${isService ? 'items-end' : 'items-start'} flex flex-col`}>
                          <span className="text-[10px] text-gray-400 mb-1 px-2">
                            {isService ? '客服' : isAI ? 'AI客服' : '用户'}
                          </span>
                          <div
                            className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                              isService
                                ? 'bg-primary-500 text-white rounded-br-md'
                                : isAI
                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800 rounded-bl-md'
                                : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 shadow-sm rounded-bl-md'
                            }`}
                          >
                            {msg.content}
                          </div>
                          <span className="text-[10px] text-gray-400 mt-1 px-2">
                            {formatMessageTime(msg.created_at)}
                          </span>
                        </div>
                      </motion.div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 底部输入区 */}
              <div className="px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                {isSelectedClosed ? (
                  <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-400">
                    <CheckCircle2 className="w-4 h-4" />
                    此会话已关闭，无法继续回复
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <textarea
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      rows={1}
                      placeholder="输入回复内容... (Enter发送，Shift+Enter换行)"
                      className="flex-1 px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                      style={{ maxHeight: '120px' }}
                    />
                    <button
                      onClick={handleSend}
                      disabled={!inputValue.trim() || sending}
                      className={`p-2.5 rounded-xl transition-all ${
                        inputValue.trim() && !sending
                          ? 'bg-primary-500 text-white hover:bg-primary-600'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                      }`}
                      aria-label="发送"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
