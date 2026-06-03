const { prisma } = require("../db/prisma");
const { getActiveClinicContext } = require("../sync/engine");
const {
  isRemoteSyncConfigured,
  fetchRemoteClinicById,
  updateRemoteClinicSubscription
} = require("../sync/remoteAuth");

const UPGRADE_URL = "https://orisyn.parallaxstudio.co.in";
const STATUS_CACHE_TTL_MS = 30 * 1000;
const STALE_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const SUBSCRIPTION_CACHE_STATE_KEY_PREFIX = "subscription_status_v1:";

const PLAN_LIMITS = {
  free: { doctors: 1, receptionists: 1, patients: 100 },
  lite: { doctors: 5, receptionists: 2, patients: 5000 },
  pro: { doctors: 20, receptionists: 5, patients: Number.POSITIVE_INFINITY },
  expired: { doctors: 0, receptionists: 0, patients: 0 }
};

const DURATION_DAYS = {
  "3m": 90,
  "6m": 180,
  "12m": 365
};

const statusCache = new Map();

class SubscriptionLimitError extends Error {
  constructor(message, payload, statusCode = 403) {
    super(message);
    this.name = "SubscriptionLimitError";
    this.statusCode = statusCode;
    this.payload = {
      code: "SUBSCRIPTION_LIMIT_REACHED",
      message,
      upgradeUrl: UPGRADE_URL,
      ...(payload || {})
    };
  }
}

class SubscriptionServiceUnavailableError extends Error {
  constructor(message, payload, statusCode = 503) {
    super(message);
    this.name = "SubscriptionServiceUnavailableError";
    this.statusCode = statusCode;
    this.payload = {
      code: "SUBSCRIPTION_SERVICE_UNAVAILABLE",
      message,
      retryable: true,
      upgradeUrl: UPGRADE_URL,
      ...(payload || {})
    };
  }
}

function normalizePlan(rawPlan) {
  const plan = String(rawPlan || "").trim().toLowerCase();
  if (plan === "free" || plan === "lite" || plan === "pro" || plan === "expired") {
    return plan;
  }

  return "free";
}

function normalizeDuration(rawDuration) {
  const duration = String(rawDuration || "").trim().toLowerCase();
  if (duration === "3m" || duration === "6m" || duration === "12m") {
    return duration;
  }

  return null;
}

function parseDateSafely(rawDate) {
  if (!rawDate) {
    return null;
  }

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function buildSubscriptionCacheStateKey(clinicId) {
  const normalizedClinicId = String(clinicId || "").trim();
  if (!normalizedClinicId) {
    return null;
  }

  return `${SUBSCRIPTION_CACHE_STATE_KEY_PREFIX}${normalizedClinicId}`;
}

function parseStoredSubscriptionSnapshot(rawValue) {
  if (!rawValue) {
    return null;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(parsed, "plan")) {
    return null;
  }

  return {
    plan: normalizePlan(parsed.plan),
    duration: normalizeDuration(parsed.duration),
    planStartedAt: parseDateSafely(parsed.planStartedAt),
    remoteUpdatedAt: parseDateSafely(parsed.remoteUpdatedAt),
    cachedAt:
      parseDateSafely(parsed.cachedAt) ||
      parseDateSafely(parsed.fetchedAt) ||
      parseDateSafely(parsed.updatedAt) ||
      null
  };
}

async function getStoredSubscriptionSnapshot(clinicId) {
  const stateKey = buildSubscriptionCacheStateKey(clinicId);
  if (!stateKey) {
    return null;
  }

  const row = await prisma.syncState.findUnique({
    where: { key: stateKey },
    select: { value: true, updatedAt: true }
  });

  if (!row?.value) {
    return null;
  }

  const parsed = parseStoredSubscriptionSnapshot(row.value);
  if (!parsed) {
    return null;
  }

  return {
    ...parsed,
    stateUpdatedAt: row.updatedAt || null,
    cachedAt: parsed.cachedAt || row.updatedAt || null
  };
}

async function setStoredSubscriptionSnapshot({
  clinicId,
  plan,
  duration,
  planStartedAt,
  remoteUpdatedAt,
  usage
}) {
  const stateKey = buildSubscriptionCacheStateKey(clinicId);
  if (!stateKey) {
    return;
  }

  const nowIso = new Date().toISOString();
  const payload = {
    version: 1,
    plan: normalizePlan(plan),
    duration: normalizeDuration(duration),
    planStartedAt: toIsoOrNull(planStartedAt),
    remoteUpdatedAt: toIsoOrNull(parseDateSafely(remoteUpdatedAt)),
    cachedAt: nowIso
  };

  if (usage && typeof usage === "object") {
    payload.usageSnapshot = {
      doctors: Number.isInteger(usage.doctors) ? usage.doctors : 0,
      receptionists: Number.isInteger(usage.receptionists) ? usage.receptionists : 0,
      patients: Number.isInteger(usage.patients) ? usage.patients : 0,
      capturedAt: nowIso
    };
  }

  await prisma.syncState.upsert({
    where: { key: stateKey },
    update: { value: JSON.stringify(payload) },
    create: {
      key: stateKey,
      value: JSON.stringify(payload)
    }
  });
}

function resolvePlanStartAt(remoteClinic) {
  const candidates = [
    remoteClinic?.subscription_started_at,
    remoteClinic?.subscription_start_at,
    remoteClinic?.subscription_start_date,
    remoteClinic?.subscription_updated_at,
    remoteClinic?.updated_at,
    remoteClinic?.created_at
  ];

  for (const candidate of candidates) {
    const parsed = parseDateSafely(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function toIsoOrNull(dateValue) {
  return dateValue instanceof Date && !Number.isNaN(dateValue.getTime())
    ? dateValue.toISOString()
    : null;
}

function isFiniteLimit(limit) {
  return Number.isFinite(limit);
}

function buildOutOfLimitMessage(reasonCodes) {
  if (reasonCodes.includes("PLAN_EXPIRED")) {
    return "Your clinic subscription has expired. Upgrade your plan to continue using Orisyn.";
  }

  if (reasonCodes.includes("DOCTOR_LIMIT_EXCEEDED")) {
    return "Doctor account limit exceeded for your clinic plan. Upgrade to add more doctors.";
  }

  if (reasonCodes.includes("RECEPTIONIST_LIMIT_EXCEEDED")) {
    return "Receptionist account limit exceeded for your clinic plan. Upgrade to add more receptionists.";
  }

  if (reasonCodes.includes("PATIENT_LIMIT_EXCEEDED")) {
    return "Patient limit exceeded for your clinic plan. Upgrade to add more patients.";
  }

  return "Your clinic account is out of plan limits. Upgrade your subscription to continue.";
}

function buildLimitMessageForCreate(target, limit) {
  if (target === "DOCTOR") {
    return `Doctor limit reached for your current plan (${limit}). Upgrade to add more doctors.`;
  }

  if (target === "RECEPTIONIST") {
    return `Receptionist limit reached for your current plan (${limit}). Upgrade to add more receptionists.`;
  }

  return `Patient limit reached for your current plan (${limit}). Upgrade to add more patients.`;
}

function buildLocalCacheMessage(cacheUpdatedAt) {
  const cacheTimestamp = toIsoOrNull(cacheUpdatedAt);
  if (cacheTimestamp) {
    return `Supabase is temporarily unavailable. Using local cached subscription data from ${cacheTimestamp}.`;
  }

  return "Supabase is temporarily unavailable. Using local cached subscription data.";
}

function evaluateSubscriptionFromPlan({
  plan,
  duration,
  planStartedAt,
  usage,
  nowMs = Date.now()
}) {
  const normalizedPlan = normalizePlan(plan);
  const normalizedDuration = normalizeDuration(duration);
  const durationDays = normalizedDuration ? DURATION_DAYS[normalizedDuration] || null : null;

  let expiresAt = null;
  if (durationDays && planStartedAt instanceof Date && !Number.isNaN(planStartedAt.getTime())) {
    expiresAt = new Date(planStartedAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
  }

  const remainingMs = expiresAt ? expiresAt.getTime() - nowMs : null;
  const isExpired = Boolean(expiresAt && remainingMs !== null && remainingMs <= 0);

  const effectivePlan = isExpired ? "expired" : normalizedPlan;
  const limits = PLAN_LIMITS[effectivePlan] || PLAN_LIMITS.free;
  const reasonCodes = [];

  if (effectivePlan === "expired") {
    reasonCodes.push("PLAN_EXPIRED");
  }

  if (isFiniteLimit(limits.doctors) && usage.doctors > limits.doctors) {
    reasonCodes.push("DOCTOR_LIMIT_EXCEEDED");
  }

  if (isFiniteLimit(limits.receptionists) && usage.receptionists > limits.receptionists) {
    reasonCodes.push("RECEPTIONIST_LIMIT_EXCEEDED");
  }

  if (isFiniteLimit(limits.patients) && usage.patients > limits.patients) {
    reasonCodes.push("PATIENT_LIMIT_EXCEEDED");
  }

  return {
    plan: normalizedPlan,
    duration: normalizedDuration,
    effectivePlan,
    limits,
    expiresAt,
    remainingSeconds: remainingMs !== null ? Math.max(0, Math.floor(remainingMs / 1000)) : null,
    isExpired,
    reasonCodes,
    outOfLimit: reasonCodes.length > 0,
    message: reasonCodes.length ? buildOutOfLimitMessage(reasonCodes) : ""
  };
}

async function resolveClinicIdForUser(userPayload) {
  const tokenClinicId = String(userPayload?.clinicId || "").trim();
  if (tokenClinicId) {
    return tokenClinicId;
  }

  const requesterId = Number(userPayload?.id);
  if (Number.isInteger(requesterId) && requesterId > 0) {
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { clinicId: true }
    });

    const requesterClinicId = String(requester?.clinicId || "").trim();
    if (requesterClinicId) {
      return requesterClinicId;
    }
  }

  const activeClinicContext = await getActiveClinicContext();
  const activeClinicId = String(activeClinicContext?.clinicId || "").trim();
  return activeClinicId || null;
}

async function fetchRemoteClinicWithCache(clinicId, forceRefresh = false) {
  const normalizedClinicId = String(clinicId || "").trim();
  if (!normalizedClinicId) {
    return {
      remoteClinic: null,
      source: "none",
      remoteUnavailable: false,
      stale: false,
      fetchError: null
    };
  }

  if (!isRemoteSyncConfigured()) {
    return {
      remoteClinic: null,
      source: "none",
      remoteUnavailable: false,
      stale: false,
      fetchError: null
    };
  }

  const cached = statusCache.get(normalizedClinicId);
  const cacheAgeMs = cached ? Date.now() - cached.fetchedAt : null;

  if (
    !forceRefresh &&
    cached &&
    cacheAgeMs !== null &&
    cacheAgeMs < STATUS_CACHE_TTL_MS
  ) {
    return {
      remoteClinic: cached.value,
      source: "cache-fresh",
      remoteUnavailable: false,
      stale: false,
      fetchError: null
    };
  }

  try {
    const remoteClinic = await fetchRemoteClinicById({ clinicId: normalizedClinicId });
    statusCache.set(normalizedClinicId, {
      fetchedAt: Date.now(),
      value: remoteClinic
    });

    return {
      remoteClinic,
      source: "supabase",
      remoteUnavailable: false,
      stale: false,
      fetchError: null
    };
  } catch (error) {
    const hasStaleCache = Boolean(
      cached &&
      cacheAgeMs !== null &&
      cacheAgeMs <= STALE_CACHE_MAX_AGE_MS
    );

    if (hasStaleCache) {
      return {
        remoteClinic: cached.value,
        source: "cache-stale",
        remoteUnavailable: true,
        stale: true,
        fetchError: String(error?.message || error || "Supabase fetch failed")
      };
    }

    return {
      remoteClinic: null,
      source: "unavailable",
      remoteUnavailable: true,
      stale: true,
      fetchError: String(error?.message || error || "Supabase fetch failed")
    };
  }
}

async function getSubscriptionStatusForClinic(clinicId, options = {}) {
  const normalizedClinicId = String(clinicId || "").trim();
  if (!normalizedClinicId) {
    return {
      clinicId: null,
      plan: "expired",
      effectivePlan: "expired",
      duration: null,
      limits: PLAN_LIMITS.expired,
      usage: { doctors: 0, receptionists: 0, patients: 0 },
      expiresAt: null,
      remainingSeconds: 0,
      reasonCodes: ["CLINIC_UNLINKED", "PLAN_EXPIRED"],
      outOfLimit: true,
      message: "Clinic subscription is not linked. Upgrade or relink this clinic subscription.",
      upgradeUrl: UPGRADE_URL,
      source: "none",
      degraded: false,
      enforcementBlocked: false,
      remoteError: null
    };
  }

  const [doctors, receptionists, patients] = await Promise.all([
    prisma.user.count({ where: { clinicId: normalizedClinicId, role: "DOCTOR" } }),
    prisma.user.count({ where: { clinicId: normalizedClinicId, role: "RECEPTIONIST" } }),
    prisma.patient.count({ where: { clinicId: normalizedClinicId } })
  ]);

  const usage = { doctors, receptionists, patients };

  const remoteFetch = await fetchRemoteClinicWithCache(
    normalizedClinicId,
    Boolean(options.forceRefresh)
  );
  const remoteClinic = remoteFetch.remoteClinic;

  if (remoteClinic) {
    const evaluation = evaluateSubscriptionFromPlan({
      plan: remoteClinic.subscription_plan,
      duration: remoteClinic.subscription_duration,
      planStartedAt: resolvePlanStartAt(remoteClinic),
      usage
    });

    let resolvedRemoteClinic = remoteClinic;

    if (evaluation.isExpired && evaluation.plan !== "expired") {
      try {
        await updateRemoteClinicSubscription({
          clinicId: normalizedClinicId,
          subscriptionPlan: "expired"
        });

        resolvedRemoteClinic = {
          ...remoteClinic,
          subscription_plan: "expired"
        };

        statusCache.set(normalizedClinicId, {
          fetchedAt: Date.now(),
          value: resolvedRemoteClinic
        });
      } catch (error) {
        console.warn(
          "Failed to mark remote clinic subscription as expired:",
          error?.message || error
        );
      }
    }

    if (remoteFetch.source === "supabase") {
      try {
        await setStoredSubscriptionSnapshot({
          clinicId: normalizedClinicId,
          plan: resolvedRemoteClinic.subscription_plan,
          duration: resolvedRemoteClinic.subscription_duration,
          planStartedAt: resolvePlanStartAt(resolvedRemoteClinic),
          remoteUpdatedAt: resolvedRemoteClinic.updated_at,
          usage
        });
      } catch (cacheError) {
        console.warn(
          "Failed to persist local subscription snapshot:",
          cacheError?.message || cacheError
        );
      }
    }

    return {
      clinicId: normalizedClinicId,
      plan: evaluation.plan,
      effectivePlan: evaluation.effectivePlan,
      duration: evaluation.duration,
      limits: evaluation.limits,
      usage,
      expiresAt: toIsoOrNull(evaluation.expiresAt),
      remainingSeconds: evaluation.remainingSeconds,
      reasonCodes: evaluation.reasonCodes,
      outOfLimit: evaluation.outOfLimit,
      message:
        remoteFetch.source === "cache-stale" && !evaluation.outOfLimit
          ? "Using in-memory cached subscription status while Supabase is temporarily unavailable."
          : evaluation.message,
      upgradeUrl: UPGRADE_URL,
      source: remoteFetch.source,
      degraded: remoteFetch.source === "cache-stale",
      enforcementBlocked: false,
      remoteError: remoteFetch.fetchError
    };
  }

  const storedSnapshot = await getStoredSubscriptionSnapshot(normalizedClinicId);
  if (storedSnapshot) {
    const evaluation = evaluateSubscriptionFromPlan({
      plan: storedSnapshot.plan,
      duration: storedSnapshot.duration,
      planStartedAt: storedSnapshot.planStartedAt,
      usage
    });

    return {
      clinicId: normalizedClinicId,
      plan: evaluation.plan,
      effectivePlan: evaluation.effectivePlan,
      duration: evaluation.duration,
      limits: evaluation.limits,
      usage,
      expiresAt: toIsoOrNull(evaluation.expiresAt),
      remainingSeconds: evaluation.remainingSeconds,
      reasonCodes: evaluation.reasonCodes,
      outOfLimit: evaluation.outOfLimit,
      message: evaluation.outOfLimit
        ? evaluation.message
        : buildLocalCacheMessage(storedSnapshot.cachedAt),
      upgradeUrl: UPGRADE_URL,
      source: "local-cache",
      degraded: true,
      enforcementBlocked: false,
      remoteError: remoteFetch.fetchError,
      localCacheUpdatedAt: toIsoOrNull(storedSnapshot.cachedAt)
    };
  }

  if (remoteFetch.source === "none") {
    const evaluation = evaluateSubscriptionFromPlan({
      plan: "free",
      duration: null,
      planStartedAt: null,
      usage
    });

    return {
      clinicId: normalizedClinicId,
      plan: evaluation.plan,
      effectivePlan: evaluation.effectivePlan,
      duration: evaluation.duration,
      limits: evaluation.limits,
      usage,
      expiresAt: toIsoOrNull(evaluation.expiresAt),
      remainingSeconds: evaluation.remainingSeconds,
      reasonCodes: [...evaluation.reasonCodes, "SUPABASE_SYNC_NOT_CONFIGURED"],
      outOfLimit: evaluation.outOfLimit,
      message: evaluation.outOfLimit
        ? evaluation.message
        : "Supabase sync is not configured. Enforcing free plan limits from local data.",
      upgradeUrl: UPGRADE_URL,
      source: "fallback-local-free",
      degraded: true,
      enforcementBlocked: false,
      remoteError: null
    };
  }

  const remoteClinicMissing = remoteFetch.source === "supabase";
  return {
    clinicId: normalizedClinicId,
    plan: "expired",
    effectivePlan: "expired",
    duration: null,
    limits: PLAN_LIMITS.expired,
    usage,
    expiresAt: null,
    remainingSeconds: 0,
    reasonCodes: remoteClinicMissing
      ? ["REMOTE_CLINIC_NOT_FOUND", "SUBSCRIPTION_CACHE_MISSING"]
      : ["SUBSCRIPTION_STATUS_UNAVAILABLE", "SUBSCRIPTION_CACHE_MISSING"],
    outOfLimit: true,
    message: remoteClinicMissing
      ? "Clinic subscription record was not found in Supabase and no local cache is available. Run online once to sync the plan."
      : "Subscription status is temporarily unavailable and no local cached subscription exists yet. Connect to Supabase once to sync the clinic plan.",
    upgradeUrl: UPGRADE_URL,
    source: remoteClinicMissing ? "supabase-missing" : "unavailable",
    degraded: true,
    enforcementBlocked: true,
    remoteError: remoteFetch.fetchError
  };
}

async function assertCanAssignRoleForClinic(clinicId, targetRole, options = {}) {
  const normalizedRole = String(targetRole || "").trim().toUpperCase();
  if (normalizedRole !== "DOCTOR" && normalizedRole !== "RECEPTIONIST") {
    return;
  }

  const normalizedClinicId = String(clinicId || "").trim();
  if (!normalizedClinicId) {
    throw new SubscriptionLimitError(
      "Clinic setup is incomplete. Please link this account to a clinic before adding users.",
      {
        reasonCodes: ["CLINIC_UNLINKED"],
        outOfLimit: true
      },
      409
    );
  }

  const status = await getSubscriptionStatusForClinic(normalizedClinicId, { forceRefresh: true });
  if (status.enforcementBlocked) {
    throw new SubscriptionServiceUnavailableError(
      "Subscription status is temporarily unavailable. Please retry in a moment.",
      status,
      503
    );
  }

  if (status.effectivePlan === "expired") {
    throw new SubscriptionLimitError(
      "Your clinic subscription has expired. Upgrade to continue adding users.",
      status,
      403
    );
  }

  const limitKey = normalizedRole === "DOCTOR" ? "doctors" : "receptionists";
  const limit = status.limits[limitKey];

  if (!isFiniteLimit(limit)) {
    return;
  }

  const excludeUserId = Number(options.excludeUserId);
  const roleCount = await prisma.user.count({
    where: {
      clinicId: normalizedClinicId,
      role: normalizedRole,
      ...(Number.isInteger(excludeUserId) && excludeUserId > 0
        ? { id: { not: excludeUserId } }
        : {})
    }
  });

  if (roleCount >= limit) {
    throw new SubscriptionLimitError(buildLimitMessageForCreate(normalizedRole, limit), {
      ...status,
      outOfLimit: true,
      reasonCodes: [
        normalizedRole === "DOCTOR" ? "DOCTOR_LIMIT_EXCEEDED" : "RECEPTIONIST_LIMIT_EXCEEDED"
      ],
      requestedRole: normalizedRole
    });
  }
}

async function assertCanCreatePatientForClinic(clinicId) {
  const normalizedClinicId = String(clinicId || "").trim();
  if (!normalizedClinicId) {
    throw new SubscriptionLimitError(
      "Clinic setup is incomplete. Please link this account to a clinic before adding patients.",
      {
        reasonCodes: ["CLINIC_UNLINKED"],
        outOfLimit: true
      },
      409
    );
  }

  const status = await getSubscriptionStatusForClinic(normalizedClinicId, { forceRefresh: true });
  if (status.enforcementBlocked) {
    throw new SubscriptionServiceUnavailableError(
      "Subscription status is temporarily unavailable. Please retry in a moment.",
      status,
      503
    );
  }

  if (status.effectivePlan === "expired") {
    throw new SubscriptionLimitError(
      "Your clinic subscription has expired. Upgrade to continue adding patients.",
      status,
      403
    );
  }

  const patientLimit = status.limits.patients;
  if (!isFiniteLimit(patientLimit)) {
    return;
  }

  const totalPatients = await prisma.patient.count({ where: { clinicId: normalizedClinicId } });
  if (totalPatients >= patientLimit) {
    throw new SubscriptionLimitError(buildLimitMessageForCreate("PATIENT", patientLimit), {
      ...status,
      outOfLimit: true,
      reasonCodes: ["PATIENT_LIMIT_EXCEEDED"]
    });
  }
}

module.exports = {
  PLAN_LIMITS,
  DURATION_DAYS,
  UPGRADE_URL,
  SubscriptionLimitError,
  SubscriptionServiceUnavailableError,
  evaluateSubscriptionFromPlan,
  resolveClinicIdForUser,
  getSubscriptionStatusForClinic,
  assertCanAssignRoleForClinic,
  assertCanCreatePatientForClinic
};
