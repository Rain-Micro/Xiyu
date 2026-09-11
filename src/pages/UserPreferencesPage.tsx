import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  RotateCcw,
  Bell,
  Heart,
  MessageSquare,
  MessageCircle,
  Mic,
  ShieldCheck,
  FolderOpen,
  Smile,
  Users,
  ChevronRight,
  X,
  Activity,
  Clock,
} from 'lucide-react'
import { useSettingsStore, useCharacterStore } from '@/stores'
import ExpressionManualMatch from '@/components/ExpressionManualMatch'
import ActionManualMatch from '@/components/ActionManualMatch'
import {
  getCharacterModelType,
  setCharacterModelType,
  type ModelTypeChoice,
} from '@/utils/characterModelType'

// ToggleSwitch 必须定义在组件外部，避免每次重渲染时重新创建组件实例
// 导致 framer-motion 重新挂载所有开关，产生联动滑动现象
const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
  <button
    onClick={onChange}
    className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
      checked ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
    }`}
  >
    <motion.div
      animate={{ x: checked ? 24 : 2 }}
      className="w-5 h-5 bg-white rounded-full shadow"
    />
  </button>
)

export default function UserPreferencesPage() {
  const navigate = useNavigate()
  const { settings, updateSettings, setSettings } = useSettingsStore()
  const { characters } = useCharacterStore()
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  // 表情设置相关状态
  const [showCharSelector, setShowCharSelector] = useState(false)
  // 选中的角色（进入子设置页）
  const [selectedChar, setSelectedChar] = useState<{
    id: string
    name: string
    modelPath: string
    modelType: string
  } | null>(null)
  // 表情手动匹配弹窗
  const [showExpressionMatch, setShowExpressionMatch] = useState(false)
  // 动作手动匹配弹窗
  const [showActionMatch, setShowActionMatch] = useState(false)
  // 模型类型选择弹窗（首次进入表情/动作设置时）
  const [showModelTypePicker, setShowModelTypePicker] = useState(false)
  // 记录用户想进入的设置类型（'expression' | 'action'），供模型类型选择后使用
  const [pendingSettingType, setPendingSettingType] = useState<'expression' | 'action' | null>(null)

  if (!settings) return null

  const handleReset = async () => {
    const defaultSettings = {
      id: 'default',
      language: 'zh-CN' as const,
      fontSize: 'medium' as const,
      theme: 'system' as const,
      autoSavePath: './saves',
      autoSaveInterval: 5,
      emergencySavePath: './emergency',
      autoStart: false,
      desktopNotifications: true,
      healthReminders: true,
      healthReminderInterval: 360,
      messageBubbleOpacity: 100,
      autoJumpToChat: false,
      micPermission: false,
      fileReadPermission: false,
      live2dFaceMode: 'auto' as const,
    }
    setSettings(defaultSettings)
    setShowResetConfirm(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full w-full flex flex-col bg-gray-50 dark:bg-gray-900"
    >
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="返回"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
        <h1 className="text-lg font-bold text-gray-800 dark:text-white">用户偏好设置</h1>
        <div className="w-9" />
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 max-w-md mx-auto w-full">
        {/* 应用行为 */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">应用行为</h3>
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <RotateCcw className="w-4 h-4" />
                开机自启
              </label>
              <ToggleSwitch
                checked={settings.autoStart}
                onChange={() => updateSettings({ autoStart: !settings.autoStart })}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <Bell className="w-4 h-4" />
                桌面通知
              </label>
              <ToggleSwitch
                checked={settings.desktopNotifications}
                onChange={() => updateSettings({ desktopNotifications: !settings.desktopNotifications })}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <Heart className="w-4 h-4" />
                健康提醒
              </label>
              <ToggleSwitch
                checked={settings.healthReminders}
                onChange={() => updateSettings({ healthReminders: !settings.healthReminders })}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <MessageCircle className="w-4 h-4" />
                创建角色后自动跳转聊天界面
              </label>
              <ToggleSwitch
                checked={settings.autoJumpToChat}
                onChange={() => updateSettings({ autoJumpToChat: !settings.autoJumpToChat })}
              />
            </div>
          </div>
        </div>

        {/* UI 外观 */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">UI 外观</h3>
          <div className="card">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              <MessageSquare className="w-4 h-4" />
              消息气泡透明度
              <span className="text-xs text-gray-400 ml-1">
                （当前：{settings.messageBubbleOpacity ?? 100}%）
              </span>
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">0%</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={settings.messageBubbleOpacity ?? 100}
                onChange={(e) => updateSettings({ messageBubbleOpacity: parseInt(e.target.value) })}
                className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
              />
              <span className="text-xs text-gray-400">100%</span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              调整消息气泡的透明度。设置聊天背景后，降低透明度可看到背景图。
            </p>
          </div>
        </div>

        {/* 模型设置 */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">模型设置</h3>
          <div className="card space-y-3">
            <div className="opacity-50 pointer-events-none select-none">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Smile className="w-4 h-4" />
                模型正脸模式
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-[10px] font-medium ml-1">
                  <Clock className="w-3 h-3" />
                  准备中
                </span>
              </label>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                该功能正在准备中，敬请期待
              </p>
              {/* ── 以下为原始按钮代码，暂时禁用（恢复时移除外层 disabled 容器即可） ── */}
              <div className="flex gap-2" aria-disabled="true">
                <button
                  disabled
                  onClick={() => updateSettings({ live2dFaceMode: 'auto' })}
                  className={`flex-1 py-2.5 text-xs font-medium rounded-lg cursor-not-allowed ${
                    settings.live2dFaceMode !== 'front-only'
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  空闲时自动回正
                </button>
                <button
                  disabled
                  onClick={() => updateSettings({ live2dFaceMode: 'front-only' })}
                  className={`flex-1 py-2.5 text-xs font-medium rounded-lg cursor-not-allowed ${
                    settings.live2dFaceMode === 'front-only'
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  仅正前方时正面
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 人物表情与动作设置 */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Users className="w-4 h-4" />
            人物表情与动作设置
          </h3>
          <div className="card">
            <button
              onClick={() => setShowCharSelector(true)}
              className="w-full py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Smile className="w-4 h-4 text-primary-500" />
                <span>选择角色进行设置</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* 权限管理 */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            <ShieldCheck className="w-4 h-4 inline mr-1" />
            权限管理
          </h3>
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <Mic className="w-4 h-4" />
                麦克风（语音录制）
              </label>
              <ToggleSwitch
                checked={settings.micPermission}
                onChange={() => updateSettings({ micPermission: !settings.micPermission })}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <FolderOpen className="w-4 h-4" />
                读取本地文件
              </label>
              <ToggleSwitch
                checked={settings.fileReadPermission}
                onChange={() => updateSettings({ fileReadPermission: !settings.fileReadPermission })}
              />
            </div>
          </div>
        </div>

        {/* 恢复默认 */}
        <button
          onClick={() => setShowResetConfirm(true)}
          className="w-full py-2.5 text-red-500 border-2 border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          一键恢复默认设置
        </button>
      </div>

      {/* 重置确认弹窗 */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="card max-w-sm w-full"
          >
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">确认重置？</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              此操作将重置所有偏好设置为默认值，无法撤销。
            </p>
            <div className="flex gap-3">
              <button onClick={handleReset} className="btn-primary flex-1">
                确认重置
              </button>
              <button onClick={() => setShowResetConfirm(false)} className="btn-secondary flex-1">
                取消
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 角色选择弹窗 */}
      <AnimatePresence>
        {showCharSelector && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setShowCharSelector(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[85%] max-w-[360px] max-h-[70vh] flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">选择角色</h3>
                <button
                  onClick={() => setShowCharSelector(false)}
                  className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {characters.length === 0 ? (
                  <p className="text-center text-xs text-gray-400 py-6">暂无角色，请先创建角色</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {characters.map((char) => (
                      <button
                        key={char.id}
                        onClick={() => {
                          setSelectedChar({
                            id: char.id,
                            name: char.profile?.name || '未命名角色',
                            modelPath: char.modelDisplay?.url || '',
                            modelType: char.modelDisplay?.type || '',
                          })
                          setShowCharSelector(false)
                        }}
                        className="w-full px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center justify-between"
                      >
                        <span>{char.profile?.name || '未命名角色'}</span>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 角色子设置页（表情/动作入口） */}
      <AnimatePresence>
        {selectedChar && !showExpressionMatch && !showActionMatch && !showModelTypePicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setSelectedChar(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[85%] max-w-[360px]"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {selectedChar.name} 的设置
                </h3>
                <button
                  onClick={() => setSelectedChar(null)}
                  className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div className="p-4 flex flex-col gap-2">
                <button
                  onClick={() => {
                    // 检查是否已保存模型类型
                    const savedType = getCharacterModelType(selectedChar.id, selectedChar.modelPath)
                    if (savedType) {
                      setShowExpressionMatch(true)
                    } else {
                      setPendingSettingType('expression')
                      setShowModelTypePicker(true)
                    }
                  }}
                  className="w-full px-3 py-3 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Smile className="w-4 h-4 text-primary-500" />
                    <span>{selectedChar.name}的表情设置</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
                <button
                  onClick={() => {
                    // 检查是否已保存模型类型
                    const savedType = getCharacterModelType(selectedChar.id, selectedChar.modelPath)
                    if (savedType) {
                      setShowActionMatch(true)
                    } else {
                      setPendingSettingType('action')
                      setShowModelTypePicker(true)
                    }
                  }}
                  className="w-full px-3 py-3 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary-500" />
                    <span>{selectedChar.name}的动作设置</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 模型类型选择弹窗（首次进入表情/动作设置时） */}
      <AnimatePresence>
        {showModelTypePicker && selectedChar && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => {
              setShowModelTypePicker(false)
              setPendingSettingType(null)
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[85%] max-w-[360px]"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">模型类型选择</h3>
                <button
                  onClick={() => {
                    setShowModelTypePicker(false)
                    setPendingSettingType(null)
                  }}
                  className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div className="p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 text-center">
                  请选择该角色的模型类型，后续设置将基于此类型进行
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      const choice: ModelTypeChoice = '2d'
                      setCharacterModelType(selectedChar.id, choice, selectedChar.modelPath)
                      setShowModelTypePicker(false)
                      if (pendingSettingType === 'expression') {
                        setShowExpressionMatch(true)
                      } else if (pendingSettingType === 'action') {
                        setShowActionMatch(true)
                      }
                      setPendingSettingType(null)
                    }}
                    className="flex-1 py-3 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 transition-colors"
                  >
                    2D 模型（Live2D）
                  </button>
                  <button
                    onClick={() => {
                      const choice: ModelTypeChoice = '3d'
                      setCharacterModelType(selectedChar.id, choice, selectedChar.modelPath)
                      setShowModelTypePicker(false)
                      if (pendingSettingType === 'expression') {
                        setShowExpressionMatch(true)
                      } else if (pendingSettingType === 'action') {
                        setShowActionMatch(true)
                      }
                      setPendingSettingType(null)
                    }}
                    className="flex-1 py-3 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    3D 模型
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 表情手动匹配弹窗 */}
      <ExpressionManualMatch
        visible={showExpressionMatch}
        characterName={selectedChar?.name || ''}
        modelPath={selectedChar?.modelPath || ''}
        characterId={selectedChar?.id || ''}
        onClose={() => {
          setShowExpressionMatch(false)
        }}
      />

      {/* 动作手动匹配弹窗 */}
      <ActionManualMatch
        visible={showActionMatch}
        characterName={selectedChar?.name || ''}
        modelPath={selectedChar?.modelPath || ''}
        characterId={selectedChar?.id || ''}
        onClose={() => {
          setShowActionMatch(false)
        }}
      />
    </motion.div>
  )
}
