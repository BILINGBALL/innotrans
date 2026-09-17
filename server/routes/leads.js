const express = require('express');
const { pool } = require('../db');
const { savePhotoFromDataUrl } = require('../oss');
const { logAndSendEmail } = require('../email');

const router = express.Router();

// 新建客户（前台提交，公开接口）
router.post('/', async (req, res) => {
  try {
    const { name, phone, whatsapp, email, company, notes, photo, send_email } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: '请填写姓名' });
    }

    let photoUrl = null;
    if (photo) {
      try {
        photoUrl = await savePhotoFromDataUrl(photo);
      } catch (uploadErr) {
        return res.status(400).json({ error: uploadErr.message });
      }
    }

    const result = await pool.query(
      `INSERT INTO leads (name, phone, whatsapp, email, company, notes, photo_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name.trim(), phone || null, whatsapp || null, email || null, company || null, notes || null, photoUrl]
    );

    const lead = result.rows[0];
    res.status(201).json({ success: true, lead });

    // 勾选了「发送邮件」且填了邮箱才自动发信；无邮箱时安全跳过，不会报错
    if (lead.email && send_email === true) {
      logAndSendEmail(lead).catch((e) => console.error('自动发信失败:', e.message));
    }
  } catch (err) {
    console.error('创建客户失败:', err);
    res.status(500).json({ error: '提交失败，请重试' });
  }
});

module.exports = router;
