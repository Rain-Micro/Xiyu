import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Globe, Type, Palette, Save, Info, FolderOpen, Headphones, Trash2, Shield } from 'lucide-react'
import { useSettingsStore, useUIStore, useAuthStore } from '@/stores'
import { useNavigate } from 'react-router-dom'
import { db } from '@/services/db'

const tabs = [
  { id: 'basic', label: '基础设置', icon: Globe },
  { id: 'save', label: '保存设置', icon: Save },
  { id: 'about', label: '关于', icon: Info }
]

export default function SettingsPanel() {
  const { settings, updateSettings } = useSettingsStore()
  const { setSettingsOpen } = useUIStore()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('basic')
  const [showClearDataConfirm, setShowClearDataConfirm] = useState(false)

  // 管理员由服务端 JWT role 驱动（不再信任前端邮箱白名单）
  const isAdmin = user?.role === 'admin'

  const handleClearAllData = async () => {
    // 清空 IndexedDB 用户数据
    await db.users.clear()
    // 清空 localStorage 账号相关数据
    localStorage.removeItem('remembered-credentials')
    localStorage.removeItem('remember-prefs')
    localStorage.removeItem('deleted-user-ids')
    setShowClearDataConfirm(false)
    setSettingsOpen(false)
    // 刷新页面
    window.location.reload()
  }

  const handleSelectFolder = async (type: 'autoSave' | 'emergency') => {
    const input = document.createElement('input')
    input.type = 'file'
    input.webkitdirectory = true
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files && files.length > 0) {
        const filePath = (files[0] as File & { path: string }).path || files[0].name
        if (type === 'autoSave') {
          updateSettings({ autoSavePath: filePath })
        } else {
          updateSettings({ emergencySavePath: filePath })
        }
      }
    }
    input.click()
  }

  if (!settings) return null

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.9, opacity: 0, y: 20 }}
      className="card max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden"
    >
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="w-8 h-8"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-primary-500">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </motion.div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">设置</h2>
        </div>
        <button onClick={() => setSettingsOpen(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="flex gap-4 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {activeTab === 'basic' && (
          <div className="space-y-6">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Globe className="w-4 h-4" />
                语言
              </label>
              <select
                value={settings.language}
                onChange={(e) => updateSettings({ language: e.target.value as 'zh-CN' | 'en' })}
                className="input-field"
              >
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
              </select>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Type className="w-4 h-4" />
                字体大小
              </label>
              <div className="flex gap-2">
                {(['small', 'medium', 'large'] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => updateSettings({ fontSize: size })}
                    className={`flex-1 py-2 rounded-lg border-2 transition-colors ${
                      settings.fontSize === size
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    {size === 'small' && '小'}
                    {size === 'medium' && '中'}
                    {size === 'large' && '大'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Palette className="w-4 h-4" />
                主题
              </label>
              <div className="flex gap-2">
                {(['light', 'dark', 'system'] as const).map((theme) => (
                  <button
                    key={theme}
                    onClick={() => updateSettings({ theme })}
                    className={`flex-1 py-2 rounded-lg border-2 transition-colors ${
                      settings.theme === theme
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    {theme === 'light' && '浅色'}
                    {theme === 'dark' && '深色'}
                    {theme === 'system' && '跟随系统'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'save' && (
          <div className="space-y-6">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <FolderOpen className="w-4 h-4" />
                自动保存路径
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.autoSavePath}
                  readOnly
                  className="input-field flex-1"
                />
                <button
                  onClick={() => handleSelectFolder('autoSave')}
                  className="btn-secondary"
                >
                  选择
                </button>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Save className="w-4 h-4" />
                自动保存间隔（分钟）
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={settings.autoSaveInterval}
                onChange={(e) => updateSettings({ autoSaveInterval: parseInt(e.target.value) || 5 })}
                className="input-field"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <FolderOpen className="w-4 h-4" />
                问题保存路径（紧急存档）
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.emergencySavePath}
                  readOnly
                  className="input-field flex-1"
                />
                <button
                  onClick={() => handleSelectFolder('emergency')}
                  className="btn-secondary"
                >
                  选择
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'about' && (
          <div className="text-center space-y-4">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-primary-400 to-purple-500 rounded-2xl flex items-center justify-center">
              <span className="text-3xl font-bold text-white">DHP</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">栖屿数字人平台</h3>
              <p className="text-gray-500 dark:text-gray-400">版本 {__APP_VERSION__}</p>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
              <p>社团开源项目</p>
              <p>2026 栖屿数字人平台</p>
              <p className="text-xs">MIT License</p>
            </div>
            <div className="pt-4 space-y-3">
              <button
                onClick={() => {
                  setSettingsOpen(false)
                  navigate('/customer-service')
                }}
                className="w-full py-2.5 text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/20 border-2 border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors flex items-center justify-center gap-2"
              >
                <Headphones className="w-4 h-4" />
                客服中心
              </button>
              {isAdmin && (
                <button
                  onClick={() => {
                    setSettingsOpen(false)
                    navigate('/admin')
                  }}
                  className="w-full py-2.5 text-white bg-primary-500 rounded-xl shadow-soft hover:shadow-soft-md transition-all flex items-center justify-center gap-2"
                >
                  <Shield className="w-4 h-4" />
                  管理后台
                </button>
              )}
              <button
                onClick={() => setShowClearDataConfirm(true)}
                className="w-full py-2.5 text-red-500 border-2 border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                清空所有本地账号数据
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 清空账号数据确认弹窗 */}
      {showClearDataConfirm && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-10">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="card max-w-sm w-full mx-4"
          >
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">确认清空？</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              确定要清空所有本地账号记录吗？此操作不可恢复。
            </p>
            <div className="flex gap-3">
              <button onClick={handleClearAllData} className="btn-primary flex-1 bg-red-500 hover:bg-red-600">
                确认清空
              </button>
              <button onClick={() => setShowClearDataConfirm(false)} className="btn-secondary flex-1">
                取消
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </motion.div>
  )
}
