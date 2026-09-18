import { useEffect, useState } from 'react';
import { recycleLogin, fetchRecycle, restoreLead, hardDeleteLead } from '../api';

function fmt(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('zh-CN', { hour12: false });
}

export default function RecycleBin({ open, onClose, onChanged }) {
  const [token, setToken] = useState(() => localStorage.getItem('innotrans_recycle') || '');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async (t) => {
    setLoading(true);
    try {
      const { leads } = await fetchRecycle(t);
      setLeads(leads);
      setError('');
    } catch (e) {
      if (e.message.includes('登录') || e.message.includes('未授权') || e.message.includes('无权限')) {
        localStorage.removeItem('innotrans_recycle');
        setToken('');
      }
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && token) load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token]);

  const doLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const { token: t } = await recycleLogin(password);
      localStorage.setItem('innotrans_recycle', t);
      setToken(t);
      setPassword('');
    } catch (err) {
      setLoginError(err.message);
    }
  };

  const doRestore = async (id) => {
    try {
      await restoreLead(token, id);
      await load(token);
      onChanged && onChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  const doHardDelete = async (id) => {
    if (!window.confirm('彻底删除后不可恢复，确定？')) return;
    try {
      await hardDeleteLead(token, id);
      await load(token);
      onChanged && onChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-recycle" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">回收站</h3>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>

        {!token ? (
          <form className="gate-form" onSubmit={doLogin}>
            <p className="hint">回收站需要独立密码</p>
            <input
              type="password"
              className="input"
              placeholder="回收站密码"
              value={password}
              autoFocus
              onChange={(e) => { setPassword(e.target.value); setLoginError(''); }}
            />
            {loginError && <p className="form-error">{loginError}</p>}
            <button type="submit" className="btn btn-primary btn-block">进入回收站</button>
          </form>
        ) : (
          <div>
            {error && <p className="form-error">{error}</p>}
            {loading && <p className="hint">加载中…</p>}

            {!loading && leads.length === 0 && <p className="hint">回收站为空</p>}

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>电话</th>
                    <th>邮箱</th>
                    <th>删除时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id}>
                      <td className="cell-name">{l.name}</td>
                      <td>{l.phone || '—'}</td>
                      <td>{l.email || '—'}</td>
                      <td className="cell-time">{fmt(l.deleted_at)}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn btn-outline btn-sm" onClick={() => doRestore(l.id)}>恢复</button>
                          <button className="btn btn-danger btn-sm" onClick={() => doHardDelete(l.id)}>彻底删除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
