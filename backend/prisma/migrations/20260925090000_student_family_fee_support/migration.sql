ALTER TABLE "Student"
  ADD COLUMN "fatherName" TEXT,
  ADD COLUMN "fatherPhone" TEXT,
  ADD COLUMN "motherName" TEXT,
  ADD COLUMN "motherPhone" TEXT,
  ADD COLUMN "feeExempt" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "feeExemptReason" TEXT,
  ADD COLUMN "feeExemptFrom" TIMESTAMP(3),
  ADD COLUMN "feeExemptTo" TIMESTAMP(3);

UPDATE "Student"
SET "fatherName" = "guardianName", "fatherPhone" = "guardianPhone"
WHERE "fatherName" IS NULL;

CREATE TABLE "StudentScholarship" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "value" DECIMAL(12,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentScholarship_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FamilyFeePlan" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "academicYear" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "frequency" TEXT NOT NULL DEFAULT 'SEMESTERLY',
  "dueDay" INTEGER NOT NULL DEFAULT 10,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "reason" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "billingStudentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FamilyFeePlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FamilyFeePlanMember" (
  "familyFeePlanId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FamilyFeePlanMember_pkey" PRIMARY KEY ("familyFeePlanId", "studentId")
);

ALTER TABLE "Fee" ADD COLUMN "familyFeePlanId" TEXT;
ALTER TABLE "FeeConcession" ADD COLUMN "scholarshipId" TEXT;

CREATE INDEX "StudentScholarship_studentId_isActive_startsAt_endsAt_idx" ON "StudentScholarship"("studentId", "isActive", "startsAt", "endsAt");
CREATE INDEX "FamilyFeePlan_academicYear_isActive_startsAt_endsAt_idx" ON "FamilyFeePlan"("academicYear", "isActive", "startsAt", "endsAt");
CREATE INDEX "FamilyFeePlan_billingStudentId_idx" ON "FamilyFeePlan"("billingStudentId");
CREATE INDEX "FamilyFeePlanMember_studentId_idx" ON "FamilyFeePlanMember"("studentId");
CREATE UNIQUE INDEX "Fee_studentId_familyFeePlanId_billingPeriod_key" ON "Fee"("studentId", "familyFeePlanId", "billingPeriod");
CREATE UNIQUE INDEX "FeeConcession_feeId_scholarshipId_key" ON "FeeConcession"("feeId", "scholarshipId");

ALTER TABLE "StudentScholarship" ADD CONSTRAINT "StudentScholarship_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FamilyFeePlan" ADD CONSTRAINT "FamilyFeePlan_billingStudentId_fkey" FOREIGN KEY ("billingStudentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FamilyFeePlanMember" ADD CONSTRAINT "FamilyFeePlanMember_familyFeePlanId_fkey" FOREIGN KEY ("familyFeePlanId") REFERENCES "FamilyFeePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FamilyFeePlanMember" ADD CONSTRAINT "FamilyFeePlanMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_familyFeePlanId_fkey" FOREIGN KEY ("familyFeePlanId") REFERENCES "FamilyFeePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeeConcession" ADD CONSTRAINT "FeeConcession_scholarshipId_fkey" FOREIGN KEY ("scholarshipId") REFERENCES "StudentScholarship"("id") ON DELETE SET NULL ON UPDATE CASCADE;
