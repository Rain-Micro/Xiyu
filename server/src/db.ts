import pg from 'pg';

// 唯一数据库入口：所有数据访问经本连接池；DB 只在 127.0.0.1，凭证仅存在于本进程 env。
const connectionString = process.env.DATABASE_URL;

export const pool = new pg.Pool({
  connectionString,
  max: 10, // 生产 2G 内存约束，连接数保守
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[db] 连接池异常:', err.message);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never[]);
}
