import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageCircle,
  Send,
  ArrowLeft,
  Mic,
  Smile,
  Paperclip,
  Image as ImageIcon,
  X,
  Pen,
  FileText,
  Download,
  Play,
  Pause,
  Upload,
  Braces,
  Wrench,
  Gift,
  AlertTriangle,
  Search,
  Pin,
  Trash2,
  Edit3,
  RotateCcw,
  Square,
  Loader2,
} from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useCharacterStore, useChatStore, useSettingsStore, useFavoritesStore, useUIStore } from '@/stores'
import type { CharacterChatStatus } from '@/stores/chatStore'
import type { Message, ModelDisplay, Favorite, Character } from '@/types'
import Live2DViewer, { type Live2DViewerHandle } from '@/components/Live2DViewer'
import ThreeDViewer, { type ThreeDViewerHandle } from '@/components/ThreeDViewer'
import ThreeDErrorBoundary from '@/components/ThreeDErrorBoundary'
import MessageContextMenu, { type ContextMenuState } from '@/components/MessageContextMenu'
import FavoritesPanel from '@/components/FavoritesPanel'
import ForwardDialog from '@/components/ForwardDialog'
import ExpressionSetupGuide from '@/components/ExpressionSetupGuide'
import ExpressionManualMatch from '@/components/ExpressionManualMatch'
import ActionManualMatch from '@/components/ActionManualMatch'
import FirstTimeGuide from '@/components/FirstTimeGuide'
import { saveModelFile, loadModelFile, isPersistentModelRef } from '@/services/db'
import { isFirstImportDone, setFirstImportDone, checkFileFormatConsistency, loadExpressionMapping } from '@/utils/expressionMapping'
import { resetCharacterModelType, getCharacterModelType, setCharacterModelType, setCharacterFaceMode, type FaceMode } from '@/utils/characterModelType'
import { getAssistantSeed } from '@/services/assistantData'
import AssistantProfileEditor from '@/components/AssistantProfileEditor'
import { getImageFromPasteEvent } from '@/utils/imageUtils'
import { SpeechRecognitionManager } from '@/utils/speechRecognition'
import { recognizeSpeech } from '@/services/speechAPI'
import { API_BASE, authHeaders } from '@/services/apiClient'
import { TTS_ENABLED } from '@/config/features'

// ─── 工具函数 ──────────────────────────────────────────────────────────────

/** 格式化时间显示：如 "今天 14:30" */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')

  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return `今天 ${hh}:${mm}`
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    return `昨天 ${hh}:${mm}`
  }

  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${mo}月${dd}日 ${hh}:${mm}`
}

/** 格式化语音时长：秒数 → "00:32" */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ─── 链接识别工具 ──────────────────────────────────────────────────────────

/** 从消息内容中提取所有链接 */
function extractLinks(content: string): string[] {
  const links: string[] = []
  // http/https 链接
  const httpMatches = content.match(/https?:\/\/\S+/gi)
  if (httpMatches) links.push(...httpMatches)
  // www. 链接
  const wwwMatches = content.match(/\bwww\.\S+/gi)
  if (wwwMatches) links.push(...wwwMatches)
  // 域名格式链接（如 qq.com, baidu.com.cn 等）
  const domainMatches = content.match(/\b[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.(com|cn|org|net|edu|gov|io|xyz|top|vip|me|info|biz|tv|cc|co)\b/gi)
  if (domainMatches) links.push(...domainMatches)
  return links
}

/** 规范化链接为可打开的 URL */
function normalizeLink(link: string): string {
  const trimmed = link.replace(/[.,;:!?)\]}>]+$/, '')
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`
  return `https://${trimmed}`
}

/** 渲染带可点击链接的文本内容 */
function renderContentWithLinks(content: string, isUser: boolean): React.ReactNode {
  const links = extractLinks(content)
  if (links.length === 0) return content

  let lastIndex = 0
  const parts: React.ReactNode[] = []

  for (const link of links) {
    const index = content.indexOf(link, lastIndex)
    if (index === -1) continue
    if (index > lastIndex) {
      parts.push(content.substring(lastIndex, index))
    }
    parts.push(
      <a
        key={link + index}
        href={normalizeLink(link)}
        target="_blank"
        rel="noopener noreferrer"
        className={isUser ? 'text-blue-200 underline hover:text-blue-100' : 'text-primary-500 underline hover:text-primary-600'}
        onClick={(e) => e.stopPropagation()}
      >
        {link}
      </a>
    )
    lastIndex = index + link.length
  }

  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex))
  }

  return parts
}

// ─── 常量 ──────────────────────────────────────────────────────────────────

/** 状态对应的颜色样式 */
const STATUS_STYLES: Record<CharacterChatStatus, string> = {
  '在线': 'text-green-500',
  '离线': 'text-gray-400',
  '开心': 'text-yellow-500',
  '不开心': 'text-blue-400',
  '生气': 'text-red-500',
  '学习': 'text-indigo-500',
  '工作': 'text-purple-500',
  '思考': 'text-cyan-500',
  '疲惫': 'text-gray-500',
  '专注': 'text-orange-500',
}

/** 简易表情列表 */
const EMOJI_LIST = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
  '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
  '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
  '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐', '😯',
  '😪', '😫', '😴', '😌', '😛', '🤤', '😒', '😓', '😔', '🙃',
  '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵',
  '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🫶', '💪',
  '👍', '👎', '👏', '🙌', '👋', '🤝', '🙏', '❤️', '🧡', '💛',
]

// ─── 组件：左栏模型展示区 ───────────────────────────────────────────────────

/** 根据文件扩展名判断模型类型 */
function detectModelType(fileName: string): ModelDisplay['type'] | null {
  const lower = fileName.toLowerCase()
  // Live2D 优先判断（.vtube.json / .model3.json / .moc3 在 .json 之前匹配）
  if (
    lower.endsWith('.vtube.json') ||
    lower.endsWith('.model3.json') ||
    lower.endsWith('.moc3')
  ) {
    return 'live2d'
  }
  const ext = lower.split('.').pop() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'video'
  if (['obj', 'fbx', 'glb', 'gltf', 'stl', 'ply'].includes(ext)) return '3d'
  if (ext === 'json') return 'json'
  return null
}

/**
 * 从 vtube.json 文件内容中提取 model3.json 的路径，并尝试在 /models/ 目录下解析。
 * 返回可访问的 model3.json URL 路径；如果找不到则返回 null。
 */
async function resolveLive2DModelPath(file: File): Promise<string | null> {
  try {
    const text = await file.text()
    const config = JSON.parse(text)

    // 从 FileReferences.Model 获取 model3.json 文件名
    const modelFileName: string | undefined = config?.FileReferences?.Model
    if (!modelFileName) return null

    // 尝试在 /models/ 下的各子目录中查找 model3.json
    const baseName = modelFileName.replace(/\.model3\.json$/i, '') // e.g. "006rikai"

    // 尝试常见路径模式（相对路径：打包后经 file:// 相对 dist/ 解析，dev 下等价于站点根）
    const candidatePaths = [
      `models/006/${modelFileName}`,
      `models/${baseName}/${modelFileName}`,
      `models/${modelFileName}`,
    ]

    // 也可以从 vtube.json 文件名推导目录（如 006rikai.vtube.json -> models/006/）
    const vtubeBaseName = file.name.replace(/\.vtube\.json$/i, '')
    if (vtubeBaseName && !candidatePaths.includes(`models/${vtubeBaseName}/${modelFileName}`)) {
      candidatePaths.push(`models/${vtubeBaseName}/${modelFileName}`)
    }

    // 逐个尝试 fetch，找到第一个可访问的路径
    for (const path of candidatePaths) {
      if (await isValidModelFile(path)) {
        console.log('[Live2D] vtube.json 模型路径已解析:', path)
        return path
      }
    }

    return null
  } catch (err) {
    console.warn('[Live2D] 解析 vtube.json 失败:', err)
    return null
  }
}

/**
 * 验证给定的 URL 路径是否指向一个真实存在的 model3.json 文件。
 * Vite SPA 开发服务器会对未知路径返回 index.html（HTTP 200），因此需要检查 content-type。
 */
async function isValidModelFile(path: string): Promise<boolean> {
  // 用 XHR 而非 fetch：打包后页面为 file:// 协议，Chromium 拒绝 fetch 本地文件，
  // 而 XHR 在 webSecurity:false 下放行（dev 的 http 环境两者皆可）
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest()
      xhr.open('GET', path)
      xhr.onload = () => {
        // file:// 成功时 status 为 0
        if (xhr.status !== 200 && xhr.status !== 0) {
          resolve(false)
          return
        }
        const contentType = xhr.getResponseHeader('content-type') || ''
        // model3.json 应返回 application/json 或 text/plain，而不是 text/html（SPA fallback）
        if (contentType.includes('text/html')) {
          resolve(false)
          return
        }
        try {
          JSON.parse(xhr.responseText)
          resolve(true)
        } catch {
          resolve(false)
        }
      }
      xhr.onerror = () => resolve(false)
      xhr.send()
    } catch {
      resolve(false)
    }
  })
}

/**
 * 对于直接导入的 .model3.json 文件，尝试推导其可访问的 URL 路径。
 * 检查 /models/ 下各子目录是否能访问到该文件。
 */
async function tryDeriveModelPath(fileName: string): Promise<string | null> {
  const candidatePaths = [
    `models/006/${fileName}`,
    `models/${fileName.replace(/\.model3\.json$/i, '')}/${fileName}`,
    `models/${fileName}`,
  ]

  for (const path of candidatePaths) {
    if (await isValidModelFile(path)) return path
  }
  return null
}

/**
 * 对于直接导入的 .moc3 文件，尝试推导其对应的 .model3.json 可访问路径。
 * 从 .moc3 文件名推导基础名（如 "006rikai.moc3" -> "006rikai"），
 * 然后在 /models/ 下查找对应的 .model3.json 文件。
 */
async function tryDeriveModelPathFromMoc3(fileName: string): Promise<string | null> {
  const baseName = fileName.replace(/\.moc3$/i, '')
  const model3FileName = `${baseName}.model3.json`

  const candidatePaths = [
    `models/006/${model3FileName}`,
    `models/${baseName}/${model3FileName}`,
    `models/${model3FileName}`,
  ]

  for (const path of candidatePaths) {
    if (await isValidModelFile(path)) {
      console.log('[Live2D] 从 .moc3 推导出 model3.json 路径:', path)
      return path
    }
  }

  console.warn('[Live2D] 未能从 .moc3 文件推导出 model3.json 路径:', fileName)
  return null
}

// ─── 情绪 → 表情映射（通用场景名，Live2D 和 3D 共用） ─────────────────────

/** 根据消息内容分析情绪，返回通用场景名（happy/surprise/angry/sad/shy 等） */
function analyzeMessageEmotion(content: string): string {
  const lower = content.toLowerCase()
  if (/(哈哈|嘻嘻|开心|高兴|快乐|太好了|好棒|真好|耶|幸福|笑|haha|lol)/.test(lower)) return 'happy'
  if (/(！|!|哇|天哪|不会吧|什么|怎么|wow|omg)/.test(content)) return 'surprise'
  if (/(生气|讨厌|烦死|气死|怒|可恶|受不了|火大|发火|愤怒|气愤|恼火|恼怒|暴怒|怒火|气炸|气坏|气人|angry|mad|annoyed|rage)/.test(lower)) return 'angry'
  if (/(难过|伤心|不开心|郁闷|哭|失落|沮丧|sad|cry)/.test(lower)) return 'sad'
  if (/(害羞|脸红|不好意思|shy|blush)/.test(lower)) return 'shy'
  if (/(累|困|疲惫|没精神|好累|疲劳)/.test(content)) return 'sad'
  if (/(想|思考|琢磨|考虑|不确定|不知道)/.test(content)) return 'shy'
  if (/(爱|喜欢|心动|甜|love)/.test(lower)) return 'happy'
  return 'happy' // 默认微笑
}

/** 根据角色状态返回通用场景名 */
function statusToExpression(status: CharacterChatStatus): string | null {
  const map: Record<CharacterChatStatus, string | null> = {
    '在线': null,
    '离线': null,
    '开心': 'happy',
    '不开心': 'sad',
    '生气': 'angry',
    '学习': 'shy',
    '工作': 'shy',
    '思考': 'shy',
    '疲惫': 'sad',
    '专注': null,
  }
  return map[status] ?? null
}

// ─── 悬浮对话框：根据上下文生成适度相关的问候语 ───────────────────────────

const FLOATING_REPLIES: { keywords: string[]; replies: string[] }[] = [
  {
    keywords: ['天气', '下雨', '晴', '阴', '风', '冷', '热'],
    replies: ['今天很适合出去走走呢~', '注意保暖哦~', '天气不错，心情也跟着好起来了~'],
  },
  {
    keywords: ['吃饭', '吃', '饿', '饭', '早餐', '午餐', '晚餐', '外卖'],
    replies: ['记得按时吃饭哦~', '饿了就去吃点东西吧~', '今天吃了什么好吃的呀？'],
  },
  {
    keywords: ['累', '困', '疲惫', '睡', '休息', '加班'],
    replies: ['辛苦了，注意休息哦~', '累了就歇会儿吧~', '别太拼了，身体最重要~'],
  },
  {
    keywords: ['开心', '高兴', '哈哈', '快乐', '太好了', '棒'],
    replies: ['看你开心的样子，我也高兴呢~', '继续保持好心情哦~', '今天发生什么好事了呀？'],
  },
  {
    keywords: ['难过', '伤心', '不开心', '郁闷', '哭', '烦'],
    replies: ['别难过了，我陪着你呢~', '想开点，一切都会好起来的~', '有什么烦心事，说给我听听？'],
  },
  {
    keywords: ['工作', '学习', '作业', '考试', '项目', '忙'],
    replies: ['加油，你一定可以的~', '适当休息一下效率更高哦~', '需要帮忙的时候随时叫我~'],
  },
  {
    keywords: ['你好', '嗨', '在吗', '在不在', 'hello', 'hi'],
    replies: ['你好呀~', '我一直都在呢~', '找我有什么事吗？'],
  },
  {
    keywords: ['想', '思念', '想念', '怀念'],
    replies: ['我也在想你呢~', '想到什么了呀？', '怀念的时光总是美好的~'],
  },
]

const DEFAULT_FLOATING_REPLIES = [
  '嗯？怎么了~',
  '在叫我吗？',
  '有什么想说的吗？',
  '我一直在这里哦~',
  '想聊点什么呀？',
]

/** 根据最后一条用户消息生成悬浮对话框内容 */
function generateFloatingReply(lastUserMessage: string): string {
  const lower = lastUserMessage.toLowerCase()
  for (const { keywords, replies } of FLOATING_REPLIES) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return replies[Math.floor(Math.random() * replies.length)]
    }
  }
  return DEFAULT_FLOATING_REPLIES[Math.floor(Math.random() * DEFAULT_FLOATING_REPLIES.length)]
}

// ─── ModelDisplayArea 组件 ─────────────────────────────────────────────────

function ModelDisplayArea({
  modelDisplay,
  onImport,
  live2dRef,
  threeDRef,
  lastUserMessage,
  characterId,
  onManualMatchExpression,
  onManualMatchAction,
  onModelReady,
  isAssistant,
  assistantId,
}: {
  modelDisplay?: ModelDisplay
  onImport: (files: File[]) => void
  live2dRef: React.RefObject<Live2DViewerHandle>
  threeDRef: React.RefObject<ThreeDViewerHandle>
  lastUserMessage?: string
  characterId?: string
  onManualMatchExpression?: () => void
  onManualMatchAction?: () => void
  onModelReady?: () => void
  isAssistant?: boolean
  assistantId?: string
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [floatingText, setFloatingText] = useState<string | null>(null)
  // 3D 模型能力检测弹窗
  const [capsModal, setCapsModal] = useState<{
    visible: boolean
    message: string
    hasBones: boolean
    hasMorphTargets: boolean
    expressionLevel: 'morph' | 'none'
    showManualMatch: boolean
  }>({ visible: false, message: '', hasBones: true, hasMorphTargets: true, expressionLevel: 'morph', showManualMatch: false })
  const floatingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [floatingPos, setFloatingPos] = useState<{ x: number; y: number } | null>(null)
  const floatingRafRef = useRef<number>(0)

  // 3D 模型能力检测回调
  // 仅在首次导入时弹出提示，后续进入不再弹出（按角色独立记录）
  const handleCapsDetected = useCallback((caps: { hasMorphTargets: boolean; hasBones: boolean; expressionLevel: 'morph' | 'none' }) => {
    // 检查该角色是否已弹过提示
    const tipKey = `caps_tip_shown_${characterId}`
    if (localStorage.getItem(tipKey) === 'true') return

    let message = ''
    let showManualMatch = false

    if (!caps.hasBones) {
      // 无骨骼：增加手动匹配选项
      message = '当前模型未检测到骨骼，无法实现肢体动作和表情变化，仅作静态展示（支持拖拽、旋转、缩放）。您也可以手动导入动作/表情文件进行匹配。'
      showManualMatch = true
    } else if (caps.hasBones && !caps.hasMorphTargets) {
      // 有骨骼但无变形目标
      message = '当前模型有骨骼但无变形目标，无法实现表情变化，但可支持肢体动作。请手动匹配动作文件。'
      showManualMatch = true
    } else if (caps.hasBones && caps.hasMorphTargets) {
      // 有骨骼且有变形目标
      message = '当前模型检测到骨骼和变形目标，可支持肢体动作和表情变化。请手动匹配动作与表情文件。'
      showManualMatch = true
    }

    if (message) {
      setCapsModal({
        visible: true,
        message,
        hasBones: caps.hasBones,
        hasMorphTargets: caps.hasMorphTargets,
        expressionLevel: caps.expressionLevel,
        showManualMatch,
      })
      // 标记该角色已弹过提示
      localStorage.setItem(tipKey, 'true')
    }
  }, [characterId])

  // 点击模型：弹出悬浮对话框
  const handleModelClick = useCallback(() => {
    const text = generateFloatingReply(lastUserMessage || '')
    setFloatingText(text)

    // 清除上一个定时器
    if (floatingTimerRef.current) clearTimeout(floatingTimerRef.current)
    // 5 秒后自动消失
    floatingTimerRef.current = setTimeout(() => {
      setFloatingText(null)
    }, 5000)
  }, [lastUserMessage])

  // 悬浮文字显示时，实时跟踪模型位置
  useEffect(() => {
    if (!floatingText) {
      if (floatingRafRef.current) cancelAnimationFrame(floatingRafRef.current)
      setFloatingPos(null)
      return
    }

    const updatePosition = () => {
      // 根据当前模型类型获取位置
      const modelType = modelDisplay?.type || 'live2d'
      let pos: { x: number; y: number; width: number; height: number } | null = null

      if (modelType === '3d') {
        pos = threeDRef.current?.getModelScreenPosition?.() ?? null
      } else {
        pos = live2dRef.current?.getModelScreenPosition?.() ?? null
      }

      if (pos) {
        // 悬浮框定位在模型头部上方（模型顶部偏上 10px）
        // 模型头部大约在模型顶部 15% 处
        const headY = pos.y + pos.height * 0.1
        const centerX = pos.x + pos.width / 2
        setFloatingPos({ x: centerX, y: Math.max(10, headY - 50) })
      }
      floatingRafRef.current = requestAnimationFrame(updatePosition)
    }

    floatingRafRef.current = requestAnimationFrame(updatePosition)
    return () => {
      if (floatingRafRef.current) cancelAnimationFrame(floatingRafRef.current)
    }
  }, [floatingText, modelDisplay?.type, live2dRef, threeDRef])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (floatingTimerRef.current) clearTimeout(floatingTimerRef.current)
    }
  }, [])

  return (
    <div id="model-display" className="h-full w-full flex items-center justify-center bg-gradient-to-b from-indigo-50 to-purple-50 dark:from-gray-800 dark:to-gray-900 relative overflow-hidden">
      {/* 装饰性背景圆 */}
      <div className="absolute top-10 left-10 w-32 h-32 rounded-full bg-primary-200/30 dark:bg-primary-700/20 blur-2xl" />
      <div className="absolute bottom-20 right-10 w-40 h-40 rounded-full bg-purple-200/30 dark:bg-purple-700/20 blur-3xl" />

      {/* 模型内容 / 默认 Live2D */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full h-full p-4">
        {modelDisplay ? (
          <>
            {/* 图片：居中显示，保持比例 */}
            {modelDisplay.type === 'image' && (
              <img
                src={modelDisplay.url}
                alt={modelDisplay.fileName}
                className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
              />
            )}

            {/* 视频：居中显示，自动播放（静音） */}
            {modelDisplay.type === 'video' && (
              <video
                src={modelDisplay.url}
                className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                autoPlay
                loop
                muted
                playsInline
              />
            )}

            {/* Live2D 模型：使用导入的模型路径，无模型时显示占位提示 */}
            {modelDisplay.type === 'live2d' && modelDisplay.url && modelDisplay.url !== '__MISSING__' && (
              <Live2DViewer
                ref={live2dRef}
                modelPath={modelDisplay.url}
                className="absolute inset-0"
                onModelClick={handleModelClick}
                onModelReady={onModelReady}
                characterId={characterId}
              />
            )}

            {/* Live2D 模型文件缺失提示 */}
            {modelDisplay.type === 'live2d' && modelDisplay.url === '__MISSING__' && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 max-w-[260px] text-center shadow-xl">
                  <p className="text-sm text-gray-700 dark:text-gray-200">
                    缺少模型文件，请确保 vtube.json 与 model3.json 在同一目录
                  </p>
                </div>
              </div>
            )}

            {/* Live2D 类型但 url 为空：显示占位提示（不回退到测试模型） */}
            {modelDisplay.type === 'live2d' && !modelDisplay.url && (
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary-200 to-purple-200 dark:from-primary-700 dark:to-purple-700 flex items-center justify-center shadow-xl">
                  <Smile className="w-12 h-12 text-primary-400 dark:text-primary-300" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    尚未导入模型
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    点击右下角按钮导入 Live2D / 3D / 图片等模型文件
                  </p>
                </div>
              </div>
            )}

            {/* 3D 模型渲染 */}
            {modelDisplay.type === '3d' && modelDisplay.url && (
              <ThreeDErrorBoundary>
                <ThreeDViewer
                  ref={threeDRef}
                  url={modelDisplay.url}
                  fileName={modelDisplay.fileName}
                  mtlUrl={modelDisplay.mtlUrl}
                  className="absolute inset-0"
                  onModelClick={handleModelClick}
                  onCapabilitiesDetected={handleCapsDetected}
                />
              </ThreeDErrorBoundary>
            )}

            {/* JSON 文件占位提示 */}
            {modelDisplay.type === 'json' && (
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-xl">
                  <Braces className="w-12 h-12 text-white" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                    JSON 文件已导入
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    预览功能开发中
                  </p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 truncate max-w-[200px]">
                    {modelDisplay.fileName}
                  </p>
                </div>
              </div>
            )}
          </>
        ) : isAssistant && assistantId ? (
          /* AI助手无模型状态：显示助手头像占位 */
          (() => {
            const seed = getAssistantSeed(assistantId)
            if (!seed) return null
            return (
              <div className="flex flex-col items-center gap-5 text-center">
                <div className={`w-32 h-32 rounded-3xl bg-gradient-to-br ${seed.avatarColor} flex items-center justify-center text-white text-5xl font-bold shadow-2xl`}>
                  {seed.name}
                </div>
                <div className="space-y-2 max-w-[240px]">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                      AI助手
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    {seed.intro}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    模型功能后续支持，敬请期待
                  </p>
                </div>
              </div>
            )
          })()
        ) : (
          /* 无模型状态：显示占位提示，不加载任何测试模型 */
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary-200 to-purple-200 dark:from-primary-700 dark:to-purple-700 flex items-center justify-center shadow-xl">
              <Smile className="w-12 h-12 text-primary-400 dark:text-primary-300" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                尚未导入模型
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                点击右下角按钮导入 Live2D / 3D / 图片等模型文件
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 悬浮对话框（模型头部上方，跟随模型位置，不进入聊天记录） */}
      {floatingText && floatingPos && (
        <div
          className="absolute z-30 max-w-[220px] animate-fade-in pointer-events-none"
          style={{
            left: `${floatingPos.x}px`,
            top: `${floatingPos.y}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-lg px-4 py-3 border border-gray-200 dark:border-gray-600">
            <p className="text-xs text-gray-700 dark:text-gray-200 leading-relaxed">
              {floatingText}
            </p>
            {/* 小三角指向模型头部 */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white/90 dark:bg-gray-800/90 border-b border-r border-gray-200 dark:border-gray-600 rotate-45" />
          </div>
        </div>
      )}

      {/* 导入按钮（右下角浮动）- AI助手不显示 */}
      {!isAssistant && (
        <button
          id="btn-import-model"
          onClick={() => fileInputRef.current?.click()}
          className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 px-3 py-2 bg-white/90 dark:bg-gray-700/90 backdrop-blur-sm rounded-lg shadow-md border border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 hover:shadow-lg transition-all"
          title="导入模型文件（支持同时选择 .obj + .mtl）"
        >
          <Upload className="w-3.5 h-3.5" />
          {modelDisplay ? '更换模型' : '导入模型'}
        </button>
      )}

      {/* 隐藏的文件选择器（支持多选，用于 .obj + .mtl） */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.gif,.bmp,.webp,.mp4,.webm,.mov,.moc3,.model3.json,.vtube.json,.obj,.fbx,.glb,.gltf,.stl,.ply,.mtl,.json"
        onChange={(e) => {
          const files = Array.from(e.target.files || [])
          if (files.length) onImport(files)
          e.target.value = ''
        }}
        className="hidden"
      />

      {/* 3D 模型能力检测提示弹窗 */}
      <AnimatePresence>
        {capsModal.visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setCapsModal({ ...capsModal, visible: false })}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-5 max-w-[340px] w-[85%]"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                </div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  模型检测提示
                </h3>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line mb-4">
                {capsModal.message}
              </p>

              {/* 动态按钮区域 */}
              <div className="flex flex-col gap-2">
                {/* 无骨骼：手动匹配选项 */}
                {!capsModal.hasBones && capsModal.showManualMatch && (
                  <button
                    onClick={() => {
                      onManualMatchAction?.()
                      setCapsModal({ ...capsModal, visible: false })
                    }}
                    className="w-full py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    手动匹配
                  </button>
                )}

                {/* 有骨骼但无变形目标：手动匹配动作 */}
                {capsModal.hasBones && !capsModal.hasMorphTargets && (
                  <button
                    onClick={() => {
                      onManualMatchAction?.()
                      setCapsModal({ ...capsModal, visible: false })
                    }}
                    className="w-full py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    手动匹配动作
                  </button>
                )}

                {/* 有骨骼且有变形目标：手动匹配表情 + 手动匹配动作 */}
                {capsModal.hasBones && capsModal.hasMorphTargets && (
                  <>
                    <button
                      onClick={() => {
                        onManualMatchExpression?.()
                        setCapsModal({ ...capsModal, visible: false })
                      }}
                      className="w-full py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      手动匹配表情
                    </button>
                    <button
                      onClick={() => {
                        onManualMatchAction?.()
                        setCapsModal({ ...capsModal, visible: false })
                      }}
                      className="w-full py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors"
                    >
                      手动匹配动作
                    </button>
                  </>
                )}

                {/* 知道了（始终显示） */}
                <button
                  onClick={() => setCapsModal({ ...capsModal, visible: false })}
                  className="w-full py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-lg transition-colors"
                >
                  知道了
                </button>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3 text-center">
                模型仍可静态展示，不影响正常使用。
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── 组件：顶部信息区 ───────────────────────────────────────────────────────

function TopInfoBar({
  characterName,
  status,
  onBack,
  onSettings,
  onNameClick,
  isNameClickable,
}: {
  characterName: string
  status: CharacterChatStatus
  onBack: () => void
  onSettings: () => void
  onNameClick?: () => void
  isNameClickable?: boolean
}) {
  const statusStyle = STATUS_STYLES[status] || STATUS_STYLES['在线']

  return (
    <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
      <button
        onClick={onBack}
        data-guide="back-button"
        className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        title="返回"
      >
        <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
      </button>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <h2
          className={`text-lg font-bold text-gray-800 dark:text-white truncate ${
            isNameClickable ? 'cursor-pointer hover:text-primary-500 transition-colors' : ''
          }`}
          onClick={isNameClickable ? onNameClick : undefined}
        >
          {characterName}
        </h2>
        <span className={`text-sm font-medium ${statusStyle} flex-shrink-0`}>
          （{status}）
        </span>
      </div>
      {/* 画笔图标：角色设置入口 */}
      <button
        id="btn-chat-settings"
        onClick={onSettings}
        className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
        title="角色设置"
      >
        <Pen className="w-5 h-5 text-gray-600 dark:text-gray-400" />
      </button>
    </div>
  )
}

// ─── 工具：打开文件 ────────────────────────────────────────────────────────

/** 通过创建临时 <a> 标签下载/打开文件 */
function openFile(url: string, name: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.target = '_blank'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ─── 组件：语音播放条（AI 回复消息气泡内） ─────────────────────────────────

function VoiceBar({ text }: { text: string }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState(false)
  const [showTtsGuide, setShowTtsGuide] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  // 从当前角色获取音色设置
  const currentCharacter = useCharacterStore(s => s.currentCharacter)
  const voiceId = currentCharacter?.settings?.voiceType || ''
  const voiceParam = voiceId && voiceId !== 'default' ? voiceId : 'x5_lingyuzhao_flow'

  const handlePlayPause = async () => {
    if (isLoading) return

    // 首次点击播放 → 显示语音合成说明弹窗
    if (!localStorage.getItem('has_seen_tts_guide')) {
      localStorage.setItem('has_seen_tts_guide', '1')
      setShowTtsGuide(true)
      return
    }

    if (isPlaying && audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
      return
    }

    if (audioRef.current && !error) {
      audioRef.current.play()
      setIsPlaying(true)
      return
    }

    // 首次播放：调用 TTS 合成
    setIsLoading(true)
    setError(false)
    try {
      const response = await fetch(`${API_BASE}/api/voice/synthesize`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: voiceParam }),
      })
      if (!response.ok) throw new Error('合成失败')

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      // 释放旧 URL
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = url

      const audio = new Audio(url)
      audio.addEventListener('loadedmetadata', () => setDuration(audio.duration))
      audio.addEventListener('timeupdate', () => {
        setProgress((audio.currentTime / (audio.duration || 1)) * 100)
      })
      audio.addEventListener('ended', () => {
        setIsPlaying(false)
        setProgress(0)
      })
      audioRef.current = audio
      await audio.play()
      setIsPlaying(true)
    } catch {
      setError(true)
    } finally {
      setIsLoading(false)
    }
  }

  // 组件卸载时释放
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  return (
    <>
      <div className="mt-1.5 flex items-center gap-2 px-2 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-600/50 border border-gray-100 dark:border-gray-500 min-w-[160px]">
        <button
          onClick={handlePlayPause}
          disabled={isLoading || error}
          className="p-1.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-500 hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors flex-shrink-0 disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-3.5 h-3.5" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
        </button>
        <div className="flex-1 flex flex-col gap-0.5 min-w-0">
          <div className="h-1 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-500">
            <div
              className="h-full rounded-full bg-primary-400 transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {error ? '合成失败' : duration > 0 ? formatDuration(duration) : '语音播报'}
          </span>
        </div>
      </div>

      {/* 首次语音合成说明弹窗 */}
      {showTtsGuide && (
        <FirstTimeGuide
          storageKey="has_seen_tts_guide"
          manualVisible={showTtsGuide}
          onManualClose={() => setShowTtsGuide(false)}
          steps={[
            {
              title: '🔊 语音合成说明',
              content: '当前版本的语音合成处于初步阶段，\n声音可能带有一定的机械感。\n\n更自然、更鲜活的语音效果，\n将在后续版本中持续优化。',
            },
          ]}
        />
      )}
    </>
  )
}

// ─── 组件：消息气泡 ─────────────────────────────────────────────────────────

function MessageBubble({
  message,
  onContextMenu,
  isEditing,
  onEditSave,
  onEditCancel,
}: {
  message: Message
  onContextMenu: (e: React.MouseEvent, message: Message) => void
  isEditing: boolean
  onEditSave: (content: string) => void
  onEditCancel: () => void
}) {
  const isUser = message.role === 'user'
  const settings = useSettingsStore((s) => s.settings)
  const bubbleOpacity = settings?.messageBubbleOpacity ?? 100

  // 编辑模式状态
  const [editText, setEditText] = useState(message.content)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)

  // 语音播放状态
  const [isPlaying, setIsPlaying] = useState(false)
  const [playProgress, setPlayProgress] = useState(0) // 0-100
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 进入编辑模式时聚焦
  useEffect(() => {
    if (isEditing && editTextareaRef.current) {
      setEditText(message.content)
      editTextareaRef.current.focus()
      editTextareaRef.current.select()
    }
  }, [isEditing, message.content])

  // 点击文件打开
  const handleFileClick = () => {
    if (message.fileInfo?.url) {
      openFile(message.fileInfo.url, message.fileInfo.name)
    }
  }

  // 点击图片预览
  const handleImageClick = () => {
    if (message.fileInfo?.url) {
      window.dispatchEvent(
        new CustomEvent('chat:image-preview', { detail: message.fileInfo.url })
      )
    }
  }

  // 语音播放/暂停
  const handlePlayVoice = () => {
    if (!message.voiceInfo?.url) return
    if (!audioRef.current) {
      audioRef.current = new Audio(message.voiceInfo.url)
      audioRef.current.addEventListener('timeupdate', () => {
        if (audioRef.current) {
          const pct = (audioRef.current.currentTime / (audioRef.current.duration || 1)) * 100
          setPlayProgress(pct)
        }
      })
      audioRef.current.addEventListener('ended', () => {
        setIsPlaying(false)
        setPlayProgress(0)
      })
    }
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  // 编辑保存
  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onEditSave(editText)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onEditCancel()
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}
    >
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[70%]`}>
        {/* 气泡内容 */}
        <div
          onContextMenu={(e) => onContextMenu(e, message)}
          style={{ opacity: bubbleOpacity / 100 }}
          className={`px-4 py-2 rounded-2xl break-words ${
            isUser
              ? 'bg-primary-500 text-white rounded-br-md'
              : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-md shadow-sm border border-gray-100 dark:border-gray-600'
          }`}
        >
          {/* 撤回消息：白色斜体显示 */}
          {message.isWithdrawn ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed italic text-white">
              已撤回
            </p>
          ) : isEditing ? (
            /* 编辑模式 */
            message.type === 'voice' && message.voiceInfo ? (
              /* 语音消息编辑：保留语音条 + 编辑转写文字 */
              <div className="flex flex-col gap-2 py-1 min-w-[180px]">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handlePlayVoice}
                    className={`p-2 rounded-full flex-shrink-0 transition-colors ${
                      isUser
                        ? 'bg-white/20 hover:bg-white/30 text-white'
                        : 'bg-primary-100 dark:bg-primary-900/30 hover:bg-primary-200 dark:hover:bg-primary-900/50 text-primary-500'
                    }`}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 flex flex-col gap-1">
                    <div className={`h-1.5 rounded-full overflow-hidden ${
                      isUser ? 'bg-white/30' : 'bg-gray-200 dark:bg-gray-600'
                    }`}>
                      <div
                        className={`h-full rounded-full transition-all ${
                          isUser ? 'bg-white' : 'bg-primary-500'
                        }`}
                        style={{ width: `${playProgress}%` }}
                      />
                    </div>
                    <span className={`text-xs ${
                      isUser ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {formatDuration(message.voiceInfo.duration)}
                    </span>
                  </div>
                </div>
                <textarea
                  ref={editTextareaRef}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  onBlur={() => onEditSave(editText)}
                  className={`w-full px-2 py-1 text-sm rounded-lg resize-none focus:outline-none border ${
                    isUser
                      ? 'bg-white/20 text-white border-white/30 placeholder-white/60'
                      : 'bg-gray-50 dark:bg-gray-600 text-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-500'
                  }`}
                  rows={2}
                />
                <p className={`text-xs ${isUser ? 'text-white/60' : 'text-gray-400'}`}>
                  Enter保存 · Esc取消
                </p>
              </div>
            ) : (
              /* 普通文字消息编辑：内联编辑框 */
              <div className="min-w-[200px]">
                <textarea
                  ref={editTextareaRef}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  onBlur={() => onEditSave(editText)}
                  className="w-full px-2 py-1 text-sm bg-white/20 dark:bg-black/20 rounded-lg resize-none focus:outline-none border border-white/30 dark:border-white/20 text-white placeholder-white/60"
                  rows={2}
                />
                <p className="text-xs text-white/60 mt-1">Enter保存 · Esc取消</p>
              </div>
            )
          ) : (
            <>
              {/* 文本消息（含链接识别） */}
{message.type !== 'image' && message.type !== 'file' && message.type !== 'voice' && (
  <>
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {renderContentWithLinks(message.content, isUser)}
    </p>
    {/* ─── AI 消息的语音播放条（TTS 入口开关，见 config/features） ─── */}
    {TTS_ENABLED && !isUser && !message.isWithdrawn && message.content && (
      <VoiceBar text={message.content} />
    )}
  </>
)}

              {/* 图片消息 */}
              {message.type === 'image' && message.fileInfo && (
                <div className="flex flex-col gap-2">
                  <img
                    src={message.fileInfo.thumbnailUrl || message.fileInfo.url}
                    alt={message.fileInfo.name}
                    className="message-image max-w-full max-h-48 rounded-lg object-cover cursor-pointer"
                    onClick={handleImageClick}
                  />
                  {message.content && message.content !== message.fileInfo.name && (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                  )}
                </div>
              )}

              {/* 文件消息 */}
              {message.type === 'file' && message.fileInfo && (
                <div
                  className="flex items-center gap-2 py-1 cursor-pointer hover:bg-black/5 dark:hover:bg-white/10 rounded-lg px-1 -mx-1 transition-colors"
                  onClick={handleFileClick}
                  title="点击下载/打开文件"
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isUser ? 'bg-white/20' : 'bg-primary-100 dark:bg-primary-900/30'
                  }`}>
                    <FileText className={`w-5 h-5 ${isUser ? 'text-white' : 'text-primary-500'}`} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className={`text-sm font-medium truncate max-w-[180px] ${
                      isUser ? 'text-white' : 'text-gray-800 dark:text-gray-100'
                    }`}>
                      {message.fileInfo.name}
                    </span>
                    {message.fileInfo.size && (
                      <span className={`text-xs ${isUser ? 'text-white/70' : 'text-gray-400'}`}>
                        {(message.fileInfo.size / 1024).toFixed(1)} KB
                      </span>
                    )}
                  </div>
                  <Download className={`w-4 h-4 flex-shrink-0 ${isUser ? 'text-white/70' : 'text-gray-400'}`} />
                </div>
              )}

              {/* 语音消息 */}
              {message.type === 'voice' && message.voiceInfo && (
                <div className="flex flex-col gap-2 py-1 min-w-[180px]">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handlePlayVoice}
                      className={`p-2 rounded-full flex-shrink-0 transition-colors ${
                        isUser
                          ? 'bg-white/20 hover:bg-white/30 text-white'
                          : 'bg-primary-100 dark:bg-primary-900/30 hover:bg-primary-200 dark:hover:bg-primary-900/50 text-primary-500'
                      }`}
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <div className="flex-1 flex flex-col gap-1">
                      {/* 进度条 */}
                      <div className={`h-1.5 rounded-full overflow-hidden ${
                        isUser ? 'bg-white/30' : 'bg-gray-200 dark:bg-gray-600'
                      }`}>
                        <div
                          className={`h-full rounded-full transition-all ${
                            isUser ? 'bg-white' : 'bg-primary-500'
                          }`}
                          style={{ width: `${playProgress}%` }}
                        />
                      </div>
                      {/* 时长 */}
                      <span className={`text-xs ${
                        isUser ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'
                      }`}>
                        {formatDuration(message.voiceInfo.duration)}
                      </span>
                    </div>
                  </div>
                  {/* 语音转文字内容 */}
                  {message.content && !message.content.startsWith('语音消息') && (
                    <p className={`text-sm leading-relaxed whitespace-pre-wrap mt-1 ${
                      isUser ? 'text-white/90' : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      {message.content}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* 时间戳 */}
        <span className="text-xs text-gray-400 dark:text-gray-500 mt-1 px-2">
          {formatTime(message.timestamp)}
        </span>
      </div>
    </motion.div>
  )
}

// ─── 组件：打字指示器 ───────────────────────────────────────────────────────

function TypingIndicator({ onAbort }: { onAbort?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex justify-start mb-3"
    >
      <div
        className={`bg-white dark:bg-gray-700 px-4 py-3 rounded-2xl rounded-bl-md shadow-sm border border-gray-100 dark:border-gray-600 ${onAbort ? 'cursor-pointer hover:border-red-300 dark:hover:border-red-500 transition-colors' : ''}`}
        onClick={onAbort}
        title={onAbort ? '点击停止生成' : undefined}
      >
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          <span className="text-xs text-gray-400 ml-1">正在输入...</span>
        </div>
      </div>
    </motion.div>
  )
}

// ─── 组件：消息列表 ─────────────────────────────────────────────────────────

function MessageList({
  messages,
  isTyping,
  hasBackground,
  onContextMenu,
  editingMessageId,
  onEditSave,
  onEditCancel,
  onAbortTyping,
}: {
  messages: Message[]
  isTyping: boolean
  hasBackground: boolean
  onContextMenu: (e: React.MouseEvent, message: Message) => void
  editingMessageId: string | null
  onEditSave: (content: string) => void
  onEditCancel: () => void
  onAbortTyping?: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isTyping])

  return (
    <div
      ref={scrollRef}
      id="chat-area"
      className={`flex-1 overflow-y-auto px-4 py-4 scrollbar-thin relative z-10 ${
        hasBackground ? '' : 'bg-gray-50 dark:bg-gray-900'
      }`}
    >
      {messages.length === 0 && !isTyping ? (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
          <MessageCircle className="w-12 h-12 mb-3 opacity-40" />
          <p className="text-sm">开始和角色聊天吧～</p>
        </div>
      ) : (
        <>
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onContextMenu={onContextMenu}
              isEditing={editingMessageId === msg.id}
              onEditSave={onEditSave}
              onEditCancel={onEditCancel}
            />
          ))}
          <AnimatePresence>{isTyping && <TypingIndicator onAbort={onAbortTyping} />}</AnimatePresence>
        </>
      )}
    </div>
  )
}

// ─── 组件：表情面板 ─────────────────────────────────────────────────────────

function EmojiPanel({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void
  onClose: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="absolute bottom-full right-0 mb-2 p-3 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 w-72 z-20"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">表情</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      <div className="grid grid-cols-10 gap-1 max-h-48 overflow-y-auto scrollbar-thin">
        {EMOJI_LIST.map((emoji, i) => (
          <button
            key={i}
            onClick={() => onSelect(emoji)}
            className="w-7 h-7 flex items-center justify-center text-xl rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {emoji}
          </button>
        ))}
      </div>
    </motion.div>
  )
}

// ─── 组件：图片预览弹窗 ─────────────────────────────────────────────────────

function ImagePreviewModal({
  src,
  onClose,
}: {
  src: string
  onClose: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-8"
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
      >
        <X className="w-6 h-6 text-white" />
      </button>
      <img src={src} alt="预览" className="max-w-full max-h-full object-contain rounded-lg" />
    </motion.div>
  )
}

// ─── 组件：输入区域 ─────────────────────────────────────────────────────────

function InputArea({
  onSend,
  disabled,
  onSendFavorite,
  isTyping,
  onAbort,
}: {
  onSend: (content: string, type?: 'text' | 'image' | 'file' | 'voice', fileInfo?: Message['fileInfo'], voiceInfo?: Message['voiceInfo']) => void
  disabled: boolean
  onSendFavorite: (favorite: Favorite) => void
  isTyping: boolean
  onAbort: () => void
}) {
  const { settings, updateSettings } = useSettingsStore()
  const { addNotification } = useUIStore()
  const [text, setText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [showToolbox, setShowToolbox] = useState(false)
  const [showFavorites, setShowFavorites] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  // 粘贴图片预览（多图）
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null)
  // 权限请求弹窗
  const [permissionModal, setPermissionModal] = useState<{ type: 'mic' | 'file'; visible: boolean }>({ type: 'mic', visible: false })
  // 权限拒绝提示
  const [permissionDeniedHint, setPermissionDeniedHint] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const toolboxRef = useRef<HTMLDivElement>(null)
  // 输入框右键菜单状态
  const [inputContextMenu, setInputContextMenu] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 })
  const inputContextMenuRef = useRef<HTMLDivElement>(null)

  // 录音相关 refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingStartTimeRef = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const autoStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 语音识别相关
  const speechRecognitionRef = useRef<SpeechRecognitionManager | null>(null)
  // 录音前输入框已有文字，用于实时拼接识别结果
  const originalTextRef = useRef<string>('')
  // 录音停止后暂存的语音数据，等用户点击发送时一起发出
  const pendingVoiceRef = useRef<{ url: string; duration: number } | null>(null)
  const [hasPendingVoice, setHasPendingVoice] = useState(false)

  // 首次引导状态
  const [showVoiceGuide, setShowVoiceGuide] = useState(false)
  const [showImageGuide, setShowImageGuide] = useState(false)

  // 处理发送
  const handleSend = useCallback(() => {
    // 粘贴图片发送：如果有待发送图片，则作为图片消息发送（同时附带文本）
    if (pendingImages.length > 0) {
      const trimmed = text.trim()
      if (trimmed) {
        onSend(trimmed, 'text')
      }
      // 发送所有图片
      pendingImages.forEach((img) => {
        onSend('图片', 'image', {
          name: `image-${Date.now()}.png`,
          url: img,
          thumbnailUrl: img,
        })
      })
      setPendingImages([])
      setText('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
      return
    }

    const trimmed = text.trim()
    if (!trimmed && !pendingVoiceRef.current) return

    // 有暂存语音数据 → 发送语音消息（语音条 + 转写文字）
    if (pendingVoiceRef.current) {
      const voice = pendingVoiceRef.current
      const content = trimmed || `语音消息 ${formatDuration(voice.duration)}`
      onSend(content, 'voice', undefined, {
        url: voice.url,
        duration: voice.duration,
      })
      pendingVoiceRef.current = null
      setHasPendingVoice(false)
    } else {
      // 普通文字消息
      onSend(trimmed, 'text')
    }
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [text, onSend, pendingImages])

  // 键盘事件：Enter发送，Shift+Enter换行
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // 自动调整高度
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // 当正在生成时，用户开始输入新消息则自动停止生成
    if (isTyping) {
      onAbort()
    }
    setText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  // 粘贴图片处理（多图）
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = getImageFromPasteEvent(e.nativeEvent)
    if (file) {
      e.preventDefault()
      // 首次粘贴图片 → 显示图片功能引导
      if (!localStorage.getItem('has_seen_image_guide')) {
        localStorage.setItem('has_seen_image_guide', '1')
        setShowImageGuide(true)
      }
      const reader = new FileReader()
      reader.onload = () => {
        const url = reader.result as string
        setPendingImages(prev => [...prev, url])
      }
      reader.readAsDataURL(file)
    }
  }

  // ─── 输入框右键菜单 ──────────────────────────────────────────────────

  const handleTextareaContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    // 估算菜单尺寸（5个横排按钮 + 间距 + padding）
    const menuWidth = 280
    const menuHeight = 40
    const screenW = window.innerWidth
    const screenH = window.innerHeight

    // 获取输入框位置，菜单紧贴输入框上方优先
    const textarea = textareaRef.current
    let x: number
    let y: number

    if (textarea) {
      const rect = textarea.getBoundingClientRect()
      // 水平居中于输入框
      x = rect.left + (rect.width - menuWidth) / 2
      // 默认在输入框上方紧贴
      y = rect.top - menuHeight - 4
      // 上方空间不足时，显示在输入框下方
      if (y < 8) {
        y = rect.bottom + 4
      }
    } else {
      // 回退：鼠标位置
      x = e.clientX
      y = e.clientY
    }

    // 右侧超出：向左偏移
    if (x + menuWidth > screenW) {
      x = screenW - menuWidth - 8
    }
    // 下方超出：向上偏移
    if (y + menuHeight > screenH) {
      y = screenH - menuHeight - 8
    }
    // 确保不小于 0
    x = Math.max(8, x)
    y = Math.max(8, y)
    setInputContextMenu({ visible: true, x, y })
  }, [])

  const handleInputMenuAction = useCallback((action: 'selectAll' | 'copy' | 'paste' | 'cut' | 'clear') => {
    const textarea = textareaRef.current
    if (!textarea) {
      setInputContextMenu({ visible: false, x: 0, y: 0 })
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = text.substring(start, end)

    switch (action) {
      case 'selectAll':
        textarea.focus()
        textarea.select()
        break
      case 'copy':
        if (selectedText) {
          navigator.clipboard.writeText(selectedText).catch(() => {
            // 回退方案
            textarea.setSelectionRange(start, end)
            document.execCommand('copy')
          })
        }
        break
      case 'paste':
        textarea.focus()
        navigator.clipboard.readText().then((clipText) => {
          const newText = text.substring(0, start) + clipText + text.substring(end)
          setText(newText)
          // 更新光标位置
          requestAnimationFrame(() => {
            const newPos = start + clipText.length
            textarea.setSelectionRange(newPos, newPos)
          })
        }).catch(() => {
          // 回退方案（部分浏览器不支持）
          document.execCommand('paste')
        })
        break
      case 'cut':
        if (selectedText) {
          navigator.clipboard.writeText(selectedText).catch(() => {
            textarea.setSelectionRange(start, end)
            document.execCommand('cut')
          })
          const newText = text.substring(0, start) + text.substring(end)
          setText(newText)
          requestAnimationFrame(() => {
            textarea.setSelectionRange(start, start)
          })
        }
        break
      case 'clear':
        setText('')
        requestAnimationFrame(() => {
          textarea.style.height = 'auto'
        })
        break
    }
    setInputContextMenu({ visible: false, x: 0, y: 0 })
  }, [text])

  // 点击外部关闭输入框右键菜单
  useEffect(() => {
    if (!inputContextMenu.visible) return
    const handleClickOutside = (e: MouseEvent) => {
      if (inputContextMenuRef.current && !inputContextMenuRef.current.contains(e.target as Node)) {
        setInputContextMenu({ visible: false, x: 0, y: 0 })
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [inputContextMenu.visible])

  // ─── 语音消息录制 ──────────────────────────────────────────────────────

  const MAX_RECORDING_SECONDS = 120 // 2分钟上限

  /** 清理录音资源 */
  const cleanupRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    if (autoStopTimeoutRef.current) {
      clearTimeout(autoStopTimeoutRef.current)
      autoStopTimeoutRef.current = null
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
    // 清理语音识别
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.abort()
      speechRecognitionRef.current = null
    }
    originalTextRef.current = ''
  }, [])

  /** 开始录音（统一模式：实时识别 + 停止后暂存语音数据） */
  const startRecording = useCallback(async () => {
    // 保存当前输入框文字，用于后续拼接识别结果
    originalTextRef.current = text
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // 设置音量分析
      const audioCtx = new AudioContext()
      audioContextRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      // 创建 MediaRecorder
      const mediaRecorder = new MediaRecorder(stream,{
        mimeType: 'audio/webm;codecs=opus'
      })
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
  const duration = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000)

  if (duration < 1) {
    cleanupRecording()
    setIsRecording(false)
    setRecordingTime(0)
    setAudioLevel(0)
    return
  }

  const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
  const audioUrl = URL.createObjectURL(audioBlob)
  pendingVoiceRef.current = { url: audioUrl, duration }
  setHasPendingVoice(true)

  const reader = new FileReader()
  reader.onload = async () => {
    try {
      console.log('[Speech] 开始语音识别...')
      const transcribedText = await recognizeSpeech(audioBlob)
      console.log('[Speech] 识别结果:', transcribedText)

      const original = originalTextRef.current || ''
      const finalText = transcribedText.trim()
      if (finalText) {
        const combined = original
          ? original + (original.endsWith(' ') ? '' : ' ') + finalText
          : finalText
        setText(combined)
      }
      originalTextRef.current = ''

      setTimeout(() => {
        textareaRef.current?.focus()
        const el = textareaRef.current
        if (el) {
          const len = el.value.length
          el.setSelectionRange(len, len)
        }
      }, 100)
    } catch (err) {
      console.error('[Speech] 识别失败:', err)
      addNotification({
        id: `asr-error-${Date.now()}`,
        type: 'error',
        title: '语音识别失败',
        message: '语音已录下但识别未成功，可重试或直接输入文字。',
        timestamp: Date.now(),
        read: false,
        duration: 5000,
      })
    } finally {
      cleanupRecording()
      setIsRecording(false)
      setRecordingTime(0)
      setAudioLevel(0)
    }
  }
  reader.readAsDataURL(audioBlob)
}

      mediaRecorder.start()
      mediaRecorderRef.current = mediaRecorder
      recordingStartTimeRef.current = Date.now()
      setIsRecording(true)

      // 同时启动语音识别（Web Speech API）— 实时识别填入输入框
      if (SpeechRecognitionManager.isSupported()) {
        const manager = new SpeechRecognitionManager()
        speechRecognitionRef.current = manager
        manager.start({
          lang: 'zh-CN',
          continuous: true,
          interimResults: true,
          onResult: (recognizedText) => {
            // 实时更新输入框文字
            const original = originalTextRef.current
            const combined = original
              ? original + (original.endsWith(' ') ? '' : ' ') + recognizedText
              : recognizedText
            setText(combined)
          },
          onError: (error) => {
            console.warn('[语音识别] 错误:', error)
          },
        })
      }

      // 计时器：每秒更新时长
      recordingTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000)
        setRecordingTime(elapsed)
      }, 1000)

      // 音量动画循环
      const updateAudioLevel = () => {
        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
          analyserRef.current.getByteFrequencyData(dataArray)
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
          setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)))
        }
        animationFrameRef.current = requestAnimationFrame(updateAudioLevel)
      }
      updateAudioLevel()

      // 2分钟自动停止
      autoStopTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop()
        }
      }, MAX_RECORDING_SECONDS * 1000)
    } catch (err) {
      console.error('录音启动失败:', err)
      addNotification({
        id: `mic-error-${Date.now()}`,
        type: 'error',
        title: '无法使用麦克风',
        message: '请检查系统麦克风设备与权限（Windows 设置 → 隐私 → 麦克风），或重启应用后重试。',
        timestamp: Date.now(),
        read: false,
        duration: 6000,
      })
      cleanupRecording()
      setIsRecording(false)
    }
  }, [cleanupRecording, text, addNotification])

  /** 停止录音 */
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  /** 检查麦克风权限，未授权则弹窗询问 */
  const checkMicPermission = useCallback(() => {
    if (settings?.micPermission) {
      startRecording()
      return
    }
    setPermissionModal({ type: 'mic', visible: true })
  }, [settings, startRecording])

  /** 检查文件读取权限，未授权则弹窗询问 */
  const checkFilePermission = useCallback(() => {
    if (settings?.fileReadPermission) {
      fileInputRef.current?.click()
      return
    }
    setPermissionModal({ type: 'file', visible: true })
  }, [settings])

  /** 检查图片读取权限，未授权则弹窗询问 */
  const checkImagePermission = useCallback(() => {
    if (settings?.fileReadPermission) {
      imageInputRef.current?.click()
      return
    }
    setPermissionModal({ type: 'file', visible: true })
  }, [settings])

  /** 处理权限弹窗"允许"按钮 */
  const handlePermissionAllow = useCallback(async () => {
    const type = permissionModal.type
    setPermissionModal({ type, visible: false })
    if (type === 'mic') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
        updateSettings({ micPermission: true })
        startRecording()
      } catch (err) {
        console.error('麦克风权限获取失败:', err)
        alert('无法获取麦克风权限，请在系统设置中启用权限')
      }
    } else {
      updateSettings({ fileReadPermission: true })
      fileInputRef.current?.click()
    }
  }, [permissionModal.type, updateSettings, startRecording])

  /** 处理权限弹窗"拒绝"按钮 */
  const handlePermissionDeny = useCallback(() => {
    setPermissionModal({ type: permissionModal.type, visible: false })
    setPermissionDeniedHint(true)
  }, [permissionModal.type])

  /** 切换录音状态（开始/停止） */
  const toggleRecording = useCallback(() => {
    // 首次点击麦克风 → 显示语音功能引导
    if (!localStorage.getItem('has_seen_voice_guide')) {
      localStorage.setItem('has_seen_voice_guide', '1')
      setShowVoiceGuide(true)
      return
    }
    if (isRecording) {
      stopRecording()
    } else {
      checkMicPermission()
    }
  }, [isRecording, checkMicPermission, stopRecording])

  // 组件卸载时清理
  useEffect(() => {
    return () => cleanupRecording()
  }, [cleanupRecording])

  // 点击外部关闭工具箱
  useEffect(() => {
    if (!showToolbox) return
    const handleClick = (e: MouseEvent) => {
      if (toolboxRef.current && !toolboxRef.current.contains(e.target as Node)) {
        setShowToolbox(false)
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [showToolbox])

  // 表情选择
  const handleEmojiSelect = (emoji: string) => {
    setText((prev) => prev + emoji)
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }

  // 图片发送
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 首次选择图片 → 显示图片功能引导
    if (!localStorage.getItem('has_seen_image_guide')) {
      localStorage.setItem('has_seen_image_guide', '1')
      setShowImageGuide(true)
    }

    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      onSend(file.name, 'image', {
        name: file.name,
        url,
        thumbnailUrl: url,
        size: file.size,
      })
    }
    reader.readAsDataURL(file)

    // 重置 input 以便再次选择同一文件
    e.target.value = ''
  }

  // 文件发送
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 如果是图片，走图片流程（MIME 为空时按扩展名兜底：截图/剪贴板文件常无 MIME）
    if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name)) {
      handleImageSelect(e)
      return
    }

    // 读取文件为 Data URL 以便后续打开
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      onSend(file.name, 'file', {
        name: file.name,
        url,
        size: file.size,
      })
    }
    reader.readAsDataURL(file)

    e.target.value = ''
  }

  // 点击消息中的图片预览（通过全局事件传递）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as string
      setPreviewImage(detail)
    }
    window.addEventListener('chat:image-preview', handler)
    return () => window.removeEventListener('chat:image-preview', handler)
  }, [])

  return (
    <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 px-4 py-3 relative z-10">
      {/* 表情面板 */}
      <AnimatePresence>
        {showEmoji && (
          <EmojiPanel onSelect={handleEmojiSelect} onClose={() => setShowEmoji(false)} />
        )}
      </AnimatePresence>

      {/* 收藏面板 */}
      <FavoritesPanel
        visible={showFavorites}
        onClose={() => setShowFavorites(false)}
        onSelect={(fav) => onSendFavorite(fav)}
      />

      {/* 图片预览 */}
      <AnimatePresence>
        {previewImage && (
          <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />
        )}
      </AnimatePresence>

      {/* 录音状态栏 */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 pb-2">
              {/* 录音标签 */}
              <span className="text-xs font-medium flex-shrink-0 px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-500">
                录音中
              </span>

              {/* 红色闪烁圆点 */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-mono font-medium text-red-500">
                  {formatDuration(recordingTime)}
                </span>
              </div>

              {/* 音量条 */}
              <div className="flex-1 flex items-center gap-0.5 h-6">
                {Array.from({ length: 24 }, (_, i) => {
                  const threshold = (i + 1) * (100 / 24)
                  const active = audioLevel >= threshold
                  return (
                    <div
                      key={i}
                      className={`flex-1 rounded-sm transition-all duration-75 ${
                        active
                          ? i < 8
                            ? 'bg-green-400'
                            : i < 16
                            ? 'bg-yellow-400'
                            : 'bg-red-400'
                          : 'bg-gray-200 dark:bg-gray-600'
                      }`}
                      style={{ height: active ? `${4 + (i / 24) * 16}px` : '4px' }}
                    />
                  )
                })}
              </div>

              {/* 最长时长提示 */}
              <span className="text-xs text-gray-400 flex-shrink-0">
                / {formatDuration(MAX_RECORDING_SECONDS)}
              </span>
            </div>

            {/* 实时语音转文字显示（输入框中已实时显示，此处不再重复） */}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 待发送语音指示器 */}
      {hasPendingVoice && !isRecording && (
        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Mic className="w-4 h-4 text-primary-500" />
            <span className="text-xs text-primary-600 dark:text-primary-400 font-medium">
              语音已就绪
            </span>
          </div>
          <span className="text-xs text-gray-400 flex-1 truncate">
            点击发送将发送语音消息{text.trim() ? '（含转写文字）' : ''}
          </span>
          <button
            onClick={() => {
              pendingVoiceRef.current = null
              setHasPendingVoice(false)
              setText('')
            }}
            className="flex-shrink-0 p-1 rounded hover:bg-primary-100 dark:hover:bg-primary-800 text-gray-400 hover:text-red-500 transition-colors"
            title="取消语音消息"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 粘贴图片预览（多图，可拖拽排序） */}
      {pendingImages.length > 0 && (
        <div className="flex gap-2 mb-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 overflow-x-auto">
          {pendingImages.map((img, index) => (
            <div
              key={index}
              draggable
              onDragStart={() => setDraggedImageIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (draggedImageIndex === null || draggedImageIndex === index) return
                setPendingImages(prev => {
                  const newArr = [...prev]
                  const [removed] = newArr.splice(draggedImageIndex, 1)
                  newArr.splice(index, 0, removed)
                  return newArr
                })
                setDraggedImageIndex(null)
              }}
              className="relative flex-shrink-0 group cursor-move"
            >
              <img src={img} alt={`图片${index+1}`} className="w-14 h-14 object-cover rounded-md border border-gray-200 dark:border-gray-600" />
              <button
                onClick={() => setPendingImages(prev => prev.filter((_, i) => i !== index))}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* 多行输入框 */}
        <textarea
          ref={textareaRef}
          id="chat-input"
          value={text}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onContextMenu={handleTextareaContextMenu}
          placeholder={isRecording ? '录音中...点击麦克风停止' : '输入消息...（Enter发送，Shift+Enter换行）'}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm leading-relaxed max-h-[120px] scrollbar-thin"
          style={{ minHeight: '40px' }}
        />

        {/* 功能按钮组 */}
        <div className="flex items-center gap-1 pb-1">
          {/* 1. 语音录制（语音条） */}
          <button
            onClick={toggleRecording}
            data-guide="mic-button"
            className={`p-2 rounded-full transition-colors ${
              isRecording
                ? 'bg-red-500 text-white animate-pulse'
                : settings?.micPermission === false
                ? 'text-gray-300 dark:text-gray-600'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}
            title={isRecording ? '停止录音并发送语音条' : '语音录制（发送语音条）'}
          >
            <Mic className="w-5 h-5" />
          </button>

          {/* 2. 表情包 */}
          <button
            onClick={() => setShowEmoji((v) => !v)}
            className={`p-2 rounded-full transition-colors ${
              showEmoji
                ? 'bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}
            title="表情包"
          >
            <Smile className="w-5 h-5" />
          </button>

          {/* 3. 工具箱（下拉菜单：文件、图片、收藏） */}
          <div ref={toolboxRef} className="relative">
            <button
              data-guide="toolbox"
              onClick={() => setShowToolbox((v) => !v)}
              className={`p-2 rounded-full transition-colors ${
                showToolbox
                  ? 'bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}
              title="工具箱"
            >
              <Wrench className="w-5 h-5" />
            </button>

            {/* 工具箱下拉菜单 */}
            <AnimatePresence>
              {showToolbox && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full right-0 mb-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[120px] z-30"
                >
                  {/* 文件 */}
                  <button
                    onClick={() => {
                      setShowToolbox(false)
                      checkFilePermission()
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                  >
                    <Paperclip className="w-4 h-4 text-gray-400" />
                    文件
                  </button>

                  {/* 图片 */}
                  <button
                    data-guide="image-upload"
                    onClick={() => {
                      setShowToolbox(false)
                      // 首次点击图片按钮 → 显示图片功能引导
                      if (!localStorage.getItem('has_seen_image_guide')) {
                        localStorage.setItem('has_seen_image_guide', '1')
                        setShowImageGuide(true)
                        return
                      }
                      checkImagePermission()
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                  >
                    <ImageIcon className="w-4 h-4 text-gray-400" />
                    图片
                  </button>

                  <div className="h-px bg-gray-100 dark:bg-gray-700 mx-2" />

                  {/* 收藏 */}
                  <button
                    onClick={() => {
                      setShowToolbox(false)
                      setShowFavorites(true)
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                  >
                    <Gift className="w-4 h-4 text-gray-400" />
                    收藏
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 4. 发送 / 停止生成按钮 */}
          {isTyping ? (
            <button
              onClick={onAbort}
              className="p-2.5 rounded-full transition-all bg-red-500 text-white hover:bg-red-600 active:scale-95 shadow-md"
              title="停止生成"
            >
              <Square className="w-5 h-5" fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              data-guide="send-button"
              disabled={(!text.trim() && pendingImages.length === 0 && !hasPendingVoice) || disabled}
              className={`p-2.5 rounded-full transition-all ${
                ((text.trim() || pendingImages.length > 0 || hasPendingVoice) && !disabled)
                  ? 'bg-primary-500 text-white hover:bg-primary-600 active:scale-95 shadow-md'
                  : 'bg-gray-200 dark:bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
              title={hasPendingVoice ? '发送语音消息' : '发送'}
            >
              <Send className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* 隐藏的文件输入 */}
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          className="hidden"
        />
      </div>

      {/* 权限请求弹窗 */}
      <AnimatePresence>
        {permissionModal.visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="card max-w-md w-full mx-4 p-6"
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3 text-center">提示</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6 text-center text-sm leading-relaxed">
                {permissionModal.type === 'mic'
                  ? '是否允许平台使用麦克风进行语音输入？'
                  : '是否允许平台读取本地文件？'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handlePermissionDeny}
                  className="btn-secondary flex-1 py-2"
                >
                  拒绝
                </button>
                <button
                  onClick={handlePermissionAllow}
                  className="btn-primary flex-1 py-2"
                >
                  允许
                </button>
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
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="card max-w-md w-full mx-4 p-6"
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3 text-center">提示</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6 text-center text-sm leading-relaxed">
                后续可在用户偏好设置中更改
              </p>
              <button
                onClick={() => setPermissionDeniedHint(false)}
                className="btn-primary w-full py-2"
              >
                知道了
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 输入框右键菜单（横排按钮） */}
      {inputContextMenu.visible && (
        <div
          ref={inputContextMenuRef}
          className="fixed z-[200] flex items-center gap-0.5 px-1.5 py-1.5 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600"
          style={{ left: `${inputContextMenu.x}px`, top: `${inputContextMenu.y}px` }}
        >
          <button
            onClick={() => handleInputMenuAction('selectAll')}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            全选
          </button>
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-600" />
          <button
            onClick={() => handleInputMenuAction('copy')}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            复制
          </button>
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-600" />
          <button
            onClick={() => handleInputMenuAction('paste')}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            粘贴
          </button>
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-600" />
          <button
            onClick={() => handleInputMenuAction('cut')}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            剪切
          </button>
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-600" />
          <button
            onClick={() => handleInputMenuAction('clear')}
            className="px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
          >
            清空
          </button>
        </div>
      )}

      {/* 首次语音功能引导 */}
      {showVoiceGuide && (
        <FirstTimeGuide
          storageKey="has_seen_voice_guide"
          manualVisible={showVoiceGuide}
          onManualClose={() => setShowVoiceGuide(false)}
          steps={[
            {
              title: '🎤 语音功能说明',
              content: '当前版本支持将语音转为文字后发送，\nAI 将根据转写后的文字进行回复。\n\n如需直接理解语音内容，请等待后续版本迭代。',
            },
          ]}
        />
      )}
      
      {/* 首次图片功能引导 */}
      {showImageGuide && (
        <FirstTimeGuide
          storageKey="has_seen_image_guide"
          manualVisible={showImageGuide}
          onManualClose={() => setShowImageGuide(false)}
          steps={[
            {
              title: '📷 图片功能说明',
              content: '当前版本支持识别图片中的文字（OCR），\n暂不支持识别图片中的物体、场景或人物。\n\n如需完整图片理解功能，请等待后续版本迭代。',
            },
          ]}
        />
      )}
    </div>
  )
}

// ─── 主组件 ────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentCharacter, characters, setCurrentCharacter, updateCharacter } = useCharacterStore()

  // 左栏宽度状态（可拖拽分隔线调整）
  const [leftWidth, setLeftWidth] = useState(360)
  const isDraggingRef = useRef(false)
  const {
    messages: allMessages,
    isTyping,
    loadMessages,
    sendMessage,
    getCharacterStatus,
    deleteMessage,
    editMessageAndRegenerate,
    withdrawMessage,
    regenerateReply,
    clearMessagesDB,
  } = useChatStore()

  // 收藏 store
  const { addFavoriteFromMessage } = useFavoritesStore()
  // UI store（通知）
  const { addNotification } = useUIStore()
  // 设置 store（正脸模式等）
  const { updateSettings, settings: appSettings } = useSettingsStore()

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    message: null,
  })

  // 转发弹窗状态
  const [forwardDialogVisible, setForwardDialogVisible] = useState(false)
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null)

  // 编辑消息状态
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)

  // 3D 格式建议弹窗状态
  const [formatWarning, setFormatWarning] = useState<{
    visible: boolean
    fileName: string
    files: File[]
  }>({ visible: false, fileName: '', files: [] })

  // 文件格式一致性弹窗状态
  const [formatInconsistent, setFormatInconsistent] = useState<{
    visible: boolean
    fileNames: string[]
    files: File[]
  }>({ visible: false, fileNames: [], files: [] })

  // Live2D 首次导入表情设置引导
  const [showExprGuide, setShowExprGuide] = useState(false)
  // 表情手动匹配弹窗
  const [showExprManualMatch, setShowExprManualMatch] = useState(false)
  // 动作手动匹配弹窗
  const [showActionManualMatch, setShowActionManualMatch] = useState(false)
  // 助手档案编辑弹窗
  const [showAssistantProfile, setShowAssistantProfile] = useState(false)
  // 助手设置下拉菜单
  const [showAssistantMenu, setShowAssistantMenu] = useState(false)
  // 助手清空聊天记录确认
  const [showAssistantClearConfirm, setShowAssistantClearConfirm] = useState(false)
  // 助手文件权限询问
  const [showAssistantFilePermission, setShowAssistantFilePermission] = useState(false)
  // 助手权限拒绝提示
  const [showAssistantPermissionDenied, setShowAssistantPermissionDenied] = useState(false)
  // 助手背景图文件选择 ref
  const assistantBgRef = useRef<HTMLInputElement>(null)
  // Live2D 正脸偏好设置弹窗（导入 Live2D 模型时弹出）
  const [showFacePrefPopup, setShowFacePrefPopup] = useState(false)
  // 正脸偏好设置弹窗已暂时禁用（正脸功能开发中，后续恢复时取消注释下方 state）
  // const [pendingFacePrefPopup, setPendingFacePrefPopup] = useState(false)
  // 表情引导是否待显示（正脸弹窗关闭后再显示）
  const [pendingExprGuide, setPendingExprGuide] = useState(false)

  // 网络状态监测
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  const characterId = currentCharacter?.id || ''
  const messages = allMessages[characterId] || []
  const status = getCharacterStatus(characterId)

  // Live2D 模型引用（用于触发表情）
  const live2dRef = useRef<Live2DViewerHandle>(null)
  // 3D 模型引用（用于触发表情和动作）
  const threeDRef = useRef<ThreeDViewerHandle>(null)

  // 3D 模型表情是否已启用（默认禁用，需用户手动匹配后启用）
  const threeDExprEnabledRef = useRef(false)

  // 解析持久化模型引用（从 IndexedDB 加载 blob URL）
  const [resolvedModelDisplay, setResolvedModelDisplay] = useState<ModelDisplay | undefined>(undefined)
  const prevBlobUrlRef = useRef<string | null>(null)
  const prevMtlBlobUrlRef = useRef<string | null>(null)

  // 当前模型类型（决定调用 Live2D 还是 3D 的方法）
  const currentModelType = resolvedModelDisplay?.type || currentCharacter?.modelDisplay?.type || 'live2d'

  // 语音合成已移至 VoiceBar 组件，用户点击播放按钮时触发

  // 监听教程事件：自动打开助手档案
  useEffect(() => {
    const handler = () => {
      if (currentCharacter?.isAssistant) {
        setShowAssistantProfile(true)
      }
    }
    window.addEventListener('tutorial:open-assistant-profile', handler)
    return () => window.removeEventListener('tutorial:open-assistant-profile', handler)
  }, [currentCharacter])

  // 网络状态监测
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

// 语音自动播放已移除，改为用户点击 VoiceBar 播放按钮时触发

  /** 统一调用接口：根据当前模型类型调用对应 viewer 的方法 */
  const callViewer = useCallback((fn: (handle: Live2DViewerHandle | ThreeDViewerHandle) => void) => {
    if (currentModelType === '3d') {
      if (threeDRef.current) fn(threeDRef.current)
    } else {
      if (live2dRef.current) fn(live2dRef.current)
    }
  }, [currentModelType])

  // ── 3D 模型表情启用状态管理 ─────────────────────────────────────
  // 当模型类型变为 3D 时，检查是否有已保存的表情映射
  // 3D 模型默认不触发表情，仅在用户手动匹配后启用
  useEffect(() => {
    if (currentModelType === '3d' && characterId) {
      const config = loadExpressionMapping(characterId)
      const hasMapping = Object.keys(config.mapping).length > 0
      threeDExprEnabledRef.current = hasMapping
    } else {
      // 非 3D 模型（Live2D 等）默认启用表情
      threeDExprEnabledRef.current = true
    }
  }, [currentModelType, characterId])

  // 表情手动匹配弹窗关闭后，重新检查是否已保存映射
  const handleExprManualMatchClose = useCallback(() => {
    setShowExprManualMatch(false)
    if (currentModelType === '3d' && characterId) {
      const config = loadExpressionMapping(characterId)
      const hasMapping = Object.keys(config.mapping).length > 0
      threeDExprEnabledRef.current = hasMapping
    }
  }, [currentModelType, characterId])

  // 最后一条用户消息内容（用于生成悬浮对话框上下文）
  const lastUserMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user' && !messages[i].isWithdrawn) {
        return messages[i].content
      }
    }
    return ''
  }, [messages])

  // ── 角色回复时联动表情 + 动作 ───────────────────────────────────
  // 监听最后一条角色消息，根据内容情绪触发表情和动作
  const lastCharacterMsgRef = useRef<string | null>(null)
  useEffect(() => {
    // 找最后一条角色消息
    let lastCharMsg: Message | null = null
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'character' && !messages[i].isWithdrawn) {
        lastCharMsg = messages[i]
        break
      }
    }
    if (!lastCharMsg) return
    // 只在新消息出现时触发（避免重复）
    if (lastCharacterMsgRef.current === lastCharMsg.id) return
    lastCharacterMsgRef.current = lastCharMsg.id

    // 根据角色回复内容分析情绪并触发表情
    const expression = analyzeMessageEmotion(lastCharMsg.content)
    // 3D 模型默认不触发表情，仅在用户手动匹配后启用
    if (currentModelType !== '3d' || threeDExprEnabledRef.current) {
      callViewer((h) => h.setExpression(expression))
    }

    // 随机触发一个肢体动作
    callViewer((h) => {
      if ('triggerRandomAction' in h) h.triggerRandomAction()
    })
  }, [messages, callViewer, currentModelType])

  // ── 角色状态变化时联动表情 ─────────────────────────────────────
  const prevStatusRef = useRef<CharacterChatStatus>(status)
  useEffect(() => {
    if (status === prevStatusRef.current) return
    prevStatusRef.current = status
    const expression = statusToExpression(status)
    if (expression) {
      // 3D 模型默认不触发表情，仅在用户手动匹配后启用
      if (currentModelType !== '3d' || threeDExprEnabledRef.current) {
        callViewer((h) => h.setExpression(expression))
      }
    }
  }, [status, callViewer, currentModelType])

  // ── 拾取从收藏页面转发的收藏内容 ───────────────────────────────
  useEffect(() => {
    if (!characterId) return
    const pendingKey = `pending_forward_favorites_${characterId}`
    const pending = sessionStorage.getItem(pendingKey)
    if (pending) {
      try {
        const data = JSON.parse(pending) as {
          targetCharacterId: string
          favorites: Array<{
            type: string
            content: string
            fileInfo?: Message['fileInfo']
            voiceInfo?: Message['voiceInfo']
          }>
        }
        sessionStorage.removeItem(pendingKey)
        // 逐条转发到当前聊天
        for (const fav of data.favorites) {
          sendMessage(
            characterId,
            fav.content,
            fav.type as 'text' | 'image' | 'file' | 'voice',
            fav.fileInfo,
            fav.voiceInfo
          )
        }
      } catch {
        sessionStorage.removeItem(pendingKey)
      }
    }
  }, [characterId, sendMessage])

  // 从 URL state 中读取 characterId
  useEffect(() => {
    const state = location.state as { characterId?: string } | null
    if (state?.characterId) {
      const character = characters.find((c) => c.id === state.characterId)
      if (character) {
        setCurrentCharacter(character)
      }
    }
  }, [location.state, characters, setCurrentCharacter])

  // 加载历史消息
  useEffect(() => {
    if (characterId) {
      loadMessages(characterId)
    }
  }, [characterId, loadMessages])

  useEffect(() => {
    const rawDisplay = currentCharacter?.modelDisplay

    // 关键修复：切换角色时立即清空 resolvedModelDisplay，防止旧角色模型残留
    // 必须在异步操作之前同步执行，避免异步期间显示上一个角色的模型
    setResolvedModelDisplay(undefined)

    if (!rawDisplay) {
      // 无模型数据时，清理旧的 blob URL
      if (prevBlobUrlRef.current) {
        URL.revokeObjectURL(prevBlobUrlRef.current)
        prevBlobUrlRef.current = null
      }
      if (prevMtlBlobUrlRef.current) {
        URL.revokeObjectURL(prevMtlBlobUrlRef.current)
        prevMtlBlobUrlRef.current = null
      }
      return
    }

    // 确保 rawDisplay 在异步闭包中被正确收窄
    const displayData: ModelDisplay = rawDisplay
    let cancelled = false

    async function resolveModelUrls() {
      const display: ModelDisplay = {
        type: displayData.type,
        url: displayData.url,
        fileName: displayData.fileName,
        mtlUrl: displayData.mtlUrl,
      }

      // 如果 URL 是持久化引用，从 IndexedDB 加载
      if (isPersistentModelRef(display.url)) {
        const blobUrl = await loadModelFile(display.url)
        if (cancelled || !blobUrl) {
          if (!cancelled) {
            console.error('[ChatPage] 持久化模型加载失败:', display.url)
            setResolvedModelDisplay({ ...display, url: '' })
          }
          return
        }
        // 清理旧的 blob URL
        if (prevBlobUrlRef.current) URL.revokeObjectURL(prevBlobUrlRef.current)
        prevBlobUrlRef.current = blobUrl
        display.url = blobUrl
      }

      // 如果 mtlUrl 是持久化引用，也加载
      if (display.mtlUrl && isPersistentModelRef(display.mtlUrl)) {
        const mtlBlobUrl = await loadModelFile(display.mtlUrl)
        if (cancelled || !mtlBlobUrl) {
          if (!cancelled) {
            display.mtlUrl = undefined
          }
        } else {
          if (prevMtlBlobUrlRef.current) URL.revokeObjectURL(prevMtlBlobUrlRef.current)
          prevMtlBlobUrlRef.current = mtlBlobUrl
          display.mtlUrl = mtlBlobUrl
        }
      }

      // 如果 URL 是 blob: URL（非持久化），也记录以便清理
      if (display.url.startsWith('blob:') && !prevBlobUrlRef.current) {
        prevBlobUrlRef.current = display.url
      }

      if (!cancelled) {
        setResolvedModelDisplay(display)
      }
    }

    resolveModelUrls()

    return () => {
      cancelled = true
    }
    // 关键修复：加入 characterId 依赖，确保角色切换时重新解析
  }, [currentCharacter?.id, currentCharacter?.modelDisplay])

  // 助手优先显示用户备注，无备注则显示助手名；角色优先显示备注（background），无则显示角色名
  // profile 全程可选链：非法/残缺角色数据不致渲染崩溃（配合路由级 ErrorBoundary 双保险）
  const displayName = currentCharacter?.isAssistant
    ? (currentCharacter.assistantEditable?.userNote || currentCharacter.profile?.name || '未知角色')
    : (currentCharacter?.profile?.background || currentCharacter?.profile?.name || '未知角色')

  // ─── 助手设置菜单操作 ────────────────────────────────────────────────────
  const handleAssistantTogglePin = () => {
    if (!currentCharacter) return
    updateCharacter({ ...currentCharacter, isPinned: !currentCharacter.isPinned })
    setShowAssistantMenu(false)
  }

  const handleAssistantSetBackground = () => {
    setShowAssistantMenu(false)
    if (appSettings?.fileReadPermission) {
      assistantBgRef.current?.click()
      return
    }
    setShowAssistantFilePermission(true)
  }

  const handleAssistantAllowFileAccess = () => {
    setShowAssistantFilePermission(false)
    updateSettings({ fileReadPermission: true })
    assistantBgRef.current?.click()
  }

  const handleAssistantBgSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !currentCharacter) return
    const reader = new FileReader()
    reader.onload = () => {
      const bg = reader.result as string
      updateCharacter({ ...currentCharacter, chatBackground: bg })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleAssistantClearChat = async () => {
    if (!currentCharacter) return
    await clearMessagesDB(currentCharacter.id)
    setShowAssistantClearConfirm(false)
  }

  const handleAssistantSearchChat = () => {
    setShowAssistantMenu(false)
    navigate('/search-chat', { state: { characterId } })
  }

  const handleSend = useCallback(
    (content: string, type?: 'text' | 'image' | 'file' | 'voice', fileInfo?: Message['fileInfo'], voiceInfo?: Message['voiceInfo']) => {
      if (!characterId) return
      sendMessage(characterId, content, type, fileInfo, voiceInfo)
    },
    [characterId, sendMessage]
  )


  // 实际执行模型导入（跳过格式提示）
  const doImportModel = useCallback(
    async (files: File[], type: ModelDisplay['type']) => {
      if (!currentCharacter || files.length === 0) return
      const mainFile = files[0]

      // 模型文件被替换/重新导入时，重置该角色的模型类型配置
      // 下次进入表情/动作设置时会重新弹出模型类型选择弹窗
      resetCharacterModelType(currentCharacter.id)

      // 图片和视频读取为 base64 Data URL
      if (type === 'image' || type === 'video') {
        const reader = new FileReader()
        reader.onload = () => {
          const url = reader.result as string
          updateCharacter({
            ...currentCharacter,
            modelDisplay: { type, url, fileName: mainFile.name },
          })
        }
        reader.readAsDataURL(mainFile)
      } else if (type === 'live2d') {
        const lowerName = mainFile.name.toLowerCase()
        if (lowerName.endsWith('.vtube.json')) {
          const modelPath = await resolveLive2DModelPath(mainFile)
          updateCharacter({
            ...currentCharacter,
            modelDisplay: {
              type,
              url: modelPath || '__MISSING__',
              fileName: mainFile.name,
            },
          })
        } else if (lowerName.endsWith('.model3.json')) {
          const derivedPath = await tryDeriveModelPath(mainFile.name)
          updateCharacter({
            ...currentCharacter,
            modelDisplay: { type, url: derivedPath || '', fileName: mainFile.name },
          })
        } else if (lowerName.endsWith('.moc3')) {
          // 导入 .moc3 文件：先检查导入批次中是否有 .model3.json
          const model3File = files.find((f) => f.name.toLowerCase().endsWith('.model3.json'))
          if (model3File) {
            const derivedPath = await tryDeriveModelPath(model3File.name)
            updateCharacter({
              ...currentCharacter,
              modelDisplay: { type, url: derivedPath || '', fileName: model3File.name },
            })
          } else {
            // 从 .moc3 文件名推导对应的 .model3.json 路径
            const derivedPath = await tryDeriveModelPathFromMoc3(mainFile.name)
            updateCharacter({
              ...currentCharacter,
              modelDisplay: { type, url: derivedPath || '', fileName: mainFile.name },
            })
          }
        } else {
          updateCharacter({
            ...currentCharacter,
            modelDisplay: { type, url: '', fileName: mainFile.name },
          })
        }

        // 正脸偏好设置弹窗暂时禁用（正脸功能开发中，后续恢复时取消注释）
        // setPendingFacePrefPopup(true)

        // 首次导入 Live2D 模型时弹出表情设置引导
        if (currentCharacter && !isFirstImportDone(currentCharacter.id)) {
          setFirstImportDone(currentCharacter.id)
          // 正脸弹窗已禁用，直接显示表情引导
          setShowExprGuide(true)
        }
      } else if (type === '3d') {
        // 3D 模型：持久化存储到 IndexedDB，避免 blob URL 重启失效
        try {
          const persistentRef = await saveModelFile(mainFile)
          let mtlRef: string | undefined
          if (mainFile.name.toLowerCase().endsWith('.obj')) {
            const mtlFile = files.find((f) => f.name.toLowerCase().endsWith('.mtl'))
            if (mtlFile) {
              mtlRef = await saveModelFile(mtlFile)
            }
          }
          updateCharacter({
            ...currentCharacter,
            modelDisplay: { type, url: persistentRef, fileName: mainFile.name, mtlUrl: mtlRef },
          })
        } catch (err) {
          console.error('[ChatPage] 3D 模型持久化失败，回退到 blob URL:', err)
          // 回退方案：使用 blob URL（仅当前会话有效）
          const objectUrl = URL.createObjectURL(mainFile)
          let mtlUrl: string | undefined
          if (mainFile.name.toLowerCase().endsWith('.obj')) {
            const mtlFile = files.find((f) => f.name.toLowerCase().endsWith('.mtl'))
            if (mtlFile) {
              mtlUrl = URL.createObjectURL(mtlFile)
            }
          }
          updateCharacter({
            ...currentCharacter,
            modelDisplay: { type, url: objectUrl, fileName: mainFile.name, mtlUrl },
          })
        }
      } else {
        // JSON 仅记录文件名
        updateCharacter({
          ...currentCharacter,
          modelDisplay: { type, url: '', fileName: mainFile.name },
        })
      }
    },
    [currentCharacter, updateCharacter]
  )

  // 导入模型文件入口（含格式建议弹窗 + 文件格式一致性校验）
  const handleImportModel = useCallback(
    async (files: File[]) => {
      if (!currentCharacter || files.length === 0) return
      const mainFile = files[0]
      const type = detectModelType(mainFile.name)
      if (!type) {
        alert('不支持此文件格式')
        return
      }

      // 文件格式一致性校验（混合 Live2D / 3D 文件）
      if (files.length > 1) {
        const inconsistentFiles = checkFileFormatConsistency(files)
        if (inconsistentFiles.length > 0) {
          setFormatInconsistent({ visible: true, fileNames: inconsistentFiles, files })
          return
        }
      }

      // .obj / .fbx 大文件格式提示
      const lowerName = mainFile.name.toLowerCase()
      const needsWarning = lowerName.endsWith('.obj') || lowerName.endsWith('.fbx')
      if (needsWarning) {
        setFormatWarning({ visible: true, fileName: mainFile.name, files })
        return
      }

      await doImportModel(files, type)
    },
    [currentCharacter, doImportModel]
  )

  // 格式建议弹窗：继续加载
  const handleConfirmFormatWarning = useCallback(() => {
    if (!formatWarning.files.length) {
      setFormatWarning((prev) => ({ ...prev, visible: false }))
      return
    }
    const mainFile = formatWarning.files[0]
    const type = detectModelType(mainFile.name)
    if (type) {
      doImportModel(formatWarning.files, type)
    }
    setFormatWarning((prev) => ({ ...prev, visible: false }))
  }, [formatWarning, doImportModel])

  // 格式建议弹窗：取消
  const handleCancelFormatWarning = useCallback(() => {
    setFormatWarning((prev) => ({ ...prev, visible: false }))
  }, [])

  // 文件格式不一致弹窗：继续加载
  const handleConfirmFormatInconsistent = useCallback(() => {
    if (!formatInconsistent.files.length) {
      setFormatInconsistent((prev) => ({ ...prev, visible: false }))
      return
    }
    const mainFile = formatInconsistent.files[0]
    const type = detectModelType(mainFile.name)
    if (type) {
      doImportModel(formatInconsistent.files, type)
    }
    setFormatInconsistent((prev) => ({ ...prev, visible: false }))
  }, [formatInconsistent, doImportModel])

  // 文件格式不一致弹窗：取消
  const handleCancelFormatInconsistent = useCallback(() => {
    setFormatInconsistent((prev) => ({ ...prev, visible: false }))
  }, [])

  // 表情设置引导：自动匹配
  const handleExprAutoMatch = useCallback(() => {
    setShowExprGuide(false)
  }, [])

  // Live2D 模型加载完成回调
  // 正脸偏好设置弹窗已暂时禁用（正脸功能开发中），此回调保留以备后续恢复
  const handleModelReady = useCallback(() => {
    // 正脸弹窗已禁用，此处不再触发弹窗
    // 后续恢复时取消下方注释：
    // if (pendingFacePrefPopup) {
    //   setPendingFacePrefPopup(false)
    //   setTimeout(() => setShowFacePrefPopup(true), 300)
    // }
  }, [])

  // 表情设置引导：手动匹配
  const handleExprManualMatch = useCallback(() => {
    setShowExprGuide(false)
    // 从首次导入引导进入时，模型类型为 Live2D（2D），自动保存
    const modelPath = resolvedModelDisplay?.url || currentCharacter?.modelDisplay?.url || ''
    const saved = getCharacterModelType(characterId, modelPath)
    if (!saved) {
      setCharacterModelType(characterId, '2d', modelPath)
    }
    setShowExprManualMatch(true)
  }, [characterId, resolvedModelDisplay?.url, currentCharacter?.modelDisplay?.url])

  // 分隔线拖拽逻辑
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    const startX = e.clientX
    const startWidth = leftWidth

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return
      const delta = ev.clientX - startX
      const newWidth = Math.min(
        Math.max(startWidth + delta, 150),
        window.innerWidth * 0.7
      )
      setLeftWidth(newWidth)
    }

    const onMouseUp = () => {
      isDraggingRef.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [leftWidth])

  // ─── 右键菜单处理 ──────────────────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent, message: Message) => {
    e.preventDefault()
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      message,
    })
  }, [])

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, visible: false, message: null }))
  }, [])

  const handleCopyMessage = useCallback((message: Message) => {
    navigator.clipboard.writeText(message.content).then(() => {
      addNotification({
        id: `copy-${Date.now()}`,
        type: 'success',
        title: '复制成功',
        message: '消息内容已复制到剪贴板',
        timestamp: Date.now(),
        read: false,
        duration: 2000,
      })
    })
  }, [addNotification])

  const handleEditMessage = useCallback((message: Message) => {
    setEditingMessageId(message.id)
  }, [])

  const handleEditSave = useCallback((content: string) => {
    if (editingMessageId && characterId) {
      // 修改消息并触发角色重新回复（旧回复被删除，新回复覆盖）
      editMessageAndRegenerate(characterId, editingMessageId, content)
      addNotification({
        id: `edit-${Date.now()}`,
        type: 'success',
        title: '修改成功',
        message: '消息已修改，角色正在重新回复',
        timestamp: Date.now(),
        read: false,
        duration: 2000,
      })
    }
    setEditingMessageId(null)
  }, [editingMessageId, characterId, editMessageAndRegenerate, addNotification])

  const handleEditCancel = useCallback(() => {
    setEditingMessageId(null)
  }, [])

  const handleDeleteMessage = useCallback((message: Message) => {
    if (characterId) {
      deleteMessage(characterId, message.id)
      addNotification({
        id: `del-${Date.now()}`,
        type: 'success',
        title: '删除成功',
        message: '消息已删除',
        timestamp: Date.now(),
        read: false,
        duration: 2000,
      })
    }
  }, [characterId, deleteMessage, addNotification])

  const handleWithdrawMessage = useCallback((message: Message) => {
    if (characterId) {
      withdrawMessage(characterId, message.id)
      addNotification({
        id: `withdraw-${Date.now()}`,
        type: 'success',
        title: '撤回成功',
        message: '消息已撤回',
        timestamp: Date.now(),
        read: false,
        duration: 2000,
      })
    }
  }, [characterId, withdrawMessage, addNotification])

  const handleForwardMessage = useCallback((message: Message) => {
    setForwardMessage(message)
    setForwardDialogVisible(true)
  }, [])

  const handleForwardSelect = useCallback((targetCharacter: Character) => {
    if (!forwardMessage) return
    // 转发消息到目标角色
    const forwardedMessage: Message = {
      id: crypto.randomUUID(),
      characterId: targetCharacter.id,
      role: 'user',
      content: forwardMessage.content,
      timestamp: Date.now(),
      type: forwardMessage.type || 'text',
      fileInfo: forwardMessage.fileInfo,
      voiceInfo: forwardMessage.voiceInfo,
    }
    useChatStore.getState().addMessage(targetCharacter.id, forwardedMessage)
    addNotification({
      id: `forward-${Date.now()}`,
      type: 'success',
      title: '转发成功',
      message: `已转发给 ${targetCharacter.profile?.background || targetCharacter.profile?.name || '未知角色'}`,
      timestamp: Date.now(),
      read: false,
      duration: 2000,
    })
    setForwardMessage(null)
  }, [forwardMessage, addNotification])

  const handleFavoriteMessage = useCallback(async (message: Message) => {
    const sourceRole = message.role === 'user'
      ? '我'
      : (currentCharacter?.profile?.background || currentCharacter?.profile?.name || '未知角色')
    await addFavoriteFromMessage(message, sourceRole, characterId)
    addNotification({
      id: `fav-${Date.now()}`,
      type: 'success',
      title: '收藏成功',
      message: '消息已添加到收藏夹',
      timestamp: Date.now(),
      read: false,
      duration: 2000,
    })
  }, [currentCharacter, characterId, addFavoriteFromMessage, addNotification])

  const handleRegenerateReply = useCallback((_message: Message) => {
    if (characterId) {
      regenerateReply(characterId)
    }
  }, [characterId, regenerateReply])

  // 发送收藏内容到当前聊天
  const handleSendFavorite = useCallback((favorite: Favorite) => {
    if (!characterId) return
    const type = favorite.type === 'link' ? 'text' : favorite.type
    sendMessage(characterId, favorite.content, type, favorite.fileInfo, favorite.voiceInfo)
  }, [characterId, sendMessage])

  // 停止生成
  const handleAbortGeneration = useCallback(() => {
    useChatStore.getState().abortGeneration()
  }, [])

  // 未选择角色时的占位
  if (!currentCharacter) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="h-full w-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900"
      >
        <div className="text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary-400 to-purple-500 flex items-center justify-center">
            <MessageCircle className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
            角色聊天界面
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            当前未选择角色（占位页面）
          </p>
          <button onClick={() => navigate('/main')} className="btn-primary mt-4">
            返回主页
          </button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full w-full flex bg-gray-50 dark:bg-gray-900 overflow-hidden"
    >
      {/* 左栏：模型展示区 */}
      <div
        className="hidden md:flex flex-shrink-0"
        style={{ width: `${leftWidth}px` }}
      >
        <ModelDisplayArea
          key={characterId}
          modelDisplay={resolvedModelDisplay}
          onImport={handleImportModel}
          live2dRef={live2dRef}
          threeDRef={threeDRef}
          lastUserMessage={lastUserMessage}
          characterId={characterId}
          onModelReady={handleModelReady}
          isAssistant={currentCharacter?.isAssistant}
          assistantId={currentCharacter?.assistantId}
          onManualMatchExpression={() => {
            // 从聊天页进入时，模型类型已知，自动保存
            const modelPath = resolvedModelDisplay?.url || currentCharacter?.modelDisplay?.url || ''
            const saved = getCharacterModelType(characterId, modelPath)
            if (!saved) {
              setCharacterModelType(characterId, currentModelType === '3d' ? '3d' : '2d', modelPath)
            }
            setShowExprManualMatch(true)
          }}
          onManualMatchAction={() => {
            // 从聊天页进入时，模型类型已知，自动保存
            const modelPath = resolvedModelDisplay?.url || currentCharacter?.modelDisplay?.url || ''
            const saved = getCharacterModelType(characterId, modelPath)
            if (!saved) {
              setCharacterModelType(characterId, currentModelType === '3d' ? '3d' : '2d', modelPath)
            }
            setShowActionManualMatch(true)
          }}
        />
      </div>

      {/* 可拖动分隔线 */}
      <div
        onMouseDown={handleDividerMouseDown}
        className="hidden md:flex w-1 flex-shrink-0 cursor-col-resize bg-gray-200 dark:bg-gray-700 hover:bg-primary-400 dark:hover:bg-primary-500 transition-colors relative group"
        title="拖拽调整宽度"
      >
        {/* 扩大可点击区域 */}
        <div className="absolute inset-y-0 -left-1.5 -right-1.5 z-10" />
      </div>

      {/* 右栏：聊天区 */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* 聊天背景图（底层，完全不透明，让用户看到完整背景） */}
        {currentCharacter.chatBackground && (
          <div
            className="absolute inset-0 bg-cover bg-center pointer-events-none z-0"
            style={{ backgroundImage: `url(${currentCharacter.chatBackground})` }}
          />
        )}

        {/* 右上：顶部信息区 */}
        <div className="relative z-10">
          <TopInfoBar
            characterName={displayName}
            status={status}
            onBack={() => navigate('/main')}
            onSettings={() =>
              currentCharacter?.isAssistant
                ? setShowAssistantMenu(true)
                : navigate('/character-settings', { state: { characterId } })
            }
            isNameClickable={!!currentCharacter?.isAssistant}
            onNameClick={() => setShowAssistantProfile(true)}
          />
        </div>

        {/* 网络断开提示 */}
        {!isOnline && (
          <div className="bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-4 py-2 text-sm font-medium w-full text-center flex-shrink-0 relative z-10 border-b border-amber-200 dark:border-amber-800">
            网络未连接，回复将使用预设内容
          </div>
        )}

        {/* 右中：消息列表 */}
        <MessageList
          messages={messages}
          isTyping={isTyping}
          hasBackground={!!currentCharacter.chatBackground}
          onContextMenu={handleContextMenu}
          editingMessageId={editingMessageId}
          onEditSave={handleEditSave}
          onEditCancel={handleEditCancel}
          onAbortTyping={handleAbortGeneration}
        />

        {/* 右下：输入区域 */}
        <InputArea
          onSend={handleSend}
          disabled={false}
          onSendFavorite={handleSendFavorite}
          isTyping={isTyping}
          onAbort={handleAbortGeneration}
        />
      </div>

      {/* 右键消息菜单 */}
      <MessageContextMenu
        state={contextMenu}
        onClose={handleCloseContextMenu}
        onCopy={handleCopyMessage}
        onEdit={handleEditMessage}
        onDelete={handleDeleteMessage}
        onWithdraw={handleWithdrawMessage}
        onForward={handleForwardMessage}
        onFavorite={handleFavoriteMessage}
        onRegenerate={handleRegenerateReply}
      />

      {/* 转发弹窗 */}
      <ForwardDialog
        visible={forwardDialogVisible}
        characters={characters}
        currentCharacterId={characterId}
        onClose={() => setForwardDialogVisible(false)}
        onSelect={handleForwardSelect}
      />

      {/* 3D 格式建议弹窗 */}
      {formatWarning.visible && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-[400px] w-[90%] mx-4 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
                格式建议
              </h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                检测到您导入的是 <strong className="text-primary-500">{formatWarning.fileName}</strong>，文件通常较大，加载可能较慢。
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                建议使用 <strong>.glb</strong> 或 <strong>.gltf</strong> 格式以获得更快的加载速度。
              </p>
            </div>
            <div className="px-5 py-3 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-end gap-2">
              <button
                onClick={handleCancelFormatWarning}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmFormatWarning}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors"
              >
                继续加载
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 文件格式不一致弹窗 */}
      {formatInconsistent.visible && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-[420px] w-[90%] mx-4 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                模型格式不一致
              </h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                您导入的模型格式不一致，以下文件与其他模型不匹配：
              </p>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                {formatInconsistent.fileNames.map((name) => (
                  <p key={name} className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                    {name}
                  </p>
                ))}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                请确认是否需要更换。
              </p>
            </div>
            <div className="px-5 py-3 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-end gap-2">
              <button
                onClick={handleCancelFormatInconsistent}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmFormatInconsistent}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors"
              >
                继续加载
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Live2D 正脸偏好设置弹窗 */}
      <AnimatePresence>
        {showFacePrefPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-5 max-w-[360px] w-[85%]"
            >
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3 text-center">
                正脸偏好设置
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 text-center">
                请选择模型空闲时的正脸模式
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    // 保存到角色独立配置
                    if (characterId) {
                      setCharacterFaceMode(characterId, 'auto' as FaceMode)
                    }
                    updateSettings({ live2dFaceMode: 'auto' })
                    setShowFacePrefPopup(false)
                    if (pendingExprGuide) {
                      setPendingExprGuide(false)
                      setShowExprGuide(true)
                    }
                  }}
                  className="w-full py-3 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  空闲时自动回正
                  <span className="block text-[11px] font-normal opacity-80 mt-1">
                    鼠标移出窗口后，模型自动回到正面
                  </span>
                </button>
                <button
                  onClick={() => {
                    // 保存到角色独立配置
                    if (characterId) {
                      setCharacterFaceMode(characterId, 'front-only' as FaceMode)
                    }
                    updateSettings({ live2dFaceMode: 'front-only' })
                    setShowFacePrefPopup(false)
                    if (pendingExprGuide) {
                      setPendingExprGuide(false)
                      setShowExprGuide(true)
                    }
                  }}
                  className="w-full py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors"
                >
                  仅当鼠标在正前方时正面
                  <span className="block text-[11px] font-normal opacity-60 mt-1">
                    鼠标在正前方时正面，其他位置保持最后姿态
                  </span>
                </button>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3 text-center">
                后续可在用户偏好设置中更改
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live2D 首次导入表情设置引导 */}
      <ExpressionSetupGuide
        visible={showExprGuide}
        characterName={currentCharacter?.profile?.name || ''}
        onAutoMatch={handleExprAutoMatch}
        onManualMatch={handleExprManualMatch}
        onClose={() => setShowExprGuide(false)}
      />

      {/* 表情手动匹配弹窗 */}
      <ExpressionManualMatch
        visible={showExprManualMatch}
        characterName={currentCharacter?.profile?.name || ''}
        modelPath={resolvedModelDisplay?.url || currentCharacter?.modelDisplay?.url || ''}
        characterId={characterId}
        onClose={handleExprManualMatchClose}
      />

      {/* 动作手动匹配弹窗 */}
      <ActionManualMatch
        visible={showActionManualMatch}
        characterName={currentCharacter?.profile?.name || ''}
        modelPath={resolvedModelDisplay?.url || currentCharacter?.modelDisplay?.url || ''}
        characterId={characterId}
        onClose={() => setShowActionManualMatch(false)}
      />

      {/* AI助手档案编辑弹窗 */}
      <AnimatePresence>
        {showAssistantProfile && currentCharacter && (
          <AssistantProfileEditor
            character={currentCharacter}
            onClose={() => setShowAssistantProfile(false)}
          />
        )}
      </AnimatePresence>

      {/* AI助手设置下拉菜单 */}
      <AnimatePresence>
        {showAssistantMenu && currentCharacter?.isAssistant && (
          <>
            {/* 透明遮罩，点击关闭菜单 */}
            <div
              className="fixed inset-0 z-[200]"
              onClick={() => setShowAssistantMenu(false)}
              onContextMenu={(e) => {
                e.preventDefault()
                setShowAssistantMenu(false)
              }}
            />
            {/* 下拉菜单 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              transition={{ duration: 0.15 }}
              className="fixed z-[201] min-w-[180px] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 py-1 overflow-hidden"
              style={{
                top: 60,
                right: 16,
              }}
            >
              {/* 编辑档案 */}
              <button
                onClick={() => {
                  setShowAssistantMenu(false)
                  setShowAssistantProfile(true)
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <Edit3 className="w-4 h-4 text-primary-500" />
                编辑档案
              </button>

              {/* 查找聊天记录 */}
              <button
                onClick={handleAssistantSearchChat}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <Search className="w-4 h-4 text-blue-500" />
                查找聊天记录
              </button>

              {/* 设为置顶 */}
              <button
                onClick={handleAssistantTogglePin}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <Pin className="w-4 h-4 text-yellow-500" />
                {currentCharacter.isPinned ? '取消置顶' : '设为置顶'}
              </button>

              {/* 设置当前聊天背景 */}
              <button
                onClick={handleAssistantSetBackground}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <ImageIcon className="w-4 h-4 text-green-500" />
                {currentCharacter.chatBackground ? '更换聊天背景' : '设置聊天背景'}
              </button>

              {/* 恢复默认背景（仅当已设置背景时显示） */}
              {currentCharacter.chatBackground && (
                <button
                  onClick={() => {
                    updateCharacter({ ...currentCharacter, chatBackground: undefined })
                    setShowAssistantMenu(false)
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <RotateCcw className="w-4 h-4 text-gray-400" />
                  恢复默认背景
                </button>
              )}

              {/* 分隔线 */}
              <div className="border-t border-gray-100 dark:border-gray-700 my-1" />

              {/* 清空聊天记录 */}
              <button
                onClick={() => {
                  setShowAssistantMenu(false)
                  setShowAssistantClearConfirm(true)
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                清空聊天记录
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 助手清空聊天记录确认弹窗 */}
      <AnimatePresence>
        {showAssistantClearConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAssistantClearConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="card max-w-md w-full mx-4 p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">清空聊天记录</h3>
              </div>
              <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm leading-relaxed">
                确定要清空与{displayName}的所有聊天记录吗？
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleAssistantClearChat}
                  className="flex-1 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  确定清空
                </button>
                <button
                  onClick={() => setShowAssistantClearConfirm(false)}
                  className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 助手文件权限询问弹窗 */}
      <AnimatePresence>
        {showAssistantFilePermission && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAssistantFilePermission(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="card max-w-md w-full mx-4 p-6"
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">提示</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm leading-relaxed">
                是否允许平台读取本地文件？
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleAssistantAllowFileAccess}
                  className="flex-1 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors"
                >
                  允许
                </button>
                <button
                  onClick={() => {
                    setShowAssistantFilePermission(false)
                    setShowAssistantPermissionDenied(true)
                  }}
                  className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  拒绝
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 助手权限拒绝提示弹窗 */}
      <AnimatePresence>
        {showAssistantPermissionDenied && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAssistantPermissionDenied(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className="card max-w-md w-full mx-4 p-6"
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">提示</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm leading-relaxed">
                后续可在用户偏好设置中更改
              </p>
              <button
                onClick={() => setShowAssistantPermissionDenied(false)}
                className="w-full py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors"
              >
                知道了
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 助手背景图文件选择（隐藏） */}
      <input
        ref={assistantBgRef}
        type="file"
        accept="image/*"
        onChange={handleAssistantBgSelected}
        className="hidden"
      />
    </motion.div>
  )
}
