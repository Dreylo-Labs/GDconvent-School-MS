'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AcademicCapIcon, BeakerIcon, BuildingOffice2Icon, PencilSquareIcon,
  PlusIcon, Squares2X2Icon, TrashIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from './auth-provider';

type Room = { id: string; name: string; type: string; capacity?: number; building?: string; floor?: string; notes?: string; isActive: boolean; _count?: { sections: number } };
type SchoolClass = { id: string; name: string; section: string; roomId?: string; room?: Room; teacher?: { firstName: string; lastName: string }; _count: { students: number } };
type Dialog = { type: 'room' | 'class'; item?: Room | SchoolClass } | null;
const roomTypes = ['Classroom', 'Laboratory', 'Medical Room', 'Library', 'Computer Lab', 'Activity Room', 'Staff Room', 'Office', 'Sports Room'];
const classLabel = (item: Pick<SchoolClass, 'name' | 'section'>) => item.section ? `${item.name}-${item.section}` : item.name;

export function FacilitiesManager() {
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN';
  const [tab, setTab] = useState<'classes' | 'rooms'>('classes');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [classResponse, roomResponse] = await Promise.all([fetch('/api/proxy/classes'), fetch('/api/proxy/rooms')]);
      if (!classResponse.ok || !roomResponse.ok) throw new Error('Could not load classes and rooms.');
      const [classData, roomData] = await Promise.all([classResponse.json(), roomResponse.json()]);
      setClasses(classData); setRooms(roomData); setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load classes and rooms.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filteredRooms = useMemo(() => rooms.filter(room => `${room.name} ${room.type} ${room.building ?? ''}`.toLowerCase().includes(query.toLowerCase())), [rooms, query]);
  const filteredClasses = useMemo(() => classes.filter(item => classLabel(item).toLowerCase().includes(query.toLowerCase())), [classes, query]);

  async function submit(path: string, method: 'POST' | 'PUT', body: object) {
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/proxy/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = response.status === 204 ? null : await response.json();
      if (!response.ok) throw new Error(result?.message || 'The record could not be saved.');
      setDialog(null); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The record could not be saved.'); }
    finally { setSaving(false); }
  }

  async function remove(type: 'classes' | 'rooms', id: string, label: string) {
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    setError('');
    const response = await fetch(`/api/proxy/${type}/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      setError(result?.message || `Could not delete ${label}.`);
      return;
    }
    await load();
  }

  function saveRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget); const item = dialog?.item as Room | undefined;
    const customType = String(data.get('customType') ?? '').trim();
    const body = { name: String(data.get('name')).trim(), type: String(data.get('type')) === 'Custom' ? customType : String(data.get('type')), capacity: Number(data.get('capacity')) || undefined, building: String(data.get('building') ?? '').trim() || undefined, floor: String(data.get('floor') ?? '').trim() || undefined, notes: String(data.get('notes') ?? '').trim() || undefined };
    void submit(item ? `rooms/${item.id}` : 'rooms', item ? 'PUT' : 'POST', body);
  }

  function saveClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget); const item = dialog?.item as SchoolClass | undefined;
    const name = String(data.get('className')).trim();
    const sectionNames = String(data.get('sections') ?? '').split(',').map(value => value.trim().toUpperCase()).filter(Boolean);
    const roomId = String(data.get('roomId') ?? '') || null;
    if (item) void submit(`classes/${item.id}`, 'PUT', { name, section: sectionNames[0] ?? '', roomId });
    else void submit('classes', 'POST', { name, sections: sectionNames.length ? sectionNames.map((section, index) => ({ name: section, roomId: index === 0 ? roomId || undefined : undefined })) : [{ name: '', roomId: roomId || undefined }] });
  }

  return <>
    <div className="pageHead facilitiesHead"><div><h1>Classes & Rooms</h1><p>Create classes with optional sections and manage every physical space in your school.</p></div>{canEdit && <button className="primary" onClick={() => { setError(''); setDialog({ type: tab === 'classes' ? 'class' : 'room' }); }}><PlusIcon />{tab === 'classes' ? 'Create class' : 'Add room'}</button>}</div>
    <div className="facilitySummary">
      <div><AcademicCapIcon /><span><strong>{new Set(classes.map(item => item.name)).size}</strong> class levels</span></div>
      <div><Squares2X2Icon /><span><strong>{classes.filter(item => item.section).length}</strong> named sections</span></div>
      <div><BuildingOffice2Icon /><span><strong>{rooms.length}</strong> rooms</span></div>
      <div><BeakerIcon /><span><strong>{rooms.filter(room => room.type.toLowerCase().includes('lab')).length}</strong> laboratories</span></div>
    </div>
    {error && !dialog && <div className="loginError facilityError">{error}</div>}
    <section className="panel facilityPanel">
      <div className="facilityToolbar"><div className="facilityTabs" role="tablist"><button className={tab === 'classes' ? 'selected' : ''} onClick={() => setTab('classes')}>Classes & sections</button><button className={tab === 'rooms' ? 'selected' : ''} onClick={() => setTab('rooms')}>Rooms & facilities</button></div><input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${tab === 'classes' ? 'classes' : 'rooms'}…`} aria-label="Search facilities" /></div>
      {loading ? <div className="tableState">Loading classes and rooms…</div> : tab === 'classes' ? (
        <div className="tableWrap"><table><thead><tr><th>Class</th><th>Section</th><th>Assigned room</th><th>Class teacher</th><th>Students</th><th>Actions</th></tr></thead><tbody>{filteredClasses.length ? filteredClasses.map(item => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.section ? <span className="sectionBadge">{item.section}</span> : <span className="mutedText">No section</span>}</td><td>{item.room?.name ?? 'Not assigned'}</td><td>{item.teacher ? `${item.teacher.firstName} ${item.teacher.lastName}` : 'Not assigned'}</td><td>{item._count.students}</td><td>{canEdit ? <><button className="rowIcon" aria-label={`Edit ${classLabel(item)}`} onClick={() => { setError(''); setDialog({ type: 'class', item }); }}><PencilSquareIcon /></button><button className="rowIcon danger" aria-label={`Delete ${classLabel(item)}`} onClick={() => void remove('classes', item.id, classLabel(item))}><TrashIcon /></button></> : <span className="readonlyLabel">View only</span>}</td></tr>) : <tr><td colSpan={6}><div className="tableState">No classes match your search.</div></td></tr>}</tbody></table></div>
      ) : (
        filteredRooms.length ? <div className="roomGrid">{filteredRooms.map(room => <article className="roomCard" key={room.id}><div className="roomCardTop"><div className={room.type.toLowerCase().includes('lab') ? 'roomGlyph lab' : 'roomGlyph'}>{room.type.toLowerCase().includes('lab') ? <BeakerIcon /> : <BuildingOffice2Icon />}</div><div className="roomActions">{canEdit && <><button aria-label={`Edit ${room.name}`} onClick={() => { setError(''); setDialog({ type: 'room', item: room }); }}><PencilSquareIcon /></button><button aria-label={`Delete ${room.name}`} onClick={() => void remove('rooms', room.id, room.name)}><TrashIcon /></button></>}</div></div><h3>{room.name}</h3><p>{room.type}</p><dl><div><dt>Capacity</dt><dd>{room.capacity ?? '—'}</dd></div><div><dt>Location</dt><dd>{[room.building, room.floor].filter(Boolean).join(' · ') || '—'}</dd></div><div><dt>Classes</dt><dd>{room._count?.sections ?? 0}</dd></div></dl></article>)}</div> : <div className="tableState">No rooms match your search.</div>
      )}
    </section>
    {dialog && <div className="dialogBackdrop" role="presentation" onMouseDown={() => setDialog(null)}><div className="facilityDialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onMouseDown={event => event.stopPropagation()}><div className="dialogTitle"><div><h2 id="dialog-title">{dialog.item ? `Edit ${dialog.type}` : dialog.type === 'room' ? 'Add a room' : 'Create class'}</h2><p>{dialog.type === 'room' ? 'Room types are fully customizable.' : 'A section is optional and can be added later.'}</p></div><button onClick={() => setDialog(null)} aria-label="Close"><XMarkIcon /></button></div>{dialog.type === 'room' ? <RoomForm item={dialog.item as Room | undefined} onSubmit={saveRoom} onCancel={() => setDialog(null)} saving={saving} error={error} /> : <ClassForm item={dialog.item as SchoolClass | undefined} rooms={rooms} onSubmit={saveClass} onCancel={() => setDialog(null)} saving={saving} error={error} />}</div></div>}
  </>;
}

function RoomForm({ item, onSubmit, onCancel, saving, error }: { item?: Room; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void; saving: boolean; error: string }) {
  const [type, setType] = useState(item && roomTypes.includes(item.type) ? item.type : item ? 'Custom' : 'Classroom');
  return <form className="facilityForm" onSubmit={onSubmit}><label>Room name<input name="name" required defaultValue={item?.name} placeholder="e.g. Chemistry Lab" /></label><div className="formColumns"><label>Room type<select name="type" value={type} onChange={event => setType(event.target.value)}>{roomTypes.map(value => <option key={value}>{value}</option>)}<option>Custom</option></select></label>{type === 'Custom' && <label>Custom type<input name="customType" required defaultValue={item?.type} placeholder="e.g. Robotics Lab" /></label>}<label>Capacity<input name="capacity" type="number" min="1" defaultValue={item?.capacity} placeholder="40" /></label></div><div className="formColumns"><label>Building<input name="building" defaultValue={item?.building} placeholder="Main Block" /></label><label>Floor<input name="floor" defaultValue={item?.floor} placeholder="Ground Floor" /></label></div><label>Notes<textarea name="notes" rows={3} defaultValue={item?.notes} placeholder="Equipment, access, or other details" /></label>{error && <div className="loginError">{error}</div>}<div className="dialogButtons"><button type="button" onClick={onCancel}>Cancel</button><button className="primary" disabled={saving}>{saving ? 'Saving…' : item ? 'Save changes' : 'Add room'}</button></div></form>;
}

function ClassForm({ item, rooms, onSubmit, onCancel, saving, error }: { item?: SchoolClass; rooms: Room[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void; saving: boolean; error: string }) {
  return <form className="facilityForm" onSubmit={onSubmit}><label>Class name<input name="className" required defaultValue={item?.name} placeholder="e.g. Class 2" /></label><label>{item ? 'Section' : 'Sections (optional)'}<input name="sections" defaultValue={item?.section} placeholder={item ? 'e.g. A' : 'e.g. A, B, C'} /><small>{item ? 'Leave empty when this class does not need a section.' : 'Leave empty to create only the class, or separate multiple sections with commas.'}</small></label><label>Assign room<select name="roomId" defaultValue={item?.roomId ?? ''}><option value="">Assign later</option>{rooms.map(room => <option value={room.id} key={room.id}>{room.name}</option>)}</select></label>{error && <div className="loginError">{error}</div>}<div className="dialogButtons"><button type="button" onClick={onCancel}>Cancel</button><button className="primary" disabled={saving}>{saving ? 'Saving…' : item ? 'Save changes' : 'Create class'}</button></div></form>;
}
