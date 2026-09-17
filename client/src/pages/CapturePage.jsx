import { useState } from 'react';
import { Link } from 'react-router-dom';
import PasswordGate from '../components/PasswordGate';
import PhotoPicker from '../components/PhotoPicker';
import VoiceInput from '../components/VoiceInput';
import { createLead } from '../api';

const EMPTY = { name: '', phone: '', whatsapp: '', email: '', company: '', notes: '' };

export default function CapturePage() {
  const [authorized, setAuthorized] = useState(
    () => sessionStorage.getItem('innotrans_access') === '1'
  );
  const [form, setForm] = useState(EMPTY);
  const [photo, setPhoto] = useState(null);
  const [sendEmail, setSendEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  if (!authorized) {
    return (
      <div className="page page-center">
        <PasswordGate onSuccess={() => setAuthorized(true)} />
      </div>
    );
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const reset = () => {
    setForm(EMPTY);
    setPhoto(null);
    setSuccess(false);
    setError('');
    setSubmitting(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('请填写姓名');
      return;
    }
    if (!form.phone.trim() && !form.whatsapp.trim() && !form.email.trim()) {
      setError('请至少填写电话、WhatsApp 或邮箱中的一项');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess(false);
    try {
      await createLead({ ...form, photo, send_email: sendEmail });
      setSuccess(true);
      setSubmitting(false);
      setTimeout(reset, 1800);
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
            <div className="topbar-title">InnoTrans 客户信息采集</div>
          </div>
        </div>
        <Link to="/admin" className="topbar-link">
          历史记录
        </Link>
      </header>

      <main className="container container-narrow">
        <form className="card capture-card" onSubmit={submit}>
          <section className="form-section">
            <h2 className="section-title">基本信息</h2>

            <label className="field">
              <span className="field-label">
                姓名 <i className="req">*</i>
              </span>
              <input className="input" placeholder="Name" value={form.name} onChange={set('name')} />
            </label>

            <div className="field-grid">
              <label className="field">
                <span className="field-label">电话</span>
                <input className="input" type="tel" placeholder="Phone" value={form.phone} onChange={set('phone')} />
              </label>
              <label className="field">
                <span className="field-label">WhatsApp</span>
                <input className="input" type="tel" placeholder="WhatsApp" value={form.whatsapp} onChange={set('whatsapp')} />
              </label>
              <label className="field">
                <span className="field-label">邮箱地址</span>
                <input className="input" type="email" placeholder="Email" value={form.email} onChange={set('email')} />
              </label>
              <label className="field">
                <span className="field-label">公司名称</span>
                <input className="input" placeholder="Company" value={form.company} onChange={set('company')} />
              </label>
            </div>

            <label className="field">
              <span className="field-label">备注</span>
              <textarea className="input input-textarea" rows={3} placeholder="Notes" value={form.notes} onChange={set('notes')} />
              <VoiceInput
                onText={(t) => setForm((f) => ({ ...f, notes: (f.notes ? f.notes + ' ' : '') + t }))}
              />
            </label>
          </section>

          <section className="form-section">
            <h2 className="section-title">客户照片</h2>
            <PhotoPicker photo={photo} onCapture={setPhoto} onClear={() => setPhoto(null)} />
          </section>

          <div className="form-footer">
            <label className="field-check">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              <span>发送跟进邮件（英文）</span>
            </label>
            {sendEmail && !form.email.trim() && (
              <span className="hint">未填邮箱，不会发送</span>
            )}
          </div>

          {error && <p className="form-error">{error}</p>}
          {success && <p className="form-success">✓ 提交成功，已保存</p>}

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-block"
            disabled={submitting || success}
          >
            {submitting ? '提交中…' : success ? '✓ 提交成功' : '提交客户信息'}
          </button>
        </form>
      </main>
    </div>
  );
}
