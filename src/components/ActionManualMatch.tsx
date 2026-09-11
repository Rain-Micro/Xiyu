import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Save, Plus, Trash2, X, Activity, Upload } from 'lucide-react'
import {
  DEFAULT_ACTION_SCENES,
  loadActionMapping,
  saveActionMapping,
  loadModelActions,
} from '@/utils/expressionMapping'

interface ActionManualMatchProps {
  visible: boolean
  characterName: string
  modelPath: string
  characterId: string
  onClose: () => void
}

interface ActionRow {
  action: string
  label: string
  selectedFile: string
  isCustom: boolean
}

export default function ActionManualMatch({
  visible,
  characterName,
  modelPath,
  characterId,
  onClose,
}: ActionManualMatchProps) {
  const [modelActions, setModelActions] = useState<Array<{ name: string; file: string }>>([])
  const [rows, setRows] = useState<ActionRow[]>([])
  const [loading, setLoading] = useState(false)
  // 用户通过文件选择器导入的动作文件
  const [importedFiles, setImportedFiles] = useState<Array<{ name: string; file: string }>>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    // 加载模型内置动作（Live2D motion3.json）
    const actions = await loadModelActions(modelPath)
    setModelActions(actions)

    // 加载已保存的映射
    const config = loadActionMapping(characterId)

    // 构建默认动作行
    const defaultRows: ActionRow[] = DEFAULT_ACTION_SCENES.map(item => ({
      action: item.action,
      label: item.label,
      selectedFile: config.mapping[item.action] || '',
      isCustom: false,
    }))

    // 添加自定义动作行
    const customRows: ActionRow[] = config.customEntries.map(entry => ({
      action: entry.action,
      label: entry.label,
      selectedFile: entry.fileName,
      isCustom: true,
    }))

    setRows([...defaultRows, ...customRows])
    setLoading(false)
  }, [modelPath, characterId])

  useEffect(() => {
    if (visible) {
      loadData()
      setImportedFiles([])
    }
  }, [visible, loadData])

  // 更新某行的选中文件
  const updateRowFile = (index: number, fileName: string) => {
    setRows(prev => prev.map((row, i) =>
      i === index ? { ...row, selectedFile: fileName } : row
    ))
  }

  // 添加自定义动作
  const addCustomRow = () => {
    if (rows.length >= 200) return
    const newIndex = rows.filter(r => r.isCustom).length + 1
    setRows(prev => [...prev, {
      action: `custom_action_${Date.now()}`,
      label: `自定义动作${newIndex}`,
      selectedFile: '',
      isCustom: true,
    }])
  }

  // 删除自定义动作行
  const removeRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index))
  }

  // 更新自定义行标签
  const updateRowLabel = (index: number, label: string) => {
    setRows(prev => prev.map((row, i) =>
      i === index ? { ...row, label } : row
    ))
  }

  // 文件选择器：导入动作文件
  const handleFileSelect = (index: number) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.motion3.json,.fbx,.glb,.gltf'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        // 添加到导入文件列表
        setImportedFiles(prev => [...prev, { name: file.name, file: file.name }])
        updateRowFile(index, file.name)
      }
    }
    input.click()
  }

  // 保存映射
  const handleSave = () => {
    const mapping: Record<string, string> = {}
    const customEntries: Array<{ action: string; label: string; fileName: string }> = []

    for (const row of rows) {
      if (row.selectedFile) {
        mapping[row.action] = row.selectedFile
        if (row.isCustom) {
          customEntries.push({
            action: row.action,
            label: row.label,
            fileName: row.selectedFile,
          })
        }
      }
    }

    saveActionMapping(characterId, { mapping, customEntries })
    onClose()
  }

  // 合并模型内置动作和导入文件
  const allFiles = [...modelActions.map(a => ({ name: a.name, file: a.file })), ...importedFiles]

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[90%] max-w-[440px] max-h-[80vh] flex flex-col"
          >
            {/* 头部 */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-primary-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {characterName}的动作设置
                  </h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    为每个动作选择对应的文件
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  <span className="ml-2 text-xs text-gray-400">加载中...</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {rows.map((row, index) => (
                    <div key={row.action} className="flex items-center gap-2">
                      {/* 标签（自定义行可编辑） */}
                      {row.isCustom ? (
                        <input
                          type="text"
                          value={row.label}
                          onChange={(e) => updateRowLabel(index, e.target.value)}
                          className="w-20 flex-shrink-0 px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      ) : (
                        <span className="w-20 flex-shrink-0 text-xs font-medium text-gray-600 dark:text-gray-300">
                          {row.label}
                        </span>
                      )}

                      {/* 下拉选择 */}
                      <select
                        value={row.selectedFile}
                        onChange={(e) => updateRowFile(index, e.target.value)}
                        className="flex-1 px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      >
                        <option value="">未选择</option>
                        {allFiles.map(f => (
                          <option key={f.file} value={f.file}>
                            {f.name}
                          </option>
                        ))}
                      </select>

                      {/* 文件选择按钮 */}
                      <button
                        onClick={() => handleFileSelect(index)}
                        className="p-1.5 rounded-md hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex-shrink-0"
                        title="从本地选择文件"
                      >
                        <Upload className="w-3.5 h-3.5 text-primary-500" />
                      </button>

                      {/* 删除按钮（仅自定义行） */}
                      {row.isCustom && (
                        <button
                          onClick={() => removeRow(index)}
                          className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 底部按钮 */}
            <div className="flex items-center gap-2 p-4 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={addCustomRow}
                disabled={rows.length >= 200}
                className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                添加动作
              </button>
              <div className="flex-1" />
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-1 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                保存
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
