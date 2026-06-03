ALTER TABLE "User" ADD COLUMN "email" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
