import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Heart } from 'lucide-react'
import { useUIStore, useSettingsStore } from '@/stores'

export default function HealthReminder() {
  const { onlineTime, resetOnlineTime } = useUIStore()
  const { settings } = useSettingsStore()
  const [showReminder, setShowReminder] = useState(false)
  const [reminderType, setReminderType] = useState<'6h' | '8h' | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!settings?.healthReminders || dismissed) return

    if (onlineTime >= 480 && reminderType !== '8h') { // 8小时
      setReminderType('8h')
      setShowReminder(true)
    } else if (onlineTime >= 360 && reminderType !== '6h' && reminderType !== '8h') { // 6小时
      setReminderType('6h')
      setShowReminder(true)
    }
  }, [onlineTime, settings?.healthReminders, dismissed, reminderType])

  const handleDismiss = () => {
    setShowReminder(false)
    setDismissed(true)
  }

  const handleSetInterval = () => {
    // 设置下次提醒时间（这里简化为重置计时器）
    resetOnlineTime()
    setShowReminder(false)
    setReminderType(null)
    setDismissed(false)
  }

  if (!settings?.healthReminders) return null

  return (
    <AnimatePresence>
      {showReminder && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="card max-w-md w-full mx-4"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Heart className="w-6 h-6 text-orange-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                  {reminderType === '6h' ? '您已连续在线6小时' : '您已在线8小时'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {reminderType === '6h' ? '请注意休息' : '建议您休息一下'}
                </p>
              </div>
            </div>

            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
                <Clock className="w-5 h-5" />
                <span className="text-sm">
                  连续在线时长：{Math.floor(onlineTime / 60)}小时{onlineTime % 60}分钟
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleDismiss}
                className="btn-secondary flex-1"
              >
                我知道了
              </button>
              <button
                onClick={handleSetInterval}
                className="btn-primary flex-1"
              >
                设置提醒间隔
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
