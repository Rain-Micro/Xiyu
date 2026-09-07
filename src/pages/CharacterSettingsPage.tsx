import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  FileText,
  Tag,
  Search,
  Pin,
  Image as ImageIcon,
  Trash2,
  UserX,
  X,
  Plus,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useCharacterStore, useChatStore, useSettingsStore } from '@/stores'

export default function CharacterSettingsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentCharacter, characters, setCurrentCharacter, updateCharacter, deleteCharacter } =
    useCharacterStore()
  const { clearMessagesDB } = useChatStore()
  const { settings, updateSettings } = useSettingsStore()

  // 从 URL state 读取 characterId
  const state = location.state as { characterId?: string } | null
  const character =
    currentCharacter ||
    (state?.characterId ? characters.find((c) => c.id === state.characterId) : null) ||
    null

  // 标签管理
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>(character?.tags || [])

  // 置顶开关
  const [isPinned, setIsPinned] = useState(character?.isPinned || false)

  // 弹窗状态
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showCloudBackupConfirm, setShowCloudBackupConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showFilePermission, setShowFilePermission] = useState(false)
  const [showPermissionDeniedHint, setShowPermissionDeniedHint] = useState(false)

  // 背景图文件选择
  const bgInputRef = useRef<HTMLInputElement>(null)

  // ─── 标签操作 ────────────────────────────────────────────────────────────

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim()
    if (trimmed && !tags.includes(trimmed)) {
      const newTags = [...tags, trimmed]
      setTags(newTags)
      if (character) {
        updateCharacter({ ...character, tags: newTags })
      }
    }
    setTagInput('')
  }, [tagInput, tags, character, updateCharacter])

  const handleRemoveTag = (tag: string) => {
    const newTags = tags.filter((t) => t !== tag)
    setTags(newTags)
    if (character) {
      updateCharacter({ ...character, tags: newTags })
    }
  }

  // ─── 置顶切换 ────────────────────────────────────────────────────────────

  const handleTogglePin = () => {
    const newPinned = !isPinned
    setIsPinned(newPinned)
    if (character) {
      updateCharacter({ ...character, isPinned: newPinned })
    }
  }

  // ─── 聊天背景设置 ────────────────────────────────────────────────────────

  const handleSetBackground = () => {
    // 已授权则直接打开文件选择
    if (settings?.fileReadPermission) {
      bgInputRef.current?.click()
      return
    }
    // 未授权则弹窗询问
    setShowFilePermission(true)
  }

  const handleAllowFileAccess = () => {
    setShowFilePermission(false)
    // 保存权限状态
    updateSettings({ fileReadPermission: true })
    bgInputRef.current?.click()
  }

  const handleDenyFileAccess = () => {
    setShowFilePermission(false)
    setShowPermissionDeniedHint(true)
  }

  const handleBgSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !character) return

    const reader = new FileReader()
    reader.onload = () => {
      const bg = reader.result as string
      updateCharacter({ ...character, chatBackground: bg })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // ─── 清空聊天记录 ────────────────────────────────────────────────────────

  const handleClearChat = () => {
    setShowClearConfirm(true)
  }

  const confirmClearChat = async () => {
    if (!character) return
    await clearMessagesDB(character.id)
    setShowClearConfirm(false)
    // 预留：云备份检查（当前无云备份，直接跳过）
    // setShowCloudBackupConfirm(true)
  }

  // ─── 删除角色 ────────────────────────────────────────────────────────────

  const handleDeleteCharacter = () => {
    setShowDeleteConfirm(true)
  }

  const confirmDeleteCharacter = async () => {
    if (!character) return
    // 清空聊天记录
    await clearMessagesDB(character.id)
    // 删除角色
    deleteCharacter(character.id)
    setCurrentCharacter(null)
    setShowDeleteConfirm(false)
    navigate('/main')
  }

  // ─── 未选择角色时占位 ────────────────────────────────────────────────────

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

  const displayName = character.profile.background || character.profile.name || '未知角色'

  // 菜单项配置
  const menuItems = [
    {
      icon: FileText,
      label: `${displayName}的档案`,
      desc: '查看和编辑角色档案',
      onClick: () => navigate('/create-character', { state: { characterId: character.id, mode: 'edit' } }),
    },
    {
      icon: Tag,
      label: '添加角色标签',
      desc: '自定义标签，方便在通讯录中搜索',
      onClick: () => {}, // 标签区始终显示在下方
    },
    {
      icon: Search,
      label: '查找聊天记录',
      desc: '搜索和筛选历史聊天记录',
      onClick: () => navigate('/search-chat', { state: { characterId: character.id } }),
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full w-full flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden"
    >
      {/* 顶部导航栏 */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <h2 className="text-lg font-bold text-gray-800 dark:text-white">
          角色设置
        </h2>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-2">
        {/* 1. 角色档案 */}
        {menuItems[0] && (
          <SettingItem
            icon={menuItems[0].icon}
            label={menuItems[0].label}
            desc={menuItems[0].desc}
            onClick={menuItems[0].onClick}
          />
        )}

        {/* 2. 添加角色标签 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="flex items-start gap-3 p-4">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
              <Tag className="w-5 h-5 text-purple-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-white">添加角色标签</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                自定义标签，方便在通讯录中搜索
              </p>

              {/* 标签列表 */}
              <div className="flex flex-wrap gap-2 mt-3">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-md text-xs"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-red-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              {/* 添加标签输入 */}
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  placeholder="输入标签后回车添加"
                  className="flex-1 px-2 py-1 text-sm border border-gray-200 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <button
                  onClick={handleAddTag}
                  className="p-1 rounded-md bg-primary-500 text-white hover:bg-primary-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. 查找聊天记录 */}
        <SettingItem
          icon={menuItems[2].icon}
          label={menuItems[2].label}
          desc={menuItems[2].desc}
          onClick={menuItems[2].onClick}
        />

        {/* 4. 设为置顶 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center gap-3 p-4">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
              <Pin className="w-5 h-5 text-yellow-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-white">设为置顶</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                开启后在通讯录中该角色置顶显示
              </p>
            </div>
            {/* 滑动开关 */}
            <button
              onClick={handleTogglePin}
              className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                isPinned ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  isPinned ? 'translate-x-6' : ''
                }`}
              />
            </button>
          </div>
        </div>

        {/* 5. 设置当前聊天背景 */}
        <SettingItem
          icon={ImageIcon}
          label="设置当前聊天背景"
          desc={character.chatBackground ? '已设置背景图，点击更换' : '选择本地图片设为聊天背景'}
          onClick={handleSetBackground}
        />
        {character.chatBackground && (
          <div className="px-4 space-y-2">
            <div className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <img src={character.chatBackground} alt="聊天背景预览" className="w-full h-24 object-cover" />
              <button
                onClick={() => {
                  if (character) updateCharacter({ ...character, chatBackground: undefined })
                }}
                className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white hover:bg-black/70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => {
                if (character) updateCharacter({ ...character, chatBackground: undefined })
              }}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              恢复默认背景
            </button>
          </div>
        )}

        {/* 6. 清空聊天记录 */}
        <SettingItem
          icon={Trash2}
          label="清空聊天记录"
          desc="清空与该角色的所有聊天记录"
          onClick={handleClearChat}
          danger
        />

        {/* 7. 删除角色 */}
        <SettingItem
          icon={UserX}
          label={`删除${displayName}`}
          desc="删除角色及其所有关联数据，不可撤销"
          onClick={handleDeleteCharacter}
          danger
        />
      </div>

      {/* 隐藏的背景图文件选择 */}
      <input
        ref={bgInputRef}
        type="file"
        accept="image/*"
        onChange={handleBgSelected}
        className="hidden"
      />

      {/* ─── 弹窗区 ────────────────────────────────────────────────────────── */}

      {/* 文件权限询问弹窗 */}
      <AnimatePresence>
        {showFilePermission && (
          <ConfirmModal
            title="提示"
            message="是否允许平台读取本地文件？"
            confirmText="允许"
            cancelText="拒绝"
            onConfirm={handleAllowFileAccess}
            onCancel={handleDenyFileAccess}
          />
        )}
      </AnimatePresence>

      {/* 权限拒绝提示弹窗 */}
      <AnimatePresence>
        {showPermissionDeniedHint && (
          <ConfirmModal
            title="提示"
            message="后续可在用户偏好设置中更改"
            confirmText="知道了"
            onConfirm={() => setShowPermissionDeniedHint(false)}
          />
        )}
      </AnimatePresence>

      {/* 清空聊天记录确认弹窗 */}
      <AnimatePresence>
        {showClearConfirm && (
          <ConfirmModal
            title="清空聊天记录"
            message="确定要清空所有聊天记录吗？"
            confirmText="确定清空"
            cancelText="取消"
            danger
            onConfirm={confirmClearChat}
            onCancel={() => setShowClearConfirm(false)}
          />
        )}
      </AnimatePresence>

      {/* 云备份删除询问弹窗（预留） */}
      <AnimatePresence>
        {showCloudBackupConfirm && (
          <ConfirmModal
            title="云备份"
            message="检测到有云备份内容，是否一并删除云备份内容？"
            confirmText="一并删除"
            cancelText="仅删除本地"
            onConfirm={() => {
              setShowCloudBackupConfirm(false)
            }}
            onCancel={() => {
              setShowCloudBackupConfirm(false)
            }}
          />
        )}
      </AnimatePresence>

      {/* 删除角色确认弹窗 */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <ConfirmModal
            title="删除角色"
            message={`确认删除${displayName}吗？删除后有关${displayName}的内容都会被清除`}
            confirmText="确认删除"
            cancelText="取消"
            danger
            onConfirm={confirmDeleteCharacter}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── 子组件：设置项 ─────────────────────────────────────────────────────────

function SettingItem({
  icon: Icon,
  label,
  desc,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  desc: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
    >
      <div className="flex items-center gap-3 p-4">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            danger
              ? 'bg-red-100 dark:bg-red-900/30'
              : 'bg-primary-100 dark:bg-primary-900/30'
          }`}
        >
          <Icon className={`w-5 h-5 ${danger ? 'text-red-500' : 'text-primary-500'}`} />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className={`text-sm font-medium ${danger ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-white'}`}>
            {label}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{desc}</p>
        </div>
      </div>
    </button>
  )
}

// ─── 子组件：确认弹窗 ───────────────────────────────────────────────────────

function ConfirmModal({
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  danger,
}: {
  title: string
  message: string
  confirmText: string
  cancelText?: string
  onConfirm: () => void
  onCancel?: () => void
  danger?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel || onConfirm}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}
        className="card max-w-md w-full mx-4 p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          {danger && (
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
          )}
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">{title}</h3>
        </div>
        <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm leading-relaxed">
          {message}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className={`flex-1 py-2 rounded-lg transition-colors ${
              danger
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-primary-500 text-white hover:bg-primary-600'
            }`}
          >
            {confirmText}
          </button>
          {cancelText && onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              {cancelText}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
