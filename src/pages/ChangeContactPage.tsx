import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, X } from 'lucide-react'
import { useAuthStore, useUIStore } from '@/stores'
import { api, ApiError } from '@/services/apiClient'

type Step = 'verifyOld' | 'inputCode' | 'inputNew' | 'success'

const stepVariants = {
  initial: { opacity: 0, x: 30 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
}

export default function ChangeContactPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, updateUser } = useAuthStore()
  const { addNotification, removeNotification } = useUIStore()

  const type = searchParams.get('type') as 'phone' | 'email' | null
  const isPhone = type === 'phone'

  // 判断是否为首次绑定
  const hasPhone = !!user?.phone
  const hasEmail = !!user?.email
  const isFirstBind = isPhone ? !hasPhone : !hasEmail
  const title = isPhone
    ? (isFirstBind ? '绑定手机号' : '更改手机号')
    : (isFirstBind ? '绑定邮箱' : '更改邮箱')

  // 首次绑定从 inputNew 开始，更改从 verifyOld 开始
  const [step, setStep] = useState<Step>(isFirstBind ? 'inputNew' : 'verifyOld')
  const [oldContact, setOldContact] = useState('')
  const [newContact, setNewContact] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [mockCode, setMockCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState('')
  const [notificationId, setNotificationId] = useState<string | null>(null)

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown])

  const handleSendCode = async () => {
    if (countdown > 0) return
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '发送失败，请稍后重试')
    }
  }

  const handleVerifyOld = async () => {
    if (!oldContact) {
      setError(isPhone ? '请输入原手机号' : '请输入原邮箱')
      return
    }
    // 验证原联系方式是否匹配当前绑定值
    const currentValue = isPhone ? user?.phone : user?.email
    if (oldContact !== currentValue) {
      setError(isPhone ? '原手机号不正确' : '原邮箱不正确')
      return
    }
    setError('')
    handleSendCode()
    setStep('inputCode')
  }

  const handleSendCodeForNew = () => {
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
    setError('')
    handleSendCode()
    setStep('inputCode')
  }

  const handleVerifyCode = () => {
    if (!codeInput) {
      setError('请输入验证码')
      return
    }
    if (codeInput !== mockCode) {
      setError('验证码错误')
      return
    }
    setError('')
    if (isFirstBind) {
      // 首次绑定：验证码通过后直接保存
      handleConfirmChange()
    } else {
      // 更改：验证码通过后进入输入新联系方式
      setStep('inputNew')
    }
  }

  const handleConfirmChange = async () => {
    if (!newContact) {
      setError(isPhone ? '请输入新手机号' : '请输入新邮箱')
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
      navigate('/profile')
    }, 2000)
  }

  return (
    <div className="h-full w-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => navigate('/profile')}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="返回"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
        <h1 className="text-lg font-bold text-gray-800 dark:text-white">
          {title}
        </h1>
        <button
          onClick={() => navigate('/profile')}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="关闭"
        >
          <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {step === 'verifyOld' && (
              <motion.div
                key="verifyOld"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <h2 className="text-xl font-bold text-gray-800 dark:text-white text-center mb-6">
                  验证原{isPhone ? '手机号' : '邮箱'}
                </h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    原{isPhone ? '手机号' : '邮箱'}
                  </label>
                  <input
                    type={isPhone ? 'tel' : 'email'}
                    value={oldContact}
                    onChange={(e) => setOldContact(e.target.value)}
                    className="input-field w-full"
                    placeholder={`请输入原${isPhone ? '手机号' : '邮箱'}`}
                  />
                </div>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-red-500"
                  >
                    {error}
                  </motion.p>
                )}
                <button
                  onClick={handleVerifyOld}
                  className="btn-primary w-full py-3"
                >
                  发送验证码
                </button>
              </motion.div>
            )}

            {step === 'inputNew' && (
              <motion.div
                key="inputNew"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <h2 className="text-xl font-bold text-gray-800 dark:text-white text-center mb-6">
                  {isFirstBind ? `输入${isPhone ? '手机号' : '邮箱'}` : `输入新${isPhone ? '手机号' : '邮箱'}`}
                </h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {isFirstBind ? (isPhone ? '手机号' : '邮箱') : `新${isPhone ? '手机号' : '邮箱'}`}
                  </label>
                  <input
                    type={isPhone ? 'tel' : 'email'}
                    value={newContact}
                    onChange={(e) => setNewContact(e.target.value)}
                    className="input-field w-full"
                    placeholder={`请输入${isFirstBind ? '' : '新'}${isPhone ? '手机号' : '邮箱'}`}
                  />
                </div>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-red-500"
                  >
                    {error}
                  </motion.p>
                )}
                <button
                  onClick={handleSendCodeForNew}
                  className="btn-primary w-full py-3"
                >
                  获取验证码
                </button>
              </motion.div>
            )}

            {step === 'inputCode' && (
              <motion.div
                key="inputCode"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <h2 className="text-xl font-bold text-gray-800 dark:text-white text-center mb-6">
                  输入验证码
                </h2>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    验证码
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value)}
                      className="input-field flex-1"
                      placeholder="请输入验证码"
                    />
                    <button
                      type="button"
                      onClick={handleSendCode}
                      disabled={countdown > 0}
                      className={`btn-secondary whitespace-nowrap px-4 ${
                        countdown > 0 ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {countdown > 0 ? `${countdown}秒后重发` : '获取验证码'}
                    </button>
                  </div>
                </div>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-red-500"
                  >
                    {error}
                  </motion.p>
                )}
                <button
                  onClick={handleVerifyCode}
                  className="btn-primary w-full py-3"
                >
                  {isFirstBind ? '确认绑定' : '下一步'}
                </button>
              </motion.div>
            )}

            {step === 'success' && (
              <motion.div
                key="success"
                variants={stepVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="text-center space-y-4"
              >
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                  {isFirstBind ? '绑定成功' : '修改成功'}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  2秒后返回个人信息页面
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
