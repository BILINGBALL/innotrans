import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PhotoPicker from '../components/PhotoPicker';
import {
  adminLogin,
  fetchLeads,
  fetchEmailLogs,
  exportLeads,
  deleteLead,
  updateLeadPhoto,
  resendEmail,
} from '../api';

function fmt(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('zh-CN', { hour12: false });
}

const EMAIL_STATUS = {
  sent: ['已发送', 'badge-sent'],
  opened: ['已打开', 'badge-opened'],
  failed: ['失败', 'badge-failed'],
  sending: ['发送中', 'badge-sending'],
};

function EmailBadge({ status }) {
  if (!status) return <span className="badge badge-none">未发送</span>;
  const [label, cls] = EMAIL_STATUS[status] || ['未知', 'badge-none'];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default function AdminPage() {
  const [token, setToken] = useState(() => localStorage.getItem('innotrans_admin') || '');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');

  // 标签页
  const [tab, setTab] = useState('leads');
  const [emails, setEmails] = useState([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [sendingId, setSendingId] = useState(null);

  // 详情弹窗 / 大图预览
  const [detail, setDetail] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // 补传照片弹窗
  const [appendId, setAppendId] = useState(null);
  const [appendPhoto, setAppendPhoto] = useState(null);
  const [appending, setAppending] = useState(false);
  const [appendError, setAppendError] = useState('');

  const doLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const { token } = await adminLogin(password);
      localStorage.setItem('innotrans_admin', token);
      setToken(token);
    } catch (err) {
      setLoginError(err.message);
    }
  };

  const logout = () => {
    localStorage.removeItem('innotrans_admin');
    setToken('');
    setLeads([]);
    setEmails([]);
  };

  const load = async () => {
    setLoading(true);
    try {
      const { leads } = await fetchLeads(token);
      setLeads(leads);
    } catch (err) {
      setNotice(err.message);
      if (err.message.includes('登录') || err.message.includes('未授权')) logout();
    } finally {
      setLoading(false);
    }
  };

  const loadEmails = async () => {
    setEmailsLoading(true);
    try {
      const { emails } = await fetchEmailLogs(token);
      setEmails(emails);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setEmailsLoading(false);
    }
  };

  useEffect(() => {
    if (token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const switchTab = (t) => {
    setTab(t);
    setNotice('');
    if (t === 'emails') loadEmails();
  };

  const onExport = async () => {
    setNotice('');
    try {
      await exportLeads(token);
      setNotice('导出成功');
    } catch (err) {
      setNotice(err.message);
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm('确定删除该客户？此操作不可恢复。')) return;
    try {
      await deleteLead(token, id);
      setLeads((l) => l.filter((x) => x.id !== id));
    } catch (err) {
      setNotice(err.message);
    }
  };

  const onSendEmail = async (l) => {
    setSendingId(l.id);
    setNotice('');
    try {
      await resendEmail(token, l.id);
      setNotice(`已发送邮件给 ${l.email}`);
      await load();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setSendingId(null);
    }
  };

  const openAppend = (id) => {
    setAppendId(id);
    setAppendPhoto(null);
    setAppendError('');
  };

  const closeAppend = () => {
    setAppendId(null);
    setAppendPhoto(null);
    setAppendError('');
  };

  const savePhoto = async () => {
    setAppending(true);
    setAppendError('');
    try {
      await updateLeadPhoto(token, appendId, appendPhoto);
      await load();
      closeAppend();
    } catch (err) {
      setAppendError(err.message);
    } finally {
      setAppending(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.name, l.phone, l.whatsapp, l.email, l.company]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [leads, search]);

  if (!token) {
    return (
      <div className="page page-center">
        <div className="gate-card">
          <div className="gate-logo">🔐</div>
          <h1 className="gate-title">客户历史记录</h1>
          <p className="gate-subtitle">请输入密码查看</p>
          <form onSubmit={doLogin} className="gate-form">
            <input
              type="password"
              className={`input ${loginError ? 'input-error' : ''}`}
              placeholder="密码"
              value={password}
              autoFocus
              onChange={(e) => {
                setPassword(e.target.value);
                setLoginError('');
              }}
            />
            {loginError && <p className="gate-error">{loginError}</p>}
            <button type="submit" className="btn btn-primary btn-block">
              登录
            </button>
          </form>
          <Link to="/" className="gate-back">
            ← 返回采集页
          </Link>
        </div>
      </div>
    );
  }

  const today = new Date().toDateString();
  const todayCount = leads.filter((l) => new Date(l.created_at).toDateString() === today).length;
  const withPhoto = leads.filter((l) => l.photo_url).length;

  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="topbar-logo">🚆</span>
          <div>
            <div className="topbar-title">客户历史记录</div>
            <div className="topbar-sub">InnoTrans Lead Dashboard</div>
          </div>
        </div>
        <div className="topbar-actions">
          <Link to="/" className="topbar-link">
            采集页
          </Link>
          <button className="btn btn-outline btn-sm" onClick={logout}>
            退出登录
          </button>
        </div>
      </header>

      <main className="container">
        <div className="tabs">
          <button
            className={`tab ${tab === 'leads' ? 'tab-active' : ''}`}
            onClick={() => switchTab('leads')}
          >
            客户列表
          </button>
          <button
            className={`tab ${tab === 'emails' ? 'tab-active' : ''}`}
            onClick={() => switchTab('emails')}
          >
            邮件记录
          </button>
        </div>

        {tab === 'leads' && (
          <>
            <div className="stats">
              <div className="stat">
                <div className="stat-value">{leads.length}</div>
                <div className="stat-label">客户总数</div>
              </div>
              <div className="stat">
                <div className="stat-value">{todayCount}</div>
                <div className="stat-label">今日新增</div>
              </div>
              <div className="stat">
                <div className="stat-value">{withPhoto}</div>
                <div className="stat-label">已拍照</div>
              </div>
            </div>

            <div className="card">
              <div className="toolbar">
                <input
                  className="input input-search"
                  placeholder="搜索姓名 / 电话 / 公司…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button className="btn btn-outline" onClick={load} disabled={loading}>
                  {loading ? '刷新中…' : '刷新'}
                </button>
                <button className="btn btn-primary" onClick={onExport}>
                  ⬇ 导出 CSV
                </button>
              </div>

              {notice && <p className="form-success">{notice}</p>}

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>照片</th>
                      <th>姓名</th>
                      <th>电话</th>
                      <th>WhatsApp</th>
                      <th>邮箱</th>
                      <th>公司</th>
                      <th>邮件</th>
                      <th>创建时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((l) => (
                      <tr key={l.id} onClick={() => setDetail(l)}>
                        <td>
                          {l.photo_url ? (
                            <img
                              className="thumb"
                              src={l.photo_url}
                              alt={l.name}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewUrl(l.photo_url);
                              }}
                            />
                          ) : (
                            <span className="thumb-empty">—</span>
                          )}
                        </td>
                        <td className="cell-name">{l.name}</td>
                        <td>{l.phone || '—'}</td>
                        <td>{l.whatsapp || '—'}</td>
                        <td>{l.email || '—'}</td>
                        <td>{l.company || '—'}</td>
                        <td>{l.email ? <EmailBadge status={l.last_email_status} /> : '—'}</td>
                        <td className="cell-time">{fmt(l.created_at)}</td>
                        <td>
                          <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => setDetail(l)}
                            >
                              查看
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              disabled={!l.email || sendingId === l.id}
                              onClick={() => onSendEmail(l)}
                            >
                              {sendingId === l.id ? '发送中…' : '发邮件'}
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => openAppend(l.id)}
                            >
                              {l.photo_url ? '换照片' : '补传照片'}
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => onDelete(l.id)}
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={9} className="empty">
                          暂无数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {tab === 'emails' && (
          <div className="card">
            <div className="toolbar">
              <h2 className="section-title" style={{ margin: 0 }}>
                邮件记录
              </h2>
              <button className="btn btn-outline" onClick={loadEmails} disabled={emailsLoading}>
                {emailsLoading ? '刷新中…' : '刷新'}
              </button>
            </div>

            {notice && <p className="form-success">{notice}</p>}

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>发送时间</th>
                    <th>客户</th>
                    <th>收件人</th>
                    <th>状态</th>
                    <th>打开时间</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  {emails.map((e) => (
                    <tr key={e.id}>
                      <td className="cell-time">{fmt(e.created_at)}</td>
                      <td className="cell-name">{e.lead_name || '—'}</td>
                      <td>{e.to_email}</td>
                      <td>
                        <EmailBadge status={e.status} />
                      </td>
                      <td className="cell-time">{e.opened_at ? fmt(e.opened_at) : '—'}</td>
                      <td className="cell-error">{e.error || ''}</td>
                    </tr>
                  ))}
                  {emails.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty">
                        暂无邮件记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* 详情弹窗 */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal modal-detail" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{detail.name}</h3>
              <button className="modal-x" onClick={() => setDetail(null)}>
                ✕
              </button>
            </div>

            {detail.photo_url ? (
              <img
                src={detail.photo_url}
                alt={detail.name}
                className="detail-photo"
                onClick={() => setPreviewUrl(detail.photo_url)}
              />
            ) : (
              <div className="detail-photo detail-photo-empty">暂无照片</div>
            )}

            <div className="detail-grid">
              <div className="detail-item">
                <span>姓名</span>
                <b>{detail.name}</b>
              </div>
              <div className="detail-item">
                <span>电话</span>
                <b>{detail.phone || '—'}</b>
              </div>
              <div className="detail-item">
                <span>WhatsApp</span>
                <b>{detail.whatsapp || '—'}</b>
              </div>
              <div className="detail-item">
                <span>邮箱</span>
                <b>{detail.email || '—'}</b>
              </div>
              <div className="detail-item">
                <span>公司</span>
                <b>{detail.company || '—'}</b>
              </div>
              <div className="detail-item">
                <span>创建时间</span>
                <b>{fmt(detail.created_at)}</b>
              </div>
            </div>

            {detail.email && (
              <div className="modal-actions">
                <button
                  className="btn btn-primary"
                  disabled={sendingId === detail.id}
                  onClick={() => onSendEmail(detail)}
                >
                  {sendingId === detail.id ? '发送中…' : '📧 发送邮件'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 大图预览 */}
      {previewUrl && (
        <div className="lightbox" onClick={() => setPreviewUrl(null)}>
          <img
            src={previewUrl}
            alt="大图预览"
            className="lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          <button className="lightbox-close" onClick={() => setPreviewUrl(null)}>
            ✕
          </button>
        </div>
      )}

      {/* 补传照片弹窗 */}
      {appendId != null && (
        <div className="modal-overlay" onClick={closeAppend}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">补传 / 更换客户照片</h3>
            <PhotoPicker
              photo={appendPhoto}
              onCapture={setAppendPhoto}
              onClear={() => setAppendPhoto(null)}
            />
            {appendError && <p className="form-error">{appendError}</p>}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={closeAppend}>
                取消
              </button>
              <button
                className="btn btn-primary"
                disabled={!appendPhoto || appending}
                onClick={savePhoto}
              >
                {appending ? '上传中…' : '保存照片'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
