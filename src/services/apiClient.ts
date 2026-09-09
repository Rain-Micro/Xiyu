// 统一 REST 客户端：全部后端请求的唯一下口
// - API 地址经 VITE_API_URL 配置（.env.local / 打包注入），不再散落硬编码
// - JWT 自动注入 Authorization；401 时清理会话并派发全局事件
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3001'

const TOKEN_KEY = 'qiyu-token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

/** 供二进制等特殊请求直接 fetch 时携带鉴权头 */
export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

/**
 * 头像等 <img> 直链转换：服务端相对路径(/api/avatars/x) → 带 token 的完整 URL。
 * <img> 无法携带 Authorization 头，服务端头像端点同时接受 ?t=<jwt> 查询参数。
 * dataURL/空值原样返回。
 */
export function avatarSrc(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('/api/')) {
    const token = getToken()
    return token ? `${API_BASE}${url}?t=${encodeURIComponent(token)}` : `${API_BASE}${url}`
  }
  return url
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  formData?: FormData
  /** 相对于 API_BASE 的路径，如 /api/messages */
  path: string
  timeoutMs?: number
  /** 调用方自己的中止信号（与超时控制合并） */
  signal?: AbortSignal
}

/** 是否静默处理 401（默认：清理 token 并广播会话过期事件） */
export async function api<T = unknown>(options: RequestOptions): Promise<T> {
  const { method = 'GET', body, formData, path, timeoutMs = 20000, signal: externalSignal } = options

  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onExternalAbort = () => controller.abort()
  externalSignal?.addEventListener('abort', onExternalAbort)

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', onExternalAbort)
    if (externalSignal?.aborted) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(0, '请求超时，请检查网络或后端服务是否可用')
    }
    throw new ApiError(0, '无法连接后端服务，请确认服务已启动')
  }
  clearTimeout(timer)
  externalSignal?.removeEventListener('abort', onExternalAbort)

  if (res.status === 401) {
    setToken(null)
    window.dispatchEvent(new CustomEvent('qiyu:session-expired'))
  }

  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // 非 JSON 响应（如二进制），原样返回
    if (!res.ok) throw new ApiError(res.status, `请求失败（${res.status}）`)
    return text as unknown as T
  }

  if (!res.ok) {
    const message = (data as { error?: string })?.error || `请求失败（${res.status}）`
    throw new ApiError(res.status, message)
  }
  return data as T
}

export { API_BASE }
