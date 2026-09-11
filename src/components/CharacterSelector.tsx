import { motion } from 'framer-motion'
import { X, User, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore, useCharacterStore, useUIStore } from '@/stores'

export default function CharacterSelector() {
  const navigate = useNavigate()
  useAuthStore()
  const { characters, setCurrentCharacter } = useCharacterStore()
  const { setCharacterSelectorOpen, setCreateCharacterOpen } = useUIStore()

  const handleSelectCharacter = (character: typeof characters[0]) => {
    setCurrentCharacter(character)
    setCharacterSelectorOpen(false)
    navigate('/main')
  }

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      className="card max-w-2xl w-full max-h-[80vh] flex flex-col"
    >
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">选择角色</h2>
        <button onClick={() => setCharacterSelectorOpen(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {characters.length === 0 ? (
        <div className="text-center py-12">
          <User className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">还没有创建任何角色</p>
          <button
            onClick={() => {
              setCharacterSelectorOpen(false)
              setCreateCharacterOpen(true)
            }}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            创建角色
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 overflow-y-auto scrollbar-thin">
          {characters.map((character, index) => (
            <motion.button
              key={character.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => handleSelectCharacter(character)}
              className="flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all text-left"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-400 to-purple-500 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
                {character.profile.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-800 dark:text-white truncate">{character.profile.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {character.profile.personality.slice(0, 3).join(' · ')}
                </p>
              </div>
            </motion.button>
          ))}
          
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: characters.length * 0.1 }}
            onClick={() => {
              setCharacterSelectorOpen(false)
              setCreateCharacterOpen(true)
            }}
            className="flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
          >
            <Plus className="w-6 h-6" />
            <span className="font-medium">创建新角色</span>
          </motion.button>
        </div>
      )}
    </motion.div>
  )
}
