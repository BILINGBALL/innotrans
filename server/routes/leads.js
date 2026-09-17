const express = require('express');
const { pool } = require('../db');
const { savePhotoFromDataUrl } = require('../oss');

const router = express.Router();

// 新建客户（前台提交，公开接口）
router.post('/', async (req, res) => {
  try {
    const { name, phone, whatsapp, email, company, photo } = req.body || {};

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
      `INSERT INTO leads (name, phone, whatsapp, email, company, photo_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name.trim(), phone || null, whatsapp || null, email || null, company || null, photoUrl]
    );

    res.status(201).json({ success: true, lead: result.rows[0] });
  } catch (err) {
    console.error('创建客户失败:', err);
    res.status(500).json({ error: '提交失败，请重试' });
  }
});

module.exports = router;
