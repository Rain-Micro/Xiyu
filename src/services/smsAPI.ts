import { api } from './apiClient'

export interface SendCodeResult {
  success: boolean
  mockCode?: string
}

function isPhoneNumber(contact: string): boolean {
  return /^\d{11}$/.test(contact.trim())
}

/** 发送验证码（mock 模式下服务端回带 devCode 供联调显示） */
export async function sendVerifyCode(contact: string): Promise<SendCodeResult> {
  const isPhone = isPhoneNumber(contact)
  const data = await api<{ success: boolean; devCode?: string }>({
    method: 'POST',
    path: '/api/sms/send',
    body: isPhone ? { target: contact, channel: 'phone' } : { target: contact, channel: 'email' },
  })
  return { success: true, mockCode: data.devCode }
}

export async function verifyCode(contact: string, code: string): Promise<boolean> {
  const data = await api<{ success: boolean }>({
    method: 'POST',
    path: '/api/sms/verify',
    body: { target: contact, code },
  })
  return data.success
}
