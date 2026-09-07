import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { getAssistantSeed } from '@/services/assistantData'

interface AssistantWelcomePageProps {
  assistantId: string
  onStart: () => void
}

export default function AssistantWelcomePage({ assistantId, onStart }: AssistantWelcomePageProps) {
  const seed = getAssistantSeed(assistantId)

  if (!seed) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-gray-800 dark:via-gray-900 dark:to-gray-800 p-4"
    >
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-64 h-64 bg-primary-300/20 rounded-full blur-3xl animate-float" />
        <div
          className="absolute bottom-10 right-10 w-80 h-80 bg-purple-300/20 rounded-full blur-3xl animate-float"
          style={{ animationDelay: '1.5s' }}
        />
      </div>

      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20 }}
        className="relative z-10 max-w-md w-full text-center"
      >
        {/* 标题 */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-center gap-2 mb-8"
        >
          <Sparkles className="w-5 h-5 text-primary-400" />
          <span className="text-sm font-medium text-primary-500 dark:text-primary-400 tracking-wide">
            你的第一位伙伴
          </span>
          <Sparkles className="w-5 h-5 text-primary-400" />
        </motion.div>

        {/* 助手头像 */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.5, type: 'spring', damping: 12 }}
          className={`inline-flex items-center justify-center w-32 h-32 rounded-3xl bg-gradient-to-br ${seed.avatarColor} shadow-2xl mb-6`}
        >
          <span className="text-5xl font-bold text-white">{seed.name}</span>
        </motion.div>

        {/* 助手名字 */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="text-3xl font-bold text-gray-800 dark:text-white mb-2"
        >
          {seed.name}
        </motion.h2>

        {/* 助手性格标签 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="flex flex-wrap justify-center gap-2 mb-6"
        >
          {seed.personality.map((p, i) => (
            <span
              key={i}
              className="text-xs px-3 py-1 rounded-full bg-white/80 dark:bg-gray-700/80 text-gray-600 dark:text-gray-300 shadow-sm backdrop-blur-sm"
            >
              {p}
            </span>
          ))}
        </motion.div>

        {/* 助手简介 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1 }}
          className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-5 shadow-lg mb-8 border border-white/50 dark:border-gray-700/50"
        >
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-sm">
            {seed.intro}
          </p>
          <p className="text-gray-500 dark:text-gray-400 leading-relaxed text-sm mt-3">
            {seed.background}
          </p>
        </motion.div>

        {/* 开始使用按钮 */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5 }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onStart}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-primary-500 to-purple-500 text-white font-medium text-base shadow-lg hover:shadow-xl transition-shadow"
        >
          开始使用
        </motion.button>
      </motion.div>
    </motion.div>
  )
}
