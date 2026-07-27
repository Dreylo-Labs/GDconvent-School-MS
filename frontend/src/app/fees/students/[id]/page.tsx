import { AppShell } from '@/components/app-shell';
import { StudentFeeAccount } from '@/components/student-fee-account';

export default async function StudentFeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell><StudentFeeAccount studentId={id} /></AppShell>;
}
