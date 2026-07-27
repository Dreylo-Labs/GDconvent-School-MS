export type UserRole = 'ADMIN' | 'TEACHER' | 'PARENT' | 'STUDENT' | 'ACCOUNTANT' | 'LIBRARIAN';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export const roleLabels: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  TEACHER: 'Teacher',
  PARENT: 'Parent',
  STUDENT: 'Student',
  ACCOUNTANT: 'Accountant',
  LIBRARIAN: 'Librarian',
};
