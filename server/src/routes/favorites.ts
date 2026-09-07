import { Router, Request, Response } from 'express'
import { supabase } from '../supabase'

const router = Router()

// 获取用户收藏列表
router.get('/', async (req: Request, res: Response) => {
  const userId = req.query.userId as string

  if (!userId) {
    return res.status(400).json({ error: '缺少 userId' })
  }

  try {
    const { data, error } = await supabase
      .from('favorites')
      .select('data')
      .eq('user_id', userId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Favorites] 获取列表失败:', error)
      return res.status(500).json({ error: error.message })
    }

    const favorites = (data || []).map((row) => row.data)
    res.json({ favorites })
  } catch (err) {
    console.error('[Favorites API 错误]', err)
    res.status(500).json({ error: '获取收藏列表失败' })
  }
})

// 添加收藏
router.post('/', async (req: Request, res: Response) => {
  const { favorite, userId } = req.body

  if (!favorite || !userId) {
    return res.status(400).json({ error: '缺少必要参数' })
  }

  try {
    const { error } = await supabase.from('favorites').upsert({
      id: favorite.id,
      user_id: userId,
      data: favorite,
      created_at: new Date(favorite.createdAt || Date.now()).toISOString(),
      is_pinned: favorite.isPinned || false,
      // content 不传了，让数据库用默认值
    }, { onConflict: 'id' })
    if (error) {
        console.error('[Favorites] 添加失败:', error)
        return res.status(500).json({ error: error.message })
    }
    res.json({ success: true })
  } catch (err) {
    console.error('[Favorites API 错误]', err)
    res.status(500).json({ error: '添加收藏失败' })
  }
})

// 更新收藏（置顶等）
router.patch('/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const { updates } = req.body

  if (!id || !updates) {
    return res.status(400).json({ error: '缺少必要参数' })
  }

  try {
    const dbUpdates: Record<string, unknown> = {}

    if (updates.isPinned !== undefined) {
      dbUpdates.is_pinned = updates.isPinned
    }

    if (Object.keys(updates).length > 0) {
      const { data: existing } = await supabase
        .from('favorites')
        .select('data')
        .eq('id', id)
        .single()

      if (existing) {
        dbUpdates.data = { ...existing.data, ...updates }
      }

      const { error } = await supabase.from('favorites').update(dbUpdates).eq('id', id)

      if (error) {
        console.error('[Favorites] 更新失败:', error)
        return res.status(500).json({ error: error.message })
      }
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[Favorites API 错误]', err)
    res.status(500).json({ error: '更新收藏失败' })
  }
})

// 删除收藏
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ error: '缺少 id' })
  }

  try {
    const { error } = await supabase.from('favorites').delete().eq('id', id)

    if (error) {
      console.error('[Favorites] 删除失败:', error)
      return res.status(500).json({ error: error.message })
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[Favorites API 错误]', err)
    res.status(500).json({ error: '删除收藏失败' })
  }
})

export default router
