'use client';
import { FormEvent, useState } from 'react';

export default function Login() {
  const [mode, setMode] = useState<'STAFF' | 'FAMILY'>('STAFF');
  const [email, setEmail] = useState('admin@gdschool.edu');
  const [password, setPassword] = useState('Admin@123');
  const [familyRole, setFamilyRole] = useState<'PARENT' | 'STUDENT'>('PARENT');
  const [identifier, setIdentifier] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [destination, setDestination] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function staffLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSubmitting(true);
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await response.json();
      if (!response.ok) { setError(data.message ?? 'Unable to sign in'); return; }
      window.location.replace('/');
    } catch { setError('Unable to reach the server. Confirm both frontend and backend are running.'); }
    finally { setSubmitting(false); }
  }
  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage(''); setSubmitting(true);
    try {
      const response = await fetch('/api/auth/otp/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: familyRole, identifier }) });
      const data = await response.json();
      if (!response.ok) { setError(data.message ?? 'OTP could not be requested.'); return; }
      setChallengeId(data.challengeId); setDestination(data.destination); setMessage(`OTP sent to ${data.destination}. Temporary OTP: ${data.demoOtp}`);
    } catch { setError('Unable to reach the authentication service.'); }
    finally { setSubmitting(false); }
  }
  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSubmitting(true);
    try {
      const response = await fetch('/api/auth/otp/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId, otp }) });
      const data = await response.json();
      if (!response.ok) { setError(data.message ?? 'OTP verification failed.'); return; }
      window.location.replace('/');
    } catch { setError('Unable to reach the authentication service.'); }
    finally { setSubmitting(false); }
  }
  function switchMode(value: 'STAFF' | 'FAMILY') { setMode(value); setError(''); setMessage(''); setChallengeId(''); setOtp(''); }
  function useDemo(role: 'admin' | 'teacher' | 'accounts' | 'library') {
    const credentials = {
      admin: ['admin@gdschool.edu', 'Admin@123'], teacher: ['teacher@gdschool.edu', 'Teacher@123'],
      accounts: ['accounts@gdschool.edu', 'Accounts@123'], library: ['library@gdschool.edu', 'Library@123'],
    };
    const value = credentials[role]; setEmail(value[0]); setPassword(value[1]); setError('');
  }

  return <div className="login"><section>
    <div className="loginBrand schoolLoginBrand"><img src="/gd-convent-logo.png" alt="G.D. Convent School crest" /><strong>G.D. Convent Sr Sec School</strong></div>
    <div><h1>Welcome back</h1><p>Sign in to manage your school operations.</p></div>
    <div className="loginModeTabs"><button className={mode === 'STAFF' ? 'active' : ''} onClick={() => switchMode('STAFF')}>Staff login</button><button className={mode === 'FAMILY' ? 'active' : ''} onClick={() => switchMode('FAMILY')}>Parent / Student OTP</button></div>
    {mode === 'STAFF' ? <>
      <form onSubmit={staffLogin}><label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></label><label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required /></label>{error && <div className="loginError" role="alert">{error}</div>}<button className="primary" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button></form>
      <div className="demoRoles"><span>Staff demo accounts</span><div><button onClick={() => useDemo('admin')}>Administrator</button><button onClick={() => useDemo('teacher')}>Teacher</button><button onClick={() => useDemo('accounts')}>Accountant</button><button onClick={() => useDemo('library')}>Librarian</button></div></div>
    </> : !challengeId ? <form onSubmit={requestOtp}>
      <label>Login as<select value={familyRole} onChange={event => { setFamilyRole(event.target.value as 'PARENT' | 'STUDENT'); setIdentifier(''); }}><option value="PARENT">Parent / Guardian</option><option value="STUDENT">Student</option></select></label>
      <label>{familyRole === 'PARENT' ? 'Registered mobile number' : 'Mobile number or admission number'}<input value={identifier} onChange={event => setIdentifier(event.target.value)} inputMode={familyRole === 'PARENT' ? 'tel' : 'text'} placeholder={familyRole === 'PARENT' ? '9876543210' : 'GD-2026-001'} required /></label>
      <small className="otpHelp">The OTP will be sent to the registered Indian mobile number.</small>
      {error && <div className="loginError" role="alert">{error}</div>}<button className="primary" disabled={submitting}>{submitting ? 'Requesting…' : 'Send OTP'}</button>
    </form> : <form onSubmit={verifyOtp}>
      <div className="otpDestination"><strong>Verify your number</strong><span>{message || `OTP sent to ${destination}`}</span></div>
      <label>Six-digit OTP<input value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" placeholder="111111" required /></label>
      {error && <div className="loginError" role="alert">{error}</div>}<button className="primary" disabled={submitting || otp.length !== 6}>{submitting ? 'Verifying…' : 'Verify & sign in'}</button><button type="button" className="otpBack" onClick={() => { setChallengeId(''); setOtp(''); setError(''); }}>Use another number</button>
    </form>}
  </section><aside><blockquote>“Education is the most powerful tool we can use to shape tomorrow.”</blockquote><p>G.D. Convent Sr Sec School</p></aside></div>;
}
