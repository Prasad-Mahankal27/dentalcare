-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Visit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "visitId" TEXT NOT NULL,
    "patientId" INTEGER NOT NULL,
    "doctorId" INTEGER NOT NULL,
    "visitType" TEXT NOT NULL DEFAULT 'NEW',
    "caseOutcome" TEXT NOT NULL DEFAULT 'ONGOING',
    "symptoms" TEXT,
    "diagnosis" TEXT,
    "observations" TEXT,
    "treatmentPlan" TEXT,
    "procedures" TEXT,
    "followUpAdvice" TEXT,
    "medicines" TEXT,
    "labTests" TEXT,
    "clinicalStatus" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "paymentStatus" TEXT NOT NULL DEFAULT 'NOT_BILLED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Visit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Visit_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Visit" ("clinicalStatus", "createdAt", "diagnosis", "doctorId", "followUpAdvice", "id", "labTests", "medicines", "observations", "patientId", "paymentStatus", "procedures", "symptoms", "treatmentPlan", "updatedAt", "visitId") SELECT "clinicalStatus", "createdAt", "diagnosis", "doctorId", "followUpAdvice", "id", "labTests", "medicines", "observations", "patientId", "paymentStatus", "procedures", "symptoms", "treatmentPlan", "updatedAt", "visitId" FROM "Visit";
DROP TABLE "Visit";
ALTER TABLE "new_Visit" RENAME TO "Visit";
CREATE UNIQUE INDEX "Visit_visitId_key" ON "Visit"("visitId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
