import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores'
import { getToken } from '@/services/apiClient'

/**
 * 路由守卫：受保护页面（主页/聊天/后台/用户模块等）要求已登录且持有 token，
 * 否则重定向到登录页——修复"直接打开进入选择角色/创建角色页"的空壳态。
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)
  if (!isLoggedIn || !getToken()) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
