/**
 * 角色模型类型管理工具
 *
 * 用于在用户进入表情/动作设置前，记录该角色的模型类型（2D / 3D）。
 * - 首次进入时弹出选择弹窗，用户选择后保存
 * - 再次进入时读取已保存的类型，直接进入对应设置
 * - 当角色关联的模型文件被替换/重新导入时，重置类型配置
 * - 切换模型类型时，备份旧类型设置并尝试恢复新类型设置
 *
 * 存储格式（localStorage）:
 *   character_model_type_{characterId} = { type: '2d' | '3d', modelPath: string }
 *   expr_backup_{type}_{characterId} = 表情映射备份（JSON）
 *   action_backup_{type}_{characterId} = 动作映射备份（JSON）
 */

export type ModelTypeChoice = '2d' | '3d'

interface StoredModelType {
  type: ModelTypeChoice
  /** 保存时角色的模型文件路径/URL，用于检测模型是否被替换 */
  modelPath: string
}

function storageKey(characterId: string): string {
  return `character_model_type_${characterId}`
}

// ── 表情/动作映射的存储 key（与 expressionMapping.ts 保持一致） ──────────
const EXPR_MAPPING_PREFIX = 'live2d_expression_mapping_'
const ACTION_MAPPING_PREFIX = 'character_action_mapping_'

// ── 备份 key 前缀 ──────────────────────────────────────────────────────
const EXPR_BACKUP_PREFIX = 'expr_backup_'
const ACTION_BACKUP_PREFIX = 'action_backup_'

/**
 * 将当前表情/动作映射备份到指定模型类型的备份槽
 */
function backupSettingsForType(characterId: string, type: ModelTypeChoice): void {
  const exprData = localStorage.getItem(EXPR_MAPPING_PREFIX + characterId)
  if (exprData) {
    localStorage.setItem(EXPR_BACKUP_PREFIX + type + '_' + characterId, exprData)
  }

  const actionData = localStorage.getItem(ACTION_MAPPING_PREFIX + characterId)
  if (actionData) {
    localStorage.setItem(ACTION_BACKUP_PREFIX + type + '_' + characterId, actionData)
  }
}

/**
 * 从指定模型类型的备份槽恢复表情/动作映射
 * 如果该类型有备份 → 恢复到主存储
 * 如果该类型无备份 → 清空主存储（显示空白）
 */
function restoreSettingsForType(characterId: string, type: ModelTypeChoice): void {
  // 恢复表情映射
  const exprBackup = localStorage.getItem(EXPR_BACKUP_PREFIX + type + '_' + characterId)
  if (exprBackup) {
    localStorage.setItem(EXPR_MAPPING_PREFIX + characterId, exprBackup)
  } else {
    localStorage.removeItem(EXPR_MAPPING_PREFIX + characterId)
  }

  // 恢复动作映射
  const actionBackup = localStorage.getItem(ACTION_BACKUP_PREFIX + type + '_' + characterId)
  if (actionBackup) {
    localStorage.setItem(ACTION_MAPPING_PREFIX + characterId, actionBackup)
  } else {
    localStorage.removeItem(ACTION_MAPPING_PREFIX + characterId)
  }
}

/**
 * 清空当前表情/动作映射（主存储，不影响备份）
 */
function clearCurrentSettings(characterId: string): void {
  localStorage.removeItem(EXPR_MAPPING_PREFIX + characterId)
  localStorage.removeItem(ACTION_MAPPING_PREFIX + characterId)
}

/**
 * 获取角色已保存的模型类型。
 * 如果未保存、或模型路径已变更（模型被替换），返回 null。
 *
 * @param characterId 角色 ID
 * @param currentModelPath 当前角色的模型文件路径/URL
 * @returns 已保存的类型（'2d' | '3d'），或 null 表示需要重新询问
 */
export function getCharacterModelType(
  characterId: string,
  currentModelPath: string
): ModelTypeChoice | null {
  try {
    const raw = localStorage.getItem(storageKey(characterId))
    if (!raw) return null

    const stored: StoredModelType = JSON.parse(raw)
    // 模型路径变更 → 视为模型被替换，需重新询问
    if (stored.modelPath !== currentModelPath) {
      // 路径变更时，备份旧设置再重置
      backupSettingsForType(characterId, stored.type)
      clearCurrentSettings(characterId)
      localStorage.removeItem(storageKey(characterId))
      return null
    }
    return stored.type
  } catch {
    return null
  }
}

/**
 * 保存角色的模型类型选择
 *
 * 当模型类型发生变化时：
 * - 备份旧类型的表情/动作设置
 * - 尝试从备份恢复新类型的设置（如果之前使用过）
 * - 如果新类型没有备份，清空当前设置（显示空白）
 *
 * 当模型类型相同时：保留当前设置不变
 *
 * @param characterId 角色 ID
 * @param type 用户选择的模型类型
 * @param modelPath 当前角色的模型文件路径/URL
 */
export function setCharacterModelType(
  characterId: string,
  type: ModelTypeChoice,
  modelPath: string
): void {
  // 检查是否有已保存的旧类型
  try {
    const raw = localStorage.getItem(storageKey(characterId))
    if (raw) {
      const stored: StoredModelType = JSON.parse(raw)
      if (stored.type !== type) {
        // 类型切换：备份旧类型设置，恢复新类型设置
        backupSettingsForType(characterId, stored.type)
        restoreSettingsForType(characterId, type)
      }
      // 同类型：保留当前设置
    } else {
      // 无已保存类型（首次选择或导入后重新选择）
      // 尝试从备份恢复，如果没有备份则清空（显示空白）
      restoreSettingsForType(characterId, type)
    }
  } catch {
    // 读取失败，尝试恢复
    restoreSettingsForType(characterId, type)
  }

  const data: StoredModelType = { type, modelPath }
  localStorage.setItem(storageKey(characterId), JSON.stringify(data))
}

/**
 * 重置角色的模型类型配置（模型文件被替换/重新导入时调用）
 *
 * 重置前会备份当前类型的表情/动作设置，以便切换回来时恢复。
 * 同时清空当前主存储的表情/动作映射，确保新模型不会使用旧设置。
 *
 * @param characterId 角色 ID
 */
export function resetCharacterModelType(characterId: string): void {
  // 重置前：备份当前类型的设置
  try {
    const raw = localStorage.getItem(storageKey(characterId))
    if (raw) {
      const stored: StoredModelType = JSON.parse(raw)
      backupSettingsForType(characterId, stored.type)
    }
  } catch {
    // ignore
  }

  // 清空当前表情/动作映射（主存储）
  clearCurrentSettings(characterId)

  // 移除模型类型配置
  localStorage.removeItem(storageKey(characterId))
}

// ─── 正脸模式（每角色独立） ──────────────────────────────────────────────

const FACE_MODE_PREFIX = 'character_face_mode_'

export type FaceMode = 'auto' | 'front-only'

/**
 * 获取角色的正脸模式偏好
 * 优先读取角色独立配置，无配置时回退到全局默认
 *
 * @param characterId 角色 ID
 * @param globalDefault 全局默认值（来自 AppSettings）
 * @returns 'auto' | 'front-only'
 */
export function getCharacterFaceMode(
  characterId: string,
  globalDefault: FaceMode = 'auto'
): FaceMode {
  try {
    const raw = localStorage.getItem(FACE_MODE_PREFIX + characterId)
    if (raw === 'auto' || raw === 'front-only') return raw
    return globalDefault
  } catch {
    return globalDefault
  }
}

/**
 * 设置角色的正脸模式偏好（每角色独立）
 *
 * @param characterId 角色 ID
 * @param mode 'auto' | 'front-only'
 */
export function setCharacterFaceMode(
  characterId: string,
  mode: FaceMode
): void {
  localStorage.setItem(FACE_MODE_PREFIX + characterId, mode)
}
