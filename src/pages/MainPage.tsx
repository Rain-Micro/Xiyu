import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Users, UserPlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCharacterStore, useUIStore } from '@/stores'

export default function MainPage() {
  const navigate = useNavigate()
  const { currentCharacter, messages } = useCharacterStore()
  const { setCharacterSelectorOpen } = useUIStore()

  // 紧急保存机制
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentCharacter) {
        const emergencyData = {
          timestamp: Date.now(),
          character: currentCharacter,
          messages: messages.slice(-20)
        }
        localStorage.setItem('emergency-save', JSON.stringify(emergencyData))
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [currentCharacter, messages])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full w-full flex flex-col relative"
    >
      {/* 角色信息和问候 */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col sm:flex-row items-center gap-8">
          {/* 选择角色 */}
          <motion.button
            id="btn-select-character"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setCharacterSelectorOpen(true)}
            className="flex flex-col items-center gap-4 px-12 py-10 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-xl hover:shadow-2xl transition-shadow"
          >
            <Users className="w-16 h-16" />
            <span className="text-xl font-bold">选择角色</span>
          </motion.button>

          {/* 创建角色 */}
          <motion.button
            id="btn-create-character"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/create-character')}
            className="flex flex-col items-center gap-4 px-12 py-10 rounded-2xl bg-gradient-to-br from-purple-400 to-purple-600 text-white shadow-xl hover:shadow-2xl transition-shadow"
          >
            <UserPlus className="w-16 h-16" />
            <span className="text-xl font-bold">创建角色</span>
          </motion.button>
        </div>
      </div>

    </motion.div>
  )
}
