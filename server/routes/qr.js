const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { authMiddleware } = require('../auth');
const { savePhotosFromDataUrls } = require('../oss');
const { logAndSendEmail } = require('../email');

const router = express.Router();

function newToken() {
  return crypto.randomBytes(12).toString('hex');
}

// 生成二维码（后台管理）
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { label } = req.body || {};
    const result = await pool.query(
      `INSERT INTO qr_codes (token, label) VALUES ($1, $2) RETURNING *`,
      [newToken(), label || null]
    );
    res.status(201).json({ success: true, qr: result.rows[0] });
  } catch (err) {
    console.error('生成二维码失败:', err);
    res.status(500).json({ error: '生成失败' });
  }
});

// 二维码列表（后台管理）
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM qr_codes ORDER BY created_at DESC');
    res.json({ qrs: rows });
  } catch (err) {
    console.error('查询二维码失败:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// 删除二维码（后台管理，不自动删）
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM qr_codes WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('删除二维码失败:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

// 查询二维码状态（公开）
router.get('/:token', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM qr_codes WHERE token = $1', [req.params.token]);
    if (rows.length === 0) return res.status(404).json({ error: '二维码不存在' });
    res.json({ valid: !rows[0].filled_at, filled: !!rows[0].filled_at, scanned: !!rows[0].scanned_at });
  } catch (err) {
    console.error('查询二维码状态失败:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// 上报被扫（公开，幂等）
router.post('/:token/scan', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, scanned_at FROM qr_codes WHERE token = $1', [req.params.token]);
    if (rows.length === 0) return res.status(404).json({ error: '二维码不存在' });
    if (!rows[0].scanned_at) {
      await pool.query('UPDATE qr_codes SET scanned_at = NOW() WHERE id = $1', [rows[0].id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('上报扫码失败:', err);
    res.status(500).json({ error: '上报失败' });
  }
});

// 提交信息（公开，一次性：填完即失效）
router.post('/:token/lead', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM qr_codes WHERE token = $1', [req.params.token]);
    if (rows.length === 0) return res.status(404).json({ error: '二维码不存在' });
    const qr = rows[0];
    if (qr.filled_at) return res.status(409).json({ error: '该二维码已被使用' });

    const { name, phone, whatsapp, email, company, notes, photos } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: '请填写姓名' });

    let photoKeys = [];
    try {
      photoKeys = await savePhotosFromDataUrls(Array.isArray(photos) ? photos : []);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    const mainPhoto = photoKeys[0] || null;

    const result = await pool.query(
      `INSERT INTO leads (name, phone, whatsapp, email, company, notes, photo_url, photos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING *`,
      [name.trim(), phone || null, whatsapp || null, email || null, company || null, notes || null, mainPhoto,
        photoKeys.length ? JSON.stringify(photoKeys) : null]
    );

    await pool.query('UPDATE qr_codes SET filled_at = NOW() WHERE id = $1', [qr.id]);

    const lead = result.rows[0];
    res.status(201).json({ success: true, lead });

    if (lead.email) {
      logAndSendEmail(lead).catch((e) => console.error('自动发信失败:', e.message));
    }
  } catch (err) {
    console.error('二维码提交失败:', err);
    res.status(500).json({ error: '提交失败，请重试' });
  }
});

module.exports = router;
