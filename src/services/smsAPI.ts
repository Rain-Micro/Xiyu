const API_URL = 'http://localhost:3001/api'

export interface SendCodeResult {
  success: boolean
  mockCode?: string
}

function isPhoneNumber(contact: string): boolean {
  return /^\d{11}$/.test(contact.trim())
}

export async function sendVerifyCode(contact: string): Promise<SendCodeResult> {
  const isPhone = isPhoneNumber(contact)
  const body = isPhone 
    ? { phone: contact } 
    : { email: contact }

  const response = await fetch(`${API_URL}/sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || '发送验证码失败')
  }
  return { success: true, mockCode: data.mockCode }
}

export async function verifyCode(contact: string, code: string): Promise<boolean> {
  const isPhone = isPhoneNumber(contact)
  const body = isPhone 
    ? { phone: contact, code } 
    : { email: contact, code }

  const response = await fetch(`${API_URL}/sms/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || '验证码校验失败')
  }
  return data.success
}
