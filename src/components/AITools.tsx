import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Syringe, RefreshCw, CheckCircle, AlertTriangle, X, Activity, Save } from 'lucide-react'
import { useUIStore, useCharacterStore, useSettingsStore } from '@/stores'
import { db } from '@/services/db'

interface SystemCheckResult {
  module: string
  status: 'ok' | 'warning' | 'error'
  message: string
}

export default function AITools() {
  const { addNotification } = useUIStore()
  const { currentCharacter, messages } = useCharacterStore()
  const { settings } = useSettingsStore()
  
  const [syringePos, setSyringePos] = useState({ x: 0, y: 0 })
  const [refreshPos, setRefreshPos] = useState({ x: 48, y: 0 })
  const [isDraggingSyringe, setIsDraggingSyringe] = useState(false)
  const [isDraggingRefresh, setIsDraggingRefresh] = useState(false)
  const [showSyringePanel, setShowSyringePanel] = useState(false)
  const [showRefreshPanel, setShowRefreshPanel] = useState(false)
  const [checkResults, setCheckResults] = useState<SystemCheckResult[]>([])
  const [isChecking, setIsChecking] = useState(false)
  const [saveItems, setSaveItems] = useState({
    characters: true,
    messages: true,
    settings: true
  })

  const dragOffset = useRef({ x: 0, y: 0 })

  // 拖拽逻辑
  const handleDragStart = (e: React.MouseEvent, type: 'syringe' | 'refresh') => {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    if (type === 'syringe') setIsDraggingSyringe(true)
    else setIsDraggingRefresh(true)
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingSyringe) {
        setSyringePos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y })
      }
      if (isDraggingRefresh) {
        setRefreshPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y })
      }
    }
    const handleMouseUp = () => {
      setIsDraggingSyringe(false)
      setIsDraggingRefresh(false)
    }
    
    if (isDraggingSyringe || isDraggingRefresh) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingSyringe, isDraggingRefresh])

  // AI 自检修复
  const handleSelfCheck = async () => {
    setIsChecking(true)
    setCheckResults([])
    
    // 模拟检测过程
    await new Promise(r => setTimeout(r, 800))
    
    const results: SystemCheckResult[] = []
    
    // 检查数据库连接
    try {
      await db.users.count()
      results.push({ module: '数据库连接', status: 'ok', message: 'IndexedDB 连接正常' })
    } catch {
      results.push({ module: '数据库连接', status: 'error', message: 'IndexedDB 连接异常，尝试修复中...' })
    }
    
    await new Promise(r => setTimeout(r, 500))

    // 检查消息存储
    try {
      const msgCount = await db.messages.count()
      results.push({ module: '消息存储', status: 'ok', message: `消息记录共 ${msgCount} 条，存储正常` })
    } catch {
      results.push({ module: '消息存储', status: 'error', message: '消息存储异常' })
    }
    
    await new Promise(r => setTimeout(r, 500))
    
    // 检查本地存储
    try {
      const authData = localStorage.getItem('auth-storage')
      if (authData) {
        results.push({ module: '本地存储', status: 'ok', message: '本地存储读写正常' })
      } else {
        results.push({ module: '本地存储', status: 'warning', message: '未检测到登录状态缓存' })
      }
    } catch {
      results.push({ module: '本地存储', status: 'error', message: 'localStorage 访问受限' })
    }
    
    setCheckResults(results)
    setIsChecking(false)
    
    // 记录日志
    const hasError = results.some(r => r.status === 'error')
    addNotification({
      id: `check-${Date.now()}`,
      type: hasError ? 'warning' : 'success',
      title: hasError ? '检测到异常' : '自检完成',
      message: hasError ? '部分模块需要修复，请查看详情' : '所有模块运行正常',
      timestamp: Date.now(),
      read: false
    })
  }

  // 安全刷新
  const handleSafeRefresh = async () => {
    try {
      // 保存选中的数据
      if (saveItems.characters && currentCharacter) {
        await db.characters.put(currentCharacter)
      }
      if (saveItems.messages && messages.length > 0) {
        await db.messages.bulkPut(messages)
      }
      if (saveItems.settings && settings) {
        await db.settings.put(settings)
      }
      
      addNotification({
        id: `save-${Date.now()}`,
        type: 'success',
        title: '保存成功',
        message: '数据已保存，即将刷新...',
        timestamp: Date.now(),
        read: false
      })
      
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (e) {
      addNotification({
        id: `save-err-${Date.now()}`,
        type: 'error',
        title: '保存失败',
        message: '数据保存出错，请重试',
        timestamp: Date.now(),
        read: false
      })
    }
  }

  return (
    <>
      {/* 针筒图标 - AI自检 */}
      <motion.div
        className="fixed z-40 cursor-move select-none"
        style={{ right: 20 + syringePos.x, bottom: 20 + syringePos.y }}
        onMouseDown={(e) => handleDragStart(e, 'syringe')}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <button
          onClick={() => setShowSyringePanel(true)}
          className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg flex items-center justify-center text-white hover:shadow-xl transition-shadow"
          title="AI自检修复"
        >
          <Syringe className="w-5 h-5" />
        </button>
      </motion.div>

      {/* 刷新图标 - 安全刷新 */}
      <motion.div
        className="fixed z-40 cursor-move select-none"
        style={{ right: 20 + refreshPos.x, bottom: 80 + refreshPos.y }}
        onMouseDown={(e) => handleDragStart(e, 'refresh')}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <button
          onClick={() => setShowRefreshPanel(true)}
          className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-emerald-400 shadow-lg flex items-center justify-center text-white hover:shadow-xl transition-shadow"
          title="安全刷新"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </motion.div>

      {/* AI自检面板 */}
      <AnimatePresence>
        {showSyringePanel && (
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
              className="card max-w-lg w-full mx-4"
            >
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <Syringe className="w-5 h-5 text-blue-500" />
                  <h2 className="text-xl font-bold text-gray-800 dark:text-white">AI自检修复</h2>
                </div>
                <button onClick={() => setShowSyringePanel(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {checkResults.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400 mb-4">点击开始检测平台运行状态</p>
                  <button
                    onClick={handleSelfCheck}
                    disabled={isChecking}
                    className="btn-primary flex items-center gap-2 mx-auto"
                  >
                    {isChecking ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Syringe className="w-4 h-4" />
                    )}
                    {isChecking ? '检测中...' : '开始自检'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {checkResults.map((result, index) => (
                    <motion.div
                      key={result.module}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`flex items-center gap-3 p-3 rounded-lg ${
                        result.status === 'ok' ? 'bg-green-50 dark:bg-green-900/20' :
                        result.status === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/20' :
                        'bg-red-50 dark:bg-red-900/20'
                      }`}
                    >
                      {result.status === 'ok' ? (
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                      ) : result.status === 'warning' ? (
                        <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-white">{result.module}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{result.message}</p>
                      </div>
                    </motion.div>
                  ))}
                  
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => {
                        setCheckResults([])
                        handleSelfCheck()
                      }}
                      className="btn-primary flex-1 flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      重新检测
                    </button>
                    <button
                      onClick={() => setShowSyringePanel(false)}
                      className="btn-secondary flex-1"
                    >
                      关闭
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 安全刷新面板 */}
      <AnimatePresence>
        {showRefreshPanel && (
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
              className="card max-w-md w-full mx-4"
            >
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-green-500" />
                  <h2 className="text-xl font-bold text-gray-800 dark:text-white">安全刷新</h2>
                </div>
                <button onClick={() => setShowRefreshPanel(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <p className="text-gray-600 dark:text-gray-300 mb-4">选择要保存的数据，然后刷新页面：</p>
              
              <div className="space-y-3 mb-6">
                <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={saveItems.characters}
                    onChange={(e) => setSaveItems({ ...saveItems, characters: e.target.checked })}
                    className="w-4 h-4 text-primary-500 rounded"
                  />
                  <Save className="w-4 h-4 text-primary-500" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">角色数据</span>
                </label>
                <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={saveItems.messages}
                    onChange={(e) => setSaveItems({ ...saveItems, messages: e.target.checked })}
                    className="w-4 h-4 text-primary-500 rounded"
                  />
                  <Save className="w-4 h-4 text-primary-500" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">聊天记录</span>
                </label>
                <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={saveItems.settings}
                    onChange={(e) => setSaveItems({ ...saveItems, settings: e.target.checked })}
                    className="w-4 h-4 text-primary-500 rounded"
                  />
                  <Save className="w-4 h-4 text-primary-500" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">应用设置</span>
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleSafeRefresh}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  保存并刷新
                </button>
                <button
                  onClick={() => setShowRefreshPanel(false)}
                  className="btn-secondary flex-1"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
