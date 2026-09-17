const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pool } = require('./db');
const { getPhotoBuffer } = require('./oss');

const APP_BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
const FROM_EMAIL = process.env.SMTP_USER;
const SUBJECT = '感谢您参观 Sudelan 展台 / Thank you for visiting Sudelan';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: process.env.SMTP_SECURE !== 'false',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function brochurePath() {
  const candidates = [
    path.join(__dirname, 'Sudelan-Brochure.pdf'),       // server/ 目录
    path.join(__dirname, '..', 'Sudelan-Brochure.pdf'), // 项目根目录
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function buildHtml({ name, photoCid, trackUrl }) {
  const photo = photoCid
    ? `<div style="text-align:center;margin:16px 0;">
         <img src="cid:${photoCid}" alt="photo" style="max-width:360px;width:100%;border-radius:10px;" />
       </div>`
    : '';
  const pixel = trackUrl
    ? `<img src="${trackUrl}" width="1" height="1" style="display:none;" alt="" />`
    : '';

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f4f6fb;">
<div style="max-width:560px;margin:0 auto;padding:28px 24px;font-family:-apple-system,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif;color:#1f2937;">
  <div style="font-size:30px;">🚆</div>
  <h1 style="font-size:22px;margin:8px 0 4px;">感谢您参观 Sudelan 展台</h1>
  <p style="color:#6b7280;margin:0 0 22px;font-size:14px;">Thank you for visiting Sudelan at InnoTrans</p>
  <p style="font-size:15px;">Dear ${escapeHtml(name)},</p>
  <p style="font-size:15px;line-height:1.7;">感谢您在 InnoTrans 展会莅临 Sudelan 展台。附件是我们的产品手册，欢迎查阅。如有任何问题，欢迎随时联系我们。</p>
  <p style="font-size:15px;line-height:1.7;">Thank you for visiting Sudelan at InnoTrans. Please find our brochure attached. Feel free to reach out if you have any questions.</p>
  ${photo}
  <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:14px;">
    <p style="margin:0;">Best regards,</p>
    <p style="margin:4px 0 0;"><strong>Sudelan Team</strong></p>
  </div>
  ${pixel}
</div>
</body>
</html>`;
}

// 从 OSS 取客户照片，作为内嵌图片附件
async function getPhotoAttachment(key) {
  if (!key) return null;
  try {
    const { buffer, contentType } = await getPhotoBuffer(key);
    const isPng = key.toLowerCase().endsWith('.png');
    return {
      filename: isPng ? 'photo.png' : 'photo.jpg',
      content: buffer,
      contentType: contentType || (isPng ? 'image/png' : 'image/jpeg'),
      cid: 'photo',
    };
  } catch (e) {
    console.error('获取客户照片失败，邮件将不含图片:', e.message);
    return null;
  }
}

async function sendGreetingEmail(lead, trackId) {
  const attachments = [];
  let photoCid = null;

  const photoAtt = await getPhotoAttachment(lead.photo_url);
  if (photoAtt) {
    photoCid = photoAtt.cid;
    attachments.push(photoAtt);
  }

  const brochure = brochurePath();
  if (brochure) {
    attachments.push({ filename: 'Sudelan-Brochure.pdf', path: brochure });
  } else {
    console.warn('提示：未找到 Sudelan-Brochure.pdf，本次邮件不含附件');
  }

  const trackUrl = APP_BASE_URL ? `${APP_BASE_URL}/api/email/open/${trackId}` : null;

  await transporter.sendMail({
    from: `"Sudelan" <${FROM_EMAIL}>`,
    to: lead.email,
    subject: SUBJECT,
    html: buildHtml({ name: lead.name, photoCid, trackUrl }),
    attachments,
  });
}

// 记录并发送邮件（自动发信 / 后台补发共用）
async function logAndSendEmail(lead) {
  if (!lead || !lead.email) return { skipped: true };

  const trackId = crypto.randomUUID();
  const ins = await pool.query(
    `INSERT INTO email_logs (lead_id, to_email, subject, track_id, status)
     VALUES ($1, $2, $3, $4, 'sending') RETURNING id`,
    [lead.id, lead.email, SUBJECT, trackId]
  );
  const logId = ins.rows[0].id;

  try {
    await sendGreetingEmail(lead, trackId);
    await pool.query(`UPDATE email_logs SET status='sent' WHERE id=$1`, [logId]);
    return { ok: true, logId };
  } catch (e) {
    console.error('发送邮件失败:', e.message);
    await pool.query(
      `UPDATE email_logs SET status='failed', error=$1 WHERE id=$2`,
      [e.message.slice(0, 500), logId]
    );
    return { ok: false, logId, error: e.message };
  }
}

module.exports = { logAndSendEmail, transporter };
