'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AcademicCapIcon, BeakerIcon, CalendarDaysIcon, ClipboardDocumentCheckIcon, UserGroupIcon } from '@heroicons/react/24/outline';

type TeacherWorkspace = {
  firstName: string; lastName: string; employeeNo: string; subject?: string;
  classes: { id: string; name: string; section: string; room?: { name: string }; _count: { students: number } }[];
  roomAssignments: { id: string; responsibility: string; room: { name: string; type: string } }[];
  summaries: { students: number; classes: number; markedToday: number; pendingResults: number };
};
const classLabel = (item: { name: string; section: string }) => item.section ? `${item.name}-${item.section}` : item.name;

export function TeacherDashboard({ name }: { name: string }) {
  const [data, setData] = useState<TeacherWorkspace | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { fetch('/api/proxy/teachers/me', { cache: 'no-store' }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.message); setData(result); }).catch(reason => setError(reason.message)); }, []);
  if (!data) return <><div className="pageHead conceptHead"><div><h1>Good morning, {name.split(' ')[0]}</h1><p>Your live teaching assignments and responsibilities.</p></div></div><section className="panel teacherDashboardLoading">{error || 'Loading your teaching workspace…'}</section></>;
  const metrics = [
    { label: 'My Students', value: data.summaries.students, note: `Across ${data.summaries.classes} assigned class${data.summaries.classes === 1 ? '' : 'es'}`, icon: UserGroupIcon, tone: 'blue' },
    { label: 'Class Teacher Of', value: data.summaries.classes, note: data.classes.map(classLabel).join(', ') || 'No class assigned', icon: AcademicCapIcon, tone: 'green' },
    { label: 'Attendance Marked', value: data.summaries.markedToday, note: `${data.summaries.students - data.summaries.markedToday} remaining today`, icon: CalendarDaysIcon, tone: 'amber' },
    { label: 'Pending Results', value: data.summaries.pendingResults, note: 'Assessment entries to complete', icon: ClipboardDocumentCheckIcon, tone: 'blue' },
  ];
  return <>
    <div className="pageHead conceptHead"><div><h1>Good morning, {data.firstName}</h1><p>{data.subject ? `${data.subject} teacher` : 'Teacher'} · {data.employeeNo}</p></div><time>{new Intl.DateTimeFormat('en-IN',{dateStyle:'full'}).format(new Date())}</time></div>
    <section className="metrics conceptMetrics">{metrics.map(metric => <article className="metric" key={metric.label}><div className={`metricIcon ${metric.tone}`}><metric.icon /></div><div><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.note}</small></div></article>)}</section>
    <div className="teacherDashboardGrid">
      <section className="panel teacherAssignmentsPanel"><div className="panelTitle"><div><h2>My class teacher assignments</h2><p>Attendance access follows these assignments automatically.</p></div><Link href="/attendance">Manage attendance</Link></div>{data.classes.length ? <div className="teacherClassList">{data.classes.map(item => <article key={item.id}><span className="teacherClassIcon"><AcademicCapIcon /></span><div><strong>{classLabel(item)}</strong><small>{item.room?.name || 'No room assigned'}</small></div><div><strong>{item._count.students}</strong><small>students</small></div><Link href="/attendance">Open roster</Link></article>)}</div> : <div className="tableState">You are not currently assigned as a class teacher.</div>}</section>
      <section className="panel teacherFacilitiesPanel"><div className="panelTitle"><div><h2>Room & facility duties</h2></div></div>{data.roomAssignments.length ? data.roomAssignments.map(item => <div className="teacherFacility" key={item.id}><span><BeakerIcon /></span><div><strong>{item.room.name}</strong><small>{item.room.type}</small></div><em>{item.responsibility}</em></div>) : <div className="tableState">No lab or facility responsibilities assigned.</div>}</section>
    </div>
  </>;
}
