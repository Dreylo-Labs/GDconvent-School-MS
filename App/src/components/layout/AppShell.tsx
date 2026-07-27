import { ArrowLeft, Bell, GraduationCap, Home, UserRound, WalletCards } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { formatClassName } from '../../utils/formatters';
import { Avatar } from '../ui/Avatar';

const navigation = [
  ['/', 'Home', Home],
  ['/academics', 'Academics', GraduationCap],
  ['/fees', 'Fees', WalletCards],
  ['/updates', 'Updates', Bell],
  ['/profile', 'Profile', UserRound],
] as const;
const academicRoutes = new Set(['/attendance', '/exams', '/report-card', '/leave', '/timetable', '/transport']);

export function AppShell({ title, back = false, children, action }: {
  title?: string;
  back?: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const { child } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="phone-shell">
      <header className="topbar">
        <div className="identity">
          {back
            ? <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Go back"><ArrowLeft /></button>
            : <Avatar name={child?.firstName || 'GD'} />}
          <div>
            <strong>{title || 'G.D. Convent'}</strong>
            <small>{title
              ? `${child?.firstName || 'Student'} • ${formatClassName(child)}`
              : child ? `${child.firstName} ${child.lastName} • ${formatClassName(child)}` : 'Parent portal'}</small>
          </div>
        </div>
        {action || <button className="icon-btn" onClick={() => navigate('/updates')} aria-label="Updates"><Bell /><i /></button>}
      </header>
      <main className="screen">{children}</main>
      <nav className="bottom-nav">
        {navigation.map(([href, label, Icon]) => {
          const active = href === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(href) || (href === '/academics' && academicRoutes.has(location.pathname));
          return <button key={href} className={active ? 'active' : ''} onClick={() => navigate(href)}><Icon /><span>{label}</span></button>;
        })}
      </nav>
    </div>
  );
}
