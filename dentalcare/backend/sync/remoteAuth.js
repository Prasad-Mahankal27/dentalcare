const bcrypt = require("bcrypt");
const { loadEnv } = require("../config/loadEnv");
loadEnv();
const { createClient } = require("@supabase/supabase-js");

const SYNC_TABLE = "clinic_sync_records";
const MAX_AUTH_USER_LOOKUP_PAGES = 5;
const REMOTE_PATIENT_PAGE_SIZE = 500;
const REMOTE_PATIENT_MAX_PAGES = 20;
const REMOTE_ROLE_MAP = {
  ADMIN: "admin",
  DOCTOR: "doctor",
  RECEPTIONIST: "receptionist"
};

function normalizeRole(value) {
  const role = String(value || "").trim().toUpperCase();
  if (role === "ADMIN" || role === "DOCTOR") {
    return role;
  }
  return "RECEPTIONIST";
}

function normalizeRemoteRole(value, casing = "lower") {
  const role = normalizeRole(value);
  const mapped = REMOTE_ROLE_MAP[role] || REMOTE_ROLE_MAP.RECEPTIONIST;
  return casing === "upper" ? role : mapped;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parsePayload(rawPayload) {
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

function normalizeRemoteAppointmentStatus(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (["REQUESTED", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"].includes(normalized)) {
    return normalized;
  }

  return "REQUESTED";
}

function normalizeRemoteAppointmentSource(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (["WHATSAPP", "FRONT_DESK", "PHONE", "WALK_IN"].includes(normalized)) {
    return normalized;
  }

  return "FRONT_DESK";
}

function parseRemotePatientSnapshot(encryptedData, rowUpdatedAt) {
  const payload = parsePayload(encryptedData);
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const phone = String(payload.phone || "").trim();
  if (!phone) {
    return null;
  }

  const latestAppointment = payload.latestAppointment && typeof payload.latestAppointment === "object"
    ? payload.latestAppointment
    : null;

  const appointmentId = String(latestAppointment?.appointmentId || "").trim() || null;
  const scheduledAt = latestAppointment?.scheduledAt
    ? new Date(latestAppointment.scheduledAt)
    : null;
  const hasValidScheduledAt = scheduledAt && !Number.isNaN(scheduledAt.getTime());

  return {
    patientId: String(payload.patientId || "").trim() || null,
    name: String(payload.name || "").trim() || null,
    phone,
    age: Number.isInteger(payload.age) ? payload.age : null,
    gender: String(payload.gender || "").trim() || null,
    address: String(payload.address || "").trim() || null,
    updatedAt: String(rowUpdatedAt || payload.updatedAt || "").trim() || null,
    latestAppointment:
      appointmentId && hasValidScheduledAt
        ? {
            appointmentId,
            scheduledAt: scheduledAt.toISOString(),
            status: normalizeRemoteAppointmentStatus(latestAppointment.status),
            source: normalizeRemoteAppointmentSource(latestAppointment.source),
            reason: String(latestAppointment.reason || "").trim() || null
          }
        : null
  };
}

function compareUpdatedAt(a, b) {
  const aTime = new Date(a || 0).getTime();
  const bTime = new Date(b || 0).getTime();

  if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) {
    return 0;
  }

  if (!Number.isFinite(aTime)) {
    return -1;
  }

  if (!Number.isFinite(bTime)) {
    return 1;
  }

  return aTime - bTime;
}

function getRemoteClient() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function isRemoteSyncConfigured() {
  return Boolean(getRemoteClient());
}

function buildRemoteUserPayload({ clinicId, user, role, includeExtendedFields, remoteAuthUserId }) {
  const email = normalizeEmail(user?.email || user?.phone);
  const normalizedClinicId = String(clinicId || "").trim();
  if (!email || !normalizedClinicId) {
    return null;
  }

  const normalizedRole = normalizeRemoteRole(role || user?.role, "lower");

  const payload = {
    email,
    clinic_id: normalizedClinicId,
    role: normalizedRole
  };

  if (remoteAuthUserId) {
    payload.id = remoteAuthUserId;
  }

  if (includeExtendedFields) {
    payload.name = String(user?.name || "").trim() || null;
    payload.phone = String(user?.phone || email).trim() || email;
    payload.password = String(user?.password || "").trim() || null;
  }

  return payload;
}

function isRemoteUserIdRequiredError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("null value in column \"id\"") ||
    message.includes("column \"id\" of relation \"users\"") ||
    message.includes("violates not-null constraint") ||
    message.includes("violates foreign key constraint")
  );
}

async function findRemoteAuthUserIdByEmail(client, email) {
  for (let page = 1; page <= MAX_AUTH_USER_LOOKUP_PAGES; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 200
    });

    if (error) {
      return null;
    }

    const users = data?.users || [];
    const existing = users.find((entry) => normalizeEmail(entry?.email) === email);
    if (existing?.id) {
      return existing.id;
    }

    if (users.length < 200) {
      break;
    }
  }

  return null;
}

async function ensureRemoteAuthUserId(client, { email, rawPassword }) {
  const password = String(rawPassword || "");
  if (!email || password.length < 6) {
    return null;
  }

  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (!error && data?.user?.id) {
    return data.user.id;
  }

  return findRemoteAuthUserIdByEmail(client, email);
}

async function tryUpsertRemoteUser(client, payload) {
  const normalizedPayload = {
    ...payload,
    role: normalizeRemoteRole(payload?.role, "lower")
  };

  const { error } = await client.from("users").upsert(normalizedPayload, {
    onConflict: "email"
  });
  return error;
}

async function upsertRemoteUser({ clinicId, user, rawPassword }) {
  const client = getRemoteClient();
  if (!client) {
    return { synced: false };
  }

  const email = normalizeEmail(user?.email || user?.phone);
  if (!clinicId || !email) {
    return { synced: false };
  }

  const role = normalizeRemoteRole(user?.role, "lower");

  let lastError = null;

  const withExtendedPayload = buildRemoteUserPayload({
    clinicId,
    user,
    role,
    includeExtendedFields: true
  });

  if (withExtendedPayload) {
    const extendedError = await tryUpsertRemoteUser(client, withExtendedPayload);
    if (!extendedError) {
      return { synced: true };
    }
    lastError = extendedError;
  }

  const basePayload = buildRemoteUserPayload({
    clinicId,
    user,
    role,
    includeExtendedFields: false
  });

  if (basePayload) {
    const baseError = await tryUpsertRemoteUser(client, basePayload);
    if (!baseError) {
      return { synced: true };
    }
    lastError = baseError;
  }

  if (isRemoteUserIdRequiredError(lastError)) {
    const remoteAuthUserId = await ensureRemoteAuthUserId(client, {
      email,
      rawPassword
    });

    if (remoteAuthUserId) {
      const payload = buildRemoteUserPayload({
        clinicId,
        user,
        role,
        includeExtendedFields: false,
        remoteAuthUserId
      });

      if (payload) {
        const error = await tryUpsertRemoteUser(client, payload);
        if (!error) {
          return { synced: true };
        }
        lastError = error;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  return { synced: false };
}

function isAuthUserNotFoundError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("user not found") || message.includes("not found");
}

async function findRemoteUserIdByLoginId(client, loginId) {
  const byEmail = await client
    .from("users")
    .select("id")
    .eq("email", loginId)
    .limit(1)
    .maybeSingle();

  if (byEmail.error) {
    throw byEmail.error;
  }

  if (byEmail.data?.id) {
    return byEmail.data.id;
  }

  const byPhone = await client
    .from("users")
    .select("id")
    .eq("phone", loginId)
    .limit(1)
    .maybeSingle();

  if (byPhone.error) {
    throw byPhone.error;
  }

  return byPhone.data?.id || null;
}

async function deleteRemoteUser({ email, phone }) {
  const client = getRemoteClient();
  if (!client) {
    return { synced: false };
  }

  const loginId = normalizeEmail(email || phone);
  if (!loginId) {
    return { synced: false };
  }

  const remoteUserId = await findRemoteUserIdByLoginId(client, loginId);

  const deleteByEmailResult = await client.from("users").delete().eq("email", loginId);
  if (deleteByEmailResult.error) {
    throw deleteByEmailResult.error;
  }

  const deleteByPhoneResult = await client.from("users").delete().eq("phone", loginId);
  if (deleteByPhoneResult.error) {
    throw deleteByPhoneResult.error;
  }

  if (remoteUserId) {
    const { error } = await client.auth.admin.deleteUser(remoteUserId);
    if (error && !isAuthUserNotFoundError(error)) {
      throw error;
    }
  }

  return { synced: true };
}

function buildRemotePatientEncryptedPayload({ patient, appointment }) {
  const phone = String(patient?.phone || appointment?.patientPhone || "").trim();
  if (!phone) {
    return null;
  }

  return {
    patientId: patient?.patientId || null,
    name: String(patient?.name || appointment?.patientName || "").trim() || null,
    phone,
    age: Number.isInteger(patient?.age)
      ? patient.age
      : Number.isInteger(appointment?.patientAge)
        ? appointment.patientAge
        : null,
    gender: String(patient?.gender || appointment?.patientGender || "").trim() || null,
    address: String(patient?.address || appointment?.patientAddress || "").trim() || null,
    latestAppointment: appointment
      ? {
          appointmentId: appointment.appointmentId,
          scheduledAt:
            appointment.scheduledAt instanceof Date
              ? appointment.scheduledAt.toISOString()
              : appointment.scheduledAt || null,
          status: appointment.status,
          source: appointment.source,
          reason: appointment.reason || null,
          doctorId: appointment.doctorId || null
        }
      : null,
    updatedAt: new Date().toISOString()
  };
}

async function upsertRemotePatientFromAppointment({ clinicId, patient, appointment }) {
  const client = getRemoteClient();
  if (!client) {
    return { synced: false };
  }

  const encryptedData = buildRemotePatientEncryptedPayload({ patient, appointment });
  if (!encryptedData || !clinicId) {
    return { synced: false };
  }

  const nowIso = new Date().toISOString();
  const patientPhone = encryptedData.phone;

  const existing = await client
    .from("patients")
    .select("id")
    .eq("clinic_id", clinicId)
    .contains("encrypted_data", { phone: patientPhone })
    .order("updated_at", { ascending: false })
    .limit(1);

  if (existing.error) {
    throw existing.error;
  }

  const existingId = existing.data?.[0]?.id;

  if (existingId) {
    const { error } = await client
      .from("patients")
      .update({
        encrypted_data: encryptedData,
        updated_at: nowIso
      })
      .eq("id", existingId);

    if (error) {
      throw error;
    }

    return { synced: true, id: existingId };
  }

  const inserted = await client
    .from("patients")
    .insert({
      clinic_id: clinicId,
      encrypted_data: encryptedData,
      updated_at: nowIso
    })
    .select("id")
    .single();

  if (inserted.error) {
    throw inserted.error;
  }

  return { synced: true, id: inserted.data?.id || null };
}

async function upsertRemoteClinic({ clinicId, clinicName }) {
  const client = getRemoteClient();
  if (!client) {
    return { synced: false };
  }

  const name = String(clinicName || "").trim() || `Clinic ${String(clinicId).slice(0, 8)}`;

  const { error } = await client.from("clinics").upsert(
    {
      id: clinicId,
      name,
      subscription_plan: "free"
    },
    {
      onConflict: "id"
    }
  );

  if (error) {
    throw error;
  }

  return { synced: true };
}

async function fetchRemoteClinicById({ clinicId }) {
  const client = getRemoteClient();
  if (!client) {
    return null;
  }

  const normalizedClinicId = String(clinicId || "").trim();
  if (!normalizedClinicId) {
    return null;
  }

  const { data, error } = await client
    .from("clinics")
    .select("*")
    .eq("id", normalizedClinicId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function updateRemoteClinicSubscription({ clinicId, subscriptionPlan, subscriptionDuration }) {
  const client = getRemoteClient();
  if (!client) {
    return { synced: false };
  }

  const normalizedClinicId = String(clinicId || "").trim();
  if (!normalizedClinicId) {
    return { synced: false };
  }

  const payload = {};
  if (subscriptionPlan !== undefined) {
    payload.subscription_plan = String(subscriptionPlan || "").trim() || null;
  }

  if (subscriptionDuration !== undefined) {
    payload.subscription_duration = String(subscriptionDuration || "").trim() || null;
  }

  if (!Object.keys(payload).length) {
    return { synced: false };
  }

  const { error } = await client
    .from("clinics")
    .update(payload)
    .eq("id", normalizedClinicId);

  if (error) {
    throw error;
  }

  return { synced: true };
}

async function fetchRemotePatientsWithLatestAppointments({
  clinicId,
  maxPages = REMOTE_PATIENT_MAX_PAGES,
  pageSize = REMOTE_PATIENT_PAGE_SIZE
}) {
  const client = getRemoteClient();
  if (!client) {
    return [];
  }

  const normalizedClinicId = String(clinicId || "").trim();
  if (!normalizedClinicId) {
    return [];
  }

  const resolvedPageSize = Number.isInteger(pageSize)
    ? Math.min(Math.max(pageSize, 1), 1000)
    : REMOTE_PATIENT_PAGE_SIZE;
  const resolvedMaxPages = Number.isInteger(maxPages)
    ? Math.min(Math.max(maxPages, 1), 100)
    : REMOTE_PATIENT_MAX_PAGES;

  const snapshotByPhone = new Map();

  for (let pageIndex = 0; pageIndex < resolvedMaxPages; pageIndex += 1) {
    const rangeFrom = pageIndex * resolvedPageSize;
    const rangeTo = rangeFrom + resolvedPageSize - 1;

    const { data, error } = await client
      .from("patients")
      .select("encrypted_data, updated_at")
      .eq("clinic_id", normalizedClinicId)
      .order("updated_at", { ascending: true })
      .range(rangeFrom, rangeTo);

    if (error) {
      throw error;
    }

    if (!Array.isArray(data) || !data.length) {
      break;
    }

    for (const row of data) {
      const parsed = parseRemotePatientSnapshot(row?.encrypted_data, row?.updated_at);
      if (!parsed) {
        continue;
      }

      const existing = snapshotByPhone.get(parsed.phone);
      if (!existing || compareUpdatedAt(parsed.updatedAt, existing.updatedAt) >= 0) {
        snapshotByPhone.set(parsed.phone, parsed);
      }
    }

    if (data.length < resolvedPageSize) {
      break;
    }
  }

  return Array.from(snapshotByPhone.values());
}

async function findRemoteUserMatch({ email, password }) {
  const client = getRemoteClient();
  if (!client) {
    return null;
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) {
    return null;
  }

  const primaryQuery = await client
    .from(SYNC_TABLE)
    .select("clinic_id, record_key, payload, is_deleted, updated_at")
    .eq("entity", "users")
    .eq("record_key", normalizedEmail)
    .order("updated_at", { ascending: false })
    .limit(25);

  if (primaryQuery.error) {
    throw primaryQuery.error;
  }

  let records = primaryQuery.data || [];

  if (!records.length) {
    const fallbackQuery = await client
      .from(SYNC_TABLE)
      .select("clinic_id, record_key, payload, is_deleted, updated_at")
      .eq("entity", "users")
      .order("updated_at", { ascending: false })
      .limit(250);

    if (fallbackQuery.error) {
      throw fallbackQuery.error;
    }

    records = fallbackQuery.data || [];
  }

  for (const record of records) {
    if (record?.is_deleted) {
      continue;
    }

    const payload = parsePayload(record?.payload);
    if (!payload) {
      continue;
    }

    const hash = String(payload.password || "");
    if (!hash) {
      continue;
    }

    const isPasswordValid = await bcrypt.compare(password, hash);
    if (!isPasswordValid) {
      continue;
    }

    const payloadEmail = normalizeEmail(payload.email || payload.phone || record.record_key);
    if (payloadEmail !== normalizedEmail) {
      continue;
    }

    const clinicId = String(record.clinic_id || payload.clinicId || "").trim();
    if (!clinicId) {
      continue;
    }

    return {
      clinicId,
      user: {
        name: String(payload.name || normalizedEmail).trim() || normalizedEmail,
        email: payloadEmail,
        phone: payloadEmail,
        password: hash,
        role: normalizeRole(payload.role),
        clinicId
      }
    };
  }

  return null;
}

module.exports = {
  isRemoteSyncConfigured,
  upsertRemoteClinic,
  fetchRemoteClinicById,
  updateRemoteClinicSubscription,
  upsertRemoteUser,
  deleteRemoteUser,
  upsertRemotePatientFromAppointment,
  fetchRemotePatientsWithLatestAppointments,
  findRemoteUserMatch
};
