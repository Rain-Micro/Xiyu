import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, X, Mail, Loader2, ArrowLeft, Save, AlertTriangle, Play, Pause } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  useCreateCharacterStore,
  useAuthStore,
  useCharacterStore,
  useSettingsStore,
} from '@/stores'
import type { CharacterFormData } from '@/stores'
import {
  parseFileToText,
  parseTextToCharacterFields,
  isImageFile,
  getFieldLabel,
  fieldMappings,
} from '@/utils/fileParser'
import { formatDate, sanitizeDate } from '@/utils/dateFormat'
import { parseCharacterWithAI } from '@/services/characterImportAPI'

/* ──────────────────── TagInput 内联组件 ──────────────────── */

function TagInput({
  label,
  required,
  items,
  onAdd,
  onRemove,
}: {
  label: string
  required?: boolean
  items: string[]
  onAdd: (item: string) => void
  onRemove: (index: number) => void
}) {
  const [inputValue, setInputValue] = useState('')

  const handleAdd = () => {
    if (inputValue.trim()) {
      onAdd(inputValue.trim())
      setInputValue('')
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAdd()
            }
          }}
          className="input-field flex-1"
          placeholder={`输入后点击添加`}
        />
        <button onClick={handleAdd} className="btn-secondary whitespace-nowrap">
          添加
        </button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-sm"
            >
              {item}
              <button
                onClick={() => onRemove(i)}
                className="hover:text-red-500 ml-1"
                type="button"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ──────────────────── VoiceSettings 声音设置组件 ──────────────────── */

function VoiceSettings() {
  const { formData, updateField } = useCreateCharacterStore()
  const [voices, setVoices] = useState<{ name: string; id: string }[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const selectedVoice = formData.voiceId || 'x5_lingyuzhao_flow'
  const speed = formData.voiceSpeed ?? 50
  const pitch = formData.voicePitch ?? 55
  const volume = formData.voiceVolume ?? 70
  const voiceEnabled = formData.voiceEnabled ?? false

  useEffect(() => {
    fetch('http://localhost:3001/api/voice/voices')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.voices)) {
          setVoices(data.voices.map((v: { name: string; id: string }) => ({ name: v.name, id: v.id })))
        }
      })
      .catch(() => {
        setVoices([
          { name: '聆玉昭（温柔）', id: 'supernatural:x5_lingyuzhao_flow' },
          { name: '聆小璇（活泼）', id: 'supernatural:x6_lingxiaoxuan_pro' },
          { name: '聆飞逸（沉稳）', id: 'supernatural:x6_lingfeiyi_pro' },
          { name: '聆小玥（清甜）', id: 'supernatural:x6_lingxiaoyue_pro' },
          { name: '聆玉言（知性）', id: 'supernatural:x6_lingyuyan_pro' },
          { name: '小燕 (女)', id: 'iflytek:xiaoyan' },
          { name: '小宇 (男)', id: 'iflytek:xiaoyu' },
        ])
      })
  }, [])

  const handlePreview = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setIsPlaying(false)
      return
    }
    setIsLoading(true)
    try {
      const resp = await fetch('http://localhost:3001/api/voice/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: '你好，我是你的数字人角色，很高兴认识你！',
          voice: selectedVoice,
          speed,
          pitch,
          volume,
        }),
      })
      if (!resp.ok) throw new Error('合成失败')
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.addEventListener('ended', () => setIsPlaying(false))
      await audio.play()
      setIsPlaying(true)
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 声音开关 */}
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          启用自定义声音
        </label>
        <button
          type="button"
          onClick={() => updateField('voiceEnabled', !voiceEnabled)}
          className={`relative w-11 h-6 rounded-full transition-colors ${voiceEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${voiceEnabled ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      {voiceEnabled && (
        <>
          {/* 音色选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              音色
            </label>
            <select
              value={selectedVoice}
              onChange={(e) => updateField('voiceId', e.target.value)}
              className="input-field w-full"
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          {/* 语速 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              语速 <span className="text-gray-400">({speed})</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={speed}
              onChange={(e) => updateField('voiceSpeed', Number(e.target.value))}
              className="w-full accent-primary-500"
            />
          </div>

          {/* 音调 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              音调 <span className="text-gray-400">({pitch})</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={pitch}
              onChange={(e) => updateField('voicePitch', Number(e.target.value))}
              className="w-full accent-primary-500"
            />
          </div>

          {/* 音量 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              音量 <span className="text-gray-400">({volume})</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => updateField('voiceVolume', Number(e.target.value))}
              className="w-full accent-primary-500"
            />
          </div>

          {/* 试听按钮 */}
          <button
            type="button"
            onClick={handlePreview}
            disabled={isLoading}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                合成中...
              </>
            ) : isPlaying ? (
              <>
                <Pause className="w-4 h-4" />
                停止试听
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                试听效果
              </>
            )}
          </button>
        </>
      )}
    </div>
  )
}

/* ──────────────────── 主页面组件 ──────────────────── */

export default function CreateCharacterPage() {
  const navigate = useNavigate()
  const location = useLocation()

  // ── 编辑模式检测 ──
  const locationState = location.state as { characterId?: string; mode?: string } | null
  const isEditMode = locationState?.mode === 'edit' && !!locationState?.characterId
  const editCharacterId = locationState?.characterId || ''

  // Stores - 使用 createCharacterStore 中的 API
  const formData = useCreateCharacterStore((s) => s.formData)
  const updateField = useCreateCharacterStore((s) => s.updateField)
  const addTagItem = useCreateCharacterStore((s) => s.addTagItem)
  const removeTagItem = useCreateCharacterStore((s) => s.removeTagItem)
  const undo = useCreateCharacterStore((s) => s.undo)
  const redo = useCreateCharacterStore((s) => s.redo)
  const canUndo = useCreateCharacterStore((s) => s.canUndo)
  const canRedo = useCreateCharacterStore((s) => s.canRedo)
  const importData = useCreateCharacterStore((s) => s.importData)
  const getImportUndoState = useCreateCharacterStore((s) => s.getImportUndoState)
  const resetForm = useCreateCharacterStore((s) => s.resetForm)
  const hasContent = useCreateCharacterStore((s) => s.hasContent)
  const setFormData = useCreateCharacterStore((s) => s.setFormData)

  const addCharacter = useCharacterStore((s) => s.addCharacter)
  const setCurrentCharacter = useCharacterStore((s) => s.setCurrentCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const characters = useCharacterStore((s) => s.characters)
  const user = useAuthStore((s) => s.user)

  // ── 编辑模式状态 ──
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const isDataLoadedRef = useRef(false)
  const lastSavedDataRef = useRef<CharacterFormData | null>(null)
  const [showEditSaveSuccess, setShowEditSaveSuccess] = useState(false)

  // Local state
  const [activeTab, setActiveTab] = useState<'manual' | 'import'>('manual')
  const [errors, setErrors] = useState<Partial<Record<keyof CharacterFormData, boolean>>>({})
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>>({})

  // 弹窗状态
  const [showUndoConfirm, setShowUndoConfirm] = useState(false)
  const [showSaveDraftModal, setShowSaveDraftModal] = useState(false)
  const [showDraftNameModal, setShowDraftNameModal] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showImportConflict, setShowImportConflict] = useState<string[]>([])
  const [pendingImportData, setPendingImportData] = useState<Partial<CharacterFormData> | null>(null)

  // 提交角色选择弹窗（提交 / 保存至草稿箱）
  const [showSubmitChoice, setShowSubmitChoice] = useState(false)

  // 保存至草稿箱命名弹窗
  const [showSaveToDraftBoxModal, setShowSaveToDraftBoxModal] = useState(false)
  const [saveToDraftBoxName, setSaveToDraftBoxName] = useState('')

  // 草稿保存成功 Toast
  const [showDraftSavedToast, setShowDraftSavedToast] = useState(false)

  // 草稿命名
  const [draftName, setDraftName] = useState('')

  // 创建成功后双弹窗流程
  const [showJumpToChatPopup, setShowJumpToChatPopup] = useState(false)
  const [showJumpHintPopup, setShowJumpHintPopup] = useState(false)

  // 文件拖拽
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 文件解析状态
  const [isParsing, setIsParsing] = useState(false)
  const [parsingMessage, setParsingMessage] = useState('')
  const [parsedFileName, setParsedFileName] = useState('')
  const [showParsedPreview, setShowParsedPreview] = useState(false)
  const [editableParsedText, setEditableParsedText] = useState('')

  // 导入预览弹窗（字段匹配结果预览 / 手动修正）
  const [showImportPreview, setShowImportPreview] = useState(false)
  const [importPreviewData, setImportPreviewData] = useState<Record<string, unknown>>({})
  const [importPreviewUnmatched, setImportPreviewUnmatched] = useState('')
  const [editingImportField, setEditingImportField] = useState<string | null>(null)
  const [editingImportValue, setEditingImportValue] = useState('')
  const [isAiParsing, setIsAiParsing] = useState(false)
  const [assignTargetField, setAssignTargetField] = useState('')

  // 未保存内容恢复弹窗
  const [showRecoveryModal, setShowRecoveryModal] = useState(false)
  const [showRecoverySecondModal, setShowRecoverySecondModal] = useState(false)
  const [dontRemindAgain, setDontRemindAgain] = useState(false)
  const [unsavedDraftData, setUnsavedDraftData] = useState<CharacterFormData | null>(null)
  const isRecoveringRef = useRef(false)

  // 草稿箱弹窗
  const [showDraftBoxModal, setShowDraftBoxModal] = useState(false)
  const [drafts, setDrafts] = useState<Array<{ id: string; name: string; data: CharacterFormData; savedAt: number }>>([])
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)

  // 删除草稿确认弹窗
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null)

  // 初始化草稿默认名称
  useEffect(() => {
    const now = new Date()
    const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
    setDraftName(`chuang_jian_jue_se_01_${dateStr}`)
  }, [])

  // 组件 mount 时重置表单 + 检查未保存数据（编辑模式跳过）
  useEffect(() => {
    if (isEditMode) {
      // 编辑模式：加载角色数据到表单
      const character = characters.find((c) => c.id === editCharacterId)
      if (character && !isDataLoadedRef.current) {
        // 优先使用存储的完整 formData
        const loadedData: CharacterFormData = character.formData
          ? (character.formData as unknown as CharacterFormData)
          : {
              name: character.profile.name || '',
              age: character.profile.age?.toString() || '',
              birthday: character.profile.birthday || '',
              gender: character.profile.gender || '',
              relationship: '',
              relationshipCustom: '',
              userTitle: '',
              userNote: character.profile.background || '',
              anniversary: '',
              likedFoods: [],
              dislikedFoods: [],
              hobbies: character.profile.hobbies || [],
              dislikedThings: [],
              personalityTraits: character.profile.personality || [],
              characterSayings: [],
              greeting: character.profile.tone || '',
              userDislikes: [],
              oocBehaviors: [],
              // 声音设置默认值
              voiceEnabled: false,
              voiceId: 'x5_lingyuzhao_flow',
              voiceSpeed: 50,
              voicePitch: 55,
              voiceVolume: 70,
            }
        const deepCopyData = JSON.parse(JSON.stringify(loadedData)) as CharacterFormData
        setFormData(deepCopyData)
        lastSavedDataRef.current = deepCopyData
        isDataLoadedRef.current = true
      }
      return
    }

    // 创建模式：检查未保存草稿
    const rawUnsaved = localStorage.getItem('create_character_unsaved')
    let parsedUnsaved: CharacterFormData | null = null
    if (rawUnsaved) {
      try {
        parsedUnsaved = JSON.parse(rawUnsaved) as CharacterFormData
      } catch {
        /* ignore */
      }
    }

    const disabled = localStorage.getItem('create_character_draft_reminder_disabled')
    const hasUnsaved = parsedUnsaved !== null && Object.values(parsedUnsaved).some(
      (v) => (typeof v === 'string' && v !== '') || (Array.isArray(v) && v.length > 0)
    )

    if (hasUnsaved && disabled !== 'true') {
      setUnsavedDraftData(parsedUnsaved)
      isRecoveringRef.current = true
      resetForm()
      setShowRecoveryModal(true)
    } else {
      resetForm()
      if (!hasUnsaved) {
        localStorage.removeItem('create_character_unsaved')
      }
    }
  }, [resetForm, isEditMode, editCharacterId, characters, setFormData])

  // formData 变化时保存到 localStorage（恢复弹窗处理期间跳过；编辑模式跳过）
  useEffect(() => {
    if (isRecoveringRef.current) return
    if (isEditMode) return
    if (hasContent()) {
      localStorage.setItem('create_character_unsaved', JSON.stringify(formData))
    } else {
      localStorage.removeItem('create_character_unsaved')
    }
  }, [formData, hasContent, isEditMode])

  /* ──────────── 必填字段列表 ──────────── */
  const requiredFields: (keyof CharacterFormData)[] = [
    'name',
    'relationship',
    'userTitle',
  ]

  /* ──────────── 关系选项 ──────────── */
  const relationshipOptions = ['朋友', '家人', '伴侣', '知己', '同学', '同事', '邻居', '其他']

  /* ──────────── 注册字段 ref ──────────── */
  const registerFieldRef = useCallback(
    (key: string) => (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null) => {
      fieldRefs.current[key] = el
    },
    []
  )

  /* ──────────── 字段变更辅助 ──────────── */
  const handleFieldChange = useCallback(
    (key: keyof CharacterFormData, value: string) => {
      updateField(key, value)
      // 清除该字段的错误
      setErrors((prev) => ({ ...prev, [key]: false }))
    },
    [updateField]
  )

  /* ──────────── Tag 辅助 ──────────── */
  const handleTagAdd = useCallback(
    (field: 'likedFoods' | 'dislikedFoods' | 'hobbies' | 'dislikedThings' | 'personalityTraits' | 'characterSayings' | 'userDislikes' | 'oocBehaviors') => (item: string) => {
      addTagItem(field, item)
    },
    [addTagItem]
  )

  const handleTagRemove = useCallback(
    (field: 'likedFoods' | 'dislikedFoods' | 'hobbies' | 'dislikedThings' | 'personalityTraits' | 'characterSayings' | 'userDislikes' | 'oocBehaviors') => (index: number) => {
      removeTagItem(field, index)
    },
    [removeTagItem]
  )

  /* ──────────── 撤回 ──────────── */
  const handleUndo = useCallback(() => {
    if (!canUndo()) return
    const importState = getImportUndoState()
    if (importState) {
      setShowUndoConfirm(true)
    } else {
      undo()
    }
  }, [canUndo, getImportUndoState, undo])

  const confirmUndo = useCallback(() => {
    undo()
    setShowUndoConfirm(false)
  }, [undo])

  /* ──────────── 回退 ──────────── */
  const handleRedo = useCallback(() => {
    if (!canRedo()) return
    redo()
  }, [canRedo, redo])

  /* ──────────── 关闭 / 保存草稿 ──────────── */
  const handleClose = useCallback(() => {
    if (isEditMode) {
      // 编辑模式：检查是否有未保存修改
      const currentData = JSON.stringify(formData)
      const savedData = lastSavedDataRef.current ? JSON.stringify(lastSavedDataRef.current) : ''
      if (currentData !== savedData) {
        setShowExitConfirm(true)
      } else {
        navigate(-1)
      }
      return
    }
    if (hasContent()) {
      setShowSaveDraftModal(true)
    } else {
      resetForm()
      navigate(-1)
    }
  }, [isEditMode, formData, hasContent, resetForm, navigate])

  /* ──────────── 编辑模式：保存角色档案 ──────────── */
  const handleEditSave = useCallback(() => {
    const character = characters.find((c) => c.id === editCharacterId)
    if (!character) return

    const updatedCharacter = {
      ...character,
      profile: {
        ...character.profile,
        name: formData.name,
        age: formData.age ? parseInt(formData.age, 10) : undefined,
        birthday: sanitizeDate(formData.birthday),
        gender: (formData.gender as 'male' | 'female' | 'other') || undefined,
        personality: formData.personalityTraits,
        tone: formData.greeting || '',
        hobbies: formData.hobbies,
        background: formData.userNote || '',
        updatedAt: Date.now(),
      },
      formData: { ...formData } as Record<string, unknown>,
    }
    updateCharacter(updatedCharacter)
    // 更新已保存数据引用
    const deepCopyData = JSON.parse(JSON.stringify(formData)) as CharacterFormData
    lastSavedDataRef.current = deepCopyData
    setShowEditSaveSuccess(true)
    setTimeout(() => setShowEditSaveSuccess(false), 2000)
  }, [characters, editCharacterId, formData, updateCharacter])

  // 退出确认：保存并退出
  const handleExitConfirmYes = useCallback(() => {
    setShowExitConfirm(false)
    const character = characters.find((c) => c.id === editCharacterId)
    if (!character) {
      navigate(-1)
      return
    }
    const updatedCharacter = {
      ...character,
      profile: {
        ...character.profile,
        name: formData.name,
        age: formData.age ? parseInt(formData.age, 10) : undefined,
        birthday: sanitizeDate(formData.birthday),
        gender: (formData.gender as 'male' | 'female' | 'other') || undefined,
        personality: formData.personalityTraits,
        tone: formData.greeting || '',
        hobbies: formData.hobbies,
        background: formData.userNote || '',
        updatedAt: Date.now(),
      },
      formData: { ...formData } as Record<string, unknown>,
    }
    updateCharacter(updatedCharacter)
    navigate(-1)
  }, [characters, editCharacterId, formData, updateCharacter, navigate])

  // 退出确认：不保存直接退出
  const handleExitConfirmNo = useCallback(() => {
    setShowExitConfirm(false)
    navigate(-1)
  }, [navigate])

  const handleSaveDraftNo = useCallback(() => {
    setShowSaveDraftModal(false)
    resetForm()
    navigate(-1)
  }, [resetForm, navigate])

  const handleSaveDraftYes = useCallback(() => {
    setShowSaveDraftModal(false)
    setShowDraftNameModal(true)
  }, [])

  const handleDraftNameConfirm = useCallback(() => {
    // 序列化为 JSON 并下载为 .txt 文件
    const json = JSON.stringify(formData, null, 2)
    const blob = new Blob([json], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${draftName || 'draft'}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    // 同时保存到 localStorage 草稿箱
    const existingDrafts = JSON.parse(localStorage.getItem('create_character_drafts') || '[]')
    existingDrafts.push({
      id: crypto.randomUUID(),
      name: draftName || 'draft',
      data: formData,
      savedAt: Date.now(),
    })
    localStorage.setItem('create_character_drafts', JSON.stringify(existingDrafts))

    setShowDraftNameModal(false)
    resetForm()
    navigate(-1)
  }, [formData, draftName, resetForm, navigate])

  const handleDraftNameCancel = useCallback(() => {
    setShowDraftNameModal(false)
    // 不保存，直接退出
    resetForm()
    navigate(-1)
  }, [resetForm, navigate])

  /* ──────────── 验证 & 提交 ──────────── */
  const validateForm = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof CharacterFormData, boolean>> = {}
    for (const field of requiredFields) {
      const val = formData[field]
      if (typeof val === 'string' && !val.trim()) {
        newErrors[field] = true
      }
    }
    setErrors(newErrors)

    // 滚动到第一个错误字段
    const firstErrorField = requiredFields.find((f) => newErrors[f])
    if (firstErrorField) {
      const el = fieldRefs.current[firstErrorField]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.focus()
      }
    }

    return Object.keys(newErrors).length === 0
  }, [formData])

  const handleSubmit = useCallback(() => {
    setShowSubmitChoice(true)
  }, [])

  // 提交角色选择弹窗：点击【提交】→ 进入原有提交流程
  const handleSubmitChoiceSubmit = useCallback(() => {
    setShowSubmitChoice(false)
    setShowSubmitConfirm(true)
  }, [])

  // 提交角色选择弹窗：点击【保存至草稿箱】→ 校验必填字段
  const handleSubmitChoiceSaveDraft = useCallback(() => {
    setShowSubmitChoice(false)
    // 校验必填字段
    const newErrors: Partial<Record<keyof CharacterFormData, boolean>> = {}
    for (const field of requiredFields) {
      const val = formData[field]
      if (typeof val === 'string' && !val.trim()) {
        newErrors[field] = true
      }
    }
    setErrors(newErrors)

    if (Object.keys(newErrors).length > 0) {
      // 高亮未填写的必填字段并滚动
      const firstErrorField = requiredFields.find((f) => newErrors[f])
      if (firstErrorField) {
        const el = fieldRefs.current[firstErrorField]
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.focus()
        }
      }
      // 切换到内容填写标签页，让用户看到高亮
      setActiveTab('manual')
      return
    }

    // 所有必填字段已填写 → 生成默认草稿名并弹出命名弹窗
    const now = new Date()
    const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`

    // 计算当日草稿序号
    const existingDrafts: Array<{ name: string; savedAt: number }> = JSON.parse(
      localStorage.getItem('create_character_drafts') || '[]'
    )
    const todayPrefix = `chuang_jian_jue_se_`
    const todaySuffix = `_${dateStr}`
    let maxNum = 0
    for (const d of existingDrafts) {
      if (d.name.startsWith(todayPrefix) && d.name.endsWith(todaySuffix)) {
        const numPart = d.name.slice(todayPrefix.length, d.name.length - todaySuffix.length)
        const num = parseInt(numPart, 10)
        if (!isNaN(num) && num > maxNum) {
          maxNum = num
        }
      }
    }
    const nextNum = String(maxNum + 1).padStart(2, '0')
    setSaveToDraftBoxName(`${todayPrefix}${nextNum}${todaySuffix}`)
    setShowSaveToDraftBoxModal(true)
  }, [formData, requiredFields])

  // 保存至草稿箱：确认保存
  const handleConfirmSaveToDraftBox = useCallback(() => {
    // 保存到 localStorage 草稿箱
    const existingDrafts = JSON.parse(localStorage.getItem('create_character_drafts') || '[]')
    existingDrafts.push({
      id: crypto.randomUUID(),
      name: saveToDraftBoxName || 'draft',
      data: formData,
      savedAt: Date.now(),
    })
    localStorage.setItem('create_character_drafts', JSON.stringify(existingDrafts))

    setShowSaveToDraftBoxModal(false)
    setShowDraftSavedToast(true)
    // 3 秒后自动消失
    setTimeout(() => {
      setShowDraftSavedToast(false)
    }, 3000)
  }, [formData, saveToDraftBoxName])

  // 保存至草稿箱：取消
  const handleCancelSaveToDraftBox = useCallback(() => {
    setShowSaveToDraftBoxModal(false)
  }, [])

  const confirmSubmit = useCallback(() => {
    setShowSubmitConfirm(false)
    setShowSuccess(true)

    // 创建角色并添加到 store
    const newCharacter = {
      id: crypto.randomUUID(),
      userId: user?.id || '',
      profile: {
        id: crypto.randomUUID(),
        userId: user?.id || '',
        name: formData.name,
        age: formData.age ? parseInt(formData.age, 10) : undefined,
        birthday: sanitizeDate(formData.birthday),
        gender: (formData.gender as 'male' | 'female' | 'other') || undefined,
        personality: formData.personalityTraits,
        tone: formData.greeting || '',
        address: '',
        hobbies: formData.hobbies,
        background: formData.userNote || '',
        avatar: undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      settings: {
        voiceType: formData.voiceEnabled ? (formData.voiceId || 'default') : 'default',
        voiceSpeed: formData.voiceSpeed ?? 50,
        voicePitch: formData.voicePitch ?? 55,
        voiceVolume: formData.voiceVolume ?? 70,
        decorations: [],
      },
      createdAt: Date.now(),
      formData: { ...formData } as Record<string, unknown>,
    }
    addCharacter(newCharacter)
    setCurrentCharacter(newCharacter)

    // 提交成功后清空未保存草稿
    localStorage.removeItem('create_character_unsaved')
    setUnsavedDraftData(null)
    isRecoveringRef.current = false

    // 2.5 秒后关闭成功动画，显示双弹窗流程
    setTimeout(() => {
      setShowSuccess(false)
      // 使用独立标记判断是否首次创建角色（与 autoJumpToChat 设置值无关）
      const hasSeenPopup = localStorage.getItem('has_seen_first_create_popup')
      if (!hasSeenPopup) {
        // 首次：显示双弹窗流程
        setShowJumpToChatPopup(true)
      } else {
        // 非首次：直接按用户偏好设置执行
        const autoJump = useSettingsStore.getState().settings?.autoJumpToChat
        if (autoJump) {
          navigate('/chat', { state: { characterId: newCharacter.id } })
        } else {
          navigate('/main')
        }
      }
    }, 2500)
  }, [formData, user, addCharacter, setCurrentCharacter, navigate])

  /* ──────────── 文件导入 ──────────── */
  const getConflictFields = useCallback(
    (imported: Partial<CharacterFormData>): string[] => {
      const conflicts: string[] = []
      const fieldLabels: Partial<Record<keyof CharacterFormData, string>> = {
        name: '角色姓名',
        age: '年纪',
        birthday: '生日',
        gender: '性别',
        relationship: '角色与用户的关系',
        userTitle: '对用户的称呼',
        userNote: '用户对角色的备注',
        anniversary: '与角色的重要纪念日',
        greeting: '开场白',
        likedFoods: '角色喜欢的食物',
        dislikedFoods: '角色不喜欢的食物/忌口',
        hobbies: '角色的兴趣爱好',
        dislikedThings: '角色讨厌的事',
        personalityTraits: '角色的性格',
        characterSayings: '角色会说的话',
        userDislikes: '用户特别不喜欢的事',
        oocBehaviors: '希望角色不要出现OOC的行为',
      }

      for (const key of Object.keys(fieldLabels) as (keyof CharacterFormData)[]) {
        const current = formData[key]
        const incoming = imported[key]
        if (Array.isArray(current)) {
          if ((current as string[]).length > 0 && incoming && (incoming as string[]).length > 0) {
            conflicts.push(fieldLabels[key] || key)
          }
        } else {
          if (current && incoming && current !== incoming) {
            conflicts.push(fieldLabels[key] || key)
          }
        }
      }
      return conflicts
    },
    [formData]
  )

  // 将解析后的数据应用到表单（带冲突检测）
  const applyParsedData = useCallback(
    (rawData: Record<string, unknown>) => {
      // 过滤出合法字段
      const validFields: (keyof CharacterFormData)[] = [
        'name', 'age', 'birthday', 'gender', 'relationship', 'relationshipCustom',
        'userTitle', 'userNote', 'anniversary', 'greeting',
        'likedFoods', 'dislikedFoods', 'hobbies', 'dislikedThings',
        'personalityTraits', 'characterSayings', 'userDislikes', 'oocBehaviors',
      ]
      const filtered: Partial<CharacterFormData> = {}
      for (const field of validFields) {
        if (rawData[field] !== undefined && rawData[field] !== null) {
          const val = rawData[field]
          // 标签字段需确保是数组
          if (Array.isArray(val)) {
            ;(filtered as Record<string, unknown>)[field] = val.map(String)
          } else if (typeof val === 'string') {
            ;(filtered as Record<string, unknown>)[field] = val
          }
        }
      }

      if (Object.keys(filtered).length === 0) {
        return
      }

      if (!hasContent()) {
        importData(filtered)
        setActiveTab('manual')
        return
      }
      const conflicts = getConflictFields(filtered)
      if (conflicts.length > 0) {
        setPendingImportData(filtered)
        setShowImportConflict(conflicts)
      } else {
        importData(filtered)
        setActiveTab('manual')
      }
    },
    [hasContent, importData, getConflictFields]
  )

  // 处理真实文件：解析 → 预览 → 应用
  const handleFileProcess = useCallback(
    async (file: File) => {
      setIsParsing(true)
      let message = '正在解析文件内容...'
      if (isImageFile(file)) {
        message = '正在识别图片中的文字...'
      } else if (file.name.toLowerCase().endsWith('.doc') || file.name.toLowerCase().endsWith('.docx')) {
        message = '正在提取文档内容...'
      }
      setParsingMessage(message)
      try {
        const { text, fileName } = await parseFileToText(
          file,
          () => setIsParsing(true),
          () => {/* OCR 结束由 parseFileToText 内部控制 */}
        )
        setEditableParsedText(text)
        setParsedFileName(fileName)
        setShowParsedPreview(true)
      } catch (err) {
        console.error('文件解析失败:', err)
      } finally {
        setIsParsing(false)
        setParsingMessage('')
      }
    },
    []
  )

  // 确认解析后的文本 → AI 解析字段 → 进入预览弹窗
  const handleConfirmParsedText = useCallback(async () => {
    setIsAiParsing(true)
    try {
      const result = await parseCharacterWithAI(editableParsedText)
      const { unmatched, ...fieldData } = result
      const cleanData: Record<string, unknown> = {}
      for (const [key, val] of Object.entries(fieldData)) {
        if (Array.isArray(val) ? val.length > 0 : (val !== undefined && val !== null && val !== '')) {
          cleanData[key] = val
        }
      }
      setImportPreviewData(cleanData)
      setImportPreviewUnmatched(unmatched || '')
    } catch (err) {
      console.error('[导入] AI 解析失败，回退到本地匹配:', err)
      const { data, unmatched } = parseTextToCharacterFields(editableParsedText)
      setImportPreviewData(data)
      setImportPreviewUnmatched(unmatched)
    } finally {
      setIsAiParsing(false)
      setShowParsedPreview(false)
      setShowImportPreview(true)
      setEditableParsedText('')
      setParsedFileName('')
    }
  }, [editableParsedText])

  const handleCancelParsedPreview = useCallback(() => {
    setShowParsedPreview(false)
    setEditableParsedText('')
    setParsedFileName('')
  }, [])

  // 导入预览弹窗：编辑字段
  const handleStartEditImportField = useCallback((field: string, value: unknown) => {
    setEditingImportField(field)
    setEditingImportValue(
      Array.isArray(value) ? (value as string[]).join('、') : String(value ?? '')
    )
  }, [])

  const handleConfirmEditImportField = useCallback(() => {
    if (!editingImportField) return
    const mapping = fieldMappings.find((m) => m.field === editingImportField)
    if (mapping?.isTag) {
      const tags = editingImportValue
        .split(/[,，、；;]/)
        .map((t) => t.trim())
        .filter(Boolean)
      setImportPreviewData((prev) => ({ ...prev, [editingImportField]: tags }))
    } else {
      setImportPreviewData((prev) => ({ ...prev, [editingImportField]: editingImportValue }))
    }
    setEditingImportField(null)
    setEditingImportValue('')
  }, [editingImportField, editingImportValue])

  const handleCancelEditImportField = useCallback(() => {
    setEditingImportField(null)
    setEditingImportValue('')
  }, [])

  // 未匹配内容手动分配到指定字段
  const handleAssignUnmatched = useCallback(() => {
    if (!assignTargetField || !importPreviewUnmatched) return
    const mapping = fieldMappings.find((m) => m.field === assignTargetField)
    const existing = importPreviewData[assignTargetField]
    if (mapping?.isTag) {
      const newTags = importPreviewUnmatched
        .split(/[,，、；;\n]/)
        .map((t) => t.trim())
        .filter(Boolean)
      const existingTags = Array.isArray(existing) ? existing as string[] : []
      setImportPreviewData((prev) => ({
        ...prev,
        [assignTargetField]: [...existingTags, ...newTags],
      }))
    } else {
      const existingStr = typeof existing === 'string' ? existing : ''
      setImportPreviewData((prev) => ({
        ...prev,
        [assignTargetField]: existingStr
          ? `${existingStr}、${importPreviewUnmatched}`
          : importPreviewUnmatched,
      }))
    }
    setImportPreviewUnmatched('')
    setAssignTargetField('')
  }, [assignTargetField, importPreviewUnmatched, importPreviewData])

  // 导入预览弹窗：确认导入
  const handleConfirmImportPreview = useCallback(() => {
    setShowImportPreview(false)
    applyParsedData(importPreviewData)
    setImportPreviewUnmatched('')
    setImportPreviewData({})
    setAssignTargetField('')
  }, [importPreviewData, applyParsedData])

  const handleCancelImportPreview = useCallback(() => {
    setShowImportPreview(false)
    setImportPreviewData({})
    setImportPreviewUnmatched('')
    setAssignTargetField('')
  }, [])

  const confirmImportOverwrite = useCallback(() => {
    if (pendingImportData) {
      importData(pendingImportData)
      setActiveTab('manual')
    }
    setShowImportConflict([])
    setPendingImportData(null)
  }, [pendingImportData, importData])

  const cancelImport = useCallback(() => {
    setShowImportConflict([])
    setPendingImportData(null)
  }, [])

  /* ──────────── 拖拽处理 ──────────── */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const files = e.dataTransfer.files
      if (files && files.length > 0) {
        handleFileProcess(files[0])
      }
    },
    [handleFileProcess]
  )

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileProcess(e.target.files[0])
        // 清空 input value，允许重复选择同一文件
        e.target.value = ''
      }
    },
    [handleFileProcess]
  )

  /* ──────────── 判断字段是否有错误边框 ──────────── */
  const fieldErrorClass = (key: keyof CharacterFormData) =>
    errors[key] ? 'border-red-500 ring-2 ring-red-500' : ''

  /* ──────────── 未保存内容恢复 ──────────── */
  const handleRecoveryYes = useCallback(() => {
    if (unsavedDraftData) {
      importData(unsavedDraftData)
    }
    setUnsavedDraftData(null)
    isRecoveringRef.current = false
    setShowRecoveryModal(false)
  }, [importData, unsavedDraftData])

  const handleRecoveryNo = useCallback(() => {
    setUnsavedDraftData(null)
    localStorage.removeItem('create_character_unsaved')
    isRecoveringRef.current = false
    setShowRecoveryModal(false)
  }, [])

  const handleRecoverySaveDraft = useCallback(() => {
    if (unsavedDraftData) {
      try {
        const existingDrafts = JSON.parse(localStorage.getItem('create_character_drafts') || '[]')
        const now = new Date()
        const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
        existingDrafts.push({
          id: crypto.randomUUID(),
          name: `chuang_jian_jue_se_01_${dateStr}`,
          data: unsavedDraftData,
          savedAt: Date.now(),
        })
        localStorage.setItem('create_character_drafts', JSON.stringify(existingDrafts))
      } catch {
        // 忽略解析错误
      }
    }
    setUnsavedDraftData(null)
    localStorage.removeItem('create_character_unsaved')
    isRecoveringRef.current = false
    setShowRecoveryModal(false)
    setShowRecoverySecondModal(true)
  }, [unsavedDraftData])

  const handleRecoverySecondConfirm = useCallback(() => {
    if (dontRemindAgain) {
      localStorage.setItem('create_character_draft_reminder_disabled', 'true')
    }
    setShowRecoverySecondModal(false)
  }, [dontRemindAgain])

  /* ──────────── 草稿箱 ──────────── */
  const handleOpenDraftBox = useCallback(() => {
    const stored = JSON.parse(localStorage.getItem('create_character_drafts') || '[]')
    stored.sort((a: { savedAt: number }, b: { savedAt: number }) => b.savedAt - a.savedAt)
    setDrafts(stored)
    setShowDraftBoxModal(true)
  }, [])

  const handleLoadDraft = useCallback(
    (draft: { id: string; name: string; data: CharacterFormData; savedAt: number }) => {
      importData(draft.data)
      setCurrentDraftId(draft.id)
      setShowDraftBoxModal(false)
    },
    [importData]
  )

  const handleDeleteDraft = useCallback(
    (id: string) => {
      setDeletingDraftId(id)
      setShowDeleteConfirm(true)
    },
    []
  )

  const handleConfirmDeleteDraft = useCallback(() => {
    if (!deletingDraftId) return
    const updated = drafts.filter((d) => d.id !== deletingDraftId)
    setDrafts(updated)
    localStorage.setItem('create_character_drafts', JSON.stringify(updated))

    // 如果删除的是当前正在编辑的草稿，清空表单
    if (deletingDraftId === currentDraftId) {
      resetForm()
      setCurrentDraftId(null)
    }

    setShowDeleteConfirm(false)
    setDeletingDraftId(null)
  }, [deletingDraftId, drafts, currentDraftId, resetForm])

  const handleCancelDeleteDraft = useCallback(() => {
    setShowDeleteConfirm(false)
    setDeletingDraftId(null)
  }, [])

  const formatDateTime = (timestamp: number) => {
    const d = new Date(timestamp)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}`
  }

  /* ══════════════════════════════════════════════════════════
     渲染
     ══════════════════════════════════════════════════════════ */
  return (
    <div className="h-full w-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* ── 顶部导航栏 ── */}
      <header className="flex items-center px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm shrink-0">
        {isEditMode && (
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mr-1"
            title="返回"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
        )}
        <button
          onClick={handleUndo}
          disabled={!canUndo()}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="撤回"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
        <h1 className="flex-1 text-center text-lg font-bold text-gray-800 dark:text-white">
          {isEditMode ? `${formData.name || '角色'}的档案` : '创建角色'}
        </h1>
        <button
          onClick={handleRedo}
          disabled={!canRedo()}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="回退"
        >
          <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
        {!isEditMode && (
          <button
            onClick={handleOpenDraftBox}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ml-1"
            title="草稿箱"
          >
            <Mail className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
        )}
        <button
          onClick={handleClose}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ml-1"
          title="关闭"
        >
          <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
      </header>

      {/* ── 内容区域 - 可滚动 ── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-2xl mx-auto px-6 py-6">
          {/* 标签切换 */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
            <button
              onClick={() => setActiveTab('manual')}
              className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                activeTab === 'manual'
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              内容填写
              {activeTab === 'manual' && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 rounded-full"
                />
              )}
            </button>
            <button
              onClick={() => setActiveTab('import')}
              className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                activeTab === 'import'
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              导入文件
              {activeTab === 'import' && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 rounded-full"
                />
              )}
            </button>
          </div>

          <AnimatePresence mode="wait">
            {/* ── 内容填写模式 ── */}
            {activeTab === 'manual' && (
              <motion.div
                key="manual"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                {/* 必填提示 */}
                <p className="text-sm text-red-500 mb-3">带 * 的为必填内容</p>

                {/* 区块一：基本信息 */}
                <div className="mb-2">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
                    基本信息
                  </h2>

                  {/* 角色姓名 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      角色姓名
                      <span className="text-red-500 ml-1">*</span>
                    </label>
                    <input
                      ref={registerFieldRef('name')}
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleFieldChange('name', e.target.value)}
                      className={`input-field ${fieldErrorClass('name')}`}
                      placeholder="请输入角色姓名"
                    />
                  </div>

                  {/* 年纪 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      年纪
                    </label>
                    <input
                      ref={registerFieldRef('age')}
                      type="number"
                      value={formData.age}
                      onChange={(e) => handleFieldChange('age', e.target.value)}
                      className={`input-field ${fieldErrorClass('age')}`}
                      placeholder="请输入年纪"
                      min={0}
                      max={999}
                    />
                  </div>

                  {/* 生日 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      生日
                    </label>
                    <div className="date-input-wrapper">
                      {!formData.birthday && <span className="date-input-placeholder">选择日期</span>}
                      <input
                        ref={registerFieldRef('birthday')}
                        type="date"
                        placeholder="选择日期"
                        value={formData.birthday}
                        onChange={(e) => handleFieldChange('birthday', e.target.value)}
                        className={`input-field ${fieldErrorClass('birthday')}`}
                      />
                    </div>
                  </div>

                  {/* 性别 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      性别
                    </label>
                    <input
                      type="text"
                      value={formData.gender}
                      onChange={(e) => handleFieldChange('gender', e.target.value)}
                      className="input-field"
                      placeholder="请输入性别（选填）"
                    />
                  </div>
                </div>

                <hr className="my-6 border-gray-200 dark:border-gray-700" />

                {/* 区块二：相处设定 */}
                <div className="mb-2">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
                    相处设定
                  </h2>

                  {/* 角色与用户的关系 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      角色与用户的关系
                      <span className="text-red-500 ml-1">*</span>
                    </label>
                    <select
                      ref={registerFieldRef('relationship')}
                      value={formData.relationship}
                      onChange={(e) => handleFieldChange('relationship', e.target.value)}
                      className={`input-field ${fieldErrorClass('relationship')}`}
                    >
                      <option value="">请选择</option>
                      {relationshipOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    {formData.relationship === '其他' && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-2"
                      >
                        <input
                          type="text"
                          value={formData.relationshipCustom}
                          onChange={(e) => handleFieldChange('relationshipCustom', e.target.value)}
                          className="input-field"
                          placeholder="请输入自定义关系"
                        />
                      </motion.div>
                    )}
                  </div>

                  {/* 对用户的称呼 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      对用户的称呼
                      <span className="text-red-500 ml-1">*</span>
                    </label>
                    <input
                      ref={registerFieldRef('userTitle')}
                      type="text"
                      value={formData.userTitle}
                      onChange={(e) => handleFieldChange('userTitle', e.target.value)}
                      className={`input-field ${fieldErrorClass('userTitle')}`}
                      placeholder="请输入角色对你的称呼"
                    />
                  </div>

                  {/* 用户对角色的备注 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      用户对角色的备注
                    </label>
                    <textarea
                      value={formData.userNote}
                      onChange={(e) => handleFieldChange('userNote', e.target.value)}
                      className="input-field min-h-[80px] resize-y"
                      placeholder="请输入备注（选填）"
                      rows={3}
                    />
                  </div>

                  {/* 与角色的重要纪念日 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      与角色的重要纪念日
                    </label>
                    <div className="date-input-wrapper">
                      {!formData.anniversary && <span className="date-input-placeholder">选择日期</span>}
                      <input
                        type="date"
                        placeholder="选择日期"
                        value={formData.anniversary}
                        onChange={(e) => handleFieldChange('anniversary', e.target.value)}
                        className="input-field"
                      />
                    </div>
                  </div>
                </div>

                <hr className="my-6 border-gray-200 dark:border-gray-700" />

                {/* 区块三：喜好与性格 */}
                <div className="mb-2">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
                    喜好与性格
                  </h2>

                  <div className="space-y-4">
                    <TagInput
                      label="角色喜欢的食物"
                      items={formData.likedFoods}
                      onAdd={handleTagAdd('likedFoods')}
                      onRemove={handleTagRemove('likedFoods')}
                    />
                    <TagInput
                      label="角色不喜欢的食物/忌口"
                      items={formData.dislikedFoods}
                      onAdd={handleTagAdd('dislikedFoods')}
                      onRemove={handleTagRemove('dislikedFoods')}
                    />
                    <TagInput
                      label="角色的兴趣爱好"
                      items={formData.hobbies}
                      onAdd={handleTagAdd('hobbies')}
                      onRemove={handleTagRemove('hobbies')}
                    />
                    <TagInput
                      label="角色讨厌的事"
                      items={formData.dislikedThings}
                      onAdd={handleTagAdd('dislikedThings')}
                      onRemove={handleTagRemove('dislikedThings')}
                    />
                    <TagInput
                      label="角色的性格"
                      items={formData.personalityTraits}
                      onAdd={handleTagAdd('personalityTraits')}
                      onRemove={handleTagRemove('personalityTraits')}
                    />
                  </div>
                </div>

                <hr className="my-6 border-gray-200 dark:border-gray-700" />

                {/* 区块四：对话与行为 */}
                <div className="mb-2">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
                    对话与行为
                  </h2>

                  <div className="space-y-4">
                    <TagInput
                      label="角色会说的话"
                      items={formData.characterSayings}
                      onAdd={handleTagAdd('characterSayings')}
                      onRemove={handleTagRemove('characterSayings')}
                    />

                    {/* 开场白 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        开场白
                      </label>
                      <input
                        type="text"
                        value={formData.greeting}
                        onChange={(e) => handleFieldChange('greeting', e.target.value)}
                        className="input-field"
                        placeholder="角色见面的第一句话（选填）"
                      />
                    </div>

                    <TagInput
                      label="用户特别不喜欢的事"
                      items={formData.userDislikes}
                      onAdd={handleTagAdd('userDislikes')}
                      onRemove={handleTagRemove('userDislikes')}
                    />
                    <TagInput
                      label="希望角色不要出现OOC的行为列举"
                      items={formData.oocBehaviors}
                      onAdd={handleTagAdd('oocBehaviors')}
                      onRemove={handleTagRemove('oocBehaviors')}
                    />
                  </div>
                </div>

                <hr className="my-6 border-gray-200 dark:border-gray-700" />

                {/* 区块五：自定义角色声音 */}
                <div className="mb-2">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
                    自定义角色声音
                  </h2>
                  <VoiceSettings />
                </div>

                {/* 底部留白，避免被 footer 遮挡 */}
                <div className="h-4" />
              </motion.div>
            )}

            {/* ── 导入文件模式 ── */}
            {activeTab === 'import' && (
              <motion.div
                key="import"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {/* OCR / 解析中 loading */}
                {isParsing && (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="w-10 h-10 text-primary-500 animate-spin mb-4" />
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                      {parsingMessage || '正在处理文件...'}
                    </p>
                  </div>
                )}

                {/* 拖拽 / 选择区域 */}
                {!isParsing && !showParsedPreview && (
                  <>
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${
                        isDragging
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                          : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".txt,.json,.csv,.doc,.docx,.png,.jpg,.jpeg"
                        className="hidden"
                        onChange={handleFileInputChange}
                      />
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.1 }}
                      >
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                          <svg
                            className="w-8 h-8 text-gray-400 dark:text-gray-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                            />
                          </svg>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-1">
                          拖拽文件到此处，或点击选择文件
                        </p>
                        <p className="text-gray-400 dark:text-gray-500 text-xs">
                          支持 .txt / .json / .doc / .docx / .png / .jpg / .jpeg 格式
                        </p>
                      </motion.div>
                    </div>

                    <p className="text-center text-gray-400 dark:text-gray-500 text-xs mt-4">
                      上传包含角色信息的文件，系统将自动解析并填充表单
                    </p>
                  </>
                )}

                {/* 解析结果预览 / 编辑 */}
                {!isParsing && showParsedPreview && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-800 dark:text-white">
                        识别内容预览
                      </h3>
                      <span className="text-xs text-gray-400">{parsedFileName}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      请检查识别结果，修正后再进行字段匹配。OCR 识别准确率有限，可手动修改下方文本。
                    </p>
                    <textarea
                      value={editableParsedText}
                      onChange={(e) => setEditableParsedText(e.target.value)}
                      className="input-field min-h-[200px] resize-y font-mono text-sm"
                      placeholder="识别到的文字内容..."
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={handleCancelParsedPreview}
                        className="btn-secondary flex-1"
                        disabled={isAiParsing}
                      >
                        取消
                      </button>
                      <button
                        onClick={handleConfirmParsedText}
                        className="btn-primary flex-1 flex items-center justify-center gap-2"
                        disabled={isAiParsing}
                      >
                        {isAiParsing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            AI 解析中...
                          </>
                        ) : (
                          '确认并匹配字段'
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── 底部提交按钮 ── */}
      <footer className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4 shrink-0">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={isEditMode ? handleEditSave : handleSubmit}
            className="btn-primary w-full py-3 text-base font-semibold"
          >
            {isEditMode ? '保存' : '提交'}
          </button>
        </div>
      </footer>

      {/* ══════════════ 弹窗区域 ══════════════ */}

      {/* 编辑模式：退出确认弹窗 */}
      <AnimatePresence>
        {showExitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowExitConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                </div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                  未保存的修改
                </h3>
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
                是否保存修改内容？
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleExitConfirmNo}
                  className="btn-secondary flex-1 py-2"
                >
                  否
                </button>
                <button
                  onClick={handleExitConfirmYes}
                  className="btn-primary flex-1 py-2"
                >
                  是
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 编辑模式：保存成功 Toast */}
      <AnimatePresence>
        {showEditSaveSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-6 py-3 rounded-xl bg-green-500 text-white shadow-lg"
          >
            <Save className="w-5 h-5" />
            <span className="text-sm font-medium">档案已保存成功！</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 撤回确认弹窗（导入撤回） */}
      <AnimatePresence>
        {showUndoConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowUndoConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3">
                撤回确认
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
                撤回将全部清空刚刚导入的内容，确定要这样吗？
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowUndoConfirm(false)}
                  className="btn-secondary"
                >
                  取消
                </button>
                <button onClick={confirmUndo} className="btn-primary">
                  确认
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 保存草稿弹窗 - 第一层 */}
      <AnimatePresence>
        {showSaveDraftModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowSaveDraftModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3">
                保存草稿
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
                是否保存当前已填写的内容？
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={handleSaveDraftNo} className="btn-secondary">
                  否
                </button>
                <button onClick={handleSaveDraftYes} className="btn-primary">
                  是
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 保存草稿弹窗 - 第二层（命名） */}
      <AnimatePresence>
        {showDraftNameModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowDraftNameModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3">
                修改草稿箱命名
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                已存入草稿箱，是否修改草稿箱命名？
              </p>
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="input-field mb-6"
              />
              <div className="flex justify-end gap-3">
                <button onClick={handleDraftNameCancel} className="btn-secondary">
                  取消
                </button>
                <button onClick={handleDraftNameConfirm} className="btn-primary">
                  确认
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 提交角色选择弹窗（提交 / 保存至草稿箱） */}
      <AnimatePresence>
        {showSubmitChoice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowSubmitChoice(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3">
                提交角色
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
                确定提交角色信息吗？
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleSubmitChoiceSaveDraft}
                  className="btn-secondary flex-1"
                >
                  保存至草稿箱
                </button>
                <button
                  onClick={handleSubmitChoiceSubmit}
                  className="btn-primary flex-1"
                >
                  提交
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 保存至草稿箱命名弹窗 */}
      <AnimatePresence>
        {showSaveToDraftBoxModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={handleCancelSaveToDraftBox}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3">
                保存至草稿箱
              </h3>
              <input
                type="text"
                value={saveToDraftBoxName}
                onChange={(e) => setSaveToDraftBoxName(e.target.value)}
                className="input-field mb-2"
                placeholder="请输入草稿名称"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
                后续可在右上角信封按钮中查看已保存的草稿
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={handleCancelSaveToDraftBox} className="btn-secondary">
                  取消
                </button>
                <button onClick={handleConfirmSaveToDraftBox} className="btn-primary">
                  确认保存
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 草稿保存成功 Toast */}
      <AnimatePresence>
        {showDraftSavedToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-5 py-3 bg-green-500 text-white rounded-xl shadow-lg"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="text-sm font-medium">草稿已保存成功！</span>
            <button
              onClick={() => setShowDraftSavedToast(false)}
              className="ml-2 hover:opacity-70 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 提交确认弹窗 */}
      <AnimatePresence>
        {showSubmitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowSubmitConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3">
                提交确认
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
                确定角色信息都准确无误了吗？
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowSubmitConfirm(false)}
                  className="btn-secondary"
                >
                  还没有...
                </button>
                <button
                  onClick={() => {
                    if (validateForm()) {
                      confirmSubmit()
                    } else {
                      setShowSubmitConfirm(false)
                    }
                  }}
                  className="btn-primary"
                >
                  确定
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 导入冲突弹窗 */}
      <AnimatePresence>
        {showImportConflict.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={cancelImport}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3">
                导入冲突
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
                检测到以下字段存在冲突，是否覆盖替换？
              </p>
              <div className="max-h-40 overflow-y-auto mb-6 bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  {showImportConflict.map((field, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      {field}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={cancelImport} className="btn-secondary">
                  保留已有内容
                </button>
                <button onClick={confirmImportOverwrite} className="btn-primary">
                  覆盖
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 未保存内容恢复弹窗 */}
      <AnimatePresence>
        {showRecoveryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowRecoveryModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3">
                提示
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
                此页面含有上次未保存的内容，是否要继续编辑？（否的话内容将会被丢弃）
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={handleRecoverySaveDraft} className="btn-secondary">
                  保存上次内容
                </button>
                <button onClick={handleRecoveryNo} className="btn-secondary">
                  否
                </button>
                <button onClick={handleRecoveryYes} className="btn-primary">
                  是
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 未保存内容恢复 - 第二弹窗 */}
      <AnimatePresence>
        {showRecoverySecondModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowRecoverySecondModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3">
                提示
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                后续可以点击这个页面中的信封按钮来编辑你之前的人物档案哦
              </p>
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-6 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dontRemindAgain}
                  onChange={(e) => setDontRemindAgain(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                下次不再提示
              </label>
              <div className="flex justify-end gap-3">
                <button onClick={handleRecoverySecondConfirm} className="btn-primary">
                  知道了
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 草稿箱弹窗 */}
      <AnimatePresence>
        {showDraftBoxModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowDraftBoxModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card max-w-md w-full max-h-[70vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
                草稿箱
              </h3>
              {drafts.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-sm py-8 text-center">
                  暂无草稿
                </p>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-3">
                  {drafts.map((draft) => (
                    <div
                      key={draft.id}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                          {draft.name}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {formatDateTime(draft.savedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleLoadDraft(draft)}
                          className="btn-primary text-xs px-3 py-1.5"
                        >
                          继续编辑
                        </button>
                        <button
                          onClick={() => handleDeleteDraft(draft.id)}
                          className="btn-secondary text-xs px-3 py-1.5"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setShowDraftBoxModal(false)}
                  className="btn-secondary"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 导入预览弹窗（字段匹配结果 / 手动修正） */}
      <AnimatePresence>
        {showImportPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={handleCancelImportPreview}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card max-w-lg w-full max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
                AI 智能解析预览
              </h3>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {Object.keys(importPreviewData).length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-sm py-4 text-center">
                    未能匹配到任何字段，请检查文件内容格式
                  </p>
                ) : (
                  Object.entries(importPreviewData).map(([field, value]) => {
                    const isEditing = editingImportField === field
                    const isDateField = field === 'birthday' || field === 'anniversary'
                    const displayValue = Array.isArray(value)
                      ? (value as string[]).join('、')
                      : isDateField
                        ? formatDate(String(value ?? ''))
                        : String(value ?? '')
                    return (
                      <div
                        key={field}
                        className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                      >
                        {isEditing ? (
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              {getFieldLabel(field)}
                            </label>
                            <textarea
                              value={editingImportValue}
                              onChange={(e) => setEditingImportValue(e.target.value)}
                              className="input-field text-sm min-h-[60px] resize-y"
                              placeholder="多个内容用顿号、逗号或分号分隔"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={handleCancelEditImportField}
                                className="btn-secondary text-xs px-3 py-1.5"
                              >
                                取消
                              </button>
                              <button
                                onClick={handleConfirmEditImportField}
                                className="btn-primary text-xs px-3 py-1.5"
                              >
                                保存
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                                {getFieldLabel(field)}
                              </p>
                              <p className="text-sm text-gray-800 dark:text-white break-words">
                                {displayValue || (
                                  <span className="text-gray-400 italic">空</span>
                                )}
                              </p>
                            </div>
                            <button
                              onClick={() => handleStartEditImportField(field, value)}
                              className="text-xs text-primary-600 dark:text-primary-400 hover:underline shrink-0 mt-0.5"
                            >
                              编辑
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}

                {/* 未匹配内容 + 手动分配 */}
                {importPreviewUnmatched && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      未匹配内容 — 可手动分配到字段
                    </p>
                    <pre className="text-xs text-amber-600 dark:text-amber-500 whitespace-pre-wrap max-h-24 overflow-y-auto">
                      {importPreviewUnmatched}
                    </pre>
                    <div className="flex gap-2">
                      <select
                        value={assignTargetField}
                        onChange={(e) => setAssignTargetField(e.target.value)}
                        className="input-field text-xs flex-1 py-1"
                      >
                        <option value="">选择目标字段...</option>
                        {fieldMappings.map((m) => (
                          <option key={m.field} value={m.field}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleAssignUnmatched}
                        disabled={!assignTargetField}
                        className="btn-primary text-xs px-3 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        分配
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={handleCancelImportPreview}
                  className="btn-secondary"
                >
                  取消导入
                </button>
                <button
                  onClick={handleConfirmImportPreview}
                  className="btn-primary"
                >
                  确认导入
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 删除草稿确认弹窗 */}
      <AnimatePresence>
        {showDeleteConfirm && deletingDraftId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={handleCancelDeleteDraft}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="card max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3">
                确认删除
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
                {deletingDraftId === currentDraftId
                  ? '当前正在编辑这份草稿，确定删除吗？删除后当前编辑内容将被清空。此操作不可撤销。'
                  : '确定要删除这份草稿吗？此操作不可撤销。'}
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={handleCancelDeleteDraft} className="btn-secondary">
                  取消
                </button>
                <button onClick={handleConfirmDeleteDraft} className="btn-primary">
                  确认删除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 创建成功动画 */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 dark:bg-gray-900/90"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.2 }}
              className="text-center"
            >
              {/* 成功图标 */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.3 }}
                className="w-24 h-24 mx-auto mb-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center"
              >
                <svg
                  className="w-12 h-12 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <motion.path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.5, delay: 0.6 }}
                  />
                </svg>
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="text-2xl font-bold text-gray-800 dark:text-white mb-2"
              >
                创建成功！
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.0 }}
                className="text-gray-500 dark:text-gray-400 text-sm"
              >
                即将跳转到对话页面...
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 第一步弹窗：是否跳转聊天界面 */}
      <AnimatePresence>
        {showJumpToChatPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="card max-w-md w-full mx-4 p-6"
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3 text-center">提示</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6 text-center text-sm leading-relaxed">
                是否要跳转到创建角色的聊天界面（此次选择将会决定后面是否自动跳转）
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    useSettingsStore.getState().updateSettings({ autoJumpToChat: true })
                    localStorage.setItem('has_seen_first_create_popup', '1')
                    setShowJumpToChatPopup(false)
                    setShowJumpHintPopup(true)
                  }}
                  className="btn-primary flex-1 py-2"
                >
                  是
                </button>
                <button
                  onClick={() => {
                    useSettingsStore.getState().updateSettings({ autoJumpToChat: false })
                    localStorage.setItem('has_seen_first_create_popup', '1')
                    setShowJumpToChatPopup(false)
                    setShowJumpHintPopup(true)
                  }}
                  className="btn-secondary flex-1 py-2"
                >
                  否
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 第二步弹窗：告知可到偏好设置更改 */}
      <AnimatePresence>
        {showJumpHintPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="card max-w-md w-full mx-4 p-6"
            >
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-3 text-center">提示</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6 text-center text-sm leading-relaxed">
                好哒~后面可以到用户偏好设置内更改
              </p>
              <button
                onClick={() => {
                  setShowJumpHintPopup(false)
                  // 根据用户选择跳转
                  const autoJump = useSettingsStore.getState().settings?.autoJumpToChat
                  if (autoJump) {
                    navigate('/chat', { state: { characterId: useCharacterStore.getState().currentCharacter?.id } })
                  } else {
                    navigate('/main')
                  }
                }}
                className="btn-primary w-full py-2"
              >
                知道了
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}