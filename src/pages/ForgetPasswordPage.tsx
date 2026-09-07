import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Smartphone,
  Mail,
} from 'lucide-react'
import { useUIStore } from '@/stores'
import { db } from '@/services/db'

type Step = 'identity' | 'verify' | 'reset'
type VerifyMethod = 'phone' | 'email'
type PasswordStrength = 'weak' | 'medium' | 'strong'

function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return 'weak'
  const hasLetter = /[a-zA-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)

  if (password.length >= 8 && hasLetter && hasNumber && hasSpecial) return 'strong'
  if (password.length >= 6 && hasLetter && hasNumber) return 'medium'
  return 'weak'
}

function generateVerifyCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function maskPhone(phone: string): string {
  if (phone.length < 7) return phone
  return phone.slice(0, 3) + '****' + phone.slice(7)
}

function maskEmail(email: string): string {
  const atIndex = email.indexOf('@')
  if (atIndex <= 0) return email
  const domain = email.slice(atIndex)
  return '*******' + domain
}

const stepVariants = {
  initial: { opacity: 0, x: 30 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
}

export default function ForgetPasswordPage() {
  const navigate = useNavigate()
  const { addNotification, removeNotification } = useUIStore()

  const [step, setStep] = useState<Step>('identity')
  const [account, setAccount] = useState('')
  const [verifyMethod, setVerifyMethod] = useState<VerifyMethod>('phone')
  const [hasPhone, setHasPhone] = useState(false)
  const [hasEmail, setHasEmail] = useState(false)
  const [mockCode, setMockCode] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [notificationId, setNotificationId] = useState<string | null>(null)
  const [foundUserId, setFoundUserId] = useState<string | null>(null)

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown])

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        navigate('/')
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [success, navigate])

  const handleSendCode = useCallback(async () => {
    if (countdown > 0) return
    if (!account) {
      setError('请输入手机号/邮箱')
      return
    }

    const dbUser = await db.users.where('username').equals(account).first()
    if (!dbUser) {
      setError('该账号不存在')
      return
    }

    setFoundUserId(dbUser.id)

    // 模拟判断是否有手机号和邮箱
    const phoneBound = true
    const emailBound = !!dbUser.email
    setHasPhone(phoneBound)
    setHasEmail(emailBound)

    const code = generateVerifyCode()
    const nid = `forget-verify-${Date.now()}`
    addNotification({
      id: nid,
      type: 'info',
      title: '验证码',
      message: `您的验证码是：${code}`,
      timestamp: Date.now(),
      read: false,
      duration: 0,
    })
    setNotificationId(nid)
    setMockCode(code)
    setCountdown(60)
    setError('')

    if (step === 'identity') {
      setStep('verify')
    }
  }, [account, countdown, addNotification, step])

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
    setStep('reset')
  }

  const handleResetPassword = async () => {
    if (!newPassword) {
      setError('请输入新密码')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('两次密码不一致')
      return
    }
    if (!foundUserId) {
      setError('用户验证已过期，请重新开始')
      return
    }

    await db.users.update(foundUserId, { password: newPassword })
    setSuccess(true)
    if (notificationId) {
      removeNotification(notificationId)
      setNotificationId(null)
    }
  }

  const passwordStrength = getPasswordStrength(newPassword)
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0

  const displayAccount = account.trim()

  return (
    <div className="h-full w-full flex flex-col items-center justify-center relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-primary-400/20 rounded-full blur-3xl animate-float" />
        <div
          className="absolute bottom-20 right-20 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl animate-float"
          style={{ animationDelay: '1s' }}
        />
      </div>

      {/* 顶部返回按钮 + Logo */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all"
          aria-label="返回"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        {/* 小号 Logo */}
        <div className="flex justify-center mb-6">
          <img
            src="/images/platform/logo.svg"
            alt="logo"
            className="w-16 h-16"
          />
        </div>

        <AnimatePresence mode="wait">
          {step === 'identity' && (
            <motion.div
              key="identity"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center"
            >
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">
                忘记密码
              </h2>
              <div className="w-full space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    手机号/邮箱
                  </label>
                  <input
                    type="text"
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    className="input-field w-full"
                    placeholder="请输入手机号或邮箱"
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
                  onClick={handleSendCode}
                  className="btn-primary w-full py-3"
                >
                  获取验证码
                </button>
              </div>
            </motion.div>
          )}

          {step === 'verify' && (
            <motion.div
              key="verify"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center"
            >
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
                验证身份
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                请选择验证方式并输入验证码
              </p>

              <div className="w-full space-y-4">
                {/* 验证方式选择 */}
                {hasPhone && hasEmail && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setVerifyMethod('phone')}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border transition-all ${
                        verifyMethod === 'phone'
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      <Smartphone className="w-4 h-4" />
                      手机号
                    </button>
                    <button
                      onClick={() => setVerifyMethod('email')}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border transition-all ${
                        verifyMethod === 'email'
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      <Mail className="w-4 h-4" />
                      邮箱
                    </button>
                  </div>
                )}

                {/* 显示选中的联系方式 */}
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800 text-center text-sm text-gray-700 dark:text-gray-300">
                  {verifyMethod === 'phone'
                    ? maskPhone(displayAccount || '138****8911')
                    : maskEmail(displayAccount || '*******@example.com')}
                </div>

                {/* 验证码输入 */}
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
                  下一步
                </button>
              </div>
            </motion.div>
          )}

          {step === 'reset' && (
            <motion.div
              key="reset"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center"
            >
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">
                修改密码
              </h2>

              <div className="w-full space-y-4">
                {/* 新密码 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    新密码
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="input-field w-full pr-10"
                      placeholder="请输入新密码"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {newPassword && (
                    <div className="mt-2">
                      <div className="flex gap-1 h-1.5 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            passwordStrength === 'weak'
                              ? 'w-1/3 bg-red-500'
                              : passwordStrength === 'medium'
                                ? 'w-2/3 bg-yellow-500'
                                : 'w-full bg-green-500'
                          }`}
                        />
                      </div>
                      <p
                        className={`text-xs mt-1 ${
                          passwordStrength === 'weak'
                            ? 'text-red-500'
                            : passwordStrength === 'medium'
                              ? 'text-yellow-500'
                              : 'text-green-500'
                        }`}
                      >
                        密码强度：
                        {passwordStrength === 'weak'
                          ? '弱'
                          : passwordStrength === 'medium'
                            ? '中'
                            : '强'}
                      </p>
                    </div>
                  )}
                </div>

                {/* 确认新密码 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    确认新密码
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="input-field w-full pr-10"
                      placeholder="请再次输入新密码"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
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

                {success && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-green-500"
                  >
                    修改成功，3秒后将跳转登录界面
                  </motion.p>
                )}

                {!success && (
                  <button
                    onClick={handleResetPassword}
                    disabled={!passwordsMatch}
                    className={`w-full py-3 rounded-xl font-medium transition-all ${
                      passwordsMatch
                        ? 'btn-primary'
                        : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    确认修改
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
