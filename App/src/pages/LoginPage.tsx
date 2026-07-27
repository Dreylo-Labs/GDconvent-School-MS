import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, session } from '../api';
import { useApp } from '../context/AppContext';
import type { UserRole } from '../types/models';

export default function LoginPage() {
  const { user, refresh } = useApp();
  const navigate = useNavigate();
  const [role, setRole] = useState<UserRole>('PARENT');
  const [identifier, setIdentifier] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [destination, setDestination] = useState('');
  const [otp, setOtp] = useState('111111');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to="/" replace />;

  async function requestOtp() {
    setBusy(true); setError('');
    try {
      const result = await api<{ challengeId: string; destination: string }>('/auth/otp/request', {
        method: 'POST', body: JSON.stringify({ role, identifier }),
      });
      setChallengeId(result.challengeId);
      setDestination(result.destination);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally { setBusy(false); }
  }

  async function verifyOtp() {
    setBusy(true); setError('');
    try {
      const result = await api<{ token: string }>('/auth/otp/verify', {
        method: 'POST', body: JSON.stringify({ challengeId, otp }),
      });
      session.token = result.token;
      await refresh();
      navigate('/');
    } catch (verifyError) {
      setError((verifyError as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <main className="login">
      <div className="orb orb-a" /><div className="orb orb-b" />
      <img src="/gd-convent-logo.png" className="login-logo" alt="G.D. Convent School crest" />
      <h1>G.D. Convent<br />Sr. Sec. School</h1>
      <p className="muted">Parent & student portal</p>
      <div className="segmented">
        <button className={role === 'PARENT' ? 'active' : ''} onClick={() => setRole('PARENT')}>Parent</button>
        <button className={role === 'STUDENT' ? 'active' : ''} onClick={() => setRole('STUDENT')}>Student</button>
      </div>
      {!challengeId ? (
        <div className="login-form">
          <label>{role === 'PARENT' ? 'Registered mobile number' : 'Mobile or admission number'}</label>
          <div className="phone-field">
            {role === 'PARENT' ? <span>+91</span> : null}
            <input value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder={role === 'PARENT' ? '98765 43210' : 'GD-2026-007'} />
          </div>
          <button className="primary" disabled={busy || identifier.length < 3} onClick={requestOtp}>{busy ? 'Please wait…' : 'Send OTP'}</button>
        </div>
      ) : (
        <div className="login-form">
          <button className="text-button" onClick={() => setChallengeId('')}><ArrowLeft size={16} /> Change number</button>
          <p>Enter the OTP sent to <strong>{destination}</strong></p>
          <input className="otp-input" inputMode="numeric" maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ''))} />
          <small>Development OTP: 111111</small>
          <button className="primary" disabled={busy || otp.length !== 6} onClick={verifyOtp}>{busy ? 'Verifying…' : 'Verify & continue'}</button>
        </div>
      )}
      {error ? <p className="error">{error}</p> : null}
      <p className="legal">By continuing, you agree to the school portal terms and privacy policy.</p>
      <p className="support">Need help? Contact the school office.</p>
    </main>
  );
}
