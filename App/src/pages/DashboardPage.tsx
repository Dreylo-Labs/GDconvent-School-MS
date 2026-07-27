import { useEffect, useState } from 'react';
import { Bell, BookOpen, CalendarDays, ChevronRight, FileText, IndianRupee, Megaphone, Stethoscope, UsersRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { AppShell } from '../components/layout/AppShell';
import { EmptyState } from '../components/feedback/EmptyState';
import { SectionTitle } from '../components/ui/SectionTitle';
import { useApp } from '../context/AppContext';
import type { Announcement } from '../types/models';
import { formatDate, formatMoney } from '../utils/formatters';

const quickActions = [
  ['Attendance', CalendarDays, '/attendance'],
  ['Fees', IndianRupee, '/fees'],
  ['Results', FileText, '/exams'],
  ['Leave', Stethoscope, '/leave'],
] as const;

function LatestCommunication() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  useEffect(() => {
    api<{ announcements: Announcement[] }>('/modules/communications')
      .then(data => setAnnouncement(data.announcements[0] ?? null)).catch(() => undefined);
  }, []);
  if (!announcement) return null;
  return <><SectionTitle title="Latest circular" /><article className="card update-card"><Megaphone /><div><small>{announcement.category} · {formatDate(announcement.publishedAt)}</small><h3>{announcement.title}</h3><p>{announcement.body}</p></div></article></>;
}

export default function DashboardPage() {
  const { child, children, user } = useApp();
  const navigate = useNavigate();
  if (!child) return <AppShell><EmptyState icon={UsersRound} title="No linked student" text="Ask the school office to link a student to this mobile number." /></AppShell>;
  const result = child.recentResults[0];
  return (
    <AppShell action={<button className="icon-btn" onClick={() => navigate('/updates')} aria-label="Updates"><Bell /><i /></button>}>
      <div className="greeting"><div><small>WELCOME BACK</small><h1>Namaste, {user?.name.split(' ')[0]}</h1></div>{children.length > 1 ? <button className="chip" onClick={() => navigate('/children')}>Switch child</button> : null}</div>
      <section className="attendance-hero"><div><span>Overall attendance</span><strong>{child.attendance.percentage}%</strong><small>{child.attendance.attended} of {child.attendance.marked} marked days attended</small></div><div className="ring" style={{ '--progress': `${child.attendance.percentage * 3.6}deg` } as React.CSSProperties}><span>{Math.round(child.attendance.percentage)}</span></div></section>
      <section className="fee-hero"><div><small>FEE SUMMARY</small><h2>{formatMoney(child.fees.outstanding)}</h2><p>Outstanding balance</p></div><button onClick={() => navigate('/fees')}>View account <ChevronRight /></button></section>
      <div className="quick-grid">{quickActions.map(([label, Icon, href]) => <button key={label} onClick={() => navigate(href)}><span><Icon /></span><b>{label}</b></button>)}</div>
      <SectionTitle title="Latest results" action="View all" onClick={() => navigate('/exams')} />
      {result ? <article className="card row-card"><span className="square-icon"><BookOpen /></span><div><small>{formatDate(result.exam.date)}</small><h3>{result.exam.subject}</h3><p>{result.marks} / {result.exam.totalMarks} · Grade {result.grade || '—'}</p></div><ChevronRight /></article> : <EmptyState title="No published results" text="Published exam results will appear here." />}
      <LatestCommunication />
    </AppShell>
  );
}
