import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import type { NextFunction, Request, Response } from 'express'

// 认证核心：bcrypt 密码哈希 + 无状态 JWT（Bearer）。
// JWT_SECRET 必须配置（.env / CI 注入），缺失时拒绝启动。

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('[auth] 缺少 JWT_SECRET 环境变量，拒绝启动')
}

const TOKEN_TTL = '7d'

export interface AuthUser {
  userId: string
  role: 'user' | 'admin'
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthUser
    }
  }
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10)
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash)
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET as string, { expiresIn: TOKEN_TTL })
}

/** 从 Authorization: Bearer <jwt> 解出用户；无效/缺失返回 401 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) {
    res.status(401).json({ error: '未登录' })
    return
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET as string) as AuthUser
    req.auth = { userId: payload.userId, role: payload.role }
    next()
  } catch {
    res.status(401).json({ error: '登录已过期，请重新登录' })
  }
}

/** 管理员守卫：依赖 JWT 中的 role（由 users.role 驱动，彻底替代可伪造的 x-admin-email 头） */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.role !== 'admin') {
    res.status(403).json({ error: '需要管理员权限' })
    return
  }
  next()
}
