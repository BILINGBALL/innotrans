import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { adminLogin, createQr, listQr, deleteQr } from '../api';

function QrImage({ value }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { width: 240, margin: 1 })
      .then((u) => { if (alive) setUrl(u); })
      .catch(() => {});
    return () => { alive = false; };
  }, [value]);
  return url ? <img src={url} alt="二维码" className="qr-img" /> : <span className="qr-loading">…</span>;
}

export default function QrDrawer({ open, onClose }) {
  const [token, setToken] = useState(() => localStorage.getItem('innotrans_admin') || '');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [qrs, setQrs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(null);

  const load = async (t) => {
    setLoading(true);
    try {
      const { qrs } = await listQr(t);
      setQrs(qrs);
      setError('');
    } catch (e) {
      if (e.message.includes('登录') || e.message.includes('未授权') || e.message.includes('无权限')) {
        localStorage.removeItem('innotrans_admin');
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
      const { token: t } = await adminLogin(password);
      localStorage.setItem('innotrans_admin', t);
      setToken(t);
      setPassword('');
    } catch (err) {
      setLoginError(err.message);
    }
  };

  const generate = async () => {
    setError('');
    try {
      await createQr(token, '');
      await load(token);
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (id) => {
    try {
      await deleteQr(token, id);
      await load(token);
    } catch (e) {
      setError(e.message);
    }
  };

  const urlFor = (t) => `${window.location.origin}/fill/${t}`;
  const copy = async (t) => {
    try {
      await navigator.clipboard.writeText(urlFor(t));
      setCopied(t);
      setTimeout(() => setCopied(null), 1500);
    } catch (e) {}
  };

  // 默认只显示可被扫描（未扫描、未使用）的二维码
  const visibleQrs = qrs.filter((q) => !q.scanned_at && !q.filled_at);

  return (
    <>
      {open && <div className="drawer-overlay" onClick={onClose} />}
      <div className={`drawer ${open ? 'drawer-open' : ''}`}>
        <div className="drawer-header">
          <h3 className="modal-title" style={{ margin: 0 }}>二维码登记</h3>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>

        {!token ? (
          <form className="gate-form" onSubmit={doLogin}>
            <p className="hint">请输入管理员密码解锁二维码功能</p>
            <input
              type="password"
              className="input"
              placeholder="管理员密码"
              value={password}
              autoFocus
              onChange={(e) => { setPassword(e.target.value); setLoginError(''); }}
            />
            {loginError && <p className="form-error">{loginError}</p>}
            <button type="submit" className="btn btn-primary btn-block">解锁</button>
          </form>
        ) : (
          <div className="drawer-body">
            <button className="btn btn-primary btn-block" onClick={generate}>＋ 生成二维码</button>
            {error && <p className="form-error">{error}</p>}
            {loading && <p className="hint">加载中…</p>}

            <div className="qr-list">
              {visibleQrs.map((q) => (
                <div className="qr-card" key={q.id}>
                  <QrImage value={urlFor(q.token)} />
                  <div className="qr-info">
                    <div className="qr-status">⭕ 未扫描</div>
                    <div className="qr-time">{new Date(q.created_at).toLocaleString('zh-CN', { hour12: false })}</div>
                  </div>
                  <div className="qr-actions">
                    <button className="btn btn-outline btn-sm" onClick={() => copy(q.token)}>
                      {copied === q.token ? '✓ 已复制' : '复制链接'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(q.id)}>删除</button>
                  </div>
                </div>
              ))}
              {visibleQrs.length === 0 && !loading && <p className="hint">还没有二维码，点上方按钮生成</p>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
