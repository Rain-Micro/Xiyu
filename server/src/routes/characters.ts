import { Router, Request, Response } from 'express'
import { query } from '../db'

const router = Router()

/** GET /api/characters — 当前用户的自定义角色列表 */
router.get('/', async (req: Request, res: Response) => {
  const auth = req.auth!
  try {
    const { rows } = await query<{ data: unknown }>(
      'SELECT data FROM user_characters WHERE user_id=$1 ORDER BY created_at ASC',
      [auth.userId],
    )
    res.json({ characters: rows.map((row) => row.data) })
  } catch (err) {
    console.error('[Characters] 获取列表失败:', err)
    res.status(500).json({ error: '获取角色列表失败' })
  }
})

/** POST /api/characters — upsert 自定义角色。body: { character }（userId 取自 JWT） */
router.post('/', async (req: Request, res: Response) => {
  const auth = req.auth!
  const character = req.body?.character

  if (!character?.id) {
    res.status(400).json({ error: '缺少必要参数' })
    return
  }

  try {
    await query(
      `INSERT INTO user_characters (id, user_id, data)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET data=$3`,
      [String(character.id), auth.userId, JSON.stringify(character)],
    )
    res.json({ success: true })
  } catch (err) {
    console.error('[Characters] 创建失败:', err)
    res.status(500).json({ error: '创建角色失败' })
  }
})

/** PATCH /api/characters/:id — 更新角色 data（仅本人） */
router.patch('/:id', async (req: Request, res: Response) => {
  const auth = req.auth!
  const { id } = req.params
  const character = req.body?.character

  if (!character) {
    res.status(400).json({ error: '缺少必要参数' })
    return
  }

  try {
    const { rowCount } = await query(
      'UPDATE user_characters SET data=$1 WHERE id=$2 AND user_id=$3',
      [JSON.stringify(character), id, auth.userId],
    )
    if (!rowCount) {
      res.status(404).json({ error: '角色不存在' })
      return
    }
    res.json({ success: true })
  } catch (err) {
    console.error('[Characters] 更新失败:', err)
    res.status(500).json({ error: '更新角色失败' })
  }
})

/** DELETE /api/characters/:id — 删除角色（仅本人） */
router.delete('/:id', async (req: Request, res: Response) => {
  const auth = req.auth!
  const { id } = req.params

  try {
    await query('DELETE FROM user_characters WHERE id=$1 AND user_id=$2', [id, auth.userId])
    res.json({ success: true })
  } catch (err) {
    console.error('[Characters] 删除失败:', err)
    res.status(500).json({ error: '删除角色失败' })
  }
})

export default router
