import { motion, AnimatePresence } from 'framer-motion'
import { X, Forward } from 'lucide-react'
import type { Character } from '@/types'

interface ForwardDialogProps {
  visible: boolean
  characters: Character[]
  currentCharacterId: string
  onClose: () => void
  onSelect: (character: Character) => void
}

export default function ForwardDialog({
  visible,
  characters,
  currentCharacterId,
  onClose,
  onSelect,
}: ForwardDialogProps) {
  const availableCharacters = characters.filter((c) => c.id !== currentCharacterId)

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.9 }}
            className="card max-w-sm w-full max-h-[60vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶部 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Forward className="w-5 h-5 text-primary-500" />
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">转发给</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* 角色列表 */}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-2">
              {availableCharacters.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                  <Forward className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">没有可转发的角色</p>
                </div>
              ) : (
                availableCharacters.map((character) => {
                  const name = character.profile.background || character.profile.name
                  return (
                    <button
                      key={character.id}
                      onClick={() => {
                        onSelect(character)
                        onClose()
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                          {name}
                        </p>
                        {character.tags && character.tags.length > 0 && (
                          <p className="text-xs text-gray-400 truncate">
                            {character.tags.join('、')}
                          </p>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
