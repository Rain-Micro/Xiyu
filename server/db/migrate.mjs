#!/usr/bin/env node
// 轻量 migration 执行器：按文件名顺序执行 server/db/migrations/*.sql，
// 已应用的记录在 schema_migrations 表，重复执行自动跳过。
// 用法：DATABASE_URL=postgresql://... node db/migrate.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, 'migrations');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('migrate: 缺少 DATABASE_URL 环境变量');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, max: 2 });

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`migrate: 跳过 ${file}（已应用）`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`migrate: 已应用 ${file}`);
      ran += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`migrate: ${file} 执行失败:`, err.message);
      process.exitCode = 1;
      break;
    } finally {
      client.release();
    }
  }

  console.log(ran === 0 ? 'migrate: schema 已是最新' : `migrate: 完成，共应用 ${ran} 个迁移`);
}

main()
  .catch((err) => {
    console.error('migrate: 连接失败:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
