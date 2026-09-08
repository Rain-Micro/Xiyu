import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { AlertTriangle } from 'lucide-react'

// ─── 通用表情适配：场景关键词映射（与 Live2D 共用同一套场景名） ──────────────

const EXPRESSION_SCENE_KEYWORDS: { scene: string; keywords: string[] }[] = [
  { scene: 'happy', keywords: ['smile', 'happy', 'joy', '开心', '高兴', '笑', '嬉しい', '楽しい', '笑顔', 'laugh', 'mouth_smile', 'mouth_happy'] },
  { scene: 'surprise', keywords: ['surprise', 'shock', 'amazed', '惊讶', '驚き', 'びっくり', 'wow', 'mouth_open', 'brow_up'] },
  { scene: 'angry', keywords: ['angry', 'mad', 'annoyed', '生气', '怒', '发火', '愤怒', '气愤', '恼火', '讨厌', '怒る', '腹立つ', 'rage', 'bothered', 'brow_down', 'mouth_angry'] },
  { scene: 'sad', keywords: ['sad', 'cry', 'upset', '伤心', '悲しい', '泣く', 'sorrow', 'mouth_sad'] },
  { scene: 'shy', keywords: ['shy', 'blush', 'embarrassed', '害羞', '照れ', '恥ずかしい', 'cheek'] },
  { scene: 'blink', keywords: ['blink', 'wink', 'まばたき', 'eye_close', 'eye_blink'] },
]

export type BodyAction = 'nod' | 'shake' | 'wave' | 'tilt'

// ─── 组件暴露给父组件的方法 ───────────────────────────────────────────────

export interface ThreeDViewerHandle {
  /** 通过场景名触发表情（仅 MorphTarget） */
  setExpression: (name: string) => void
  /** 触发随机表情 */
  setRandomExpression: () => void
  /** 重置表情 */
  resetExpression: () => void
  /** 触发肢体动作 */
  triggerAction: (action: BodyAction) => void
  /** 触发随机肢体动作 */
  triggerRandomAction: () => void
  /** 模型是否支持表情 */
  hasExpressions: () => boolean
  /** 获取模型能力描述 */
  getCapabilities: () => { hasMorphTargets: boolean; hasBones: boolean; expressionCount: number }
  /** 获取表情方案等级：'morph' | 'none' */
  getExpressionLevel: () => 'morph' | 'none'
  /** 获取模型在屏幕中的位置（用于悬浮框定位） */
  getModelScreenPosition: () => { x: number; y: number; width: number; height: number } | null
}

// ─── 类型定义 ─────────────────────────────────────────────────────────────

interface ThreeDViewerProps {
  /** 模型文件的 Object URL */
  url: string
  /** 原始文件名（用于判断格式） */
  fileName: string
  /** .mtl 材质文件的 Object URL（仅 .obj 格式使用） */
  mtlUrl?: string
  /** 容器 CSS 类名 */
  className?: string
  /** 点击模型回调 */
  onModelClick?: () => void
  /** 模型能力检测完成回调（骨骼/变形目标检测结果） */
  onCapabilitiesDetected?: (caps: { hasMorphTargets: boolean; hasBones: boolean; expressionLevel: 'morph' | 'none' }) => void
}

/** 加载超时时间（毫秒） */
const LOAD_TIMEOUT_MS = 10_000

// ─── 辅助类型 ─────────────────────────────────────────────────────────────

interface MorphTargetInfo {
  mesh: THREE.Mesh
  indices: number[]
  names: string[]
}

interface BoneInfo {
  head: THREE.Bone | null
  spine: THREE.Bone | null
  leftArm: THREE.Bone | null
  rightArm: THREE.Bone | null
}

interface ExpressionMapping {
  scene: string
  meshIndex: number
  morphIndex: number
  weight: number
}

// ─── 组件 ─────────────────────────────────────────────────────────────────

/**
 * Three.js 3D 模型展示组件
 *
 * 架构要点：
 * - 渲染器仅在 mount 时创建一次，整个生命周期复用
 * - 场景初始化与模型加载分离为两个独立 useEffect
 * - 异步加载使用 cancelledRef 防止竞态
 * - 10 秒超时保护，避免无限等待
 * - 动画循环 guard 防止空指针崩溃
 * - 表情仅通过 MorphTarget/BlendShape 触发，无骨骼模拟回退
 * - 无骨骼模型仅作静态展示（支持拖拽、旋转、缩放）
 */
const ThreeDViewer = forwardRef<ThreeDViewerHandle, ThreeDViewerProps>(
  function ThreeDViewer({ url, fileName, mtlUrl, className = '', onModelClick, onCapabilitiesDetected }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)

  // 场景数据（mount 时初始化，unmount 时销毁）
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    animationId: number
  } | null>(null)

  // 模型数据（加载后更新）
  const modelRef = useRef<THREE.Object3D | null>(null)
  const morphTargetsRef = useRef<MorphTargetInfo[]>([])
  const expressionMapRef = useRef<ExpressionMapping[]>([])
  const bonesRef = useRef<BoneInfo>({ head: null, spine: null, leftArm: null, rightArm: null })
  const actionAnimationRef = useRef<{ stop: () => void } | null>(null)

  // 表情方案等级：'morph'（变形目标） | 'none'（无表情能力）
  const expressionLevelRef = useRef<'morph' | 'none'>('none')
  // 平移边界（动态计算，基于模型尺寸）
  const panBoundaryRef = useRef<{ x: number; y: number }>({ x: 2.0, y: 2.0 })
  // 模型基础 Y 位置（动画用）
  const modelBaseYRef = useRef<number>(0)

  // 取消标志：模型加载 effect 重新执行时，取消上一次异步加载
  const cancelledRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // 保持 onModelClick 回调最新引用
  const onModelClickRef = useRef(onModelClick)
  useEffect(() => {
    onModelClickRef.current = onModelClick
  }, [onModelClick])

  // 保持 onCapabilitiesDetected 回调最新引用
  const onCapsRef = useRef(onCapabilitiesDetected)
  useEffect(() => {
    onCapsRef.current = onCapabilitiesDetected
  }, [onCapabilitiesDetected])

  // ─── 工具函数 ──────────────────────────────────────────────────────

  const getExtension = useCallback((name: string): string => {
    const lower = name.toLowerCase()
    if (lower.endsWith('.glb')) return 'glb'
    if (lower.endsWith('.gltf')) return 'gltf'
    return lower.split('.').pop() || ''
  }, [])

  const yieldMainThread = useCallback(
    () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    []
  )

  // ─── MorphTarget / BlendShape 扫描 ─────────────────────────────────

  /** 扫描模型中所有 Mesh 的 MorphTarget，构建表情映射 */
  function scanMorphTargets(model: THREE.Object3D) {
    const morphTargets: MorphTargetInfo[] = []
    const expressionMap: ExpressionMapping[] = []

    model.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        const geo = node.geometry
        if (geo instanceof THREE.BufferGeometry && geo.morphAttributes && geo.morphAttributes.position) {
          const morphNames = (node as THREE.Mesh & { morphTargetDictionary?: Record<string, number> }).morphTargetDictionary
            ? Object.keys((node as THREE.Mesh & { morphTargetDictionary?: Record<string, number> }).morphTargetDictionary!)
            : geo.morphAttributes.position.map((_, i) => `morph_${i}`)

          const indices: number[] = []
          morphNames.forEach((_, idx) => {
            indices.push(idx)
          })

          morphTargets.push({ mesh: node, indices, names: morphNames })

          // 匹配表情场景
          for (const { scene, keywords } of EXPRESSION_SCENE_KEYWORDS) {
            if (expressionMap.some((e) => e.scene === scene)) continue
            for (let mi = 0; mi < morphNames.length; mi++) {
              const lowerName = morphNames[mi].toLowerCase()
              if (keywords.some((kw) => lowerName.includes(kw.toLowerCase()))) {
                expressionMap.push({
                  scene,
                  meshIndex: morphTargets.length - 1,
                  morphIndex: mi,
                  weight: 1.0,
                })
                break
              }
            }
          }
        }
      }
    })

    return { morphTargets, expressionMap }
  }

  // ─── 骨骼扫描（用于无 MorphTarget 时的表情模拟） ───────────────────

  function scanBones(model: THREE.Object3D): BoneInfo {
    const bones: BoneInfo = { head: null, spine: null, leftArm: null, rightArm: null }
    model.traverse((node) => {
      if (node instanceof THREE.Bone) {
        const nameLower = node.name.toLowerCase()
        if (!bones.head && (nameLower.includes('head') || nameLower.includes('neck'))) {
          bones.head = node
        }
        if (!bones.spine && (nameLower.includes('spine') || nameLower.includes('chest'))) {
          bones.spine = node
        }
        if (!bones.leftArm && (nameLower.includes('leftarm') || nameLower.includes('arm_l') || nameLower.includes('upperarm_l'))) {
          bones.leftArm = node
        }
        if (!bones.rightArm && (nameLower.includes('rightarm') || nameLower.includes('arm_r') || nameLower.includes('upperarm_r'))) {
          bones.rightArm = node
        }
      }
    })
    return bones
  }

  // ─── 暴露方法给父组件 ──────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    setExpression: (name: string) => {
      const expressionMap = expressionMapRef.current
      const morphTargets = morphTargetsRef.current

      // 仅使用 MorphTarget 触发表情
      const found = expressionMap.find((e) => e.scene === name)
      if (found && morphTargets[found.meshIndex]) {
        const { mesh, indices } = morphTargets[found.meshIndex]
        // 先重置所有 morph 权重
        if (mesh.morphTargetInfluences) {
          for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
            mesh.morphTargetInfluences[i] = 0
          }
          // 设置目标表情
          mesh.morphTargetInfluences[indices[found.morphIndex]] = found.weight
          return
        }
      }

      // 静默跳过：模型不支持表情（无 MorphTarget），不触发任何兜底
    },

    setRandomExpression: () => {
      const expressionMap = expressionMapRef.current
      if (expressionMap.length > 0) {
        const random = expressionMap[Math.floor(Math.random() * expressionMap.length)]
        const handle = (ref as unknown as { current?: ThreeDViewerHandle }).current
        if (handle) handle.setExpression(random.scene)
      }
    },

    resetExpression: () => {
      const morphTargets = morphTargetsRef.current
      for (const { mesh } of morphTargets) {
        if (mesh.morphTargetInfluences) {
          for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
            mesh.morphTargetInfluences[i] = 0
          }
        }
      }
    },

    triggerAction: (action: BodyAction) => {
      // 停止上一个动作
      if (actionAnimationRef.current) actionAnimationRef.current.stop()

      const model = modelRef.current
      if (!model) return

      const bones = bonesRef.current
      // 无骨骼模型不触发肢体动作
      if (!bones.head && !bones.spine) return

      const targetBone = bones.head || bones.spine
      if (!targetBone) return

      // 保存原始旋转
      const origRot = { x: targetBone.rotation.x, y: targetBone.rotation.y, z: targetBone.rotation.z }

      const startTime = Date.now()
      const duration = 1200 // 1.2秒
      let cancelled = false

      const animate = () => {
        if (cancelled) return
        const elapsed = Date.now() - startTime
        const t = Math.min(elapsed / duration, 1)
        const wave = Math.sin(t * Math.PI * 6) * (1 - t) // 衰减摆动

        switch (action) {
          case 'nod': // 点头：绕X轴前后摆动
            targetBone.rotation.x = origRot.x + wave * 0.3
            break
          case 'shake': // 摇头：绕Y轴左右摆动
            targetBone.rotation.y = origRot.y + wave * 0.3
            break
          case 'wave': // 挥手：绕Z轴摆动（或手臂骨骼）
            if (bones.rightArm) {
              bones.rightArm.rotation.z = wave * 0.5
            } else if (bones.leftArm) {
              bones.leftArm.rotation.z = -wave * 0.5
            } else {
              targetBone.rotation.z = origRot.z + wave * 0.2
            }
            break
          case 'tilt': // 歪头：绕Z轴偏转
            targetBone.rotation.z = origRot.z + wave * 0.25
            break
        }

        if (t < 1) {
          requestAnimationFrame(animate)
        } else {
          // 恢复
          targetBone.rotation.set(origRot.x, origRot.y, origRot.z)
          if (bones.rightArm) bones.rightArm.rotation.z = 0
          if (bones.leftArm) bones.leftArm.rotation.z = 0
        }
      }

      actionAnimationRef.current = {
        stop: () => {
          cancelled = true
          targetBone.rotation.set(origRot.x, origRot.y, origRot.z)
          if (bones.rightArm) bones.rightArm.rotation.z = 0
          if (bones.leftArm) bones.leftArm.rotation.z = 0
        }
      }

      requestAnimationFrame(animate)
    },

    triggerRandomAction: () => {
      const actions: BodyAction[] = ['nod', 'shake', 'wave', 'tilt']
      const randomAction = actions[Math.floor(Math.random() * actions.length)]
      const handle = (ref as unknown as { current?: ThreeDViewerHandle }).current
      if (handle) handle.triggerAction(randomAction)
    },

    hasExpressions: () => {
      return expressionMapRef.current.length > 0
    },

    getCapabilities: () => ({
      hasMorphTargets: morphTargetsRef.current.length > 0,
      hasBones: bonesRef.current.head !== null,
      expressionCount: expressionMapRef.current.length,
    }),

    getExpressionLevel: () => expressionLevelRef.current,

    getModelScreenPosition: () => {
      const container = containerRef.current
      const data = sceneRef.current
      const model = modelRef.current
      if (!container || !data || !model) return null

      // 使用模型包围盒计算实际屏幕位置
      const box = new THREE.Box3().setFromObject(model)
      // 将 3D 包围盒投影到屏幕坐标
      const camera = data.camera
      const renderer = data.renderer
      const w = container.clientWidth
      const h = container.clientHeight

      // 包围盒的 8 个角点
      const corners = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z),
      ]

      // 投影到屏幕坐标
      let minX = Infinity, maxX = -Infinity
      let minY = Infinity, maxY = -Infinity
      for (const corner of corners) {
        const projected = corner.clone().project(camera)
        const sx = (projected.x * 0.5 + 0.5) * w
        const sy = (-projected.y * 0.5 + 0.5) * h
        minX = Math.min(minX, sx)
        maxX = Math.max(maxX, sx)
        minY = Math.min(minY, sy)
        maxY = Math.max(maxY, sy)
      }

      void renderer // unused but kept for potential future use
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    },
  }), [])

  // ─── Effect 1: 场景初始化（仅 mount 时执行一次） ──────────────────

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // 防止容器零尺寸导致 NaN
    const width = container.clientWidth || 300
    const height = container.clientHeight || 300

    // 渲染器（仅创建一次）
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    container.appendChild(renderer.domElement)

    // 场景
    const scene = new THREE.Scene()

    // 相机
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    camera.position.set(0, 1, 5)

    // 控制器
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.1
    controls.minDistance = 1
    controls.maxDistance = 20
    controls.target.set(0, 0, 0)
    // 启用平移：左键拖拽平移模型，右键拖拽旋转
    controls.enablePan = true
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,      // 左键拖拽：平移
      MIDDLE: THREE.MOUSE.DOLLY,  // 中键/滚轮：缩放
      RIGHT: THREE.MOUSE.ROTATE,  // 右键拖拽：旋转
    }

    // 平移边界限制：模型不可移出容器边界（保留 80% 可见区域）
    // 使用 ref 存储边界值，模型加载后动态更新
    controls.addEventListener('change', () => {
      const boundary = panBoundaryRef.current
      // 限制 target 位置，防止模型移出可视区域
      controls.target.x = Math.max(-boundary.x, Math.min(boundary.x, controls.target.x))
      controls.target.y = Math.max(-boundary.y, Math.min(boundary.y, controls.target.y))
      controls.target.z = 0 // Z 轴不允许偏移
    })

    // 光照
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.0)
    dirLight1.position.set(5, 10, 7)
    scene.add(dirLight1)

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5)
    dirLight2.position.set(-5, 5, -5)
    scene.add(dirLight2)

    // 动画循环（guard 防止 null 崩溃）
    let animationId = 0
    const animate = () => {
      const data = sceneRef.current
      if (!data) return // 组件已卸载，停止循环

      // 页面不可见时跳过渲染（保留调度），避免后台空转占 CPU/GPU
      if (!document.hidden) {
        data.controls.update()
        data.renderer.render(data.scene, data.camera)
      }
      animationId = requestAnimationFrame(animate)
      data.animationId = animationId
    }

    sceneRef.current = { renderer, scene, camera, controls, animationId: 0 }
    animate()

    // 点击事件
    const onClick = () => {
      onModelClickRef.current?.()
    }
    renderer.domElement.addEventListener('click', onClick)

    // 清理：仅在组件卸载时执行
    return () => {
      cancelAnimationFrame(animationId)
      renderer.domElement.removeEventListener('click', onClick)
      // 释放场景中的模型资源
      scene.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry?.dispose()
          const mat = node.material
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose())
          } else {
            mat?.dispose()
          }
        }
      })
      renderer.dispose()
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
      sceneRef.current = null
    }
  }, [])

  // ─── Effect 2: 模型加载（url / fileName / mtlUrl 变化时执行） ─────

  useEffect(() => {
    cancelledRef.current = false
    const ext = getExtension(fileName)

    // 超时定时器
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const load = async () => {
      const sceneData = sceneRef.current
      if (!sceneData) return

      // 清理旧模型（保留灯光）
      const { scene } = sceneData
      const toRemove: THREE.Object3D[] = []
      scene.children.forEach((child) => {
        if (!(child instanceof THREE.AmbientLight) && !(child instanceof THREE.DirectionalLight)) {
          toRemove.push(child)
        }
      })
      toRemove.forEach((child) => {
        scene.remove(child)
        child.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.geometry?.dispose()
            const mat = node.material
            if (Array.isArray(mat)) {
              mat.forEach((m) => m.dispose())
            } else {
              mat?.dispose()
            }
          }
        })
      })

      // 重置状态
      modelRef.current = null
      morphTargetsRef.current = []
      expressionMapRef.current = []
      bonesRef.current = { head: null, spine: null, leftArm: null, rightArm: null }
      expressionLevelRef.current = 'none'

      setLoading(true)
      setProgress(0)
      setError(null)

      // 让出主线程，确保加载状态先渲染
      await yieldMainThread()
      if (cancelledRef.current) return

      // 进度管理
      const manager = new THREE.LoadingManager()
      manager.onProgress = (_u, loaded, total) => {
        if (cancelledRef.current) return
        setProgress(total > 0 ? Math.round((loaded / total) * 100) : 0)
      }

      // 超时保护
      timeoutId = setTimeout(() => {
        if (cancelledRef.current) return
        setError('加载超时，请重试')
        setLoading(false)
        setProgress(0)
      }, LOAD_TIMEOUT_MS)

      try {
        let model: THREE.Object3D

        switch (ext) {
          case 'obj': {
            if (mtlUrl) {
              const mtlLoader = new MTLLoader(manager)
              const materials = await mtlLoader.loadAsync(mtlUrl)
              if (cancelledRef.current) return
              materials.preload()
              await yieldMainThread()
              if (cancelledRef.current) return

              const objLoader = new OBJLoader(manager)
              objLoader.setMaterials(materials)
              model = await objLoader.loadAsync(url)
            } else {
              const objLoader = new OBJLoader(manager)
              model = await objLoader.loadAsync(url)
            }
            break
          }
          case 'fbx': {
            const loader = new FBXLoader(manager)
            model = await loader.loadAsync(url)
            break
          }
          case 'glb':
          case 'gltf': {
            const loader = new GLTFLoader(manager)
            const result = await loader.loadAsync(url)
            model = result.scene
            break
          }
          default:
            throw new Error(`不支持的文件格式: .${ext}`)
        }

        if (cancelledRef.current) return

        // 让出主线程后做后处理
        await yieldMainThread()
        if (cancelledRef.current) return

        // 优化：计算缺失的法线
        model.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            const geo = node.geometry
            if (geo instanceof THREE.BufferGeometry && !geo.attributes.normal) {
              geo.computeVertexNormals()
            }
          }
        })

        // 居中并适配容器
        const box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        const scale = maxDim > 0 ? 2.5 / maxDim : 1
        model.scale.set(scale, scale, scale)
        model.position.set(-center.x * scale, -center.y * scale, -center.z * scale)

        // ── 扫描 MorphTarget（用于表情） ──────────────────────────────
        const { morphTargets, expressionMap } = scanMorphTargets(model)
        morphTargetsRef.current = morphTargets
        expressionMapRef.current = expressionMap

        // ── 扫描骨骼（仅用于肢体动作，不用于表情） ───────────────────
        const bones = scanBones(model)
        const hasBones = bones.head !== null || bones.spine !== null
        bonesRef.current = bones

        // ── 计算平移边界（模型尺寸的 40%，即保留 80% 可见） ───────────
        const panBox = new THREE.Box3().setFromObject(model)
        const panSize = panBox.getSize(new THREE.Vector3())
        panBoundaryRef.current = {
          x: Math.max(0.5, panSize.x * 0.4),
          y: Math.max(0.5, panSize.y * 0.4),
        }

        // ── 记录模型基础 Y 位置 ──────────────────────────────────────
        modelBaseYRef.current = model.position.y

        // ── 确定表情方案等级 ─────────────────────────────────────────
        // 仅 MorphTarget 支持表情，无骨骼模拟回退
        const expressionLevel: 'morph' | 'none' =
          morphTargets.length > 0 && expressionMap.length > 0 ? 'morph' : 'none'
        expressionLevelRef.current = expressionLevel

        // 通知父组件检测结果
        onCapsRef.current?.({
          hasMorphTargets: morphTargets.length > 0,
          hasBones,
          expressionLevel,
        })

        // 添加到场景
        const current = sceneRef.current
        if (current && !cancelledRef.current) {
          current.scene.add(model)
          modelRef.current = model
          setLoading(false)
          setProgress(100)
        }
      } catch (err: any) {
        if (cancelledRef.current) return
        console.error('[ThreeD] 模型加载失败:', err)
        setError(`模型加载失败: ${err.message || '未知错误'}`)
        setLoading(false)
        setProgress(0)
      } finally {
        if (timeoutId) clearTimeout(timeoutId)
      }
    }

    load()

    // 清理：取消正在进行的异步加载
    return () => {
      cancelledRef.current = true
      if (timeoutId) clearTimeout(timeoutId)
      if (actionAnimationRef.current) actionAnimationRef.current.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, fileName, mtlUrl])

  // ─── Effect 3: 容器尺寸变化 ──────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const data = sceneRef.current
      if (!data) return
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          data.renderer.setSize(width, height)
          data.camera.aspect = width / height
          data.camera.updateProjectionMatrix()
        }
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // ─── 渲染 ─────────────────────────────────────────────────────────

  return (
    <div className={`relative w-full h-full ${className}`}>
      <div ref={containerRef} className="absolute inset-0" />

      {/* 加载状态 + 进度条 */}
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10 dark:bg-black/20 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 w-48">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              模型加载中 {progress}%
            </span>
            <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10 dark:bg-black/20">
          <div className="flex flex-col items-center gap-3 px-4 py-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg max-w-[220px] text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300">{error}</p>
          </div>
        </div>
      )}
    </div>
  )
})

export default ThreeDViewer
