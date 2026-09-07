import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Heart } from 'lucide-react'
import { ASSISTANT_SEEDS } from '@/services/assistantData'

interface AssistantSelectionPopupProps {
  onSelect: (assistantId: string) => void
}

export default function AssistantSelectionPopup({ onSelect }: AssistantSelectionPopupProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const handleConfirm = () => {
    if (selectedId) {
      onSelect(selectedId)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* 头部 */}
        <div className="text-center pt-8 pb-4 px-6 flex-shrink-0">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-primary-400 to-purple-500 mb-4 shadow-lg"
          >
            <Heart className="w-7 h-7 text-white" fill="white" />
          </motion.div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
            选择你的第一位伙伴
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            五位AI助手期待与你相遇，选择一位开启你的旅程
          </p>
        </div>

        {/* 助手卡片网格 */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ASSISTANT_SEEDS.map((seed, index) => (
              <motion.button
                key={seed.assistantId}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.08 }}
                onClick={() => setSelectedId(seed.assistantId)}
                onMouseEnter={() => setHoveredId(seed.assistantId)}
                onMouseLeave={() => setHoveredId(null)}
                className={`relative p-5 rounded-2xl border-2 transition-all text-left overflow-hidden ${
                  selectedId === seed.assistantId
                    ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20 shadow-lg scale-[1.02]'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-md'
                }`}
              >
                {/* 选中标记 */}
                <AnimatePresence>
                  {selectedId === seed.assistantId && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center shadow-md"
                    >
                      <Check className="w-4 h-4 text-white" strokeWidth={3} />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 头像 */}
                <div
                  className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${seed.avatarColor} flex items-center justify-center text-white text-2xl font-bold shadow-md mb-3 transition-transform ${
                    hoveredId === seed.assistantId ? 'scale-110' : 'scale-100'
                  }`}
                >
                  {seed.name}
                </div>

                {/* 名字和简介 */}
                <h3 className="font-bold text-gray-800 dark:text-white text-lg mb-1">
                  {seed.name}
                </h3>
                <div className="flex flex-wrap gap-1 mb-2">
                  {seed.personality.slice(0, 3).map((p) => (
                    <span
                      key={p}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300"
                    >
                      {p}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">
                  {seed.intro}
                </p>
              </motion.button>
            ))}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={handleConfirm}
            disabled={!selectedId}
            className={`w-full py-3 rounded-xl font-medium text-base transition-all ${
              selectedId
                ? 'bg-gradient-to-r from-primary-500 to-purple-500 text-white hover:shadow-lg hover:scale-[1.01]'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            }`}
          >
            {selectedId ? '确认选择' : '请选择一位助手'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
