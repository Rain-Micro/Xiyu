import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Search,
  Calendar,
  FileText,
  Image as ImageIcon,
  Video,
  Smile,
  Mic,
  Link as LinkIcon,
  Forward,
  Trash2,
  Star,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useCharacterStore, useChatStore } from '@/stores'
import type { Message } from '@/types'

// 分类类型
type Category = 'date' | 'file' | 'image' | 'video' | 'emoji' | 'voice' | 'link'

// 分类配置
const CATEGORIES: { key: Category; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'date', label: '日期', icon: Calendar },
  { key: 'file', label: '文件', icon: FileText },
  { key: 'image', label: '图片', icon: ImageIcon },
  { key: 'video', label: '视频', icon: Video },
  { key: 'emoji', label: '表情包', icon: Smile },
  { key: 'voice', label: '语音', icon: Mic },
  { key: 'link', label: '链接', icon: LinkIcon },
]

// 格式化日期
function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')

  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return `今天 ${hh}:${mm}`
  }
  return `${y}/${m}/${d} ${hh}:${mm}`
}

/** 检测消息内容是否包含表情符号或自定义文本表情 */
function containsEmoji(content: string): boolean {
  // 匹配 Unicode Emoji 表情符号（包括组合 emoji）
  const emojiRegex = /\p{Extended_Pictographic}/u
  // 匹配自定义文本表情，如 [微笑]、[偷笑] 等
  const textEmojiRegex = /\[.+?\]/
  return emojiRegex.test(content) || textEmojiRegex.test(content)
}

/** 检测消息内容是否包含链接 */
function containsLink(content: string): boolean {
  // 匹配 http:// 或 https:// 开头的链接
  const httpRegex = /https?:\/\/\S+/i
  // 匹配 www. 开头的链接
  const wwwRegex = /\bwww\.\S+/i
  // 匹配域名格式链接（如 qq.com, baidu.com.cn 等），需包含常见顶级域名
  const domainRegex = /\b[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.(com|cn|org|net|edu|gov|io|xyz|top|vip|me|info|biz|tv|cc|co|us|uk|de|fr|jp|kr|ru|br|in|au|ca|de|fr|nl|se|no|fi|dk|ch|at|be|es|it|pt|gr|ie|pl|cz|hu|ro|bg|hr|sk|si|lt|lv|ee|lu|mt|cy|is|li|mc|sm|va|ad|mt)\b/i
  return httpRegex.test(content) || wwwRegex.test(content) || domainRegex.test(content)
}

// ─── 组件：日期选择器（日历） ───────────────────────────────────────────────

function DatePicker({
  selectedDate,
  onSelect,
  onClose,
}: {
  selectedDate: string | null
  onSelect: (date: string | null) => void
  onClose: () => void
}) {
  const [viewMonth, setViewMonth] = useState(() => {
    if (selectedDate) {
      const [y, m] = selectedDate.split('-').map(Number)
      return new Date(y, m - 1, 1)
    }
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()

  const firstDayOfWeek = new Date(year, month, 1).getDay() // 0 = 周日
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const weekDays = ['日', '一', '二', '三', '四', '五', '六']

  // 构建日历格子
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const formatDateStr = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  return (
    <>
      {/* 遮罩层（点击外部关闭） */}
      <div className="fixed inset-0 z-30" onClick={onClose} />

      {/* 日历浮层面板 */}
      <motion.div
        initial={{ opacity: 0, y: -6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="absolute top-full left-4 mt-1 w-[260px] p-3 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 z-40"
      >
        {/* 头部：月份导航 */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setViewMonth(new Date(year, month - 1, 1))}
            className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
          </button>
          <div className="flex items-center gap-1">
            <select
              value={year}
              onChange={(e) => setViewMonth(new Date(parseInt(e.target.value), month, 1))}
              className="text-xs font-medium text-gray-700 dark:text-gray-300 bg-transparent border-none focus:outline-none cursor-pointer"
            >
              {Array.from({ length: 10 }, (_, i) => today.getFullYear() - 5 + i).map((y) => (
                <option key={y} value={y}>{y}年</option>
              ))}
            </select>
            <select
              value={month}
              onChange={(e) => setViewMonth(new Date(year, parseInt(e.target.value), 1))}
              className="text-xs font-medium text-gray-700 dark:text-gray-300 bg-transparent border-none focus:outline-none cursor-pointer"
            >
              {Array.from({ length: 12 }, (_, i) => i).map((m) => (
                <option key={m} value={m}>{m + 1}月</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setViewMonth(new Date(year, month + 1, 1))}
            className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
          </button>
        </div>

        {/* 星期标题 */}
        <div className="grid grid-cols-7 gap-0.5 mb-0.5">
          {weekDays.map((d) => (
            <div key={d} className="text-center text-[10px] text-gray-400 py-0.5">{d}</div>
          ))}
        </div>

        {/* 日期格子 */}
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} className="h-7" />
            const dateStr = formatDateStr(year, month, day)
            const cellDate = new Date(year, month, day)
            cellDate.setHours(0, 0, 0, 0)
            const isToday = cellDate.getTime() === today.getTime()
            const isFuture = cellDate.getTime() > today.getTime()
            const isSelected = selectedDate === dateStr

            return (
              <button
                key={i}
                disabled={isFuture}
                onClick={() => {
                  onSelect(dateStr)
                  onClose()
                }}
                className={`h-7 w-7 rounded-md text-xs transition-colors mx-auto ${
                  isSelected
                    ? 'bg-primary-500 text-white font-bold'
                    : isToday
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 font-medium'
                    : isFuture
                    ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {day}
              </button>
            )
          })}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          {selectedDate ? (
            <button
              onClick={() => {
                onSelect(null)
                onClose()
              }}
              className="text-[11px] text-gray-500 hover:text-red-500 transition-colors"
            >
              清除筛选
            </button>
          ) : (
            <span className="text-[11px] text-gray-400">请选择日期</span>
          )}
          <button
            onClick={onClose}
            className="text-[11px] text-primary-500 hover:underline"
          >
            关闭
          </button>
        </div>
      </motion.div>
    </>
  )
}

export default function SearchChatPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentCharacter, characters, setCurrentCharacter } = useCharacterStore()
  const { messages: allMessages, deleteMessage } = useChatStore()

  const state = location.state as { characterId?: string } | null
  const characterId = currentCharacter?.id || state?.characterId || ''
  const character =
    currentCharacter ||
    (state?.characterId ? characters.find((c) => c.id === state.characterId) : null) ||
    null

  const [searchText, setSearchText] = useState('')
  const [activeCategory, setActiveCategory] = useState<Category | null>(null)
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)  // YYYY-MM-DD
  const [showDatePicker, setShowDatePicker] = useState(false)

  // 确保当前角色已设置
  useEffect(() => {
    if (state?.characterId && !currentCharacter) {
      const c = characters.find((ch) => ch.id === state.characterId)
      if (c) setCurrentCharacter(c)
    }
  }, [state, characters, currentCharacter, setCurrentCharacter])

  // 当前角色的所有消息
  const allMsgs = allMessages[characterId] || []

  // 过滤消息
  const filteredMessages = useMemo(() => {
    let result = [...allMsgs]

    // 按分类筛选
    if (activeCategory === 'image') {
      result = result.filter((m) => m.type === 'image')
    } else if (activeCategory === 'file') {
      result = result.filter((m) => m.type === 'file')
    } else if (activeCategory === 'video') {
      result = result.filter((m) => m.type === 'file' && m.fileInfo?.name?.match(/\.(mp4|mov|avi|mkv|webm)$/i))
    } else if (activeCategory === 'emoji') {
      // 只匹配包含 Unicode Emoji 或 [文本] 格式表情的消息
      result = result.filter((m) => (m.type === 'text' || !m.type) && containsEmoji(m.content))
    } else if (activeCategory === 'voice') {
      result = result.filter((m) => m.type === 'voice')
    } else if (activeCategory === 'link') {
      result = result.filter((m) => (m.type === 'text' || !m.type) && containsLink(m.content))
    } else if (activeCategory === 'date') {
      // 按日期筛选：如果选了日期，只显示该日期的消息
      if (selectedDate) {
        result = result.filter((m) => {
          const d = new Date(m.timestamp)
          const msgDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          return msgDate === selectedDate
        })
      }
    }

    // 按关键词搜索
    if (searchText.trim()) {
      const kw = searchText.toLowerCase()
      result = result.filter(
        (m) =>
          m.content.toLowerCase().includes(kw) ||
          m.fileInfo?.name?.toLowerCase().includes(kw)
      )
    }

    // 按时间倒序
    result.sort((a, b) => b.timestamp - a.timestamp)
    return result
  }, [allMsgs, activeCategory, searchText, selectedDate])

  // 按日期分组（用于 date 分类）
  const groupedByDate = useMemo(() => {
    if (activeCategory !== 'date') return []
    const groups: { dateLabel: string; messages: Message[] }[] = []
    const map: Record<string, Message[]> = {}

    for (const msg of filteredMessages) {
      const d = new Date(msg.timestamp)
      const label = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
      if (!map[label]) map[label] = []
      map[label].push(msg)
    }

    for (const [label, msgs] of Object.entries(map)) {
      groups.push({ dateLabel: label, messages: msgs })
    }
    return groups
  }, [filteredMessages, activeCategory])

  // ─── 消息操作 ────────────────────────────────────────────────────────────

  const handleForward = useCallback(() => {
    // 预留：转发功能
    setSelectedMessage(null)
    alert('转发功能开发中...')
  }, [])

  const handleDelete = useCallback(
    () => {
      if (!selectedMessage) return
      deleteMessage(characterId, selectedMessage.id)
      setSelectedMessage(null)
    },
    [characterId, deleteMessage, selectedMessage]
  )

  const handleFavorite = useCallback(() => {
    // 预留：收藏功能
    setSelectedMessage(null)
    alert('已收藏')
  }, [])

  // ─── 跳转到聊天位置 ──────────────────────────────────────────────────────

  const handleJumpToMessage = useCallback(
    (msg: Message) => {
      navigate('/chat', { state: { characterId, highlightMessageId: msg.id } })
    },
    [navigate, characterId]
  )

  // 未选择角色
  if (!character) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="h-full w-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900"
      >
        <p className="text-gray-500 dark:text-gray-400 mb-4">未选择角色</p>
        <button onClick={() => navigate('/main')} className="btn-primary">
          返回主页
        </button>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full w-full flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden"
    >
      {/* 顶部导航栏 + 搜索栏 */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">查找聊天记录</h2>
        </div>

        {/* 搜索框 */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="input-field pl-9 text-sm"
              placeholder="输入关键词搜索聊天记录..."
            />
          </div>
        </div>

        {/* 分类按钮 */}
        <div className="px-4 pb-3 relative">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon
              const isActive = activeCategory === cat.key
              return (
                <button
                  key={cat.key}
                  onClick={() => {
                    if (cat.key === 'date') {
                      if (isActive) {
                        if (selectedDate) {
                          setShowDatePicker(true)
                        } else {
                          setActiveCategory(null)
                          setShowDatePicker(false)
                        }
                      } else {
                        setActiveCategory('date')
                        setShowDatePicker(true)
                      }
                    } else {
                      setActiveCategory(isActive ? null : cat.key)
                      setShowDatePicker(false)
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {cat.label}
                </button>
              )
            })}
          </div>

          {/* 日期选择器弹出层（放在 overflow 容器外，避免被截断） */}
          <AnimatePresence>
            {showDatePicker && activeCategory === 'date' && (
              <DatePicker
                selectedDate={selectedDate}
                onSelect={(date) => {
                  setSelectedDate(date)
                }}
                onClose={() => setShowDatePicker(false)}
              />
            )}
          </AnimatePresence>
        </div>

        {/* 已选日期指示器 */}
        {activeCategory === 'date' && selectedDate && !showDatePicker && (
          <div className="px-4 pb-3 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" />
            <span className="text-xs text-gray-600 dark:text-gray-300">
              已选择日期：{selectedDate}
            </span>
            <button
              onClick={() => setShowDatePicker(true)}
              className="text-xs text-primary-500 hover:underline"
            >
              重新选择
            </button>
            <button
              onClick={() => {
                setSelectedDate(null)
              }}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* 搜索结果列表 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        {filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
            <Search className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-sm">
              {activeCategory === 'date' && selectedDate
                ? '该日期没有聊天记录'
                : searchText || activeCategory
                ? '未找到匹配的聊天记录'
                : '输入关键词或选择分类开始搜索'}
            </p>
          </div>
        ) : activeCategory === 'date' ? (
          /* 按日期分组显示 */
          <div className="space-y-4">
            {groupedByDate.map((group) => (
              <div key={group.dateLabel}>
                <div className="sticky top-0 bg-gray-50 dark:bg-gray-900 py-1 mb-2">
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                    {group.dateLabel}
                  </span>
                </div>
                {group.messages.map((msg) => (
                  <SearchResultItem
                    key={msg.id}
                    message={msg}
                    onClick={() => setSelectedMessage(msg)}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          /* 列表显示 */
          <div className="space-y-2">
            {filteredMessages.map((msg) => (
              <SearchResultItem
                key={msg.id}
                message={msg}
                onClick={() => setSelectedMessage(msg)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 消息操作弹窗 */}
      <AnimatePresence>
        {selectedMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedMessage(null)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="card max-w-md w-full mx-4 p-6"
            >
              {/* 消息预览 */}
              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p className="text-xs text-gray-400 mb-1">{formatDate(selectedMessage.timestamp)}</p>
                {selectedMessage.type === 'image' && selectedMessage.fileInfo ? (
                  <img
                    src={selectedMessage.fileInfo.thumbnailUrl || selectedMessage.fileInfo.url}
                    alt="预览"
                    className="max-h-32 rounded"
                  />
                ) : (
                  <p className="text-sm text-gray-800 dark:text-gray-100 break-words">
                    {selectedMessage.content}
                  </p>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={handleForward}
                  className="flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Forward className="w-5 h-5 text-primary-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-300">转发</span>
                </button>
                <button
                  onClick={handleDelete}
                  className="flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Trash2 className="w-5 h-5 text-red-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-300">删除</span>
                </button>
                <button
                  onClick={handleFavorite}
                  className="flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Star className="w-5 h-5 text-yellow-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-300">收藏</span>
                </button>
              </div>

              {/* 跳转到聊天位置 */}
              <button
                onClick={() => handleJumpToMessage(selectedMessage)}
                className="w-full mt-3 py-2 text-sm text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
              >
                跳转到聊天位置 →
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── 子组件：搜索结果项 ─────────────────────────────────────────────────────

function SearchResultItem({
  message,
  onClick,
}: {
  message: Message
  onClick: () => void
}) {
  const isUser = message.role === 'user'

  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
    >
      {/* 发送者标识 */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
          isUser
            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
            : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
        }`}
      >
        {isUser ? '我' : 'TA'}
      </div>

      {/* 消息内容 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs text-gray-400">{formatDate(message.timestamp)}</span>
          {message.type && message.type !== 'text' && (
            <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded">
              {message.type === 'image' ? '图片' : message.type === 'voice' ? '语音' : message.type === 'file' ? '文件' : message.type}
            </span>
          )}
        </div>

        {message.type === 'image' && message.fileInfo ? (
          <div className="flex items-center gap-2">
            <img
              src={message.fileInfo.thumbnailUrl || message.fileInfo.url}
              alt={message.fileInfo.name}
              className="w-12 h-12 rounded object-cover"
            />
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {message.content || message.fileInfo.name}
            </span>
          </div>
        ) : message.type === 'voice' && message.voiceInfo ? (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
              <Mic className="w-4 h-4 text-primary-500" />
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              语音消息 ({message.voiceInfo.duration}s)
            </span>
          </div>
        ) : message.type === 'file' && message.fileInfo ? (
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {message.fileInfo.name}
            </span>
          </div>
        ) : (
          <p className="text-sm text-gray-800 dark:text-gray-100 line-clamp-2 break-words">
            {message.content}
          </p>
        )}
      </div>
    </button>
  )
}
