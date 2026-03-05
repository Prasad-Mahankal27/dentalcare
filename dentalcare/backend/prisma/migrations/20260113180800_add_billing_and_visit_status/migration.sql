/*
  Warnings:

  - You are about to drop the column `status` on the `Visit` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "Billing" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "billId" TEXT NOT NULL,
    "visitId" INTEGER NOT NULL,
    "previousPending" REAL NOT NULL DEFAULT 0,
    "currentCharges" REAL NOT NULL,
    "discount" REAL NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL,
    "paidAmount" REAL NOT NULL,
    "pendingAmount" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Billing_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Visit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "visitId" TEXT NOT NULL,
    "patientId" INTEGER NOT NULL,
    "doctorId" INTEGER NOT NULL,
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
INSERT INTO "new_Visit" ("createdAt", "diagnosis", "doctorId", "followUpAdvice", "id", "labTests", "medicines", "observations", "patientId", "procedures", "symptoms", "treatmentPlan", "updatedAt", "visitId") SELECT "createdAt", "diagnosis", "doctorId", "followUpAdvice", "id", "labTests", "medicines", "observations", "patientId", "procedures", "symptoms", "treatmentPlan", "updatedAt", "visitId" FROM "Visit";
DROP TABLE "Visit";
ALTER TABLE "new_Visit" RENAME TO "Visit";
CREATE UNIQUE INDEX "Visit_visitId_key" ON "Visit"("visitId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Billing_billId_key" ON "Billing"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "Billing_visitId_key" ON "Billing"("visitId");
