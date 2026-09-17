const express = require('express');
const { pool } = require('../db');
const { signToken, authMiddleware } = require('../auth');
const { savePhotoFromDataUrl, signUrl } = require('../oss');
const { logAndSendEmail } = require('../email');

const router = express.Router();

// 列表与缩略图签名有效期（秒）：24 小时
const VIEW_TTL = 86400;
// 导出的照片链接有效期（秒）：7 天
const EXPORT_TTL = 604800;

// 管理员登录
router.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (password && password === process.env.ADMIN_PASSWORD) {
    return res.json({ success: true, token: signToken() });
  }
  res.status(401).json({ error: '密码错误' });
});

// 客户列表（照片返回签名 URL，附带最近一次邮件状态）
router.get('/leads', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.*,
         (SELECT e.status FROM email_logs e WHERE e.lead_id = l.id ORDER BY e.created_at DESC LIMIT 1) AS last_email_status
       FROM leads l
       ORDER BY l.created_at DESC`
    );
    const leads = rows.map((r) => ({
      ...r,
      photo_url: r.photo_url ? signUrl(r.photo_url, VIEW_TTL) : null,
    }));
    res.json({ leads });
  } catch (err) {
    console.error('查询失败:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// 导出 CSV（照片链接带 7 天有效期）
router.get('/leads/export', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM leads ORDER BY created_at DESC');

    const header = ['ID', '姓名', '电话', 'WhatsApp', '邮箱', '公司', '照片链接', '创建时间'];
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const fmt = (d) => {
      const t = new Date(d);
      const p = (n) => String(n).padStart(2, '0');
      return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`;
    };

    const lines = rows.map((r) =>
      [
        r.id,
        r.name,
        r.phone,
        r.whatsapp,
        r.email,
        r.company,
        r.photo_url ? signUrl(r.photo_url, EXPORT_TTL) : '',
        fmt(r.created_at),
      ]
        .map(escape)
        .join(',')
    );

    // BOM 让 Excel 正确识别 UTF-8 中文
    const csv = '﻿' + [header.map(escape).join(','), ...lines].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="innotrans-leads-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(csv);
  } catch (err) {
    console.error('导出失败:', err);
    res.status(500).json({ error: '导出失败' });
  }
});

// 追加 / 更新客户照片（传 photo 为 null 则清空）
router.put('/leads/:id/photo', authMiddleware, async (req, res) => {
  try {
    const { photo } = req.body || {};
    let photoUrl = null;
    if (photo) {
      try {
        photoUrl = await savePhotoFromDataUrl(photo);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }
    const result = await pool.query(
      'UPDATE leads SET photo_url = $1 WHERE id = $2 RETURNING *',
      [photoUrl, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: '记录不存在' });
    const lead = {
      ...result.rows[0],
      photo_url: result.rows[0].photo_url ? signUrl(result.rows[0].photo_url, VIEW_TTL) : null,
    };
    res.json({ success: true, lead });
  } catch (err) {
    console.error('更新照片失败:', err);
    res.status(500).json({ error: '更新失败' });
  }
});

// 手动补发邮件
router.post('/leads/:id/send-email', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: '记录不存在' });
    const lead = rows[0];
    if (!lead.email) return res.status(400).json({ error: '该客户未填写邮箱，无法发送' });

    const r = await logAndSendEmail(lead);
    if (r.ok) return res.json({ success: true, logId: r.logId });
    return res.status(500).json({ error: r.error || '发送失败' });
  } catch (err) {
    console.error('发送邮件失败:', err);
    res.status(500).json({ error: '发送失败' });
  }
});

// 邮件记录列表
router.get('/emails', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.*, l.name AS lead_name
       FROM email_logs e
       LEFT JOIN leads l ON l.id = e.lead_id
       ORDER BY e.created_at DESC`
    );
    res.json({ emails: rows });
  } catch (err) {
    console.error('查询邮件记录失败:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// 删除客户
router.delete('/leads/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM leads WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('删除失败:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

module.exports = router;
