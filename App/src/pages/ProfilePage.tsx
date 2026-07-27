import { Bell, ChevronRight, LogOut, ReceiptIndianRupee, UsersRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Avatar } from '../components/ui/Avatar';
import { useApp } from '../context/AppContext';

export default function ProfilePage() {
  const { user, child, logout } = useApp();
  const navigate = useNavigate();
  return (
    <AppShell title="Profile">
      <section className="profile-card"><Avatar name={user?.name || 'Parent'} /><h2>{user?.name}</h2><p>{user?.role === 'PARENT' ? 'Guardian account' : 'Student account'}</p></section>
      <div className="profile-list"><button onClick={() => navigate('/children')}><UsersRound /> Linked students <ChevronRight /></button><button onClick={() => navigate('/updates')}><Bell /> Communications <ChevronRight /></button><button onClick={() => navigate('/fees')}><ReceiptIndianRupee /> Fee account <ChevronRight /></button><button className="logout" onClick={() => { logout(); navigate('/login'); }}><LogOut /> Sign out</button></div>
      {child ? <p className="account-note">Currently viewing {child.firstName} {child.lastName} · {child.admissionNo}</p> : null}
    </AppShell>
  );
}
