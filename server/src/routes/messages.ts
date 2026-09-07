import { Router, Request, Response } from 'express'
import { supabase } from '../supabase'

const router = Router()

// 存储消息
router.post('/', async (req: Request, res: Response) => {
  const { userId, characterId, role, content } = req.body

  if (!userId || !characterId || !role || !content) {
    return res.status(400).json({ error: '缺少必要参数' })
  }

  if (role !== 'user' && role !== 'assistant') {
    return res.status(400).json({ error: 'role 必须是 user 或 assistant' })
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({ 
      user_id: userId, 
      character_id: characterId, 
      role, 
      content 
    })
    .select()
    .single()

  if (error) {
    console.error('[messages] 存储消息失败:', error)
    return res.status(500).json({ error: error.message })
  }

  res.json({ success: true, message: data })
})

// 获取某个角色的所有消息
router.get('/:characterId', async (req: Request, res: Response) => {
  const { characterId } = req.params
  const { userId } = req.query

  if (!userId) {
    return res.status(400).json({ error: '缺少 userId' })
  }

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('character_id', characterId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[messages] 获取消息失败:', error)
    return res.status(500).json({ error: error.message })
  }

  res.json({ messages: data || [] })
})

// 删除某个角色的所有消息（清空聊天记录）
router.delete('/:characterId', async (req: Request, res: Response) => {
  const { characterId } = req.params
  const { userId } = req.query

  if (!userId) {
    return res.status(400).json({ error: '缺少 userId' })
  }

  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('character_id', characterId)
    .eq('user_id', userId)

  if (error) {
    console.error('[messages] 删除消息失败:', error)
    return res.status(500).json({ error: error.message })
  }

  res.json({ success: true })
})

export default router