const jwt = require('jsonwebtoken');

function signToken() {
  return jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function signRecycleToken() {
  return jwt.sign({ role: 'recycle' }, process.env.JWT_SECRET, { expiresIn: '1d' });
}

function verifyBearer(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: '未授权，请先登录' });
    return null;
  }
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    res.status(401).json({ error: '登录已过期，请重新登录' });
    return null;
  }
}

// 后台管理接口：仅 admin 角色
function authMiddleware(req, res, next) {
  const decoded = verifyBearer(req, res);
  if (!decoded) return;
  if (decoded.role !== 'admin') return res.status(403).json({ error: '无权限' });
  next();
}

// 回收站接口：仅 recycle 角色（独立密码登录）
function recycleMiddleware(req, res, next) {
  const decoded = verifyBearer(req, res);
  if (!decoded) return;
  if (decoded.role !== 'recycle') return res.status(403).json({ error: '无权限' });
  next();
}

module.exports = { signToken, signRecycleToken, authMiddleware, recycleMiddleware };
