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

export type TransportVehicle = {
  id: string;
  vehicleNo: string;
  registrationNo: string;
  type: string;
  driverName: string;
  driverPhone: string;
  attendantName?: string;
  attendantPhone?: string;
  status: string;
};

export type TransportStop = {
  id: string;
  name: string;
  pickupTime?: string;
  dropTime?: string;
  landmark?: string;
};

export type TransportAssignment = {
  id: string;
  status: string;
  effectiveFrom: string;
  notes?: string;
  stop?: TransportStop;
  route: {
    id: string;
    code: string;
    name: string;
    morningStart?: string;
    afternoonStart?: string;
    status: string;
    vehicle?: TransportVehicle;
  };
};

export type TransportStudent = {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  transportAssignment?: TransportAssignment | null;
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
