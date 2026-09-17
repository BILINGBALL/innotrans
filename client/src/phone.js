// 归一化电话号码：确保带国家代码的 + 前缀（用户可能手输 +，也可能没输）
export function normalizePhone(value) {
  const s = (value || '').trim().replace(/^\+/, '');
  return s ? '+' + s : '';
}

// 去掉 + 前缀，用于编辑框回填（编辑框前已有固定的 + 号）
export function stripPlus(value) {
  return (value || '').trim().replace(/^\+/, '');
}
