import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import PhotoPicker from '../components/PhotoPicker';
import VoiceInput from '../components/VoiceInput';
import { getQrStatus, scanQr, submitQrLead } from '../api';
import { normalizePhone } from '../phone';

const EMPTY = { name: '', phone: '', whatsapp: '', email: '', company: '', notes: '' };

export default function FillPage() {
  const { token } = useParams();
  const [state, setState] = useState('loading'); // loading | ready | filled | notfound
  const [form, setForm] = useState(EMPTY);
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // 语音识别：记录录音开始时的 notes 作为"基底"，识别过程中用 (基底 + 识别文本) 覆盖 notes
  const voiceBaseRef = useRef('');

  useEffect(() => {
    (async () => {
      try {
        const st = await getQrStatus(token);
        if (!st.valid) {
          setState('filled');
          return;
        }
        setState('ready');
        // 上报「被扫」（失败不阻塞填写）
        scanQr(token).catch(() => {});
      } catch (e) {
        setState('notfound');
      }
    })();
  }, [token]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('请填写姓名');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await submitQrLead(token, {
        ...form,
        phone: normalizePhone(form.phone),
        whatsapp: normalizePhone(form.whatsapp),
        photos,
      });
      setSuccess(true);
      setSubmitting(false);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="topbar-logo">🚆</span>
          <div>
            <div className="topbar-title">客户信息登记</div>
          </div>
        </div>
      </header>

      <main className="container container-narrow">
        {state === 'loading' && (
          <div className="card capture-card">
            <p className="hint">加载中…</p>
          </div>
        )}

        {state === 'notfound' && (
          <div className="card capture-card">
            <p className="form-error">二维码不存在或已失效</p>
          </div>
        )}

        {state === 'filled' && (
          <div className="card capture-card">
            <p className="form-success">✓ 感谢，您的信息已提交过</p>
            <p className="hint">该二维码已使用，如有疑问请联系工作人员。</p>
          </div>
        )}

        {success && (
          <div className="card capture-card">
            <p className="form-success">✓ 提交成功，感谢您的配合</p>
          </div>
        )}

        {state === 'ready' && !success && (
          <form className="card capture-card" onSubmit={submit}>
            <h2 className="section-title">请填写您的信息</h2>

            <label className="field">
              <span className="field-label">
                姓名 Name <i className="req">*</i>
              </span>
              <input className="input" placeholder="Name" value={form.name} onChange={set('name')} />
            </label>

            <div className="field-grid">
              <label className="field">
                <span className="field-label">电话 Phone</span>
                <div className="phone-field">
                  <span className="phone-plus">+</span>
                  <input className="input" type="tel" placeholder="Country code + number" value={form.phone} onChange={set('phone')} />
                </div>
              </label>
              <label className="field">
                <span className="field-label">WhatsApp</span>
                <div className="phone-field">
                  <span className="phone-plus">+</span>
                  <input className="input" type="tel" placeholder="Country code + number" value={form.whatsapp} onChange={set('whatsapp')} />
                </div>
              </label>
              <label className="field">
                <span className="field-label">邮箱 Email</span>
                <input className="input" type="email" placeholder="Email" value={form.email} onChange={set('email')} />
              </label>
              <label className="field">
                <span className="field-label">公司 Company</span>
                <input className="input" placeholder="Company" value={form.company} onChange={set('company')} />
              </label>
            </div>

            <label className="field">
              <span className="field-label">备注 Notes</span>
              <textarea className="input input-textarea" rows={3} placeholder="Notes" value={form.notes} onChange={set('notes')} />
              <VoiceInput
                onStart={() => {
                  voiceBaseRef.current = form.notes || '';
                }}
                onText={(t) =>
                  setForm((f) => ({
                    ...f,
                    notes: (voiceBaseRef.current ? voiceBaseRef.current + ' ' : '') + t,
                  }))
                }
              />
            </label>

            <div className="form-section">
              <h2 className="section-title">照片 Photos（可选）</h2>
              <PhotoPicker photos={photos} onChange={setPhotos} max={6} />
            </div>

            {error && <p className="form-error">{error}</p>}

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
              {submitting ? '提交中…' : '提交'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
