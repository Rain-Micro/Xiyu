import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Info, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react'
import { useUIStore } from '@/stores'

const icons = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  success: CheckCircle
}

const colors = {
  info: 'bg-blue-500',
  warning: 'bg-yellow-500',
  error: 'bg-red-500',
  success: 'bg-green-500'
}

export default function NotificationToast() {
  const { notifications, removeNotification } = useUIStore()

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    notifications.forEach((notification) => {
      const duration = notification.duration
      if (duration === 0) return
      const timeout = duration && duration > 0 ? duration : 5000
      const timer = setTimeout(() => {
        removeNotification(notification.id)
      }, timeout)
      timers.push(timer)
    })
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [notifications, removeNotification])

  // 分离验证码通知和普通通知
  const verifyCodeNotifications = notifications.filter((n) =>
    n.id.startsWith('change-contact-') || n.title === '验证码'
  )
  const normalNotifications = notifications.filter(
    (n) => !n.id.startsWith('change-contact-') && n.title !== '验证码'
  )

  return (
    <>
      {/* 普通通知 — 右下角 */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none">
        <AnimatePresence>
          {normalNotifications.slice(0, 3).map((notification) => {
            const Icon = icons[notification.type]
            return (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, x: 50, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 50, scale: 0.9 }}
                className="pointer-events-auto bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 max-w-sm"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg ${colors[notification.type]} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-800 dark:text-white text-sm">{notification.title}</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{notification.message}</p>
                  </div>
                  <button
                    onClick={() => removeNotification(notification.id)}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* 验证码通知 — 右侧中上部，大尺寸 */}
      <div className="fixed top-[30%] right-4 z-[60] space-y-2 pointer-events-none">
        <AnimatePresence>
          {verifyCodeNotifications.map((notification) => {
            const Icon = icons[notification.type]
            return (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, x: 50, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 50, scale: 0.9 }}
                className="pointer-events-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border-2 border-blue-200 dark:border-blue-800 p-6 min-w-[320px]"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl ${colors[notification.type]} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-gray-800 dark:text-white text-base">{notification.title}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 font-medium">{notification.message}</p>
                  </div>
                  <button
                    onClick={() => removeNotification(notification.id)}
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </>
  )
}
