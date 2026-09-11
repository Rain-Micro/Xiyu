import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Copy,
  Edit2,
  Trash2,
  Undo2,
  Forward,
  Star,
  RefreshCw,
} from 'lucide-react'
import type { Message } from '@/types'

export interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  message: Message | null
}

interface MessageContextMenuProps {
  state: ContextMenuState
  onClose: () => void
  onCopy: (message: Message) => void
  onEdit: (message: Message) => void
  onDelete: (message: Message) => void
  onWithdraw: (message: Message) => void
  onForward: (message: Message) => void
  onFavorite: (message: Message) => void
  onRegenerate: (message: Message) => void
}

export default function MessageContextMenu({
  state,
  onClose,
  onCopy,
  onEdit,
  onDelete,
  onWithdraw,
  onForward,
  onFavorite,
  onRegenerate,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭
  useEffect(() => {
    if (!state.visible) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // 延迟添加，避免触发当前右键事件
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleEsc)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [state.visible, onClose])

  if (!state.visible || !state.message) return null

  const message = state.message
  const isUser = message.role === 'user'

  // 边界检测：确保菜单不超出视口
  const menuWidth = 180
  const menuHeight = isUser ? 260 : 230
  const adjustedX = Math.min(state.x, window.innerWidth - menuWidth - 10)
  const adjustedY = Math.min(state.y, window.innerHeight - menuHeight - 10)

  const handleAction = (action: () => void) => {
    action()
    onClose()
  }

  const menuItemClass =
    'flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors'

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      style={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        zIndex: 9999,
      }}
      className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[180px] overflow-hidden"
    >
      {/* 复制 */}
      <button className={menuItemClass} onClick={() => handleAction(() => onCopy(message))}>
        <Copy className="w-4 h-4 text-gray-400" />
        复制
      </button>

      <div className="h-px bg-gray-100 dark:bg-gray-700 mx-2" />

      {/* 自己的消息：修改、删除、撤回、转发 */}
      {isUser ? (
        <>
          <button className={menuItemClass} onClick={() => handleAction(() => onEdit(message))}>
            <Edit2 className="w-4 h-4 text-gray-400" />
            修改
          </button>
          <button className={menuItemClass} onClick={() => handleAction(() => onDelete(message))}>
            <Trash2 className="w-4 h-4 text-red-400" />
            <span className="text-red-500">删除</span>
          </button>
          <button className={menuItemClass} onClick={() => handleAction(() => onWithdraw(message))}>
            <Undo2 className="w-4 h-4 text-gray-400" />
            撤回
          </button>

          <div className="h-px bg-gray-100 dark:bg-gray-700 mx-2" />

          <button className={menuItemClass} onClick={() => handleAction(() => onForward(message))}>
            <Forward className="w-4 h-4 text-gray-400" />
            转发
          </button>
        </>
      ) : (
        <>
          {/* 对方的消息：转发、让对方重新回复、删除 */}
          <button className={menuItemClass} onClick={() => handleAction(() => onForward(message))}>
            <Forward className="w-4 h-4 text-gray-400" />
            转发
          </button>
          <button className={menuItemClass} onClick={() => handleAction(() => onRegenerate(message))}>
            <RefreshCw className="w-4 h-4 text-gray-400" />
            让对方重新回复
          </button>
          <button className={menuItemClass} onClick={() => handleAction(() => onDelete(message))}>
            <Trash2 className="w-4 h-4 text-red-400" />
            <span className="text-red-500">删除</span>
          </button>
        </>
      )}

      <div className="h-px bg-gray-100 dark:bg-gray-700 mx-2" />

      {/* 收藏（两种消息都有） */}
      <button className={menuItemClass} onClick={() => handleAction(() => onFavorite(message))}>
        <Star className="w-4 h-4 text-gray-400" />
        收藏
      </button>
    </motion.div>
  )
}
