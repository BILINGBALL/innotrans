require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// 全局异常兜底：防止 WS/ASR 等异步错误把整个进程搞崩，打印后继续运行
process.on('uncaughtException', (err) => {
  console.error('❌ 未捕获异常:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (err) => {
  console.error('❌ 未处理的 Promise 拒绝:', err && err.stack ? err.stack : err);
});

const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { WebSocketServer } = require('ws');
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

// SPA 回退（不拦截 /api 和 /ws）
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
  res.sendFile(path.join(dist, 'index.html'), (err) => {
    if (err) next();
  });
});

const PORT = process.env.PORT || 4000;

// 创建 HTTP server 并挂载 WebSocket 中继
const server = http.createServer(app);
const speechWss = new WebSocketServer({ server, path: '/ws/speech' });
speechRouter.attachSpeechWebSocket(speechWss);

initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`✅ InnoTrans 后端已启动: http://localhost:${PORT}`);
      console.log(`✅ 语音识别 WebSocket 中继: ws://localhost:${PORT}/ws/speech`);
    });
  })
  .catch((err) => {
    console.error('❌ 数据库初始化失败，请检查 DATABASE_URL 与网络:', err.message);
    process.exit(1);
  });
