import axios from 'axios'

const SMS_API_URL = process.env.SMS_API_URL
const SMS_API_TOKEN = process.env.SMS_API_TOKEN

export interface SendSmsResult {
  success: boolean
  message?: string
  code?: string
}

export function generateVerifyCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function sendSmsCode(phone: string, code: string): Promise<SendSmsResult> {
  try {
    // Spug 推送助手的短信验证码接口使用 GET 方式
    // URL 格式: https://push.spug.cc/sms/{模板编码}?code=验证码&to=手机号
    const response = await axios.get(
      SMS_API_URL || '',
      {
        params: {
          code: code,
          to: phone,
        },
        headers: {
          'Authorization': `Bearer ${SMS_API_TOKEN}`,
        },
        timeout: 10000,
      }
    )

    console.log('[SMS] API 响应:', JSON.stringify(response.data, null, 2))

    // 检查响应状态码（Spug 返回 code === 200 表示成功）
    if (response.data?.code === 200 || response.data?.code === 0) {
      return { success: true }
    } else {
      return { 
        success: false, 
        message: response.data?.msg || response.data?.message || '短信发送失败' 
      }
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('[SMS] 请求失败:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      })
      return { 
        success: false, 
        message: error.response?.data?.msg || error.response?.data?.message || error.message 
      }
    }
    console.error('[SMS] 发送失败:', error)
    return { success: false, message: error instanceof Error ? error.message : '网络错误' }
  }
}
