/**
 * 表情映射持久化工具
 * 支持按角色存储 Live2D 表情映射配置
 */

/** 默认表情场景列表（用户可配置的标准表情） */
export const DEFAULT_EXPRESSION_SCENES = [
  { scene: 'happy', label: '微笑', keywords: ['笑顔', 'smile', 'happy'] },
  { scene: 'surprise', label: '惊讶', keywords: ['驚き', 'surprise'] },
  { scene: 'angry', label: '生气', keywords: ['怒る', 'angry'] },
  { scene: 'shy', label: '害羞', keywords: ['照れ', 'shy'] },
  { scene: 'sweat', label: '紧张', keywords: ['汗', 'sweat'] },
  { scene: 'heart', label: '爱心眼', keywords: ['ハート目', 'heart'] },
  { scene: 'star', label: '星星眼', keywords: ['スター目', 'star'] },
  { scene: 'default', label: '默认表情', keywords: ['笑顔', 'smile', 'idle'] },
] as const

/** 自定义表情条目类型 */
export interface CustomExpressionEntry {
  scene: string
  label: string
  expressionName: string
  fileName?: string  // 用户选择的本地 .exp3.json 文件名
}

/** 完整的表情映射配置 */
export interface ExpressionMappingConfig {
  /** 场景名 -> 模型表情名 */
  mapping: Record<string, string>
  /** 自定义表情条目 */
  customEntries: CustomExpressionEntry[]
  /** 场景名 -> 本地文件名（用户选择的 .exp3.json 文件） */
  fileMapping?: Record<string, string>
}

/** localStorage key 前缀 */
const MAPPING_KEY_PREFIX = 'live2d_expression_mapping_'
const FIRST_IMPORT_KEY_PREFIX = 'live2d_first_import_done_'

/** 加载角色的表情映射 */
export function loadExpressionMapping(characterId: string): ExpressionMappingConfig {
  try {
    const raw = localStorage.getItem(MAPPING_KEY_PREFIX + characterId)
    if (!raw) return { mapping: {}, customEntries: [], fileMapping: {} }
    const parsed = JSON.parse(raw)
    return {
      mapping: parsed.mapping || {},
      customEntries: parsed.customEntries || [],
      fileMapping: parsed.fileMapping || {},
    }
  } catch {
    return { mapping: {}, customEntries: [], fileMapping: {} }
  }
}

/** 保存角色的表情映射 */
export function saveExpressionMapping(characterId: string, config: ExpressionMappingConfig): void {
  try {
    localStorage.setItem(MAPPING_KEY_PREFIX + characterId, JSON.stringify(config))
    console.log(`[ExpressionMapping] 已保存角色 ${characterId} 的表情映射`)
  } catch (err) {
    console.error('[ExpressionMapping] 保存失败:', err)
  }
}

/** 检查是否已完成首次导入 */
export function isFirstImportDone(characterId: string): boolean {
  return localStorage.getItem(FIRST_IMPORT_KEY_PREFIX + characterId) === '1'
}

/** 标记首次导入已完成 */
export function setFirstImportDone(characterId: string): void {
  localStorage.setItem(FIRST_IMPORT_KEY_PREFIX + characterId, '1')
}

/** 模型内置表情信息 */
export interface ModelExpressionInfo {
  Name: string
  File: string
}

/**
 * 从 model3.json 加载模型内置表情列表
 * 支持多种来源：model3.json 的 FileReferences.Expressions、vtube.json 的 Hotkeys
 * @param modelPath model3.json 的路径（如 /models/006/006rikai.model3.json）
 */
export async function loadModelExpressions(modelPath: string): Promise<ModelExpressionInfo[]> {
  // 模型路径为空时直接返回，避免无效 fetch 产生控制台错误
  if (!modelPath || typeof modelPath !== 'string') {
    console.log('[ExpressionMapping] modelPath 为空，跳过加载模型表情')
    return []
  }

  const results: ModelExpressionInfo[] = []
  const seenFiles = new Set<string>()

  // 1. 尝试从 model3.json 的 FileReferences.Expressions 读取
  try {
    const resp = await fetch(modelPath)
    if (resp.ok) {
      const contentType = resp.headers.get('content-type') || ''
      // 排除 SPA fallback 返回的 HTML 页面
      if (contentType.includes('text/html')) {
        console.log('[ExpressionMapping] model3.json 返回 HTML（SPA fallback），跳过')
      } else {
        const config = await resp.json()
        const expressions = config?.FileReferences?.Expressions
        if (Array.isArray(expressions)) {
          for (const e of expressions) {
            if (e?.Name && e?.File && !seenFiles.has(e.File)) {
              results.push({ Name: e.Name, File: e.File })
              seenFiles.add(e.File)
            }
          }
        }
        console.log(`[ExpressionMapping] model3.json 读取到 ${results.length} 个表情`)
      }
    } else {
      console.log('[ExpressionMapping] model3.json 加载失败:', resp.status)
    }
  } catch (err) {
    console.log('[ExpressionMapping] model3.json 读取异常:', err)
  }

  // 2. 如果 model3.json 没有表情，尝试从同目录的 vtube.json 读取
  if (results.length === 0) {
    try {
      const dir = modelPath.substring(0, modelPath.lastIndexOf('/'))
      // 尝试两种 vtube.json 路径：与 model3.json 同名 和 目录下的 .vtube.json
      const baseName = modelPath.substring(modelPath.lastIndexOf('/') + 1).replace(/\.model3\.json$/i, '')
      const vtubeCandidates = [
        `${dir}/${baseName}.vtube.json`,
        `${dir}/.vtube.json`,
      ]
      for (const vtubePath of vtubeCandidates) {
        const vtubeResp = await fetch(vtubePath)
        if (!vtubeResp.ok) continue
        const contentType = vtubeResp.headers.get('content-type') || ''
        if (contentType.includes('text/html')) continue
        const vtubeConfig = await vtubeResp.json()
        // 从 Hotkeys 中提取 ToggleExpression 条目
        const hotkeys = vtubeConfig?.Hotkeys
        if (Array.isArray(hotkeys)) {
          for (const hk of hotkeys) {
            if (hk?.Type === 'ToggleExpression' && hk?.Setting?.ExpressionName) {
              const expName = hk.Setting.ExpressionName
              // 尝试推断 .exp3.json 文件名
              const fileName = `${expName}.exp3.json`
              if (!seenFiles.has(fileName)) {
                results.push({ Name: expName, File: fileName })
                seenFiles.add(fileName)
              }
            }
          }
          console.log(`[ExpressionMapping] vtube.json 读取到 ${results.length} 个表情`)
        }
        // 也检查 SavedModelPosition 中的 expression 相关配置
        const savedModel = vtubeConfig?.SavedModelPosition
        if (savedModel && Array.isArray(savedModel.Expression)) {
          for (const exp of savedModel.Expression) {
            if (exp?.Name && exp?.File && !seenFiles.has(exp.File)) {
              results.push({ Name: exp.Name, File: exp.File })
              seenFiles.add(exp.File)
            }
          }
        }
        if (results.length > 0) break
      }
    } catch (err) {
      console.log('[ExpressionMapping] vtube.json 读取失败:', err)
    }
  }

  // 3. 如果仍然没有表情，尝试从 model3.json 的 FileReferences 中推断
  if (results.length === 0) {
    try {
      const resp = await fetch(modelPath)
      if (resp.ok) {
        const contentType = resp.headers.get('content-type') || ''
        if (!contentType.includes('text/html')) {
          const config = await resp.json()
          // 检查 FileReferences 中是否有其他引用表情的位置
          const fileRefs = config?.FileReferences || {}
          // 有些模型把表情放在 Groups 里
          const groups = fileRefs?.Groups
          if (Array.isArray(groups)) {
            for (const g of groups) {
              if (g?.Name?.toLowerCase().includes('expression') && Array.isArray(g?.FileReferences)) {
                for (const fr of g.FileReferences) {
                  if (fr?.File && !seenFiles.has(fr.File)) {
                    results.push({ Name: fr.Name || fr.File, File: fr.File })
                    seenFiles.add(fr.File)
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  console.log(`[ExpressionMapping] 最终获取到 ${results.length} 个表情文件`)
  return results
}

/**
 * 扫描模型目录中的 .exp3.json 文件
 * 通过尝试 fetch 常见表情文件名来发现文件
 * @param modelPath model3.json 的路径
 * @param knownNames 已知的表情名称列表（用于推断文件名）
 */
export async function scanExpressionFiles(
  modelPath: string,
  knownNames: string[] = []
): Promise<ModelExpressionInfo[]> {
  // 模型路径为空时直接返回，避免无效 fetch 产生控制台错误
  if (!modelPath || typeof modelPath !== 'string' || !modelPath.includes('/')) {
    return []
  }

  const results: ModelExpressionInfo[] = []
  const dir = modelPath.substring(0, modelPath.lastIndexOf('/'))

  // 常见表情名称（英文 + 日文）
  const commonNames = [
    ...knownNames,
    'Smile', 'Surprise', 'Angry', 'Sad', 'Shy', 'Blink',
    'smile', 'surprise', 'angry', 'sad', 'shy', 'blink',
    '笑顔', '驚き', '怒る', '悲しい', '照れ', '汗', 'ハート目', 'スター目',
    'default', 'Default', 'idle', 'Idle',
  ]

  for (const name of commonNames) {
    const fileName = `${name}.exp3.json`
    const filePath = `${dir}/${fileName}`
    try {
      const resp = await fetch(filePath, { method: 'HEAD' })
      if (resp.ok) {
        results.push({ Name: name, File: fileName })
      }
    } catch {
      // ignore
    }
  }

  return results
}

/**
 * 检测文件格式一致性
 * @param files 文件列表
 * @returns 不一致的文件名列表，空数组表示一致
 */
export function checkFileFormatConsistency(files: File[]): string[] {
  const live2dExts = ['.vtube.json', '.model3.json', '.moc3']
  const threeDExts = ['.obj', '.fbx', '.glb', '.gltf', '.stl', '.ply']
  
  let live2dCount = 0
  let threeDCount = 0
  const inconsistent: string[] = []
  
  for (const file of files) {
    const lower = file.name.toLowerCase()
    const isLive2d = live2dExts.some(ext => lower.endsWith(ext))
    const is3D = threeDExts.some(ext => lower.endsWith(ext))
    
    if (isLive2d) live2dCount++
    else if (is3D) threeDCount++
  }
  
  // 如果大多数是 Live2D，检查混入的 3D 文件
  if (live2dCount > 0 && threeDCount > 0) {
    const majority = live2dCount >= threeDCount ? 'live2d' : '3d'
    const minorityExts = majority === 'live2d' ? threeDExts : live2dExts
    
    for (const file of files) {
      const lower = file.name.toLowerCase()
      if (minorityExts.some(ext => lower.endsWith(ext))) {
        inconsistent.push(file.name)
      }
    }
  }
  
  return inconsistent
}

// ─── 动作映射相关 ─────────────────────────────────────────────────────────

/** 默认动作场景列表 */
export const DEFAULT_ACTION_SCENES = [
  { action: 'greet', label: '打招呼' },
  { action: 'nod', label: '点头' },
  { action: 'wave', label: '挥手' },
  { action: 'think', label: '思考' },
  { action: 'welcome', label: '欢迎' },
] as const

/** 自定义动作条目类型 */
export interface CustomActionEntry {
  action: string
  label: string
  fileName: string
}

/** 完整的动作映射配置 */
export interface ActionMappingConfig {
  /** 动作名 -> 文件名 */
  mapping: Record<string, string>
  /** 自定义动作条目 */
  customEntries: CustomActionEntry[]
}

/** 动作映射 localStorage key 前缀 */
const ACTION_MAPPING_KEY_PREFIX = 'character_action_mapping_'

/** 加载角色的动作映射 */
export function loadActionMapping(characterId: string): ActionMappingConfig {
  try {
    const raw = localStorage.getItem(ACTION_MAPPING_KEY_PREFIX + characterId)
    if (!raw) return { mapping: {}, customEntries: [] }
    const parsed = JSON.parse(raw)
    return {
      mapping: parsed.mapping || {},
      customEntries: parsed.customEntries || [],
    }
  } catch {
    return { mapping: {}, customEntries: [] }
  }
}

/** 保存角色的动作映射 */
export function saveActionMapping(characterId: string, config: ActionMappingConfig): void {
  try {
    localStorage.setItem(ACTION_MAPPING_KEY_PREFIX + characterId, JSON.stringify(config))
    console.log(`[ActionMapping] 已保存角色 ${characterId} 的动作映射`)
  } catch (err) {
    console.error('[ActionMapping] 保存失败:', err)
  }
}

/**
 * 从 model3.json 加载模型内置动作列表（Live2D motion3.json）
 * @param modelPath model3.json 的路径
 */
export async function loadModelActions(modelPath: string): Promise<Array<{ name: string; file: string }>> {
  try {
    const resp = await fetch(modelPath)
    if (!resp.ok) return []
    const config = await resp.json()
    const motions = config?.FileReferences?.Motions
    if (motions && typeof motions === 'object') {
      const result: Array<{ name: string; file: string }> = []
      for (const [group, motionList] of Object.entries(motions)) {
        if (Array.isArray(motionList)) {
          for (const m of motionList) {
            if (m?.File) {
              result.push({ name: `${group}/${m.Name || m.File}`, file: m.File })
            }
          }
        }
      }
      return result
    }
    return []
  } catch {
    return []
  }
}
