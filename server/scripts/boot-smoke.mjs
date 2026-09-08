import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// server 构建产物启动冒烟：spawn dist/index.js，轮询 /api/health，通过或超时后清理进程。
// CI 环境无真实密钥，注入占位值保证进程可启动（任何路由的真实外部调用不在冒烟范围）。
const PORT = process.env.SMOKE_PORT || '3999';
const BASE = `http://127.0.0.1:${PORT}`;
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const child = spawn(process.execPath, ['dist/index.js'], {
  cwd: serverDir,
  env: {
    ...process.env,
    PORT,
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'smoke-dummy',
    DEEPSEEK_API_KEY: 'smoke-dummy',
    JWT_SECRET: 'smoke-dummy-jwt',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
child.stderr.on('data', (d) => process.stderr.write(`[server:err] ${d}`));

function killChild() {
  if (process.platform === 'win32' && child.pid) {
    // Windows: 强杀整棵进程树，避免遗留 node 进程占用端口
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/F', '/T'], { stdio: 'ignore' });
    } catch { /* 已退出则忽略 */ }
  } else {
    child.kill('SIGKILL');
  }
}

const deadline = Date.now() + 30_000;
let attempt = 0;
let ok = false;
while (Date.now() < deadline) {
  attempt += 1;
  try {
    const res = await fetch(`${BASE}/api/health`);
    console.log(`boot-smoke: probe #${attempt} -> HTTP ${res.status}`);
    if (res.ok) { ok = true; break; }
  } catch (err) {
    console.log(`boot-smoke: probe #${attempt} -> 未就绪 (${err?.cause?.code || err?.message || err})`);
  }
  await new Promise((r) => setTimeout(r, 1000));
}

killChild();
await new Promise((r) => setTimeout(r, 500));

if (ok) {
  console.log(`boot-smoke: PASS (${BASE}/api/health)`);
  process.exit(0);
}
console.error(`boot-smoke: FAIL — ${BASE}/api/health 在 30s 内未就绪`);
process.exit(1);
