import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Plus, Trash2, Calendar, Heart, User, Edit3 } from 'lucide-react'
import { useCharacterStore } from '@/stores'
import { getAssistantSeed } from '@/services/assistantData'
import { formatDate } from '@/utils/dateFormat'
import type { Character, AssistantEditableData } from '@/types'

const RELATIONSHIP_PRESETS = [
  '朋友', '搭档', '知己', '学长', '学姐',
  '学弟', '学妹', '同班同学', '邻居', '青梅竹马',
]

interface AssistantProfileEditorProps {
  character: Character
  onClose: () => void
}

export default function AssistantProfileEditor({ character, onClose }: AssistantProfileEditorProps) {
  const { updateCharacter } = useCharacterStore()
  const seed = character.assistantId ? getAssistantSeed(character.assistantId) : undefined

  const [editData, setEditData] = useState<AssistantEditableData>(
    character.assistantEditable || {
      relationship: '',
      relationshipCustom: '',
      userTitle: '',
      userNote: '',
      anniversary: '',
      userDislikes: [],
    }
  )
  const [newDislike, setNewDislike] = useState('')

  useEffect(() => {
    setEditData(
      character.assistantEditable || {
        relationship: '',
        relationshipCustom: '',
        userTitle: '',
        userNote: '',
        anniversary: '',
        userDislikes: [],
      }
    )
  }, [character.id])

  const handleSave = () => {
    const updated: Character = {
      ...character,
      assistantEditable: { ...editData },
    }
    updateCharacter(updated)
    onClose()
  }

  const handleAddDislike = () => {
    const trimmed = newDislike.trim()
    if (!trimmed) return
    const existing = editData.userDislikes || []
    if (!existing.includes(trimmed)) {
      setEditData({ ...editData, userDislikes: [...existing, trimmed] })
    }
    setNewDislike('')
  }

  const handleRemoveDislike = (item: string) => {
    setEditData({
      ...editData,
      userDislikes: (editData.userDislikes || []).filter((d) => d !== item),
    })
  }

  const isCustomRelation = editData.relationship === '其他'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col"
      >
        {/* 头部 */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${seed?.avatarColor || 'from-primary-400 to-purple-500'} flex items-center justify-center text-white font-bold text-lg shadow-md`}>
              {character.profile.name}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800 dark:text-white">编辑档案</h2>
              <p className="text-xs text-gray-400">{character.profile.name} · AI助手</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4 space-y-5">
          {/* 只读信息展示 */}
          <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 mb-1">
              <User className="w-3.5 h-3.5" />
              <span>基本信息（不可修改）</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-400 dark:text-gray-500">性别：</span>
                <span className="text-gray-700 dark:text-gray-300">
                  {character.profile.gender === 'female' ? '女' : character.profile.gender === 'male' ? '男' : '未定'}
                </span>
              </div>
              <div>
                <span className="text-gray-400 dark:text-gray-500">年龄：</span>
                <span className="text-gray-700 dark:text-gray-300">{character.profile.age}岁</span>
              </div>
              <div>
                <span className="text-gray-400 dark:text-gray-500">生日：</span>
                <span className="text-gray-700 dark:text-gray-300">{formatDate(character.profile.birthday)}</span>
              </div>
              <div>
                <span className="text-gray-400 dark:text-gray-500">称呼：</span>
                <span className="text-gray-700 dark:text-gray-300">{character.profile.address}</span>
              </div>
            </div>
            <div className="pt-2 border-t border-gray-200 dark:border-gray-600/50">
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {character.profile.background}
              </p>
            </div>
          </div>

          {/* 可编辑字段 */}
          <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
            <Edit3 className="w-4 h-4 text-primary-500" />
            <span>可编辑信息</span>
          </div>

          {/* 关系 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              助手与你的关系
            </label>
            <div className="flex gap-2">
              <select
                value={editData.relationship || ''}
                onChange={(e) =>
                  setEditData({ ...editData, relationship: e.target.value, relationshipCustom: '' })
                }
                className="input-field flex-1"
              >
                <option value="">请选择关系</option>
                {RELATIONSHIP_PRESETS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
                <option value="其他">其他（自定义）</option>
              </select>
            </div>
            {isCustomRelation && (
              <input
                type="text"
                value={editData.relationshipCustom || ''}
                onChange={(e) => setEditData({ ...editData, relationshipCustom: e.target.value })}
                className="input-field mt-2"
                placeholder="请输入自定义关系..."
              />
            )}
          </div>

          {/* 对用户的称呼 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              对你的称呼
            </label>
            <input
              type="text"
              value={editData.userTitle || ''}
              onChange={(e) => setEditData({ ...editData, userTitle: e.target.value })}
              className="input-field"
              placeholder="助手怎么称呼你？（默认使用你的昵称）"
            />
          </div>

          {/* 备注 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              你对助手的备注
            </label>
            <input
              type="text"
              value={editData.userNote || ''}
              onChange={(e) => setEditData({ ...editData, userNote: e.target.value })}
              className="input-field"
              placeholder="给助手添加一个备注（选填）"
            />
          </div>

          {/* 纪念日 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <Calendar className="w-4 h-4 inline mr-1 text-primary-400" />
              与助手的重要纪念日
            </label>
            <div className="date-input-wrapper">
              {!editData.anniversary && <span className="date-input-placeholder">选择日期</span>}
              <input
                type="date"
                placeholder="选择日期"
                value={editData.anniversary || ''}
                onChange={(e) => setEditData({ ...editData, anniversary: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          {/* 用户不喜欢的事 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              你特别不喜欢的事
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newDislike}
                onChange={(e) => setNewDislike(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddDislike()
                  }
                }}
                className="input-field flex-1"
                placeholder="添加你不喜欢的事，按回车确认"
              />
              <button
                onClick={handleAddDislike}
                disabled={!newDislike.trim()}
                className="btn-secondary px-3 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(editData.userDislikes || []).map((item, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50"
                >
                  {item}
                  <button
                    onClick={() => handleRemoveDislike(item)}
                    className="hover:bg-red-100 dark:hover:bg-red-800/30 rounded-full p-0.5 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {(!editData.userDislikes || editData.userDislikes.length === 0) && (
                <p className="text-xs text-gray-400">暂未添加，选填</p>
              )}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 py-2.5">
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-purple-500 text-white font-medium hover:shadow-lg transition-shadow flex items-center justify-center gap-2"
          >
            <Heart className="w-4 h-4" />
            保存
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
