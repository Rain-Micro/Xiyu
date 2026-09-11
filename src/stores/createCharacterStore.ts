import { create } from 'zustand'

// ─── 类型定义 ───────────────────────────────────────────────────────────────

export interface CharacterFormData {
  // 区块一：基本信息
  name: string
  age: string
  birthday: string
  gender: string

  // 区块二：相处设定
  relationship: string
  relationshipCustom: string
  userTitle: string
  userNote: string
  anniversary: string

  // 区块三：喜好与性格
  likedFoods: string[]
  dislikedFoods: string[]
  hobbies: string[]
  dislikedThings: string[]
  personalityTraits: string[]

  // 区块四：对话与行为
  characterSayings: string[]
  greeting: string
  userDislikes: string[]
  oocBehaviors: string[]

  // 区块五：声音设置
  voiceEnabled: boolean
  voiceId: string
  voiceSpeed: number
  voicePitch: number
  voiceVolume: number
}

type TagField = keyof Pick<
  CharacterFormData,
  | 'likedFoods'
  | 'dislikedFoods'
  | 'hobbies'
  | 'dislikedThings'
  | 'personalityTraits'
  | 'characterSayings'
  | 'userDislikes'
  | 'oocBehaviors'
>

interface CreateCharacterState {
  formData: CharacterFormData
  undoStack: CharacterFormData[]
  redoStack: CharacterFormData[]

  // 表单更新
  updateField: <K extends keyof CharacterFormData>(
    field: K,
    value: CharacterFormData[K],
  ) => void
  addTagItem: (field: TagField, item: string) => void
  removeTagItem: (field: TagField, index: number) => void

  // 撤回 / 回退
  undo: () => CharacterFormData | null
  redo: () => CharacterFormData | null
  canUndo: () => boolean
  canRedo: () => boolean

  // 导入
  importData: (importedData: Partial<CharacterFormData>) => void
  getImportUndoState: () => CharacterFormData | null

  // 重置
  resetForm: () => void

  // 直接设置表单数据（用于编辑模式加载，不影响 undo 栈）
  setFormData: (data: CharacterFormData) => void

  // 判断是否有填写内容
  hasContent: () => boolean

  // ── 内部状态（不暴露给组件层） ──
  _preImportState: CharacterFormData | null
}

// ─── 初始数据 ────────────────────────────────────────────────────────────────

const initialFormData: CharacterFormData = {
  name: '',
  age: '',
  birthday: '',
  gender: '',
  relationship: '',
  relationshipCustom: '',
  userTitle: '',
  userNote: '',
  anniversary: '',
  likedFoods: [],
  dislikedFoods: [],
  hobbies: [],
  dislikedThings: [],
  personalityTraits: [],
  characterSayings: [],
  greeting: '',
  userDislikes: [],
  oocBehaviors: [],
  voiceEnabled: false,
  voiceId: 'x5_lingyuzhao_flow',
  voiceSpeed: 50,
  voicePitch: 55,
  voiceVolume: 70,
}

// ─── 深拷贝工具 ────────────────────────────────────────────────────────────

const deepCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value))

// ─── Store ──────────────────────────────────────────────────────────────────

export const useCreateCharacterStore = create<CreateCharacterState>()((set, get) => ({
  formData: deepCopy(initialFormData),
  undoStack: [],
  redoStack: [],
  _preImportState: null,

  // ── 表单更新 ─────────────────────────────────────────────────────────────

  updateField: (field, value) => {
    set((state) => ({
      undoStack: [...state.undoStack, deepCopy(state.formData)],
      redoStack: [],
      _preImportState: null,
      formData: { ...state.formData, [field]: value },
    }))
  },

  addTagItem: (field, item) => {
    set((state) => {
      const currentArray = [...state.formData[field]]
      return {
        undoStack: [...state.undoStack, deepCopy(state.formData)],
        redoStack: [],
        _preImportState: null,
        formData: { ...state.formData, [field]: [...currentArray, item] },
      }
    })
  },

  removeTagItem: (field, index) => {
    set((state) => {
      const currentArray = [...state.formData[field]]
      currentArray.splice(index, 1)
      return {
        undoStack: [...state.undoStack, deepCopy(state.formData)],
        redoStack: [],
        _preImportState: null,
        formData: { ...state.formData, [field]: currentArray },
      }
    })
  },

  // ── 撤回 / 回退 ──────────────────────────────────────────────────────────

  undo: () => {
    const state = get()

    // 特殊情况：上一次操作是导入，需要组件层弹出确认框
    // 组件层应先调用 getImportUndoState() 判断是否存在，存在则弹窗确认后再调用 undo
    if (state._preImportState) {
      const preImportData = deepCopy(state._preImportState)
      set({
        formData: preImportData,
        redoStack: [...state.redoStack, deepCopy(state.formData)],
        _preImportState: null,
      })
      return preImportData
    }

    if (state.undoStack.length === 0) return null

    const newUndoStack = [...state.undoStack]
    const popped = newUndoStack.pop()!
    set({
      formData: deepCopy(popped),
      undoStack: newUndoStack,
      redoStack: [...state.redoStack, deepCopy(state.formData)],
    })
    return deepCopy(popped)
  },

  redo: () => {
    const state = get()

    if (state.redoStack.length === 0) return null

    const newRedoStack = [...state.redoStack]
    const popped = newRedoStack.pop()!
    set({
      formData: deepCopy(popped),
      redoStack: newRedoStack,
      undoStack: [...state.undoStack, deepCopy(state.formData)],
    })
    return deepCopy(popped)
  },

  canUndo: () => {
    const state = get()
    return state.undoStack.length > 0 || state._preImportState !== null
  },

  canRedo: () => {
    const state = get()
    return state.redoStack.length > 0
  },

  // ── 导入 ──────────────────────────────────────────────────────────────────

  importData: (importedData) => {
    set((state) => ({
      _preImportState: deepCopy(state.formData),
      formData: { ...state.formData, ...importedData },
    }))
  },

  getImportUndoState: () => {
    return get()._preImportState ? deepCopy(get()._preImportState) : null
  },

  // ── 重置 ──────────────────────────────────────────────────────────────────

  resetForm: () => {
    set({
      formData: deepCopy(initialFormData),
      undoStack: [],
      redoStack: [],
      _preImportState: null,
    })
  },

  // ── 直接设置表单数据（编辑模式） ──────────────────────────────────────────

  setFormData: (data) => {
    set({
      formData: deepCopy(data),
      undoStack: [],
      redoStack: [],
      _preImportState: null,
    })
  },

  // ── 判断是否有填写内容 ─────────────────────────────────────────────────────

  hasContent: () => {
    const { formData } = get()

    // 检查字符串字段
    const stringFields: Array<keyof CharacterFormData> = [
      'name',
      'age',
      'birthday',
      'gender',
      'relationship',
      'relationshipCustom',
      'userTitle',
      'userNote',
      'anniversary',
      'greeting',
    ]
    for (const field of stringFields) {
      if (formData[field] !== '') return true
    }

    // 检查数组字段
    const arrayFields: Array<keyof CharacterFormData> = [
      'likedFoods',
      'dislikedFoods',
      'hobbies',
      'dislikedThings',
      'personalityTraits',
      'characterSayings',
      'userDislikes',
      'oocBehaviors',
    ]
    for (const field of arrayFields) {
      if ((formData[field] as string[]).length > 0) return true
    }

    return false
  },
}))
