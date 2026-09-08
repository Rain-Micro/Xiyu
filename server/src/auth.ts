import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import type { NextFunction, Request, Response } from 'express'
import { query } from './db'

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

/** 单会话时钟容差：覆盖 JWT iat 秒级截断与同秒并发登录 */
const TOKEN_IAT_SKEW_MS = 5_000

/** 从 Authorization: Bearer <jwt> 解出用户；无效/缺失/已被新登录顶替返回 401 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) {
    res.status(401).json({ error: '未登录' })
    return
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET as string) as AuthUser & { iat?: number }
    // 单会话互斥：token 签发时间早于用户最近一次登录时间 → 已被新设备顶替
    const { rows } = await query<{ last_token_iat: number | null }>(
      'SELECT last_token_iat FROM users WHERE id=$1',
      [payload.userId],
    )
    if (rows.length === 0) {
      res.status(401).json({ error: '账号不存在' })
      return
    }
    const lastIat = rows[0].last_token_iat
    if (lastIat && payload.iat && payload.iat * 1000 < lastIat - TOKEN_IAT_SKEW_MS) {
      res.status(401).json({ error: '账号已在其他设备登录，当前会话已下线' })
      return
    }
    // 角色以库中现值为准（管理员变更即时生效，旧 token 提权/降权不残留）
    const { rows: roleRows } = await query<{ role: 'user' | 'admin' }>(
      'SELECT role FROM users WHERE id=$1',
      [payload.userId],
    )
    req.auth = { userId: payload.userId, role: roleRows[0]?.role ?? payload.role }
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
