import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { api, download } from '../api';
import { EmptyState } from '../components/feedback/EmptyState';
import { AppShell } from '../components/layout/AppShell';
import { useApp } from '../context/AppContext';
import type { ExamResult } from '../types/models';

type StudentResult = ExamResult & { student: { id: string } };

export default function ReportCardPage() {
  const { child } = useApp();
  const [results, setResults] = useState<StudentResult[]>([]);
  useEffect(() => { api<StudentResult[]>('/exams/my-results').then(data => setResults(data.filter(result => !child || result.student.id === child.id))).catch(() => undefined); }, [child?.id]);
  const percentage = useMemo(() => {
    const totals = results.reduce((value, result) => ({ marks: value.marks + result.marks, total: value.total + result.exam.totalMarks }), { marks: 0, total: 0 });
    return totals.total ? Math.round(totals.marks / totals.total * 1000) / 10 : 0;
  }, [results]);
  return (
    <AppShell title="Report card" back>
      <section className="report-hero"><small>ACADEMIC PERFORMANCE</small><h1>Annual Performance<br />Summary</h1><div><strong>{percentage}%<span>OVERALL</span></strong><b>{results.length ? 'PUBLISHED' : 'AWAITED'}</b></div></section>
      <section className="report-table"><header><strong>SCHOLASTIC AREAS</strong><small>Published results</small></header>{results.map(result => <div key={result.id}><strong>{result.exam.subject}</strong><span>{result.marks}</span><span>{result.exam.totalMarks}</span><b>{result.grade || '—'}</b></div>)}{!results.length ? <EmptyState title="Report card unavailable" text="A report card can be generated after results are published." /> : null}</section>
      {results.length ? <button className="primary download-card" onClick={() => child && download(`/students/${child.id}/report-card.pdf`, `${child.admissionNo}-report-card.pdf`)}><Download /> Download PDF Report Card</button> : null}
    </AppShell>
  );
}
