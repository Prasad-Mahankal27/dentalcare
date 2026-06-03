ALTER TABLE "User" ADD COLUMN "clinicId" TEXT;

CREATE INDEX IF NOT EXISTS "User_clinicId_idx" ON "User"("clinicId");
