const { Pool } = require('pg');

// 从 DATABASE_URL 解析出干净的连接参数（去掉 Prisma 专属的 query 参数）
function parseDbConfig(url) {
  const u = new URL(url);
  return {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    host: u.hostname,
    port: Number(u.port || 5432),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
  };
}

const config = parseDbConfig(process.env.DATABASE_URL);
if (process.env.PG_SSL === 'true') {
  config.ssl = { rejectUnauthorized: false };
}

const pool = new Pool({
  ...config,
  max: 10,
  connectionTimeoutMillis: 10000,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      phone       TEXT,
      whatsapp    TEXT,
      email       TEXT,
      company     TEXT,
      photo_url   TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('✅ 数据表 leads 已就绪');
}

module.exports = { pool, initDb };
