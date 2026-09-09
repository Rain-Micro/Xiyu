import nodemailer from 'nodemailer'
import { getRuntimeConfig } from '../config'

// SMTP/通知邮箱支持后台运行时配置（app_config sk:* 覆盖 env），每次发送前读取；
// 配置变更自动重建 transporter，无需重启服务。

interface SmtpConfig {
  host: string
  port: number
  user: string
  pass: string
}

let transporter: nodemailer.Transporter | null = null
let transporterFingerprint = ''

async function loadSmtp(): Promise<SmtpConfig> {
  const [host, port, user, pass, notify] = await Promise.all([
    getRuntimeConfig('SMTP_HOST'),
    getRuntimeConfig('SMTP_PORT'),
    getRuntimeConfig('SMTP_USER'),
    getRuntimeConfig('SMTP_PASS'),
    getRuntimeConfig('NOTIFY_EMAIL'),
  ])
  void notify
  const p = parseInt(port || '465', 10)
  return {
    host: host || '',
    port: isNaN(p) ? 465 : p,
    user: user || '',
    pass: pass || '',
  }
}

async function getTransporter(): Promise<nodemailer.Transporter | null> {
  const cfg = await loadSmtp()
  if (!cfg.host || !cfg.user || !cfg.pass) {
    console.warn('[Email] SMTP 未配置，跳过邮件发送。请在管理后台「服务密钥」或 .env 配置 SMTP_HOST/USER/PASS')
    return null
  }
  const fp = JSON.stringify(cfg)
  if (!transporter || fp !== transporterFingerprint) {
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    })
    transporterFingerprint = fp
    console.log(`[Email] SMTP 已配置: host=${cfg.host}:${cfg.port} user=${cfg.user}`)
  }
  return transporter
}

export async function notifyEmail(): Promise<string> {
  return (await getRuntimeConfig('NOTIFY_EMAIL')) || ''
}

interface CustomerServiceNotification {
  userNickname: string
  userMessage: string
  sentAt: string
  aiReply?: string
}

export async function sendCustomerServiceEmail(notif: CustomerServiceNotification): Promise<boolean> {
  const transport = await getTransporter()
  const to = await notifyEmail()
  if (!transport) {
    console.warn('[Email] 邮件未发送（SMTP 未配置）')
    return false
  }
  if (!to) {
    console.warn('[Email] 邮件未发送（未配置通知邮箱）')
    return false
  }

  const mailOptions = {
    from: (await loadSmtp()).user,
    to,
    subject: `[栖屿客服] 新的客服转接请求 - ${notif.userNickname}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #078a52;">新的客服转接请求</h2>
        <div style="background: #f2fbf5; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p><strong>用户昵称：</strong>${notif.userNickname}</p>
          <p><strong>发送时间：</strong>${notif.sentAt}</p>
        </div>
        <div style="margin: 16px 0;">
          <h3 style="color: #475569;">用户问题：</h3>
          <div style="background: #fff; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; white-space: pre-wrap;">${notif.userMessage}</div>
        </div>
        ${notif.aiReply ? `
        <div style="margin: 16px 0;">
          <h3 style="color: #475569;">AI 尝试解答：</h3>
          <div style="background: #fff; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; white-space: pre-wrap;">${notif.aiReply}</div>
        </div>
        ` : ''}
        <p style="color: #64748b; font-size: 14px; margin-top: 24px;">
          请登录栖屿管理后台查看完整对话记录并回复用户。
        </p>
      </div>
    `,
  }

  try {
    const info = await transport.sendMail(mailOptions)
    console.log(`[Email] 客服通知邮件已发送至 ${to}, messageId: ${info.messageId}`)
    return true
  } catch (error) {
    console.error('[Email] 邮件发送失败:', error)
    return false
  }
}

export interface SendVerifyCodeResult {
  success: boolean
  message?: string
  code?: string
}

export async function sendVerifyCodeEmail(email: string, code: string): Promise<SendVerifyCodeResult> {
  const smsMode = (await getRuntimeConfig('SMS_MODE')) || 'mock'
  if (smsMode === 'mock') {
    console.log(`[Email Mock] 验证码: ${code} (邮箱: ${email})`)
    return { success: true, code }
  }

  const transport = await getTransporter()
  if (!transport) {
    return { success: false, message: 'SMTP 未配置' }
  }

  try {
    await transport.sendMail({
      from: (await loadSmtp()).user,
      to: email,
      subject: '【栖屿】验证码',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #078a52;">栖屿验证码</h2>
          <p>您的验证码是：</p>
          <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #078a52;">${code}</p>
          <p style="color: #64748b; font-size: 14px;">验证码 5 分钟内有效，请勿泄露给他人。</p>
        </div>
      `,
    })
    return { success: true }
  } catch (error) {
    console.error('[Email] 验证码邮件发送失败:', error)
    return { success: false, message: error instanceof Error ? error.message : '邮件发送失败' }
  }
}
