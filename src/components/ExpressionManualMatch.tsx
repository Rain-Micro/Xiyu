import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Save, Plus, Trash2, X, FileText, AlertCircle, FolderOpen, ShieldCheck } from 'lucide-react'
import {
  DEFAULT_EXPRESSION_SCENES,
  loadExpressionMapping,
  saveExpressionMapping,
  loadModelExpressions,
  scanExpressionFiles,
  type ModelExpressionInfo,
} from '@/utils/expressionMapping'
import { useSettingsStore } from '@/stores'

interface ExpressionManualMatchProps {
  visible: boolean
  characterName: string
  modelPath: string
  characterId: string
  onClose: () => void
}

interface ExpressionRow {
  scene: string
  label: string
  selectedExpression: string
  isCustom: boolean
  fileName: string  // 用户选择的本地 .exp3.json 文件名
}

export default function ExpressionManualMatch({
  visible,
  characterName,
  modelPath,
  characterId,
  onClose,
}: ExpressionManualMatchProps) {
  const { settings, updateSettings } = useSettingsStore()
  const [modelExpressions, setModelExpressions] = useState<ModelExpressionInfo[]>([])
  const [rows, setRows] = useState<ExpressionRow[]>([])
  const [loading, setLoading] = useState(false)
  // 权限弹窗
  const [showPermissionModal, setShowPermissionModal] = useState(false)
  // 权限拒绝提示
  const [permissionDeniedHint, setPermissionDeniedHint] = useState(false)
  // 记录当前正在选择文件的行索引
  const pendingFileRowIndex = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 加载模型表情列表和已保存的映射
  const loadData = useCallback(async () => {
    setLoading(true)

    // 加载模型内置表情（多种来源：model3.json、vtube.json）
    // modelPath 为空时 loadModelExpressions 会安全返回空数组
    let expressions: ModelExpressionInfo[] = []
    if (modelPath) {
      expressions = await loadModelExpressions(modelPath)
      // 如果仍然没有表情，尝试扫描目录中的 .exp3.json 文件
      if (expressions.length === 0) {
        expressions = await scanExpressionFiles(modelPath)
      }
    }

    setModelExpressions(expressions)

    // 加载已保存的映射
    const config = loadExpressionMapping(characterId)
    const fileMapping = config.fileMapping || {}

    // 构建默认表情行（始终显示完整的8个预设表情）
    const defaultRows: ExpressionRow[] = DEFAULT_EXPRESSION_SCENES.map(item => ({
      scene: item.scene,
      label: item.label,
      selectedExpression: config.mapping[item.scene] || '',
      isCustom: false,
      fileName: fileMapping[item.scene] || '',
    }))

    // 添加自定义表情行
    const customRows: ExpressionRow[] = config.customEntries.map(entry => ({
      scene: entry.scene,
      label: entry.label,
      selectedExpression: entry.expressionName,
      isCustom: true,
      fileName: entry.fileName || fileMapping[entry.scene] || '',
    }))

    setRows([...defaultRows, ...customRows])
    setLoading(false)
  }, [modelPath, characterId])

  useEffect(() => {
    if (visible) {
      loadData()
    }
  }, [visible, loadData])

  // 更新某行的选中表情
  const updateRowExpression = (index: number, expressionName: string) => {
    setRows(prev => prev.map((row, i) =>
      i === index ? { ...row, selectedExpression: expressionName } : row
    ))
  }

  // 更新某行的文件名
  const updateRowFileName = (index: number, fileName: string) => {
    setRows(prev => prev.map((row, i) =>
      i === index ? { ...row, fileName } : row
    ))
  }

  // 添加自定义表情
  const addCustomRow = () => {
    if (rows.length >= 100) return
    const newIndex = rows.filter(r => r.isCustom).length + 1
    setRows(prev => [...prev, {
      scene: `custom_${Date.now()}`,
      label: `自定义${newIndex}`,
      selectedExpression: '',
      isCustom: true,
      fileName: '',
    }])
  }

  // 删除自定义表情行
  const removeRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index))
  }

  // 更新自定义行标签
  const updateRowLabel = (index: number, label: string) => {
    setRows(prev => prev.map((row, i) =>
      i === index ? { ...row, label } : row
    ))
  }

  // 检查文件读取权限，未授权则弹窗询问
  const handleSelectFile = (index: number) => {
    pendingFileRowIndex.current = index
    if (settings?.fileReadPermission) {
      fileInputRef.current?.click()
      return
    }
    setShowPermissionModal(true)
  }

  // 权限弹窗：允许
  const handlePermissionAllow = useCallback(() => {
    setShowPermissionModal(false)
    updateSettings({ fileReadPermission: true })
    // 延迟点击，确保状态更新后再触发文件选择
    setTimeout(() => {
      fileInputRef.current?.click()
    }, 100)
  }, [updateSettings])

  // 权限弹窗：拒绝
  const handlePermissionDeny = useCallback(() => {
    setShowPermissionModal(false)
    setPermissionDeniedHint(true)
  }, [])

  // 文件选择回调
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && pendingFileRowIndex.current !== null) {
      updateRowFileName(pendingFileRowIndex.current, file.name)
      // 同时设置表情名称为文件名（去掉扩展名），作为匹配标识
      const expName = file.name.replace(/\.exp3\.json$/i, '')
      updateRowExpression(pendingFileRowIndex.current, expName)
    }
    // 重置 input 以便重复选择同一文件
    e.target.value = ''
    pendingFileRowIndex.current = null
  }

  // 保存映射
  const handleSave = () => {
    const mapping: Record<string, string> = {}
    const customEntries: Array<{ scene: string; label: string; expressionName: string; fileName?: string }> = []
    const fileMapping: Record<string, string> = {}

    for (const row of rows) {
      if (row.selectedExpression) {
        mapping[row.scene] = row.selectedExpression
        if (row.isCustom) {
          customEntries.push({
            scene: row.scene,
            label: row.label,
            expressionName: row.selectedExpression,
            fileName: row.fileName || undefined,
          })
        }
      }
      if (row.fileName) {
        fileMapping[row.scene] = row.fileName
      }
    }

    saveExpressionMapping(characterId, { mapping, customEntries, fileMapping })
    onClose()
  }

  const hasFiles = modelExpressions.length > 0

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
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[90%] max-w-[520px] max-h-[80vh] flex flex-col"
          >
            {/* 隐藏的文件选择 input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".exp3.json,.json"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* 头部 */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-primary-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {characterName}的表情设置
                  </h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    为每个表情选择对应的文件
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

            {/* 内容区 - 始终显示完整的表情列表 */}
            <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  <span className="ml-2 text-xs text-gray-400">加载中...</span>
                </div>
              ) : (
                <>
                  {/* 无文件提示 */}
                  {!hasFiles && (
                    <div className="flex items-center gap-2 mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        未检测到模型内置表情文件。您可以通过"选择文件"按钮手动选择本地 .exp3.json 文件进行匹配。
                      </p>
                    </div>
                  )}

                  {/* 始终显示完整的表情列表 */}
                  <div className="flex flex-col gap-2.5">
                    {rows.map((row, index) => (
                      <div key={row.scene} className="flex items-center gap-2">
                        {/* 标签（自定义行可编辑） */}
                        {row.isCustom ? (
                          <input
                            type="text"
                            value={row.label}
                            onChange={(e) => updateRowLabel(index, e.target.value)}
                            className="w-20 flex-shrink-0 px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        ) : (
                          <span className="w-16 flex-shrink-0 text-xs font-medium text-gray-600 dark:text-gray-300">
                            {row.label}
                          </span>
                        )}

                        {/* 下拉选择 - 无文件时显示提示但仍可用 */}
                        <select
                          value={row.selectedExpression}
                          onChange={(e) => updateRowExpression(index, e.target.value)}
                          disabled={!hasFiles}
                          className="flex-1 px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed min-w-0"
                        >
                          <option value="">
                            {hasFiles ? '未选择' : '暂无内置表情'}
                          </option>
                          {modelExpressions.map(exp => (
                            <option key={exp.Name} value={exp.Name}>
                              {exp.Name} ({exp.File})
                            </option>
                          ))}
                        </select>

                        {/* 选择文件按钮 */}
                        <button
                          onClick={() => handleSelectFile(index)}
                          className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-md transition-colors flex-shrink-0 border border-primary-200 dark:border-primary-800"
                          title="选择本地 .exp3.json 文件"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          选择文件
                        </button>

                        {/* 已选文件名显示 */}
                        {row.fileName && (
                          <span className="text-[10px] text-green-600 dark:text-green-400 flex-shrink-0 max-w-[80px] truncate" title={row.fileName}>
                            {row.fileName}
                          </span>
                        )}

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
                </>
              )}
            </div>

            {/* 底部按钮 */}
            <div className="flex items-center gap-2 p-4 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={addCustomRow}
                className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                添加表情
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

          {/* 权限询问弹窗 */}
          <AnimatePresence>
            {showPermissionModal && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[310] flex items-center justify-center bg-black/50 backdrop-blur-sm"
              >
                <motion.div
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0.9 }}
                  className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6"
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mb-3">
                      <ShieldCheck className="w-6 h-6 text-primary-500" />
                    </div>
                    <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-2">提示</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mb-5 leading-relaxed">
                      是否允许平台读取本地文件？
                    </p>
                    <div className="flex gap-3 w-full">
                      <button
                        onClick={handlePermissionDeny}
                        className="flex-1 py-2 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors border border-gray-200 dark:border-gray-600"
                      >
                        拒绝
                      </button>
                      <button
                        onClick={handlePermissionAllow}
                        className="flex-1 py-2 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors"
                      >
                        允许
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 权限拒绝提示 */}
          <AnimatePresence>
            {permissionDeniedHint && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[310] flex items-center justify-center bg-black/50 backdrop-blur-sm"
              >
                <motion.div
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0.9 }}
                  className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6"
                >
                  <div className="flex flex-col items-center text-center">
                    <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-3">
                      <AlertCircle className="w-6 h-6 text-red-500" />
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mb-5">
                      权限被拒绝，无法选择文件
                    </p>
                    <button
                      onClick={() => setPermissionDeniedHint(false)}
                      className="px-6 py-2 text-xs font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors"
                    >
                      知道了
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
