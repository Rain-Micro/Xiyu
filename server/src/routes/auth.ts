import { Router, Request, Response } from 'express'
import { query } from '../db'
import { hashPassword, verifyPassword, signToken, requireAuth } from '../auth'
import { verifySmsCode } from './sms'

const router = Router()

// 注册时为用户播种的内置助手（与前端 ASSISTANT_SEEDS 的 id 规则保持一致：
// Character id = `assistant-<assistantId>-<userId>`）
const ASSISTANT_IDS = ['liu', 'sa', 'che', 'yi', 'xi'] as const

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

/** 标记最近一次登录时刻（毫秒）：单会话互斥的基准值 */
async function markLogin(userId: string): Promise<void> {
  await query('UPDATE users SET last_token_iat=$1 WHERE id=$2', [Date.now(), userId])
}

function isPhone(v: string): boolean {
  return /^1\d{10}$/.test(v)
}

async function seedBuiltinAssistants(userId: string, names: Record<string, string>): Promise<void> {
  for (const aid of ASSISTANT_IDS) {
    await query(
      `INSERT INTO characters (id, user_id, name, type, assistant_id, greeting)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
      [`assistant-${aid}-${userId}`, userId, names[aid] || aid, 'builtin_assistant', aid, `你好，我是${names[aid] || aid}，很高兴认识你。`],
    )
  }
}

/**
 * POST /api/auth/register
 * body: { phone?, email?, password, nickname?, smsCode? }
 * 手机号注册必须携带短信验证码（SMS_MODE=mock 时验证码在服务端日志里）。
 */
router.post('/register', async (req: Request, res: Response) => {
  const { phone, email, password, nickname, smsCode } = req.body || {}
  if (!password || typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: '密码至少 6 位' })
    return
  }
  if (!phone && !email) {
    res.status(400).json({ error: '手机号与邮箱至少填一个' })
    return
  }
  if (phone && !isPhone(phone)) {
    res.status(400).json({ error: '手机号格式不正确' })
    return
  }
  if (email && !isEmail(email)) {
    res.status(400).json({ error: '邮箱格式不正确' })
    return
  }

  try {
    // 手机与邮箱注册 alike 必须校验验证码（此前邮箱注册跳过校验的缺口）
    if (phone || email) {
      const ok = await verifySmsCode(String(phone || email), String(smsCode || ''))
      if (!ok) {
        res.status(400).json({ error: '验证码错误或已过期' })
        return
      }
    }

    const dup = await query(
      'SELECT id FROM users WHERE ($1::TEXT IS NOT NULL AND phone=$1) OR ($2::TEXT IS NOT NULL AND email=$2)',
      [phone || null, email || null],
    )
    if (dup.rows.length > 0) {
      res.status(409).json({ error: '该账号已注册' })
      return
    }

    const name = (nickname && String(nickname).trim()) || (email ? email.split('@')[0] : `用户${phone!.slice(-4)}`)
    const inserted = await query<{ id: string; role: 'user' | 'admin' }>(
      `INSERT INTO users (phone, email, nickname, password_hash)
       VALUES ($1,$2,$3,$4) RETURNING id, role`,
      [phone || null, email || null, name, hashPassword(password)],
    )
    const user = inserted.rows[0]

    // 播种内置助手（名称取自种子表；此处仅落"简版角色行"，完整 Character 由前端本地种子合成）
    await seedBuiltinAssistants(user.id, { liu: '琉', sa: '飒', che: '澈', yi: '熠', xi: '汐' })

    await markLogin(user.id)
    const token = await signToken({ userId: user.id, role: user.role })
    res.json({ success: true, token, user: { id: user.id, phone: phone || null, email: email || null, nickname: name, role: user.role } })
  } catch (err) {
    console.error('[auth/register]', err)
    res.status(500).json({ error: '注册失败，请稍后再试' })
  }
})

/**
 * POST /api/auth/login  密码登录
 * body: { account, password }（account 为手机号或邮箱）
 */
router.post('/login', async (req: Request, res: Response) => {
  const { account, password } = req.body || {}
  if (!account || !password) {
    res.status(400).json({ error: '请输入账号与密码' })
    return
  }
  try {
    const found = await query<{
      id: string; role: 'user' | 'admin'; password_hash: string; status: string;
      phone: string | null; email: string | null; nickname: string; username: string | null
    }>(
      // account 可为 手机号 / 邮箱 / 账号名（username，如内置管理员 +00Root）；
      // 三列同一占位符 + LIMIT 1：格式互斥（手机/邮箱/命名账号不重叠），冲突场景取先建者
      'SELECT id, role, status, password_hash, phone, email, nickname, username FROM users WHERE phone=$1 OR email=$1 OR username=$1 LIMIT 1',
      [String(account).trim()],
    )
    const user = found.rows[0]
    if (user && user.status === 'banned') {
      res.status(403).json({ error: '账号已被封禁，如有疑问请联系客服' })
      return
    }
    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: '账号或密码错误' })
      return
    }

    // 待注销状态处理：超 14 天自动物理删除；14 天内登录自动恢复
    const pending = await query<{ pending_deletion: boolean; pending_deletion_at: Date | null }>(
      'SELECT pending_deletion, pending_deletion_at FROM users WHERE id=$1',
      [user.id],
    )
    if (pending.rows[0]?.pending_deletion) {
      const since = pending.rows[0].pending_deletion_at
      const days = since ? (Date.now() - new Date(since).getTime()) / 86_400_000 : 0
      if (days > 14) {
        await query('DELETE FROM users WHERE id=$1', [user.id])
        res.status(403).json({ error: '该账号已永久注销，无法登录' })
        return
      }
      await query('UPDATE users SET pending_deletion=FALSE, pending_deletion_at=NULL WHERE id=$1', [user.id])
      // 恢复标记：前端据此提示"账号已恢复"
      await markLogin(user.id)
      res.json({
        success: true,
        restored: true,
        token: await signToken({ userId: user.id, role: user.role }),
        user: { id: user.id, phone: user.phone, email: user.email, nickname: user.nickname, role: user.role },
      })
      return
    }

    await markLogin(user.id)
    const token = await signToken({ userId: user.id, role: user.role })
    res.json({
      success: true,
      token,
      user: { id: user.id, phone: user.phone, email: user.email, nickname: user.nickname, role: user.role },
    })
  } catch (err) {
    console.error('[auth/login]', err)
    res.status(500).json({ error: '登录失败，请稍后再试' })
  }
})

/**
 * POST /api/auth/login/sms  验证码登录（未注册则报错，注册走 /register）
 * body: { phone, code }
 */
router.post('/login/sms', async (req: Request, res: Response) => {
  const { phone, code } = req.body || {}
  if (!isPhone(String(phone || ''))) {
    res.status(400).json({ error: '手机号格式不正确' })
    return
  }
  try {
    const ok = await verifySmsCode(String(phone), String(code || ''))
    if (!ok) {
      res.status(401).json({ error: '短信验证码错误或已过期' })
      return
    }
    const found = await query<{ id: string; role: 'user' | 'admin'; status: string; nickname: string; email: string | null }>(
      'SELECT id, role, status, nickname, email FROM users WHERE phone=$1 LIMIT 1',
      [String(phone)],
    )
    const user = found.rows[0]
    if (user && user.status === 'banned') {
      res.status(403).json({ error: '账号已被封禁，如有疑问请联系客服' })
      return
    }
    if (!user) {
      res.status(404).json({ error: '该手机号尚未注册' })
      return
    }
    await markLogin(user.id)
    const token = await signToken({ userId: user.id, role: user.role })
    res.json({ success: true, token, user: { id: user.id, phone: String(phone), email: user.email, nickname: user.nickname, role: user.role } })
  } catch (err) {
    console.error('[auth/login/sms]', err)
    res.status(500).json({ error: '登录失败，请稍后再试' })
  }
})

/** GET /api/auth/me — 当前用户信息（含 role，前端管理员入口由此驱动） */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const auth = req.auth!
  try {
    const found = await query<{
      id: string; phone: string | null; email: string | null; nickname: string;
      avatar_url: string | null; birthday: string | null; role: 'user' | 'admin';
      pending_deletion: boolean; created_at: Date
    }>(
      `SELECT id, phone, email, nickname, avatar_url, birthday, role, pending_deletion, created_at
       FROM users WHERE id=$1`,
      [auth.userId],
    )
    if (found.rows.length === 0) {
      res.status(404).json({ error: '用户不存在' })
      return
    }
    res.json({ user: found.rows[0] })
  } catch (err) {
    console.error('[auth/me]', err)
    res.status(500).json({ error: '获取用户信息失败' })
  }
})

/** POST /api/auth/change-password  body: { oldPassword, newPassword } */
router.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  const auth = req.auth!
  const { oldPassword, newPassword } = req.body || {}
  if (!newPassword || String(newPassword).length < 6) {
    res.status(400).json({ error: '新密码至少 6 位' })
    return
  }
  try {
    const found = await query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id=$1', [auth.userId])
    if (found.rows.length === 0 || !verifyPassword(String(oldPassword || ''), found.rows[0].password_hash)) {
      res.status(401).json({ error: '原密码错误' })
      return
    }
    await query('UPDATE users SET password_hash=$1 WHERE id=$2', [hashPassword(newPassword), auth.userId])
    res.json({ success: true })
  } catch (err) {
    console.error('[auth/change-password]', err)
    res.status(500).json({ error: '修改密码失败' })
  }
})

/**
 * POST /api/auth/reset-password  忘记密码（短信验证码重置）
 * body: { phone, code, newPassword }
 */
router.post('/reset-password', async (req: Request, res: Response) => {
  const { phone, code, newPassword } = req.body || {}
  if (!isPhone(String(phone || ''))) {
    res.status(400).json({ error: '手机号格式不正确' })
    return
  }
  if (!newPassword || String(newPassword).length < 6) {
    res.status(400).json({ error: '新密码至少 6 位' })
    return
  }
  try {
    const ok = await verifySmsCode(String(phone), String(code || ''))
    if (!ok) {
      res.status(401).json({ error: '短信验证码错误或已过期' })
      return
    }
    const updated = await query<{ id: string }>(
      'UPDATE users SET password_hash=$1 WHERE phone=$2 RETURNING id',
      [hashPassword(newPassword), String(phone)],
    )
    if (updated.rows.length === 0) {
      res.status(404).json({ error: '该手机号尚未注册' })
      return
    }
    res.json({ success: true })
  } catch (err) {
    console.error('[auth/reset-password]', err)
    res.status(500).json({ error: '重置密码失败' })
  }
})

/**
 * POST /api/auth/change-contact  更换绑定手机号/邮箱
 * body: { phone?, email?, code } — code 为发送到"新联系方式"的验证码（证明对该联系方式的所有权），账号归属由 JWT 保证
 */
router.post('/change-contact', requireAuth, async (req: Request, res: Response) => {
  const auth = req.auth!
  const { phone, email, code } = req.body || {}
  if (phone && !isPhone(String(phone))) {
    res.status(400).json({ error: '手机号格式不正确' })
    return
  }
  if (email && !isEmail(String(email))) {
    res.status(400).json({ error: '邮箱格式不正确' })
    return
  }
  if ((!phone && !email) || !code) {
    res.status(400).json({ error: '请提供新联系方式及验证码' })
    return
  }
  const target = String(phone || email)
  try {
    const codeOk = await verifySmsCode(target, String(code))
    if (!codeOk) {
      res.status(401).json({ error: '验证码错误或已过期' })
      return
    }
    if (phone) {
      const dup = await query('SELECT id FROM users WHERE phone=$1 AND id<>$2', [String(phone), auth.userId])
      if (dup.rows.length > 0) {
        res.status(409).json({ error: '该手机号已被其他账号绑定' })
        return
      }
      await query('UPDATE users SET phone=$1 WHERE id=$2', [String(phone), auth.userId])
    }
    if (email) {
      const dup = await query('SELECT id FROM users WHERE email=$1 AND id<>$2', [String(email), auth.userId])
      if (dup.rows.length > 0) {
        res.status(409).json({ error: '该邮箱已被其他账号绑定' })
        return
      }
      await query('UPDATE users SET email=$1 WHERE id=$2', [String(email), auth.userId])
    }
    res.json({ success: true })
  } catch (err) {
    console.error('[auth/change-contact]', err)
    res.status(500).json({ error: '更换绑定失败' })
  }
})

export default router
