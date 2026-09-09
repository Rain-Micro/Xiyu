import { query } from './db'

/**
 * 运行时配置层：密钥/可调参数可在管理后台修改（存 app_config，键前缀 sk:），
 * 读取优先级 app_config > process.env；缓存 5 秒。
 * 约束：密钥全值永不出服务端（对外仅掩码）；代码中不落任何凭据字面量。
 */

const PREFIX = 'sk:'
const CACHE_TTL_MS = 5_000

const cache = new Map<string, { value: string | null; at: number }>()

/** 可经后台管理的键清单：label 展示名 / secret 是否掩码显示 / hint 说明
 *  仅收录“已接线到运行时读取”的键（服务在请求期经 getRuntimeConfig 读取），
 *  未接线的语音类密钥（讯飞/Operit 模块初始化读 env）待接入后再加入。 */
export const MANAGEABLE_KEYS: Array<{ key: string; label: string; secret: boolean; hint?: string }> = [
  { key: 'DEEPSEEK_API_KEY', label: 'DeepSeek API Key', secret: true, hint: '角色对话/客服/解析的 LLM 密钥' },
  { key: 'DEEPSEEK_MODEL', label: 'DeepSeek 模型名', secret: false, hint: '如 deepseek-v4-flash' },
  { key: 'SMTP_HOST', label: 'SMTP 主机', secret: false, hint: '如 smtp.qq.com' },
  { key: 'SMTP_PORT', label: 'SMTP 端口', secret: false, hint: '如 465' },
  { key: 'SMTP_USER', label: 'SMTP 账号', secret: false },
  { key: 'SMTP_PASS', label: 'SMTP 授权码', secret: true },
  { key: 'NOTIFY_EMAIL', label: '客服通知邮箱', secret: false },
  { key: 'SMS_MODE', label: '短信模式', secret: false, hint: 'real=Spug 真实短信 / mock=联调回显' },
  { key: 'SMS_API_URL', label: 'Spug 短信接口地址', secret: false },
  { key: 'SMS_API_TOKEN', label: 'Spug 令牌', secret: true },
  { key: 'JWT_SECRET', label: 'JWT 签名密钥', secret: true, hint: '修改后约 5 秒内全部会话失效（需重新登录）' },
]

const KEY_SET = new Set(MANAGEABLE_KEYS.map(k => k.key))

export function isManageableKey(key: string): boolean {
  return KEY_SET.has(key)
}

/** 读取配置：app_config 覆盖层 > 环境变量；未配置返回 undefined（调用方自行兜底） */
export async function getRuntimeConfig(name: string): Promise<string | undefined> {
  const hit = cache.get(name)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.value ?? undefined
  }
  let value: string | null = null
  try {
    const r = await query<{ value: unknown }>('SELECT value FROM app_config WHERE key=$1', [PREFIX + name])
    const v = r.rows[0]?.value
    value = typeof v === 'string' && v !== '' ? v : null
  } catch {
    value = null // DB 不可用时回退 env
  }
  if (value === null && process.env[name] && process.env[name] !== '') {
    value = process.env[name] as string
  }
  cache.set(name, { value, at: Date.now() })
  return value ?? undefined
}

/** 同步读（仅 env 层，模块初始化期使用；请求期请用异步版） */
export function getEnvConfig(name: string): string | undefined {
  const v = process.env[name]
  return v && v !== '' ? v : undefined
}

/** 写入覆盖层（空字符串=清除覆盖，回到 env） */
export async function setRuntimeConfig(name: string, value: string): Promise<void> {
  if (value === '') {
    await query('DELETE FROM app_config WHERE key=$1', [PREFIX + name])
  } else {
    await query(
      `INSERT INTO app_config (key, value, updated_at) VALUES ($1,$2,NOW())
       ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
      [PREFIX + name, JSON.stringify(value)],
    )
  }
  cache.delete(name)
}

/** 掩码：仅用于回显与审计，永不返回全值 */
export function maskValue(v: string | undefined, secret: boolean): string | null {
  if (v === undefined || v === '') return null
  if (!secret) return v
  if (v.length <= 8) return '••••'
  return v.slice(0, 3) + '••••' + v.slice(-3)
}
