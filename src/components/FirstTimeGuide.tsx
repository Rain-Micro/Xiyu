import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronRight, ChevronLeft } from 'lucide-react'

export interface GuideStep {
  title: string
  content: string
  /** CSS selector for the target element to highlight */
  target?: string
  /** Preferred placement of the tooltip relative to target */
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center'
}

interface FirstTimeGuideProps {
  /** localStorage key，用于记录是否已展示过 */
  storageKey: string
  /** 引导步骤 */
  steps: GuideStep[]
  /** 引导在界面中的位置（无 target 时使用） */
  position?: 'center' | 'top' | 'bottom'
  /** 当引导结束时回调 */
  onComplete?: () => void
  /** 手动控制可见性（设为 true 时跳过 localStorage 检查，直接显示） */
  manualVisible?: boolean
  /** 手动关闭回调（manualVisible 模式下使用） */
  onManualClose?: () => void
  /** 是否显示"上一步"按钮（默认 true） */
  showPrevButton?: boolean
}

// ── 常量 ─────────────────────────────────────────────
const TOOLTIP_WIDTH = 380
const TOOLTIP_EST_HEIGHT = 260
const HIGHLIGHT_PADDING = 6
const TOOLTIP_MARGIN = 14

interface TargetRect {
  top: number
  left: number
  width: number
  height: number
}

type Placement = 'top' | 'bottom' | 'left' | 'right' | 'center'

interface TooltipGeometry {
  top: number
  left: number
  placement: Placement
}

// ── 工具函数 ──────────────────────────────────────────

/** 尝试获取目标元素的位置 */
function getTargetRect(selector: string): TargetRect | null {
  try {
    const el = document.querySelector(selector)
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
  } catch {
    return null
  }
}

/** 根据目标位置和可用空间，计算气泡最佳放置方向 */
function calculateGeometry(
  rect: TargetRect | null,
  preferred: Placement,
  tooltipW: number,
  tooltipH: number,
): TooltipGeometry {
  // 无目标 → 居中
  if (!rect) {
    return {
      top: Math.max(20, (window.innerHeight - tooltipH) / 2),
      left: Math.max(20, (window.innerWidth - tooltipW) / 2),
      placement: 'center',
    }
  }

  const { top, left, width, height } = rect
  const cx = left + width / 2
  const cy = top + height / 2
  const m = TOOLTIP_MARGIN

  // 按优先顺序尝试各方向
  const order: Placement[] = []
  if (preferred !== 'center') order.push(preferred)
  for (const p of ['bottom', 'top', 'right', 'left'] as const) {
    if (!order.includes(p)) order.push(p)
  }

  for (const p of order) {
    if (p === 'bottom') {
      const tt = top + height + m
      if (tt + tooltipH < window.innerHeight - 10) {
        return {
          top: tt,
          left: Math.max(m, Math.min(cx - tooltipW / 2, window.innerWidth - tooltipW - m)),
          placement: p,
        }
      }
    } else if (p === 'top') {
      const tt = top - m - tooltipH
      if (tt > 10) {
        return {
          top: tt,
          left: Math.max(m, Math.min(cx - tooltipW / 2, window.innerWidth - tooltipW - m)),
          placement: p,
        }
      }
    } else if (p === 'right') {
      const tl = left + width + m
      if (tl + tooltipW < window.innerWidth - 10) {
        return {
          top: Math.max(m, Math.min(cy - tooltipH / 2, window.innerHeight - tooltipH - m)),
          left: tl,
          placement: p,
        }
      }
    } else if (p === 'left') {
      const tl = left - m - tooltipW
      if (tl > 10) {
        return {
          top: Math.max(m, Math.min(cy - tooltipH / 2, window.innerHeight - tooltipH - m)),
          left: tl,
          placement: p,
        }
      }
    }
  }

  // 全部放不下 → 默认底部
  return {
    top: top + height + m,
    left: Math.max(m, Math.min(cx - tooltipW / 2, window.innerWidth - tooltipW - m)),
    placement: 'bottom',
  }
}

// ── 箭头组件 ──────────────────────────────────────────

function Arrow({ placement }: { placement: Placement }) {
  if (placement === 'center') return null

  const arrowStyle: React.CSSProperties = {
    position: 'absolute',
    width: 14,
    height: 14,
    transform: 'rotate(45deg)',
    backgroundColor: 'rgb(255 255 255)', // card bg
  }

  // 暗色模式下箭头需要适配 — 用 CSS 变量
  arrowStyle.backgroundColor = 'var(--guide-arrow-bg, #fff)'

  switch (placement) {
    case 'bottom':
      // 气泡在目标下方，箭头在气泡顶部指向上方
      return (
        <div
          style={{
            ...arrowStyle,
            top: -7,
            left: '50%',
            marginLeft: -7,
            borderTop: '2px solid rgb(229 231 235)', // gray-200
            borderLeft: '2px solid rgb(229 231 235)',
          }}
          className="dark:border-gray-700"
        />
      )
    case 'top':
      // 气泡在目标上方，箭头在气泡底部指向下方
      return (
        <div
          style={{
            ...arrowStyle,
            bottom: -7,
            left: '50%',
            marginLeft: -7,
            borderBottom: '2px solid rgb(229 231 235)',
            borderRight: '2px solid rgb(229 231 235)',
          }}
          className="dark:border-gray-700"
        />
      )
    case 'right':
      // 气泡在目标右侧，箭头在气泡左侧指向左方
      return (
        <div
          style={{
            ...arrowStyle,
            left: -7,
            top: '50%',
            marginTop: -7,
            borderBottom: '2px solid rgb(229 231 235)',
            borderLeft: '2px solid rgb(229 231 235)',
          }}
          className="dark:border-gray-700"
        />
      )
    case 'left':
      // 气泡在目标左侧，箭头在气泡右侧指向右方
      return (
        <div
          style={{
            ...arrowStyle,
            right: -7,
            top: '50%',
            marginTop: -7,
            borderTop: '2px solid rgb(229 231 235)',
            borderRight: '2px solid rgb(229 231 235)',
          }}
          className="dark:border-gray-700"
        />
      )
    default:
      return null
  }
}

// ── 主组件 ────────────────────────────────────────────

export default function FirstTimeGuide({
  storageKey,
  steps,
  onComplete,
  manualVisible,
  onManualClose,
  showPrevButton = true,
}: FirstTimeGuideProps) {
  const [autoVisible, setAutoVisible] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
  const [geometry, setGeometry] = useState<TooltipGeometry>(() => ({
    top: typeof window !== 'undefined' ? Math.max(20, (window.innerHeight - TOOLTIP_EST_HEIGHT) / 2) : 0,
    left: typeof window !== 'undefined' ? Math.max(20, (window.innerWidth - TOOLTIP_WIDTH) / 2) : 0,
    placement: 'center' as Placement,
  }))

  const tooltipRef = useRef<HTMLDivElement>(null)
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isManual = manualVisible !== undefined
  const visible = isManual ? manualVisible : autoVisible

  // ── 自动模式：首次显示 ──────────────────────────────
  useEffect(() => {
    if (isManual) return
    const seen = localStorage.getItem(storageKey)
    if (!seen) {
      const timer = setTimeout(() => setAutoVisible(true), 500)
      return () => clearTimeout(timer)
    }
  }, [storageKey, isManual])

  // ── 计算目标位置和气泡几何 ──────────────────────────
  const updatePosition = useCallback(() => {
    const step = steps[currentStep]
    if (!step) return

    const rect = step.target ? getTargetRect(step.target) : null
    setTargetRect(rect)

    const tw = TOOLTIP_WIDTH
    const th = tooltipRef.current?.offsetHeight || TOOLTIP_EST_HEIGHT
    const preferred = step.placement || 'bottom'
    setGeometry(calculateGeometry(rect, preferred, tw, th))
  }, [steps, currentStep])

  // ── 步骤变化时，滚动目标到可视区并重新计算 ──────────
  useLayoutEffect(() => {
    if (!visible) return

    const step = steps[currentStep]
    if (!step?.target) {
      setTargetRect(null)
      const th = tooltipRef.current?.offsetHeight || TOOLTIP_EST_HEIGHT
      setGeometry(calculateGeometry(null, 'center', TOOLTIP_WIDTH, th))
      return
    }

    const el = document.querySelector(step.target)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      // 立即用当前位置更新（不等滚动完成）
      updatePosition()
      // 滚动动画完成后再校正一次
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
      scrollTimerRef.current = setTimeout(() => updatePosition(), 350)
    } else {
      updatePosition()
    }

    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    }
  }, [currentStep, visible, steps, updatePosition])

  // ── 窗口 resize / 滚动 时更新位置 ───────────────────
  useEffect(() => {
    if (!visible) return
    const handler = () => updatePosition()
    window.addEventListener('resize', handler)
    window.addEventListener('scroll', handler, true)
    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('scroll', handler, true)
    }
  }, [visible, updatePosition])

  // ── 测量后二次校正 ──────────────────────────────────
  useEffect(() => {
    if (!visible) return
    const raf = requestAnimationFrame(() => updatePosition())
    return () => cancelAnimationFrame(raf)
  }, [visible, currentStep, updatePosition])

  // ── 事件处理 ────────────────────────────────────────
  const handleClose = () => {
    if (!isManual) {
      localStorage.setItem(storageKey, '1')
      setAutoVisible(false)
    }
    setCurrentStep(0)
    onManualClose?.()
    onComplete?.()
  }

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleClose()
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  if (!visible) return null

  const step = steps[currentStep]
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === steps.length - 1
  const hasHighlight = targetRect !== null

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* ── 遮罩层 ────────────────────────────────── */}
          {hasHighlight ? (
            // 高亮模式：box-shadow 镂空遮罩
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed z-[100] pointer-events-auto"
              style={{
                top: targetRect!.top - HIGHLIGHT_PADDING,
                left: targetRect!.left - HIGHLIGHT_PADDING,
                width: targetRect!.width + HIGHLIGHT_PADDING * 2,
                height: targetRect!.height + HIGHLIGHT_PADDING * 2,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
                borderRadius: '8px',
                border: '2px solid rgb(99 102 241)',
                transition: 'all 0.3s ease',
              }}
              onClick={handleClose}
            />
          ) : (
            // 居中模式：全屏半透明遮罩
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm pointer-events-auto"
              onClick={handleClose}
            />
          )}

          {/* ── 气泡提示卡片 ──────────────────────────── */}
          <motion.div
            ref={tooltipRef}
            key={currentStep}
            initial={{ scale: 0.9, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="fixed z-[101] card w-[380px] max-w-[90vw] pointer-events-auto shadow-2xl"
            style={{
              top: Math.max(10, geometry.top),
              left: Math.max(10, Math.min(geometry.left, window.innerWidth - TOOLTIP_WIDTH - 10)),
            }}
          >
            {/* 箭头 */}
            {hasHighlight && <Arrow placement={geometry.placement} />}

            {/* 头部 */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 flex items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 text-xs font-bold">
                  {currentStep + 1}
                </span>
                <h3 className="text-base font-bold text-gray-800 dark:text-white">
                  {step.title}
                </h3>
              </div>
              <button
                onClick={handleClose}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="跳过引导"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 内容 */}
            <div className="px-5 py-4">
              <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line leading-relaxed">
                {step.content}
              </p>
            </div>

            {/* 底部操作栏 */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-700">
              {/* 步骤指示器 */}
              <div className="flex gap-1.5 items-center">
                {steps.map((_, index) => (
                  <div
                    key={index}
                    className={`h-1.5 rounded-full transition-all ${
                      index === currentStep
                        ? 'bg-primary-500 w-4'
                        : index < currentStep
                        ? 'bg-primary-300 w-1.5'
                        : 'bg-gray-300 dark:bg-gray-600 w-1.5'
                    }`}
                  />
                ))}
                <span className="text-xs text-gray-400 ml-1.5">
                  {currentStep + 1}/{steps.length}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* 跳过 */}
                <button
                  onClick={handleClose}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors px-2 py-1"
                >
                  跳过
                </button>

                {/* 上一步 */}
                {showPrevButton && (
                  <button
                    onClick={handlePrev}
                    disabled={isFirstStep}
                    className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      isFirstStep
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-300 dark:text-gray-500 cursor-not-allowed'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    上一步
                  </button>
                )}

                {/* 下一步 / 完成 */}
                <button
                  onClick={handleNext}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600 transition-colors"
                >
                  {isLastStep ? '完成' : '下一步'}
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
