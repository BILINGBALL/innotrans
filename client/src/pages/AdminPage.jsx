import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PhotoPicker from '../components/PhotoPicker';
import {
  adminLogin,
  fetchLeads,
  fetchEmailLogs,
  exportLeads,
  deleteLead,
  updateLead,
  updateLeadPhoto,
  getEmailDefault,
  resendEmail,
} from '../api';
import { normalizePhone, stripPlus } from '../phone';

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
  const [notice, setNotice] = useState('');

  // 筛选 + 分页
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const [tab, setTab] = useState('leads');
  const [emails, setEmails] = useState([]);
  const [emailsLoading, setEmailsLoading] = useState(false);

  const [detail, setDetail] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // 详情编辑
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const [appendId, setAppendId] = useState(null);
  const [appendPhoto, setAppendPhoto] = useState(null);
  const [appending, setAppending] = useState(false);
  const [appendError, setAppendError] = useState('');

  // 邮件编辑弹窗
  const [composeLead, setComposeLead] = useState(null);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composing, setComposing] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { leads, total } = await fetchLeads(token, { page, pageSize, q: search, from, to });
      setLeads(leads);
      setTotal(total);
    } catch (err) {
      setNotice(err.message);
      if (err.message.includes('登录') || err.message.includes('未授权')) logout();
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, page, pageSize, search, from, to]);

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
    if (!token) return;
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (token) loadEmails();
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
      setDetail(null);
      await load();
    } catch (err) {
      setNotice(err.message);
    }
  };

  const openCompose = async (l) => {
    setComposeLead(l);
    setComposeSubject('');
    setComposeBody('');
    setComposing(true);
    setNotice('');
    try {
      const { subject, body } = await getEmailDefault(token, l.id);
      setComposeSubject(subject);
      setComposeBody(body);
    } catch (err) {
      setNotice(err.message);
      setComposeLead(null);
    } finally {
      setComposing(false);
    }
  };

  const sendCompose = async () => {
    setEmailSending(true);
    try {
      await resendEmail(token, composeLead.id, { subject: composeSubject, body: composeBody });
      setNotice(`已发送邮件给 ${composeLead.email}`);
      setComposeLead(null);
      await load();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setEmailSending(false);
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

  const closeDetail = () => {
    setDetail(null);
    setEditMode(false);
  };

  const startEdit = () => {
    setEditForm({
      name: detail.name || '',
      phone: stripPlus(detail.phone),
      whatsapp: stripPlus(detail.whatsapp),
      email: detail.email || '',
      company: detail.company || '',
      notes: detail.notes || '',
    });
    setEditMode(true);
  };

  const setEditField = (key) => (e) => setEditForm((f) => ({ ...f, [key]: e.target.value }));

  const saveEdit = async () => {
    if (!editForm.name || !editForm.name.trim()) {
      setNotice('姓名不能为空');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...editForm,
        phone: normalizePhone(editForm.phone),
        whatsapp: normalizePhone(editForm.whatsapp),
      };
      const { lead } = await updateLead(token, detail.id, payload);
      setDetail(lead);
      setEditMode(false);
      await load();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

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
            <div className="card">
              <div className="toolbar">
                <input
                  className="input input-search"
                  placeholder="搜索姓名 / 电话 / 公司…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
                <button className="btn btn-outline" onClick={load} disabled={loading}>
                  {loading ? '刷新中…' : '刷新'}
                </button>
                <button className="btn btn-primary" onClick={onExport}>
                  ⬇ 导出 CSV
                </button>
              </div>

              <div className="filter-row">
                <input
                  type="date"
                  className="input"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPage(1);
                  }}
                />
                <span className="filter-sep">至</span>
                <input
                  type="date"
                  className="input"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPage(1);
                  }}
                />
                {(from || to) && (
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      setFrom('');
                      setTo('');
                      setPage(1);
                    }}
                  >
                    清除日期
                  </button>
                )}
              </div>

              {notice && <p className="form-success">{notice}</p>}

              {/* 桌面：表格 */}
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
                    {leads.map((l) => (
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
                            <button className="btn btn-outline btn-sm" onClick={() => setDetail(l)}>
                              查看
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              disabled={!l.email}
                              onClick={() => openCompose(l)}
                            >
                              发邮件
                            </button>
                            <button className="btn btn-outline btn-sm" onClick={() => openAppend(l.id)}>
                              {l.photo_url ? '换照片' : '补传照片'}
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => onDelete(l.id)}>
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {leads.length === 0 && (
                      <tr>
                        <td colSpan={9} className="empty">
                          暂无数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* 手机：卡片 */}
              <div className="lead-cards">
                {leads.map((l) => (
                  <div key={l.id} className="lead-card" onClick={() => setDetail(l)}>
                    <div className="lead-card-top">
                      {l.photo_url ? (
                        <img
                          className="lead-card-photo"
                          src={l.photo_url}
                          alt={l.name}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewUrl(l.photo_url);
                          }}
                        />
                      ) : (
                        <span className="thumb-empty lead-card-photo">—</span>
                      )}
                      <div className="lead-card-body">
                        <div className="lead-card-name">{l.name}</div>
                        <div className="lead-card-meta">
                          {l.company && <span>🏢 {l.company}</span>}
                          {l.phone && <span>📞 {l.phone}</span>}
                          {l.whatsapp && <span>💬 {l.whatsapp}</span>}
                          {l.email && <span>📧 {l.email}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="lead-card-footer">
                      {l.email ? <EmailBadge status={l.last_email_status} /> : <span />}
                      <span className="lead-card-time">{fmt(l.created_at)}</span>
                    </div>
                    <div className="lead-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-outline btn-sm" onClick={() => setDetail(l)}>
                        查看
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        disabled={!l.email}
                        onClick={() => openCompose(l)}
                      >
                        发邮件
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => openAppend(l.id)}>
                        {l.photo_url ? '换照片' : '补照片'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => onDelete(l.id)}>
                        删除
                      </button>
                    </div>
                  </div>
                ))}
                {leads.length === 0 && <div className="empty">暂无数据</div>}
              </div>

              <div className="pagination">
                <span className="pagination-info">共 {total} 条</span>
                <select
                  className="camera-select"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10 条/页</option>
                  <option value={20}>20 条/页</option>
                  <option value={50}>50 条/页</option>
                  <option value={100}>100 条/页</option>
                </select>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  上一页
                </button>
                <span className="pagination-page">
                  {page} / {totalPages}
                </span>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  下一页
                </button>
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

            <div className="email-cards">
              {emails.map((e) => (
                <div key={e.id} className="email-card">
                  <div className="email-card-info">
                    <div className="email-card-to">{e.to_email}</div>
                    <div className="email-card-lead">
                      {e.lead_name ? `客户：${e.lead_name}` : '—'}
                    </div>
                  </div>
                  <div className="email-card-right">
                    <EmailBadge status={e.status} />
                    <span className="email-card-time">{fmt(e.created_at)}</span>
                  </div>
                </div>
              ))}
              {emails.length === 0 && <div className="empty">暂无邮件记录</div>}
            </div>
          </div>
        )}
      </main>

      {/* 详情弹窗（可编辑） */}
      {detail && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="modal modal-detail" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editMode ? '编辑客户' : detail.name}</h3>
              <button className="modal-x" onClick={closeDetail}>
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

            {editMode ? (
              <div className="detail-grid detail-grid-edit">
                <label className="field">
                  <span className="field-label">姓名 *</span>
                  <input className="input" value={editForm.name} onChange={setEditField('name')} />
                </label>
                <label className="field">
                  <span className="field-label">电话</span>
                  <div className="phone-field">
                    <span className="phone-plus">+</span>
                    <input className="input" value={editForm.phone} onChange={setEditField('phone')} />
                  </div>
                </label>
                <label className="field">
                  <span className="field-label">WhatsApp</span>
                  <div className="phone-field">
                    <span className="phone-plus">+</span>
                    <input className="input" value={editForm.whatsapp} onChange={setEditField('whatsapp')} />
                  </div>
                </label>
                <label className="field">
                  <span className="field-label">邮箱</span>
                  <input className="input" value={editForm.email} onChange={setEditField('email')} />
                </label>
                <label className="field">
                  <span className="field-label">公司</span>
                  <input className="input" value={editForm.company} onChange={setEditField('company')} />
                </label>
                <label className="field" style={{ gridColumn: '1 / -1' }}>
                  <span className="field-label">备注</span>
                  <textarea
                    className="input input-textarea"
                    rows={2}
                    value={editForm.notes}
                    onChange={setEditField('notes')}
                  />
                </label>
              </div>
            ) : (
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
                <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                  <span>备注</span>
                  <b style={{ whiteSpace: 'pre-wrap' }}>{detail.notes || '—'}</b>
                </div>
              </div>
            )}

            <div className="modal-actions">
              {editMode ? (
                <>
                  <button className="btn btn-outline" onClick={() => setEditMode(false)}>
                    取消
                  </button>
                  <button className="btn btn-primary" disabled={saving} onClick={saveEdit}>
                    {saving ? '保存中…' : '保存'}
                  </button>
                </>
              ) : (
                <>
                  {detail.email && (
                    <button
                      className="btn btn-outline"
                      onClick={() => openCompose(detail)}
                    >
                      📧 发送邮件
                    </button>
                  )}
                  <button className="btn btn-primary" onClick={startEdit}>
                    ✏️ 编辑
                  </button>
                </>
              )}
            </div>
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

      {/* 邮件编辑弹窗 */}
      {composeLead && (
        <div className="modal-overlay" onClick={() => setComposeLead(null)}>
          <div className="modal modal-compose" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">发送邮件给 {composeLead.name}</h3>
              <button className="modal-x" onClick={() => setComposeLead(null)}>
                ✕
              </button>
            </div>

            <label className="field">
              <span className="field-label">收件人</span>
              <input className="input" value={composeLead.email} disabled />
            </label>

            <label className="field">
              <span className="field-label">主题</span>
              <input
                className="input"
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
              />
            </label>

            <label className="field">
              <span className="field-label">正文</span>
              <textarea
                className="input input-textarea"
                rows={10}
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
              />
            </label>

            {composing && <p className="hint">加载默认内容中…</p>}

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setComposeLead(null)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                disabled={composing || emailSending || !composeBody.trim()}
                onClick={sendCompose}
              >
                {emailSending ? '发送中…' : '发送邮件'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
