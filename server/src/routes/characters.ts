import { Router, Request, Response } from 'express'
import { supabase } from '../supabase'

const router = Router()

// 获取用户角色列表
router.get('/', async (req: Request, res: Response) => {
  const userId = req.query.userId as string

  if (!userId) {
    return res.status(400).json({ error: '缺少 userId' })
  }

  try {
    const { data, error } = await supabase
      .from('user_characters')
      .select('data')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[Characters] 获取列表失败:', error)
      return res.status(500).json({ error: error.message })
    }

    const characters = (data || []).map((row) => row.data)
    res.json({ characters })
  } catch (err) {
    console.error('[Characters API 错误]', err)
    res.status(500).json({ error: '获取角色列表失败' })
  }
})

// 创建角色
router.post('/', async (req: Request, res: Response) => {
  const { character, userId } = req.body

  if (!character || !userId) {
    return res.status(400).json({ error: '缺少必要参数' })
  }

  try {
    const { error } = await supabase.from('user_characters').upsert({
      id: character.id,
      user_id: userId,
      data: character,
      created_at: character.createdAt || Date.now(),
    }, { onConflict: 'id' })

    if (error) {
      console.error('[Characters] 创建失败:', error)
      return res.status(500).json({ error: error.message })
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[Characters API 错误]', err)
    res.status(500).json({ error: '创建角色失败' })
  }
})

// 更新角色
router.patch('/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const { character } = req.body

  if (!id || !character) {
    return res.status(400).json({ error: '缺少必要参数' })
  }

  try {
    const { error } = await supabase
      .from('user_characters')
      .update({ data: character })
      .eq('id', id)

    if (error) {
      console.error('[Characters] 更新失败:', error)
      return res.status(500).json({ error: error.message })
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[Characters API 错误]', err)
    res.status(500).json({ error: '更新角色失败' })
  }
})

// 删除角色
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ error: '缺少 id' })
  }

  try {
    const { error } = await supabase.from('user_characters').delete().eq('id', id)

    if (error) {
      console.error('[Characters] 删除失败:', error)
      return res.status(500).json({ error: error.message })
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[Characters API 错误]', err)
    res.status(500).json({ error: '删除角色失败' })
  }
})

export default router
