const { randomUUID } = require("node:crypto");

const CLINIC_ID_STATE_KEY = "clinic_id";
const CLINIC_NAME_STATE_KEY = "clinic_name";

function normalizeClinicId(value) {
  return String(value || "").trim();
}

function normalizeClinicName(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

async function getStoredClinicContext(prisma) {
  const rows = await prisma.syncState.findMany({
    where: {
      key: {
        in: [CLINIC_ID_STATE_KEY, CLINIC_NAME_STATE_KEY]
      }
    },
    select: {
      key: true,
      value: true
    }
  });

  const clinicIdRow = rows.find((row) => row.key === CLINIC_ID_STATE_KEY);
  const clinicNameRow = rows.find((row) => row.key === CLINIC_NAME_STATE_KEY);

  return {
    clinicId: clinicIdRow?.value || null,
    clinicName: clinicNameRow?.value || null
  };
}

async function setStoredClinicContext(prisma, context, options = {}) {
  const clinicId = normalizeClinicId(context?.clinicId);
  const clinicName = normalizeClinicName(context?.clinicName);
  const allowReplace = Boolean(options?.allowReplace);

  if (!clinicId) {
    throw new Error("clinicId is required to store clinic context");
  }

  const existing = await getStoredClinicContext(prisma);
  if (
    existing.clinicId &&
    existing.clinicId !== clinicId &&
    !allowReplace
  ) {
    throw new Error(
      "This app installation is already linked to another clinic. Clear local data before linking a new clinic."
    );
  }

  await prisma.syncState.upsert({
    where: { key: CLINIC_ID_STATE_KEY },
    update: { value: clinicId },
    create: {
      key: CLINIC_ID_STATE_KEY,
      value: clinicId
    }
  });

  if (clinicName) {
    await prisma.syncState.upsert({
      where: { key: CLINIC_NAME_STATE_KEY },
      update: { value: clinicName },
      create: {
        key: CLINIC_NAME_STATE_KEY,
        value: clinicName
      }
    });
  }

  return {
    clinicId,
    clinicName: clinicName || existing.clinicName || null
  };
}

function generateClinicId() {
  return randomUUID();
}

module.exports = {
  CLINIC_ID_STATE_KEY,
  CLINIC_NAME_STATE_KEY,
  generateClinicId,
  getStoredClinicContext,
  setStoredClinicContext
};
