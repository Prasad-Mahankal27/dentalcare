import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const appRoot = path.resolve(__dirname, '..')
const backendDir = path.join(appRoot, 'backend')
const backendPrismaDir = path.join(appRoot, 'backend', 'prisma')
const schemaPath = path.join(backendPrismaDir, 'schema.prisma')
const targetDbPath = path.join(backendPrismaDir, 'build.db')
const prismaBinPath = process.platform === 'win32'
  ? path.join(backendDir, 'node_modules', '.bin', 'prisma.cmd')
  : path.join(backendDir, 'node_modules', '.bin', 'prisma')
const sqliteBinPath = 'sqlite3'

function fail(message) {
  throw new Error(`[prepare-backend-db] ${message}`)
}

function toSqliteUrl(filePath) {
  const normalized = filePath.replace(/\\/g, '/')
  return process.platform === 'win32' ? `file:/${normalized}` : `file:${normalized}`
}

function createSqliteBuildDatabase() {
  const schemaSql = `
PRAGMA foreign_keys=OFF;

CREATE TABLE "User" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "password" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "clinicId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Patient" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "patientId" TEXT NOT NULL,
  "clinicId" TEXT,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "age" INTEGER,
  "gender" TEXT,
  "address" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Visit" (
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

CREATE TABLE "Appointment" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "appointmentId" TEXT NOT NULL,
  "patientId" INTEGER,
  "doctorId" INTEGER,
  "patientPhone" TEXT NOT NULL,
  "patientName" TEXT,
  "patientAge" INTEGER,
  "patientGender" TEXT,
  "patientAddress" TEXT,
  "scheduledAt" DATETIME NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "source" TEXT NOT NULL DEFAULT 'FRONT_DESK',
  "linkedVisitId" TEXT,
  "reason" TEXT,
  "whatsappMessageId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Appointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Appointment_linkedVisitId_fkey" FOREIGN KEY ("linkedVisitId") REFERENCES "Visit" ("visitId") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Billing" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "billId" TEXT NOT NULL,
  "visitId" INTEGER NOT NULL,
  "previousPending" REAL NOT NULL DEFAULT 0,
  "pendingCleared" REAL NOT NULL DEFAULT 0,
  "updatedPending" REAL NOT NULL,
  "currentCharges" REAL NOT NULL,
  "discount" REAL NOT NULL DEFAULT 0,
  "totalAmount" REAL NOT NULL,
  "paidAmount" REAL NOT NULL,
  "pendingAmount" REAL NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Billing_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "SyncOutbox" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "entity" TEXT NOT NULL,
  "recordKey" TEXT NOT NULL,
  "operation" TEXT NOT NULL DEFAULT 'UPSERT',
  "payload" TEXT,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" DATETIME,
  "lastError" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "SyncState" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_clinicId_idx" ON "User"("clinicId");
CREATE UNIQUE INDEX "Patient_patientId_key" ON "Patient"("patientId");
CREATE INDEX "Patient_clinicId_idx" ON "Patient"("clinicId");
CREATE UNIQUE INDEX "Visit_visitId_key" ON "Visit"("visitId");
CREATE UNIQUE INDEX "Appointment_appointmentId_key" ON "Appointment"("appointmentId");
CREATE UNIQUE INDEX "Appointment_linkedVisitId_key" ON "Appointment"("linkedVisitId");
CREATE INDEX "Appointment_scheduledAt_idx" ON "Appointment"("scheduledAt");
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");
CREATE INDEX "Appointment_doctorId_scheduledAt_idx" ON "Appointment"("doctorId", "scheduledAt");
CREATE INDEX "Appointment_patientPhone_createdAt_idx" ON "Appointment"("patientPhone", "createdAt");
CREATE UNIQUE INDEX "Billing_billId_key" ON "Billing"("billId");
CREATE UNIQUE INDEX "Billing_visitId_key" ON "Billing"("visitId");
CREATE UNIQUE INDEX "SyncOutbox_entity_recordKey_key" ON "SyncOutbox"("entity", "recordKey");
CREATE INDEX "SyncOutbox_nextRetryAt_idx" ON "SyncOutbox"("nextRetryAt");

PRAGMA foreign_keys=ON;
`

  const sqlite = spawnSync(sqliteBinPath, [targetDbPath], {
    cwd: backendDir,
    input: schemaSql,
    encoding: 'utf-8',
  })

  if (sqlite.status !== 0) {
    const errorOutput = sqlite.stderr?.trim() || sqlite.stdout?.trim() || 'Unknown sqlite error'
    fail(`SQLite fallback failed to create build database. ${errorOutput}`)
  }
}

function main() {
  if (!fs.existsSync(schemaPath)) {
    fail(`Prisma schema not found: ${schemaPath}`)
  }

  if (!fs.existsSync(prismaBinPath)) {
    fail(`Prisma CLI not found at ${prismaBinPath}. Run npm install in dentalcare/backend first.`)
  }

  fs.mkdirSync(backendPrismaDir, { recursive: true })

  if (fs.existsSync(targetDbPath)) {
    fs.rmSync(targetDbPath)
  }

  const dbPush = spawnSync(prismaBinPath, ['db', 'push', '--schema', schemaPath, '--skip-generate'], {
    cwd: backendDir,
    env: {
      ...process.env,
      DATABASE_URL: toSqliteUrl(targetDbPath),
    },
    encoding: 'utf-8',
  })

  if (dbPush.status !== 0) {
    const errorOutput = dbPush.stderr?.trim() || dbPush.stdout?.trim() || 'Unknown prisma error'
    console.warn(`[prepare-backend-db] Prisma db push failed; using SQLite fallback. ${errorOutput}`)
    if (fs.existsSync(targetDbPath)) {
      fs.rmSync(targetDbPath)
    }
    createSqliteBuildDatabase()
  }

  if (!fs.existsSync(targetDbPath)) {
    fail(`Build database was not created: ${targetDbPath}`)
  }

  const size = fs.statSync(targetDbPath).size
  console.log(`[prepare-backend-db] Created clean build database at ${targetDbPath} (${size} bytes)`)
}

main()
