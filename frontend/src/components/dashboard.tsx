'use client';

import Link from 'next/link';
import {
  AcademicCapIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  ClipboardDocumentCheckIcon,
  UserGroupIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useEffect, useState } from 'react';
import { useAuth } from './auth-provider';
import type { UserRole } from '@/lib/auth-types';
import { TeacherDashboard } from './teacher-dashboard';
import { FeeRoleDashboard } from './fee-role-dashboard';

type DashboardData = {
  role: 'ADMIN' | 'LIBRARIAN';
  metrics: Record<string, number>;
  attendance?: { date: string; value: number | null; marked: number }[];
  recentStudents?: { id: string; firstName: string; lastName: string; admissionNo: string; guardianName: string; class?: { name: string; section: string } }[];
  loans?: { id: string; issuedAt: string; dueAt: string; status: string; fineAmount: string; book: { title: string }; student?: { firstName: string; lastName: string } }[];
  events: { id: string; title: string; type: string; startsAt: string; endsAt?: string; description?: string }[];
};

export function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'TEACHER') return <TeacherDashboard name={user.name} />;
  if (user.role === 'ACCOUNTANT' || user.role === 'PARENT' || user.role === 'STUDENT') return <FeeRoleDashboard role={user.role} name={user.name} />;
  return <OperationalDashboard role={user.role} name={user.name} />;
}

function OperationalDashboard({ role, name }: { role: Extract<UserRole, 'ADMIN' | 'LIBRARIAN'>; name: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/proxy/dashboard', { cache: 'no-store' })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.message || 'Dashboard could not be loaded.'); return result; })
      .then(setData)
      .catch(reason => setError(reason.message));
  }, []);
  if (!data) return <><div className="pageHead conceptHead"><div><h1>Good morning, {name.split(' ')[0]}</h1><p>Loading your live school overview…</p></div></div><section className="panel teacherDashboardLoading">{error || 'Loading current records…'}</section></>;
  const visibleMetrics = role === 'ADMIN' ? [
    { label: 'Total Students', value: data.metrics.students.toLocaleString('en-IN'), note: `${data.metrics.classes} active classes`, icon: UserGroupIcon, tone: 'blue' },
    { label: 'Total Staff', value: data.metrics.staff.toLocaleString('en-IN'), note: `${data.metrics.teachers} teachers`, icon: AcademicCapIcon, tone: 'green' },
    { label: 'Attendance (Today)', value: `${data.metrics.attendance}%`, note: `${data.metrics.attendanceMarked} records marked`, icon: CalendarDaysIcon, tone: 'amber' },
    { label: 'Fee Collection (Month)', value: `₹${data.metrics.feesCollected.toLocaleString('en-IN')}`, note: `${data.metrics.feeTransactions} payments`, icon: BanknotesIcon, tone: 'blue' },
  ] : [
    { label: 'Catalog Copies', value: data.metrics.catalog.toLocaleString('en-IN'), note: `${data.metrics.available} available`, icon: AcademicCapIcon, tone: 'blue' },
    { label: 'Currently Issued', value: data.metrics.issued.toLocaleString('en-IN'), note: 'Open book loans', icon: UserGroupIcon, tone: 'green' },
    { label: 'Overdue Items', value: data.metrics.overdue.toLocaleString('en-IN'), note: 'Requires follow-up', icon: CalendarDaysIcon, tone: 'amber' },
    { label: 'Outstanding Fines', value: `₹${data.metrics.fines.toLocaleString('en-IN')}`, note: 'From open loans', icon: BanknotesIcon, tone: 'blue' },
  ];
  const greeting = role === 'ADMIN' ? 'Good morning, Principal' : `Good morning, ${name.split(' ')[0]}`;
  const subtitle = role === 'ADMIN' ? 'Here’s what’s happening at G.D. Convent Sr Sec School today.' : 'Here is today’s live library circulation and inventory summary.';
  return (
    <>
      <div className="pageHead conceptHead">
        <div>
          <h1>{greeting}</h1>
          <p>{subtitle}</p>
        </div>
        <time>{new Intl.DateTimeFormat('en-IN',{dateStyle:'full'}).format(new Date())}</time>
      </div>

      <section className="metrics conceptMetrics">
        {visibleMetrics.map((metric) => (
          <article className="metric" key={metric.label}>
            <div className={`metricIcon ${metric.tone}`}><metric.icon /></div>
            <div>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small className={metric.note.startsWith('↓') ? 'negative' : 'positive'}>{metric.note}</small>
            </div>
          </article>
        ))}
      </section>

      <div className="conceptDashboardGrid">
        <div className="conceptMainColumn">
          {role === 'ADMIN' && <section className="panel chartPanel">
            <div className="panelTitle">
              <div>
                <h2>Attendance Overview (Last 7 Days)</h2>
              </div>
              <select aria-label="Attendance period"><option>Daily</option><option>Weekly</option></select>
            </div>
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.attendance ?? []} margin={{ left: -18, right: 8, top: 18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="attendance-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1769e0" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#1769e0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e9edf4" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={value => new Intl.DateTimeFormat('en-IN',{weekday:'short'}).format(new Date(`${value}T00:00:00`))} tickLine={false} axisLine={false} />
                  <YAxis domain={[80, 100]} tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => `${value}%`} />
                  <Area
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="value"
                    stroke="#1769e0"
                    strokeWidth={3}
                    fill="url(#attendance-fill)"
                    dot={{ r: 4, fill: '#1769e0', strokeWidth: 2, stroke: '#fff' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>}

          <RecentRolePanel role={role} data={data} />
        </div>

        <aside className="conceptRail">
          <section className="panel schedule">
            <div className="panelTitle">
              <div><h2>Upcoming Schedule</h2></div>
              {role === 'ADMIN' && <Link href="/attendance">View calendar</Link>}
            </div>
            {data.events.map((event) => (
              <div className="event" key={event.id}>
                <div className="date"><strong>{new Date(event.startsAt).getDate()}</strong><span>{new Intl.DateTimeFormat('en-IN',{month:'short'}).format(new Date(event.startsAt)).toUpperCase()}</span></div>
                <div><strong>{event.title}</strong><span>{new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(event.startsAt))}</span><span>{event.type}</span></div>
              </div>
            ))}
            {!data.events.length && <div className="tableState">No upcoming events scheduled.</div>}
            {role === 'ADMIN' && <Link className="scheduleLink" href="/attendance">View all schedule</Link>}
          </section>

          <section className="panel quickActions">
            <div className="panelTitle"><div><h2>Quick Actions</h2></div></div>
            <div className="quickActionGrid">
              <RoleQuickActions role={role} />
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function RoleQuickActions({ role }: { role: UserRole }) {
  if (role === 'ADMIN') return <><Link href="/students"><UserPlusIcon /><span>Add Student</span></Link><Link href="/teachers"><UserPlusIcon /><span>Add Staff</span></Link><Link href="/attendance"><ClipboardDocumentCheckIcon /><span>Mark Attendance</span></Link><Link href="/fees"><BanknotesIcon /><span>Collect Fees</span></Link></>;
  if (role === 'TEACHER') return <><Link href="/attendance"><ClipboardDocumentCheckIcon /><span>Mark Student Attendance</span></Link><Link href="/timetable"><CalendarDaysIcon /><span>My Roster</span></Link><Link href="/staff-attendance"><UserGroupIcon /><span>Attendance & Leave</span></Link><Link href="/exams"><AcademicCapIcon /><span>Manage Exams & Results</span></Link></>;
  if (role === 'ACCOUNTANT') return <><Link href="/fees"><BanknotesIcon /><span>Collect Fees</span></Link><Link href="/students"><UserGroupIcon /><span>Student Accounts</span></Link><Link href="/fees"><ClipboardDocumentCheckIcon /><span>Fee Ledger</span></Link><Link href="/fees"><CalendarDaysIcon /><span>Advance Credits</span></Link></>;
  if (role === 'PARENT') return <><Link href="/student-leave"><CalendarDaysIcon /><span>Apply Student Leave</span></Link><Link href="/fees"><BanknotesIcon /><span>Pay Fees</span></Link><Link href="/communications"><UserPlusIcon /><span>Messages & Circulars</span></Link><Link href="/timetable"><CalendarDaysIcon /><span>School Timetable</span></Link></>;
  if (role === 'STUDENT') return <><Link href="/exams"><ClipboardDocumentCheckIcon /><span>Exams & Results</span></Link><Link href="/timetable"><CalendarDaysIcon /><span>My Timetable</span></Link><Link href="/communications"><UserPlusIcon /><span>Circulars</span></Link><Link href="/fees"><BanknotesIcon /><span>My Fees</span></Link></>;
  return <><Link href="/modules/library"><AcademicCapIcon /><span>Issue Book</span></Link><Link href="/modules/library"><ClipboardDocumentCheckIcon /><span>Return Book</span></Link><Link href="/modules/library"><UserPlusIcon /><span>Add Book</span></Link><Link href="/modules/library"><BanknotesIcon /><span>Overdue Fines</span></Link></>;
}

function RecentRolePanel({ role, data }: { role: Extract<UserRole, 'ADMIN' | 'LIBRARIAN'>; data: DashboardData }) {
  if (role === 'ADMIN') return <section className="panel studentsPanel"><div className="panelTitle"><div><h2>Recently Added Students</h2></div><Link href="/students">View all students</Link></div><div className="tableWrap"><table><thead><tr><th>Admission</th><th>Name</th><th>Class</th><th>Guardian</th></tr></thead><tbody>{data.recentStudents?.map(student=><tr key={student.id}><td className="mono">{student.admissionNo}</td><td><strong>{student.firstName} {student.lastName}</strong></td><td>{student.class ? `${student.class.name}${student.class.section ? `-${student.class.section}` : ''}` : 'Unassigned'}</td><td>{student.guardianName}</td></tr>)}</tbody></table>{!data.recentStudents?.length && <div className="tableState">No students have been added yet.</div>}</div></section>;
  return <section className="panel studentsPanel"><div className="panelTitle"><div><h2>Recent Circulation</h2></div><Link href="/modules/library">Open circulation desk</Link></div><div className="tableWrap"><table><thead><tr><th>Book</th><th>Borrower</th><th>Issued</th><th>Due</th><th>Status</th></tr></thead><tbody>{data.loans?.map(loan=><tr key={loan.id}><td><strong>{loan.book.title}</strong></td><td>{loan.student ? `${loan.student.firstName} ${loan.student.lastName}` : 'Staff / external borrower'}</td><td>{new Intl.DateTimeFormat('en-IN',{dateStyle:'medium'}).format(new Date(loan.issuedAt))}</td><td>{new Intl.DateTimeFormat('en-IN',{dateStyle:'medium'}).format(new Date(loan.dueAt))}</td><td><span className={`status ${loan.status === 'OVERDUE' || new Date(loan.dueAt) < new Date() ? 'absent' : 'present'}`}>{loan.status}</span></td></tr>)}</tbody></table>{!data.loans?.length && <div className="tableState">No circulation records yet.</div>}</div></section>;
}
