import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, FormInput, Sparkles, Upload, Wand2, Calendar } from 'lucide-react'
import { useAuthStore, useCharacterStore, useUIStore } from '@/stores'
import { db } from '@/services/db'
import { formatDate } from '@/utils/dateFormat'
import type { Character, CharacterProfile, CharacterSettings } from '@/types'

const steps = ['选择方式', '填写信息', '确认档案']

export default function CreateCharacter() {
  const { user } = useAuthStore()
  const { addCharacter, setCurrentCharacter } = useCharacterStore()
  const { setCreateCharacterOpen } = useUIStore()
  
  const [currentStep, setCurrentStep] = useState(0)
  const [createMethod, setCreateMethod] = useState<'import' | 'form'>('form')
  const [isPolishing, setIsPolishing] = useState(false)
  const [profile, setProfile] = useState<Partial<CharacterProfile>>({
    name: '',
    age: undefined,
    birthday: undefined,
    gender: 'other',
    personality: [],
    tone: '',
    address: '',
    hobbies: [],
    background: ''
  })
  const [personalityInput, setPersonalityInput] = useState('')
  const [hobbyInput, setHobbyInput] = useState('')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)

  const handleAddPersonality = () => {
    if (personalityInput.trim()) {
      setProfile({ ...profile, personality: [...(profile.personality || []), personalityInput.trim()] })
      setPersonalityInput('')
    }
  }

  const handleAddHobby = () => {
    if (hobbyInput.trim()) {
      setProfile({ ...profile, hobbies: [...(profile.hobbies || []), hobbyInput.trim()] })
      setHobbyInput('')
    }
  }

  const handlePolish = async () => {
    setIsPolishing(true)
    // 模拟 AI 润色
    await new Promise((resolve) => setTimeout(resolve, 1500))
    setProfile({
      ...profile,
      tone: profile.tone || '温柔亲切',
      background: profile.background || '一个神秘的角色，等待着与您展开精彩的故事...'
    })
    setIsPolishing(false)
  }

  const handleCreate = async () => {
    if (!user || !profile.name) return

    const characterId = `char-${Date.now()}`
    const fullProfile: CharacterProfile = {
      id: `profile-${Date.now()}`,
      userId: user.id,
      name: profile.name,
      age: profile.age,
      birthday: profile.birthday,
      gender: profile.gender || 'other',
      personality: profile.personality || [],
      tone: profile.tone || '温柔',
      address: profile.address || '你',
      hobbies: profile.hobbies || [],
      background: profile.background || '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const settings: CharacterSettings = {
      voiceType: 'default',
      voiceSpeed: 'normal',
      voicePitch: 'normal',
      decorations: []
    }

    const character: Character = {
      id: characterId,
      userId: user.id,
      profile: fullProfile,
      settings,
      createdAt: Date.now()
    }

    await db.profiles.add(fullProfile)
    addCharacter(character)
    setCurrentCharacter(character)
    setCreateCharacterOpen(false)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadedFile(file)
      // 模拟读取文件内容
      const reader = new FileReader()
      reader.onload = (event) => {
        const content = event.target?.result as string
        // 简单解析，提取姓名等信息
        setProfile({
          ...profile,
          name: file.name.split('.')[0],
          background: content.slice(0, 200)
        })
      }
      reader.readAsText(file)
    }
  }

  const isStepValid = () => {
    if (currentStep === 0) return true
    if (currentStep === 1) return profile.name && profile.name.length >= 1
    return true
  }

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      className="card max-w-2xl w-full max-h-[85vh] flex flex-col"
    >
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">创建角色</h2>
          <div className="flex items-center gap-2 mt-2">
            {steps.map((step, index) => (
              <div key={step} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  index <= currentStep
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                }`}>
                  {index + 1}
                </div>
                <span className={`text-sm ${
                  index <= currentStep ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'
                }`}>
                  {step}
                </span>
                {index < steps.length - 1 && (
                  <div className={`w-8 h-0.5 ${
                    index < currentStep ? 'bg-primary-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>
        <button onClick={() => setCreateCharacterOpen(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <AnimatePresence mode="wait">
          {currentStep === 0 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <p className="text-gray-600 dark:text-gray-300 mb-4">选择一种方式创建您的角色：</p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setCreateMethod('import')}
                  className={`p-6 rounded-xl border-2 transition-all text-left ${
                    createMethod === 'import'
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Upload className="w-8 h-8 text-primary-500 mb-3" />
                  <h3 className="font-bold text-gray-800 dark:text-white mb-1">文档导入</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    上传 txt / word / pdf / 图片，AI自动解析生成角色
                  </p>
                </button>
                <button
                  onClick={() => setCreateMethod('form')}
                  className={`p-6 rounded-xl border-2 transition-all text-left ${
                    createMethod === 'form'
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <FormInput className="w-8 h-8 text-primary-500 mb-3" />
                  <h3 className="font-bold text-gray-800 dark:text-white mb-1">模板填写</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    手动填写角色信息，可选AI润色
                  </p>
                </button>
              </div>
            </motion.div>
          )}

          {currentStep === 1 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              {createMethod === 'import' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    上传文件
                  </label>
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-primary-400 transition-colors">
                    <input
                      type="file"
                      accept=".txt,.doc,.docx,.pdf,.jpg,.png"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-600 dark:text-gray-300">
                        {uploadedFile ? uploadedFile.name : '点击上传文件'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        支持 txt, word, pdf, jpg, png
                      </p>
                    </label>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">姓名 *</label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className="input-field"
                    placeholder="角色姓名"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">年龄</label>
                  <input
                    type="number"
                    value={profile.age || ''}
                    onChange={(e) => setProfile({ ...profile, age: parseInt(e.target.value) || undefined })}
                    className="input-field"
                    placeholder="年龄"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">角色生日</label>
                <div className="date-input-wrapper">
                  {!profile.birthday && <span className="date-input-placeholder">选择日期</span>}
                  <input
                    type="date"
                    placeholder="选择日期"
                    value={profile.birthday || ''}
                    onChange={(e) => setProfile({ ...profile, birthday: e.target.value || undefined })}
                    className={`input-field w-full ${!profile.birthday ? 'date-empty' : ''}`}
                  />
                  <Calendar className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">性别</label>
                <div className="flex gap-2">
                  {(['male', 'female', 'other'] as const).map((gender) => (
                    <button
                      key={gender}
                      onClick={() => setProfile({ ...profile, gender })}
                      className={`flex-1 py-2 rounded-lg border-2 transition-colors ${
                        profile.gender === gender
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {gender === 'male' && '男'}
                      {gender === 'female' && '女'}
                      {gender === 'other' && '未定'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">性格标签</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={personalityInput}
                    onChange={(e) => setPersonalityInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddPersonality()}
                    className="input-field flex-1"
                    placeholder="输入性格标签，按回车添加"
                  />
                  <button onClick={handleAddPersonality} className="btn-secondary">添加</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {profile.personality?.map((p, i) => (
                    <span key={i} className="px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-sm flex items-center gap-1">
                      {p}
                      <button
                        onClick={() => setProfile({ ...profile, personality: profile.personality?.filter((_, idx) => idx !== i) })}
                        className="hover:text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">语气风格</label>
                <input
                  type="text"
                  value={profile.tone}
                  onChange={(e) => setProfile({ ...profile, tone: e.target.value })}
                  className="input-field"
                  placeholder="如：温柔亲切、活泼可爱、沉稳冷静..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">对用户的称呼</label>
                <input
                  type="text"
                  value={profile.address}
                  onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                  className="input-field"
                  placeholder="如：朋友、同学、伙伴..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">爱好</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={hobbyInput}
                    onChange={(e) => setHobbyInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddHobby()}
                    className="input-field flex-1"
                    placeholder="输入爱好，按回车添加"
                  />
                  <button onClick={handleAddHobby} className="btn-secondary">添加</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {profile.hobbies?.map((h, i) => (
                    <span key={i} className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-sm flex items-center gap-1">
                      {h}
                      <button
                        onClick={() => setProfile({ ...profile, hobbies: profile.hobbies?.filter((_, idx) => idx !== i) })}
                        className="hover:text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">背景故事</label>
                <textarea
                  value={profile.background}
                  onChange={(e) => setProfile({ ...profile, background: e.target.value })}
                  className="input-field min-h-[100px] resize-none"
                  placeholder="描述角色的背景故事..."
                />
              </div>

              <button
                onClick={handlePolish}
                disabled={isPolishing}
                className="w-full py-2 border-2 border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex items-center justify-center gap-2"
              >
                <Wand2 className={`w-4 h-4 ${isPolishing ? 'animate-spin' : ''}`} />
                {isPolishing ? 'AI 润色中...' : 'AI 润色'}
              </button>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-400 to-purple-500 flex items-center justify-center text-white text-2xl font-bold">
                    {profile.name?.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white">{profile.name}</h3>
                    <p className="text-gray-500 dark:text-gray-400">
                      {profile.age}岁 · {profile.gender === 'male' ? '男' : profile.gender === 'female' ? '女' : '未定'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">性格：</span>
                    <span className="text-gray-800 dark:text-gray-200">{profile.personality?.join('、') || '未设置'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">语气：</span>
                    <span className="text-gray-800 dark:text-gray-200">{profile.tone || '未设置'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">称呼：</span>
                    <span className="text-gray-800 dark:text-gray-200">{profile.address || '未设置'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">爱好：</span>
                    <span className="text-gray-800 dark:text-gray-200">{profile.hobbies?.join('、') || '未设置'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">生日：</span>
                    <span className="text-gray-800 dark:text-gray-200">{formatDate(profile.birthday)}</span>
                  </div>
                </div>

                <div>
                  <span className="text-gray-500 dark:text-gray-400 text-sm">背景故事：</span>
                  <p className="text-gray-700 dark:text-gray-300 mt-1 text-sm leading-relaxed">
                    {profile.background || '暂无背景故事'}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="btn-secondary flex-1"
                >
                  返回修改
                </button>
                <button
                  onClick={handleCreate}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  创建角色
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {currentStep < 2 && (
        <div className="flex justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="btn-secondary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            上一步
          </button>
          <button
            onClick={() => setCurrentStep(Math.min(2, currentStep + 1))}
            disabled={!isStepValid()}
            className="btn-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            下一步
          </button>
        </div>
      )}
    </motion.div>
  )
}
