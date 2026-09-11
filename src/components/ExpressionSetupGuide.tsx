import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Settings, AlertCircle, HelpCircle, X } from 'lucide-react'

interface ExpressionSetupGuideProps {
  visible: boolean
  characterName: string
  onAutoMatch: () => void
  onManualMatch: () => void
  onClose: () => void
}

export default function ExpressionSetupGuide({
  visible,
  characterName,
  onAutoMatch,
  onManualMatch,
  onClose,
}: ExpressionSetupGuideProps) {
  const [step, setStep] = useState(1)
  const [showTutorial, setShowTutorial] = useState(false)

  // 弹窗打开时重置到第一步
  useEffect(() => {
    if (visible) {
      setStep(1)
      setShowTutorial(false)
    }
  }, [visible])

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
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-[360px] w-[85%] relative"
          >
            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>

            {/* 第一步：选择匹配方式 */}
            {step === 1 && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-6 h-6 text-primary-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                      表情设置
                    </h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {characterName} 的 Live2D 模型
                    </p>
                  </div>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-5">
                  检测到新的 Live2D 模型，请选择表情匹配方式
                </p>

                <div className="flex flex-col gap-2 mb-3">
                  <button
                    onClick={() => setStep(2)}
                    className="w-full py-2.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    自动匹配
                  </button>
                  <button
                    onClick={onManualMatch}
                    className="w-full py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    手动匹配
                  </button>
                </div>

                <button
                  onClick={() => setShowTutorial(!showTutorial)}
                  className="w-full text-xs text-gray-400 dark:text-gray-500 hover:text-primary-500 transition-colors flex items-center justify-center gap-1"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  不会手动匹配
                </button>

                {showTutorial && (
                  <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    <p className="font-medium text-gray-600 dark:text-gray-300 mb-1">手动匹配教程：</p>
                    <p>1. 选择"手动匹配"进入设置界面</p>
                    <p>2. 每个表情（微笑、惊讶等）右侧选择对应的 .exp3.json 文件</p>
                    <p>3. 点击"保存"完成配置</p>
                    <p className="mt-1 text-gray-400">手动匹配可确保表情准确对应，推荐使用。</p>
                  </div>
                )}
              </>
            )}

            {/* 第二步：确认自动匹配 */}
            {step === 2 && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-6 h-6 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                      确认自动匹配
                    </h3>
                  </div>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-5">
                  自动匹配可能因模型命名差异导致表情错误，建议手动匹配。确定继续吗？
                </p>

                <div className="flex flex-col gap-2 mb-3">
                  <button
                    onClick={onAutoMatch}
                    className="w-full py-2.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    仍然自动匹配
                  </button>
                  <button
                    onClick={onManualMatch}
                    className="w-full py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors"
                  >
                    手动匹配
                  </button>
                </div>

                <button
                  onClick={() => setShowTutorial(!showTutorial)}
                  className="w-full text-xs text-gray-400 dark:text-gray-500 hover:text-primary-500 transition-colors flex items-center justify-center gap-1"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  不会手动匹配
                </button>

                {showTutorial && (
                  <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    <p className="font-medium text-gray-600 dark:text-gray-300 mb-1">手动匹配教程：</p>
                    <p>1. 选择"手动匹配"进入设置界面</p>
                    <p>2. 每个表情（微笑、惊讶等）右侧选择对应的 .exp3.json 文件</p>
                    <p>3. 点击"保存"完成配置</p>
                    <p className="mt-1 text-gray-400">手动匹配可确保表情准确对应，推荐使用。</p>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
