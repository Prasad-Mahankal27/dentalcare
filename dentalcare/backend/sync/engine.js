const os = require("node:os");

const { loadEnv } = require("../config/loadEnv");
loadEnv();

const { createClient } = require("@supabase/supabase-js");

const { prisma } = require("../db/prisma");
const { runWithSyncSuppressed } = require("./context");
const { publishMutation } = require("./publisher");
const {
  getStoredClinicContext,
  setStoredClinicContext
} = require("./clinicContext");
const appEmitter = require("../utils/emitter");

const SYNC_TABLE = "clinic_sync_records";
const CURSOR_STATE_KEY = "supabase_pull_cursor_v1";
const ENTITY_APPLY_ORDER = ["users", "patients", "visits", "appointments", "billings"];

let intervalHandle = null;
let syncInProgress = false;
let lastSyncAt = null;
let lastSyncError = null;
let lastPushCount = 0;
let lastPullCount = 0;

function isFalseLike(value) {
  return ["0", "false", "no", "off"].includes(String(value || "").trim().toLowerCase());
}

function parsePositiveInt(rawValue, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < min || value > max) {
    return fallback;
  }
  return value;
}

function loadSyncConfig() {
  const syncEnabledFlag = process.env.SYNC_ENABLED;
  const explicitDisable = isFalseLike(syncEnabledFlag);

  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const enabled = !explicitDisable && Boolean(supabaseUrl) && Boolean(serviceRoleKey);

  return {
    enabled,
    supabaseUrl,
    serviceRoleKey,
    defaultClinicId: String(process.env.SYNC_CLINIC_ID || "").trim(),
    deviceId: String(process.env.SYNC_DEVICE_ID || `${os.hostname()}-${process.pid}`),
    intervalMs: parsePositiveInt(process.env.SYNC_INTERVAL_MS, 5000, 1000, 60000),
    batchSize: parsePositiveInt(process.env.SYNC_BATCH_SIZE, 50, 1, 500)
  };
}

const syncConfig = loadSyncConfig();
const supabase = syncConfig.enabled
  ? createClient(syncConfig.supabaseUrl, syncConfig.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

let runtimeClinicContext = {
  clinicId: syncConfig.defaultClinicId || null,
  clinicName: null
};

async function ensureClinicContext() {
  if (runtimeClinicContext.clinicId) {
    return runtimeClinicContext;
  }

  const stored = await getStoredClinicContext(prisma);
  if (stored.clinicId) {
    runtimeClinicContext = {
      clinicId: stored.clinicId,
      clinicName: stored.clinicName || null
    };
  }

  return runtimeClinicContext;
}

async function setActiveClinicContext(context, options = {}) {
  const stored = await setStoredClinicContext(prisma, context, options);
  runtimeClinicContext = {
    clinicId: stored.clinicId,
    clinicName: stored.clinicName || null
  };
  return runtimeClinicContext;
}

async function getActiveClinicContext() {
  return ensureClinicContext();
}

function safeDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function normalizeRole(roleValue) {
  const role = String(roleValue || "").toUpperCase();
  if (["ADMIN", "DOCTOR", "RECEPTIONIST"].includes(role)) {
    return role;
  }
  return "RECEPTIONIST";
}

function normalizeVisitType(value) {
  return value === "FOLLOW_UP" ? "FOLLOW_UP" : "NEW";
}

function normalizeCaseOutcome(value) {
  return value === "COMPLETED" ? "COMPLETED" : "ONGOING";
}

function normalizeClinicalStatus(value) {
  return value === "CLINICALLY_COMPLETED" ? "CLINICALLY_COMPLETED" : "IN_PROGRESS";
}

function normalizePaymentStatus(value) {
  if (["NOT_BILLED", "PARTIALLY_PAID", "PAID"].includes(value)) {
    return value;
  }
  return "NOT_BILLED";
}

function normalizeAppointmentStatus(value) {
  if (["REQUESTED", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"].includes(value)) {
    return value;
  }
  return "REQUESTED";
}

function normalizeAppointmentSource(value) {
  if (["WHATSAPP", "FRONT_DESK", "PHONE", "WALK_IN"].includes(value)) {
    return value;
  }
  return "FRONT_DESK";
}

function normalizePhone(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseJsonPayload(rawPayload) {
  if (!rawPayload) {
    return null;
  }

  if (typeof rawPayload === "object") {
    return rawPayload;
  }

  try {
    return JSON.parse(rawPayload);
  } catch {
    return null;
  }
}

async function getSyncCursor() {
  const row = await prisma.syncState.findUnique({
    where: { key: CURSOR_STATE_KEY },
    select: { value: true }
  });
  return row?.value || null;
}

async function setSyncCursor(value) {
  if (!value) {
    return;
  }

  await prisma.syncState.upsert({
    where: { key: CURSOR_STATE_KEY },
    update: { value },
    create: {
      key: CURSOR_STATE_KEY,
      value
    }
  });
}

async function markOutboxFailure(outboxId, attempts, error) {
  const boundedAttempts = attempts + 1;
  const delaySeconds = Math.min(300, Math.pow(2, Math.min(boundedAttempts, 8)));
  const nextRetryAt = new Date(Date.now() + delaySeconds * 1000);

  try {
    await prisma.syncOutbox.update({
      where: { id: outboxId },
      data: {
        attempts: boundedAttempts,
        lastError: String(error?.message || error || "Unknown sync error"),
        nextRetryAt
      }
    });
  } catch (err) {
    if (err?.code === "P2025") {
      return;
    }
    throw err;
  }
}

async function pushOutboxBatch() {
  const clinicContext = await ensureClinicContext();
  if (!clinicContext.clinicId) {
    return 0;
  }

  const now = new Date();

  const outboxItems = await prisma.syncOutbox.findMany({
    where: {
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }]
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: syncConfig.batchSize
  });

  let pushed = 0;

  for (const item of outboxItems) {
    try {
      const payload = parseJsonPayload(item.payload);

      const upsertPayload = {
        clinic_id: clinicContext.clinicId,
        entity: item.entity,
        record_key: item.recordKey,
        payload,
        is_deleted: item.deleted,
        source_device: syncConfig.deviceId,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from(SYNC_TABLE)
        .upsert(upsertPayload, { onConflict: "clinic_id,entity,record_key" });

      if (error) {
        throw error;
      }

      try {
        await prisma.syncOutbox.delete({ where: { id: item.id } });
      } catch (err) {
        if (err?.code !== "P2025") {
          throw err;
        }
      }
      pushed += 1;
    } catch (error) {
      console.error("Outbox push failed:", {
        id: item.id,
        entity: item.entity,
        recordKey: item.recordKey,
        error: error?.message || String(error)
      });
      await markOutboxFailure(item.id, item.attempts, error);
    }
  }

  return pushed;
}

async function ensureUserByPhone(userPayload) {
  const email = normalizeEmail(userPayload?.email || userPayload?.phone);
  const loginId = email || normalizePhone(userPayload?.phone);

  if (!loginId) {
    return null;
  }

  const role = normalizeRole(userPayload?.role);
  const name = String(userPayload?.name || loginId).trim() || loginId;
  const password = String(userPayload?.password || "SYNC_PLACEHOLDER");
  const clinicId = String(userPayload?.clinicId || "").trim() || null;

  return prisma.user.upsert({
    where: { phone: loginId },
    update: {
      email: email || null,
      phone: loginId,
      name,
      role,
      password,
      clinicId
    },
    create: {
      email: email || null,
      name,
      phone: loginId,
      role,
      password,
      clinicId,
      createdAt: safeDate(userPayload?.createdAt) || new Date()
    }
  });
}

async function ensurePatient(patientPayload) {
  const patientId = String(patientPayload?.patientId || "").trim();
  if (!patientId) {
    return null;
  }

  const name = String(patientPayload?.name || "Unknown Patient").trim() || "Unknown Patient";
  const phone = normalizePhone(patientPayload?.phone);

  return prisma.patient.upsert({
    where: { patientId },
    update: {
      name,
      phone,
      age: Number.isInteger(patientPayload?.age) ? patientPayload.age : null,
      gender: patientPayload?.gender ? String(patientPayload.gender) : null,
      address: patientPayload?.address ? String(patientPayload.address) : null
    },
    create: {
      patientId,
      name,
      phone,
      age: Number.isInteger(patientPayload?.age) ? patientPayload.age : null,
      gender: patientPayload?.gender ? String(patientPayload.gender) : null,
      address: patientPayload?.address ? String(patientPayload.address) : null,
      createdAt: safeDate(patientPayload?.createdAt) || new Date()
    }
  });
}

async function upsertUserFromRecord(payload) {
  return ensureUserByPhone(payload);
}

async function upsertPatientFromRecord(payload) {
  return ensurePatient(payload);
}

async function upsertVisitFromRecord(payload) {
  const visitId = String(payload?.visitId || "").trim();
  if (!visitId) {
    return;
  }

  const patient = await ensurePatient(payload?.patient || null);
  const doctor = await ensureUserByPhone(payload?.doctor || null);

  if (!patient || !doctor) {
    return;
  }

  await prisma.visit.upsert({
    where: { visitId },
    update: {
      patientId: patient.id,
      doctorId: doctor.id,
      visitType: normalizeVisitType(payload?.visitType),
      caseOutcome: normalizeCaseOutcome(payload?.caseOutcome),
      symptoms: payload?.symptoms ? String(payload.symptoms) : null,
      diagnosis: payload?.diagnosis ? String(payload.diagnosis) : null,
      observations: payload?.observations ? String(payload.observations) : null,
      treatmentPlan: payload?.treatmentPlan ? String(payload.treatmentPlan) : null,
      procedures: payload?.procedures ? String(payload.procedures) : null,
      followUpAdvice: payload?.followUpAdvice ? String(payload.followUpAdvice) : null,
      medicines: payload?.medicines ? String(payload.medicines) : null,
      labTests: payload?.labTests ? String(payload.labTests) : null,
      clinicalStatus: normalizeClinicalStatus(payload?.clinicalStatus),
      paymentStatus: normalizePaymentStatus(payload?.paymentStatus)
    },
    create: {
      visitId,
      patientId: patient.id,
      doctorId: doctor.id,
      visitType: normalizeVisitType(payload?.visitType),
      caseOutcome: normalizeCaseOutcome(payload?.caseOutcome),
      symptoms: payload?.symptoms ? String(payload.symptoms) : null,
      diagnosis: payload?.diagnosis ? String(payload.diagnosis) : null,
      observations: payload?.observations ? String(payload.observations) : null,
      treatmentPlan: payload?.treatmentPlan ? String(payload.treatmentPlan) : null,
      procedures: payload?.procedures ? String(payload.procedures) : null,
      followUpAdvice: payload?.followUpAdvice ? String(payload.followUpAdvice) : null,
      medicines: payload?.medicines ? String(payload.medicines) : null,
      labTests: payload?.labTests ? String(payload.labTests) : null,
      clinicalStatus: normalizeClinicalStatus(payload?.clinicalStatus),
      paymentStatus: normalizePaymentStatus(payload?.paymentStatus),
      createdAt: safeDate(payload?.createdAt) || new Date()
    }
  });
}

async function upsertAppointmentFromRecord(payload) {
  const appointmentId = String(payload?.appointmentId || "").trim();
  if (!appointmentId) {
    return;
  }

  const nestedPatient = payload?.patient || null;
  const nestedDoctor = payload?.doctor || null;

  const patient = await ensurePatient(nestedPatient);
  const doctor = await ensureUserByPhone(nestedDoctor);

  let linkedVisitId = payload?.linkedVisitId ? String(payload.linkedVisitId) : null;
  if (linkedVisitId) {
    const linkedVisit = await prisma.visit.findUnique({ where: { visitId: linkedVisitId } });
    if (!linkedVisit) {
      linkedVisitId = null;
    }
  }

  const scheduledAt = safeDate(payload?.scheduledAt) || new Date();

  await prisma.appointment.upsert({
    where: { appointmentId },
    update: {
      patientId: patient?.id || null,
      doctorId: doctor?.id || null,
      patientPhone: normalizePhone(payload?.patientPhone || nestedPatient?.phone || "UNKNOWN"),
      patientName: payload?.patientName ? String(payload.patientName) : null,
      patientAge: Number.isInteger(payload?.patientAge) ? payload.patientAge : null,
      patientGender: payload?.patientGender ? String(payload.patientGender) : null,
      patientAddress: payload?.patientAddress ? String(payload.patientAddress) : null,
      scheduledAt,
      status: normalizeAppointmentStatus(payload?.status),
      source: normalizeAppointmentSource(payload?.source),
      linkedVisitId,
      reason: payload?.reason ? String(payload.reason) : null,
      whatsappMessageId: payload?.whatsappMessageId ? String(payload.whatsappMessageId) : null
    },
    create: {
      appointmentId,
      patientId: patient?.id || null,
      doctorId: doctor?.id || null,
      patientPhone: normalizePhone(payload?.patientPhone || nestedPatient?.phone || "UNKNOWN"),
      patientName: payload?.patientName ? String(payload.patientName) : null,
      patientAge: Number.isInteger(payload?.patientAge) ? payload.patientAge : null,
      patientGender: payload?.patientGender ? String(payload.patientGender) : null,
      patientAddress: payload?.patientAddress ? String(payload.patientAddress) : null,
      scheduledAt,
      status: normalizeAppointmentStatus(payload?.status),
      source: normalizeAppointmentSource(payload?.source),
      linkedVisitId,
      reason: payload?.reason ? String(payload.reason) : null,
      whatsappMessageId: payload?.whatsappMessageId ? String(payload.whatsappMessageId) : null,
      createdAt: safeDate(payload?.createdAt) || new Date()
    }
  });
}

async function upsertBillingFromRecord(payload) {
  const billId = String(payload?.billId || "").trim();
  const visitBusinessId = String(payload?.visitId || "").trim();

  if (!billId || !visitBusinessId) {
    return;
  }

  const visit = await prisma.visit.findUnique({ where: { visitId: visitBusinessId } });
  if (!visit) {
    return;
  }

  const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  await prisma.billing.upsert({
    where: { billId },
    update: {
      visitId: visit.id,
      previousPending: toNumber(payload?.previousPending),
      pendingCleared: toNumber(payload?.pendingCleared),
      updatedPending: toNumber(payload?.updatedPending),
      currentCharges: toNumber(payload?.currentCharges),
      discount: toNumber(payload?.discount),
      totalAmount: toNumber(payload?.totalAmount),
      paidAmount: toNumber(payload?.paidAmount),
      pendingAmount: toNumber(payload?.pendingAmount)
    },
    create: {
      billId,
      visitId: visit.id,
      previousPending: toNumber(payload?.previousPending),
      pendingCleared: toNumber(payload?.pendingCleared),
      updatedPending: toNumber(payload?.updatedPending),
      currentCharges: toNumber(payload?.currentCharges),
      discount: toNumber(payload?.discount),
      totalAmount: toNumber(payload?.totalAmount),
      paidAmount: toNumber(payload?.paidAmount),
      pendingAmount: toNumber(payload?.pendingAmount),
      createdAt: safeDate(payload?.createdAt) || new Date()
    }
  });
}

async function applyDeleteRecord(entity, recordKey) {
  switch (entity) {
    case "appointments":
      await prisma.appointment.deleteMany({ where: { appointmentId: recordKey } });
      break;
    case "visits":
      await prisma.visit.deleteMany({ where: { visitId: recordKey } });
      break;
    case "billings":
      await prisma.billing.deleteMany({ where: { billId: recordKey } });
      break;
    default:
      break;
  }
}

async function applyUpsertRecord(entity, payload) {
  switch (entity) {
    case "users":
      await upsertUserFromRecord(payload);
      break;
    case "patients":
      await upsertPatientFromRecord(payload);
      break;
    case "visits":
      await upsertVisitFromRecord(payload);
      break;
    case "appointments":
      await upsertAppointmentFromRecord(payload);
      break;
    case "billings":
      await upsertBillingFromRecord(payload);
      break;
    default:
      break;
  }
}

async function pullRemoteBatch() {
  const clinicContext = await ensureClinicContext();
  if (!clinicContext.clinicId) {
    return 0;
  }

  const cursor = await getSyncCursor();

  let query = supabase
    .from(SYNC_TABLE)
    .select("clinic_id, entity, record_key, payload, is_deleted, updated_at, source_device")
    .eq("clinic_id", clinicContext.clinicId)
    .order("updated_at", { ascending: true })
    .limit(syncConfig.batchSize);

  if (cursor) {
    query = query.gt("updated_at", cursor);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  if (!Array.isArray(data) || !data.length) {
    return 0;
  }

  const filtered = data.filter((record) => record.source_device !== syncConfig.deviceId);
  if (!filtered.length) {
    await setSyncCursor(data[data.length - 1].updated_at);
    return 0;
  }

  await runWithSyncSuppressed(async () => {
    for (const entity of ENTITY_APPLY_ORDER) {
      const records = filtered.filter((record) => record.entity === entity);
      for (const record of records) {
        if (record.is_deleted) {
          await applyDeleteRecord(record.entity, record.record_key);
          continue;
        }

        await applyUpsertRecord(record.entity, record.payload);
      }
    }
  });

  const hasAppointmentChanges = filtered.some((record) => record.entity === "appointments");
  if (hasAppointmentChanges) {
    appEmitter.emit("appointments-changed", { action: "pull" });
  }

  await setSyncCursor(data[data.length - 1].updated_at);
  return filtered.length;
}

async function runSyncCycle() {
  if (!syncConfig.enabled || !supabase) {
    return {
      skipped: true,
      reason: "disabled",
      pushed: 0,
      pulled: 0,
      error: null
    };
  }

  if (syncInProgress) {
    return {
      skipped: true,
      reason: "in_progress",
      pushed: 0,
      pulled: 0,
      error: null
    };
  }

  syncInProgress = true;
  let pushed = 0;
  let pulled = 0;
  try {
    pushed = await pushOutboxBatch();
    pulled = await pullRemoteBatch();
    lastPushCount = pushed;
    lastPullCount = pulled;
    lastSyncAt = new Date().toISOString();
    lastSyncError = null;

    return {
      skipped: false,
      reason: null,
      pushed,
      pulled,
      error: null
    };
  } catch (error) {
    lastSyncError = String(error?.message || error || "Unknown sync error");
    console.error("Sync cycle failed:", error);

    return {
      skipped: false,
      reason: "error",
      pushed,
      pulled,
      error: lastSyncError
    };
  } finally {
    syncInProgress = false;
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runSyncCyclesUntilCaughtUp(options = {}) {
  const maxCycles = parsePositiveInt(options?.maxCycles, 25, 1, 500);
  const waitMs = parsePositiveInt(options?.waitMs, 200, 50, 2000);
  const maxSkipRetries = parsePositiveInt(options?.maxSkipRetries, 30, 1, 500);

  let cycles = 0;
  let skipRetries = 0;
  let totalPushed = 0;
  let totalPulled = 0;
  let lastResult = null;

  while (cycles < maxCycles) {
    const result = await runSyncCycle();
    lastResult = result;

    if (result?.skipped && result?.reason === "disabled") {
      return {
        cycles,
        totalPushed,
        totalPulled,
        disabled: true,
        timedOut: false,
        error: null
      };
    }

    if (result?.skipped && result?.reason === "in_progress") {
      skipRetries += 1;
      if (skipRetries >= maxSkipRetries) {
        return {
          cycles,
          totalPushed,
          totalPulled,
          disabled: false,
          timedOut: true,
          error: null
        };
      }

      await wait(waitMs);
      continue;
    }

    cycles += 1;
    skipRetries = 0;
    totalPushed += Number(result?.pushed || 0);
    totalPulled += Number(result?.pulled || 0);

    if (result?.error) {
      return {
        cycles,
        totalPushed,
        totalPulled,
        disabled: false,
        timedOut: false,
        error: result.error
      };
    }

    if (Number(result?.pulled || 0) === 0) {
      return {
        cycles,
        totalPushed,
        totalPulled,
        disabled: false,
        timedOut: false,
        error: null
      };
    }
  }

  return {
    cycles,
    totalPushed,
    totalPulled,
    disabled: false,
    timedOut: true,
    error: lastResult?.error || null
  };
}

async function enqueueFullBootstrapSync() {
  const [users, patients, visits, appointments, billings] = await Promise.all([
    prisma.user.findMany({ select: { id: true } }),
    prisma.patient.findMany({ select: { id: true } }),
    prisma.visit.findMany({ select: { id: true } }),
    prisma.appointment.findMany({ select: { id: true } }),
    prisma.billing.findMany({ select: { id: true } })
  ]);

  for (const row of users) {
    await publishMutation({ prisma, model: "User", action: "update", result: { id: row.id } });
  }
  for (const row of patients) {
    await publishMutation({ prisma, model: "Patient", action: "update", result: { id: row.id } });
  }
  for (const row of visits) {
    await publishMutation({ prisma, model: "Visit", action: "update", result: { id: row.id } });
  }
  for (const row of appointments) {
    await publishMutation({
      prisma,
      model: "Appointment",
      action: "update",
      result: { id: row.id }
    });
  }
  for (const row of billings) {
    await publishMutation({ prisma, model: "Billing", action: "update", result: { id: row.id } });
  }

  return {
    users: users.length,
    patients: patients.length,
    visits: visits.length,
    appointments: appointments.length,
    billings: billings.length
  };
}

function startSyncEngine() {
  if (!syncConfig.enabled || !supabase) {
    console.warn(
      "Supabase sync is disabled. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SYNC_ENABLED=true."
    );
    return;
  }

  if (intervalHandle) {
    return;
  }

  runSyncCycle().catch((error) => {
    console.error("Initial sync cycle failed:", error);
  });

  intervalHandle = setInterval(() => {
    runSyncCycle().catch((error) => {
      console.error("Scheduled sync cycle failed:", error);
    });
  }, syncConfig.intervalMs);

  console.log("Supabase sync engine started:", {
    clinicId: runtimeClinicContext.clinicId,
    deviceId: syncConfig.deviceId,
    intervalMs: syncConfig.intervalMs,
    batchSize: syncConfig.batchSize
  });
}

function stopSyncEngine() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

function getSyncStatus() {
  const clinicId = runtimeClinicContext.clinicId;

  return {
    enabled: syncConfig.enabled && Boolean(clinicId),
    clinicId,
    hasClinicContext: Boolean(clinicId),
    deviceId: syncConfig.deviceId,
    intervalMs: syncConfig.intervalMs,
    batchSize: syncConfig.batchSize,
    inProgress: syncInProgress,
    lastSyncAt,
    lastSyncError,
    lastPushCount,
    lastPullCount
  };
}

module.exports = {
  startSyncEngine,
  stopSyncEngine,
  runSyncCycle,
  runSyncCyclesUntilCaughtUp,
  enqueueFullBootstrapSync,
  getSyncStatus,
  getActiveClinicContext,
  setActiveClinicContext
};
