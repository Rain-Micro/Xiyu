import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { query } from '../db'
import { getRuntimeConfig } from '../config'
import { sendSmsCode } from '../services/sms'
import { sendVerifyCodeEmail } from '../services/emailService'

const router = Router()

const CODE_TTL_MINUTES = 5

function sha256(v: string): string {
  return crypto.createHash('sha256').update(v).digest('hex')
}

function randomCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * 校验短信/邮箱验证码：查找未使用、未过期、哈希匹配的记录，命中则标记已使用。
 * 供本路由 /verify 与 auth 路由（注册/短信登录/找回密码）共用。
 */
export async function verifySmsCode(target: string, code: string): Promise<boolean> {
  if (!target || !code) return false
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM verification_codes
     WHERE phone=$1 AND code_hash=$2 AND used=FALSE AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [target, sha256(code)],
  )
  if (rows.length === 0) return false
  await query('UPDATE verification_codes SET used=TRUE WHERE id=$1', [rows[0].id])
  return true
}

/**
 * POST /api/sms/send
 * body: { target, channel?: 'phone'|'email' }
 * 验证码落库（sha256 哈希 + 5 分钟过期），同一目标重新发送会使旧码失效。
 */
router.post('/send', async (req: Request, res: Response) => {
  const { target, channel } = req.body || {}
  const isPhoneTarget = /^1\d{10}$/.test(String(target || ''))
  const isEmailTarget = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(target || ''))
  if (!isPhoneTarget && !isEmailTarget) {
    res.status(400).json({ error: '请提供有效的手机号或邮箱' })
    return
  }
  const useEmail = channel === 'email' || (!isPhoneTarget && isEmailTarget)

  try {
    const code = randomCode()
    // 旧码作废 + 写入新码（哈希存储，不落明文）
    await query('UPDATE verification_codes SET used=TRUE WHERE phone=$1 AND used=FALSE', [String(target)])
    await query(
      `INSERT INTO verification_codes (phone, code_hash, expires_at)
       VALUES ($1, $2, NOW() + ($3::int * INTERVAL '1 minute'))`,
      [String(target), sha256(code), CODE_TTL_MINUTES],
    )

    const smsMode = (await getRuntimeConfig('SMS_MODE')) || 'mock'
    if (useEmail) {
      const result = await sendVerifyCodeEmail(String(target), code)
      if (!result.success) {
        res.status(502).json({ error: result.message || '邮件发送失败' })
        return
      }
    } else if (smsMode === 'real') {
      const result = await sendSmsCode(String(target), code)
      if (!result.success) {
        res.status(502).json({ error: result.message || '短信发送失败' })
        return
      }
    } else {
      // mock 模式（默认）：不发送真实短信，验证码写入服务端日志并在响应中回带 devCode 供联调；
      // 生产环境必须设 SMS_MODE=real，devCode 不会返回
      console.log(`[sms] mock 模式验证码 target=${String(target)} code=${code}`)
      res.json({ success: true, expiresIn: CODE_TTL_MINUTES * 60, devCode: code })
      return
    }
    res.json({ success: true, expiresIn: CODE_TTL_MINUTES * 60 })
  } catch (err) {
    console.error('[sms/send]', err)
    res.status(500).json({ error: '验证码发送失败，请稍后再试' })
  }
})

/** POST /api/sms/verify  body: { target, code }（独立校验场景；登录/注册流程内部调用 verifySmsCode） */
router.post('/verify', async (req: Request, res: Response) => {
  const { target, code } = req.body || {}
  try {
    const ok = await verifySmsCode(String(target || ''), String(code || ''))
    if (!ok) {
      res.status(401).json({ error: '验证码错误或已过期' })
      return
    }
    res.json({ success: true })
  } catch (err) {
    console.error('[sms/verify]', err)
    res.status(500).json({ error: '验证失败' })
  }
})

export default router
