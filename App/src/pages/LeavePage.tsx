import { useCallback, useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { api } from '../api';
import { AppShell } from '../components/layout/AppShell';
import { Avatar } from '../components/ui/Avatar';
import { SectionTitle } from '../components/ui/SectionTitle';
import { useApp } from '../context/AppContext';
import { formatDate, humanizeCode } from '../utils/formatters';

type LeaveRequest = { id: string; studentId: string; startDate: string; endDate: string; issue: string; details?: string; reviewNote?: string; status: string };
const initialForm = { startDate: '', endDate: '', issue: '', details: '' };

export default function LeavePage() {
  const { child, children, selectChild } = useApp();
  const [issues, setIssues] = useState<string[]>([]);
  const [history, setHistory] = useState<LeaveRequest[]>([]);
  const [form, setForm] = useState(initialForm);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      const [context, requests] = await Promise.all([
        api<{ issues: string[] }>('/modules/student-leave/context'),
        api<LeaveRequest[]>('/modules/student-leave'),
      ]);
      setIssues(context.issues); setHistory(requests);
    } catch { setIssues([]); setHistory([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit() {
    if (!child) return;
    setNotice('');
    try {
      await api('/modules/student-leave', { method: 'POST', body: JSON.stringify({ ...form, studentId: child.id }) });
      setNotice('Leave request submitted successfully.');
      setForm(initialForm);
      await load();
    } catch (requestError) { setNotice((requestError as Error).message); }
  }

  return (
    <AppShell title="Leave application" back>
      <p className="eyebrow">ATTENDANCE MANAGEMENT</p><h1>Leave Application</h1>
      <section className="child-switch"><Avatar name={`${child?.firstName || ''} ${child?.lastName || ''}`} /><div><small>Applying for</small><h3>{child?.firstName} {child?.lastName}</h3></div>{children.length > 1 ? <select value={child?.id} onChange={event => { const selected = children.find(item => item.id === event.target.value); if (selected) selectChild(selected); }}>{children.map(item => <option key={item.id} value={item.id}>{item.firstName}</option>)}</select> : null}</section>
      <section className="form-card"><h2>Request Details</h2><div className="form-body"><div className="two-col"><label>From Date<input type="date" value={form.startDate} onChange={event => setForm(current => ({ ...current, startDate: event.target.value }))} /></label><label>To Date<input type="date" value={form.endDate} onChange={event => setForm(current => ({ ...current, endDate: event.target.value }))} /></label></div><label>Reason for Leave<select value={form.issue} onChange={event => setForm(current => ({ ...current, issue: event.target.value }))}><option value="">Select a reason</option>{issues.map(issue => <option key={issue} value={issue}>{humanizeCode(issue)}</option>)}</select></label><label>Additional Notes (Optional)<textarea value={form.details} onChange={event => setForm(current => ({ ...current, details: event.target.value }))} placeholder="Provide more context if necessary…" /></label><button className="primary" onClick={submit}>Submit Request <Send /></button>{notice ? <p className="notice">{notice}</p> : null}</div></section>
      <SectionTitle title="Leave history" />
      {history.filter(item => !child || item.studentId === child.id).map(item => <article className="leave-row" key={item.id}><div><small>{formatDate(item.startDate)} – {formatDate(item.endDate)}</small><h3>{humanizeCode(item.issue)}</h3><p>{item.details || item.reviewNote || 'No additional details'}</p></div><b className={`badge ${item.status.toLowerCase()}`}>{item.status}</b></article>)}
    </AppShell>
  );
}
