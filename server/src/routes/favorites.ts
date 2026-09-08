import { Router, Request, Response } from 'express'
import { query } from '../db'

const router = Router()

/** GET /api/favorites — 当前用户收藏列表（置顶优先，其余按时间倒序） */
router.get('/', async (req: Request, res: Response) => {
  const auth = req.auth!
  try {
    const { rows } = await query<{ data: unknown }>(
      'SELECT data FROM favorites WHERE user_id=$1 ORDER BY is_pinned DESC, created_at DESC',
      [auth.userId],
    )
    res.json({ favorites: rows.map((row) => row.data) })
  } catch (err) {
    console.error('[Favorites] 获取列表失败:', err)
    res.status(500).json({ error: '获取收藏列表失败' })
  }
})

/**
 * POST /api/favorites — upsert 收藏。body: { favorite }（userId 取自 JWT）
 * created_at 统一服务端时间（修复旧实现把 ISO 字符串写入时间列的冲突）。
 */
router.post('/', async (req: Request, res: Response) => {
  const auth = req.auth!
  const favorite = req.body?.favorite

  if (!favorite?.id) {
    res.status(400).json({ error: '缺少必要参数' })
    return
  }

  try {
    await query(
      `INSERT INTO favorites (id, user_id, data, is_pinned)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET data=$3, is_pinned=$4`,
      [String(favorite.id), auth.userId, JSON.stringify(favorite), Boolean(favorite.isPinned)],
    )
    res.json({ success: true })
  } catch (err) {
    console.error('[Favorites] 添加失败:', err)
    res.status(500).json({ error: '添加收藏失败' })
  }
})

/** PATCH /api/favorites/:id — 更新收藏（置顶等；body: { updates } 或 { isPinned }，仅本人） */
router.patch('/:id', async (req: Request, res: Response) => {
  const auth = req.auth!
  const { id } = req.params
  const body = req.body || {}
  const updates = body.updates

  if (!updates && typeof body.isPinned !== 'boolean') {
    res.status(400).json({ error: '缺少必要参数' })
    return
  }

  try {
    const existing = await query<{ data: Record<string, unknown>; is_pinned: boolean }>(
      'SELECT data, is_pinned FROM favorites WHERE id=$1 AND user_id=$2',
      [id, auth.userId],
    )
    if (existing.rows.length === 0) {
      res.status(404).json({ error: '收藏不存在' })
      return
    }

    const merged = updates
      ? { ...existing.rows[0].data, ...updates, id }
      : existing.rows[0].data
    const isPinned = typeof body.isPinned === 'boolean'
      ? body.isPinned
      : typeof merged.isPinned === 'boolean' ? merged.isPinned : existing.rows[0].is_pinned

    await query(
      'UPDATE favorites SET data=$1, is_pinned=$2 WHERE id=$3 AND user_id=$4',
      [JSON.stringify(merged), isPinned, id, auth.userId],
    )
    res.json({ success: true })
  } catch (err) {
    console.error('[Favorites] 更新失败:', err)
    res.status(500).json({ error: '更新收藏失败' })
  }
})

/** DELETE /api/favorites/:id — 删除收藏（仅本人） */
router.delete('/:id', async (req: Request, res: Response) => {
  const auth = req.auth!
  const { id } = req.params

  try {
    await query('DELETE FROM favorites WHERE id=$1 AND user_id=$2', [id, auth.userId])
    res.json({ success: true })
  } catch (err) {
    console.error('[Favorites] 删除失败:', err)
    res.status(500).json({ error: '删除收藏失败' })
  }
})

export default router
