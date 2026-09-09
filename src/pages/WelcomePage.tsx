import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles,
  User as UserIcon,
  Eye,
  EyeOff,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
} from 'lucide-react'
import { useAuthStore, useUIStore, useCharacterStore, useSettingsStore } from '@/stores'
import { api, ApiError, avatarSrc } from '@/services/apiClient'
import { register as authRegister, login as authLogin, loginBySms } from '@/services/authAPI'
import { sendVerifyCode as sendSmsCode, verifyCode as verifySmsCode } from '@/services/smsAPI'
import { ASSISTANT_SEEDS, createAssistantCharacter } from '@/services/assistantData'
import { db } from '@/services/db'
import type { User, Character } from '@/types'
import AssistantSelectionPopup from '@/components/AssistantSelectionPopup'
import AssistantWelcomePage from '@/components/AssistantWelcomePage'

type ViewState = 'home' | 'login' | 'register'
type PasswordStrength = 'weak' | 'medium' | 'strong'
type LoginMode = 'password' | 'verifyCode'

function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return 'weak'
  const hasLetter = /[a-zA-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)

  if (password.length >= 8 && hasLetter && hasNumber && hasSpecial) return 'strong'
  if (password.length >= 6 && hasLetter && hasNumber) return 'medium'
  return 'weak'
}

function getAvatarColor(name: string): string {
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

/** 获取用户显示名称：昵称 > 用户编号 */
function getUserDisplayName(user: User): string {
  return user.nickname?.trim() || user.userId || user.username
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

// ── 服务端数据映射工具 ─────────────────────────────────────

function mapSupabaseCharsToCharacters(rows: Record<string, unknown>[], userId: string): Character[] {
  return rows.map((sc) => {
    const assistantId = sc.assistant_id as string | undefined
    // 如果有完整的 data 字段，直接使用
    if (sc.data && typeof sc.data === 'object') {
      const data = sc.data as Record<string, unknown>
      const character = data as unknown as Character
      // 确保基本字段正确
      character.id = (sc.id as string) || character.id
      character.userId = userId
      if (character.profile) {
        character.profile.userId = userId
      }
      character.isPinned = (sc.is_pinned as boolean) || character.isPinned || false
      if (sc.type === 'builtin_assistant' && assistantId) {
        character.isAssistant = true
        character.assistantId = assistantId
        character.assistantEditable = {
          relationship: (sc.relationship as string) || character.assistantEditable?.relationship || '',
          relationshipCustom: character.assistantEditable?.relationshipCustom || '',
          userTitle: (sc.user_title as string) || character.assistantEditable?.userTitle || '',
          userNote: (sc.user_note as string) || character.assistantEditable?.userNote || '',
          anniversary: character.assistantEditable?.anniversary || '',
          userDislikes: character.assistantEditable?.userDislikes || [],
        }
      }
      return character
    }
    // 回退：内置助手从 seed 构造
    if (sc.type === 'builtin_assistant' && assistantId) {
      const seed = ASSISTANT_SEEDS.find((s) => s.assistantId === assistantId)
      if (seed) {
        const character = createAssistantCharacter(seed, userId)
        character.id = (sc.id as string) || character.id
        character.isPinned = (sc.is_pinned as boolean) || false
        character.assistantEditable = {
          relationship: (sc.relationship as string) || '',
          relationshipCustom: '',
          userTitle: (sc.user_title as string) || '',
          userNote: (sc.user_note as string) || '',
          anniversary: '',
          userDislikes: [],
        }
        return character
      }
    }
    // 回退：非助手角色，构造最小化 Character 对象
    return {
      id: (sc.id as string) || `char-${Date.now()}`,
      userId,
      profile: {
        id: `profile-${sc.id || Date.now()}`,
        userId,
        name: (sc.name as string) || '',
        personality: [],
        tone: '',
        address: '',
        hobbies: [],
        background: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      settings: {
        voiceType: 'default',
        voiceSpeed: 'normal',
        voicePitch: 'normal',
        decorations: [],
      },
      createdAt: Date.now(),
    } as Character
  })
}

/** 服务端 /api/auth/* 返回的用户 → 前端 User 形态 */
function mapAuthUserToUser(u: { id: string; phone: string | null; email: string | null; nickname: string; role: 'user' | 'admin' }): User {
  const phone = u.phone || undefined
  const email = u.email || undefined
  return {
    id: u.id,
    userId: u.id,
    username: phone || email || '',
    password: '',
    nickname: u.nickname || undefined,
    phone,
    email,
    birthDate: new Date().toISOString(),
    isAutoLogin: true,
    isNewUser: false,
    createdAt: Date.now(),
    role: u.role,
  }
}

/** 登录成功后经 REST 加载角色（内置助手 + 自定义），云端覆盖本地 Dexie，缺失助手由本地种子补齐 */
async function loadCharactersAfterLogin(dbUser: User): Promise<Character[]> {
  let allCharacters: Character[] = []
  let loadedAssistantIds: string[] = []
  let hasCloudData = false

  // 1. 内置助手（服务端 characters 表简版行 → 本地种子合成完整对象）
  try {
    const res = await api<{ characters: Record<string, unknown>[] }>({ path: '/api/characters/assistants' })
    if (res.characters?.length) {
      hasCloudData = true
      allCharacters = mapSupabaseCharsToCharacters(res.characters, dbUser.id)
      loadedAssistantIds = allCharacters
        .filter(c => c.isAssistant)
        .map(c => c.assistantId)
        .filter((id): id is string => id !== undefined)
      console.log('[Login] 从服务端加载了', allCharacters.length, '个内置助手')
    }
  } catch (err) {
    console.warn('[Login] 内置助手加载失败:', err)
  }

  // 2. 自定义角色
  try {
    const res = await api<{ characters: Record<string, unknown>[] }>({ path: '/api/characters' })
    if (res.characters?.length) {
      hasCloudData = true
      const cloudCustomChars = res.characters.map((row) => {
        const charData = row.data as Character
        return { ...charData, id: (row.id as string) || charData.id, userId: dbUser.id }
      })
      console.log('[Login] 从服务端加载了', cloudCustomChars.length, '个自定义角色')
      allCharacters = [...allCharacters, ...cloudCustomChars]
    }
  } catch (err) {
    console.warn('[Login] 自定义角色加载失败:', err)
  }

  // 3. 云端有数据 → 补充缺失的默认助手并用云端覆盖本地 Dexie；否则本地 Dexie + 默认助手
  const defaultAssistants = ASSISTANT_SEEDS
    .filter(seed => !loadedAssistantIds.includes(seed.assistantId))
    .map(seed => {
      const char = createAssistantCharacter(seed, dbUser.id)
      char.isPinned = false
      return char
    })
  allCharacters = [...allCharacters, ...defaultAssistants]

  if (hasCloudData) {
    try {
      await db.characters.where('userId').equals(dbUser.id).delete()
      for (const char of allCharacters) {
        await db.characters.put(char)
      }
      console.log('[Login] 已用云端数据覆盖本地 Dexie')
    } catch (err) {
      console.warn('[Login] 覆盖本地 Dexie 失败:', err)
    }
  } else {
    try {
      const localChars = await db.characters.where('userId').equals(dbUser.id).toArray()
      if (localChars.length > 0) {
        allCharacters = localChars
        console.log('[Login] 从本地 Dexie 加载了', localChars.length, '个角色')
      }
    } catch (err) {
      console.warn('[Login] 本地 Dexie 加载失败:', err)
    }
  }

  // 4. 去重（id + assistantId）
  const uniqueCharacters = allCharacters.filter((char, index, self) =>
    index === self.findIndex(c => c.id === char.id)
  )
  const seenAssistantIds = new Set<string>()
  return uniqueCharacters.filter(c => {
    if (c.isAssistant && c.assistantId) {
      if (seenAssistantIds.has(c.assistantId)) return false
      seenAssistantIds.add(c.assistantId)
    }
    return true
  })
}

const viewVariants = {
  initial: { opacity: 0, x: 30 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
}

export default function WelcomePage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const {
    addNotification,
    removeNotification,
    setTutorialOpen,
  } = useUIStore()
  const { setCharacters } = useCharacterStore()
  const { updateSettings } = useSettingsStore()

  const [view, setView] = useState<ViewState>('home')
  const [showUserType, setShowUserType] = useState(false)
  const [formData, setFormData] = useState({
    nickname: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
    verifyCode: '',
  })
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

  const [verifyCodeSent, setVerifyCodeSent] = useState(false)
  const [mockVerifyCode, setMockVerifyCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [isSending, setIsSending] = useState(false)
  const [registerSuccess, setRegisterSuccess] = useState(false)
  const [verifyNotificationId, setVerifyNotificationId] = useState<string | null>(null)

  const [allUsers, setAllUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const prevViewRef = useRef<ViewState>('home')

  // 登录视图新增状态
  const [loginAccount, setLoginAccount] = useState('')
  const [loginMode, setLoginMode] = useState<LoginMode>('password')
  const [passwordErrorCount, setPasswordErrorCount] = useState(0)
  const [showLoginHelpModal, setShowLoginHelpModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [deletedUserIds, setDeletedUserIds] = useState<string[]>([])
  const [inputType, setInputType] = useState<'phone' | 'email' | 'auto'>('auto')
  const [autoDetectedType, setAutoDetectedType] = useState<'phone' | 'email' | ''>('')
  const [inputError, setInputError] = useState('')
  const [showAssistantSelection, setShowAssistantSelection] = useState(false)
  const [showAssistantWelcome, setShowAssistantWelcome] = useState<string | null>(null)
  const [registerAvatarUrl, setRegisterAvatarUrl] = useState('')
  const [showRegisterAvatarPermission, setShowRegisterAvatarPermission] = useState(false)
  const registerFileInputRef = useRef<HTMLInputElement>(null)
  const [registerContactType, setRegisterContactType] = useState<'phone' | 'email'>('phone')
  const [showContactDropdown, setShowContactDropdown] = useState(false)
  // 记住我偏好辅助函数
  const getRememberPref = (username: string): boolean => {
    try {
      const prefs = JSON.parse(localStorage.getItem('remember-prefs') || '{}')
      return prefs[username] === true
    } catch {
      return false
    }
  }

  const setRememberPref = (username: string, value: boolean) => {
    try {
      const prefs = JSON.parse(localStorage.getItem('remember-prefs') || '{}')
      prefs[username] = value
      localStorage.setItem('remember-prefs', JSON.stringify(prefs))
    } catch { /* ignore */ }
  }

  const clearRememberPref = (username: string) => {
    try {
      const prefs = JSON.parse(localStorage.getItem('remember-prefs') || '{}')
      delete prefs[username]
      localStorage.setItem('remember-prefs', JSON.stringify(prefs))
    } catch { /* ignore */ }
  }

  const getRememberedPassword = (account: string): string => {
    try {
      const passwords = JSON.parse(localStorage.getItem('remembered-passwords') || '{}')
      return passwords[account] || ''
    } catch {
      return ''
    }
  }

  const setRememberedPassword = (account: string, password: string) => {
    try {
      const passwords = JSON.parse(localStorage.getItem('remembered-passwords') || '{}')
      passwords[account] = password
      localStorage.setItem('remembered-passwords', JSON.stringify(passwords))
    } catch { /* ignore */ }
  }

  // 已知账号列表：来自本机"记住密码"记录（不再全表拉取云端用户——那是原来的信息泄露面）
  useEffect(() => {
    try {
      const passwords = JSON.parse(localStorage.getItem('remembered-passwords') || '{}') as Record<string, string>
      const accounts = Object.keys(passwords)
      setAllUsers(accounts.map((acc) => ({
        id: acc,
        userId: acc,
        username: acc,
        password: passwords[acc],
        birthDate: '',
        isAutoLogin: true,
        isNewUser: false,
        createdAt: 0,
      })))
    } catch { /* ignore */ }
  }, [view])

  // 启动时只执行一次：读取 localStorage 数据
  useEffect(() => {
    const saved = localStorage.getItem('remembered-credentials')
    if (saved) {
      try {
        const { username, password } = JSON.parse(saved)
        if (username) {
          const pref = getRememberPref(username)
          setRememberMe(pref)
          setLoginAccount(username)
          if (pref) {
            const savedPwd = password || getRememberedPassword(username) || ''
            setFormData((prev) => ({ ...prev, password: savedPwd }))
          }
        }
      } catch {
        localStorage.removeItem('remembered-credentials')
      }
    }
    const deleted = localStorage.getItem('deleted-user-ids')
    if (deleted) {
      try {
        setDeletedUserIds(JSON.parse(deleted))
      } catch {
        setDeletedUserIds([])
      }
    }
  }, [])

  // 根据 allUsers + loginAccount + deletedUserIds 自动推导 selectedUserId
  useEffect(() => {
    if (!loginAccount) {
      setSelectedUserId(null)
      return
    }
    const user = allUsers.find((u) => u.username === loginAccount || u.phone === loginAccount || u.email === loginAccount)
    if (user && !deletedUserIds.includes(user.id)) {
      setSelectedUserId(user.id)
    } else {
      setSelectedUserId(null)
    }
  }, [allUsers, loginAccount, deletedUserIds])

  // 进入登录视图时初始化（仅依赖 view，避免循环）
  useEffect(() => {
    if (view === 'login') {
      // 清理注册视图残留的验证码通知
      useUIStore.getState().notifications
        .filter((n) => n.id.startsWith('verify-code-register-'))
        .forEach((n) => removeNotification(n.id))
      const saved = localStorage.getItem('remembered-credentials')
      if (saved) {
        try {
          const { username, password } = JSON.parse(saved)
          setLoginAccount(username || '')
          const pref = getRememberPref(username || '')
          setRememberMe(pref)
          if (pref) {
            const savedPwd = password || getRememberedPassword(username || '') || ''
            setFormData((prev) => ({ ...prev, password: savedPwd }))
          } else {
            setFormData((prev) => ({ ...prev, password: '' }))
          }
        } catch {
          setLoginAccount('')
          setFormData((prev) => ({ ...prev, password: '' }))
          setRememberMe(false)
        }
      } else {
        setLoginAccount('')
        setFormData((prev) => ({ ...prev, password: '' }))
        setRememberMe(false)
      }
      setLoginMode('password')
      setPasswordErrorCount(0)
      setShowLoginHelpModal(false)
      setMockVerifyCode('')
      setCountdown(0)
    }
  }, [view])

  // 进入注册视图时，清空所有已填写的内容
  useEffect(() => {
    if (view === 'register' && prevViewRef.current !== 'register') {
      setFormData({
        nickname: '',
        phone: '',
        email: '',
        password: '',
        confirmPassword: '',
        verifyCode: '',
      })
      setShowPassword(false)
      setShowConfirmPassword(false)
      setVerifyCodeSent(false)
      setMockVerifyCode('')
      setCountdown(0)
      setRegisterSuccess(false)
      setError('')
      setInputError('')
      setRegisterAvatarUrl('')
      setRegisterContactType('phone')
      setShowContactDropdown(false)
      if (verifyNotificationId) {
        removeNotification(verifyNotificationId)
        setVerifyNotificationId(null)
      }
    }
    prevViewRef.current = view
  }, [view, verifyNotificationId, removeNotification])

  // 验证码倒计时
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown])

  // 监听 logout，退出时回到首页并清空密码
  useEffect(() => {
    const unsub = useAuthStore.subscribe((state, prevState) => {
      if (prevState.isLoggedIn && !state.isLoggedIn) {
        setFormData((prev) => ({
          ...prev,
          password: '',
          confirmPassword: '',
          verifyCode: '',
        }))
        // 保留账号记录不清空，仅清空密码
        setShowPassword(false)
        setShowConfirmPassword(false)
        setVerifyCodeSent(false)
        setRegisterSuccess(false)
        setError('')
        setView('home')
      }
    })
    return unsub
  }, [])

  // 点击外部关闭下拉
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedUser = allUsers.find((u) => u.id === selectedUserId) || null
  const visibleUsers = allUsers.filter((u) => !deletedUserIds.includes(u.id))

  const handleSendVerifyCode = useCallback(async (targetAccount: string, mode: 'register' | 'login') => {
    if (countdown > 0 || isSending) return
    if (!targetAccount) {
      setError(mode === 'register' ? '请先填写手机号/邮箱' : '请先输入手机号/邮箱')
      return
    }

    setError('')
    setIsSending(true)

    try {
      const result = await sendSmsCode(targetAccount)
      if (result.mockCode) {
        const notificationId = `verify-code-${mode}-${Date.now()}`
        addNotification({
          id: notificationId,
          type: 'info',
          title: '验证码（开发模式）',
          message: `您的验证码是：${result.mockCode}`,
          timestamp: Date.now(),
          read: false,
          duration: 0,
        })
        // 登录/注册模式都登记通知 id，确保后续（登录成功/切换视图）能清理
        setVerifyNotificationId(notificationId)
        setMockVerifyCode(result.mockCode)
      } else {
        addNotification({
          id: `sms-sent-${mode}-${Date.now()}`,
          type: 'success',
          title: '验证码已发送',
          message: `验证码已发送至 ${targetAccount}`,
          timestamp: Date.now(),
          read: false,
          duration: 3000,
        })
        setMockVerifyCode('')
      }

      if (mode === 'register') {
        setVerifyCodeSent(true)
      }
      setCountdown(60)
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败，请稍后重试')
    } finally {
      setIsSending(false)
    }
  }, [countdown, isSending, addNotification])

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

  const handleRegisterAvatarClick = () => {
    const permission = localStorage.getItem('fileReadPermission')
    if (permission === 'granted') {
      registerFileInputRef.current?.click()
    } else {
      setShowRegisterAvatarPermission(true)
    }
  }

  const handleRegisterPermissionAllow = () => {
    localStorage.setItem('fileReadPermission', 'granted')
    setShowRegisterAvatarPermission(false)
    registerFileInputRef.current?.click()
  }

  const handleRegisterPermissionDeny = () => {
    localStorage.setItem('fileReadPermission', 'denied')
    setShowRegisterAvatarPermission(false)
    addNotification({
      id: `register-avatar-denied-${Date.now()}`,
      type: 'error',
      title: '权限被拒绝',
      message: '权限被拒绝，无法设置头像',
      timestamp: Date.now(),
      read: false,
      duration: 3000,
    })
  }

  const handleRegisterFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.match(/^image\/(jpeg|png|gif|webp)$/)) {
      addNotification({
        id: `register-avatar-format-${Date.now()}`,
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
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      const img = new Image()
      img.onload = () => {
        const cropped = cropToCircle(img)
        setRegisterAvatarUrl(cropped)
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleLogin = async () => {
    setError('')
    if (!loginAccount) {
      setError('请输入手机号/邮箱')
      return
    }

    // 经后端认证（密码 或 短信验证码），并获取正式 JWT
    let auth: Awaited<ReturnType<typeof authLogin>>
    try {
      if (loginMode === 'verifyCode') {
        if (!formData.verifyCode) {
          setError('请输入验证码')
          return
        }
        auth = await loginBySms(loginAccount, formData.verifyCode)
      } else {
        if (!formData.password) {
          setError('请输入密码')
          return
        }
        auth = await authLogin(loginAccount, formData.password)
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setError('not_found')
          return
        }
        if (err.status === 403) {
          setError(err.message)
          return
        }
        if (loginMode === 'password' && err.status === 401) {
          setError('wrong_password')
          const nextCount = passwordErrorCount + 1
          setPasswordErrorCount(nextCount)
          if (nextCount >= 3) {
            setShowLoginHelpModal(true)
            setPasswordErrorCount(0)
          }
          return
        }
        setError(err.message)
        return
      }
      setError('登录失败，请稍后重试')
      return
    }

    const dbUser = mapAuthUserToUser(auth.user)

    // 记住我持久化（保存账号名、密码和偏好）
    if (rememberMe) {
      localStorage.setItem(
        'remembered-credentials',
        JSON.stringify({ username: loginAccount, password: formData.password })
      )
      setRememberedPassword(loginAccount, formData.password)
      setRememberPref(loginAccount, true)
    } else {
      localStorage.removeItem('remembered-credentials')
      setRememberPref(loginAccount, false)
    }

    setPasswordErrorCount(0)
    login(dbUser)

    if (auth.restored) {
      addNotification({
        id: `account-recovered-${Date.now()}`,
        type: 'success',
        title: '账号已恢复',
        message: '您的账号已成功取消注销，恢复正常使用',
        timestamp: Date.now(),
        read: false,
        duration: 3000,
      })
    }

    // 登录成功：清理残留的验证码类通知（duration:0 常驻，不清会一直挂在右下角）
    useUIStore.getState().notifications
      .filter((n) => n.id.startsWith('verify-code-'))
      .forEach((n) => removeNotification(n.id))
    if (verifyNotificationId) {
      removeNotification(verifyNotificationId)
      setVerifyNotificationId(null)
    }

    // ─── 经 REST 加载角色（云端优先，本地种子补齐） ──────────────────────
    const finalCharacters = await loadCharactersAfterLogin(dbUser)
    setCharacters(finalCharacters)
    console.log('[Login] 最终加载了', finalCharacters.length, '个角色')

    // 检查是否已选择AI助手
    const assistantSelected = localStorage.getItem(`assistant-selected-${dbUser.id}`)
    if (!assistantSelected) {
      setShowAssistantSelection(true)
    } else {
      // 恢复助手选择到 settings store
      updateSettings({ defaultAssistantId: assistantSelected })
      // 检查新手引导是否已完成
      const tutorialDone = localStorage.getItem(`tutorial-done-${dbUser.id}`)
      if (!tutorialDone) {
        setShowUserType(true)
      } else {
        navigate('/main')
      }
    }
  }

  const handleRegister = async () => {
    setError('')
    setInputError('')

    // 昵称必填
    if (!formData.nickname.trim()) {
      setError('请输入用户昵称')
      return
    }
    // 根据选择的类型获取联系方式
    const contactValue = registerContactType === 'phone' ? formData.phone : formData.email
    if (!contactValue) {
      setError(registerContactType === 'phone' ? '请填写手机号' : '请填写邮箱')
      return
    }
    // 格式校验
    if (registerContactType === 'phone' && !/^\d{11}$/.test(formData.phone)) {
      setInputError('phone')
      setError('手机号格式不正确，应为11位纯数字')
      return
    }
    if (registerContactType === 'email' && (!formData.email.includes('@') || !formData.email.includes('.'))) {
      setInputError('email')
      setError('邮箱格式不正确，应包含@和.')
      return
    }
    if (!formData.password) {
      setError('请填写密码')
      return
    }
    if (formData.password !== formData.confirmPassword) {
      setError('两次密码不一致')
      return
    }
    if (!verifyCodeSent) {
      setError('请先获取验证码')
      return
    }
    if (formData.verifyCode !== mockVerifyCode) {
      try {
        await verifySmsCode(contactValue, formData.verifyCode)
      } catch {
        setError('验证码错误或已过期')
        return
      }
    }

    // 注册（服务端做查重、bcrypt 哈希与内置助手播种）
    try {
      await authRegister({
        phone: registerContactType === 'phone' ? formData.phone : undefined,
        email: registerContactType === 'email' ? formData.email : undefined,
        password: formData.password,
        nickname: formData.nickname.trim(),
        smsCode: formData.verifyCode,
      })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setInputError(registerContactType)
          setError(registerContactType === 'phone' ? '该手机号已被注册' : '该邮箱已被注册')
          return
        }
        setError(err.message)
        return
      }
      setError('注册失败，请稍后重试')
      return
    }

    // 注册时选的头像在首次登录后补传（服务端注册接口不接受头像）
    if (registerAvatarUrl) {
      localStorage.setItem('pending-avatar', registerAvatarUrl)
    }

    setRegisterSuccess(true)
    setVerifyCodeSent(false)
    setMockVerifyCode('')

    // 注册成功清除验证码通知
    if (verifyNotificationId) {
      removeNotification(verifyNotificationId)
      setVerifyNotificationId(null)
    }

    // 清空所有注册字段
    setFormData({
      nickname: '',
      phone: '',
      email: '',
      password: '',
      confirmPassword: '',
      verifyCode: '',
    })
    setShowPassword(false)
    setShowConfirmPassword(false)
    setRegisterAvatarUrl('')

    setTimeout(() => {
      setRegisterSuccess(false)
      setError('')
      setView('login')
    }, 3000)
  }

  const handleUserTypeSelect = async (isNew: boolean) => {
  const currentUser = useAuthStore.getState().user
  if (currentUser) {
    localStorage.setItem(`tutorial-done-${currentUser.id}`, 'true')
    if (!isNew) {
      localStorage.setItem(`tutorial-skipped-${currentUser.id}`, 'true')
    }
    // isNewUser 仅本地状态（新手引导流程用）
    login({ ...currentUser, isNewUser: isNew })
  }
  setShowUserType(false)
  navigate('/main')
  if (isNew) {
    setTutorialOpen(true)
  }
}

  const handleAssistantSelected = (assistantId: string) => {
    const currentUser = useAuthStore.getState().user
    if (currentUser) {
      localStorage.setItem(`assistant-selected-${currentUser.id}`, assistantId)
      updateSettings({ defaultAssistantId: assistantId })
    }
    setShowAssistantSelection(false)
    setShowAssistantWelcome(assistantId)
  }

  const handleStartUsing = () => {
    setShowAssistantWelcome(null)
    const currentUser = useAuthStore.getState().user
    if (currentUser) {
      const tutorialDone = localStorage.getItem(`tutorial-done-${currentUser.id}`)
      if (!tutorialDone) {
        setShowUserType(true)
      } else {
        navigate('/main')
      }
    } else {
      navigate('/main')
    }
  }

  const confirmDeleteUser = () => {
    if (!showDeleteConfirm) return
    const newDeleted = [...deletedUserIds, showDeleteConfirm]
    setDeletedUserIds(newDeleted)
    localStorage.setItem('deleted-user-ids', JSON.stringify(newDeleted))
    const deletedUser = allUsers.find((u) => u.id === showDeleteConfirm)
    if (deletedUser) {
      clearRememberPref(deletedUser.username)
    }
    if (selectedUserId === showDeleteConfirm) {
      setSelectedUserId(null)
      setLoginAccount('')
      setFormData((prev) => ({ ...prev, password: '' }))
      setRememberMe(false)
      setError('')
    }
    setShowDeleteConfirm(null)
  }

  const passwordStrength = getPasswordStrength(formData.password)

  const renderError = () => {
    if (!error || registerSuccess) return null
    if (error === 'not_found') {
      return (
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-red-500"
        >
          暂无账号，
          <span
            onClick={() => {
              setError('')
              setView('register')
            }}
            className="ml-1 text-primary-500 hover:text-primary-600 cursor-pointer underline"
          >
            去注册
          </span>
        </motion.p>
      )
    }
    if (error === 'wrong_password') {
      return (
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-red-500"
        >
          密码错误
        </motion.p>
      )
    }
    return (
      <motion.p
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-sm text-red-500"
      >
        {error}
      </motion.p>
    )
  }

  return (
    <div className="h-full w-full flex flex-col items-center justify-center relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-primary-400/20 rounded-full blur-3xl animate-float" />
        <div
          className="absolute bottom-20 right-20 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl animate-float"
          style={{ animationDelay: '1s' }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-pink-400/10 rounded-full blur-3xl animate-float"
          style={{ animationDelay: '2s' }}
        />
      </div>

      {/* 左上角返回按钮 */}
      {view !== 'home' && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
          <button
            onClick={() => {
              setView('home')
              setError('')
            }}
            className="p-2 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all"
            aria-label="返回"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      )}

      {/* 视图切换 */}
      <div className="relative z-10 w-full max-w-md px-4">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div
              key="home"
              variants={viewVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center text-center"
            >
              {/* Logo（相对路径：打包后经 file:// 加载 dist/ 下资源） */}
              <img
                src="./images/platform/logo.svg"
                alt="logo"
                className="w-24 h-24 mb-6"
              />

              {/* 平台名称 */}
              <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-2">
                栖屿数字人平台
              </h1>

              {/* 签名 */}
              <p className="text-gray-500 dark:text-gray-400 mb-10 text-lg">
                属于你的虚拟伙伴
              </p>

              {/* 按钮 */}
              <div className="flex flex-col gap-4 w-full max-w-xs">
                <button
                  onClick={() => setView('login')}
                  className="btn-primary w-full py-3 text-base"
                >
                  登录
                </button>
                <button
                  onClick={() => setView('register')}
                  className="btn-secondary w-full py-3 text-base"
                >
                  注册账号
                </button>
              </div>
            </motion.div>
          )}

          {view === 'login' && (
            <motion.div
              key="login"
              variants={viewVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center"
            >
              {/* 用户头像 */}
              <motion.div
                key={selectedUserId ?? 'no-user'}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-6 shadow-lg overflow-hidden"
                style={{
                  backgroundColor: selectedUser
                    ? getAvatarColor(getUserDisplayName(selectedUser))
                    : '#9ca3af',
                }}
              >
                {selectedUser ? (
                  selectedUser.avatarUrl ? (
                    <img src={avatarSrc(selectedUser.avatarUrl)} alt="头像" className="w-full h-full object-cover" />
                  ) : (
                    getUserDisplayName(selectedUser).charAt(0)
                  )
                ) : '？'}
              </motion.div>

              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">
                登录
              </h2>

              <div className="w-full space-y-4">
                {/* 账号可编辑下拉框（Combobox） */}
                <div className="relative" ref={dropdownRef}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    账号
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      autoComplete="off"
                      value={loginAccount}
                      onChange={(e) => {
                        const value = e.target.value
                        setLoginAccount(value)
                        setSelectedUserId(null)
                        setFormData((prev) => ({ ...prev, password: '' }))
                        setRememberMe(false)
                        setError('')

                        // 自动识别输入类型
                        if (/^\d{11}$/.test(value)) {
                          setAutoDetectedType('phone')
                          setInputType('auto')
                        } else if (value.includes('@')) {
                          setAutoDetectedType('email')
                          setInputType('auto')
                        } else {
                          setAutoDetectedType('')
                          setInputType('auto')
                        }
                      }}
                      onFocus={() => {
                        if (visibleUsers.length > 0) setIsDropdownOpen(true)
                      }}
                      className="input-field w-full pr-32"
                      placeholder="请输入手机号/邮箱或选择已有账号"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {/* 自动识别标签 */}
                      {loginAccount && (
                        <span
                          onClick={() => {
                            if (inputType === 'phone') {
                              setInputType('email')
                              setAutoDetectedType('email')
                            } else if (inputType === 'email') {
                              setInputType('phone')
                              setAutoDetectedType('phone')
                            } else if (autoDetectedType === 'phone') {
                              setInputType('email')
                            } else if (autoDetectedType === 'email') {
                              setInputType('phone')
                            }
                          }}
                          className="text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-600 cursor-pointer hover:bg-primary-200 transition-colors select-none"
                        >
                          {inputType === 'auto' ? (autoDetectedType || '请输入') : (inputType === 'phone' ? '手机号' : '邮箱')}
                        </span>
                      )}
                      {loginAccount && (
                        <button
                          type="button"
                          onClick={() => {
                            setLoginAccount('')
                            setSelectedUserId(null)
                            setFormData((prev) => ({ ...prev, password: '' }))
                            setRememberMe(false)
                            setError('')
                            setAutoDetectedType('')
                            setInputType('auto')
                          }}
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          aria-label="清空"
                        >
                          <X className="w-3 h-3 text-gray-400" />
                        </button>
                      )}
                      {visibleUsers.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          aria-label="展开下拉"
                        >
                          {isDropdownOpen ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 下拉列表 */}
                  <AnimatePresence>
                    {isDropdownOpen && visibleUsers.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.15 }}
                        className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden"
                      >
                        {visibleUsers.map((user) => (
                          <div
                            key={user.id}
                            onClick={() => {
                              // 来源B：从下拉列表选择账号
                              setSelectedUserId(user.id)
                              // 优先使用 phone，其次 email
                              const accountForLogin = user.phone || user.email || user.username
                              setLoginAccount(accountForLogin)
                              setIsDropdownOpen(false)
                              setError('')

                              // 自动识别类型
                              if (user.phone && accountForLogin === user.phone) {
                                setAutoDetectedType('phone')
                              } else if (user.email && accountForLogin === user.email) {
                                setAutoDetectedType('email')
                              }
                              setInputType('auto')

                              const pref = getRememberPref(accountForLogin)
                              setRememberMe(pref)
                              if (pref) {
                                const savedPwd = getRememberedPassword(accountForLogin) || user.password || ''
                                setFormData((prev) => ({ ...prev, password: savedPwd }))
                              } else {
                                setFormData((prev) => ({ ...prev, password: '' }))
                              }
                            }}
                            className={`w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 group cursor-pointer ${
                              selectedUserId === user.id
                                ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                                : 'text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 flex-1">
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 overflow-hidden"
                                style={{ backgroundColor: getAvatarColor(getUserDisplayName(user)) }}
                              >
                                {user.avatarUrl ? (
                                  <img src={avatarSrc(user.avatarUrl)} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  getUserDisplayName(user).charAt(0)
                                )}
                              </div>
                              <div>
                                <div className="font-medium">{getUserDisplayName(user)}</div>
                                <div className="text-xs text-gray-400">
                                  {user.phone ? `手机号：${maskPhone(user.phone)}` : ''}
                                  {user.email ? (user.phone ? ' | ' : '') + `邮箱：${maskEmail(user.email)}` : ''}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowDeleteConfirm(user.id)
                              }}
                              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 opacity-0 group-hover:opacity-100 transition-opacity"
                              aria-label="删除账号记录"
                            >
                              <X className="w-3 h-3 text-red-500" />
                            </button>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* 密码 / 验证码 */}
                <AnimatePresence mode="wait">
                  {loginMode === 'password' ? (
                    <motion.div
                      key="password-field"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        密码
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={formData.password}
                          onChange={(e) =>
                            setFormData({ ...formData, password: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleLogin()
                          }}
                          className="input-field pr-10"
                          placeholder="请输入密码"
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
                    </motion.div>
                  ) : (
                    <motion.div
                      key="verifycode-field"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        验证码
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={formData.verifyCode}
                          onChange={(e) =>
                            setFormData({ ...formData, verifyCode: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleLogin()
                          }}
                          className="input-field flex-1"
                          placeholder="请输入验证码"
                        />
                        <button
                          type="button"
                          onClick={() => handleSendVerifyCode(loginAccount, 'login')}
                          disabled={countdown > 0 || isSending}
                          className={`btn-secondary whitespace-nowrap px-4 flex items-center gap-1 ${
                            countdown > 0 || isSending ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          {isSending ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              发送中...
                            </>
                          ) : countdown > 0 ? `${countdown}秒后重发` : '获取验证码'}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 记住我与登录模式切换 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      id="remember-me"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setRememberMe(checked)
                        if (loginAccount) {
                          setRememberPref(loginAccount, checked)
                        }
                      }}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                    />
                    <label
                      htmlFor="remember-me"
                      className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none"
                    >
                      记住我
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMode((prev) => (prev === 'password' ? 'verifyCode' : 'password'))
                      setError('')
                    }}
                    className="text-sm text-primary-500 hover:text-primary-600 transition-colors"
                  >
                    {loginMode === 'password' ? '选择使用验证码登录' : '使用密码登录'}
                  </button>
                </div>

                {/* 错误提示 */}
                {renderError()}

                {/* 登录按钮 */}
                <button
                  onClick={handleLogin}
                  className="btn-primary w-full py-3"
                >
                  登录
                </button>

                {/* 去注册 */}
                <button
                  onClick={() => {
                    setError('')
                    setView('register')
                  }}
                  className="text-sm text-primary-500 hover:text-primary-600 transition-colors w-full text-center"
                >
                  没有账号？来注册一个账号吧！
                </button>

                {/* 忘记密码 */}
                <button
                  onClick={() => navigate('/forgot-password')}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors w-full text-center"
                >
                  忘记密码？
                </button>
              </div>
            </motion.div>
          )}

          {view === 'register' && (
            <motion.div
              key="register"
              variants={viewVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center"
            >
              {/* 实时头像预览 */}
              <motion.div
                key={registerAvatarUrl ? 'custom' : (formData.nickname.charAt(0) || 'empty')}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.15 }}
                className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-2 shadow-lg overflow-hidden"
                style={{
                  backgroundColor: registerAvatarUrl
                    ? 'transparent'
                    : formData.nickname.trim()
                      ? getAvatarColor(formData.nickname.trim())
                      : '#9ca3af',
                }}
              >
                {registerAvatarUrl ? (
                  <img src={registerAvatarUrl} alt="头像" className="w-full h-full object-cover" />
                ) : formData.nickname.trim()
                  ? formData.nickname.trim().charAt(0)
                  : '？'}
              </motion.div>

              {/* 设置头像按钮 */}
              <button
                type="button"
                onClick={handleRegisterAvatarClick}
                className="text-sm text-primary-500 hover:text-primary-600 transition-colors mb-4"
              >
                + 设置头像
              </button>
              <input
                ref={registerFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleRegisterFileChange}
              />

              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">
                注册
              </h2>

              <div className="w-full space-y-4">
                {/* 用户昵称 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    用户昵称
                  </label>
                  <input
                    type="text"
                    value={formData.nickname}
                    onChange={(e) => {
                      setFormData({ ...formData, nickname: e.target.value })
                      setError('')
                    }}
                    className="input-field"
                    placeholder="请输入你的昵称"
                    maxLength={20}
                  />
                </div>

                {/* 手机号/邮箱（二选一） */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {registerContactType === 'phone' ? '手机号' : '邮箱'}
                  </label>
                  <div className="relative flex">
                    <button
                      type="button"
                      onClick={() => setShowContactDropdown(!showContactDropdown)}
                      className="flex items-center gap-1 px-3 py-2 rounded-l-lg border border-r-0 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 whitespace-nowrap"
                    >
                      {registerContactType === 'phone' ? '手机号' : '邮箱'}
                      <svg className={`w-3 h-3 transition-transform ${showContactDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {showContactDropdown && (
                      <div className="absolute top-full left-0 mt-1 z-20 w-24 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg">
                        <button
                          type="button"
                          onClick={() => {
                            setRegisterContactType('phone')
                            setShowContactDropdown(false)
                            setFormData({ ...formData, phone: '', email: '' })
                            setInputError('')
                            setError('')
                          }}
                          className={`block w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 ${registerContactType === 'phone' ? 'text-blue-500 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                        >
                          手机号
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRegisterContactType('email')
                            setShowContactDropdown(false)
                            setFormData({ ...formData, phone: '', email: '' })
                            setInputError('')
                            setError('')
                          }}
                          className={`block w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 ${registerContactType === 'email' ? 'text-blue-500 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                        >
                          邮箱
                        </button>
                      </div>
                    )}
                    <input
                      type="text"
                      value={registerContactType === 'phone' ? formData.phone : formData.email}
                      onChange={(e) => {
                        if (registerContactType === 'phone') {
                          setFormData({ ...formData, phone: e.target.value, email: '' })
                        } else {
                          setFormData({ ...formData, email: e.target.value, phone: '' })
                        }
                        setInputError('')
                        setError('')
                      }}
                      className={`input-field flex-1 rounded-l-none ${inputError === registerContactType ? 'border-red-500' : ''}`}
                      placeholder={registerContactType === 'phone' ? '请输入手机号' : '请输入邮箱'}
                      maxLength={registerContactType === 'phone' ? 11 : undefined}
                    />
                  </div>
                </div>

                {/* 密码 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    密码
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      className="input-field pr-10"
                      placeholder="请输入密码"
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
                  {/* 密码强度进度条 */}
                  {formData.password && (
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

                {/* 确认密码 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    确认密码
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={formData.confirmPassword}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          confirmPassword: e.target.value,
                        })
                      }
                      className="input-field pr-10"
                      placeholder="请再次输入密码"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
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

                {/* 验证码 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    验证码
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.verifyCode}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          verifyCode: e.target.value,
                        })
                      }
                      className="input-field flex-1"
                      placeholder="请输入验证码"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const target = registerContactType === 'phone' ? formData.phone : formData.email
                        handleSendVerifyCode(target, 'register')
                      }}
                      disabled={countdown > 0 || isSending}
                      className={`btn-secondary whitespace-nowrap px-4 flex items-center gap-1 ${
                        countdown > 0 || isSending ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {isSending ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          发送中...
                        </>
                      ) : countdown > 0 ? `${countdown}秒后重发` : '获取验证码'}
                    </button>
                  </div>
                </div>

                {/* 注册成功提示 */}
                {registerSuccess && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-green-500"
                  >
                    注册成功，3秒后跳转至登录界面
                  </motion.p>
                )}

                {/* 错误提示 */}
                {renderError()}

                {/* 注册按钮 */}
                {!registerSuccess && (
                  <button
                    onClick={handleRegister}
                    disabled={
                      !formData.nickname.trim() ||
                      (!formData.phone && !formData.email) ||
                      !formData.password ||
                      !formData.confirmPassword ||
                      !formData.verifyCode ||
                      !verifyCodeSent
                    }
                    className={`btn-primary w-full py-3 ${
                      !formData.nickname.trim() ||
                      (!formData.phone && !formData.email) ||
                      !formData.password ||
                      !formData.confirmPassword ||
                      !formData.verifyCode ||
                      !verifyCodeSent
                        ? 'opacity-50 cursor-not-allowed'
                        : ''
                    }`}
                  >
                    注册
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 删除账号确认弹窗 */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card max-w-sm w-full text-center"
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
                删除确认
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                是否删除该账号记录？
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={confirmDeleteUser}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
                >
                  确认
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 输错3次密码提示弹窗 */}
      <AnimatePresence>
        {showLoginHelpModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card max-w-sm w-full text-center"
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
                登录提示
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                是否选择【忘记密码】或【验证码登录】？
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowLoginHelpModal(false)
                    navigate('/forgot-password')
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  忘记密码
                </button>
                <button
                  onClick={() => {
                    setShowLoginHelpModal(false)
                    setLoginMode('verifyCode')
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-primary-500 text-white font-medium hover:bg-primary-600 transition-colors"
                >
                  验证码登录
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 新手/老手引导 */}
      <AnimatePresence>
       {showUserType && (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    onClick={() => {
      // 点击背景不关闭，防止误触
    }}
  >
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      className="card max-w-md w-full text-center"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
        您是新手还是老用户？
      </h2>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        这将帮助我们为您提供更好的体验
      </p>
      <div className="flex gap-4">
        <button
          onClick={() => handleUserTypeSelect(true)}
          className="flex-1 py-4 bg-primary-50 dark:bg-primary-900/20 border-2 border-primary-200 dark:border-primary-800 rounded-xl hover:border-primary-400 dark:hover:border-primary-600 transition-colors"
        >
          <Sparkles className="w-8 h-8 text-primary-500 mx-auto mb-2" />
          <span className="font-semibold text-primary-700 dark:text-primary-300 block">
            我是新手，需要完整教程
          </span>
        </button>
        <button
          onClick={() => handleUserTypeSelect(false)}
          className="flex-1 py-4 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
        >
          <UserIcon className="w-8 h-8 text-gray-500 mx-auto mb-2" />
          <span className="font-semibold text-gray-700 dark:text-gray-300 block">
            我是老手，跳过教程
          </span>
        </button>
      </div>
    </motion.div>
  </motion.div>
)}
      </AnimatePresence>

      {/* AI助手选择弹窗（首次登录） */}
      <AnimatePresence>
        {showAssistantSelection && (
          <AssistantSelectionPopup onSelect={handleAssistantSelected} />
        )}
      </AnimatePresence>

      {/* AI助手欢迎页（"你的第一位伙伴"） */}
      <AnimatePresence>
        {showAssistantWelcome && (
          <AssistantWelcomePage
            assistantId={showAssistantWelcome}
            onStart={handleStartUsing}
          />
        )}
      </AnimatePresence>

      {/* 注册界面设置头像权限询问弹窗 */}
      <AnimatePresence>
        {showRegisterAvatarPermission && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card max-w-sm w-full text-center"
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">
                提示
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                是否允许平台读取本地文件？
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleRegisterPermissionDeny}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  拒绝
                </button>
                <button
                  onClick={handleRegisterPermissionAllow}
                  className="flex-1 py-2.5 rounded-xl bg-primary-500 text-white font-medium hover:bg-primary-600 transition-colors"
                >
                  允许
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
