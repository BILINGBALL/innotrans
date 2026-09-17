const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pool } = require('./db');
const { getPhotoBuffer } = require('./oss');

const APP_BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
const FROM_EMAIL = process.env.SMTP_USER;
const DEFAULT_SUBJECT = 'Thank you for visiting Sudelan at InnoTrans';

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

// 默认邮件正文（纯文本，可编辑）
function defaultBody(name) {
  return `Dear ${name},

Thank you for stopping by our booth at InnoTrans. Please find our brochure attached. If you have any questions, feel free to reach out — we'd be happy to help.

Best regards,
Brian | Sudelan Team`;
}

// 获取某客户的默认邮件内容
function getDefaultEmail(lead) {
  return { subject: DEFAULT_SUBJECT, body: defaultBody(lead.name) };
}

// 纯文本正文 → HTML（空行分段，换行转 <br/>）
function plainToHtml(text) {
  return String(text || '')
    .split(/\n\n+/)
    .map(
      (p) =>
        `<p style="font-size:15px;line-height:1.7;margin:0 0 12px;">${escapeHtml(p.trim()).replace(/\n/g, '<br/>')}</p>`
    )
    .join('');
}

function buildHtml({ body, photoCid, trackUrl }) {
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
<div style="max-width:560px;margin:0 auto;padding:28px 24px;font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1f2937;">
  <div style="font-size:30px;">🚆</div>
  <div style="height:16px;"></div>
  ${plainToHtml(body)}
  ${photo}
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

async function sendGreetingEmail(lead, trackId, opts = {}) {
  const subject = opts.subject || DEFAULT_SUBJECT;
  const body = opts.body || defaultBody(lead.name);

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
  }

  const trackUrl = APP_BASE_URL ? `${APP_BASE_URL}/api/email/open/${trackId}` : null;

  await transporter.sendMail({
    from: `"Sudelan" <${FROM_EMAIL}>`,
    to: lead.email,
    subject,
    html: buildHtml({ body, photoCid, trackUrl }),
    attachments,
  });
}

// 记录并发送邮件（自动发信用默认内容，后台补发可传自定义 subject/body）
async function logAndSendEmail(lead, opts = {}) {
  if (!lead || !lead.email) return { skipped: true };

  const trackId = crypto.randomUUID();
  const subject = opts.subject || DEFAULT_SUBJECT;
  const ins = await pool.query(
    `INSERT INTO email_logs (lead_id, to_email, subject, track_id, status)
     VALUES ($1, $2, $3, $4, 'sending') RETURNING id`,
    [lead.id, lead.email, subject, trackId]
  );
  const logId = ins.rows[0].id;

  try {
    await sendGreetingEmail(lead, trackId, opts);
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

module.exports = { logAndSendEmail, getDefaultEmail, transporter };
