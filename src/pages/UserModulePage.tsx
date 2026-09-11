import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, User, Star, Settings, Bot, X, Check, Pencil } from 'lucide-react'
import { useCharacterStore, useAuthStore, useSettingsStore } from '@/stores'
import { getAssistantSeed } from '@/services/assistantData'
import AssistantProfileEditor from '@/components/AssistantProfileEditor'
import type { Character } from '@/types'

export default function UserModulePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { characters, loadCharacters } = useCharacterStore()
  const { settings, updateSettings } = useSettingsStore()
  const [showAssistantMgmt, setShowAssistantMgmt] = useState(false)
  const [editTarget, setEditTarget] = useState<Character | null>(null)

  useEffect(() => {
    if (user?.id) {
      loadCharacters(user.id)
    }
  }, [user?.id, loadCharacters])

  const assistants = characters.filter((c) => c.isAssistant)

  const entries = [
    {
      id: 'profile',
      title: '个人信息',
      description: '查看和编辑你的个人资料',
      icon: User,
      color: 'from-blue-400 to-blue-500',
      onClick: () => navigate('/profile', { state: { from: 'user-module' } }),
    },
    {
      id: 'assistants',
      title: '助手管理',
      description: '管理你的AI助手档案',
      icon: Bot,
      color: 'from-teal-400 to-cyan-500',
      onClick: () => setShowAssistantMgmt(true),
    },
    {
      id: 'favorites',
      title: '收藏设置',
      description: '管理你的收藏内容',
      icon: Star,
      color: 'from-yellow-400 to-orange-400',
      onClick: () => navigate('/user-module/favorites'),
    },
    {
      id: 'preferences',
      title: '用户偏好设置',
      description: '应用行为、消息透明度等偏好',
      icon: Settings,
      color: 'from-purple-400 to-pink-400',
      onClick: () => navigate('/user-module/preferences'),
    },
  ]

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
        <h1 className="text-lg font-bold text-gray-800 dark:text-white">用户模块</h1>
        <div className="w-9" />
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-3 max-w-md mx-auto w-full">
        {entries.map((entry, index) => (
          <motion.button
            key={entry.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={entry.onClick}
            data-guide={entry.id === 'favorites' ? 'favorites-entry' : entry.id === 'preferences' ? 'preferences-entry' : undefined}
            className="w-full flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-primary-200 dark:hover:border-primary-700 transition-all text-left"
          >
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${entry.color} flex items-center justify-center flex-shrink-0`}>
              <entry.icon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-gray-800 dark:text-white">
                {entry.title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {entry.description}
              </p>
            </div>
          </motion.button>
        ))}
      </div>

      {/* 助手管理弹窗 */}
      <AnimatePresence>
        {showAssistantMgmt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setShowAssistantMgmt(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              {/* 头部 */}
              <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-800 dark:text-white">助手管理</h2>
                <button
                  onClick={() => setShowAssistantMgmt(false)}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* 助手列表 */}
              <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
                {assistants.map((assistant) => {
                  const seed = assistant.assistantId ? getAssistantSeed(assistant.assistantId) : undefined
                  const displayCharName = assistant.assistantEditable?.userNote || assistant.profile.name
                  const isCurrent = settings?.defaultAssistantId === assistant.assistantId
                  return (
                    <div
                      key={assistant.id}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left border ${
                        isCurrent
                          ? 'border-primary-300 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-700'
                          : 'border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-xl ${seed ? `bg-gradient-to-br ${seed.avatarColor}` : 'bg-gradient-to-br from-primary-400 to-purple-500'} flex items-center justify-center text-white font-bold text-lg flex-shrink-0`}>
                        {displayCharName.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-gray-800 dark:text-white">
                            {assistant.profile.name}
                          </h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                            AI助手
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5" />
                              当前
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                          {seed?.intro || assistant.profile.personality?.[0] || ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!isCurrent && assistant.assistantId && (
                          <button
                            onClick={() => {
                              updateSettings({ defaultAssistantId: assistant.assistantId })
                            }}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors whitespace-nowrap"
                          >
                            设为当前
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditTarget(assistant)
                            setShowAssistantMgmt(false)
                          }}
                          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                          title="编辑档案"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 助手档案编辑弹窗 */}
      <AnimatePresence>
        {editTarget && (
          <AssistantProfileEditor
            character={editTarget}
            onClose={() => setEditTarget(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
