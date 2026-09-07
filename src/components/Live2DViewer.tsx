import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { loadExpressionMapping } from '@/utils/expressionMapping'
import { useSettingsStore } from '@/stores'
import { getCharacterFaceMode } from '@/utils/characterModelType'

// ─── VTube Studio 配置文件类型定义 ─────────────────────────────────────────

interface VTubePosition {
  x: number
  y: number
  z?: number
}

interface VTubeScale {
  x: number
  y: number
  z?: number
}

interface VTubeHotkey {
  HotkeyID: string
  Name: string
  Action: string
  File: string
  Folder?: string
  IsActive?: boolean
}

interface VTubePhysicsSettings {
  Use: boolean
  UseLegacyPhysics?: boolean
  PhysicsStrength?: number
  WindStrength?: number
  DraggingPhysicsStrength?: number
}

interface VTubeFileReferences {
  Icon?: string
  Model?: string
  IdleAnimation?: string
  IdleAnimationWhenTrackingLost?: string
}

interface VTubeConfig {
  Version?: number
  Name?: string
  ModelID?: string
  FileReferences?: VTubeFileReferences
  SavedModelPosition?: {
    Position?: VTubePosition
    Rotation?: { x: number; y: number; z: number; w: number }
    Scale?: VTubeScale
  }
  modelPosition?: VTubePosition
  modelOffset?: VTubePosition
  modelScale?: number | VTubeScale
  expressions?: Array<{ name: string; file: string }>
  expression?: Array<{ name: string; file: string }>
  Hotkeys?: VTubeHotkey[]
  PhysicsSettings?: VTubePhysicsSettings
  lighting?: unknown
  background?: unknown
}

type ExpressionMap = Record<string, string>

function deriveVTubePath(modelPath: string): string {
  return modelPath.replace(/\.model3\.json$/i, '.vtube.json')
}

async function loadVTubeConfig(vtubePath: string): Promise<VTubeConfig | null> {
  try {
    const resp = await fetch(vtubePath)
    if (!resp.ok) {
      console.log('[Live2D] vtube.json 不存在，使用默认配置:', vtubePath, resp.status)
      return null
    }
    const config = await resp.json()
    console.log('[Live2D] vtube.json 加载成功:', vtubePath)
    return config as VTubeConfig
  } catch (err) {
    console.log('[Live2D] vtube.json 加载失败，使用默认配置:', err instanceof Error ? err.message : String(err))
    return null
  }
}

function extractPosition(config: VTubeConfig): { x: number; y: number } | null {
  if (config.SavedModelPosition?.Position) {
    const pos = config.SavedModelPosition.Position
    if (typeof pos.x === 'number' && typeof pos.y === 'number') {
      return { x: pos.x, y: pos.y }
    }
  }
  if (config.modelPosition) {
    return { x: config.modelPosition.x, y: config.modelPosition.y }
  }
  if (config.modelOffset) {
    return { x: config.modelOffset.x, y: config.modelOffset.y }
  }
  return null
}

function extractScale(config: VTubeConfig): number | null {
  if (config.SavedModelPosition?.Scale) {
    const scale = config.SavedModelPosition.Scale
    if (typeof scale.x === 'number' && typeof scale.y === 'number') {
      return (scale.x + scale.y) / 2
    }
  }
  if (typeof config.modelScale === 'number') {
    return config.modelScale
  }
  if (config.modelScale && typeof config.modelScale === 'object') {
    return (config.modelScale.x + config.modelScale.y) / 2
  }
  return null
}

function extractExpressionMap(config: VTubeConfig): ExpressionMap {
  const map: ExpressionMap = {}
  if (Array.isArray(config.Hotkeys)) {
    for (const hotkey of config.Hotkeys) {
      if (hotkey.Action === 'ToggleExpression' && hotkey.Name && hotkey.File) {
        map[hotkey.Name] = hotkey.File
      }
    }
  }
  if (Array.isArray(config.expressions)) {
    for (const exp of config.expressions) {
      if (exp.name && exp.file) {
        map[exp.name] = exp.file
      }
    }
  }
  if (Array.isArray(config.expression)) {
    for (const exp of config.expression) {
      if (exp.name && exp.file) {
        map[exp.name] = exp.file
      }
    }
  }
  return map
}

interface ExpressionSceneDef {
  scene: string
  keywords: string[]
  fallbackKeywords: string[]
}

const EXPRESSION_SCENE_KEYWORDS: ExpressionSceneDef[] = [
  {
    scene: 'happy',
    keywords: ['笑顔', 'smile', 'happy', 'joy', '开心', '高兴', '笑', '嬉しい', '楽しい', 'ハッピー', 'laugh'],
    fallbackKeywords: ['ハート目', 'heart', '默认'],
  },
  {
    scene: 'surprise',
    keywords: ['驚き', 'surprise', 'shock', 'amazed', '惊讶', '吃惊', 'びっくり', 'wow'],
    fallbackKeywords: ['スター目', 'star'],
  },
  {
    scene: 'angry',
    keywords: ['怒る', 'angry', 'mad', 'annoyed', '生气', '发火', '愤怒', '气愤', '恼火', '讨厌', '腹立つ', 'rage', 'bothered'],
    fallbackKeywords: ['困る', '困', 'trouble'],
  },
  {
    scene: 'shy',
    keywords: ['照れ', '恥ずかしい', 'shy', 'blush', 'embarrassed', '害羞', '脸红'],
    fallbackKeywords: ['汗', 'sweat'],
  },
  {
    scene: 'sweat',
    keywords: ['汗', 'sweat', '紧张', '害怕', '焦る', '困る', 'nervous'],
    fallbackKeywords: ['青ざめ', 'pale'],
  },
  {
    scene: 'sad',
    keywords: ['悲しい', '泣く', 'sad', 'cry', 'upset', '伤心', 'sorrow'],
    fallbackKeywords: ['汗', 'sweat'],
  },
  {
    scene: 'heart',
    keywords: ['ハート目', 'heart', 'love', '爱心', '喜欢', 'ハート'],
    fallbackKeywords: ['笑顔', 'smile'],
  },
  {
    scene: 'star',
    keywords: ['スター目', 'star', '星星'],
    fallbackKeywords: ['驚き', 'surprise'],
  },
  {
    scene: 'blink',
    keywords: ['まばたき', 'blink', 'wink'],
    fallbackKeywords: [],
  },
  {
    scene: 'dizzy',
    keywords: ['めまい', 'vertigo', 'dizzy', '眩晕'],
    fallbackKeywords: ['困る'],
  },
]

function buildUniversalExpressionMap(
  modelExpressions: Array<{ Name: string; File: string }>
): Record<string, string> {
  const map: Record<string, string> = {}

  for (const { scene, keywords } of EXPRESSION_SCENE_KEYWORDS) {
    if (map[scene]) continue
    for (const exp of modelExpressions) {
      const lowerName = exp.Name.toLowerCase()
      if (keywords.some((kw) => lowerName === kw.toLowerCase())) {
        map[scene] = exp.Name
        break
      }
    }
  }

  for (const { scene, keywords } of EXPRESSION_SCENE_KEYWORDS) {
    if (map[scene]) continue
    for (const exp of modelExpressions) {
      const lowerName = exp.Name.toLowerCase()
      if (keywords.some((kw) => lowerName.includes(kw.toLowerCase()))) {
        map[scene] = exp.Name
        break
      }
    }
  }

  for (const { scene, fallbackKeywords } of EXPRESSION_SCENE_KEYWORDS) {
    if (map[scene] || fallbackKeywords.length === 0) continue
    for (const exp of modelExpressions) {
      const lowerName = exp.Name.toLowerCase()
      if (fallbackKeywords.some((kw) => lowerName.includes(kw.toLowerCase()))) {
        map[scene] = exp.Name
        break
      }
    }
  }

  const defaultExp = modelExpressions.find((exp) => {
    const lowerName = exp.Name.toLowerCase()
    return lowerName === '笑顔' ||
      lowerName === 'smile' ||
      lowerName.includes('笑顔') ||
      lowerName.includes('smile') ||
      lowerName.includes('idle') ||
      lowerName.includes('default')
  })
  if (defaultExp) {
    map['default'] = defaultExp.Name
  } else if (map['happy']) {
    map['default'] = map['happy']
  } else if (modelExpressions.length > 0) {
    map['default'] = modelExpressions[0].Name
  }

  console.log('[Live2D] 表情映射构建完成:', JSON.stringify(map, null, 2))
  console.log('[Live2D] 模型可用表情:', modelExpressions.map((e) => e.Name))

  return map
}

export type BodyAction = 'nod' | 'shake' | 'wave' | 'tilt'

export interface Live2DViewerHandle {
  setExpression: (name: string) => void
  getExpressions: () => string[]
  getExpressionMap: () => Record<string, string>
  setRandomExpression: () => void
  resetExpression: () => void
  triggerAction: (action: BodyAction) => void
  triggerRandomAction: () => void
  hasExpressions: () => boolean
  getModelScreenPosition: () => { x: number; y: number; width: number; height: number } | null
  resetModelView: () => void
}

const Live2DViewer = forwardRef<Live2DViewerHandle, {
  modelPath: string
  className?: string
  onModelClick?: () => void
  onModelReady?: () => void
  characterId?: string
}>(function Live2DViewer({ modelPath, className = '', onModelClick, onModelReady, characterId }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<unknown>(null)
  const modelRef = useRef<unknown>(null)
  const expressionMapRef = useRef<ExpressionMap>({})
  const universalExpMapRef = useRef<Record<string, string>>({})
  const userExpMapRef = useRef<Record<string, string>>({})
  const vtubeConfigRef = useRef<VTubeConfig | null>(null)
  const lastInteractionRef = useRef<number>(Date.now())
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const breathAnimationRef = useRef<number>(0)
  const actionAnimationRef = useRef<number>(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const onModelReadyRef = useRef(onModelReady)
  useEffect(() => {
    onModelReadyRef.current = onModelReady
  }, [onModelReady])

  const interactionStateRef = useRef({
    isDragging: false,
    isRotating: false,
    dragStartX: 0,
    dragStartY: 0,
    modelStartX: 0,
    modelStartY: 0,
    rotationStartX: 0,
    modelStartRotation: 0,
  })

  const defaultViewStateRef = useRef<{ x: number; y: number; scale: number; rotation: number }>({ x: 0, y: 0, scale: 1, rotation: 0 })

  // 平滑追踪状态：使用 useRef 确保跨渲染持久化，不会被组件重新渲染时意外重置
  const smoothTrackRef = useRef({
    currentAngleX: 0,  // 当前应用的角度 X
    currentAngleY: 0,  // 当前应用的角度 Y
    targetAngleX: 0,   // 目标角度 X
    targetAngleY: 0,   // 目标角度 Y
    isResetting: false, // 是否正在恢复默认姿态
    resetStartTime: 0,
  })

  useImperativeHandle(ref, () => ({
    setExpression: (name: string) => {
      const model = modelRef.current as {
        expression: (name: string) => void
        internalModel?: { settings?: { expressions?: Array<{ Name: string; File: string }> } }
      } | null
      if (!model || typeof model.expression !== 'function') {
        console.warn('[Live2D] 模型未加载，无法触发表情')
        return
      }

      lastInteractionRef.current = Date.now()
      console.log(`[Live2D] 触发场景: ${name} → 开始匹配表情`)

      const userMap = userExpMapRef.current
      if (userMap[name]) {
        try {
          model.expression(userMap[name])
          console.log(`[Live2D] 表情触发(用户手动映射): ${name} -> ${userMap[name]}`)
          return
        } catch (err) {
          console.warn(`[Live2D] 用户手动映射表情触发失败: ${userMap[name]}`, err)
        }
      }

      const universalMap = universalExpMapRef.current
      if (universalMap[name]) {
        try {
          model.expression(universalMap[name])
          console.log(`[Live2D] 触发场景: ${name} → 匹配表情: ${universalMap[name]} (通用映射)`)
          return
        } catch (err) {
          console.warn(`[Live2D] 通用映射表情触发失败: ${universalMap[name]}`, err)
        }
      } else {
        console.log(`[Live2D] 通用映射表中未找到场景: ${name}，可用场景: ${Object.keys(universalMap).join(', ')}`)
      }

      const expMap = expressionMapRef.current
      const expressions = (model.internalModel?.settings as { expressions?: Array<{ Name: string; File: string }> } | undefined)?.expressions || []
      if (expMap[name]) {
        const targetFile = expMap[name]
        const found = expressions.find((e) => e.File === targetFile)
        if (found) {
          try {
            model.expression(found.Name)
            console.log(`[Live2D] 表情触发(vtube映射): ${name} -> ${found.Name} (${targetFile})`)
            return
          } catch (err) {
            console.warn(`[Live2D] vtube映射表情触发失败: ${found.Name}`, err)
          }
        }
      }

      try {
        model.expression(name)
        console.log(`[Live2D] 表情触发(直接): ${name}`)
      } catch (err) {
        if (universalMap['default']) {
          try {
            model.expression(universalMap['default'])
            console.log(`[Live2D] 无匹配表情 "${name}"，使用默认: ${universalMap['default']}`)
          } catch {
            console.warn(`[Live2D] 表情 "${name}" 不存在，默认表情也失败`)
          }
        } else {
          console.warn(`[Live2D] 表情 "${name}" 不存在，模型无可用表情`)
        }
      }
    },
    getExpressions: () => {
      const model = modelRef.current as {
        internalModel?: { settings?: { expressions?: Array<{ Name: string; File: string }> } }
      } | null
      const expressions = model?.internalModel?.settings?.expressions || []
      return expressions.map((e) => e.Name)
    },
    getExpressionMap: () => ({ ...universalExpMapRef.current }),
    setRandomExpression: () => {
      const model = modelRef.current as { expression: (name: string) => void } | null
      if (!model) return

      lastInteractionRef.current = Date.now()

      const universalMap = universalExpMapRef.current
      const scenes = Object.keys(universalMap).filter((k) => k !== 'default')
      if (scenes.length > 0) {
        const randomScene = scenes[Math.floor(Math.random() * scenes.length)]
        try {
          model.expression(universalMap[randomScene])
          console.log(`[Live2D] 随机表情(通用): ${randomScene} -> ${universalMap[randomScene]}`)
          return
        } catch {
          // ignore
        }
      }

      const expressions = (model as { internalModel?: { settings?: { expressions?: Array<{ Name: string; File: string }> } } }).internalModel?.settings?.expressions || []
      if (expressions.length > 0) {
        const randomExp = expressions[Math.floor(Math.random() * expressions.length)]
        try {
          model.expression(randomExp.Name)
          console.log(`[Live2D] 随机表情(内置): ${randomExp.Name}`)
        } catch {
          // ignore
        }
      }
    },
    resetExpression: () => {
      const model = modelRef.current as { expression: (name: string) => void } | null
      if (!model) return
      try {
        model.expression('')
      } catch {
        // ignore
      }
    },
    triggerAction: (action: BodyAction) => {
      const model = modelRef.current as {
        internalModel?: {
          coreModel?: {
            setParameterValueById?: (id: string, value: number) => void
            getParameterValueById?: (id: string) => number
          }
        }
      } | null
      if (!model?.internalModel?.coreModel?.setParameterValueById) {
        console.warn('[Live2D] 模型未加载，无法触发动作')
        return
      }

      lastInteractionRef.current = Date.now()
      const core = model.internalModel.coreModel

      if (actionAnimationRef.current) cancelAnimationFrame(actionAnimationRef.current)

      const tryParam = (paramId: string, value: number): boolean => {
        try {
          core.setParameterValueById!(paramId, value)
          return true
        } catch {
          return false
        }
      }

      const startTime = Date.now()
      const duration = 1200

      const animateAction = () => {
        const elapsed = Date.now() - startTime
        const t = Math.min(elapsed / duration, 1)
        const wave = Math.sin(t * Math.PI * 6) * (1 - t)

        switch (action) {
          case 'nod':
            tryParam('ParamAngleX', wave * 15) || tryParam('ParamBodyAngleX', wave * 10)
            break
          case 'shake':
            tryParam('ParamAngleY', wave * 15) || tryParam('ParamBodyAngleY', wave * 10)
            break
          case 'wave':
            tryParam('ParamArmAngle', 0.5 + wave * 0.5) ||
              tryParam('ParamArmRAngle', 0.5 + wave * 0.5) ||
              tryParam('ParamArmLAngle', 0.5 + wave * 0.5)
            break
          case 'tilt':
            tryParam('ParamAngleZ', wave * 10) || tryParam('ParamBodyAngleZ', wave * 8)
            break
        }

        if (t < 1) {
          actionAnimationRef.current = requestAnimationFrame(animateAction)
        } else {
          switch (action) {
            case 'nod':
              tryParam('ParamAngleX', 0) || tryParam('ParamBodyAngleX', 0)
              break
            case 'shake':
              tryParam('ParamAngleY', 0) || tryParam('ParamBodyAngleY', 0)
              break
            case 'wave':
              tryParam('ParamArmAngle', 0) ||
                tryParam('ParamArmRAngle', 0) ||
                tryParam('ParamArmLAngle', 0)
              break
            case 'tilt':
              tryParam('ParamAngleZ', 0) || tryParam('ParamBodyAngleZ', 0)
              break
          }
        }
      }
      actionAnimationRef.current = requestAnimationFrame(animateAction)
      console.log(`[Live2D] 肢体动作: ${action}`)
    },
    triggerRandomAction: () => {
      const actions: BodyAction[] = ['nod', 'shake', 'wave', 'tilt']
      const randomAction = actions[Math.floor(Math.random() * actions.length)]
      const model = modelRef.current as {
        internalModel?: {
          coreModel?: {
            setParameterValueById?: (id: string, value: number) => void
          }
        }
      } | null
      if (!model?.internalModel?.coreModel?.setParameterValueById) return
      const handle = (ref as unknown as { current?: Live2DViewerHandle }).current
      if (handle) handle.triggerAction(randomAction)
    },
    hasExpressions: () => {
      return Object.keys(universalExpMapRef.current).length > 0
    },
    getModelScreenPosition: () => {
      const model = modelRef.current as {
        x: number; y: number; width: number; height: number
        scale: { x: number; y: number }
      } | null
      if (!model) return null
      return {
        x: model.x,
        y: model.y,
        width: model.width,
        height: model.height,
      }
    },
    resetModelView: () => {
      const model = modelRef.current as {
        x: number; y: number
        scale: { set: (s: number) => void }
        rotation: number
      } | null
      if (!model) return
      const defaults = defaultViewStateRef.current
      model.x = defaults.x
      model.y = defaults.y
      model.scale.set(defaults.scale)
      model.rotation = defaults.rotation
      console.log('[Live2D] 模型视角已重置')
    },
  }), [])

  useEffect(() => {
    let destroyed = false

    async function init() {
      // 模型路径为空时不初始化
      if (!modelPath) {
        console.warn('[Live2D] 模型路径为空，跳过初始化')
        if (!destroyed) setStatus('error')
        return
      }

      // 关键修复：等待容器就绪，最多重试 30 次（共 3 秒）
      // 解决组件挂载后 containerRef 可能为 null 导致初始化被跳过的问题
      for (let i = 0; i < 30; i++) {
        if (destroyed) return
        if (containerRef.current) break
        await new Promise((r) => setTimeout(r, 100))
      }
      if (!containerRef.current) {
        console.error('[Live2D] 容器未就绪，初始化放弃')
        if (!destroyed) setStatus('error')
        return
      }

      const win = window as unknown as Record<string, unknown>
      if (typeof window !== 'undefined' && !win.Live2DCubismCore) {
        const scriptSrc = `${import.meta.env.BASE_URL}lib/live2dcubismcore.min.js`
        await new Promise<void>((resolve) => {
          const existing = document.querySelector(`script[src="${scriptSrc}"]`)
          if (existing) { resolve(); return }
          const script = document.createElement('script')
          script.src = scriptSrc
          script.onload = () => resolve()
          script.onerror = () => resolve()
          document.head.appendChild(script)
          setTimeout(resolve, 10000)
        })

        if (!win.Live2DCubismCore) {
          console.error('Live2D Cubism Core 未加载')
          if (!destroyed) setStatus('error')
          return
        }
      }

      const PIXI = await import('pixi.js')
      win.PIXI = PIXI

      const { Live2DModel } = await import('pixi-live2d-display/cubism4')

      if (destroyed || !containerRef.current) return

      const container = containerRef.current
      // 等待容器有有效尺寸（可能因 CSS 动画/布局延迟导致首次为 0）
      let width = container.clientWidth
      let height = container.clientHeight
      if (width === 0 || height === 0) {
        for (let i = 0; i < 20; i++) {
          if (destroyed) return
          await new Promise((r) => setTimeout(r, 50))
          width = container.clientWidth
          height = container.clientHeight
          if (width > 0 && height > 0) break
        }
        // 最终 fallback
        width = width || 400
        height = height || 600
      }

      const app = new PIXI.Application({
        width,
        height,
        backgroundAlpha: 0,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        antialias: true,
      })

      console.log('[Live2D] 容器尺寸:', width, height)
      appRef.current = app

      const canvas = app.view as HTMLCanvasElement
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      canvas.style.display = 'block'
      container.appendChild(canvas)

      try {
        console.log('[Live2D] 开始加载模型:', modelPath)
        const model = await Live2DModel.from(modelPath)
        console.log('[Live2D] 模型加载成功，尺寸:', model.width, 'x', model.height)

        if (destroyed) {
          model.destroy()
          return
        }

        modelRef.current = model

        const vtubePath = deriveVTubePath(modelPath)
        const vtubeConfig = await loadVTubeConfig(vtubePath)

        let expressionMap: ExpressionMap = {}
        if (vtubeConfig) {
          expressionMap = extractExpressionMap(vtubeConfig)
          if (Object.keys(expressionMap).length > 0) {
            console.log('[Live2D] 表情映射已加载:', expressionMap)
          }
        }
        expressionMapRef.current = expressionMap
        vtubeConfigRef.current = vtubeConfig

        const modelSettings = model.internalModel?.settings as { expressions?: Array<{ Name: string; File: string }> } | undefined
        const modelExpressions = modelSettings?.expressions || []
        const universalMap = buildUniversalExpressionMap(modelExpressions)
        universalExpMapRef.current = universalMap
        if (Object.keys(universalMap).length > 0) {
          console.log('[Live2D] 通用表情映射已构建:', universalMap)
          console.log('[Live2D] 模型内置表情:', modelExpressions.map((e: { Name: string; File: string }) => `${e.Name} (${e.File})`))
        } else {
          console.log('[Live2D] 模型无内置表情，跳过表情切换功能')
        }

        if (characterId) {
          const charConfig = loadExpressionMapping(characterId)
          if (Object.keys(charConfig.mapping).length > 0) {
            userExpMapRef.current = charConfig.mapping
            console.log('[Live2D] 角色表情映射已加载:', characterId, charConfig.mapping)
          }
        }

        const modelWidth = model.width
        const modelHeight = model.height

        let scale = Math.min(
          (width * 0.85) / modelWidth,
          (height * 0.85) / modelHeight
        )

        if (vtubeConfig) {
          const vtubeScale = extractScale(vtubeConfig)
          if (vtubeScale !== null && vtubeScale !== 1.0) {
            console.log('[Live2D] 应用 vtube.json 缩放:', vtubeScale)
            scale *= vtubeScale
          }
        }
        model.scale.set(scale)

        let posX = (width - model.width) / 2
        let posY = (height - model.height) / 2 - (height * 0.05)

        if (vtubeConfig) {
          const vtubePos = extractPosition(vtubeConfig)
          if (vtubePos) {
            console.log('[Live2D] 应用 vtube.json 位置偏移:', vtubePos)
            posX += vtubePos.x * width * 0.5
            posY -= vtubePos.y * height * 0.5
          }
        }
        model.x = posX
        model.y = posY
        console.log('[Live2D] 初始模型位置:', model.x, model.y)
        console.log('[Live2D] 初始模型缩放:', model.scale.x, model.scale.y)
        console.log('[Live2D] 初始模型尺寸:', model.width, model.height)

        defaultViewStateRef.current = { x: posX, y: posY, scale, rotation: 0 }

        app.stage.addChild(model)

        // ── 调试：打印模型所有可用参数名和初始值 ──────────────────────
        try {
          const coreForDebug = (model as { internalModel?: { coreModel?: { getParameterCount?: () => number; getParameterIds?: () => string[]; getParameterValueById?: (id: string) => number; update?: () => void } } }).internalModel?.coreModel
          if (coreForDebug?.getParameterIds) {
            const paramIds = coreForDebug.getParameterIds()
            console.log('[Live2D] 模型可用参数 (' + paramIds.length + ' 个):', paramIds)
            // 打印角度相关参数的初始值
            const angleParams = paramIds.filter(id => /angle/i.test(id))
            console.log('[Live2D] 角度相关参数:', angleParams)
            for (const id of angleParams) {
              const val = coreForDebug.getParameterValueById?.(id)
              console.log(`[Live2D]   ${id} = ${val}`)
            }
          } else if (coreForDebug?.getParameterCount) {
            const count = coreForDebug.getParameterCount()
            console.log('[Live2D] 模型参数数量:', count, '(无法获取参数名，使用 getParameterCount)')
          }
          // 检查 coreModel.update 是否可用
          console.log('[Live2D] coreModel.update 方法可用:', typeof coreForDebug?.update === 'function')
        } catch (e) {
          console.warn('[Live2D] 获取模型参数信息失败:', e)
        }

        const MAX_ANGLE = 15
        const angleClampTicker = (delta: number) => {
          void delta
          const m = modelRef.current as {
            internalModel?: {
              coreModel?: {
                getParameterValueById?: (id: string) => number
                setParameterValueById?: (id: string, value: number) => void
              }
            }
          } | null
          const core = m?.internalModel?.coreModel
          if (!core?.getParameterValueById || !core?.setParameterValueById) return
          try {
            const angleX = core.getParameterValueById('ParamAngleX')
            if (typeof angleX === 'number' && Math.abs(angleX) > MAX_ANGLE) {
              core.setParameterValueById('ParamAngleX', Math.sign(angleX) * MAX_ANGLE)
            }
            const angleY = core.getParameterValueById('ParamAngleY')
            if (typeof angleY === 'number' && Math.abs(angleY) > MAX_ANGLE) {
              core.setParameterValueById('ParamAngleY', Math.sign(angleY) * MAX_ANGLE)
            }
          } catch {
            // ignore
          }
        }
        app.ticker.add(angleClampTicker)

        const recalculateLayout = () => {
          if (!containerRef.current || destroyed) return
          const newWidth = containerRef.current.clientWidth || 400
          const newHeight = containerRef.current.clientHeight || 600

          const app = appRef.current as { renderer?: { resize?: (w: number, h: number) => void } } | null
          if (app?.renderer?.resize) {
            app.renderer.resize(newWidth, newHeight)
          }

          const m = modelRef.current as { width: number; height: number; scale: { x: number; y: number; set: (s: number) => void }; x: number; y: number } | null
          if (!m) return

          const mWidth = m.width / m.scale.x
          const mHeight = m.height / m.scale.y

          let newScale = Math.min(
            (newWidth * 0.85) / mWidth,
            (newHeight * 0.85) / mHeight
          )

          const vtubeCfg = vtubeConfigRef.current
          if (vtubeCfg) {
            const vtubeScale = extractScale(vtubeCfg)
            if (vtubeScale !== null && vtubeScale !== 1.0) {
              newScale *= vtubeScale
            }
          }
          m.scale.set(newScale)

          let newPosX = (newWidth - m.width) / 2
          let newPosY = (newHeight - m.height) / 2 - (newHeight * 0.05)

          if (vtubeCfg) {
            const vtubePos = extractPosition(vtubeCfg)
            if (vtubePos) {
              newPosX += vtubePos.x * newWidth * 0.5
              newPosY -= vtubePos.y * newHeight * 0.5
            }
          }
          m.x = newPosX
          m.y = newPosY
        }

        const resizeObserver = new ResizeObserver(() => {
          recalculateLayout()
        })
        if (containerRef.current) {
          resizeObserver.observe(containerRef.current)
        }

        window.addEventListener('resize', recalculateLayout)

        const onMouseMove = (e: MouseEvent) => {
          const rect = container.getBoundingClientRect()

          const st = interactionStateRef.current
          if (st.isDragging) {
            const dx = e.clientX - st.dragStartX
            const dy = e.clientY - st.dragStartY
            const m = modelRef.current as { x: number; y: number; width: number; height: number } | null
            if (m) {
              let newX = st.modelStartX + dx
              let newY = st.modelStartY + dy
              const containerW = container.clientWidth
              const containerH = container.clientHeight
              newX = Math.max(-m.width * 0.5, Math.min(containerW - m.width * 0.5, newX))
              newY = Math.max(-m.height * 0.5, Math.min(containerH - m.height * 0.5, newY))
              m.x = newX
              m.y = newY
            }
            return
          }

          if (st.isRotating) {
            const dx = e.clientX - st.rotationStartX
            const m = modelRef.current as { rotation: number } | null
            if (m) {
              m.rotation = st.modelStartRotation + dx * 0.01
            }
            return
          }

          const m = modelRef.current as { x: number; y: number; width: number; height: number } | null
          if (m) {
            const modelRenderX = m.x
            const modelRenderY = m.y
            const scaleX = (m as { scale?: { x: number } }).scale?.x ?? 1
            const scaleY = (m as { scale?: { y: number } }).scale?.y ?? 1

            const headCenterX = rect.left + modelRenderX + (m.width * scaleX) / 2
            const headCenterY = rect.top + modelRenderY + (m.height * scaleY) * 0.15

            const dx = e.clientX - headCenterX
            const dy = e.clientY - headCenterY

            const DEAD_ZONE = 20
            if (Math.abs(dx) < DEAD_ZONE && Math.abs(dy) < DEAD_ZONE) {
              smoothTrackRef.current.targetAngleX = 0
              smoothTrackRef.current.targetAngleY = 0
              smoothTrackRef.current.isResetting = false
              return
            }

            const refDist = Math.max(rect.width, rect.height) * 0.3
            const normX = Math.max(-1, Math.min(1, dx / refDist))
            const normY = Math.max(-1, Math.min(1, dy / refDist))

            smoothTrackRef.current.targetAngleX = normX * 15
            smoothTrackRef.current.targetAngleY = normY * 15
            smoothTrackRef.current.isResetting = false
          }
        }

        const smoothTrackTicker = (delta: number) => {
          void delta
          const m = modelRef.current as {
            internalModel?: {
              coreModel?: {
                getParameterValueById?: (id: string) => number
                setParameterValueById?: (id: string, value: number) => void
                update?: () => void
              }
            }
          } | null
          const core = m?.internalModel?.coreModel
          if (!core?.setParameterValueById) return

          try {
            if (smoothTrackRef.current.isResetting) {
              const elapsed = Date.now() - smoothTrackRef.current.resetStartTime
              const duration = 500
              const t = Math.min(elapsed / duration, 1)
              const eased = 1 - Math.pow(1 - t, 3)

              const startAngleX = smoothTrackRef.current.targetAngleX
              const startAngleY = smoothTrackRef.current.targetAngleY
              smoothTrackRef.current.currentAngleX = startAngleX * (1 - eased)
              smoothTrackRef.current.currentAngleY = startAngleY * (1 - eased)

              if (t >= 1) {
                smoothTrackRef.current.isResetting = false
                smoothTrackRef.current.currentAngleX = 0
                smoothTrackRef.current.currentAngleY = 0
                smoothTrackRef.current.targetAngleX = 0
                smoothTrackRef.current.targetAngleY = 0
                console.log('[Live2D] 缓动回正完成: ParamAngleX=0, ParamAngleY=0')
              }
            } else {
              const lerpFactor = 0.08
              smoothTrackRef.current.currentAngleX += (smoothTrackRef.current.targetAngleX - smoothTrackRef.current.currentAngleX) * lerpFactor
              smoothTrackRef.current.currentAngleY += (smoothTrackRef.current.targetAngleY - smoothTrackRef.current.currentAngleY) * lerpFactor
            }

            const clampedAngleX = Math.max(-15, Math.min(15, smoothTrackRef.current.currentAngleX))
            const clampedAngleY = Math.max(-15, Math.min(15, smoothTrackRef.current.currentAngleY))
            core.setParameterValueById('ParamAngleX', clampedAngleX)
            core.setParameterValueById('ParamAngleY', clampedAngleY)

            // 关键修复：模型内部 update() 在 Ticker.shared 上运行，会在我们的 ticker 之前
            // 将动作系统的参数值应用到顶点。我们设置的参数值需要再次调用 coreModel.update()
            // 才能反映到渲染顶点上，否则渲染器使用的是旧顶点位置（动作系统的值）。
            if (typeof core.update === 'function') {
              core.update()
            }
          } catch {
            // ignore
          }
        }
        app.ticker.add(smoothTrackTicker)

        const onMouseLeaveWindow = () => {
          interactionStateRef.current.isDragging = false
          interactionStateRef.current.isRotating = false

          const currentSettings = useSettingsStore.getState().settings
          const currentFaceMode = characterId
            ? getCharacterFaceMode(characterId, currentSettings?.live2dFaceMode ?? 'auto')
            : (currentSettings?.live2dFaceMode ?? 'auto')

          console.log('[Live2D] 鼠标离开窗口，当前正脸模式:', currentFaceMode,
            'characterId:', characterId,
            'currentAngleX:', smoothTrackRef.current.currentAngleX,
            'currentAngleY:', smoothTrackRef.current.currentAngleY)

          if (currentFaceMode === 'auto') {
            // 使用缓动回正动画（0.5 秒内平滑回到正面）
            smoothTrackRef.current.isResetting = true
            smoothTrackRef.current.resetStartTime = Date.now()
            // 记录回正起始角度（从当前角度缓动到 0）
            smoothTrackRef.current.targetAngleX = smoothTrackRef.current.currentAngleX
            smoothTrackRef.current.targetAngleY = smoothTrackRef.current.currentAngleY

            console.log('[Live2D] 启动缓动回正: startAngleX=', smoothTrackRef.current.targetAngleX,
              'startAngleY=', smoothTrackRef.current.targetAngleY)
          } else {
            // 'front-only' 模式：保持最后姿态，不回正
            smoothTrackRef.current.isResetting = false
            console.log('[Live2D] front-only 模式，保持最后姿态，不回正')
          }
        }

        const onMouseDown = (e: MouseEvent) => {
          if (e.button === 0) {
            const st = interactionStateRef.current
            st.isDragging = true
            st.dragStartX = e.clientX
            st.dragStartY = e.clientY
            const m = modelRef.current as { x: number; y: number } | null
            if (m) {
              st.modelStartX = m.x
              st.modelStartY = m.y
            }
          } else if (e.button === 2) {
            const st = interactionStateRef.current
            st.isRotating = true
            st.rotationStartX = e.clientX
            const m = modelRef.current as { rotation: number } | null
            if (m) {
              st.modelStartRotation = m.rotation
            }
          }
        }

        const onMouseUp = () => {
          interactionStateRef.current.isDragging = false
          interactionStateRef.current.isRotating = false
        }

        const onWheel = (e: WheelEvent) => {
          e.preventDefault()
          const m = modelRef.current as { scale: { x: number; y: number; set: (s: number) => void }; x: number; y: number; width: number; height: number } | null
          if (!m) return
          const currentScale = m.scale.x
          const defaultScale = defaultViewStateRef.current.scale
          const factor = e.deltaY > 0 ? 0.9 : 1.1
          let newScale = currentScale * factor
          newScale = Math.max(defaultScale * 0.3, Math.min(defaultScale * 2.5, newScale))
          m.scale.set(newScale)

          const containerW = container.clientWidth
          const containerH = container.clientHeight
          const modelW = m.width
          const modelH = m.height

          if (modelW > containerW) {
            m.x = (containerW - modelW) / 2
          } else {
            m.x = Math.max(0, Math.min(containerW - modelW, m.x))
          }

          if (modelH > containerH) {
            m.y = (containerH - modelH) / 2 - (containerH * 0.05)
          } else {
            m.y = Math.max(0, Math.min(containerH - modelH, m.y))
          }
        }

        const onDoubleClick = () => {
          const defaults = defaultViewStateRef.current
          const m = modelRef.current as {
            x: number; y: number
            scale: { set: (s: number) => void }
            rotation: number
          } | null
          if (!m) return
          m.x = defaults.x
          m.y = defaults.y
          m.scale.set(defaults.scale)
          m.rotation = defaults.rotation
          console.log('[Live2D] 双击重置视角')
        }

        const onContextMenu = (e: Event) => {
          e.preventDefault()
        }

        container.addEventListener('mousedown', onMouseDown)
        window.addEventListener('mousemove', onMouseMove)
        document.documentElement.addEventListener('mouseleave', onMouseLeaveWindow)
        window.addEventListener('mouseup', onMouseUp)
        container.addEventListener('wheel', onWheel, { passive: false })
        container.addEventListener('dblclick', onDoubleClick)
        container.addEventListener('contextmenu', onContextMenu)

        const onClick = () => {
          lastInteractionRef.current = Date.now()

          const universalMap = universalExpMapRef.current
          const scenes = Object.keys(universalMap).filter((k) => k !== 'default')
          if (scenes.length > 0) {
            const randomScene = scenes[Math.floor(Math.random() * scenes.length)]
            try {
              model.expression(universalMap[randomScene])
              console.log(`[Live2D] 点击触发随机表情: ${randomScene} -> ${universalMap[randomScene]}`)
            } catch {
              // ignore
            }
          } else {
            const expressions = (model.internalModel?.settings as { expressions?: Array<{ Name: string; File: string }> } | undefined)?.expressions || []
            if (expressions.length > 0) {
              const randomExp = expressions[Math.floor(Math.random() * expressions.length)]
              try {
                model.expression(randomExp.Name)
                console.log(`[Live2D] 点击触发随机表情(内置): ${randomExp.Name}`)
              } catch {
                // ignore
              }
            }
          }

          const actions: BodyAction[] = ['nod', 'shake', 'wave', 'tilt']
          const randomAction = actions[Math.floor(Math.random() * actions.length)]
          const core = (model.internalModel as { coreModel?: { setParameterValueById?: (id: string, value: number) => void } } | undefined)?.coreModel
          if (core?.setParameterValueById) {
            const tryParam = (paramId: string, value: number): boolean => {
              try { core.setParameterValueById!(paramId, value); return true } catch { return false }
            }
            if (actionAnimationRef.current) cancelAnimationFrame(actionAnimationRef.current)
            const startTime = Date.now()
            const duration = 1200
            const animateAction = () => {
              const elapsed = Date.now() - startTime
              const t = Math.min(elapsed / duration, 1)
              const wave = Math.sin(t * Math.PI * 6) * (1 - t)
              switch (randomAction) {
                case 'nod': tryParam('ParamAngleX', wave * 15) || tryParam('ParamBodyAngleX', wave * 10); break
                case 'shake': tryParam('ParamAngleY', wave * 15) || tryParam('ParamBodyAngleY', wave * 10); break
                case 'wave': tryParam('ParamArmAngle', 0.5 + wave * 0.5) || tryParam('ParamArmRAngle', 0.5 + wave * 0.5) || tryParam('ParamArmLAngle', 0.5 + wave * 0.5); break
                case 'tilt': tryParam('ParamAngleZ', wave * 10) || tryParam('ParamBodyAngleZ', wave * 8); break
              }
              if (t < 1) {
                actionAnimationRef.current = requestAnimationFrame(animateAction)
              } else {
                switch (randomAction) {
                  case 'nod': tryParam('ParamAngleX', 0) || tryParam('ParamBodyAngleX', 0); break
                  case 'shake': tryParam('ParamAngleY', 0) || tryParam('ParamBodyAngleY', 0); break
                  case 'wave': tryParam('ParamArmAngle', 0) || tryParam('ParamArmRAngle', 0) || tryParam('ParamArmLAngle', 0); break
                  case 'tilt': tryParam('ParamAngleZ', 0) || tryParam('ParamBodyAngleZ', 0); break
                }
              }
            }
            actionAnimationRef.current = requestAnimationFrame(animateAction)
          }
          onModelClickRef.current?.()
        }
        container.addEventListener('click', onClick)

        const triggerBlink = () => {
          const m = modelRef.current as {
            internalModel?: {
              coreModel?: {
                setParameterValueById?: (id: string, value: number) => void
                getParameterValueById?: (id: string) => number
              }
            }
          } | null
          if (!m?.internalModel?.coreModel?.setParameterValueById) return

          const core = m.internalModel.coreModel
          try {
            core.setParameterValueById!('ParamEyeLOpen', 0)
            core.setParameterValueById!('ParamEyeROpen', 0)
            setTimeout(() => {
              if (destroyed) return
              core.setParameterValueById!('ParamEyeLOpen', 1)
              core.setParameterValueById!('ParamEyeROpen', 1)
            }, 150)
          } catch {
            // ignore
          }

          blinkTimerRef.current = setTimeout(triggerBlink, 3000 + Math.random() * 2000)
        }
        blinkTimerRef.current = setTimeout(triggerBlink, 3000 + Math.random() * 2000)

        const breathAnimate = () => {
          if (destroyed) return
          const m = modelRef.current as {
            internalModel?: {
              coreModel?: { setParameterValueById?: (id: string, value: number) => void }
            }
          } | null
          if (m?.internalModel?.coreModel?.setParameterValueById) {
            const breathValue = 0.5 + Math.sin(Date.now() / 2000) * 0.5
            try {
              m.internalModel.coreModel.setParameterValueById!('ParamBreath', breathValue)
            } catch {
              // ignore
            }
          }
          breathAnimationRef.current = requestAnimationFrame(breathAnimate)
        }
        breathAnimationRef.current = requestAnimationFrame(breathAnimate)

        idleTimerRef.current = setInterval(() => {
          const elapsed = Date.now() - lastInteractionRef.current
          if (elapsed >= 5000) {
            try {
              model.expression('')
            } catch {
              // ignore
            }
          }
        }, 1000)

        let idleAnimation = 'Idle'
        if (vtubeConfig?.FileReferences?.IdleAnimation) {
          idleAnimation = vtubeConfig.FileReferences.IdleAnimation
        }
        try {
          if (idleAnimation) {
            model.motion(idleAnimation)
            console.log('[Live2D] Idle 动画已播放:', idleAnimation)
          }
        } catch {
          console.log('[Live2D] 模型无 Idle 动画，跳过')
        }

        if (!destroyed) {
          setStatus('ready')
          onModelReadyRef.current?.()
        }

        return () => {
          if (container) {
            container.removeEventListener('mousedown', onMouseDown)
            container.removeEventListener('wheel', onWheel)
            container.removeEventListener('dblclick', onDoubleClick)
            container.removeEventListener('contextmenu', onContextMenu)
            container.removeEventListener('click', onClick)
          }
          window.removeEventListener('mousemove', onMouseMove)
          document.documentElement.removeEventListener('mouseleave', onMouseLeaveWindow)
          window.removeEventListener('mouseup', onMouseUp)
          window.removeEventListener('resize', recalculateLayout)
          if (resizeObserver) resizeObserver.disconnect()
          if (app?.ticker) {
            app.ticker.remove(angleClampTicker)
            app.ticker.remove(smoothTrackTicker)
          }
          if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current)
          if (breathAnimationRef.current) cancelAnimationFrame(breathAnimationRef.current)
          if (actionAnimationRef.current) cancelAnimationFrame(actionAnimationRef.current)
          if (idleTimerRef.current) clearInterval(idleTimerRef.current)
          if (model && typeof model.destroy === 'function') {
            model.destroy()
          }
        }
      } catch (err) {
        console.error('[Live2D] 模型加载失败:', err)
        console.error('[Live2D] 模型路径:', modelPath)
        console.error('[Live2D] 错误详情:', err instanceof Error ? err.message : String(err))
        if (err instanceof Error && err.stack) {
          console.error('[Live2D] 堆栈:', err.stack)
        }
        if (!destroyed) setStatus('error')
      }
    }

    const cleanupPromise = init()

    return () => {
      destroyed = true
      cleanupPromise?.then((cleanup) => {
        if (typeof cleanup === 'function') cleanup()
      })

      const app = appRef.current as { destroy?: () => void; view?: Node } | null
      if (app?.view && containerRef.current?.contains(app.view)) {
        containerRef.current.removeChild(app.view)
      }
      if (app?.destroy) {
        app.destroy()
      }
      appRef.current = null
      modelRef.current = null
      expressionMapRef.current = {}
      universalExpMapRef.current = {}
      userExpMapRef.current = {}
      if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current)
      if (breathAnimationRef.current) cancelAnimationFrame(breathAnimationRef.current)
      if (actionAnimationRef.current) cancelAnimationFrame(actionAnimationRef.current)
      if (idleTimerRef.current) clearInterval(idleTimerRef.current)
    }
    // characterId 加入依赖：切换角色时强制重建模型实例，确保角色隔离
  }, [modelPath, characterId])

  useEffect(() => {
    if (!characterId) {
      userExpMapRef.current = {}
      return
    }
    const charConfig = loadExpressionMapping(characterId)
    userExpMapRef.current = charConfig.mapping
    if (Object.keys(charConfig.mapping).length > 0) {
      console.log('[Live2D] 角色表情映射已重新加载:', characterId, charConfig.mapping)
    }
  }, [characterId])

  const onModelClickRef = useRef(onModelClick)
  useEffect(() => {
    onModelClickRef.current = onModelClick
  }, [onModelClick])

  return (
    <div className={`relative w-full h-full ${className}`}>
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ minHeight: '200px' }}
      />

      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-primary-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400 dark:text-gray-500">
              模型加载中...
            </p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              模型加载失败
            </p>
          </div>
        </div>
      )}
    </div>
  )
})

export default Live2DViewer