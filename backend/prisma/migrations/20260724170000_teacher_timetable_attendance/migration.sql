ALTER TABLE "TimetableEntry" ADD COLUMN "teacherId" TEXT;

CREATE TABLE "TeacherAttendance" (
  "id" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL,
  "checkIn" TEXT,
  "checkOut" TEXT,
  "note" TEXT,
  "markedById" TEXT,
  "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeacherAttendance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeacherLeaveRequest" (
  "id" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "type" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeacherLeaveRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TimetableEntry_teacherId_dayOfWeek_period_idx" ON "TimetableEntry"("teacherId", "dayOfWeek", "period");
CREATE UNIQUE INDEX "TeacherAttendance_teacherId_date_key" ON "TeacherAttendance"("teacherId", "date");
CREATE INDEX "TeacherAttendance_date_status_idx" ON "TeacherAttendance"("date", "status");
CREATE INDEX "TeacherLeaveRequest_teacherId_status_idx" ON "TeacherLeaveRequest"("teacherId", "status");
CREATE INDEX "TeacherLeaveRequest_startDate_endDate_idx" ON "TeacherLeaveRequest"("startDate", "endDate");

ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TeacherAttendance" ADD CONSTRAINT "TeacherAttendance_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherLeaveRequest" ADD CONSTRAINT "TeacherLeaveRequest_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "TimetableEntry" AS entry
SET "teacherId" = teacher."id"
FROM "Teacher" AS teacher
WHERE entry."teacherName" = CONCAT(teacher."firstName", ' ', teacher."lastName");
