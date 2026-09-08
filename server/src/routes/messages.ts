import { Router, Request, Response } from 'express'
import { query } from '../db'

const router = Router()

/** POST /api/messages — 存一条消息。body: { characterId, role, content }（userId 取自 JWT） */
router.post('/', async (req: Request, res: Response) => {
  const auth = req.auth!
  const { characterId, role, content } = req.body || {}

  if (!characterId || !role || !content) {
    res.status(400).json({ error: '缺少必要参数' })
    return
  }

  if (role !== 'user' && role !== 'assistant') {
    res.status(400).json({ error: 'role 必须是 user 或 assistant' })
    return
  }

  try {
    const { rows } = await query(
      `INSERT INTO messages (user_id, character_id, role, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, character_id, role, content, created_at`,
      [auth.userId, String(characterId), role, String(content)],
    )
    res.json({ success: true, message: rows[0] })
  } catch (err) {
    console.error('[messages] 存储消息失败:', err)
    res.status(500).json({ error: '存储消息失败' })
  }
})

/** GET /api/messages/:characterId — 某角色全部消息（仅本人） */
router.get('/:characterId', async (req: Request, res: Response) => {
  const auth = req.auth!
  const { characterId } = req.params

  try {
    const { rows } = await query(
      `SELECT id, user_id, character_id, role, content, created_at
       FROM messages WHERE character_id=$1 AND user_id=$2 ORDER BY created_at ASC`,
      [characterId, auth.userId],
    )
    res.json({ messages: rows })
  } catch (err) {
    console.error('[messages] 获取消息失败:', err)
    res.status(500).json({ error: '获取消息失败' })
  }
})

/** DELETE /api/messages — 清空当前用户的全部云端消息（注销不留痕等场景） */
router.delete('/', async (req: Request, res: Response) => {
  const auth = req.auth!
  try {
    await query('DELETE FROM messages WHERE user_id=$1', [auth.userId])
    res.json({ success: true })
  } catch (err) {
    console.error('[messages] 清空全部消息失败:', err)
    res.status(500).json({ error: '清空消息失败' })
  }
})

/** DELETE /api/messages/:characterId — 清空某角色消息（仅本人） */
router.delete('/:characterId', async (req: Request, res: Response) => {
  const auth = req.auth!
  const { characterId } = req.params

  try {
    await query('DELETE FROM messages WHERE character_id=$1 AND user_id=$2', [characterId, auth.userId])
    res.json({ success: true })
  } catch (err) {
    console.error('[messages] 删除消息失败:', err)
    res.status(500).json({ error: '删除消息失败' })
  }
})

export default router
