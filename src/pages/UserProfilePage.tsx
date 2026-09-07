import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  X,
  Camera,
  ChevronRight,
  AlertTriangle,
  LogOut,
} from 'lucide-react'
import { useAuthStore, useUIStore } from '@/stores'
import { sanitizeDate } from '@/utils/dateFormat'
import { supabase } from '@/services/supabase'
import ChangeContactModal from '@/components/ChangeContactModal'

function getAvatarColor(name: string): string {
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

function maskPhone(phone: string): string {
  if (phone.length >= 7) return phone.slice(0, 3) + '****' + phone.slice(-4)
  return phone
}

function maskEmail(email: string): string {
  const [name, domain] = email.split('@')
  if (!domain) return email
  return name.slice(0, 2) + '*****@' + domain
}

const modalVariants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
}

export default function UserProfilePage() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { addNotification } = useUIStore()

  // 返回上一级页面（无论是从用户模块、聊天界面还是主界面进入）
  const goBack = () => navigate(-1)

  const [nickname, setNickname] = useState(user?.nickname || '')
  const [birthday, setBirthday] = useState(user?.birthday || '')
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '')
  const [showPermissionModal, setShowPermissionModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showSecondDeleteConfirm, setShowSecondDeleteConfirm] = useState(false)
  const [showSaveChatLocal, setShowSaveChatLocal] = useState(false)
  const [showSaveChatCloud, setShowSaveChatCloud] = useState(false)
  const [contactModal, setContactModal] = useState<{
    open: boolean
    type: 'phone' | 'email' | null
    mode: 'bind' | 'change' | null
  }>({ open: false, type: null, mode: null })
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 响应式绑定状态：直接从 user 对象计算
  const phoneBound = !!user?.phone
  const emailBound = !!user?.email

  useEffect(() => {
    if (user) {
      setNickname(user.nickname || '')
      setBirthday(user.birthday || '')
      setAvatarUrl(user.avatarUrl || '')
    }
  }, [user])

  const handleSaveNickname = async () => {
    if (!user) return
    await supabase.from('users').update({ nickname }).eq('id', user.id)
    useAuthStore.getState().updateUser({ nickname })
    addNotification({
      id: `nickname-save-${Date.now()}`,
      type: 'success',
      title: '保存成功',
      message: '昵称已更新',
      timestamp: Date.now(),
      read: false,
      duration: 3000,
    })
  }

  const handleSaveBirthday = async () => {
    if (!user) return
    const cleanBirthday = sanitizeDate(birthday)
    await supabase.from('users').update({ birthday: cleanBirthday }).eq('id', user.id)
    useAuthStore.getState().updateUser({ birthday: cleanBirthday })
    addNotification({
      id: `birthday-save-${Date.now()}`,
      type: 'success',
      title: '保存成功',
      message: '生日已更新',
      timestamp: Date.now(),
      read: false,
      duration: 3000,
    })
  }

  const handleChangeAvatarClick = () => {
    const permission = localStorage.getItem('fileReadPermission')
    if (permission === 'granted') {
      fileInputRef.current?.click()
    } else {
      setShowPermissionModal(true)
    }
  }

  const handlePermissionAllow = () => {
    localStorage.setItem('fileReadPermission', 'granted')
    setShowPermissionModal(false)
    fileInputRef.current?.click()
  }

  const handlePermissionDeny = () => {
    localStorage.setItem('fileReadPermission', 'denied')
    setShowPermissionModal(false)
    addNotification({
      id: `avatar-permission-denied-${Date.now()}`,
      type: 'error',
      title: '权限被拒绝',
      message: '权限被拒绝，无法更换头像',
      timestamp: Date.now(),
      read: false,
      duration: 3000,
    })
  }

  const handleDeleteAccount = async () => {
    if (!user) return
    // 第一步：询问是否保存聊天记录到本地
    setShowDeleteConfirm(false)
    setShowSecondDeleteConfirm(false)
    setShowSaveChatLocal(true)
  }

  const handleSaveChatLocalResponse = async (saveLocal: boolean) => {
    setShowSaveChatLocal(false)
    if (saveLocal) {
      // 聊天记录已经保存在本地 IndexedDB 中，无需额外操作
      console.log('[Account] 聊天记录已保留在本地')
    }
    // 第二步：询问是否同步到云端
    setShowSaveChatCloud(true)
  }

  const handleSaveChatCloudResponse = async (syncCloud: boolean) => {
    setShowSaveChatCloud(false)
    if (!user) return
    // 执行注销
    await supabase.from('users').update({
      pending_deletion: true,
      pending_deletion_at: new Date().toISOString(),
    }).eq('id', user.id)
    if (!syncCloud) {
      // 用户选择不保留云端聊天记录，删除云端消息
      try {
        await supabase.from('messages').delete().eq('user_id', user.id)
      } catch (err) {
        console.warn('[Account] 删除云端消息失败:', err)
      }
    }
    logout()
    navigate('/')
  }

  const cropToCircle = (img: HTMLImageElement): string => {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    const minDim = Math.min(img.width, img.height)
    const sx = (img.width - minDim) / 2
    const sy = (img.height - minDim) / 2

    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()

    ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size)
    return canvas.toDataURL('image/png')
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.match(/^image\/(jpeg|png|gif|webp)$/)) {
      addNotification({
        id: `avatar-format-${Date.now()}`,
        type: 'error',
        title: '格式不支持',
        message: '请选择 jpg、png、gif 或 webp 格式的图片',
        timestamp: Date.now(),
        read: false,
        duration: 3000,
      })
      return
    }

    const reader = new FileReader()
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string
      const img = new Image()
      img.onload = async () => {
        const cropped = cropToCircle(img)
        setAvatarUrl(cropped)
        if (user) {
          await supabase.from('users').update({ avatar_url: cropped }).eq('id', user.id)
          useAuthStore.getState().updateUser({ avatarUrl: cropped })
        }
        addNotification({
          id: `avatar-change-${Date.now()}`,
          type: 'success',
          title: '头像更换',
          message: '头像已更新',
          timestamp: Date.now(),
          read: false,
          duration: 3000,
        })
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  if (!user) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">请先登录</p>
      </div>
    )
  }

  return (
    <div className="h-full w-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={goBack}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="返回"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
        <h1 className="text-lg font-bold text-gray-800 dark:text-white">
          个人信息
        </h1>
        <button
          onClick={goBack}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="关闭"
        >
          <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {/* 用户头像 */}
        <div className="flex flex-col items-center">
          <div className="relative w-24 h-24 rounded-full shadow-lg overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt="头像" className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-white text-3xl font-bold"
                style={{ backgroundColor: getAvatarColor(nickname?.trim() || user.userId || user.username) }}
              >
                {(nickname?.trim() || user.userId || user.username).charAt(0)}
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={handleChangeAvatarClick}
            className="mt-2 text-sm text-primary-500 hover:text-primary-600 transition-colors"
          >
            更换头像
          </button>
        </div>

        {/* 用户昵称 */}
        <div className="card space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            用户昵称
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="input-field flex-1"
              placeholder="请输入昵称"
            />
            <button
              onClick={handleSaveNickname}
              className="btn-secondary px-4 whitespace-nowrap"
            >
              保存
            </button>
          </div>
        </div>

        {/* 用户账号（User ID） */}
        <div className="card space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            用户账号
          </label>
          <input
            type="text"
            value={user.userId || user.id}
            readOnly
            className="input-field w-full bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
          />
        </div>

        {/* 用户手机号 */}
        <div className="card flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              手机号
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {phoneBound ? maskPhone(user.phone || '') : '未绑定'}
            </p>
          </div>
          <button
            onClick={() => {
              if (!phoneBound) {
                setContactModal({ open: true, type: 'phone', mode: 'bind' })
              } else {
                setContactModal({ open: true, type: 'phone', mode: 'change' })
              }
            }}
            className="flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600 transition-colors"
          >
            {phoneBound ? '更改手机号' : '绑定手机号'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* 用户邮箱 */}
        <div className="card flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              邮箱
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {emailBound ? maskEmail(user.email || '') : '未绑定'}
            </p>
          </div>
          <button
            onClick={() => {
              if (!emailBound) {
                setContactModal({ open: true, type: 'email', mode: 'bind' })
              } else {
                setContactModal({ open: true, type: 'email', mode: 'change' })
              }
            }}
            className="flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600 transition-colors"
          >
            {emailBound ? '更改邮箱' : '绑定邮箱'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* 更改密码 */}
        <button
          onClick={() => navigate('/change-password')}
          className="card w-full flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            更改密码
          </span>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </button>

        {/* 用户生日 */}
        <div className="card space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            生日
          </label>
          <div className="flex gap-2">
            <div className="date-input-wrapper flex-1">
              {!birthday && <span className="date-input-placeholder">选择日期</span>}
              <input
                type="date"
                placeholder="选择日期"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                className="input-field flex-1"
              />
            </div>
            <button
              onClick={handleSaveBirthday}
              className="btn-secondary px-4 whitespace-nowrap"
            >
              保存
            </button>
          </div>
        </div>

        {/* 退出登录 */}
        <button
          onClick={() => {
            logout()
            navigate('/')
          }}
          className="w-full py-3 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          退出登录
        </button>

        {/* 注销账号 */}
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="w-full py-3 rounded-xl border-2 border-red-500 text-red-500 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center gap-2"
        >
          <AlertTriangle className="w-4 h-4" />
          注销账号
        </button>
      </div>

      {/* 文件读取权限询问弹窗 */}
      <AnimatePresence>
        {showPermissionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          >
            <motion.div
              variants={modalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="card max-w-sm w-full text-center"
            >
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  <Camera className="w-6 h-6 text-primary-500" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">
                权限请求
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                是否允许平台读取本地文件？
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handlePermissionDeny}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  拒绝
                </button>
                <button
                  onClick={handlePermissionAllow}
                  className="flex-1 py-2.5 rounded-xl bg-primary-500 text-white font-medium hover:bg-primary-600 transition-colors"
                >
                  允许
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 第一次注销确认 */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          >
            <motion.div
              variants={modalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="card max-w-sm w-full text-center"
            >
              <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
                注销账号
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                注销后账号数据将无法恢复，是否确认注销？
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false)
                    setShowSecondDeleteConfirm(true)
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
                >
                  确认注销
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 第二次注销确认（14天找回期） */}
      <AnimatePresence>
        {showSecondDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          >
            <motion.div
              variants={modalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="card max-w-sm w-full text-center"
            >
              <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
                注销账号
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                注销账号后，您可以在14天内通过登录该账号来寻回账号，否则将永久注销。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSecondDeleteConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  永久保存
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
                >
                  确认注销
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 注销弹窗：是否保存聊天记录到本地 */}
      <AnimatePresence>
        {showSaveChatLocal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          >
            <motion.div
              variants={modalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="card max-w-sm w-full text-center"
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
                保存聊天记录
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                是否将聊天记录保存至本地？
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleSaveChatLocalResponse(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  否
                </button>
                <button
                  onClick={() => handleSaveChatLocalResponse(true)}
                  className="flex-1 py-2.5 rounded-xl bg-primary-500 text-white font-medium hover:bg-primary-600 transition-colors"
                >
                  是
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 注销弹窗：是否同步聊天记录到云端 */}
      <AnimatePresence>
        {showSaveChatCloud && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          >
            <motion.div
              variants={modalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="card max-w-sm w-full text-center"
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
                同步聊天记录
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                是否将聊天记录同步至云端？
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleSaveChatCloudResponse(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  否
                </button>
                <button
                  onClick={() => handleSaveChatCloudResponse(true)}
                  className="flex-1 py-2.5 rounded-xl bg-primary-500 text-white font-medium hover:bg-primary-600 transition-colors"
                >
                  是
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 绑定/更改手机号邮箱弹窗 */}
      <ChangeContactModal
        isOpen={contactModal.open}
        onClose={() => setContactModal({ open: false, type: null, mode: null })}
        type={contactModal.type}
        mode={contactModal.mode}
      />
    </div>
  )
}
