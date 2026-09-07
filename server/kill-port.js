// 启动前清理指定端口，避免 EADDRINUSE
const { execSync } = require('child_process')
const port = process.argv[2] || '3001'

try {
  const platform = process.platform
  if (platform === 'win32') {
    // Windows: 查找占用端口的进程并终止
    const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    const lines = result.trim().split('\n')
    const pids = new Set()
    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      const pid = parts[parts.length - 1]
      if (pid && pid !== '0') pids.add(pid)
    }
    for (const pid of pids) {
      try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }) } catch {}
    }
    if (pids.size > 0) console.log(`[kill-port] 已终止端口 ${port} 上的 ${pids.size} 个进程`)
  } else {
    // macOS/Linux
    const result = execSync(`lsof -ti:${port}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    const pids = result.trim().split('\n').filter(Boolean)
    for (const pid of pids) {
      try { execSync(`kill -9 ${pid}`, { stdio: 'ignore' }) } catch {}
    }
    if (pids.length > 0) console.log(`[kill-port] 已终止端口 ${port} 上的 ${pids.length} 个进程`)
  }
} catch {
  // 端口未被占用，无需处理
}
