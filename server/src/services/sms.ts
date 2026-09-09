import axios from 'axios'
import crypto from 'crypto'
import { getRuntimeConfig } from '../config'

export interface SendSmsResult {
  success: boolean
  message?: string
  code?: string
}

export function generateVerifyCode(): string {
  // 验证码需不可预测：用加密随机源替代 Math.random
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

export async function sendSmsCode(phone: string, code: string): Promise<SendSmsResult> {
  // Spug 地址与令牌支持后台运行时配置（app_config sk: 覆盖 env），每次发送前读取
  const [apiUrl, apiToken] = await Promise.all([
    getRuntimeConfig('SMS_API_URL'),
    getRuntimeConfig('SMS_API_TOKEN'),
  ])
  if (!apiUrl) {
    return { success: false, message: '未配置短信接口（SMS_API_URL）' }
  }
  try {
    // Spug 推送助手的短信验证码接口使用 GET 方式
    // URL 格式: https://push.spug.cc/sms/{模板编码}?code=验证码&to=手机号
    const response = await axios.get(
      apiUrl,
      {
        params: {
          code: code,
          to: phone,
        },
        headers: {
          'Authorization': `Bearer ${apiToken || ''}`,
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
