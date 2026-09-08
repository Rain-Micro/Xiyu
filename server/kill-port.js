// 启动前清理指定端口，避免 EADDRINUSE
// 全程 execFileSync 参数数组执行（不经 shell，杜绝命令注入）；端口/进程号均做数字校验
const { execFileSync } = require('child_process')

const portArg = process.argv[2] || '3001'
if (!/^\d{1,5}$/.test(portArg) || Number(portArg) < 1 || Number(portArg) > 65535) {
  console.error(`[kill-port] 端口参数不合法: ${portArg}`)
  process.exit(0) // 参数异常不阻塞启动
}

try {
  const platform = process.platform
  if (platform === 'win32') {
    // Windows: netstat -ano 输出中匹配 "TCP ... :port ... LISTENING <pid>"
    const out = execFileSync('netstat', ['-ano'], { encoding: 'utf-8' })
    const pids = new Set()
    for (const line of out.split('\n')) {
      if (!line.includes(`:${portArg} `)) continue
      const parts = line.trim().split(/\s+/)
      const pid = parts[parts.length - 1]
      if (/^\d+$/.test(pid) && pid !== '0') pids.add(pid)
    }
    for (const pid of pids) {
      try { execFileSync('taskkill', ['/PID', pid, '/F'], { stdio: 'ignore' }) } catch {}
    }
    if (pids.size > 0) console.log(`[kill-port] 已终止端口 ${portArg} 上的 ${pids.size} 个进程`)
  } else {
    // macOS/Linux: lsof 直接给出 pid 列表
    const out = execFileSync('lsof', ['-t', `-i:${portArg}`], { encoding: 'utf-8' })
    const pids = out.trim().split('\n').filter((p) => /^\d+$/.test(p))
    for (const pid of pids) {
      try { execFileSync('kill', ['-9', pid], { stdio: 'ignore' }) } catch {}
    }
    if (pids.length > 0) console.log(`[kill-port] 已终止端口 ${portArg} 上的 ${pids.length} 个进程`)
  }
} catch {
  // 端口未被占用（命令无匹配输出即非零退出），无需处理
}
