'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowPathIcon, EyeIcon, MagnifyingGlassIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useAuth } from './auth-provider';

type SchoolClass = { id: string; name: string; section: string; _count: { students: number } };
type StudentRow = { id: string; admissionNo: string; firstName: string; lastName: string; email?: string; phone?: string; guardianName: string; guardianPhone: string; createdAt: string; class?: SchoolClass; billed?: number; collected?: number; outstanding?: number; advanceBalance?: number };
const classLabel = (item: SchoolClass) => item.section ? `${item.name}-${item.section}` : item.name;

export function StudentsManager() {
  const { user } = useAuth();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [query, setQuery] = useState('');
  const [classId, setClassId] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);

  async function loadStudents() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '15' });
    if (query) params.set('q', query);
    if (classId) params.set('classId', classId);
    const endpoint = user?.role === 'ACCOUNTANT' ? 'finance/students' : 'students';
    const response = await fetch(`/api/proxy/${endpoint}?${params}`, { cache: 'no-store' });
    if (response.ok) { const data = await response.json(); setStudents(data.data); setPagination(data.pagination); }
    setLoading(false);
  }
  useEffect(() => { fetch('/api/proxy/classes').then(response => response.json()).then(setClasses).catch(() => setClasses([])); }, []);
  useEffect(() => { const timer = window.setTimeout(() => void loadStudents(), 250); return () => window.clearTimeout(timer); }, [query, classId, page, user?.role]);

  return <>
    <div className="pageHead"><div><h1>{user?.role === 'ACCOUNTANT' ? 'Student Accounts' : 'Students'}</h1><p>{user?.role === 'ACCOUNTANT' ? 'Search students and review balances, advance credits, invoices, and complete payment history.' : 'Manage enrollment, profiles, guardians, academics, fees, and promotions.'}</p></div>{user?.role === 'ADMIN' && <button className="primary" onClick={() => setDialog(true)}><PlusIcon />Add student</button>}</div>
    <section className="studentSummary"><div><strong>{pagination.total}</strong><span>Total students</span></div><div><strong>{classes.length}</strong><span>Active classes</span></div><div><strong>{classes.reduce((sum,item)=>sum+item._count.students,0)}</strong><span>Assigned to classes</span></div></section>
    <section className="panel resource studentsResource">
      <div className="toolbar studentToolbar"><label className="search compact"><MagnifyingGlassIcon /><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Search name, admission no. or guardian…" /></label><select value={classId} onChange={event => { setClassId(event.target.value); setPage(1); }}><option value="">All classes</option>{classes.map(item => <option key={item.id} value={item.id}>{classLabel(item)}</option>)}</select></div>
      <div className="tableWrap"><table><thead>{user?.role === 'ACCOUNTANT' ? <tr><th>Admission no.</th><th>Student</th><th>Class</th><th>Guardian</th><th>Billed</th><th>Collected</th><th>Outstanding</th><th>Advance</th><th>Action</th></tr> : <tr><th>Admission no.</th><th>Student</th><th>Class</th><th>Guardian</th><th>Joined</th><th>Action</th></tr>}</thead><tbody>{loading ? <tr><td colSpan={user?.role === 'ACCOUNTANT' ? 9 : 6}><div className="tableState">Loading students…</div></td></tr> : students.length ? students.map(student => user?.role === 'ACCOUNTANT' ? <tr key={student.id}><td className="mono">{student.admissionNo}</td><td><strong>{student.firstName} {student.lastName}</strong></td><td>{student.class ? classLabel(student.class) : <span className="mutedText">Unassigned</span>}</td><td>{student.guardianName}<small className="cellSubtext">{student.guardianPhone}</small></td><td>₹{(student.billed ?? 0).toLocaleString('en-IN')}</td><td className="greenText">₹{(student.collected ?? 0).toLocaleString('en-IN')}</td><td><strong className={(student.outstanding ?? 0) > 0 ? 'redText' : ''}>₹{(student.outstanding ?? 0).toLocaleString('en-IN')}</strong></td><td className="blueText">₹{(student.advanceBalance ?? 0).toLocaleString('en-IN')}</td><td><Link className="viewButton" href={`/fees/students/${student.id}`}><EyeIcon />Fee history</Link></td></tr> : <tr key={student.id}><td className="mono">{student.admissionNo}</td><td><strong>{student.firstName} {student.lastName}</strong><small className="cellSubtext">{student.email || student.phone || 'No contact added'}</small></td><td>{student.class ? classLabel(student.class) : <span className="mutedText">Unassigned</span>}</td><td>{student.guardianName}<small className="cellSubtext">{student.guardianPhone}</small></td><td>{new Intl.DateTimeFormat('en-IN',{dateStyle:'medium'}).format(new Date(student.createdAt))}</td><td><Link className="viewButton" href={`/students/${student.id}`}><EyeIcon />View</Link></td></tr>) : <tr><td colSpan={user?.role === 'ACCOUNTANT' ? 9 : 6}><div className="tableState">No students match these filters.</div></td></tr>}</tbody></table></div>
      <div className="pagination"><span>Showing {students.length} of {pagination.total} students</span><div><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><button className="current">{page}</button><button disabled={page >= pagination.pages} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
    </section>
    {dialog && <StudentDialog classes={classes} onClose={() => setDialog(false)} onCreated={async () => { setDialog(false); setPage(1); await loadStudents(); }} />}
  </>;
}

function StudentDialog({ classes, onClose, onCreated }: { classes: SchoolClass[]; onClose: () => void; onCreated: () => Promise<void> }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [admissionNo, setAdmissionNo] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function generate(selectedYear = year) {
    setGenerating(true);
    const response = await fetch(`/api/proxy/identifiers/next?type=student&year=${selectedYear}`, { cache: 'no-store' });
    if (response.ok) setAdmissionNo((await response.json()).value);
    else setError('The next admission number could not be generated.');
    setGenerating(false);
  }
  useEffect(() => { void generate(year); }, [year]);

  async function createStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    delete body.admissionYear;
    for (const key of ['email','phone','address','classId']) if (!body[key]) delete body[key];
    const response = await fetch('/api/proxy/students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.message ?? data.formErrors?.[0] ?? 'Could not add the student.'); setSaving(false); return; }
    setSaving(false); await onCreated();
  }

  return <div className="dialogBackdrop" onMouseDown={onClose}><div className="facilityDialog studentDialog" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()}><div className="dialogTitle"><div><h2>Add student</h2><p>Generate the next number for any admission year, or enter a custom value.</p></div><button onClick={onClose} aria-label="Close"><XMarkIcon /></button></div><form className="facilityForm" onSubmit={createStudent}>
    <div className="identifierFields"><label>Admission year<input name="admissionYear" type="number" min="1900" max="2200" value={year} onChange={event => setYear(Number(event.target.value))} /></label><label>Admission number<div className="generatedInput"><input name="admissionNo" required value={admissionNo} onChange={event => setAdmissionNo(event.target.value)} placeholder={`GD-${year}-001`} /><button type="button" onClick={() => void generate()} disabled={generating} aria-label="Generate next admission number"><ArrowPathIcon /></button></div><small>Suggested automatically. You can edit this value.</small></label><label>Class & section<select name="classId"><option value="">Assign later</option>{classes.map(item => <option key={item.id} value={item.id}>{classLabel(item)}</option>)}</select></label></div>
    <div className="formColumns"><label>First name<input name="firstName" required /></label><label>Last name<input name="lastName" required /></label></div>
    <div className="formColumns"><label>Date of birth<input name="dateOfBirth" type="date" required /></label><label>Gender<select name="gender" required><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select></label></div>
    <div className="formColumns"><label>Email<input name="email" type="email" /></label><label>Phone<input name="phone" /></label></div>
    <label>Address<textarea name="address" rows={2} /></label>
    <div className="formColumns"><label>Guardian name<input name="guardianName" required /></label><label>Guardian phone<input name="guardianPhone" required /></label></div>
    {error && <div className="loginError">{error}</div>}<div className="dialogButtons"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={saving || generating}>{saving ? 'Adding…' : 'Add student'}</button></div>
  </form></div></div>;
}
