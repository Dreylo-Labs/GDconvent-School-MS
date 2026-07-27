'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftIcon, CalendarDaysIcon, CheckCircleIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { useAuth } from './auth-provider';

type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
type ClassSummary = { id: string; name: string; section: string; totalStudents: number; marked: number; present: number; absent: number; late: number; excused: number; room?: { name: string }; teacher?: { firstName: string; lastName: string } };
type AttendanceRecord = { id: string; status: Status; note?: string; markedAt: string };
type StudentRow = { id: string; admissionNo: string; firstName: string; lastName: string; attendance: AttendanceRecord | null };
type ClassDetail = { id: string; name: string; section: string; date: string; editable: boolean; room?: { name: string }; teacher?: { firstName: string; lastName: string }; students: StudentRow[] };
type Draft = Record<string, { status: Status; note: string }>;
const statuses: Status[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
const classLabel = (item: { name: string; section: string }) => item.section ? `${item.name}-${item.section}` : item.name;
const localDate = () => {
  const now = new Date(); const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

export function AttendanceManager() {
  const { user } = useAuth();
  const [date, setDate] = useState(localDate);
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [bulkStatus, setBulkStatus] = useState<Status>('PRESENT');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const isAdmin = user?.role === 'ADMIN';

  const loadClasses = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/proxy/attendance/classes?date=${date}`, { cache: 'no-store' });
    if (response.ok) setClasses(await response.json());
    setLoading(false);
  }, [date]);
  const loadDetail = useCallback(async (classId: string) => {
    setLoading(true); setMessage('');
    const response = await fetch(`/api/proxy/attendance/classes/${classId}?date=${date}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) { setMessage(data.message || 'Attendance could not be loaded.'); setLoading(false); return; }
    setDetail(data);
    setDraft(Object.fromEntries(data.students.map((student: StudentRow) => [student.id, { status: student.attendance?.status ?? 'PRESENT', note: student.attendance?.note ?? '' }])));
    setLoading(false);
  }, [date]);
  useEffect(() => { void loadClasses(); }, [loadClasses]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [date, selectedId, loadDetail]);

  const visibleStudents = useMemo(() => detail?.students.filter(student => `${student.firstName} ${student.lastName} ${student.admissionNo}`.toLowerCase().includes(query.toLowerCase())) ?? [], [detail, query]);
  const selectedSummary = classes.find(item => item.id === selectedId);

  async function save(records: { studentId: string; status: Status; note?: string }[], savingKey: string) {
    if (!detail?.editable || !records.length) return;
    setSaving(savingKey); setMessage('');
    const response = await fetch('/api/proxy/attendance/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classId: detail.id, date, records }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setMessage(data.message || 'Attendance could not be saved.');
    else { setMessage(`${data.saved} attendance record${data.saved === 1 ? '' : 's'} saved.`); await Promise.all([loadDetail(detail.id), loadClasses()]); }
    setSaving(null);
  }

  function applyBulk() {
    setDraft(current => ({ ...current, ...Object.fromEntries(visibleStudents.map(student => [student.id, { ...current[student.id], status: bulkStatus }])) }));
  }

  if (!selectedId) return <>
    <div className="pageHead attendanceHead"><div><h1>Attendance</h1><p>Select a class to review or mark attendance for the school day.</p></div><DateControl date={date} setDate={setDate} isAdmin={isAdmin} /></div>
    <div className="attendanceSummary"><div><UserGroupIcon /><span><strong>{classes.length}</strong>Assigned classes</span></div><div><CheckCircleIcon /><span><strong>{classes.reduce((sum, item) => sum + item.marked, 0)}</strong>Students marked</span></div><div><CalendarDaysIcon /><span><strong>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(`${date}T00:00:00`))}</strong>Attendance date</span></div></div>
    {message && <div className="loginError attendanceMessage">{message}</div>}
    {loading ? <div className="panel tableState">Loading classes…</div> : classes.length ? <div className="attendanceClassGrid">{classes.map(item => <button className="attendanceClassCard" key={item.id} onClick={() => setSelectedId(item.id)}><div><span className="classIcon"><UserGroupIcon /></span><span><strong>{classLabel(item)}</strong><small>{item.teacher ? `${item.teacher.firstName} ${item.teacher.lastName}` : 'No class teacher'}{item.room ? ` · ${item.room.name}` : ''}</small></span></div><dl><div><dt>Total students</dt><dd>{item.totalStudents}</dd></div><div><dt>Marked</dt><dd>{item.marked}/{item.totalStudents}</dd></div><div><dt>Present</dt><dd className="greenText">{item.present}</dd></div><div><dt>Absent</dt><dd className="redText">{item.absent}</dd></div></dl><span className="attendanceProgress"><i style={{ width: `${item.totalStudents ? item.marked / item.totalStudents * 100 : 0}%` }} /></span></button>)}</div> : <div className="panel tableState">No classes are available for your account.</div>}
  </>;

  return <>
    <div className="attendanceDetailHead"><button className="backButton" onClick={() => { setSelectedId(''); setDetail(null); setMessage(''); }}><ArrowLeftIcon />All classes</button><div><h1>{detail ? classLabel(detail) : classLabel(selectedSummary!)}</h1><p>{detail?.students.length ?? selectedSummary?.totalStudents ?? 0} students · {detail?.teacher ? `${detail.teacher.firstName} ${detail.teacher.lastName}` : 'No class teacher'}</p></div><DateControl date={date} setDate={setDate} isAdmin={isAdmin} /></div>
    {!isAdmin && date !== localDate() && <div className="attendanceNotice">Teachers may review previous dates, but can only mark attendance for today.</div>}
    {message && <div className={message.includes('saved') ? 'attendanceSuccess' : 'loginError attendanceMessage'}>{message}</div>}
    <section className="panel attendanceRoster">
      <div className="attendanceToolbar"><label className="search compact"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search student or admission number…" /></label><div className="bulkControls"><span>Set visible students</span><select value={bulkStatus} onChange={event => setBulkStatus(event.target.value as Status)} disabled={!detail?.editable}>{statuses.map(status => <option key={status}>{status}</option>)}</select><button onClick={applyBulk} disabled={!detail?.editable}>Apply</button><button className="primary" disabled={!detail?.editable || saving !== null} onClick={() => void save(visibleStudents.map(student => ({ studentId: student.id, ...draft[student.id] })), 'bulk')}>{saving === 'bulk' ? 'Saving…' : 'Save all'}</button></div></div>
      <div className="tableWrap"><table><thead><tr><th>Admission no.</th><th>Student</th><th>Status</th><th>Note</th><th>Last marked</th><th>Action</th></tr></thead><tbody>{loading ? <tr><td colSpan={6}><div className="tableState">Loading roster…</div></td></tr> : visibleStudents.length ? visibleStudents.map(student => <tr key={student.id}><td className="mono">{student.admissionNo}</td><td><strong>{student.firstName} {student.lastName}</strong></td><td><select className={`attendanceStatus ${draft[student.id]?.status?.toLowerCase()}`} value={draft[student.id]?.status ?? 'PRESENT'} disabled={!detail?.editable} onChange={event => setDraft(current => ({ ...current, [student.id]: { ...current[student.id], status: event.target.value as Status } }))}>{statuses.map(status => <option key={status}>{status}</option>)}</select></td><td><input className="attendanceNote" disabled={!detail?.editable} value={draft[student.id]?.note ?? ''} onChange={event => setDraft(current => ({ ...current, [student.id]: { ...current[student.id], note: event.target.value } }))} placeholder="Optional note" /></td><td>{student.attendance ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(student.attendance.markedAt)) : <span className="mutedText">Not marked</span>}</td><td><button className="rowSaveButton" disabled={!detail?.editable || saving !== null} onClick={() => void save([{ studentId: student.id, ...draft[student.id] }], student.id)}>{saving === student.id ? 'Saving…' : 'Save'}</button></td></tr>) : <tr><td colSpan={6}><div className="tableState">No students match your search.</div></td></tr>}</tbody></table></div>
    </section>
  </>;
}

function DateControl({ date, setDate, isAdmin }: { date: string; setDate: (date: string) => void; isAdmin: boolean }) {
  return <label className="attendanceDate"><CalendarDaysIcon /><span>{isAdmin ? 'Attendance date' : 'School date'}<input type="date" value={date} max={localDate()} onChange={event => setDate(event.target.value)} /></span></label>;
}
