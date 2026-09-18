const API_BASE = import.meta.env.VITE_API_BASE || '';

async function handle(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || '请求失败');
  return json;
}

export function createLead(data) {
  return fetch(`${API_BASE}/api/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(handle);
}

export function adminLogin(password) {
  return fetch(`${API_BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  }).then(handle);
}

export function fetchLeads(token, params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v != null) qs.set(k, v);
  });
  const query = qs.toString();
  return fetch(`${API_BASE}/api/admin/leads${query ? '?' + query : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(handle);
}

export function fetchLead(token, id) {
  return fetch(`${API_BASE}/api/admin/leads/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(handle);
}

export function updateLead(token, id, data) {
  return fetch(`${API_BASE}/api/admin/leads/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  }).then(handle);
}

export function deleteLead(token, id) {
  return fetch(`${API_BASE}/api/admin/leads/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).then(handle);
}

export function updateLeadPhotos(token, id, { keys, dataUrls }) {
  return fetch(`${API_BASE}/api/admin/leads/${id}/photos`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ keys, dataUrls }),
  }).then(handle);
}

export function getEmailDefault(token, leadId) {
  return fetch(`${API_BASE}/api/admin/leads/${leadId}/email-default`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(handle);
}

export function resendEmail(token, leadId, data = {}) {
  return fetch(`${API_BASE}/api/admin/leads/${leadId}/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  }).then(handle);
}

export function fetchEmailLogs(token) {
  return fetch(`${API_BASE}/api/admin/emails`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(handle);
}

export function recognizeSpeech(audio) {
  return fetch(`${API_BASE}/api/speech/recognize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio }),
  }).then(handle);
}

// 流式语音识别 WebSocket 地址（开发环境通过 Vite 代理转发到后端 :4000）
export function getSpeechWsUrl() {
  if (API_BASE) {
    // 显式配置了 VITE_API_BASE，按其协议/host 推导 ws/wss
    const u = new URL(API_BASE);
    return `${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}/ws/speech`;
  }
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/speech`;
}

// 带鉴权的 CSV 导出，用 Blob 下载
export async function exportLeads(token) {
  const res = await fetch(`${API_BASE}/api/admin/leads/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || '导出失败');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `innotrans-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ===== 二维码自助填写 =====
export function createQr(token, label) {
  return fetch(`${API_BASE}/api/qr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ label }),
  }).then(handle);
}

export function listQr(token) {
  return fetch(`${API_BASE}/api/qr`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(handle);
}

export function deleteQr(token, id) {
  return fetch(`${API_BASE}/api/qr/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).then(handle);
}

export function getQrStatus(qrToken) {
  return fetch(`${API_BASE}/api/qr/${qrToken}`).then(handle);
}

export function scanQr(qrToken) {
  return fetch(`${API_BASE}/api/qr/${qrToken}/scan`, { method: 'POST' }).then(handle);
}

export function submitQrLead(qrToken, data) {
  return fetch(`${API_BASE}/api/qr/${qrToken}/lead`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(handle);
}

// ===== 回收站 =====
export function recycleLogin(password) {
  return fetch(`${API_BASE}/api/admin/recycle/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  }).then(handle);
}

export function fetchRecycle(token) {
  return fetch(`${API_BASE}/api/admin/recycle`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(handle);
}

export function restoreLead(token, id) {
  return fetch(`${API_BASE}/api/admin/recycle/${id}/restore`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).then(handle);
}

export function hardDeleteLead(token, id) {
  return fetch(`${API_BASE}/api/admin/recycle/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).then(handle);
}
