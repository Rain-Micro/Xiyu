import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, Star, FileText, Image as ImageIcon, Link, Mic } from 'lucide-react'
import { useFavoritesStore } from '@/stores'
import type { Favorite } from '@/types'

interface FavoritesPanelProps {
  visible: boolean
  onClose: () => void
  onSelect: (favorite: Favorite) => void
}

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
    case 'image':
      return <ImageIcon className="w-4 h-4 text-blue-400" />
    case 'file':
      return <FileText className="w-4 h-4 text-amber-400" />
    case 'voice':
      return <Mic className="w-4 h-4 text-purple-400" />
    case 'link':
      return <Link className="w-4 h-4 text-green-400" />
    default:
      return <Star className="w-4 h-4 text-yellow-400" />
  }
}

export default function FavoritesPanel({ visible, onClose, onSelect }: FavoritesPanelProps) {
  const { favorites, loadFavorites } = useFavoritesStore()
  const [searchKeyword, setSearchKeyword] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')

  useEffect(() => {
    if (visible) {
      loadFavorites()
    }
  }, [visible, loadFavorites])

  // 筛选 + 搜索
  let displayList = favorites
  if (activeFilter !== 'all') {
    displayList = displayList.filter((f) => f.type === activeFilter)
  }
  if (searchKeyword.trim()) {
    const lower = searchKeyword.toLowerCase()
    displayList = displayList.filter(
      (f) =>
        f.content.toLowerCase().includes(lower) ||
        f.sourceRole.toLowerCase().includes(lower)
    )
  }

  const handleSelect = (favorite: Favorite) => {
    onSelect(favorite)
    onClose()
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 max-h-96 flex flex-col z-30"
        >
          {/* 顶部标题栏 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <h3 className="text-sm font-bold text-gray-800 dark:text-white">我的收藏</h3>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* 搜索框 */}
          <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜索收藏内容..."
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
              />
            </div>
          </div>

          {/* 分类筛选 */}
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-100 dark:border-gray-700 overflow-x-auto scrollbar-thin">
            {TYPE_FILTERS.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
                className={`px-2.5 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
                  activeFilter === filter.id
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* 收藏列表 */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-2">
            {displayList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <Star className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">暂无收藏内容</p>
              </div>
            ) : (
              displayList.map((fav) => (
                <button
                  key={fav.id}
                  onClick={() => handleSelect(fav)}
                  className="w-full flex items-start gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                >
                  <div className="flex-shrink-0 mt-0.5">{getTypeIcon(fav.type)}</div>
                  <div className="flex-1 min-w-0">
                    {/* 图片预览 */}
                    {fav.type === 'image' && fav.fileInfo?.thumbnailUrl && (
                      <img
                        src={fav.fileInfo.thumbnailUrl}
                        alt={fav.fileInfo.name}
                        className="w-16 h-16 object-cover rounded mb-1"
                      />
                    )}
                    <p className="text-sm text-gray-700 dark:text-gray-200 line-clamp-2 break-words">
                      {fav.content}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {fav.isPinned && (
                        <Star className="w-3 h-3 text-yellow-400 fill-current" />
                      )}
                      <span className="text-xs text-gray-400">
                        来自 {fav.sourceRole}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
