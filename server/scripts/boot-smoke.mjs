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

const deadline = Date.now() + 20_000;
let ok = false;
while (Date.now() < deadline) {
  try {
    const res = await fetch(`${BASE}/api/health`);
    if (res.ok) { ok = true; break; }
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500));
}

child.kill();
if (ok) {
  console.log(`\nboot-smoke: PASS (${BASE}/api/health)`);
  process.exit(0);
}
console.error(`\nboot-smoke: FAIL — ${BASE}/api/health 未在 20s 内就绪`);
process.exit(1);
