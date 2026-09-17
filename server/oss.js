const OSS = require('ali-oss');

const client = new OSS({
  region: process.env.OSS_REGION || 'oss-cn-hangzhou',
  accessKeyId: process.env.OSS_ACCESS_KEY,
  accessKeySecret: process.env.OSS_ACCESS_SECRET,
  bucket: process.env.OSS_BUCKET,
  secure: true,
});

// 上传图片 Buffer 到 OSS，返回对象 key（如 leads/xxx.jpg）
async function uploadPhoto(buffer, ext = 'jpg') {
  const key = `leads/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const mime =
    ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  await client.put(key, buffer, { mime });
  return key;
}

// 解析 base64 dataURL 并上传到 OSS；无有效图片返回 null
async function savePhotoFromDataUrl(photo) {
  if (typeof photo !== 'string' || !photo.startsWith('data:image/')) return null;
  const matches = photo.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) return null;

  const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  if (buffer.length > 15 * 1024 * 1024) {
    throw new Error('图片过大');
  }
  return uploadPhoto(buffer, ext);
}

// 从对象 key 或旧的完整 URL 中提取 key
function toKey(ref) {
  if (!ref) return null;
  if (ref.includes('://')) {
    try {
      return new URL(ref).pathname.replace(/^\//, '');
    } catch {
      return ref;
    }
  }
  return ref;
}

// 生成临时签名 URL（私有 bucket 用），默认 24 小时有效
function signUrl(ref, expiresSeconds = 86400) {
  const key = toKey(ref);
  if (!key) return null;
  return client.signatureUrl(key, { expires: expiresSeconds });
}

// 读取照片原始字节（用于邮件内嵌图片）
async function getPhotoBuffer(ref) {
  const key = toKey(ref);
  if (!key) throw new Error('无效的照片 key');
  const result = await client.get(key);
  const contentType =
    (result.res && result.res.headers && result.res.headers['content-type']) || 'image/jpeg';
  return { buffer: result.content, contentType };
}

module.exports = { uploadPhoto, savePhotoFromDataUrl, signUrl, getPhotoBuffer };
