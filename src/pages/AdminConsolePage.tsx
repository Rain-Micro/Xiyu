import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Users, BarChart3, Settings2, ScrollText, Headphones, Search, ChevronLeft, ChevronRight, KeyRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/services/apiClient'
import { useAuthStore, useUIStore } from '@/stores'

type Tab = 'users' | 'dashboard' | 'config' | 'secrets' | 'audit'

interface AdminUserRow {
  id: string
  phone: string | null
  email: string | null
  nickname: string
  role: 'user' | 'admin'
  status: 'active' | 'banned'
  banned_reason: string | null
  created_at: string
}

const tabs: Array<{ id: Tab; label: string; icon: typeof Users }> = [
  { id: 'users', label: '用户管理', icon: Users },
  { id: 'dashboard', label: '数据看板', icon: BarChart3 },
  { id: 'config', label: '系统配置', icon: Settings2 },
  { id: 'secrets', label: '服务密钥', icon: KeyRound },
  { id: 'audit', label: '操作审计', icon: ScrollText },
]

function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString('zh-CN', { hour12: false })
}

function maskAccount(u: AdminUserRow): string {
  const a = u.phone || u.email || '—'
  if (u.phone && u.phone.length >= 7) return u.phone.slice(0, 3) + '****' + u.phone.slice(-4)
  return a
}

// ─── 用户管理标签 ───────────────────────────────────────────
function UsersTab() {
  const { addNotification } = useUIStore()
  const [q, setQ] = useState('')
  const [query_, setQuery] = useState('')
  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (p: number, keyword: string) => {
    setLoading(true)
    try {
      const data = await api<{ users: AdminUserRow[]; total: number }>({
        path: `/api/admin/users?q=${encodeURIComponent(keyword)}&page=${p}&pageSize=${pageSize}`,
      })
      setRows(data.users)
      setTotal(data.total)
      setPage(p)
    } catch (err) {
      addNotification({ id: `admin-users-err-${Date.now()}`, type: 'error', title: '用户查询失败', message: err instanceof ApiError ? err.message : '', timestamp: Date.now(), read: false, duration: 4000 })
    } finally {
      setLoading(false)
    }
  }, [addNotification])

  useEffect(() => { void load(1, '') }, [load])

  const toggleBan = async (u: AdminUserRow) => {
    const banning = u.status !== 'banned'
    const reason = banning ? (window.prompt(`封禁「${u.nickname}」的原因：`, '违反平台规则') || '') : ''
    if (banning && !reason) return
    if (!window.confirm(`${banning ? '封禁' : '解封'}「${u.nickname}」？${banning ? '该用户全部会话将立即下线。' : ''}`)) return
    try {
      await api({ method: 'PATCH', path: `/api/admin/users/${u.id}/status`, body: { banned: banning, reason } })
      void load(page, query_)
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : '操作失败')
    }
  }

  const resetPassword = async (u: AdminUserRow) => {
    if (!window.confirm(`为「${u.nickname}」重置密码？将生成临时密码（仅显示一次），其全部会话下线。`)) return
    try {
      const r = await api<{ tempPassword: string }>({ method: 'POST', path: `/api/admin/users/${u.id}/reset-password`, body: {} })
      window.alert(`临时密码（仅此一次显示，请立即转交用户）：\n\n${r.tempPassword}`)
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : '操作失败')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { setQuery(q); void load(1, q) } }}
          placeholder="搜索昵称 / 手机号 / 邮箱"
          className="input-field flex-1"
        />
        <button className="btn-primary" onClick={() => { setQuery(q); void load(1, q) }}>
          <span className="flex items-center gap-1.5"><Search className="w-4 h-4" />搜索</span>
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-oat">
              <th className="px-4 py-3 font-medium">用户</th>
              <th className="px-4 py-3 font-medium">账号</th>
              <th className="px-4 py-3 font-medium">角色</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">注册时间</th>
              <th className="px-4 py-3 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-oat-light last:border-0">
                <td className="px-4 py-3 font-medium">{u.nickname}</td>
                <td className="px-4 py-3 text-gray-500">{maskAccount(u)}</td>
                <td className="px-4 py-3">{u.role === 'admin' ? <span className="label-uppercase text-primary-600">Admin</span> : '用户'}</td>
                <td className="px-4 py-3">
                  {u.status === 'banned'
                    ? <span className="px-2 py-0.5 rounded bg-pomegranate-400 text-white text-xs">已封禁</span>
                    : <span className="px-2 py-0.5 rounded bg-matcha-300 text-black text-xs">正常</span>}
                </td>
                <td className="px-4 py-3 text-gray-500">{fmtDate(u.created_at)}</td>
                <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                  <button className="btn-ghost text-xs" onClick={() => toggleBan(u)}>{u.status === 'banned' ? '解封' : '封禁'}</button>
                  <button className="btn-ghost text-xs" onClick={() => resetPassword(u)}>重置密码</button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">无匹配用户</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>共 {total} 个用户 · 第 {page}/{totalPages} 页</span>
        <div className="flex gap-2">
          <button className="btn-ghost text-xs" disabled={page <= 1} onClick={() => load(page - 1, query_)}><ChevronLeft className="w-3.5 h-3.5 inline" /> 上一页</button>
          <button className="btn-ghost text-xs" disabled={page >= totalPages} onClick={() => load(page + 1, query_)}>下一页 <ChevronRight className="w-3.5 h-3.5 inline" /></button>
        </div>
      </div>
    </div>
  )
}

// ─── 数据看板标签 ───────────────────────────────────────────
function DashboardTab() {
  const [overview, setOverview] = useState<Record<string, number> | null>(null)
  const [trend, setTrend] = useState<{ registrations: Array<{ date: string; value: number }>; messages: Array<{ date: string; value: number }>; dau: Array<{ date: string; value: number }> } | null>(null)
  const [top, setTop] = useState<Array<{ characterId: string; name: string | null; count: number; lastAt: string }>>([])

  useEffect(() => {
    void api<Record<string, number>>({ path: '/api/admin/stats/overview' }).then(setOverview).catch(() => {})
    void api<{ registrations: Array<{ date: string; value: number }>; messages: Array<{ date: string; value: number }>; dau: Array<{ date: string; value: number }> }>({ path: '/api/admin/stats/trend?days=14' }).then(setTrend).catch(() => {})
    void api<{ top: Array<{ characterId: string; name: string | null; count: number; lastAt: string }> }>({ path: '/api/admin/stats/top-characters?limit=10' }).then(r => setTop(r.top)).catch(() => {})
  }, [])

  const cards: Array<[string, number | undefined, string]> = [
    ['注册用户', overview?.users, 'text-primary-600'],
    ['7 日活跃', overview?.active7d, 'text-slushie-800'],
    ['消息总量', overview?.messages, 'text-ube-800'],
    ['自建角色', overview?.characters, 'text-lemon-700'],
    ['收藏总量', overview?.favorites, 'text-blueberry-800'],
    ['封禁用户', overview?.banned, 'text-pomegranate-400'],
  ]

  const BarChart = ({ title, data, color }: { title: string; data: Array<{ date: string; value: number }> | undefined; color: string }) => {
    const max = Math.max(1, ...(data || []).map(d => d.value))
    return (
      <div className="card">
        <div className="label-uppercase text-gray-400 mb-3">{title}</div>
        <div className="flex items-end gap-1 h-28">
          {(data || []).map(d => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative" title={`${d.date}：${d.value}`}>
              <div className={`w-full rounded-t ${color} transition-all`} style={{ height: `${Math.max(3, (d.value / max) * 100)}%` }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-2">
          <span>{data?.[0]?.date?.slice(5)}</span>
          <span>{data?.[data.length - 1]?.date?.slice(5)}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(([label, v, color]) => (
          <div key={label} className="card p-4 !rounded-xl">
            <div className="text-2xl font-bold {color}"><span className={color}>{v ?? '—'}</span></div>
            <div className="text-xs text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <BarChart title="每日注册" data={trend?.registrations} color="bg-primary-500" />
        <BarChart title="每日消息" data={trend?.messages} color="bg-ube-800" />
        <BarChart title="DAU" data={trend?.dau} color="bg-lemon-500" />
      </div>
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-oat label-uppercase text-gray-400">热门角色（消息量 Top10）</div>
        <table className="w-full text-sm">
          <tbody>
            {top.map((t, i) => (
              <tr key={t.characterId} className="border-b border-oat-light last:border-0">
                <td className="px-4 py-2.5 w-10 text-gray-400">{i + 1}</td>
                <td className="px-4 py-2.5 font-medium">{t.name || t.characterId}</td>
                <td className="px-4 py-2.5 text-right text-gray-500">{t.count} 条 · 最近 {fmtDate(t.lastAt)}</td>
              </tr>
            ))}
            {top.length === 0 && <tr><td className="px-4 py-8 text-center text-gray-400">暂无消息数据</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── 系统配置标签 ───────────────────────────────────────────
const CONFIG_FIELDS: Array<{ key: string; label: string; hint: string; multiline?: boolean }> = [
  { key: 'announcement', label: '全站公告', hint: '客户端登录后以通知展示；留空即无公告', multiline: true },
  { key: 'latest_version', label: '最新版本号', hint: '如 2.2.0；客户端启动时比对提示更新' },
  { key: 'download_url', label: '下载页地址', hint: '新版本下载/发布页 URL' },
  { key: 'notify_email', label: '客服通知邮箱', hint: '客服转人工通知收件邮箱（覆盖 env 默认值）' },
]

function ConfigTab() {
  const { addNotification } = useUIStore()
  const [values, setValues] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void api<{ config: Array<{ key: string; value: unknown }> }>({ path: '/api/admin/config' }).then(({ config }) => {
      const v: Record<string, string> = {}
      for (const c of config) v[c.key] = typeof c.value === 'string' ? c.value : ''
      setValues(v)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  const save = async (key: string) => {
    try {
      await api({ method: 'PUT', path: `/api/admin/config/${key}`, body: { value: values[key] ?? '' } })
      addNotification({ id: `cfg-${key}-${Date.now()}`, type: 'success', title: '已保存', message: key, timestamp: Date.now(), read: false, duration: 2500 })
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : '保存失败')
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {CONFIG_FIELDS.map(f => (
        <div key={f.key} className="card">
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold">{f.label}</span>
            <span className="font-mono text-xs text-gray-400">{f.key}</span>
          </div>
          <p className="text-xs text-gray-500 mb-3">{f.hint}</p>
          {f.multiline ? (
            <textarea
              value={values[f.key] ?? ''}
              onChange={(e) => setValues(v => ({ ...v, [f.key]: e.target.value }))}
              rows={3}
              className="input-field"
              disabled={!loaded}
            />
          ) : (
            <input
              value={values[f.key] ?? ''}
              onChange={(e) => setValues(v => ({ ...v, [f.key]: e.target.value }))}
              className="input-field"
              disabled={!loaded}
            />
          )}
          <div className="mt-3 text-right">
            <button className="btn-primary text-sm" onClick={() => save(f.key)}>保存</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── 操作审计标签 ───────────────────────────────────────────
function AuditTab() {
  const [logs, setLogs] = useState<Array<{ id: string; action: string; target_type: string | null; target_id: string | null; detail: unknown; created_at: string; admin_nickname: string | null }>>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const pageSize = 30

  const load = useCallback(async (p: number, a: string) => {
    try {
      const data = await api<{ logs: typeof logs; total: number }>({ path: `/api/admin/audit-logs?page=${p}&action=${encodeURIComponent(a)}` })
      setLogs(data.logs)
      setTotal(data.total)
      setPage(p)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { void load(1, '') }, [load])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const actionColor = (a: string) => a.startsWith('user.ban') ? 'text-pomegranate-400' : a.startsWith('config') ? 'text-ube-800' : 'text-gray-600'

  return (
    <div className="space-y-4">
      <div className="flex gap-2 max-w-md">
        <input value={action} onChange={(e) => setAction(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void load(1, action) }}
          placeholder="按动作过滤（如 user.ban / config.update，留空全部）" className="input-field flex-1" />
        <button className="btn-primary" onClick={() => load(1, action)}>筛选</button>
      </div>
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-oat">
              <th className="px-4 py-3 font-medium">时间</th>
              <th className="px-4 py-3 font-medium">管理员</th>
              <th className="px-4 py-3 font-medium">动作</th>
              <th className="px-4 py-3 font-medium">目标</th>
              <th className="px-4 py-3 font-medium">详情</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id} className="border-b border-oat-light last:border-0">
                <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(l.created_at)}</td>
                <td className="px-4 py-2.5">{l.admin_nickname || '—'}</td>
                <td className={`px-4 py-2.5 font-mono text-xs font-semibold ${actionColor(l.action)}`}>{l.action}</td>
                <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{l.target_type}{l.target_id ? `:${String(l.target_id).slice(0, 8)}` : ''}</td>
                <td className="px-4 py-2.5 text-gray-400 font-mono text-xs max-w-xs truncate">{l.detail ? JSON.stringify(l.detail) : '—'}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">暂无记录</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>共 {total} 条 · 第 {page}/{totalPages} 页</span>
        <div className="flex gap-2">
          <button className="btn-ghost text-xs" disabled={page <= 1} onClick={() => load(page - 1, action)}>上一页</button>
          <button className="btn-ghost text-xs" disabled={page >= totalPages} onClick={() => load(page + 1, action)}>下一页</button>
        </div>
      </div>
    </div>
  )
}

// ─── 服务密钥标签 ───────────────────────────────────────────
interface SecretRow {
  key: string
  label: string
  hint: string | null
  secret: boolean
  configured: boolean
  source: 'config' | 'env' | null
  preview: string | null
}

function SecretsTab() {
  const { addNotification } = useUIStore()
  const [rows, setRows] = useState<SecretRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [input, setInput] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api<{ secrets: SecretRow[] }>({ path: '/api/admin/secrets' })
      setRows(data.secrets)
    } catch { /* ignore */ } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async (key: string) => {
    try {
      await api({ method: 'PUT', path: `/api/admin/secrets/${encodeURIComponent(key)}`, body: { value: input } })
      addNotification({ id: `sec-${key}-${Date.now()}`, type: 'success', title: '已保存', message: input === '' ? `${key} 已清除覆盖，回到环境变量配置` : `${key} 已更新（约 5 秒内生效）`, timestamp: Date.now(), read: false, duration: 3500 })
      setEditing(null)
      setInput('')
      void load()
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : '保存失败')
    }
  }

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="card">
        <p className="text-sm text-gray-500 leading-relaxed">
          三方服务密钥的运行时管理：修改即时生效（JWT 密钥除外，约 5 秒后全部会话失效需重新登录）。
          密钥类仅回显头尾掩码，全值只存服务端；非密钥类完整显示便于核对。
          <span className="font-semibold text-gray-700"> 清空并保存 = 清除覆盖，回退到服务器 .env 配置。</span>
          更新操作会记入审计日志（仅掩码）。
        </p>
      </div>
      {rows.map(r => (
        <div key={r.key} className="card">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{r.label}</span>
                {r.secret && <span className="px-1.5 py-0.5 rounded bg-ube-300/50 text-[10px] font-semibold">密钥</span>}
                <span className="font-mono text-xs text-gray-400">{r.key}</span>
              </div>
              {r.hint && <p className="text-xs text-gray-500 mt-0.5">{r.hint}</p>}
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                {r.configured
                  ? <span className="font-mono text-sm text-gray-700">{r.preview}</span>
                  : <span className="text-sm text-pomegranate-400">未配置</span>}
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.source === 'config' ? 'bg-matcha-300/60' : r.source === 'env' ? 'bg-lemon-400/60' : 'bg-gray-200 text-gray-500'}`}>
                  {r.source === 'config' ? '后台覆盖' : r.source === 'env' ? '.env' : ''}
                </span>
              </div>
            </div>
            {editing === r.key ? (
              <div className="flex gap-2 items-center">
                <input
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void save(r.key); if (e.key === 'Escape') { setEditing(null); setInput('') } }}
                  placeholder={r.secret ? '输入新密钥（留空并保存=清除）' : '输入新值'}
                  type={r.secret ? 'password' : 'text'}
                  className="input-field w-64"
                />
                <button className="btn-primary text-sm" onClick={() => save(r.key)}>保存</button>
                <button className="btn-ghost text-sm" onClick={() => { setEditing(null); setInput('') }}>取消</button>
              </div>
            ) : (
              <button className="btn-ghost text-sm shrink-0" onClick={() => { setEditing(r.key); setInput('') }}>
                更新
              </button>
            )}
          </div>
        </div>
      ))}
      {loaded && rows.length === 0 && <div className="card text-center text-gray-400">无可用配置项</div>}
    </div>
  )
}

// ─── 控制台主页 ─────────────────────────────────────────────
export default function AdminConsolePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('users')

  if (user?.role !== 'admin') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <div className="text-4xl">⛔</div>
        <p className="text-gray-500">需要管理员权限</p>
        <button className="btn-primary" onClick={() => navigate('/main')}>回到主页</button>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full w-full bg-cream dark:bg-gray-900 overflow-y-auto scrollbar-thin">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button className="btn-ghost" onClick={() => navigate('/main')} title="回到主页"><ArrowLeft className="w-4 h-4" /></button>
            <h1 className="text-2xl font-bold tracking-tight">管理后台</h1>
            <span className="label-uppercase text-gray-400">Internal</span>
          </div>
          <button className="btn-secondary text-sm" onClick={() => navigate('/admin/customer-service')}>
            <Headphones className="w-4 h-4 inline mr-1" />客服会话
          </button>
        </div>

        {/* 标签栏 */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${tab === t.id
                ? 'bg-black text-white border-black shadow-clay'
                : 'bg-white text-black border-oat hover:border-black'}`}
            >
              <t.icon className="w-4 h-4 inline mr-1.5" />{t.label}
            </button>
          ))}
        </div>

        {tab === 'users' && <UsersTab />}
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'config' && <ConfigTab />}
        {tab === 'secrets' && <SecretsTab />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </motion.div>
  )
}
