# GD School Management System

A complete school management platform with separate CRM frontend, backend API, and parent/student mobile application.

## Stack

- Frontend: Next.js App Router, React, TypeScript, Recharts
- Backend: Node.js, Express, TypeScript, Prisma
- Parent/student app: React, Vite, TypeScript, Capacitor
- Database: PostgreSQL (Neon-compatible)
- Security: JWT authentication, bcrypt password hashing, Helmet, CORS, Zod validation

## Included modules

- Dashboard and school-wide metrics
- Students and guardian records
- Teachers and class assignments
- Classes and sections
- Custom rooms and facilities, including classrooms, laboratories, medical rooms, libraries, offices, and user-defined room types
- Daily attendance
- Fee invoices and collections
- Exams and results
- Role-ready users (`ADMIN`, `TEACHER`, `ACCOUNTANT`)
- Six protected portals: Principal/Admin, Teacher, Parent, Student, Accountant, and Librarian
- Timetable, staff attendance and leave management
- Student leave requests
- Transport vehicles, routes, stops and assignments
- Circulars, announcements and communication
- Audit logs with category and date filters
- Report-card and fee-invoice PDF generation

## Local setup

1. Copy environment templates:

   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.local.example frontend/.env.local
   ```

2. Put your PostgreSQL URL and a strong `JWT_SECRET` in `backend/.env`.
3. Install dependencies:

   ```bash
   npm run install:all
   ```

4. Create the database and seed demo data:

   ```bash
   npm run db:migrate --prefix backend -- --name init
   npm run db:seed --prefix backend
   ```

5. Start both apps:

   ```bash
   npm run dev
   ```

- Frontend: http://localhost:3000
- Parent/student app: http://localhost:5173
- API: http://localhost:4000/api
- Health check: http://localhost:4000/api/health
- Administrator: `admin@gdschool.edu` / `Admin@123`
- Teacher: `teacher@gdschool.edu` / `Teacher@123`
- Accountant: `accounts@gdschool.edu` / `Accounts@123`
- Parent: `parent@gdschool.edu` / `Parent@123`
- Student: `student@gdschool.edu` / `Student@123`
- Librarian: `library@gdschool.edu` / `Library@123`

CRM staff authenticate with email and password. Parents and students use mobile/admission-number OTP login; development uses OTP `111111` until an SMS or WhatsApp provider is configured. Both clients use backend-signed JWT sessions, protected routes, and independent backend role authorization.

## Parent and student app

The application in `App/` is a responsive React application packaged for Android and iOS using Capacitor—without Expo or React Native.

```bash
npm run dev --prefix App
npm run cap:sync --prefix App
```

Before a native production build, set `VITE_API_URL` to the public HTTPS API URL. Android and iOS projects are available under `App/android` and `App/ios`.

## API overview

- `POST /api/auth/login`
- `POST /api/auth/otp/request`
- `POST /api/auth/otp/verify`
- `GET /api/parents/me/children`
- `GET|POST /api/students`
- `GET|PUT|DELETE /api/students/:id`
- `GET /api/teachers`
- `GET /api/classes`
- `POST /api/classes` (create one or several sections)
- `PUT|DELETE /api/classes/:id`
- `GET|POST /api/rooms`
- `PUT|DELETE /api/rooms/:id`
- `POST /api/attendance`
- `GET /api/fees`
- `GET /api/exams`
- `GET /api/dashboard`
- `GET /api/modules/overview`
- `GET|POST /api/modules/employees`
- `GET|POST /api/modules/library/books`
- `GET|POST /api/modules/library/loans`
- `GET|POST /api/modules/communications`
- `GET /api/modules/audit`

All routes except login, OTP request/verification, and health require `Authorization: Bearer <token>`.

## Production checklist

- Rotate any database password shared outside your secret manager.
- Replace demo credentials and use a randomly generated JWT secret.
- Add object storage for student documents and receipts.
- Add audit logs, backups, rate limiting, and automated tests before production use.
- Configure a payment gateway and webhook secrets before enabling real parent fee payments.
- Configure email/SMS/WhatsApp delivery and object storage before enabling external notifications and file uploads.
- Replace demo passwords and rotate the database credential that was shared in chat.
