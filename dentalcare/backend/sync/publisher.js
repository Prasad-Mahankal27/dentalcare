const MODEL_TO_ENTITY = {
  User: "users",
  Patient: "patients",
  Visit: "visits",
  Appointment: "appointments",
  Billing: "billings"
};

function toIsoString(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function getDeleteRecordKey(model, deletedRecord) {
  if (!deletedRecord) {
    return null;
  }

  switch (model) {
    case "User":
      return deletedRecord.email || deletedRecord.phone || null;
    case "Patient":
      return deletedRecord.patientId || null;
    case "Visit":
      return deletedRecord.visitId || null;
    case "Appointment":
      return deletedRecord.appointmentId || null;
    case "Billing":
      return deletedRecord.billId || null;
    default:
      return null;
  }
}

function buildUserWhere(selector) {
  if (!selector || typeof selector !== "object") {
    return null;
  }

  if (Number.isInteger(selector.id)) {
    return { id: selector.id };
  }

  const email = String(selector.email || "").trim();
  if (email) {
    return { email };
  }

  const phone = String(selector.phone || "").trim();
  if (phone) {
    return { phone };
  }

  return null;
}

async function serializeUser(prisma, selector) {
  const where = buildUserWhere(selector);
  if (!where) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      password: true,
      role: true,
      clinicId: true,
      createdAt: true,
      updatedAt: true
    }
  });

  const loginId = String(user?.email || user?.phone || "").trim().toLowerCase();
  if (!user || !loginId) {
    return null;
  }

  return {
    recordKey: loginId,
    payload: {
      id: user.id,
      name: user.name,
      email: user.email || loginId,
      phone: user.phone || loginId,
      password: user.password,
      role: String(user.role || "RECEPTIONIST").toLowerCase(),
      clinicId: user.clinicId || null,
      createdAt: toIsoString(user.createdAt),
      updatedAt: toIsoString(user.updatedAt)
    }
  };
}

function buildPatientWhere(selector) {
  if (!selector || typeof selector !== "object") {
    return null;
  }

  if (Number.isInteger(selector.id)) {
    return { id: selector.id };
  }

  const patientId = String(selector.patientId || "").trim();
  if (patientId) {
    return { patientId };
  }

  return null;
}

async function serializePatient(prisma, selector) {
  const where = buildPatientWhere(selector);
  if (!where) {
    return null;
  }

  const patient = await prisma.patient.findUnique({
    where,
    select: {
      id: true,
      patientId: true,
      name: true,
      phone: true,
      age: true,
      gender: true,
      address: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!patient || !patient.patientId) {
    return null;
  }

  return {
    recordKey: patient.patientId,
    payload: {
      id: patient.id,
      patientId: patient.patientId,
      name: patient.name,
      phone: patient.phone,
      age: patient.age,
      gender: patient.gender,
      address: patient.address,
      createdAt: toIsoString(patient.createdAt),
      updatedAt: toIsoString(patient.updatedAt)
    }
  };
}

function buildVisitWhere(selector) {
  if (!selector || typeof selector !== "object") {
    return null;
  }

  if (Number.isInteger(selector.id)) {
    return { id: selector.id };
  }

  const visitId = String(selector.visitId || "").trim();
  if (visitId) {
    return { visitId };
  }

  return null;
}

async function serializeVisit(prisma, selector) {
  const where = buildVisitWhere(selector);
  if (!where) {
    return null;
  }

  const visit = await prisma.visit.findUnique({
    where,
    select: {
      id: true,
      visitId: true,
      visitType: true,
      caseOutcome: true,
      symptoms: true,
      diagnosis: true,
      observations: true,
      treatmentPlan: true,
      procedures: true,
      followUpAdvice: true,
      medicines: true,
      labTests: true,
      clinicalStatus: true,
      paymentStatus: true,
      createdAt: true,
      updatedAt: true,
      patient: {
        select: {
          patientId: true,
          name: true,
          phone: true,
          age: true,
          gender: true,
          address: true
        }
      },
      doctor: {
        select: {
          phone: true,
          name: true,
          role: true
        }
      }
    }
  });

  if (!visit || !visit.visitId) {
    return null;
  }

  return {
    recordKey: visit.visitId,
    payload: {
      id: visit.id,
      visitId: visit.visitId,
      visitType: visit.visitType,
      caseOutcome: visit.caseOutcome,
      symptoms: visit.symptoms,
      diagnosis: visit.diagnosis,
      observations: visit.observations,
      treatmentPlan: visit.treatmentPlan,
      procedures: visit.procedures,
      followUpAdvice: visit.followUpAdvice,
      medicines: visit.medicines,
      labTests: visit.labTests,
      clinicalStatus: visit.clinicalStatus,
      paymentStatus: visit.paymentStatus,
      createdAt: toIsoString(visit.createdAt),
      updatedAt: toIsoString(visit.updatedAt),
      patient: visit.patient || null,
      doctor: visit.doctor || null
    }
  };
}

function buildAppointmentWhere(selector) {
  if (!selector || typeof selector !== "object") {
    return null;
  }

  if (Number.isInteger(selector.id)) {
    return { id: selector.id };
  }

  const appointmentId = String(selector.appointmentId || "").trim();
  if (appointmentId) {
    return { appointmentId };
  }

  const linkedVisitId = String(selector.linkedVisitId || "").trim();
  if (linkedVisitId) {
    return { linkedVisitId };
  }

  return null;
}

async function serializeAppointment(prisma, selector) {
  const where = buildAppointmentWhere(selector);
  if (!where) {
    return null;
  }

  const appointment = await prisma.appointment.findUnique({
    where,
    select: {
      id: true,
      appointmentId: true,
      patientPhone: true,
      patientName: true,
      patientAge: true,
      patientGender: true,
      patientAddress: true,
      scheduledAt: true,
      status: true,
      source: true,
      linkedVisitId: true,
      reason: true,
      whatsappMessageId: true,
      createdAt: true,
      updatedAt: true,
      patient: {
        select: {
          patientId: true,
          name: true,
          phone: true,
          age: true,
          gender: true,
          address: true
        }
      },
      doctor: {
        select: {
          phone: true,
          name: true,
          role: true
        }
      }
    }
  });

  if (!appointment || !appointment.appointmentId) {
    return null;
  }

  return {
    recordKey: appointment.appointmentId,
    payload: {
      id: appointment.id,
      appointmentId: appointment.appointmentId,
      patientPhone: appointment.patientPhone,
      patientName: appointment.patientName,
      patientAge: appointment.patientAge,
      patientGender: appointment.patientGender,
      patientAddress: appointment.patientAddress,
      scheduledAt: toIsoString(appointment.scheduledAt),
      status: appointment.status,
      source: appointment.source,
      linkedVisitId: appointment.linkedVisitId,
      reason: appointment.reason,
      whatsappMessageId: appointment.whatsappMessageId,
      createdAt: toIsoString(appointment.createdAt),
      updatedAt: toIsoString(appointment.updatedAt),
      patient: appointment.patient || null,
      doctor: appointment.doctor || null
    }
  };
}

function buildBillingWhere(selector) {
  if (!selector || typeof selector !== "object") {
    return null;
  }

  if (Number.isInteger(selector.id)) {
    return { id: selector.id };
  }

  const billId = String(selector.billId || "").trim();
  if (billId) {
    return { billId };
  }

  return null;
}

async function serializeBilling(prisma, selector) {
  const where = buildBillingWhere(selector);
  if (!where) {
    return null;
  }

  const billing = await prisma.billing.findUnique({
    where,
    select: {
      id: true,
      billId: true,
      previousPending: true,
      pendingCleared: true,
      updatedPending: true,
      currentCharges: true,
      discount: true,
      totalAmount: true,
      paidAmount: true,
      pendingAmount: true,
      createdAt: true,
      updatedAt: true,
      visit: {
        select: {
          visitId: true
        }
      }
    }
  });

  if (!billing || !billing.billId) {
    return null;
  }

  return {
    recordKey: billing.billId,
    payload: {
      id: billing.id,
      billId: billing.billId,
      previousPending: billing.previousPending,
      pendingCleared: billing.pendingCleared,
      updatedPending: billing.updatedPending,
      currentCharges: billing.currentCharges,
      discount: billing.discount,
      totalAmount: billing.totalAmount,
      paidAmount: billing.paidAmount,
      pendingAmount: billing.pendingAmount,
      createdAt: toIsoString(billing.createdAt),
      updatedAt: toIsoString(billing.updatedAt),
      visitId: billing.visit?.visitId || null
    }
  };
}

async function serializeModelRecord(prisma, model, result) {
  if (!result || typeof result !== "object") {
    return null;
  }

  switch (model) {
    case "User":
      return serializeUser(prisma, result);
    case "Patient":
      return serializePatient(prisma, result);
    case "Visit":
      return serializeVisit(prisma, result);
    case "Appointment":
      return serializeAppointment(prisma, result);
    case "Billing":
      return serializeBilling(prisma, result);
    default:
      return null;
  }
}

async function publishMutation({ prisma, model, action, result }) {
  const entity = MODEL_TO_ENTITY[model];
  if (!entity) {
    return;
  }

  const isDeleteAction = action === "delete";
  let recordKey = null;
  let payload = null;

  if (isDeleteAction) {
    recordKey = getDeleteRecordKey(model, result);
  } else {
    const serialized = await serializeModelRecord(prisma, model, result);
    if (!serialized) {
      return;
    }
    recordKey = serialized.recordKey;
    payload = serialized.payload;
  }

  if (!recordKey) {
    return;
  }

  await prisma.syncOutbox.upsert({
    where: {
      entity_recordKey: {
        entity,
        recordKey
      }
    },
    update: {
      operation: isDeleteAction ? "DELETE" : "UPSERT",
      payload: isDeleteAction ? null : JSON.stringify(payload),
      deleted: isDeleteAction,
      attempts: 0,
      nextRetryAt: null,
      lastError: null
    },
    create: {
      entity,
      recordKey,
      operation: isDeleteAction ? "DELETE" : "UPSERT",
      payload: isDeleteAction ? null : JSON.stringify(payload),
      deleted: isDeleteAction,
      attempts: 0
    }
  });
}

module.exports = {
  publishMutation
};
