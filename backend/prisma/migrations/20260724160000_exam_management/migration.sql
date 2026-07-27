ALTER TABLE "Exam"
  ADD COLUMN "seriesCode" TEXT,
  ADD COLUMN "academicYear" TEXT NOT NULL DEFAULT '2026-27',
  ADD COLUMN "examType" TEXT NOT NULL DEFAULT 'CLASS_TEST',
  ADD COLUMN "componentType" TEXT NOT NULL DEFAULT 'THEORY',
  ADD COLUMN "startTime" TEXT,
  ADD COLUMN "endTime" TEXT,
  ADD COLUMN "room" TEXT,
  ADD COLUMN "passingMarks" INTEGER NOT NULL DEFAULT 33,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "instructions" TEXT,
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Exam_academicYear_status_date_idx" ON "Exam"("academicYear", "status", "date");
CREATE INDEX "Exam_seriesCode_idx" ON "Exam"("seriesCode");
