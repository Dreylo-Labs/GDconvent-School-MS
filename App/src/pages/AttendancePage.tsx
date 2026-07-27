import { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { api } from '../api';
import { EmptyState } from '../components/feedback/EmptyState';
import { AppShell } from '../components/layout/AppShell';
import { SectionTitle } from '../components/ui/SectionTitle';
import { useApp } from '../context/AppContext';
import type { AttendanceRecord } from '../types/models';
import { formatDate } from '../utils/formatters';

export default function AttendancePage() {
  const { child, user } = useApp();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  useEffect(() => {
    if (!child) return;
    const endpoint = user?.role === 'STUDENT' ? '/students/me/mobile' : `/parents/me/children/${child.id}`;
    api<{ attendance: AttendanceRecord[] }>(endpoint).then(data => setRecords(data.attendance)).catch(() => setRecords([]));
  }, [child?.id, user?.role]);
  const summary = useMemo(() => records.reduce((value, record) => ({
    present: value.present + (record.status === 'PRESENT' || record.status === 'LATE' ? 1 : 0),
    absent: value.absent + (record.status === 'ABSENT' ? 1 : 0),
  }), { present: 0, absent: 0 }), [records]);
  return (
    <AppShell title="Attendance" back>
      <section className="attendance-hero large"><div><span>Academic attendance</span><strong>{child?.attendance.percentage || 0}%</strong><small>{child?.attendance.marked || 0} school days marked</small></div><div className="ring" style={{ '--progress': `${(child?.attendance.percentage || 0) * 3.6}deg` } as React.CSSProperties}><span>{Math.round(child?.attendance.percentage || 0)}</span></div></section>
      <div className="stat-grid"><div><strong>{summary.present}</strong><span>Present / late</span></div><div><strong>{summary.absent}</strong><span>Absent</span></div><div><strong>{records.length - summary.present - summary.absent}</strong><span>Excused</span></div></div>
      <SectionTitle title="Attendance history" />
      {records.length ? records.map(record => <article className="history-row" key={record.id}><span className={`status-dot ${record.status.toLowerCase()}`} /><div><strong>{formatDate(record.date)}</strong><small>{record.note || 'No note added'}</small></div><b className={`badge ${record.status.toLowerCase()}`}>{record.status}</b></article>) : <EmptyState icon={CalendarDays} title="No attendance records" text="Daily attendance marked by the school will appear here." />}
    </AppShell>
  );
}
