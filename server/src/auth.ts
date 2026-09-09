import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import type { NextFunction, Request, Response } from 'express'
import { query } from './db'
import { getRuntimeConfig } from './config'

// 认证核心：bcrypt 密码哈希 + 无状态 JWT（Bearer）。
// 签名密钥支持后台运行时覆盖（sk:JWT_SECRET 优先于 env）；env 作为启动基线必须存在。
const ENV_JWT_SECRET = process.env.JWT_SECRET
if (!ENV_JWT_SECRET) {
  throw new Error('[auth] 缺少 JWT_SECRET 环境变量，拒绝启动')
}

async function jwtSecret(): Promise<string> {
  return (await getRuntimeConfig('JWT_SECRET')) ?? (ENV_JWT_SECRET as string)
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

export async function signToken(user: AuthUser): Promise<string> {
  return jwt.sign(user, await jwtSecret(), { expiresIn: TOKEN_TTL })
}

/** 单会话时钟容差：覆盖 JWT iat 秒级截断与同秒并发登录 */
const TOKEN_IAT_SKEW_MS = 5_000

/** 从 Authorization: Bearer <jwt>（或 <img> 场景的 ?t=<jwt> 查询参数）解出用户 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization || ''
  const queryToken = (req.query as Record<string, unknown>).t
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : (typeof queryToken === 'string' ? queryToken : '')
  if (!token) {
    res.status(401).json({ error: '未登录' })
    return
  }
  try {
    const payload = jwt.verify(token, await jwtSecret()) as AuthUser & { iat?: number }
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
    // 角色与状态以库中现值为准（管理员变更即时生效；封禁即拒）
    const { rows: roleRows } = await query<{ role: 'user' | 'admin'; status: string }>(
      'SELECT role, status FROM users WHERE id=$1',
      [payload.userId],
    )
    if (roleRows[0]?.status === 'banned') {
      res.status(403).json({ error: '账号已被封禁，如有疑问请联系客服' })
      return
    }
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
