import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowLeft } from 'lucide-react'
import { useAuthStore, useUIStore } from '@/stores'
import { api, ApiError } from '@/services/apiClient'

interface ChangeContactModalProps {
  isOpen: boolean
  onClose: () => void
  type: 'phone' | 'email' | null
  mode: 'bind' | 'change' | null
}

export default function ChangeContactModal({
  isOpen,
  onClose,
  type,
  mode,
}: ChangeContactModalProps) {
  const user = useAuthStore((s) => s.user)
  const updateUser = useAuthStore((s) => s.updateUser)
  const { addNotification, removeNotification } = useUIStore()

  const isPhone = type === 'phone'
  const isFirstBind = mode === 'bind'
  const title = isPhone
    ? (isFirstBind ? '绑定手机号' : '更改手机号')
    : (isFirstBind ? '绑定邮箱' : '更改邮箱')

  const [step, setStep] = useState<'input' | 'code' | 'success'>('input')
  const [newContact, setNewContact] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [mockCode, setMockCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState('')
  const [notificationId, setNotificationId] = useState<string | null>(null)
  const backdropClickedRef = useRef(false)

  // 重置状态当弹窗打开时
  useEffect(() => {
    if (isOpen) {
      setStep('input')
      setNewContact('')
      setCodeInput('')
      setMockCode('')
      setCountdown(0)
      setError('')
      setNotificationId(null)
    }
  }, [isOpen])

  // 倒计时
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => setCountdown((p) => p - 1), 1000)
    return () => clearInterval(timer)
  }, [countdown])

  // 关闭时清理通知
  const handleClose = useCallback(() => {
    if (notificationId) {
      removeNotification(notificationId)
      setNotificationId(null)
    }
    onClose()
  }, [notificationId, removeNotification, onClose])

  const handleSendCode = async () => {
    if (countdown > 0) return
    if (!newContact) {
      setError(isPhone ? '请输入手机号' : '请输入邮箱')
      return
    }
    // 格式验证
    if (isPhone) {
      const phoneRegex = /^1[3-9]\d{9}$/
      if (!phoneRegex.test(newContact)) {
        setError('手机号格式不正确')
        return
      }
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(newContact)) {
        setError('邮箱格式不正确')
        return
      }
    }

    // 发送验证码到新联系方式（mock 模式回带 devCode 供联调显示）
    try {
      const result = await api<{ devCode?: string }>({
        method: 'POST',
        path: '/api/sms/send',
        body: isPhone
          ? { target: newContact, channel: 'phone' }
          : { target: newContact, channel: 'email' },
      })
      const nid = `change-contact-${Date.now()}`
      addNotification({
        id: nid,
        type: 'info',
        title: '验证码',
        message: result.devCode ? `您的验证码是：${result.devCode}` : '验证码已发送',
        timestamp: Date.now(),
        read: false,
        duration: 0,
      })
      setNotificationId(nid)
      setMockCode(result.devCode || '')
      setCountdown(60)
      setError('')
      setStep('code')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '发送失败，请稍后重试')
    }
  }

  const handleVerifyCode = async () => {
    if (!codeInput) {
      setError('请输入验证码')
      return
    }
    // 有 devCode 时本地预校验（联调模式）；真实短信场景由服务端校验
    if (mockCode && codeInput !== mockCode) {
      setError('验证码错误')
      return
    }
    if (!user) {
      setError('用户未登录')
      return
    }

    try {
      await api({
        method: 'POST',
        path: '/api/auth/change-contact',
        body: {
          phone: isPhone ? newContact : undefined,
          email: isPhone ? undefined : newContact,
          code: codeInput,
        },
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '更换绑定失败')
      return
    }

    // 实时更新 Zustand 中的用户信息
    updateUser({
      phone: isPhone ? newContact : user.phone,
      email: isPhone ? user.email : newContact,
    })

    if (notificationId) {
      removeNotification(notificationId)
      setNotificationId(null)
    }
    setStep('success')

    setTimeout(() => {
      handleClose()
    }, 2000)
  }

  if (!isOpen || !type || !mode) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={(e) => {
        // 只有直接在背景上按下才标记为可关闭
        if (e.target === e.currentTarget) {
          backdropClickedRef.current = true
        }
      }}
      onClick={(e) => {
        // 只有 mousedown 和 click 都在背景上才关闭
        if (backdropClickedRef.current && e.target === e.currentTarget) {
          handleClose()
        }
        backdropClickedRef.current = false
      }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-[600px] mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={handleClose}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">
            {title}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="px-6 py-6">
          <AnimatePresence mode="wait">
            {step === 'input' && (
              <motion.div
                key="input"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {isFirstBind
                      ? (isPhone ? '手机号' : '邮箱')
                      : (`新${isPhone ? '手机号' : '邮箱'}`)}
                  </label>
                  <input
                    type={isPhone ? 'tel' : 'email'}
                    value={newContact}
                    onChange={(e) => {
                      setNewContact(e.target.value)
                      setError('')
                    }}
                    className="input-field w-full"
                    placeholder={`请输入${isFirstBind ? '' : '新'}${isPhone ? '手机号' : '邮箱'}`}
                    autoFocus
                  />
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm text-red-500"
                  >
                    {error}
                  </motion.p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleClose}
                    className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSendCode}
                    className="flex-1 py-2.5 rounded-xl bg-primary-500 text-white font-medium hover:bg-primary-600 transition-colors"
                  >
                    获取验证码
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'code' && (
              <motion.div
                key="code"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    验证码
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={codeInput}
                      onChange={(e) => {
                        setCodeInput(e.target.value)
                        setError('')
                      }}
                      className="input-field flex-1"
                      placeholder="请输入验证码"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleSendCode}
                      disabled={countdown > 0}
                      className={`px-4 py-2 rounded-xl border-2 border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300 font-medium whitespace-nowrap transition-colors ${
                        countdown > 0
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:bg-primary-50 dark:hover:bg-primary-900/20'
                      }`}
                    >
                      {countdown > 0 ? `${countdown}秒后重发` : '重新发送'}
                    </button>
                  </div>
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm text-red-500"
                  >
                    {error}
                  </motion.p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleClose}
                    className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleVerifyCode}
                    className="flex-1 py-2.5 rounded-xl bg-primary-500 text-white font-medium hover:bg-primary-600 transition-colors"
                  >
                    {isFirstBind ? '确认绑定' : '确认更改'}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="text-center space-y-4 py-4"
              >
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-800 dark:text-white">
                  {isFirstBind ? '绑定成功' : '修改成功'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  2秒后自动关闭
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}
