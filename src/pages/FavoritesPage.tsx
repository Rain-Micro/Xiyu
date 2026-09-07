import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Search,
  Star,
  Pin,
  Trash2,
  Copy,
  FileText,
  Image as ImageIcon,
  Link,
  Mic,
  CheckSquare,
  Square,
  Send,
  X,
  ZoomIn,
  Play,
  Pause,
  Users,
  Download,
} from 'lucide-react'
import { useFavoritesStore, useUIStore, useCharacterStore, useAuthStore } from '@/stores'
import { formatDate } from '@/utils/dateFormat'
import type { Favorite, Character } from '@/types'

const TYPE_FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'text', label: '文字' },
  { id: 'image', label: '图片' },
  { id: 'file', label: '文件' },
  { id: 'voice', label: '语音' },
  { id: 'link', label: '链接' },
]

function getTypeIcon(type: Favorite['type']) {
  switch (type) {
    case 'image': return <ImageIcon className="w-4 h-4 text-blue-400" />
    case 'file': return <FileText className="w-4 h-4 text-amber-400" />
    case 'voice': return <Mic className="w-4 h-4 text-purple-400" />
    case 'link': return <Link className="w-4 h-4 text-green-400" />
    default: return <Star className="w-4 h-4 text-yellow-400" />
  }
}

function getTypeLabel(type: Favorite['type']) {
  const labels: Record<string, string> = {
    text: '文字', image: '图片', file: '文件', voice: '语音', link: '链接',
  }
  return labels[type] || '文字'
}

function getAvatarColor(name: string): string {
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

export default function FavoritesPage() {
  const navigate = useNavigate()
  const { favorites, loadFavorites, deleteFavorite, togglePin, batchDelete } = useFavoritesStore()
  const { addNotification } = useUIStore()
  const { characters, loadCharacters } = useCharacterStore()
  const { user } = useAuthStore()
  const [searchKeyword, setSearchKeyword] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false)

  // 图片预览状态
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null)
  const [previewZoom, setPreviewZoom] = useState(1)

  // 语音播放状态
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 通讯录选择弹窗（转发用）
  const [showContactPicker, setShowContactPicker] = useState(false)
  const [contactSearch, setContactSearch] = useState('')
  // 多选模式：选中的角色ID集合
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set())
  // 单角色转发后的跳转询问弹窗
  const [showJumpConfirm, setShowJumpConfirm] = useState(false)
  const [jumpTargetChar, setJumpTargetChar] = useState<Character | null>(null)

  useEffect(() => {
    loadFavorites()
    if (user?.id) {
      loadCharacters(user.id)
    }
  }, [loadFavorites, loadCharacters, user?.id])

  // 清理音频资源
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  // 筛选 + 搜索
  let displayList = favorites
  if (activeFilter !== 'all') {
    displayList = displayList.filter((f) => f.type === activeFilter)
  }
  if (searchKeyword.trim()) {
    const lower = searchKeyword.toLowerCase()
    displayList = displayList.filter(
      (f) => f.content.toLowerCase().includes(lower) || f.sourceRole.toLowerCase().includes(lower)
    )
  }

  const handleCopy = (fav: Favorite) => {
    navigator.clipboard.writeText(fav.content).then(() => {
      addNotification({
        id: `copy-${Date.now()}`,
        type: 'success',
        title: '复制成功',
        message: '内容已复制到剪贴板',
        timestamp: Date.now(),
        read: false,
        duration: 2000,
      })
    })
  }

  // 语音复制：将语音文件 URL 复制到剪贴板
  const handleVoiceCopy = (fav: Favorite) => {
    const voiceUrl = fav.voiceInfo?.url || fav.content
    navigator.clipboard.writeText(voiceUrl).then(() => {
      addNotification({
        id: `voice-copy-${Date.now()}`,
        type: 'success',
        title: '复制成功',
        message: '语音文件链接已复制到剪贴板',
        timestamp: Date.now(),
        read: false,
        duration: 2000,
      })
    }).catch(() => {
      addNotification({
        id: `voice-copy-err-${Date.now()}`,
        type: 'error',
        title: '复制失败',
        message: '无法复制到剪贴板',
        timestamp: Date.now(),
        read: false,
        duration: 2000,
      })
    })
  }

  const handleDelete = async (id: string) => {
    await deleteFavorite(id)
    addNotification({
      id: `del-${Date.now()}`,
      type: 'success',
      title: '删除成功',
      message: '收藏已删除',
      timestamp: Date.now(),
      read: false,
      duration: 2000,
    })
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 取消全选
  const handleDeselectAll = () => {
    setSelectedIds(new Set())
  }

  // 全选
  const handleSelectAll = () => {
    setSelectedIds(new Set(displayList.map((f) => f.id)))
  }

  const handleBatchDelete = async () => {
    await batchDelete(Array.from(selectedIds))
    setSelectedIds(new Set())
    setBatchMode(false)
    setShowBatchDeleteConfirm(false)
    addNotification({
      id: `batch-del-${Date.now()}`,
      type: 'success',
      title: '批量删除成功',
      message: `已删除 ${selectedIds.size} 条收藏`,
      timestamp: Date.now(),
      read: false,
      duration: 2000,
    })
  }

  // 转发：打开通讯录选择列表（多选模式）
  const handleForward = () => {
    const selectedFavorites = favorites.filter((f) => selectedIds.has(f.id))
    if (selectedFavorites.length === 0) return
    setSelectedContactIds(new Set())
    setShowContactPicker(true)
  }

  // 切换通讯录角色选中状态
  const toggleContactSelect = (charId: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev)
      if (next.has(charId)) next.delete(charId)
      else next.add(charId)
      return next
    })
  }

  // 确认转发：将收藏内容发送给所有选中角色
  const handleConfirmForward = () => {
    const selectedFavorites = favorites.filter((f) => selectedIds.has(f.id))
    if (selectedFavorites.length === 0 || selectedContactIds.size === 0) return

    const targetChars = characters.filter((c) => selectedContactIds.has(c.id))
    const charNames = targetChars.map((c) => c.profile.background || c.profile.name)

    // 为每个目标角色存储待转发内容
    for (const char of targetChars) {
      sessionStorage.setItem(`pending_forward_favorites_${char.id}`, JSON.stringify({
        targetCharacterId: char.id,
        favorites: selectedFavorites,
      }))
    }

    if (targetChars.length === 1) {
      // 单角色转发：弹出跳转询问
      setJumpTargetChar(targetChars[0])
      setShowContactPicker(false)
      setSelectedIds(new Set())
      setBatchMode(false)
      setShowJumpConfirm(true)
    } else {
      // 批量转发：不询问，直接提示
      addNotification({
        id: `forward-${Date.now()}`,
        type: 'success',
        title: '转发成功',
        message: `已转发给 ${charNames.join('、')}`,
        timestamp: Date.now(),
        read: false,
        duration: 3000,
      })
      setSelectedIds(new Set())
      setBatchMode(false)
      setShowContactPicker(false)
    }
  }

  // 跳转到目标角色聊天页面
  const handleJumpToChat = () => {
    setShowJumpConfirm(false)
    if (jumpTargetChar) {
      const charName = jumpTargetChar.profile.background || jumpTargetChar.profile.name
      addNotification({
        id: `forward-${Date.now()}`,
        type: 'success',
        title: '转发成功',
        message: `已转发给 ${charName}`,
        timestamp: Date.now(),
        read: false,
        duration: 2000,
      })
      navigate(`/chat`, { state: { characterId: jumpTargetChar.id } })
      setJumpTargetChar(null)
    }
  }

  // 不跳转，留在收藏页面
  const handleStayOnPage = () => {
    setShowJumpConfirm(false)
    if (jumpTargetChar) {
      const charName = jumpTargetChar.profile.background || jumpTargetChar.profile.name
      addNotification({
        id: `forward-${Date.now()}`,
        type: 'success',
        title: '转发成功',
        message: `已转发给 ${charName}`,
        timestamp: Date.now(),
        read: false,
        duration: 2000,
      })
      setJumpTargetChar(null)
    }
  }

  // ── 收藏内容打开处理 ──────────────────────────────────────────────

  // 图片：点击后弹出预览窗口
  const handleImageClick = (fav: Favorite) => {
    const imageUrl = fav.fileInfo?.url || fav.fileInfo?.thumbnailUrl || fav.content
    setPreviewImage({ url: imageUrl, name: fav.fileInfo?.name || '图片' })
    setPreviewZoom(1)
  }

  // 文件：点击后使用系统默认应用打开（仅下载，不弹额外窗口）
  const handleFileClick = (fav: Favorite) => {
    const fileUrl = fav.fileInfo?.url || fav.content
    if (fileUrl) {
      // 使用 <a> 标签 download 属性，仅触发下载/打开，不弹出新窗口
      const link = document.createElement('a')
      link.href = fileUrl
      link.download = fav.fileInfo?.name || 'file'
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } else {
      addNotification({
        id: `file-open-${Date.now()}`,
        type: 'error',
        title: '打开失败',
        message: '文件链接不存在',
        timestamp: Date.now(),
        read: false,
        duration: 2000,
      })
    }
  }

  // 语音：点击后播放/暂停（内嵌播放器，不弹窗）
  const handleVoiceClick = (fav: Favorite) => {
    const voiceUrl = fav.voiceInfo?.url || fav.content
    if (!voiceUrl) {
      addNotification({
        id: `voice-play-${Date.now()}`,
        type: 'error',
        title: '播放失败',
        message: '语音链接不存在',
        timestamp: Date.now(),
        read: false,
        duration: 2000,
      })
      return
    }

    // 如果正在播放同一个语音，则暂停
    if (playingVoiceId === fav.id && audioRef.current) {
      audioRef.current.pause()
      setPlayingVoiceId(null)
      return
    }

    // 停止之前的播放
    if (audioRef.current) {
      audioRef.current.pause()
    }

    // 创建新的音频播放
    const audio = new Audio(voiceUrl)
    let errorNotified = false // 防止 onerror 和 catch 同时触发两次提示

    audio.onended = () => setPlayingVoiceId(null)
    audio.onerror = () => {
      if (errorNotified) return
      errorNotified = true
      setPlayingVoiceId(null)
      addNotification({
        id: `voice-err-${Date.now()}`,
        type: 'error',
        title: '播放失败',
        message: '语音文件格式不兼容，请尝试重新录制',
        timestamp: Date.now(),
        read: false,
        duration: 2000,
      })
    }
    audio.play().catch(() => {
      if (errorNotified) return
      errorNotified = true
      setPlayingVoiceId(null)
      addNotification({
        id: `voice-play-err-${Date.now()}`,
        type: 'error',
        title: '播放失败',
        message: '语音文件格式不兼容，请尝试重新录制',
        timestamp: Date.now(),
        read: false,
        duration: 2000,
      })
    })
    audioRef.current = audio
    setPlayingVoiceId(fav.id)
  }

  // 下载图片或语音到本地
  const handleDownload = (fav: Favorite) => {
    let url: string | undefined
    let fileName: string

    if (fav.type === 'image') {
      url = fav.fileInfo?.url || fav.fileInfo?.thumbnailUrl || fav.content
      fileName = fav.fileInfo?.name || `image_${fav.id}.png`
    } else if (fav.type === 'voice') {
      url = fav.voiceInfo?.url || fav.content
      // 兼容 .mp3 和 .webm 格式
      const ext = url && url.startsWith('data:audio/webm') ? 'webm' : 'mp3'
      fileName = `voice_${fav.id}.${ext}`
    } else {
      return
    }

    if (!url) {
      addNotification({
        id: `download-err-${Date.now()}`,
        type: 'error',
        title: '下载失败',
        message: '文件链接不存在',
        timestamp: Date.now(),
        read: false,
        duration: 2000,
      })
      return
    }

    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    addNotification({
      id: `download-${Date.now()}`,
      type: 'success',
      title: '下载成功',
      message: `${fileName} 已开始下载`,
      timestamp: Date.now(),
      read: false,
      duration: 2000,
    })
  }

  // 处理收藏项点击（非批量模式下）
  const handleFavClick = (fav: Favorite) => {
    if (batchMode) return
    switch (fav.type) {
      case 'image':
        handleImageClick(fav)
        break
      case 'file':
        handleFileClick(fav)
        break
      case 'voice':
        handleVoiceClick(fav)
        break
      case 'link':
        window.open(fav.content, '_blank')
        break
      default:
        break
    }
  }

  // 通讯录筛选
  const filteredCharacters = characters.filter((c) => {
    const name = c.profile.background || c.profile.name
    if (!contactSearch.trim()) return true
    return name.toLowerCase().includes(contactSearch.toLowerCase())
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full w-full flex flex-col bg-gray-50 dark:bg-gray-900"
    >
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="返回"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
        <h1 className="text-lg font-bold text-gray-800 dark:text-white">收藏设置</h1>
        <button
          onClick={() => {
            setBatchMode(!batchMode)
            setSelectedIds(new Set())
          }}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            batchMode
              ? 'bg-primary-500 text-white'
              : 'text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20'
          }`}
        >
          {batchMode ? '完成' : '批量管理'}
        </button>
      </div>

      {/* 搜索框 */}
      <div className="px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜索收藏内容..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </div>
      </div>

      {/* 分类筛选 */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-thin">
        {TYPE_FILTERS.map((filter) => (
          <button
            key={filter.id}
            onClick={() => setActiveFilter(filter.id)}
            className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
              activeFilter === filter.id
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* 批量操作栏 */}
      {batchMode && selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-primary-50 dark:bg-primary-900/20 border-b border-primary-200 dark:border-primary-700">
          <span className="text-sm text-primary-700 dark:text-primary-300">
            已选择 {selectedIds.size} 项
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAll}
              className="text-xs text-primary-500 hover:underline"
            >
              全选
            </button>
            <button
              onClick={handleDeselectAll}
              className="text-xs text-gray-500 hover:underline"
            >
              取消全选
            </button>
            <button
              onClick={handleForward}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Send className="w-3 h-3" />
              转发
            </button>
            <button
              onClick={() => setShowBatchDeleteConfirm(true)}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              批量删除
            </button>
          </div>
        </div>
      )}

      {/* 收藏列表 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
        {displayList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Star className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-sm">暂无收藏内容</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl mx-auto">
            {displayList.map((fav) => (
              <div
                key={fav.id}
                onClick={() => handleFavClick(fav)}
                className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 transition-all ${
                  !batchMode && (fav.type === 'image' || fav.type === 'file' || fav.type === 'voice' || fav.type === 'link')
                    ? 'cursor-pointer hover:shadow-md hover:border-primary-200 dark:hover:border-primary-700'
                    : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* 批量选择复选框 */}
                  {batchMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleSelect(fav.id)
                      }}
                      className="mt-1 flex-shrink-0"
                    >
                      {selectedIds.has(fav.id) ? (
                        <CheckSquare className="w-5 h-5 text-primary-500" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-300" />
                      )}
                    </button>
                  )}

                  {/* 类型图标 */}
                  <div className="flex-shrink-0 mt-0.5">
                    {getTypeIcon(fav.type)}
                  </div>

                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    {/* 图片缩略图 */}
                    {fav.type === 'image' && fav.fileInfo?.thumbnailUrl && (
                      <div className="relative mb-2 group">
                        <img
                          src={fav.fileInfo.thumbnailUrl}
                          alt={fav.fileInfo.name}
                          className="w-20 h-20 object-cover rounded-lg"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-lg flex items-center justify-center transition-all">
                          <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    )}
                    {/* 语音播放指示 */}
                    {fav.type === 'voice' && (
                      <div className="flex items-center gap-2 mb-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleVoiceClick(fav)
                          }}
                          className="flex items-center gap-1 px-2 py-1 bg-purple-50 dark:bg-purple-900/20 rounded-md text-purple-500 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                        >
                          {playingVoiceId === fav.id ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                          <span className="text-xs">
                            {playingVoiceId === fav.id ? '暂停' : '播放'}
                          </span>
                          {fav.voiceInfo?.duration && (
                            <span className="text-[10px] text-gray-400">
                              {Math.floor(fav.voiceInfo.duration / 60)}:
                              {(fav.voiceInfo.duration % 60).toString().padStart(2, '0')}
                            </span>
                          )}
                        </button>
                        {/* 语音复制按钮 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleVoiceCopy(fav)
                          }}
                          className="flex items-center gap-1 px-2 py-1 bg-gray-50 dark:bg-gray-700 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                          title="复制语音链接"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {/* 语音下载按钮 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDownload(fav)
                          }}
                          className="flex items-center gap-1 px-2 py-1 bg-gray-50 dark:bg-gray-700 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                          title="下载语音"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <p className="text-sm text-gray-700 dark:text-gray-200 break-words line-clamp-3">
                      {fav.content}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      {fav.isPinned && (
                        <Pin className="w-3 h-3 text-primary-500 fill-current" />
                      )}
                      <span className="text-xs text-gray-400">
                        {getTypeLabel(fav.type)} · 来自 {fav.sourceRole}
                      </span>
                      <span className="text-xs text-gray-400">
                        · {formatDate(fav.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* 操作按钮（非批量模式） */}
                  {!batchMode && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {(fav.type === 'image' || fav.type === 'voice') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDownload(fav)
                          }}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title="下载"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          togglePin(fav.id)
                        }}
                        className={`p-1.5 rounded-lg transition-colors ${
                          fav.isPinned
                            ? 'text-primary-500 bg-primary-50 dark:bg-primary-900/20'
                            : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                        title={fav.isPinned ? '取消置顶' : '置顶'}
                      >
                        <Pin className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCopy(fav)
                        }}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        title="复制"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(fav.id)
                        }}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 图片预览弹窗 */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center"
            onClick={() => setPreviewImage(null)}
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
            >
              <X className="w-6 h-6 text-white" />
            </button>
            {/* 缩放控制 */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setPreviewZoom((z) => Math.max(0.5, z - 0.25))
                }}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
              >
                -
              </button>
              <span className="text-white text-sm w-12 text-center">
                {Math.round(previewZoom * 100)}%
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setPreviewZoom((z) => Math.min(3, z + 0.25))
                }}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
              >
                +
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setPreviewZoom(1)
                }}
                className="px-3 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs flex items-center justify-center transition-colors"
              >
                重置
              </button>
            </div>
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: previewZoom }}
              src={previewImage.url}
              alt={previewImage.name}
              className="max-w-[90vw] max-h-[85vh] object-contain"
              onClick={(e) => e.stopPropagation()}
              draggable={false}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 通讯录选择弹窗（转发用，多选） */}
      <AnimatePresence>
        {showContactPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowContactPicker(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col"
            >
              {/* 头部 */}
              <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary-500" />
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    选择转发目标（可多选）
                  </h3>
                </div>
                <button
                  onClick={() => setShowContactPicker(false)}
                  className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* 搜索框 */}
              <div className="p-3 border-b border-gray-100 dark:border-gray-700">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    placeholder="搜索角色..."
                    className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
                  />
                </div>
              </div>

              {/* 角色列表（多选） */}
              <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
                {filteredCharacters.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                    <Users className="w-10 h-10 mb-2 opacity-40" />
                    <p className="text-xs">暂无联系人</p>
                  </div>
                ) : (
                  filteredCharacters.map((character) => {
                    const name = character.profile.background || character.profile.name
                    const isSelected = selectedContactIds.has(character.id)
                    return (
                      <button
                        key={character.id}
                        onClick={() => toggleContactSelect(character.id)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-lg transition-colors text-left ${
                          isSelected
                            ? 'bg-primary-50 dark:bg-primary-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        {/* 复选框 */}
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-primary-500 flex-shrink-0" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-300 flex-shrink-0" />
                        )}
                        {/* 头像 */}
                        {character.profile.avatar ? (
                          <img
                            src={character.profile.avatar}
                            alt={name}
                            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0"
                            style={{ backgroundColor: getAvatarColor(name) }}
                          >
                            {name.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                            {name}
                          </p>
                          {character.profile.personality && character.profile.personality.length > 0 && (
                            <p className="text-xs text-gray-400 truncate">
                              {character.profile.personality.join('、')}
                            </p>
                          )}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>

              {/* 底部操作栏 */}
              <div className="flex items-center justify-between p-3 border-t border-gray-100 dark:border-gray-700">
                <span className="text-xs text-gray-400">
                  已选择 {selectedContactIds.size} 个角色
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowContactPicker(false)}
                    className="px-4 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleConfirmForward}
                    disabled={selectedContactIds.size === 0}
                    className="flex items-center gap-1 px-4 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    确认转发
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 单角色转发后的跳转询问弹窗 */}
      {showJumpConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[210] p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="card max-w-sm w-full"
          >
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">转发成功</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              是否跳转至聊天界面？
            </p>
            <div className="flex gap-3">
              <button onClick={handleJumpToChat} className="btn-primary flex-1">
                是
              </button>
              <button onClick={handleStayOnPage} className="btn-secondary flex-1">
                否
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 批量删除确认 */}
      {showBatchDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="card max-w-sm w-full"
          >
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">确认批量删除？</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              确定要删除选中的 {selectedIds.size} 条收藏吗？此操作不可恢复。
            </p>
            <div className="flex gap-3">
              <button onClick={handleBatchDelete} className="btn-primary bg-red-500 hover:bg-red-600 flex-1">
                确认删除
              </button>
              <button onClick={() => setShowBatchDeleteConfirm(false)} className="btn-secondary flex-1">
                取消
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}
