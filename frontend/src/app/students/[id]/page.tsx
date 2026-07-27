import { AppShell } from '@/components/app-shell';
import { StudentProfile } from '@/components/student-profile';

export default async function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell><StudentProfile studentId={id} /></AppShell>;
}
