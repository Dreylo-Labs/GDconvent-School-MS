'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AcademicCapIcon, BeakerIcon, PencilSquareIcon, PlusIcon, TrashIcon, UserGroupIcon, XMarkIcon } from '@heroicons/react/24/outline';

type SchoolClass = { id: string; name: string; section: string; teacherId?: string; teacher?: { firstName: string; lastName: string }; room?: { name: string }; _count: { students: number } };
type Room = { id: string; name: string; type: string };
type Teacher = { id: string; employeeNo: string; firstName: string; lastName: string; email: string; phone?: string; subject?: string; qualification?: string; joinedAt?: string; user?: { isActive: boolean; lastLoginAt?: string }; classes: SchoolClass[]; roomAssignments: { roomId: string; responsibility: string; room: Room }[] };
const classLabel = (item: Pick<SchoolClass, 'name' | 'section'>) => item.section ? `${item.name}-${item.section}` : item.name;

export function TeachersManager() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [nextEmployeeNo, setNextEmployeeNo] = useState('EMP-001');
  const [editing, setEditing] = useState<Teacher | null | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [teachersResponse, classesResponse, roomsResponse, employeeResponse] = await Promise.all([fetch('/api/proxy/teachers'), fetch('/api/proxy/classes'), fetch('/api/proxy/rooms'), fetch('/api/proxy/identifiers/next?type=employee', { cache: 'no-store' })]);
    if (teachersResponse.ok) setTeachers(await teachersResponse.json());
    if (classesResponse.ok) setClasses(await classesResponse.json());
    if (roomsResponse.ok) setRooms(await roomsResponse.json());
    if (employeeResponse.ok) setNextEmployeeNo((await employeeResponse.json()).value);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => teachers.filter(item => `${item.firstName} ${item.lastName} ${item.employeeNo} ${item.subject ?? ''}`.toLowerCase().includes(query.toLowerCase())), [teachers, query]);
  const classTeachers = teachers.filter(item => item.classes.length).length;
  const facilityAssignments = teachers.reduce((sum, item) => sum + item.roomAssignments.length, 0);

  async function saveTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    const form = new FormData(event.currentTarget);
    const classIds = form.getAll('classIds').map(String);
    const roomIds = form.getAll('roomIds').map(String);
    const body = {
      employeeNo: form.get('employeeNo'), firstName: form.get('firstName'), lastName: form.get('lastName'), email: form.get('email'),
      phone: form.get('phone') || undefined, subject: form.get('subject') || undefined, qualification: form.get('qualification') || undefined,
      joinedAt: form.get('joinedAt') || undefined, password: form.get('password') || undefined, classIds,
      roomAssignments: roomIds.map(roomId => ({ roomId, responsibility: form.get(`responsibility-${roomId}`) || 'Assistant' })),
    };
    const response = await fetch(`/api/proxy/teachers${editing ? `/${editing.id}` : ''}`, { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.message || 'Teacher could not be saved.');
    else { setEditing(undefined); await load(); }
    setSaving(false);
  }

  async function remove(teacher: Teacher) {
    if (!window.confirm(`Delete ${teacher.firstName} ${teacher.lastName}? Their login and assignments will also be removed.`)) return;
    const response = await fetch(`/api/proxy/teachers/${teacher.id}`, { method: 'DELETE' });
    if (!response.ok) { const data = await response.json().catch(() => ({})); setError(data.message || 'Teacher could not be deleted.'); return; }
    await load();
  }

  return <>
    <div className="pageHead"><div><h1>Teachers</h1><p>Manage teacher accounts, class ownership, subjects, and facility responsibilities.</p></div><button className="primary" onClick={() => { setError(''); setEditing(null); }}><PlusIcon />Add teacher</button></div>
    <div className="teacherSummary"><div><UserGroupIcon /><span><strong>{teachers.length}</strong>Total teachers</span></div><div><AcademicCapIcon /><span><strong>{classTeachers}</strong>Class teachers</span></div><div><BeakerIcon /><span><strong>{facilityAssignments}</strong>Facility assignments</span></div></div>
    {error && editing === undefined && <div className="loginError teacherPageError">{error}</div>}
    <section className="panel teachersPanel"><div className="teacherToolbar"><label className="search compact"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search teacher, employee no. or subject…" /></label></div><div className="tableWrap"><table><thead><tr><th>Employee</th><th>Teacher</th><th>Subject</th><th>Class teacher</th><th>Rooms & labs</th><th>Login</th><th>Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={7}><div className="tableState">Loading teachers…</div></td></tr> : filtered.length ? filtered.map(teacher => <tr key={teacher.id}><td className="mono">{teacher.employeeNo}</td><td><strong>{teacher.firstName} {teacher.lastName}</strong><small className="cellSubtext">{teacher.email}{teacher.phone ? ` · ${teacher.phone}` : ''}</small></td><td>{teacher.subject || '—'}<small className="cellSubtext">{teacher.qualification}</small></td><td>{teacher.classes.length ? teacher.classes.map(item => <span className="teacherAssignment" key={item.id}>{classLabel(item)} · {item._count.students} students</span>) : <span className="mutedText">Not assigned</span>}</td><td>{teacher.roomAssignments.length ? teacher.roomAssignments.map(item => <span className="teacherAssignment room" key={item.roomId}>{item.room.name} · {item.responsibility}</span>) : <span className="mutedText">None</span>}</td><td><span className={`status ${teacher.user?.isActive ? 'present' : 'absent'}`}>{teacher.user?.isActive ? 'Active' : 'Inactive'}</span>{teacher.user?.lastLoginAt && <small className="cellSubtext">Last login {new Intl.DateTimeFormat('en-IN',{dateStyle:'medium'}).format(new Date(teacher.user.lastLoginAt))}</small>}</td><td><button className="rowIcon" aria-label={`Edit ${teacher.firstName} ${teacher.lastName}`} onClick={() => { setError(''); setEditing(teacher); }}><PencilSquareIcon /></button><button className="rowIcon danger" aria-label={`Delete ${teacher.firstName} ${teacher.lastName}`} onClick={() => void remove(teacher)}><TrashIcon /></button></td></tr>) : <tr><td colSpan={7}><div className="tableState">No teachers match your search.</div></td></tr>}</tbody></table></div></section>
    {editing !== undefined && <div className="dialogBackdrop" onMouseDown={() => setEditing(undefined)}><div className="facilityDialog teacherDialog" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()}><div className="dialogTitle"><div><h2>{editing ? 'Edit teacher' : 'Add teacher'}</h2><p>The employee number is suggested automatically but remains editable.</p></div><button onClick={() => setEditing(undefined)} aria-label="Close"><XMarkIcon /></button></div><TeacherForm teacher={editing ?? undefined} nextEmployeeNo={nextEmployeeNo} classes={classes} rooms={rooms} onSubmit={saveTeacher} onCancel={() => setEditing(undefined)} saving={saving} error={error} /></div></div>}
  </>;
}

function TeacherForm({ teacher, nextEmployeeNo, classes, rooms, onSubmit, onCancel, saving, error }: { teacher?: Teacher; nextEmployeeNo: string; classes: SchoolClass[]; rooms: Room[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void; saving: boolean; error: string }) {
  const [selectedRooms, setSelectedRooms] = useState(() => new Set(teacher?.roomAssignments.map(item => item.roomId) ?? []));
  return <form className="facilityForm teacherForm" onSubmit={onSubmit}>
    <div className="formColumns"><label>Employee number<input name="employeeNo" required defaultValue={teacher?.employeeNo ?? nextEmployeeNo} placeholder="EMP-001" /><small>Next number suggested automatically. You can edit it.</small></label><label>Joining date<input name="joinedAt" type="date" defaultValue={teacher?.joinedAt?.slice(0,10)} /></label></div>
    <div className="formColumns"><label>First name<input name="firstName" required defaultValue={teacher?.firstName} /></label><label>Last name<input name="lastName" required defaultValue={teacher?.lastName} /></label></div>
    <div className="formColumns"><label>Email / login<input name="email" type="email" required defaultValue={teacher?.email} /></label><label>Phone<input name="phone" defaultValue={teacher?.phone} /></label></div>
    <div className="formColumns"><label>Primary subject<input name="subject" defaultValue={teacher?.subject} placeholder="Mathematics" /></label><label>Qualification<input name="qualification" defaultValue={teacher?.qualification} placeholder="M.Sc., B.Ed." /></label></div>
    <label>{teacher ? 'Reset password (optional)' : 'Temporary password'}<input name="password" type="password" minLength={8} required={!teacher} placeholder={teacher ? 'Leave blank to keep current password' : 'At least 8 characters'} /></label>
    <fieldset className="assignmentPicker"><legend>Class teacher assignments</legend>{classes.map(item => { const occupied = item.teacherId && item.teacherId !== teacher?.id; return <label key={item.id}><input type="checkbox" name="classIds" value={item.id} defaultChecked={teacher?.classes.some(value => value.id === item.id)} /><span><strong>{classLabel(item)}</strong><small>{item._count.students} students{occupied && item.teacher ? ` · currently ${item.teacher.firstName} ${item.teacher.lastName}` : ''}</small></span></label>; })}</fieldset>
    <fieldset className="assignmentPicker"><legend>Room, lab & sports responsibilities</legend>{rooms.map(room => { const assignment = teacher?.roomAssignments.find(item => item.roomId === room.id); return <div className="roomAssignmentRow" key={room.id}><label><input type="checkbox" name="roomIds" value={room.id} defaultChecked={Boolean(assignment)} onChange={event => setSelectedRooms(current => { const next = new Set(current); if (event.target.checked) next.add(room.id); else next.delete(room.id); return next; })} /><span><strong>{room.name}</strong><small>{room.type}</small></span></label>{selectedRooms.has(room.id) && <input name={`responsibility-${room.id}`} defaultValue={assignment?.responsibility ?? 'Assistant'} placeholder="e.g. Lab assistant" />}</div>; })}</fieldset>
    {error && <div className="loginError">{error}</div>}<div className="dialogButtons"><button type="button" onClick={onCancel}>Cancel</button><button className="primary" disabled={saving}>{saving ? 'Saving…' : teacher ? 'Save changes' : 'Create teacher & login'}</button></div>
  </form>;
}
