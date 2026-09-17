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
      notes       TEXT,
      photo_url   TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 兼容已存在的旧表：补充 notes 列（无长度限制）
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_logs (
      id          SERIAL PRIMARY KEY,
      lead_id     INTEGER REFERENCES leads(id) ON DELETE CASCADE,
      to_email    TEXT NOT NULL,
      subject     TEXT,
      track_id    TEXT,
      status      TEXT NOT NULL DEFAULT 'sent',
      error       TEXT,
      opened_at   TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_logs_track ON email_logs(track_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_logs_lead ON email_logs(lead_id)`);

  console.log('✅ 数据表 leads / email_logs 已就绪');
}

module.exports = { pool, initDb };
