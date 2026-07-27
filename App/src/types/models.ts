export type UserRole = 'PARENT' | 'STUDENT';

export type User = {
  id: string;
  name: string;
  role: UserRole;
  email: string;
};

export type SchoolClass = {
  id: string;
  name: string;
  section?: string;
  teacher?: { firstName: string; lastName: string };
};

export type ExamResult = {
  id?: string;
  marks: number;
  grade?: string;
  exam: {
    id?: string;
    name?: string;
    subject: string;
    totalMarks: number;
    date: string;
  };
};

export type Child = {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  class?: SchoolClass;
  attendance: { marked: number; attended: number; percentage: number };
  fees: { billed: number; paid: number; outstanding: number };
  recentResults: ExamResult[];
};

export type AttendanceRecord = {
  id: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  note?: string;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  category: string;
  priority: string;
  publishedAt: string;
  attachmentUrl?: string;
  isRead: boolean;
};
