const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// 1x1 透明 GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

// 邮件打开追踪像素（公开接口，供邮件客户端加载）
router.get('/open/:trackId', async (req, res) => {
  try {
    await pool.query(
      `UPDATE email_logs SET status='opened', opened_at=NOW() WHERE track_id=$1 AND status<>'opened'`,
      [req.params.trackId]
    );
  } catch (e) {
    console.error('更新打开状态失败:', e.message);
  }
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.send(PIXEL);
});

module.exports = router;
