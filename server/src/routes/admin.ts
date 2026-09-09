import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { query } from '../db'
import { hashPassword } from '../auth' // requireAdmin 由入口统一挂载（/api/admin 前置中间件）

const router = Router()

/** 配置键白名单（app_config 只收这些 key） */
const CONFIG_KEYS = new Set(['announcement', 'latest_version', 'download_url', 'notify_email'])

/** 管理操作审计 */
async function audit(req: Request, action: string, targetType: string, targetId: string, detail: Record<string, unknown>): Promise<void> {
  try {
    await query(
      'INSERT INTO audit_logs (admin_user_id, action, target_type, target_id, detail) VALUES ($1,$2,$3,$4,$5)',
      [req.auth!.userId, action, targetType, targetId, JSON.stringify(detail)],
    )
  } catch (err) {
    console.error('[audit] 写入失败:', err)
  }
}

/** 分页参数归一（服务端钳制，杜绝越界） */
function pageParams(req: Request): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1))
  const pageSize = Math.min(50, Math.max(5, Math.floor(Number(req.query.pageSize) || 20)))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

// ─── 用户管理 ───────────────────────────────────────────────

/** GET /api/admin/users?q=&page=&pageSize= —— 模糊搜索 + 分页（全静态 SQL） */
router.get('/users', async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim().slice(0, 60)
  const like = `%${q}%`
  const { page, pageSize, offset } = pageParams(req)
  try {
    const { rows } = await query(
      `SELECT id, phone, email, nickname, role, status, banned_reason, banned_at, pending_deletion, created_at
       FROM users
       WHERE ($1 = '' OR nickname ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [q, like, pageSize, offset],
    )
    const total = await query<{ count: string }>(
      `SELECT count(*)::text AS count FROM users
       WHERE ($1 = '' OR nickname ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)`,
      [q, like],
    )
    res.json({ users: rows, total: Number(total.rows[0].count), page, pageSize })
  } catch (err) {
    console.error('[admin/users]', err)
    res.status(500).json({ error: '用户查询失败' })
  }
})

/** GET /api/admin/users/:id —— 详情 + 活跃统计 */
router.get('/users/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const { rows } = await query(
      `SELECT id, phone, email, nickname, role, status, banned_reason, banned_at, avatar_url, birthday, pending_deletion, created_at
       FROM users WHERE id=$1`, [id],
    )
    if (rows.length === 0) {
      res.status(404).json({ error: '用户不存在' })
      return
    }
    const chars = await query<{ count: string }>('SELECT count(*)::text AS count FROM user_characters WHERE user_id=$1', [id])
    const msgs = await query<{ count: string }>('SELECT count(*)::text AS count FROM messages WHERE user_id=$1', [id])
    const lastActive = await query<{ last: Date | null }>(
      'SELECT MAX(created_at) AS last FROM messages WHERE user_id=$1', [id],
    )
    res.json({
      user: rows[0],
      stats: {
        characters: Number(chars.rows[0].count),
        messages: Number(msgs.rows[0].count),
        lastActiveAt: lastActive.rows[0].last,
      },
    })
  } catch (err) {
    console.error('[admin/users/:id]', err)
    res.status(500).json({ error: '用户详情失败' })
  }
})

/** PATCH /api/admin/users/:id/status —— 封禁/解封（body: {banned, reason?}）。
 * 封禁同时把会话基准推到未来，使该用户全部现存 token 立即失效。 */
router.patch('/users/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params
  const banned = Boolean(req.body?.banned)
  const reason = banned ? String(req.body?.reason || '违反平台规则').slice(0, 200) : null
  if (id === req.auth!.userId) {
    res.status(400).json({ error: '不能封禁自己' })
    return
  }
  try {
    let rowCount = 0
    if (banned) {
      const r = await query(
        `UPDATE users SET status='banned', banned_reason=$1, banned_at=NOW(), last_token_iat=$2 WHERE id=$3`,
        [reason, Date.now() + 86_400_000, id],
      )
      rowCount = r.rowCount ?? 0
    } else {
      const r = await query(
        `UPDATE users SET status='active', banned_reason=NULL, banned_at=NULL WHERE id=$1`,
        [id],
      )
      rowCount = r.rowCount ?? 0
    }
    if (!rowCount) {
      res.status(404).json({ error: '用户不存在' })
      return
    }
    await audit(req, banned ? 'user.ban' : 'user.unban', 'user', id, { reason })
    res.json({ success: true })
  } catch (err) {
    console.error('[admin/users/status]', err)
    res.status(500).json({ error: '封禁操作失败' })
  }
})

/** POST /api/admin/users/:id/reset-password —— 生成临时密码（仅回显一次，全部会话下线） */
router.post('/users/:id/reset-password', async (req: Request, res: Response) => {
  const { id } = req.params
  const tempPassword = crypto.randomBytes(9).toString('base64url').slice(0, 12)
  try {
    const { rowCount } = await query(
      'UPDATE users SET password_hash=$1, last_token_iat=$2 WHERE id=$3',
      [hashPassword(tempPassword), Date.now() + 86_400_000, id],
    )
    if (!rowCount) {
      res.status(404).json({ error: '用户不存在' })
      return
    }
    await audit(req, 'user.reset_password', 'user', id, {})
    res.json({ success: true, tempPassword })
  } catch (err) {
    console.error('[admin/users/reset-password]', err)
    res.status(500).json({ error: '重置密码失败' })
  }
})

// ─── 数据看板 ───────────────────────────────────────────────

/** GET /api/admin/stats/overview —— 总览指标（六条独立静态查询） */
router.get('/stats/overview', async (_req: Request, res: Response) => {
  try {
    const [users, banned, characters, messages, favorites, active7d] = await Promise.all([
      query<{ v: string }>('SELECT count(*)::text AS v FROM users'),
      query<{ v: string }>("SELECT count(*)::text AS v FROM users WHERE status='banned'"),
      query<{ v: string }>('SELECT count(*)::text AS v FROM user_characters'),
      query<{ v: string }>('SELECT count(*)::text AS v FROM messages'),
      query<{ v: string }>('SELECT count(*)::text AS v FROM favorites'),
      query<{ v: string }>("SELECT count(DISTINCT user_id)::text AS v FROM messages WHERE created_at > NOW() - INTERVAL '7 days'"),
    ])
    res.json({
      users: Number(users.rows[0].v),
      banned: Number(banned.rows[0].v),
      characters: Number(characters.rows[0].v),
      messages: Number(messages.rows[0].v),
      favorites: Number(favorites.rows[0].v),
      active7d: Number(active7d.rows[0].v),
    })
  } catch (err) {
    console.error('[admin/stats/overview]', err)
    res.status(500).json({ error: '统计失败' })
  }
})

/** GET /api/admin/stats/trend?days=14 —— 注册/消息量/DAU 按日（全静态 SQL） */
router.get('/stats/trend', async (req: Request, res: Response) => {
  const days = Math.min(90, Math.max(7, Math.floor(Number(req.query.days) || 14)))
  try {
    const reg = await query<{ d: string; v: string }>(
      `SELECT to_char(d.day,'YYYY-MM-DD') AS d, COALESCE(c.v,0)::text AS v
       FROM generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, INTERVAL '1 day') AS d(day)
       LEFT JOIN (
         SELECT date_trunc('day',created_at) AS day, count(*) AS v
         FROM users GROUP BY 1
       ) c ON c.day = d.day
       ORDER BY d.day`,
      [days],
    )
    const msg = await query<{ d: string; v: string }>(
      `SELECT to_char(d.day,'YYYY-MM-DD') AS d, COALESCE(c.v,0)::text AS v
       FROM generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, INTERVAL '1 day') AS d(day)
       LEFT JOIN (
         SELECT date_trunc('day',created_at) AS day, count(*) AS v
         FROM messages GROUP BY 1
       ) c ON c.day = d.day
       ORDER BY d.day`,
      [days],
    )
    const dau = await query<{ d: string; v: string }>(
      `SELECT to_char(d.day,'YYYY-MM-DD') AS d, COALESCE(c.v,0)::text AS v
       FROM generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, INTERVAL '1 day') AS d(day)
       LEFT JOIN (
         SELECT date_trunc('day',created_at) AS day, count(DISTINCT user_id) AS v
         FROM messages GROUP BY 1
       ) c ON c.day = d.day
       ORDER BY d.day`,
      [days],
    )
    res.json({
      days,
      registrations: reg.rows.map(r => ({ date: r.d, value: Number(r.v) })),
      messages: msg.rows.map(r => ({ date: r.d, value: Number(r.v) })),
      dau: dau.rows.map(r => ({ date: r.d, value: Number(r.v) })),
    })
  } catch (err) {
    console.error('[admin/stats/trend]', err)
    res.status(500).json({ error: '趋势查询失败' })
  }
})

/** GET /api/admin/stats/top-characters?limit=10 */
router.get('/stats/top-characters', async (req: Request, res: Response) => {
  const limit = Math.min(20, Math.max(5, Math.floor(Number(req.query.limit) || 10)))
  try {
    const { rows } = await query<{ character_id: string; name: string | null; v: string; last_at: Date }>(
      `SELECT m.character_id,
              COALESCE(
                (SELECT (uc.data->>'name') FROM user_characters uc WHERE uc.id = m.character_id),
                (SELECT c.name FROM characters c WHERE c.id = m.character_id),
                m.character_id
              ) AS name,
              count(*)::text AS v, MAX(m.created_at) AS last_at
       FROM messages m
       WHERE m.character_id <> 'customer-service'
       GROUP BY m.character_id
       ORDER BY count(*) DESC LIMIT $1`, [limit],
    )
    res.json({ top: rows.map(r => ({ characterId: r.character_id, name: r.name, count: Number(r.v), lastAt: r.last_at })) })
  } catch (err) {
    console.error('[admin/stats/top]', err)
    res.status(500).json({ error: '热门角色查询失败' })
  }
})

// ─── 系统配置 ───────────────────────────────────────────────

/** GET /api/admin/config */
router.get('/config', async (_req: Request, res: Response) => {
  try {
    const { rows } = await query('SELECT key, value, updated_at FROM app_config ORDER BY key')
    res.json({ config: rows })
  } catch (err) {
    console.error('[admin/config]', err)
    res.status(500).json({ error: '配置读取失败' })
  }
})

/** PUT /api/admin/config/:key —— body: {value}（键白名单） */
router.put('/config/:key', async (req: Request, res: Response) => {
  const { key } = req.params
  if (!CONFIG_KEYS.has(key)) {
    res.status(400).json({ error: '不支持的配置键' })
    return
  }
  const value = req.body?.value
  if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    res.status(400).json({ error: 'value 必须是标量' })
    return
  }
  try {
    await query(
      `INSERT INTO app_config (key, value, updated_by, updated_at) VALUES ($1,$2,$3,NOW())
       ON CONFLICT (key) DO UPDATE SET value=$2, updated_by=$3, updated_at=NOW()`,
      [key, JSON.stringify(value ?? null), req.auth!.userId],
    )
    await audit(req, 'config.update', 'config', key, { value })
    res.json({ success: true })
  } catch (err) {
    console.error('[admin/config/put]', err)
    res.status(500).json({ error: '配置保存失败' })
  }
})

// ─── 操作审计 ───────────────────────────────────────────────

/** GET /api/admin/audit-logs?page=&action=（全静态 SQL + 参数化过滤） */
router.get('/audit-logs', async (req: Request, res: Response) => {
  const action = String(req.query.action || '').trim().slice(0, 40)
  const { page, pageSize, offset } = pageParams(req)
  try {
    const { rows } = await query(
      `SELECT a.id, a.action, a.target_type, a.target_id, a.detail, a.created_at, u.nickname AS admin_nickname
       FROM audit_logs a LEFT JOIN users u ON u.id = a.admin_user_id
       WHERE ($1 = '' OR a.action = $1)
       ORDER BY a.created_at DESC
       LIMIT $2 OFFSET $3`,
      [action, pageSize, offset],
    )
    const total = await query<{ count: string }>(
      "SELECT count(*)::text AS count FROM audit_logs a WHERE ($1 = '' OR a.action = $1)",
      [action],
    )
    res.json({ logs: rows, total: Number(total.rows[0].count), page, pageSize })
  } catch (err) {
    console.error('[admin/audit-logs]', err)
    res.status(500).json({ error: '审计查询失败' })
  }
})

export default router
