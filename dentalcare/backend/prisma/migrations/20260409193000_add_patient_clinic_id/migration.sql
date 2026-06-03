ALTER TABLE "Patient" ADD COLUMN "clinicId" TEXT;

CREATE INDEX IF NOT EXISTS "Patient_clinicId_idx" ON "Patient"("clinicId");

-- Backfill legacy single-clinic installs so existing rows participate in clinic-scoped limits.
UPDATE "Patient"
SET "clinicId" = (
  SELECT "clinicId"
  FROM "User"
  WHERE "clinicId" IS NOT NULL
    AND "clinicId" <> ''
  LIMIT 1
)
WHERE "clinicId" IS NULL;
