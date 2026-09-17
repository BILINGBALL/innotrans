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

export function fetchLeads(token) {
  return fetch(`${API_BASE}/api/admin/leads`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(handle);
}

export function deleteLead(token, id) {
  return fetch(`${API_BASE}/api/admin/leads/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).then(handle);
}

export function updateLeadPhoto(token, id, photo) {
  return fetch(`${API_BASE}/api/admin/leads/${id}/photo`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ photo }),
  }).then(handle);
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
