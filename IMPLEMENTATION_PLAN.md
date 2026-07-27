# GD School Management System — Client Scope & Execution Plan

This document converts the client brief into an executable product scope. Status values are `Done`, `In progress`, and `Planned`.

## Product foundations

| Capability | Status | Delivery definition |
|---|---|---|
| Secure authentication | Done | HTTP-only JWT session, login/logout, expiry validation, protected routes |
| Role-based access control | In progress | Principal/Admin, Teacher, Parent, Student, Accountant, Librarian; UI and API enforcement |
| Role-aware navigation and dashboards | In progress | Each role sees only relevant metrics, actions, modules, and records |
| Audit logging | Planned | Login, create/update/delete, permission changes, exports, payments, circulation |
| Notifications and announcements | Planned | Recipient targeting, read state, priority, publishing and expiry |
| File and document metadata | Planned | Lesson plans, homework, submissions, resources, circulars, report cards, receipts |
| Search, filters, pagination and exports | Planned | Consistent query behavior for all high-volume directories |
| Approval workflows | Planned | Admissions, leave, concessions, timetable, expenses and data exports |

## Principal / Super Admin portal

- Executive overview: enrollment, student/staff attendance, fee collection, approvals.
- Staff directory for teaching and non-teaching employees.
- HR: payroll profiles, leave requests, substitute assignments, performance evaluations.
- Admissions: inquiries, applications, entrance assessment, review, admission and rejection.
- Finance control: fee structures, invoices, concessions, scholarships, payment ledger, reconciliation.
- Academic planning: master timetable, exams, calendar, curriculum and syllabus completion.
- Compliance: user activity, permission changes, exports and audit reports.
- School structure: classes, sections, classrooms, laboratories and custom rooms.

## Teacher portal

- Section-wise digital attendance with absent/late/excused status.
- Gradebook with assessment types, weighting, scores, feedback and term grades.
- Report card generation data.
- Lesson plans, class notes, attachments and syllabus completion.
- Behavioral, participation, discipline and achievement notes.
- Homework creation, due dates, digital submissions and batch grading.
- Parent/admin messaging and announcements.
- Teacher-specific timetable, classes, students and pending work.

## Parent portal

- One account linked to one or more children, with a child switcher.
- Child attendance, timetable and daily status.
- Grades, feedback, report cards and progress history.
- Fee invoices, partial/full payments, receipts, history and due dates.
- Events, circulars, exams, holidays, PTMs and permission responses.
- Teacher messaging and formal child leave requests.

## Student portal

- Daily class schedule, exams and assignment deadlines.
- Learning resources, lecture notes, reading and project guidelines.
- Grades, attendance, feedback and progress tracking.
- Homework submissions and teacher feedback.
- Clubs, sports, activities, events and sign-up status.

## Accountant portal

- Fee structures, scheduled invoice generation and late penalties.
- Partial payments, concessions, scholarships and receipts.
- Expenses, categories, approvals, vendors, bills and payouts.
- Payroll runs using attendance/leave, deductions and bonuses.
- Financial statements: income/expense summary, P&L, cash flow and collection reports.
- Audit-ready transaction ledger and reconciliation.

## Librarian portal

- Book/media catalog with ISBN, author, subject, publisher, copies and shelf.
- Member-aware circulation: issue, return and renew by student/staff ID.
- Due dates, availability and circulation history.
- Automatic overdue status and fines linked to the student ledger.

## Cross-module relational model

- `User` is the authentication identity and owns one role.
- `Student`, `Employee`, and `ParentProfile` connect domain records to identities.
- `ParentStudent` supports multi-child families and multiple guardians.
- Academic hierarchy: `SchoolClass` (section) → timetable, curriculum, attendance, assignments, exams.
- Finance hierarchy: fee structure → invoice → invoice items → payments/receipts → ledger entries.
- Library fines create finance ledger entries without duplicating payment truth.
- All sensitive mutations create immutable audit events.

## Delivery phases

1. Platform/RBAC and expanded relational schema.
2. Six role portals and role-safe navigation.
3. Admissions, HR, academics and communication workflows.
4. Finance, payroll and reporting workflows.
5. Library catalog/circulation/fines.
6. End-to-end testing, exports, accessibility, security and deployment readiness.

## External services requiring owner configuration

- Online payment provider and webhook credentials.
- Email/SMS/WhatsApp provider for absence alerts and notifications.
- Object storage for uploaded resources, submissions, receipts and report cards.
- Barcode/ID scanner hardware behavior (implemented as keyboard-compatible input by default).
