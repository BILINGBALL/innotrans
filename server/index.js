require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');
const leadsRouter = require('./routes/leads');
const adminRouter = require('./routes/admin');
const emailsRouter = require('./routes/emails');
const speechRouter = require('./routes/speech');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/leads', leadsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/email', emailsRouter);
app.use('/api/speech', speechRouter);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// 生产环境：托管前端构建产物（client/dist）
const dist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(dist));

// SPA 回退（不拦截 /api）
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(dist, 'index.html'), (err) => {
    if (err) next();
  });
});

const PORT = process.env.PORT || 4000;

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ InnoTrans 后端已启动: http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ 数据库初始化失败，请检查 DATABASE_URL 与网络:', err.message);
    process.exit(1);
  });
