import { useState, useEffect } from 'react'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { RefreshCw, BookOpen, User, Settings, Home } from 'lucide-react'
import { useAuthStore, useSettingsStore, useUIStore, useCharacterStore } from '@/stores'
import { db } from '@/services/db'
import { api, getToken } from '@/services/apiClient'
import { fetchMe } from '@/services/authAPI'
import { checkForUpdate } from '@/services/updateService'
import WelcomePage from '@/pages/WelcomePage'
import MainPage from '@/pages/MainPage'
import ForgetPasswordPage from '@/pages/ForgetPasswordPage'
import UserProfilePage from '@/pages/UserProfilePage'
import ChangePasswordPage from '@/pages/ChangePasswordPage'
import CustomerServicePage from '@/pages/CustomerServicePage'
import AdminCustomerServicePage from '@/pages/AdminCustomerServicePage'
import CreateCharacterPage from '@/pages/CreateCharacterPage'
import ChatPage from '@/pages/ChatPage'
import CharacterSettingsPage from '@/pages/CharacterSettingsPage'
import SearchChatPage from '@/pages/SearchChatPage'
import UserModulePage from '@/pages/UserModulePage'
import UserPreferencesPage from '@/pages/UserPreferencesPage'
import SettingsPanel from '@/components/SettingsPanel'
import CharacterContactList from '@/components/CharacterContactList'
import CreateCharacter from '@/components/CreateCharacter'
import AIAssistant from '@/components/AIAssistant'
import NotificationToast from '@/components/NotificationToast'
import HealthReminder from '@/components/HealthReminder'
import FirstTimeGuide from '@/components/FirstTimeGuide'
import FavoritesPage from '@/pages/FavoritesPage'
import ErrorBoundary from '@/components/ErrorBoundary'
import RequireAuth from '@/components/RequireAuth'
import AdminConsolePage from '@/pages/AdminConsolePage'


function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isLoggedIn, user } = useAuthStore()
  const { loadSettings } = useSettingsStore()
  const { loadCharacters } = useCharacterStore()
  const {
    isSettingsOpen,
    isCharacterSelectorOpen,
    isCreateCharacterOpen,
    incrementOnlineTime,
    isRefreshConfirmOpen,
    setRefreshConfirmOpen,
    setSettingsOpen,
    isTutorialOpen,
    setTutorialOpen,
    addNotification,
  } = useUIStore()
  const [showSecondConfirm, setShowSecondConfirm] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    db.initializeDefaults().catch((err) => {
      console.warn('[App] 数据库初始化失败，但不影响应用运行:', err)
    })
    loadSettings()

    // 启动时自动修复脏数据
    const repairData = async () => {
      const users = await db.users.toArray()
      for (const u of users) {
        const updates: Record<string, unknown> = {}
        if (!u.userId) {
          // 缺失 userId，生成一个
          const today = new Date(u.createdAt || Date.now())
          const dateStr = today.getFullYear().toString() +
            String(today.getMonth() + 1).padStart(2, '0') +
            String(today.getDate()).padStart(2, '0')
          updates.userId = `U${dateStr}000`
        }
        if (!u.nickname && u.nickname !== '') {
          updates.nickname = ''
        }
        if (!u.phone && u.phone !== '') {
          updates.phone = ''
        }
        if (!u.email && u.email !== '') {
          updates.email = ''
        }
        if (Object.keys(updates).length > 0) {
          await db.users.update(u.id, updates)
        }
      }
    }
    repairData().catch(() => { /* ignore */ })
  }, [loadSettings])

  // 在线时长计时器
  useEffect(() => {
    if (!isLoggedIn) return
    const interval = setInterval(() => {
      incrementOnlineTime()
    }, 60000) // 每分钟增加
    return () => clearInterval(interval)
  }, [isLoggedIn, incrementOnlineTime])

  // 页面刷新后恢复角色列表（角色 store 非持久化，需重新加载）
  useEffect(() => {
    if (isLoggedIn && user?.id) {
      loadCharacters(user.id)
      loadSettings() // 登录后重新加载设置，确保 defaultAssistantId 恢复
    }
  }, [isLoggedIn, user?.id, loadCharacters, loadSettings])

  // 会话校验：刷新后用 JWT 向服务端确认身份并刷新 role；过期则登出
  useEffect(() => {
    if (!isLoggedIn || !getToken()) return
    const { logout, updateUser } = useAuthStore.getState()
    fetchMe()
      .then(({ user: me }) => {
        updateUser({ role: me.role, nickname: me.nickname, avatarUrl: me.avatar_url })
        // 注册时暂存待上传的头像
        const pending = localStorage.getItem('pending-avatar')
        if (pending) {
          api<{ user?: { avatar_url?: string } }>({ method: 'PATCH', path: '/api/users/me', body: { avatar: pending } })
            .then((res: { user?: { avatar_url?: string } }) => {
              updateUser({ avatarUrl: res.user?.avatar_url || pending })
            })
            .catch(() => { /* 头像补传失败不影响使用 */ })
            .finally(() => localStorage.removeItem('pending-avatar'))
        }
      })
      .catch((err) => {
        console.warn('[App] 会话已失效:', err?.message || err)
        if (!getToken()) {
          logout()
        }
      })
  }, [isLoggedIn])

  // 版本检查（仅提示式）：静默比对远程最新版本，落后则通知用户前往下载页
  useEffect(() => {
    checkForUpdate()
      .then((r) => {
        if (r?.hasUpdate) {
          addNotification({
            id: `app-update-${Date.now()}`,
            type: 'info',
            title: `发现新版本 v${r.latest}`,
            message: '当前版本较旧，正在为你打开下载页面…',
            timestamp: Date.now(),
            read: false,
            duration: 8000,
          })
          setTimeout(() => window.open(r.url, '_blank'), 1500)
        }
      })
      .catch(() => { /* 静默失败 */ })
  }, [])

  // 会话过期治理：apiClient 遇 401 清 token 后广播事件 → 同步登出本地状态
  useEffect(() => {
    const onExpired = () => useAuthStore.getState().logout()
    window.addEventListener('qiyu:session-expired', onExpired)
    return () => window.removeEventListener('qiyu:session-expired', onExpired)
  }, [])

  // 登录后拉取全站公告（后台配置），有则通知展示一次
  useEffect(() => {
    if (!isLoggedIn) return
    api<{ announcement?: string }>({ path: '/api/announcements' })
      .then(({ announcement }) => {
        if (announcement && announcement.trim()) {
          addNotification({
            id: `announcement-${Date.now()}`,
            type: 'info',
            title: '平台公告',
            message: announcement.trim().slice(0, 200),
            timestamp: Date.now(),
            read: false,
            duration: 10000,
          })
        }
      })
      .catch(() => { /* 静默 */ })
  }, [isLoggedIn, addNotification])

  // 残留登录态直达：仅应用冷启动时判定一次（zustand persist 同步水合，挂载即得真值）。
  // 不做成响应式：登录动作本身置 isLoggedIn=true 时若还在 '/'，会把带引导弹窗的
  // WelcomePage（助手选择/新手询问）抢先卸载——新账号将不再被询问偏好（R3 引入的回归）
  useEffect(() => {
    // 会话一致性：token 是会话的真源（未勾"记住我"的 token 存 sessionStorage，随进程结束清除）。
    // 冷启动无 token（或已过期被清）→ 立即清登录态，落到登录页而非"无 token 的幽灵已登录态"
    if (!getToken()) {
      const { isLoggedIn: wasLogged } = useAuthStore.getState()
      if (wasLogged) useAuthStore.getState().logout()
      return
    }
    const { isLoggedIn: logged, user: u } = useAuthStore.getState()
    const atRoot = window.location.hash === '' || window.location.hash === '#' || window.location.hash === '#/'
    if (logged && u && atRoot) {
      navigate('/main', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 主题切换
  useEffect(() => {
    const settings = useSettingsStore.getState().settings
    if (!settings) return

    const applyTheme = () => {
      if (settings.theme === 'dark') {
        document.documentElement.classList.add('dark')
      } else if (settings.theme === 'light') {
        document.documentElement.classList.remove('dark')
      } else {
        // 跟随系统
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      }
    }

    applyTheme()

    if (settings.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      mediaQuery.addEventListener('change', applyTheme)
      return () => mediaQuery.removeEventListener('change', applyTheme)
    }
  }, [useSettingsStore.getState().settings?.theme])

  // 字体大小
  useEffect(() => {
    const settings = useSettingsStore.getState().settings
    if (!settings) return

    const sizes = { small: '14px', medium: '16px', large: '18px' }
    document.documentElement.style.fontSize = sizes[settings.fontSize]
  }, [useSettingsStore.getState().settings?.fontSize])

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      {/* 全局顶部图标栏 */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2">
        <button
          onClick={() => setRefreshConfirmOpen(true)}
          className="p-2 rounded-full bg-surface dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-soft hover:shadow-soft-md transition-all"
          title="刷新"
        >
          <RefreshCw className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        {isLoggedIn && location.pathname !== '/main' && (
          <button
            onClick={() => navigate('/main')}
            className="p-2 rounded-full bg-surface dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-soft hover:shadow-soft-md transition-all"
            title="回到主页"
          >
            <Home className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </button>
        )}
        {isLoggedIn && (
          <>
            <button
              onClick={() => setTutorialOpen(true)}
              data-guide="tutorial-button"
              className="p-2 rounded-full bg-surface dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-soft hover:shadow-soft-md transition-all"
              title="教程"
            >
              <BookOpen className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </button>
            <button
              id="btn-user"
              onClick={() => navigate('/user-module')}
              className="p-2 rounded-full bg-surface dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-soft hover:shadow-soft-md transition-all"
              title="用户"
            >
              <User className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </button>
          </>
        )}
        <button
          id="btn-settings"
          onClick={() => setSettingsOpen(true)}
          className="p-2 rounded-full bg-surface dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-soft hover:shadow-soft-md transition-all"
          title="设置"
        >
          <Settings className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </button>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {/* 路由级错误边界：页面渲染崩溃时给出可操作兜底（回主页/刷新），key 随路由复位 */}
        <ErrorBoundary key={location.pathname}>
        <AnimatePresence mode="wait" key={refreshKey}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/forgot-password" element={<ForgetPasswordPage />} />
          <Route path="/main" element={<RequireAuth><MainPage /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><UserProfilePage /></RequireAuth>} />
          <Route path="/change-password" element={<RequireAuth><ChangePasswordPage /></RequireAuth>} />
          <Route path="/customer-service" element={<RequireAuth><CustomerServicePage /></RequireAuth>} />
          <Route path="/admin/customer-service" element={<RequireAuth><AdminCustomerServicePage /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth><AdminConsolePage /></RequireAuth>} />
          <Route path="/create-character" element={<RequireAuth><CreateCharacterPage /></RequireAuth>} />
          <Route path="/chat" element={<RequireAuth><ChatPage /></RequireAuth>} />
          <Route path="/character-settings" element={<RequireAuth><CharacterSettingsPage /></RequireAuth>} />
          <Route path="/search-chat" element={<RequireAuth><SearchChatPage /></RequireAuth>} />
          <Route path="/user-module" element={<RequireAuth><UserModulePage /></RequireAuth>} />
          <Route path="/user-module/favorites" element={<RequireAuth><FavoritesPage /></RequireAuth>} />
          <Route path="/user-module/preferences" element={<RequireAuth><UserPreferencesPage /></RequireAuth>} />
        </Routes>
      </AnimatePresence>
      </ErrorBoundary>

      {/* 全局弹窗 */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <SettingsPanel />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCharacterSelectorOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <CharacterContactList />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCreateCharacterOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <CreateCharacter />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 刷新确认弹窗 */}
      <AnimatePresence>
        {isRefreshConfirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="card max-w-md w-full mx-4 p-6"
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">刷新确认</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">是否要刷新界面，并保存该页面未保存的内容？</p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setRefreshConfirmOpen(false)
                    setRefreshKey((k) => k + 1)
                  }}
                  className="btn-primary flex-1 py-2"
                >
                  保存并刷新
                </button>
                <button
                  onClick={() => {
                    setRefreshConfirmOpen(false)
                    setShowSecondConfirm(true)
                  }}
                  className="btn-secondary flex-1 py-2"
                >
                  不保存
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 第二次确认弹窗 */}
      <AnimatePresence>
        {showSecondConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="card max-w-md w-full mx-4 p-6"
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">确认刷新</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">是否真的直接刷新该界面不保存？</p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowSecondConfirm(false)
                    setRefreshKey((k) => k + 1)
                  }}
                  className="btn-primary flex-1 py-2"
                >
                  确认刷新
                </button>
                <button
                  onClick={() => setShowSecondConfirm(false)}
                  className="btn-secondary flex-1 py-2"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {/* 新用户首次进入主界面引导（全局教程进行中不渲染，避免双教程同屏） */}
      {isLoggedIn && location.pathname === '/main' && !isTutorialOpen && (
        <FirstTimeGuide
          storageKey="has_seen_main_interface_guide"
          position="center"
          steps={[
            {
              title: '欢迎使用栖屿数字人平台',
              content: '您可以在这里与AI助手和自建角色互动聊天。\n下面快速了解一下基础操作。',
            },
            {
              title: '发送消息',
              content: '点击左侧通讯录中的任意角色或助手，进入聊天界面。\n在输入框中输入文字，按 Enter 键或点击发送按钮即可发送消息。',
            },
            {
              title: '切换聊天对象',
              content: '点击左上角的通讯录入口，在列表中选择不同的角色或助手，即可切换聊天对象。',
            },
            {
              title: '更多功能',
              content: '聊天界面还支持语音消息、图片发送、消息编辑等丰富功能。\n进入聊天界面后会有更多引导提示。\n\n如需查看完整教程，点击右上角的 📖 教程按钮。',
            },
          ]}
        />
      )}

      {/* AI小助手（悬浮窗+常驻按钮） */}
      <AIAssistant />

      {/* 通知和健康提醒 */}
      <NotificationToast />
      <HealthReminder />
    </div>
  )
}

export default App