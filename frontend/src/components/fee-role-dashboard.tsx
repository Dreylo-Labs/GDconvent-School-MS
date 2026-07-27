'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AcademicCapIcon, BanknotesIcon, CalendarDaysIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import type { UserRole } from '@/lib/auth-types';

type FeeResponse = {
  summary: { billed: number; collected: number; outstanding: number };
  data: { id: string; invoiceNo?: string; title: string; outstanding: number; status: string; dueDate: string; student: { id: string; firstName: string; lastName: string } }[];
  pagination: { total: number };
};
type Child = {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  relationship: string;
  class?: { name: string; section: string; teacher?: { firstName: string; lastName: string }; room?: { name: string } };
  attendance: { marked: number; attended: number; percentage: number };
  fees: { billed: number; paid: number; outstanding: number };
  recentResults: { id: string; marks: string; grade?: string; exam: { name: string; subject: string; totalMarks: number } }[];
};

export function FeeRoleDashboard({ role, name }: { role: Extract<UserRole, 'ACCOUNTANT' | 'PARENT' | 'STUDENT'>; name: string }) {
  const [data, setData] = useState<FeeResponse | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [childrenLoaded, setChildrenLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (role !== 'PARENT') return;
    fetch('/api/proxy/parents/me/children', { cache: 'no-store' })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result; })
      .then((result: Child[]) => { setChildren(result); setSelectedChildId(result[0]?.id ?? ''); setChildrenLoaded(true); })
      .catch(reason => { setError(reason.message); setChildrenLoaded(true); });
  }, [role]);

  useEffect(() => {
    if (role === 'PARENT' && !selectedChildId) return;
    setData(null);
    const query = role === 'PARENT' ? `?limit=5&studentId=${encodeURIComponent(selectedChildId)}` : '?limit=5';
    fetch(`/api/proxy/fees${query}`, { cache: 'no-store' })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result; })
      .then(setData)
      .catch(reason => setError(reason.message));
  }, [role, selectedChildId]);

  const child = children.find(item => item.id === selectedChildId);
  if (role === 'PARENT' && childrenLoaded && !children.length) return <><div className="pageHead conceptHead"><div><h1>Good morning, {name.split(' ')[0]}</h1><p>Family overview</p></div></div><section className="panel teacherDashboardLoading">{error || 'No student is currently linked to this guardian account. Please ask the administrator to connect the student profile.'}</section></>;
  if (!data) return <><div className="pageHead conceptHead"><div><h1>Good morning, {name.split(' ')[0]}</h1><p>Loading your live workspace…</p></div></div><section className="panel teacherDashboardLoading">{error || (role === 'PARENT' && !children.length ? 'Loading linked children…' : 'Loading live balances…')}</section></>;
  const title = role === 'ACCOUNTANT' ? 'Fee collection workspace' : role === 'PARENT' ? 'Family overview' : 'My fee account';

  return <>
    <div className="pageHead conceptHead">
      <div><h1>Good morning, {name.split(' ')[0]}</h1><p>{title} · Live records from the school database.</p></div>
      <Link className="primary dashboardFeeLink" href="/fees">Open fees</Link>
    </div>

    {role === 'PARENT' && child && <section className="panel childDashboardPanel">
      <div className="panelTitle">
        <div><h2>{child.firstName} {child.lastName}</h2><p>{child.admissionNo} · {child.class ? `${child.class.name}${child.class.section ? `-${child.class.section}` : ''}` : 'Class not assigned'}</p></div>
        {children.length > 1 && <select aria-label="Select child" value={selectedChildId} onChange={event => setSelectedChildId(event.target.value)}>{children.map(item => <option key={item.id} value={item.id}>{item.firstName} {item.lastName} · {item.admissionNo}</option>)}</select>}
      </div>
      <div className="metrics conceptMetrics feeRoleMetrics">
        <article className="metric"><div className="metricIcon green"><CalendarDaysIcon /></div><div><span>Attendance</span><strong>{child.attendance.percentage}%</strong><small>{child.attendance.attended} of {child.attendance.marked} marked days</small></div></article>
        <article className="metric"><div className="metricIcon blue"><AcademicCapIcon /></div><div><span>Recent Results</span><strong>{child.recentResults.length}</strong><small>{child.class?.teacher ? `Class teacher: ${child.class.teacher.firstName} ${child.class.teacher.lastName}` : 'No published results yet'}</small></div></article>
        <article className="metric"><div className="metricIcon amber"><BanknotesIcon /></div><div><span>Fee Balance</span><strong>₹{child.fees.outstanding.toLocaleString('en-IN')}</strong><small>For this child only</small></div></article>
      </div>
    </section>}

    <section className="metrics conceptMetrics feeRoleMetrics">
      <article className="metric"><div className="metricIcon blue"><DocumentTextIcon /></div><div><span>Total billed</span><strong>₹{data.summary.billed.toLocaleString('en-IN')}</strong><small>{data.pagination.total} invoices</small></div></article>
      <article className="metric"><div className="metricIcon green"><BanknotesIcon /></div><div><span>Collected</span><strong>₹{data.summary.collected.toLocaleString('en-IN')}</strong><small>Payments recorded</small></div></article>
      <article className="metric"><div className="metricIcon amber"><CalendarDaysIcon /></div><div><span>Outstanding</span><strong>₹{data.summary.outstanding.toLocaleString('en-IN')}</strong><small>Partial payments allowed</small></div></article>
    </section>

    <section className="panel studentsPanel">
      <div className="panelTitle"><div><h2>{role === 'ACCOUNTANT' ? 'Recent student invoices' : 'Recent invoices'}</h2></div><Link href="/fees">View complete ledger</Link></div>
      <div className="tableWrap"><table><thead><tr>{role === 'ACCOUNTANT' && <th>Student</th>}<th>Invoice</th><th>Description</th><th>Due</th><th>Outstanding</th><th>Status</th></tr></thead><tbody>{data.data.map(fee => <tr key={fee.id}>{role === 'ACCOUNTANT' && <td><strong>{fee.student.firstName} {fee.student.lastName}</strong></td>}<td className="mono">{fee.invoiceNo || '—'}</td><td>{fee.title}</td><td>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(fee.dueDate))}</td><td><strong>₹{fee.outstanding.toLocaleString('en-IN')}</strong></td><td><span className={`status ${fee.status === 'PAID' ? 'present' : 'late'}`}>{fee.status}</span></td></tr>)}</tbody></table>{!data.data.length && <div className="tableState">No fee invoices for this child yet.</div>}</div>
    </section>
  </>;
}
