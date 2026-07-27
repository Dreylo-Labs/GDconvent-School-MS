'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeftStartOnRectangleIcon, BellIcon, Cog6ToothIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { icons } from './icons';
import { useAuth } from './auth-provider';
import { roleLabels, type UserRole } from '@/lib/auth-types';

type NavItem = { label: keyof typeof icons; href: string; roles: UserRole[] };
const all: UserRole[] = ['ADMIN', 'TEACHER', 'PARENT', 'STUDENT', 'ACCOUNTANT', 'LIBRARIAN'];
const nav: NavItem[] = [
  { label: 'Overview', href: '/', roles: all },
  { label: 'Students', href: '/students', roles: ['ADMIN', 'TEACHER', 'ACCOUNTANT'] },
  { label: 'Teachers', href: '/teachers', roles: ['ADMIN'] },
  { label: 'Classes', href: '/classes', roles: ['ADMIN', 'TEACHER'] },
  { label: 'Attendance', href: '/attendance', roles: ['ADMIN', 'TEACHER'] },
  { label: 'Student Leave', href: '/student-leave', roles: ['ADMIN', 'TEACHER', 'PARENT'] },
  { label: 'Fees', href: '/fees', roles: ['ADMIN', 'PARENT', 'STUDENT', 'ACCOUNTANT'] },
  { label: 'Exams', href: '/exams', roles: ['ADMIN', 'TEACHER', 'PARENT', 'STUDENT'] },
  { label: 'Timetable', href: '/timetable', roles: ['ADMIN', 'TEACHER', 'PARENT', 'STUDENT'] },
  { label: 'Transport', href: '/transport', roles: ['ADMIN', 'PARENT', 'STUDENT'] },
  { label: 'Staff Attendance', href: '/staff-attendance', roles: ['ADMIN', 'TEACHER'] },
  { label: 'Audit', href: '/audit', roles: ['ADMIN'] },
  { label: 'Communication', href: '/communications', roles: all },
  { label: 'Library', href: '/modules/library', roles: ['ADMIN', 'LIBRARIAN', 'STUDENT'] },
];
type SearchResult = { id: string; type: string; title: string; subtitle: string; href: string };
type HeaderNotice = { id: string; kind: 'announcement' | 'message'; title: string; body: string; createdAt: string; unread: boolean };

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notices, setNotices] = useState<HeaderNotice[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const allowedNav = user ? nav.filter(item => item.roles.includes(user.role)) : [];
  const currentRule = nav.find(item => item.href !== '/' && path.startsWith(item.href));
  const forbidden = Boolean(user && ((currentRule && !currentRule.roles.includes(user.role)) || (path.startsWith('/settings') && user.role !== 'ADMIN')));
  useEffect(() => { if (forbidden) router.replace('/'); }, [forbidden, router]);
  useEffect(() => {
    if (!user) return;
    fetch('/api/proxy/modules/communications', { cache: 'no-store' }).then(async response => {
      if (!response.ok) return;
      const data = await response.json();
      const combined: HeaderNotice[] = [
        ...data.announcements.map((item: { id: string; title: string; body: string; publishedAt?: string; createdAt: string; isRead: boolean }) => ({ id: item.id, kind: 'announcement' as const, title: item.title, body: item.body, createdAt: item.publishedAt || item.createdAt, unread: !item.isRead })),
        ...data.messages.filter((item: { recipient: { id: string } }) => item.recipient.id === user.id).map((item: { id: string; subject?: string; body: string; createdAt: string; readAt?: string }) => ({ id: item.id, kind: 'message' as const, title: item.subject || 'New message', body: item.body, createdAt: item.createdAt, unread: !item.readAt })),
      ];
      setNotices(combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 4));
    }).catch(() => setNotices([]));
  }, [user]);
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/proxy/modules/search?q=${encodeURIComponent(query.trim())}`, { cache: 'no-store' })
        .then(response => response.ok ? response.json() : [])
        .then(setResults)
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  async function openNotice(notice: HeaderNotice) {
    if (notice.unread) {
      const endpoint = notice.kind === 'announcement' ? `announcements/${notice.id}/read` : `messages/${notice.id}/read`;
      await fetch(`/api/proxy/modules/communications/${endpoint}`, { method: 'PATCH' });
      setNotices(current => current.map(item => item.id === notice.id && item.kind === notice.kind ? { ...item, unread: false } : item));
    }
    setNotificationsOpen(false);
  }
  if (loading || !user || forbidden) return <div className="authLoading"><div className="authSpinner" /><span>Loading your workspace…</span></div>;
  const initials = user.name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
  const unread = notices.filter(item => item.unread).length;
  return <div className="app"><aside className="sidebar"><div className="brand schoolBrand"><img src="/gd-convent-logo.png" alt="G.D. Convent School crest" /><span>G.D. Convent<br />Sr Sec School</span></div><nav>{allowedNav.map(({ label, href }) => { const Icon = icons[label]; const active = path === href; return <Link className={active ? 'active' : ''} href={href} key={href}><Icon /><span>{label}</span></Link>; })}</nav><div className="sidebarFoot conceptSidebarFoot">{user.role === 'ADMIN' && <Link href="/settings"><Cog6ToothIcon /><span>Settings</span></Link>}<button onClick={() => void logout()}><ArrowLeftStartOnRectangleIcon /><span>Logout</span></button></div></aside><div className="workspace"><header>
    <div className="globalSearch" onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}>
      <label className="search"><MagnifyingGlassIcon /><input aria-label="Global search" value={query} onFocus={() => setSearchOpen(true)} onChange={event => { setQuery(event.target.value); setSearchOpen(true); }} placeholder={user.role === 'LIBRARIAN' || user.role === 'STUDENT' ? 'Search library…' : user.role === 'PARENT' ? 'Search linked children…' : 'Search students, staff, classes…'} /></label>
      {searchOpen && query.trim().length >= 2 && <div className="headerPopover searchPopover">{searching ? <div className="headerEmpty">Searching…</div> : results.length ? results.map(item => <Link className="headerResult" href={item.href} key={`${item.type}-${item.id}`} onClick={() => { setSearchOpen(false); setQuery(''); }}><em>{item.type}</em><strong>{item.title}</strong><span>{item.subtitle}</span></Link>) : <div className="headerEmpty">No matching records found.</div>}</div>}
    </div>
    <div className="notificationWrap">
      <button className="iconBtn notificationButton" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(value => !value)}><BellIcon />{unread > 0 && <span className="notificationDot">{unread}</span>}</button>
      {notificationsOpen && <div className="headerPopover notificationPopover"><div className="notificationHead"><strong>Latest communications</strong><Link href="/communications" onClick={() => setNotificationsOpen(false)}>View all</Link></div>{notices.length ? notices.map(notice => <Link href="/communications" className={`notificationItem ${notice.unread ? 'unread' : ''}`} key={`${notice.kind}-${notice.id}`} onClick={() => void openNotice(notice)}><i /><div><strong>{notice.title}</strong><span>{notice.body.length > 100 ? `${notice.body.slice(0, 100)}…` : notice.body}</span><time>{new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(notice.createdAt))}</time></div></Link>) : <div className="headerEmpty">No communications yet.</div>}</div>}
    </div>
    <div className="profile"><div className="avatar">{initials}</div><div><strong>{user.name}</strong><span>{roleLabels[user.role]}</span></div></div>
  </header><main>{children}</main></div></div>;
}
