import { useState } from 'react';

const ACCESS_PASSWORD = import.meta.env.VITE_ACCESS_PASSWORD || 'innotrans';

export default function PasswordGate({ onSuccess }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (value === ACCESS_PASSWORD) {
      sessionStorage.setItem('innotrans_access', '1');
      onSuccess();
    } else {
      setError(true);
    }
  };

  return (
    <div className="gate-card">
      <div className="gate-logo">🚆</div>
      <h1 className="gate-title">InnoTrans</h1>
      <p className="gate-subtitle">客户信息采集系统</p>
      <form onSubmit={submit} className="gate-form">
        <input
          type="password"
          className={`input ${error ? 'input-error' : ''}`}
          placeholder="请输入访问密码"
          value={value}
          autoFocus
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
        />
        {error && <p className="gate-error">密码错误，请重试</p>}
        <button type="submit" className="btn btn-primary btn-block">
          进入
        </button>
      </form>
    </div>
  );
}
