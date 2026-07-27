import { useDeferredValue, useEffect, useState } from 'react';
import { Bell, Download, Megaphone, Search } from 'lucide-react';
import { api } from '../api';
import { EmptyState } from '../components/feedback/EmptyState';
import { AppShell } from '../components/layout/AppShell';
import type { Announcement } from '../types/models';
import { formatDate } from '../utils/formatters';

export default function UpdatesPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'ALL' | 'CIRCULAR' | 'NEWS'>('ALL');
  const deferredQuery = useDeferredValue(query.toLowerCase());
  useEffect(() => { api<{ announcements: Announcement[] }>('/modules/communications').then(data => setAnnouncements(data.announcements)).catch(() => setAnnouncements([])); }, []);
  const visible = announcements.filter(item => (
    tab === 'ALL' || (tab === 'CIRCULAR' ? item.category === 'CIRCULAR' : item.category !== 'CIRCULAR')
  ) && `${item.title} ${item.body}`.toLowerCase().includes(deferredQuery));
  return (
    <AppShell title="Updates" back>
      <div className="search-field"><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search notifications…" /></div>
      <div className="tabs"><button className={tab === 'ALL' ? 'active' : ''} onClick={() => setTab('ALL')}>All</button><button className={tab === 'CIRCULAR' ? 'active' : ''} onClick={() => setTab('CIRCULAR')}>Circulars</button><button className={tab === 'NEWS' ? 'active' : ''} onClick={() => setTab('NEWS')}>Announcements</button></div>
      {visible.length ? visible.map(item => <article className="notification" key={item.id}><span className={`square-icon ${item.priority === 'URGENT' ? 'danger' : ''}`}><Megaphone /></span><div><small>{item.priority === 'URGENT' ? <b>URGENT · </b> : null}{formatDate(item.publishedAt)}</small><h3>{item.title}</h3><p>{item.body}</p>{item.attachmentUrl ? <a href={item.attachmentUrl} target="_blank" rel="noreferrer"><Download /> Download attachment</a> : null}</div>{!item.isRead ? <i /> : null}</article>) : <EmptyState icon={Bell} title="No updates" text="Circulars and school announcements will appear here." />}
    </AppShell>
  );
}
