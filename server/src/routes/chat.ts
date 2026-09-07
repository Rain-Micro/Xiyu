import { Router, Request, Response } from 'express'
import { supabase } from '../supabase'
import { PLATFORM_KNOWLEDGE } from '../services/platformKnowledge'
import mammoth from 'mammoth'
import pdfParse from 'pdf-parse'

const router = Router()
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'

function stripMarkdown(text: string): string {
  if (!text) return text
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-+]\s+/gm, '')
}

// 获取角色的系统提示词（基于角色设定）
async function getCharacterSystemPrompt(
  characterId: string,
  userId: string,
  profile?: {
    name: string; personality: string[]; tone: string; background: string;
    hobbies?: string[]; greeting?: string; characterSayings?: string[];
    relationship?: string; likedFoods?: string[]; dislikedThings?: string[];
    oocBehaviors?: string[]
  }
): Promise<string> {
  // 如果前端传了角色档案，直接使用
  if (profile) {
    const name = profile.name || '角色'
    const personality = profile.personality?.length ? profile.personality : ['温柔', '友好']
    const tone = profile.tone || '温和'
    const background = profile.background || ''

    let systemPrompt = `你是一个叫“${name}”的数字人角色。\n`
    if (profile.relationship) {
      systemPrompt += `你与用户的关系：${profile.relationship}。\n`
    }
    systemPrompt += `你的性格特点：${personality.join('、')}。\n`
    systemPrompt += `你的语气风格：${tone}。\n`
    if (background) {
      systemPrompt += `你的背景故事：${background}。\n`
    }
    if (profile.hobbies && profile.hobbies.length > 0) {
      systemPrompt += `你的兴趣爱好：${profile.hobbies.join('、')}。\n`
    }
    if (profile.likedFoods && profile.likedFoods.length > 0) {
      systemPrompt += `你喜欢的食物：${profile.likedFoods.join('、')}。\n`
    }
    if (profile.dislikedThings && profile.dislikedThings.length > 0) {
      systemPrompt += `你讨厌的事物：${profile.dislikedThings.join('、')}。\n`
    }
    if (profile.greeting) {
      systemPrompt += `你的开场白：${profile.greeting}\n`
    }
    if (profile.characterSayings && profile.characterSayings.length > 0) {
      systemPrompt += `你常说的话：${profile.characterSayings.join('、')}。\n`
    }
    if (profile.oocBehaviors && profile.oocBehaviors.length > 0) {
      systemPrompt += `你不应该做出的行为：${profile.oocBehaviors.join('、')}。\n`
    }
    systemPrompt += '请用符合你性格的方式与用户对话，保持自然、温暖、有个性。\n'
    systemPrompt += '回复中不使用任何Markdown格式符号（如星号*、下划线_等），直接用纯文本回复。'
    return systemPrompt
  }

  // 回退：从 Supabase 查询角色数据
  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('id', characterId)
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    return '你是一个温柔、友好的AI助手。回复中不使用Markdown格式符号。'
  }

  const name = data.name || '角色'
  const personality = data.personality_traits || ['温柔', '友好']
  const tone = data.tone || '温和'
  const background = data.background || ''
  const characterSayings = data.character_sayings || []
  const greeting = data.greeting || '你好，很高兴见到你！'

  let systemPrompt = `你是一个叫"${name}"的数字人角色。\n`
  systemPrompt += `你的性格特点：${personality.join('、')}。\n`
  systemPrompt += `你的语气风格：${tone}。\n`
  if (background) {
    systemPrompt += `你的背景故事：${background}。\n`
  }
  if (characterSayings.length > 0) {
    systemPrompt += `你常说的话：${characterSayings.join('、')}。\n`
  }
  systemPrompt += `你的开场白：${greeting}\n`
  systemPrompt += '请用符合你性格的方式与用户对话，保持自然、温暖、有个性。\n'
  systemPrompt += '回复中不使用任何Markdown格式符号（如星号*、下划线_等），直接用纯文本回复。'
  return systemPrompt
}

// 获取对话历史（最近20条）
async function getChatHistory(characterId: string, userId: string, limit: number = 20) {
  const { data, error } = await supabase
    .from('messages')
    .select('role, content')
    .eq('character_id', characterId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) return []
  return data || []
}

// 从文档中提取文本
async function extractTextFromDocument(fileType: string, base64Content: string): Promise<string> {
  const buffer = Buffer.from(base64Content, 'base64')

  if (fileType === 'docx') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  if (fileType === 'pdf') {
    const result = await pdfParse(buffer)
    return result.text
  }

  if (fileType === 'txt') {
    return buffer.toString('utf-8')
  }

  return ''
}

// 调用 DeepSeek API（文本）
async function callDeepSeekText(messages: object[], temperature: number = 0.7): Promise<string> {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      messages,
      temperature,
      max_tokens: 1024,
      stream: false,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[DeepSeek API 错误]', response.status, errorText)
    throw new Error('AI 服务调用失败')
  }

  const data = await response.json() as { choices?: { message?: { content?: string } }[] }
  return stripMarkdown(data.choices?.[0]?.message?.content || '抱歉，我暂时无法回复。')
}

// AI 对话接口（支持文档和图片）
router.post('/completion', async (req: Request, res: Response) => {
  const { characterId, userId, message, documentContent, imageContent, ocrText, characterProfile } = req.body

  if (!characterId || !userId || !message) {
    return res.status(400).json({ error: '缺少必要参数' })
  }

  try {
    // 1. 获取角色系统提示词
    if (characterProfile) {
      console.log('[Chat] 收到角色设定:', characterProfile.name, '性格:', characterProfile.personality?.join(','), '语气:', characterProfile.tone)
    } else {
      console.log('[Chat] 未收到角色设定，使用默认提示词')
    }
    const systemPrompt = await getCharacterSystemPrompt(characterId, userId, characterProfile)

    // 2. 获取对话历史
    const history = await getChatHistory(characterId, userId, 20)

    // 3. 处理文档内容
    let userMessageContent = message
    if (documentContent) {
      try {
        const extractedText = await extractTextFromDocument(documentContent.fileType, documentContent.base64)
        const truncatedText = extractedText.slice(0, 4000)
        userMessageContent = `[用户发送了文档，以下是文档内容：\n${truncatedText}\n\n用户消息：${message}]`
      } catch (err) {
        console.error('[Chat] 文档解析失败:', err)
        userMessageContent = `[用户发送了文档但解析失败。用户消息：${message}]`
      }
    }

    // 4. 处理图片内容 - DeepSeek V4 不支持多模态输入，直接使用 OCR 文字
    if (imageContent) {
      if (ocrText && ocrText.trim()) {
        userMessageContent = `[用户发送了一张图片，通过OCR识别到以下文字内容：\n${ocrText.slice(0, 2000)}\n\n用户消息：${message}]`
        console.log('[Chat] 使用 OCR 文字作为图片内容处理')
      } else {
        userMessageContent = `[用户发送了一张图片，但无法识别图片内容。用户消息：${message}]`
      }
    }

    // 5. 文本对话（可能包含文档内容或 OCR 文字）
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map((h: { role: string; content: string }) => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content,
      })),
      { role: 'user', content: userMessageContent },
    ]

    const reply = await callDeepSeekText(messages)

    // 6. 存储 AI 回复
    await supabase.from('messages').insert({
      user_id: userId,
      character_id: characterId,
      role: 'assistant',
      content: reply,
    })

    res.json({ reply })
  } catch (error) {
    console.error('[Chat API 错误]', error)
    res.status(500).json({ error: '聊天服务异常' })
  }
})

// 悬浮球 AI 助手接口
router.post('/assistant', async (req: Request, res: Response) => {
  const { userId, message, assistantName, assistantPersonality } = req.body

  if (!userId || !message) {
    return res.status(400).json({ error: '缺少必要参数' })
  }

  try {
    let systemPrompt = PLATFORM_KNOWLEDGE
    if (assistantName && assistantPersonality) {
      systemPrompt += `\n\n你的名字是"${assistantName}"，你的性格特点是：${assistantPersonality}。请用符合你性格的方式回答用户。`
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ]

    const reply = await callDeepSeekText(messages, 0.5)

    res.json({ reply })
  } catch (error) {
    console.error('[Assistant API 错误]', error)
    res.status(500).json({ error: '助手服务异常' })
  }
})

// AI 解析文件内容为角色字段
router.post('/parse-character', async (req: Request, res: Response) => {
  const { text } = req.body

  if (!text || !text.trim()) {
    return res.status(400).json({ error: '缺少文件内容' })
  }

  const systemPrompt = `你是一个角色设定解析助手。用户会提供一段关于角色设定的文字描述，请从中提取以下字段并以 JSON 格式返回。
如果某个字段在文字中没有明确提到，请返回空字符串或空数组。

字段说明：
- name: 角色姓名
- age: 年纪
- birthday: 生日（格式：YYYY-MM-DD）
- gender: 性别
- relationship: 角色与用户的关系
- userTitle: 对用户的称呼
- userNote: 用户对角色的备注
- anniversary: 与角色的重要纪念日
- likedFoods: 喜欢的食物（数组）
- dislikedFoods: 不喜欢的食物/忌口（数组）
- hobbies: 兴趣爱好（数组）
- dislikedThings: 讨厌的事（数组）
- personalityTraits: 性格特点（数组）
- characterSayings: 常说的话（数组）
- greeting: 开场白
- userDislikes: 用户特别不喜欢的事（数组）
- oocBehaviors: 不希望出现的 OOC 行为（数组）
- unmatched: 无法匹配到上述任何字段的文字内容（字符串）

请仅返回 JSON，不要添加其他内容。不要使用 Markdown 格式。`

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请解析以下角色设定文字：\n\n${text}` },
    ]

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages,
        temperature: 0.1,
        max_tokens: 2048,
        stream: false,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[DeepSeek Parse API 错误]', response.status, errorText)
      return res.status(500).json({ error: 'AI 解析服务调用失败' })
    }

    const data = await response.json() as { choices?: { message?: { content?: string } }[] }
    let content = data.choices?.[0]?.message?.content || '{}'

    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(content)
    } catch {
      console.error('[Parse Character] JSON 解析失败:', content)
      return res.status(500).json({ error: 'AI 返回格式异常' })
    }

    res.json({ data: parsed })
  } catch (error) {
    console.error('[Parse Character API 错误]', error)
    res.status(500).json({ error: '解析失败' })
  }
})

export default router
