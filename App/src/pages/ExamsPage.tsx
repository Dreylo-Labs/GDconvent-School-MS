import { useEffect, useState } from 'react';
import { ChevronRight, Clock3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { EmptyState } from '../components/feedback/EmptyState';
import { AppShell } from '../components/layout/AppShell';
import { SectionTitle } from '../components/ui/SectionTitle';
import { useApp } from '../context/AppContext';
import type { ExamResult } from '../types/models';
import { formatDate } from '../utils/formatters';

type Exam = { id: string; date: string; subject: string; startTime?: string; endTime?: string; name: string; room?: string };
type StudentResult = ExamResult & { student: { id: string } };

export default function ExamsPage() {
  const { child } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'schedule' | 'results'>('schedule');
  const [exams, setExams] = useState<Exam[]>([]);
  const [results, setResults] = useState<StudentResult[]>([]);
  useEffect(() => {
    const classQuery = child?.class?.id ? `?classId=${child.class.id}` : '';
    Promise.all([api<Exam[]>(`/exams${classQuery}`), api<StudentResult[]>('/exams/my-results')])
      .then(([schedule, published]) => { setExams(schedule); setResults(published.filter(result => !child || result.student.id === child.id)); })
      .catch(() => undefined);
  }, [child?.id, child?.class?.id]);
  return (
    <AppShell title="Exams & results" back>
      <div className="segmented page-tabs"><button className={tab === 'schedule' ? 'active' : ''} onClick={() => setTab('schedule')}>Upcoming exams</button><button className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')}>Report cards</button></div>
      {tab === 'schedule' ? <><SectionTitle title="Exam schedule" action={`${exams.length} papers`} />{exams.length ? exams.map((exam, index) => <article className={`exam-card ${index === 2 ? 'featured' : ''}`} key={exam.id}><div className="date-tile"><b>{new Date(exam.date).toLocaleString('en', { month: 'short' }).toUpperCase()}</b><strong>{new Date(exam.date).getDate()}</strong></div><div><h3>{exam.subject}</h3><p><Clock3 /> {exam.startTime || 'Time TBA'}{exam.endTime ? ` – ${exam.endTime}` : ''}</p><small>{exam.name} · {exam.room || 'Room TBA'}</small></div><ChevronRight /></article>) : <EmptyState title="No exams scheduled" text="Published class exam schedules will appear here." />}</>
        : <><SectionTitle title="Published results" />{results.length ? <><button className="primary" onClick={() => navigate('/report-card')}>View complete report card</button>{results.map(result => <article className="result-row" key={result.id}><div><h3>{result.exam.subject}</h3><p>{result.exam.name} · {formatDate(result.exam.date)}</p></div><strong>{result.marks}/{result.exam.totalMarks}<small>Grade {result.grade || '—'}</small></strong></article>)}</> : <EmptyState title="No published results" text="Results appear after the school publishes the exam plan." />}</>}
    </AppShell>
  );
}
