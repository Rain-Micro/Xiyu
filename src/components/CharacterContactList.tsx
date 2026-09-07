import { useState, useMemo, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Trash2, Pin, AlertTriangle, Edit3, Bot } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCharacterStore, useUIStore, useChatStore } from '@/stores'
import { getAssistantSeed } from '@/services/assistantData'
import type { Character } from '@/types'
import AssistantProfileEditor from '@/components/AssistantProfileEditor'

// 简单的中文拼音首字母提取（简化版，支持英文直接取首字母）
function getInitialLetter(name: string): string {
  if (!name) return '#'
  const firstChar = name.charAt(0)
  // 英文字母直接返回大写
  if (/[a-zA-Z]/.test(firstChar)) {
    return firstChar.toUpperCase()
  }
  // 中文字符使用 unicode 范围近似映射（简化版）
  const code = firstChar.charCodeAt(0)
  if (code >= 0x4e00 && code <= 0x9fff) {
    // 简化的拼音首字母映射表
    const pinyinMap: Record<string, string> = {
      '阿': 'A', '八': 'B', '擦': 'C', '打': 'D', '蛾': 'E', '发': 'F', '噶': 'G',
      '哈': 'H', '击': 'J', '喀': 'K', '垃': 'L', '妈': 'M', '拿': 'N', '哦': 'O',
      '啪': 'P', '期': 'Q', '然': 'R', '撒': 'S', '他': 'T', '挖': 'W', '希': 'X',
      '压': 'Y', '匝': 'Z'
    }
    // 近似查找
    for (const [char, letter] of Object.entries(pinyinMap)) {
      if (code <= char.charCodeAt(0)) {
        return letter
      }
    }
    return 'Z'
  }
  // 数字或其他字符归到 #
  if (/[0-9]/.test(firstChar)) return '#'
  return '#'
}

interface GroupedCharacters {
  letter: string
  characters: Character[]
}

export default function CharacterContactList() {
  const navigate = useNavigate()
  const { characters, setCurrentCharacter, deleteCharacter } = useCharacterStore()
  const { setCharacterSelectorOpen } = useUIStore()
  const { clearMessagesDB } = useChatStore()
  const [searchText, setSearchText] = useState('')
  const [activeLetter, setActiveLetter] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    character: Character
  } | null>(null)

  // 删除确认弹窗
  const [deleteTarget, setDeleteTarget] = useState<Character | null>(null)
  // 助手档案编辑弹窗
  const [editAssistantTarget, setEditAssistantTarget] = useState<Character | null>(null)

  // 关闭右键菜单（点击任意位置）
  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  // 右键点击角色
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, character: Character) => {
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ x: e.clientX, y: e.clientY, character })
    },
    []
  )

  // 删除角色确认
  const handleDeleteCharacter = async () => {
    if (!deleteTarget) return
    await clearMessagesDB(deleteTarget.id)
    deleteCharacter(deleteTarget.id)
    setDeleteTarget(null)
  }

  // 按首字母分组（支持标签搜索 + 置顶排序 + AI助手分组）
  const groupedCharacters = useMemo((): GroupedCharacters[] => {
    const kw = searchText.toLowerCase()
    const filtered = characters.filter((c) => {
      const name = c.profile?.name || c.name || ''
      // 匹配名称
      if (name.toLowerCase().includes(kw)) return true
      // 匹配备注
      if (c.profile?.background?.toLowerCase().includes(kw)) return true
      // 匹配标签
      if (c.tags?.some((t) => t.toLowerCase().includes(kw))) return true
      return false
    })

    // 置顶项（含助手和角色）优先分组
    const pinned = filtered.filter((c) => c.isPinned)
    // 非置顶AI助手
    const assistants = filtered.filter((c) => c.isAssistant && !c.isPinned)
    // 非置顶普通角色
    const normal = filtered.filter((c) => !c.isPinned && !c.isAssistant)

    const groups: Record<string, Character[]> = {}

    // 置顶分组（最顶部）
    if (pinned.length > 0) {
      groups['置顶'] = pinned
    }

    // 非置顶AI助手分组
    if (assistants.length > 0) {
      groups['AI助手'] = assistants
    }

    // 普通角色按首字母分组
    for (const char of normal) {
      const letter = getInitialLetter(char.profile?.name || char.name || '未知')
      if (!groups[letter]) {
        groups[letter] = []
      }
      groups[letter].push(char)
    }

    // 排序：置顶最前，AI助手其次，然后字母 A-Z，# 排最后
    const sortedLetters = Object.keys(groups).sort((a, b) => {
      if (a === '置顶') return -1
      if (b === '置顶') return 1
      if (a === 'AI助手') return -1
      if (b === 'AI助手') return 1
      if (a === '#') return 1
      if (b === '#') return -1
      return a.localeCompare(b)
    })

    return sortedLetters.map((letter) => ({
      letter,
      characters: groups[letter]
    }))
  }, [characters, searchText])

  // 右侧字母索引
  const indexLetters = useMemo(() => {
    return groupedCharacters.map((g) => g.letter)
  }, [groupedCharacters])

  // 点击角色进入聊天界面
  const handleSelectCharacter = (character: Character) => {
    setCurrentCharacter(character)
    setCharacterSelectorOpen(false)
    navigate('/chat')
  }

  // 点击右侧索引快速滚动
  const handleLetterClick = (letter: string) => {
    setActiveLetter(letter)
    const el = document.getElementById(`group-${letter}`)
    if (el && listRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    setTimeout(() => setActiveLetter(''), 1000)
  }

  return (
    <motion.div
      id="contact-list"
      initial={{ scale: 0.9, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.9, opacity: 0, y: 20 }}
      className="card max-w-md w-full max-h-[80vh] flex flex-col overflow-hidden"
    >
      {/* 头部 */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">角色通讯录</h2>
        <button
          onClick={() => setCharacterSelectorOpen(false)}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* 搜索框 */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="input-field pl-9 text-sm"
          placeholder="搜索角色名称或标签..."
        />
      </div>

      {/* 角色列表 */}
      <div className="flex-1 overflow-hidden flex">
        <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-thin">
          {groupedCharacters.length === 0 && (
            <div className="text-center text-gray-400 dark:text-gray-500 py-12">
              {searchText ? '未找到匹配的角色' : '暂无角色，快去创建一个吧'}
            </div>
          )}

          {groupedCharacters.map((group) => (
            <div key={group.letter} id={`group-${group.letter}`}>
              {/* 分组标题 */}
              <div className="sticky top-0 bg-primary-50 dark:bg-primary-900/30 px-3 py-1 text-xs font-bold text-primary-600 dark:text-primary-400">
                {group.letter}
              </div>

              {/* 角色列表 */}
              {group.characters.map((character) => {
                // 助手优先显示用户备注，无备注则显示助手名；角色优先显示备注（background），无则显示角色名
                const displayCharName = character.isAssistant
                  ? (character.assistantEditable?.userNote || character.profile?.name || character.name || '未知')
                  : (character.profile?.background || character.profile?.name || character.name || '未知')
                const seed = character.assistantId ? getAssistantSeed(character.assistantId) : undefined
                return (
                <button
                  key={character.id}
                  onClick={() => handleSelectCharacter(character)}
                  onContextMenu={(e) => handleContextMenu(e, character)}
                  className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-100 dark:border-gray-700/50"
                >
                  {/* 头像 */}
                  <div className={`w-10 h-10 rounded-full ${seed ? `bg-gradient-to-br ${seed.avatarColor}` : 'bg-gradient-to-br from-primary-400 to-purple-500'} flex items-center justify-center text-white font-bold text-sm flex-shrink-0 relative`}>
                    {displayCharName.charAt(0)}
                    {character.isAssistant && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm">
                        <Bot className="w-3 h-3 text-primary-500" />
                      </span>
                    )}
                  </div>
                  {/* 名称 */}
                  <div className="text-left flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                        {displayCharName}
                      </p>
                      {character.isPinned && (
                        <Pin className="w-3 h-3 text-primary-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                      {character.tags && character.tags.length > 0
                        ? character.tags.join('、')
                        : character.profile?.personality?.[0] || '默认角色'}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">&gt;</span>
                </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* 右侧字母索引 */}
        {indexLetters.length > 0 && (
          <div className="w-8 flex-shrink-0 flex flex-col items-center py-1">
            {indexLetters.map((letter) => (
              <button
                key={letter}
                onClick={() => handleLetterClick(letter)}
                className={`text-xs py-0.5 transition-colors ${
                  activeLetter === letter
                    ? 'text-primary-500 font-bold'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                {letter}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      <AnimatePresence>
        {contextMenu && (
          <>
            {/* 透明遮罩，点击关闭菜单 */}
            <div
              className="fixed inset-0 z-[200]"
              onClick={closeContextMenu}
              onContextMenu={(e) => {
                e.preventDefault()
                closeContextMenu()
              }}
            />
            {/* 右键菜单内容 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.1 }}
              className="fixed z-[201] min-w-[160px] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 py-1 overflow-hidden"
              style={{
                left: Math.min(contextMenu.x, window.innerWidth - 180),
                top: Math.min(contextMenu.y, window.innerHeight - 120),
              }}
            >
              {/* 助手：编辑档案 */}
              {contextMenu.character.isAssistant && (
                <button
                  onClick={() => {
                    setEditAssistantTarget(contextMenu.character)
                    setContextMenu(null)
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  编辑档案
                </button>
              )}
              {/* 非助手：删除角色 */}
              {!contextMenu.character.isAssistant && (
                <button
                  onClick={() => {
                    setDeleteTarget(contextMenu.character)
                    setContextMenu(null)
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  删除角色
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 删除角色确认弹窗 */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setDeleteTarget(null)}
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
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">删除角色</h3>
              </div>
              <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm leading-relaxed">
                确认删除{deleteTarget.profile?.background || deleteTarget.profile?.name || deleteTarget.name || '未知角色'}吗？删除后有关{deleteTarget.profile?.background || deleteTarget.profile?.name || deleteTarget.name || '未知角色'}的内容都会被清除
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteCharacter}
                  className="flex-1 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  确认删除
                </button>
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 助手档案编辑弹窗 */}
      <AnimatePresence>
        {editAssistantTarget && (
          <AssistantProfileEditor
            character={editAssistantTarget}
            onClose={() => setEditAssistantTarget(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
