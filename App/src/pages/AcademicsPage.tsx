import { BusFront, CalendarDays, ChevronRight, Clock3, GraduationCap, Stethoscope } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';

const modules = [
  ['Attendance', 'Monthly attendance and daily history', CalendarDays, '/attendance'],
  ['Exams & results', 'Schedules, marks and report cards', GraduationCap, '/exams'],
  ['Timetable', 'Daily classes and teachers', Clock3, '/timetable'],
  ['Apply leave', 'Submit and track leave requests', Stethoscope, '/leave'],
  ['School transport', 'Bus, route, stop and driver details', BusFront, '/transport'],
] as const;

export default function AcademicsPage() {
  const navigate = useNavigate();
  return <AppShell title="Academics">{modules.map(([title, text, Icon, href]) => <button className="module-card" key={href} onClick={() => navigate(href)}><span><Icon /></span><div><h3>{title}</h3><p>{text}</p></div><ChevronRight /></button>)}</AppShell>;
}
