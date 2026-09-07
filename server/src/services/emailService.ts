import nodemailer from 'nodemailer'

const SMTP_HOST = process.env.SMTP_HOST || ''
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10)
const SMTP_USER = process.env.SMTP_USER || ''
const SMTP_PASS = process.env.SMTP_PASS || ''
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'rain0153@foxmail.com'
const SMS_MODE = process.env.SMS_MODE || 'mock'

let transporter: nodemailer.Transporter | null = null

// 启动时打印 SMTP 配置状态
console.log(`[Email] SMTP 配置: host=${SMTP_HOST || '(未配置)'}, port=${SMTP_PORT}, user=${SMTP_USER || '(未配置)'}, notify=${NOTIFY_EMAIL}`)

function getTransporter(): nodemailer.Transporter | null {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[Email] SMTP 未配置，跳过邮件发送。请在 .env 中设置 SMTP_HOST, SMTP_USER, SMTP_PASS')
    return null
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    })
  }
  return transporter
}

interface CustomerServiceNotification {
  userNickname: string
  userMessage: string
  sentAt: string
  aiReply?: string
}

export async function sendCustomerServiceEmail(notif: CustomerServiceNotification): Promise<boolean> {
  const transport = getTransporter()
  if (!transport) {
    console.warn('[Email] 邮件未发送（SMTP 未配置）')
    return false
  }

  console.log(`[Email] 准备发送客服通知邮件: 从 ${SMTP_USER} 到 ${NOTIFY_EMAIL}`)

  const mailOptions = {
    from: SMTP_USER,
    to: NOTIFY_EMAIL,
    subject: `[栖屿客服] 新的客服转接请求 - ${notif.userNickname}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #3b82f6;">新的客服转接请求</h2>
        <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
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
    console.log(`[Email] 客服通知邮件已发送至 ${NOTIFY_EMAIL}, messageId: ${info.messageId}`)
    return true
  } catch (error) {
    console.error('[Email] 邮件发送失败:', error)
    console.error('[Email] 错误详情:', error instanceof Error ? error.message : String(error))
    return false
  }
}

export interface SendVerifyCodeResult {
  success: boolean
  message?: string
  code?: string
}

export async function sendVerifyCodeEmail(email: string, code: string): Promise<SendVerifyCodeResult> {
  if (SMS_MODE === 'mock') {
    console.log(`[Email Mock] 验证码: ${code} (邮箱: ${email})`)
    return { success: true, code }
  }

  const transport = getTransporter()
  if (!transport) {
    return { success: false, message: 'SMTP 未配置' }
  }

  try {
    await transport.sendMail({
      from: SMTP_USER,
      to: email,
      subject: '【栖屿】验证码',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #3b82f6;">栖屿验证码</h2>
          <p>您的验证码是：</p>
          <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #3b82f6;">${code}</p>
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
