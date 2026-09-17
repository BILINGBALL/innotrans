const express = require('express');
const { pool } = require('../db');
const { signToken, authMiddleware } = require('../auth');
const { savePhotoFromDataUrl, signUrl } = require('../oss');
const { logAndSendEmail, getDefaultEmail } = require('../email');

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

// 客户列表（分页 + 搜索 + 日期筛选，照片返回签名 URL）
router.get('/leads', authMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const q = (req.query.q || '').trim();
    const from = (req.query.from || '').trim();
    const to = (req.query.to || '').trim();

    const conds = [];
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      conds.push(
        `(l.name ILIKE $${params.length} OR l.phone ILIKE $${params.length} OR l.whatsapp ILIKE $${params.length} OR l.email ILIKE $${params.length} OR l.company ILIKE $${params.length} OR l.notes ILIKE $${params.length})`
      );
    }
    if (from) {
      params.push(from);
      conds.push(`l.created_at >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      conds.push(`l.created_at < $${params.length}::date + interval '1 day'`);
    }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const totalRow = await pool.query(
      `SELECT COUNT(*)::int AS total FROM leads l ${where}`,
      params
    );
    const total = totalRow.rows[0].total;

    const offset = (page - 1) * pageSize;
    const rows = await pool.query(
      `SELECT l.*,
         (SELECT e.status FROM email_logs e WHERE e.lead_id = l.id ORDER BY e.created_at DESC LIMIT 1) AS last_email_status
       FROM leads l ${where}
       ORDER BY l.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    const leads = rows.rows.map((r) => ({
      ...r,
      photo_url: r.photo_url ? signUrl(r.photo_url, VIEW_TTL) : null,
    }));
    res.json({ leads, total, page, pageSize });
  } catch (err) {
    console.error('查询失败:', err);
    res.status(500).json({ error: '查询失败' });
  }
});

// 导出 CSV（照片链接带 7 天有效期，导出全部）
router.get('/leads/export', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM leads ORDER BY created_at DESC');

    const header = ['ID', '姓名', '电话', 'WhatsApp', '邮箱', '公司', '备注', '照片链接', '创建时间'];
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
        r.notes,
        r.photo_url ? signUrl(r.photo_url, EXPORT_TTL) : '',
        fmt(r.created_at),
      ]
        .map(escape)
        .join(',')
    );

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

// 更新客户基本信息
router.put('/leads/:id', authMiddleware, async (req, res) => {
  try {
    const { name, phone, whatsapp, email, company, notes } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '姓名不能为空' });
    }
    const result = await pool.query(
      `UPDATE leads SET name=$1, phone=$2, whatsapp=$3, email=$4, company=$5, notes=$6
       WHERE id=$7 RETURNING *`,
      [name.trim(), phone || null, whatsapp || null, email || null, company || null, notes || null, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: '记录不存在' });
    const lead = {
      ...result.rows[0],
      photo_url: result.rows[0].photo_url ? signUrl(result.rows[0].photo_url, VIEW_TTL) : null,
    };
    res.json({ success: true, lead });
  } catch (err) {
    console.error('更新客户失败:', err);
    res.status(500).json({ error: '更新失败' });
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

// 获取某客户的默认邮件内容（编辑页预填用）
router.get('/leads/:id/email-default', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: '记录不存在' });
    if (!rows[0].email) return res.status(400).json({ error: '该客户未填写邮箱' });
    res.json(getDefaultEmail(rows[0]));
  } catch (err) {
    console.error('获取默认邮件失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 手动补发邮件（可自定义 subject / body）
router.post('/leads/:id/send-email', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: '记录不存在' });
    const lead = rows[0];
    if (!lead.email) return res.status(400).json({ error: '该客户未填写邮箱，无法发送' });

    const { subject, body } = req.body || {};
    const r = await logAndSendEmail(lead, { subject, body });
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
