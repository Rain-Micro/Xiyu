import { api, setToken, getToken } from './apiClient'

// 认证相关 REST 封装（对齐 server /api/auth/*）
export interface AuthUser {
  id: string
  phone: string | null
  email: string | null
  nickname: string
  role: 'user' | 'admin'
}

interface AuthResponse {
  success: true
  token: string
  user: AuthUser
  /** 待注销账号在 14 天内登录时自动恢复 */
  restored?: boolean
}

export interface RegisterPayload {
  phone?: string
  email?: string
  password: string
  nickname?: string
  smsCode?: string
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  const res = await api<AuthResponse>({ method: 'POST', path: '/api/auth/register', body: payload })
  setToken(res.token)
  return res
}

export async function login(account: string, password: string): Promise<AuthResponse> {
  const res = await api<AuthResponse>({ method: 'POST', path: '/api/auth/login', body: { account, password } })
  setToken(res.token)
  return res
}

export async function loginBySms(phone: string, code: string): Promise<AuthResponse> {
  const res = await api<AuthResponse>({ method: 'POST', path: '/api/auth/login/sms', body: { phone, code } })
  setToken(res.token)
  return res
}

export async function fetchMe(): Promise<{ user: AuthUser & { avatar_url?: string; birthday?: string; pending_deletion?: boolean; created_at?: string } }> {
  return api({ method: 'GET', path: '/api/auth/me' })
}

export function hasToken(): boolean {
  return Boolean(getToken())
}

export function logoutLocal(): void {
  setToken(null)
}
