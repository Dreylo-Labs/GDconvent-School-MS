ALTER TABLE "FeeStructure"
  ADD COLUMN IF NOT EXISTS "code" TEXT,
  ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'TUITION',
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "dueDay" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "chargeOnAdmission" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Fee"
  ADD COLUMN IF NOT EXISTS "feeStructureId" TEXT,
  ADD COLUMN IF NOT EXISTS "billingPeriod" TEXT;

CREATE INDEX IF NOT EXISTS "FeeStructure_className_academicYear_isActive_idx"
  ON "FeeStructure"("className", "academicYear", "isActive");

CREATE UNIQUE INDEX IF NOT EXISTS "Fee_studentId_feeStructureId_billingPeriod_key"
  ON "Fee"("studentId", "feeStructureId", "billingPeriod");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Fee_feeStructureId_fkey'
  ) THEN
    ALTER TABLE "Fee"
      ADD CONSTRAINT "Fee_feeStructureId_fkey"
      FOREIGN KEY ("feeStructureId") REFERENCES "FeeStructure"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
