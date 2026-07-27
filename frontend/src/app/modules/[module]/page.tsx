import { AppShell } from '@/components/app-shell';
import { ModuleWorkspace } from '@/components/module-workspace';
import { redirect } from 'next/navigation';

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (module === 'gradebook' || module === 'lessons' || module === 'academics') redirect('/exams');
  if (module === 'timetable') redirect('/timetable');
  if (module === 'audit') redirect('/audit');
  if (module === 'assignments') redirect('/exams');
  if (module === 'admissions') redirect('/students');
  if (module === 'communication') redirect('/communications');
  if (module === 'hr') redirect('/staff-attendance');
  if (module === 'reports') redirect('/fees');
  if (module === 'events') redirect('/communications');
  if (module === 'progress') redirect('/exams');
  if (module === 'children') redirect('/');
  if (module === 'clubs') redirect('/');
  if (module === 'finance' || module === 'payroll') redirect('/fees');
  return <AppShell><ModuleWorkspace module={module} /></AppShell>;
}
