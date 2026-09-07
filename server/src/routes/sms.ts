// server/src/routes/sms.ts
import { Router, Request, Response } from 'express'
import { sendSmsCode, generateVerifyCode } from '../services/sms'
import { sendVerifyCodeEmail } from '../services/emailService'

const router = Router()

const SMS_MODE = process.env.SMS_MODE || 'mock'

// 内存存储验证码 { phone: { code, expiresAt } }
const codeStore = new Map<string, { code: string; expiresAt: number }>()

// 发送验证码（手机号或邮箱）
router.post('/send', async (req: Request, res: Response) => {
  const { phone, email } = req.body

  if (!phone && !email) {
    return res.status(400).json({ error: '手机号或邮箱不能为空' })
  }

  const code = generateVerifyCode()
  const expiresAt = Date.now() + 5 * 60 * 1000 // 5分钟有效

  // 用联系方式作为 key 存储
  const key = phone || email
  codeStore.set(key, { code, expiresAt })

  try {
    if (phone) {
      if (SMS_MODE === 'real') {
        const result = await sendSmsCode(phone, code)
        if (!result.success) {
          console.error('[SMS] 发送失败:', result.message)
          return res.status(500).json({ error: result.message || '短信发送失败' })
        }
        console.log(`[SMS] ✅ 验证码 ${code} 已发送到手机: ${phone}`)
      } else {
        // mock 模式，返回验证码
        console.log(`[SMS] 🧪 Mock 模式，验证码: ${code} (手机号: ${phone})`)
        return res.json({ success: true, mockCode: code })
      }
    } else if (email) {
      // 邮箱验证码
      const result = await sendVerifyCodeEmail(email, code)
      if (!result.success) {
        console.error('[Email] 发送失败:', result.message)
        return res.status(500).json({ error: result.message || '邮件发送失败' })
      }
      console.log(`[Email] ✅ 验证码 ${code} 已发送到邮箱: ${email}`)
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[SMS/Email] 发送异常:', err)
    res.status(500).json({ error: '发送失败，请稍后重试' })
  }
})

// 校验验证码
router.post('/verify', async (req: Request, res: Response) => {
  const { phone, email, code } = req.body

  if ((!phone && !email) || !code) {
    return res.status(400).json({ error: '参数不完整' })
  }

  const key = phone || email
  const stored = codeStore.get(key)

  if (!stored) {
    console.log(`[Verify] ❌ 未找到验证码记录: ${key}`)
    return res.status(400).json({ error: '验证码错误或已过期', success: false })
  }

  // 检查是否过期
  if (Date.now() > stored.expiresAt) {
    codeStore.delete(key)
    console.log(`[Verify] ❌ 验证码已过期: ${key}`)
    return res.status(400).json({ error: '验证码错误或已过期', success: false })
  }

  // 比对验证码
  if (stored.code !== code.trim()) {
    console.log(`[Verify] ❌ 验证码不匹配: 输入=${code}, 存储=${stored.code}`)
    return res.status(400).json({ error: '验证码错误或已过期', success: false })
  }

  // 验证成功，删除验证码（一次性使用）
  codeStore.delete(key)
  console.log(`[Verify] ✅ 验证成功: ${key}`)
  res.json({ success: true })
})

// Supabase Send SMS Hook
router.post('/supabase-hook', async (req: Request, res: Response) => {
  // 打印所有请求头，调试用
  console.log('[SMS Hook] 请求头:', req.headers)

  // 尝试从不同位置获取 Secret
  const supabaseSecret = 
    req.headers['x-supabase-secret'] || 
    req.headers['authorization']?.replace('Bearer ', '') ||
    req.headers['x-webhook-secret']

  const expectedSecret = process.env.SUPABASE_HOOK_SECRET

  console.log('[SMS Hook] 收到的 Secret:', supabaseSecret)
  console.log('[SMS Hook] 期望的 Secret:', expectedSecret)

  // 验证 Secret
  if (!expectedSecret || supabaseSecret !== expectedSecret) {
    console.warn('[SMS Hook] ❌ Secret 验证失败')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { phone } = req.body

  if (!phone) {
    return res.status(400).json({ error: '手机号不能为空' })
  }

  // 生成并存储验证码
  const code = Math.floor(100000 + Math.random() * 900000).toString()
  const expiresAt = Date.now() + 5 * 60 * 1000
  codeStore.set(phone, { code, expiresAt })
  console.log(`[SMS Hook] ✅ 验证码 ${code} 已生成，手机号: ${phone}`)

  // 调用 Spug 发送短信
  try {
    const smsApiUrl = process.env.SMS_API_URL
    const smsToken = process.env.SMS_API_TOKEN

    if (smsApiUrl && smsToken) {
      const response = await fetch(smsApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${smsToken}`,
        },
        body: JSON.stringify({
          phone: phone,
          code: code,
        }),
      })
      const data = await response.json()
      console.log('[SMS Hook] Spug 响应:', data)
    } else {
      console.log('[SMS Hook] 测试模式，验证码:', code)
    }

    res.status(200).json({ success: true })
  } catch (err) {
    console.error('[SMS Hook] ❌ 发送失败:', err)
    res.status(500).json({ error: '短信发送失败' })
  }
})

export default router
