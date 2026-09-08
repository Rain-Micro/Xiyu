// 启动时版本检查（仅提示式）：比对本地版本与远程最新版本，落后则由调用方提示用户手动更新。
// 版本源经 VITE_UPDATE_CHECK_URL 配置（默认 GitHub releases/latest API 形态），仓库定稿后替换。
// 检查失败一律静默（无网络/接口变更不影响使用）。

const UPDATE_CHECK_URL = (import.meta.env.VITE_UPDATE_CHECK_URL as string | undefined) || ''

export interface UpdateCheckResult {
  hasUpdate: boolean
  latest: string
  /** 新版本下载/发布页地址 */
  url: string
}

/** 比较形如 x.y.z 的版本号：a>b 返回 1，a<b 返回 -1，相等返回 0；非法输入按 0.0.0 处理 */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v.replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0)
  const [pa, pb] = [parse(a), parse(b)]
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1
  }
  return 0
}

export async function checkForUpdate(): Promise<UpdateCheckResult | null> {
  if (!UPDATE_CHECK_URL) return null
  try {
    const res = await fetch(UPDATE_CHECK_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { tag_name?: string; html_url?: string }
    const latest = String(data.tag_name || '').replace(/^v/i, '')
    if (!latest) return null
    return {
      hasUpdate: compareSemver(latest, __APP_VERSION__) > 0,
      latest,
      url: String(data.html_url || ''),
    }
  } catch {
    return null
  }
}
