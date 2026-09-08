import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, X } from 'lucide-react'
import { useAuthStore } from '@/stores'
import { api } from '@/services/apiClient'

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

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showOldPassword, setShowOldPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [errorCount, setErrorCount] = useState(0)

  const passwordStrength = getPasswordStrength(newPassword)
  const canSubmit =
    oldPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    newPassword === confirmPassword

  const handleSubmit = async () => {
    if (!user) {
      setError('用户未登录')
      return
    }

    if (!oldPassword) {
      setError('请输入旧密码')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('两次新密码不一致')
      return
    }

    try {
      // 服务端校验旧密码并写入 bcrypt 哈希（云为权威源）
      await api({ method: 'POST', path: '/api/auth/change-password', body: { oldPassword, newPassword } })
    } catch (err) {
      const message = err instanceof Error ? err.message : '修改失败'
      const nextCount = errorCount + 1
      setErrorCount(nextCount)

      if (message.includes('原密码')) {
        if (nextCount >= 10) {
          setError('可联系客服申诉')
        } else if (nextCount >= 3) {
          setError('下次再试着修改吧')
        } else {
          setError('密码错误')
        }
      } else {
        setError(message)
      }
      return
    }

    setSuccess(true)
    setError('')
    setErrorCount(0)

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
          更改密码
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
        <div className="w-full max-w-md space-y-4">
          {/* 旧密码 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              输入旧密码
            </label>
            <div className="relative">
              <input
                type={showOldPassword ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="input-field w-full pr-10"
                placeholder="请输入旧密码"
              />
              <button
                type="button"
                onClick={() => setShowOldPassword(!showOldPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                {showOldPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* 新密码 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              输入新密码
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input-field w-full pr-10"
                placeholder="请输入新密码"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                {showNewPassword ? (
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

          {/* 错误/成功提示 */}
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-sm text-red-500"
              >
                {error}
              </motion.p>
            )}
            {success && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-sm text-green-500"
              >
                修改成功，2秒后返回
              </motion.p>
            )}
          </AnimatePresence>

          {/* 提交按钮 */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || success || errorCount >= 3}
            className={`w-full py-3 rounded-xl font-medium transition-all ${
              canSubmit && !success && errorCount < 3
                ? 'btn-primary'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            }`}
          >
            确认更改
          </button>
        </div>
      </div>
    </div>
  )
}
