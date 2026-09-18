import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { createQr, listQr, deleteQr } from '../api';

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

export default function QrPanel({ token }) {
  const [qrs, setQrs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { qrs } = await listQr(token);
      setQrs(qrs);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const generate = async () => {
    setError('');
    try {
      await createQr(token, '');
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (id) => {
    try {
      await deleteQr(token, id);
      await load();
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

  // 只展示未扫描、未使用的二维码
  const visibleQrs = qrs.filter((q) => !q.scanned_at && !q.filled_at);

  return (
    <div className="card">
      <div className="toolbar">
        <button className="btn btn-primary" onClick={generate}>＋ 生成二维码</button>
      </div>
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
  );
}
