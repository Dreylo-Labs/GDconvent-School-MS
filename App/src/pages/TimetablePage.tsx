import { useEffect, useState } from 'react';
import { Clock3, UserRound } from 'lucide-react';
import { api } from '../api';
import { EmptyState } from '../components/feedback/EmptyState';
import { AppShell } from '../components/layout/AppShell';
import { useApp } from '../context/AppContext';

type Entry = { id: string; dayOfWeek: number; period: number; subject: string; startsAt: string; endsAt: string; teacherName?: string; teacher?: { firstName: string; lastName: string }; room?: { name: string } };
const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TimetablePage() {
  const { child } = useApp();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [day, setDay] = useState(() => Math.min(6, Math.max(1, new Date().getDay())));
  useEffect(() => {
    const query = child?.class?.id ? `?classId=${child.class.id}` : '';
    api<{ entries: Entry[] }>(`/timetable${query}`).then(data => setEntries(data.entries)).catch(() => setEntries([]));
  }, [child?.class?.id]);
  const periods = entries.filter(entry => entry.dayOfWeek === day);
  return (
    <AppShell title="Timetable" back>
      <div className="day-strip">{dayNames.map((name, index) => <button key={name} className={day === index + 1 ? 'active' : ''} onClick={() => setDay(index + 1)}><small>{name}</small><strong>{index + 1}</strong></button>)}</div>
      <div className="timeline">{periods.map(entry => <article className="period" key={entry.id}><span>{String(entry.period).padStart(2, '0')}</span><div><header><b>{entry.subject}</b><small>{entry.startsAt} – {entry.endsAt}</small></header><p><UserRound /> {entry.teacherName || `${entry.teacher?.firstName || ''} ${entry.teacher?.lastName || ''}`}</p>{entry.room ? <small>{entry.room.name}</small> : null}</div></article>)}{!periods.length ? <EmptyState icon={Clock3} title="No periods scheduled" text="Choose another day or ask the school to publish the class timetable." /> : null}</div>
    </AppShell>
  );
}
