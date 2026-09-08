import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { query } from '../db'

const router = Router()

const AVATAR_DIR = process.env.AVATAR_DIR || 'data/avatars'
const AVATAR_MAX_BYTES = 2 * 1024 * 1024 // 2MB
const AVATAR_EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/**
 * GET /api/users/me — 当前用户资料
 */
router.get('/me', async (req: Request, res: Response) => {
  const auth = req.auth!
  try {
    const { rows } = await query(
      `SELECT id, phone, email, nickname, avatar_url, birthday, role, pending_deletion, pending_deletion_at, created_at
       FROM users WHERE id=$1`,
      [auth.userId],
    )
    if (rows.length === 0) {
      res.status(404).json({ error: '用户不存在' })
      return
    }
    res.json({ user: rows[0] })
  } catch (err) {
    console.error('[users/me]', err)
    res.status(500).json({ error: '获取资料失败' })
  }
})

/**
 * PATCH /api/users/me — 更新昵称/生日/头像
 * body: { nickname?, birthday? ('YYYY-MM-DD'|null), avatar? (data:image/png;base64,... | '' 清除 | 不传=不改) }
 * 头像落盘 data/avatars/，库中存相对路径，经 GET /api/avatars/:file 下发。
 * SQL 全静态（COALESCE/CASE 哨兵），未提供的字段保持原值。
 */
router.patch('/me', async (req: Request, res: Response) => {
  const auth = req.auth!
  const { nickname, birthday, avatar } = req.body || {}

  let nicknameParam: string | null = null
  if (nickname !== undefined) {
    const name = String(nickname).trim()
    if (!name || name.length > 30) {
      res.status(400).json({ error: '昵称需为 1-30 个字符' })
      return
    }
    nicknameParam = name
  }

  let birthdayParam: string | null = null
  if (birthday !== undefined) {
    if (birthday !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(birthday))) {
      res.status(400).json({ error: '生日格式应为 YYYY-MM-DD' })
      return
    }
    birthdayParam = birthday === null ? null : String(birthday)
  }

  // 'not-provided' 哨兵：avatar 未传时保持原值；'' 表示清除；data URL 表示新头像
  let avatarParam = 'not-provided'
  if (avatar !== undefined) {
    if (avatar === null || avatar === '') {
      avatarParam = ''
    } else {
      const match = String(avatar).match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/)
      if (!match) {
        res.status(400).json({ error: '头像仅支持 png/jpeg/webp 的 data URL' })
        return
      }
      const ext = AVATAR_EXT_BY_TYPE[match[1]]
      const buf = Buffer.from(match[2], 'base64')
      if (buf.length === 0 || buf.length > AVATAR_MAX_BYTES) {
        res.status(400).json({ error: '头像大小需在 2MB 以内' })
        return
      }
      // 文件名完全由服务端生成（userId + 随机串 + 白名单扩展名），不含任何用户输入
      const fileName = `${auth.userId}-${crypto.randomBytes(6).toString('hex')}.${ext}`
      try {
        mkdirSync(AVATAR_DIR, { recursive: true })
        writeFileSync(join(AVATAR_DIR, fileName), buf)
      } catch (err) {
        console.error('[users/me] 头像写盘失败:', err)
        res.status(500).json({ error: '头像保存失败' })
        return
      }
      avatarParam = `/api/avatars/${fileName}`
    }
  }

  try {
    const { rows } = await query(
      `UPDATE users SET
         nickname   = COALESCE($2, nickname),
         birthday   = COALESCE($3, birthday),
         avatar_url = CASE
           WHEN $4 = ''             THEN NULL
           WHEN $4 = 'not-provided' THEN avatar_url
           ELSE $4
         END
       WHERE id=$1
       RETURNING id, phone, email, nickname, avatar_url, birthday, role, pending_deletion`,
      [auth.userId, nicknameParam, birthdayParam, avatarParam],
    )
    res.json({ success: true, user: rows[0] })
  } catch (err) {
    console.error('[users/me] 更新失败:', err)
    res.status(500).json({ error: '更新资料失败' })
  }
})

/**
 * POST /api/users/me/deletion — 注销排期（14 天后生效，可取消）
 * body: { cancel?: boolean }
 */
router.post('/me/deletion', async (req: Request, res: Response) => {
  const auth = req.auth!
  const cancel = Boolean(req.body?.cancel)
  try {
    if (cancel) {
      await query('UPDATE users SET pending_deletion=FALSE, pending_deletion_at=NULL WHERE id=$1', [auth.userId])
      res.json({ success: true, pending: false })
      return
    }
    const { rows } = await query<{ effective_at: Date }>(
      `UPDATE users SET pending_deletion=TRUE, pending_deletion_at=NOW() + INTERVAL '14 days'
       WHERE id=$1 RETURNING pending_deletion_at AS effective_at`,
      [auth.userId],
    )
    res.json({ success: true, pending: true, effectiveAt: rows[0]?.effective_at ?? null })
  } catch (err) {
    console.error('[users/me/deletion]', err)
    res.status(500).json({ error: '注销排期操作失败' })
  }
})

export default router
