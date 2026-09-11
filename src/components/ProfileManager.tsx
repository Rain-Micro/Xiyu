import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Save, Upload, Download, Trash2, FileText } from 'lucide-react'
import { useCharacterStore, useUIStore } from '@/stores'
import { formatDate } from '@/utils/dateFormat'
import type { CharacterProfile } from '@/types'

interface SavedProfile {
  id: string
  name: string
  profile: CharacterProfile
  savedAt: number
}

export default function ProfileManager() {
  const { currentCharacter, updateCharacter } = useCharacterStore()
  const { addNotification } = useUIStore()
  const [showManager, setShowManager] = useState(false)
  const [savedProfiles, setSavedProfiles] = useState<SavedProfile[]>(() => {
    const stored = localStorage.getItem('saved-profiles')
    return stored ? JSON.parse(stored) : []
  })
  const [profileName, setProfileName] = useState('')

  const handleSaveProfile = () => {
    if (!currentCharacter) return
    if (!profileName.trim()) {
      addNotification({
        id: `err-${Date.now()}`,
        type: 'warning',
        title: '保存失败',
        message: '请输入档案名称',
        timestamp: Date.now(),
        read: false
      })
      return
    }

    const newProfile: SavedProfile = {
      id: `profile-save-${Date.now()}`,
      name: profileName.trim(),
      profile: currentCharacter.profile,
      savedAt: Date.now()
    }

    const updated = [...savedProfiles, newProfile]
    setSavedProfiles(updated)
    localStorage.setItem('saved-profiles', JSON.stringify(updated))
    setProfileName('')

    addNotification({
      id: `save-${Date.now()}`,
      type: 'success',
      title: '档案已保存',
      message: `角色档案「${newProfile.name}」已保存`,
      timestamp: Date.now(),
      read: false
    })
  }

  const handleLoadProfile = (saved: SavedProfile) => {
    if (!currentCharacter) return

    updateCharacter({
      ...currentCharacter,
      profile: {
        ...saved.profile,
        id: currentCharacter.profile.id,
        userId: currentCharacter.profile.userId,
        updatedAt: Date.now()
      }
    })

    addNotification({
      id: `load-${Date.now()}`,
      type: 'success',
      title: '档案已加载',
      message: `已加载角色档案「${saved.name}」`,
      timestamp: Date.now(),
      read: false
    })
  }

  const handleDeleteProfile = (id: string) => {
    const updated = savedProfiles.filter((p) => p.id !== id)
    setSavedProfiles(updated)
    localStorage.setItem('saved-profiles', JSON.stringify(updated))
  }

  const handleExportProfile = () => {
    if (!currentCharacter) return
    const dataStr = JSON.stringify(currentCharacter.profile, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${currentCharacter.profile.name}_profile.json`
    link.click()
    URL.revokeObjectURL(url)

    addNotification({
      id: `export-${Date.now()}`,
      type: 'success',
      title: '档案已导出',
      message: '角色档案已导出为 JSON 文件',
      timestamp: Date.now(),
      read: false
    })
  }

  const handleImportProfile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const profile = JSON.parse(event.target?.result as string)
        if (currentCharacter) {
          updateCharacter({
            ...currentCharacter,
            profile: {
              ...profile,
              id: currentCharacter.profile.id,
              userId: currentCharacter.profile.userId,
              updatedAt: Date.now()
            }
          })
          addNotification({
            id: `import-${Date.now()}`,
            type: 'success',
            title: '档案已导入',
            message: `成功导入角色档案「${profile.name}」`,
            timestamp: Date.now(),
            read: false
          })
        }
      } catch {
        addNotification({
          id: `import-err-${Date.now()}`,
          type: 'error',
          title: '导入失败',
          message: '文件格式不正确',
          timestamp: Date.now(),
          read: false
        })
      }
    }
    reader.readAsText(file)
  }

  return (
    <>
      <button
        onClick={() => setShowManager(true)}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        title="角色档案"
      >
        <FileText className="w-4 h-4 text-gray-600 dark:text-gray-400" />
      </button>

      <AnimatePresence>
        {showManager && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card max-w-lg w-full mx-4 max-h-[80vh] flex flex-col"
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800 dark:text-white">角色档案管理</h2>
                <button
                  onClick={() => setShowManager(false)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* 保存当前档案 */}
              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">保存当前档案</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="输入档案名称..."
                    className="input-field flex-1 text-sm"
                  />
                  <button
                    onClick={handleSaveProfile}
                    className="btn-primary flex items-center gap-1"
                  >
                    <Save className="w-4 h-4" />
                    保存
                  </button>
                </div>
              </div>

              {/* 导入/导出 */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={handleExportProfile}
                  className="flex-1 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <Download className="w-4 h-4" />
                  导出档案
                </button>
                <label className="flex-1 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer">
                  <Upload className="w-4 h-4" />
                  导入档案
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportProfile}
                    className="hidden"
                  />
                </label>
              </div>

              {/* 已保存的档案列表 */}
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">已保存的档案</h3>
                {savedProfiles.length === 0 ? (
                  <p className="text-center text-gray-400 py-4">暂无保存的档案</p>
                ) : (
                  <div className="space-y-2">
                    {savedProfiles.map((profile) => (
                      <div
                        key={profile.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-800 dark:text-white">{profile.name}</p>
                          <p className="text-xs text-gray-500">
                            {profile.profile.name} · {formatDate(profile.savedAt)}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleLoadProfile(profile)}
                            className="p-1.5 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 text-primary-600"
                            title="加载"
                          >
                            <Upload className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProfile(profile.id)}
                            className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
