const express = require("express");
const { authMiddleware } = require("../auth");
const generateAppointmentId = require("../utils/appointmentId");
const generateVisitId = require("../utils/visitId");
const { prisma } = require("../db/prisma");
const router = express.Router();
const appEmitter = require("../utils/emitter");
const { runSyncCycle } = require("../sync/engine");

function normalizePhone(rawPhone) {
  return String(rawPhone || "").replace(/\D/g, "");
}

function normalizeGender(rawGender) {
  const normalized = String(rawGender || "").trim().toLowerCase();
  if (normalized === "male" || normalized === "m") {
    return "Male";
  }
  if (normalized === "female" || normalized === "f") {
    return "Female";
  }
  if (normalized === "other" || normalized === "o") {
    return "Other";
  }
  return null;
}

function parsePatientAge(rawAge) {
  const age = Number(rawAge);
  if (!Number.isInteger(age) || age < 1 || age > 120) {
    return null;
  }
  return age;
}

function buildPatientUpdatePayload(appointmentLike) {
  const name = String(appointmentLike?.patientName || "").trim();
  const phone = normalizePhone(appointmentLike?.patientPhone);
  const age = parsePatientAge(appointmentLike?.patientAge);
  const gender = normalizeGender(appointmentLike?.patientGender);
  const address = String(appointmentLike?.patientAddress || "").trim();

  const payload = {};
  if (name) {
    payload.name = name;
  }
  if (phone) {
    payload.phone = phone;
  }
  if (age) {
    payload.age = age;
  }
  if (gender) {
    payload.gender = gender;
  }
  if (address) {
    payload.address = address;
  }

  return payload;
}

async function syncPatientFromAppointment(tx, visitPatientId, appointmentLike) {
  const updatePayload = buildPatientUpdatePayload(appointmentLike);
  if (!Object.keys(updatePayload).length || !visitPatientId) {
    return visitPatientId;
  }

  const updated = await tx.patient.update({
    where: { id: visitPatientId },
    data: updatePayload,
    select: { id: true }
  });

  return updated.id;
}

router.post(
  "/create",
  authMiddleware(["DOCTOR"]),
  async (req, res) => {
    const { patientId, visitType = "NEW" } = req.body;

    const patient = await prisma.patient.findUnique({
      where: { patientId }
    });

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const visit = await prisma.visit.create({
      data: {
        visitId: generateVisitId(),
        patientId: patient.id,
        doctorId: req.user.id,
        visitType
      }
    });

    res.json(visit);
  }
);

router.get(
  "/history/:patientId",
  authMiddleware(["DOCTOR"]),
  async (req, res) => {
    const patient = await prisma.patient.findUnique({
      where: { patientId: req.params.patientId },
      include: {
        visits: {
          orderBy: { createdAt: "desc" },
          include: { bill: true }
        }
      }
    });

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    res.json(patient);
  }
);

router.put(
  "/update/:visitId",
  authMiddleware(["DOCTOR"]),
  async (req, res) => {
    const { visitId } = req.params;

    const visit = await prisma.visit.findUnique({
      where: { visitId }
    });

    if (!visit) {
      return res.status(404).json({ message: "Visit not found" });
    }

    const updatedVisit = await prisma.visit.update({
      where: { visitId },
      data: {
        symptoms: req.body.symptoms,
        diagnosis: req.body.diagnosis,
        observations: req.body.observations,
        treatmentPlan: req.body.treatmentPlan,
        procedures: req.body.procedures,
        followUpAdvice: req.body.followUpAdvice,
        medicines: req.body.medicines,
        labTests: req.body.labTests
      }
    });

    res.json(updatedVisit);
  }
);

router.get(
  "/:visitId",
  authMiddleware(["DOCTOR"]),
  async (req, res) => {
    const visit = await prisma.visit.findUnique({
      where: { visitId: req.params.visitId },
      include: {
        bill: true,
        patient: true
      }
    });

    if (!visit) {
      return res.status(404).json({ message: "Visit not found" });
    }

    const lastBill = await prisma.billing.findFirst({
      where: {
        visit: {
          patientId: visit.patientId
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    const previousPending = lastBill?.updatedPending || 0;

    res.json({
      ...visit,
      previousPending
    });
  }
);

const nodemailer = require("nodemailer");
const html_pdf = require("html-pdf-node");
const WHATSAPP_SERVICE_URL = process.env.WHATSAPP_SERVICE_URL || "http://localhost:5000";

function safeParseMedicines(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeEmailAddress(value) {
  return String(value || "").trim().toLowerCase();
}

function isLikelyEmail(value) {
  return /.+@.+\..+/.test(value);
}

function buildVisitReportPdfFile(visit, completed, medicines, symptoms) {
  return {
    content: `
          <html>
            <head>
              <style>
                body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 40px; color: #1f2937; line-height: 1.5; }
                .header { background: #059669; color: white; padding: 30px; border-radius: 8px; margin-bottom: 30px; text-align: center; page-break-after: avoid; }
                .section { margin-bottom: 25px; border-bottom: 1px solid #f3f4f6; padding-bottom: 15px; page-break-inside: avoid; }
                .section-title { color: #059669; font-weight: bold; margin-bottom: 10px; font-size: 18px; border-bottom: 2px solid #059669; display: inline-block; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; page-break-inside: avoid; }
                th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; font-size: 12px; }
                th { background-color: #f9fafb; color: #4b5563; font-weight: bold; }
                .billing-box { background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px; page-break-inside: avoid; }
                .billing-row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 13px; }
                .billing-total { font-weight: bold; border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 10px; font-size: 15px; }
                .footer { font-size: 10px; color: #9ca3af; text-align: center; margin-top: 50px; border-top: 1px solid #f3f4f6; pt: 20px; page-break-inside: avoid; }
                .highlight { color: #059669; font-weight: bold; }
                .pending { color: #d97706; font-weight: bold; }
              </style>
            </head>
            <body>
              <div class="header">
                <h1 style="margin:0">Orisyn</h1>
                <p style="margin:5px 0 0; opacity: 0.9;">The AI Operating System for Dental Clinics</p>
              </div>
              
              <div class="section">
                <div class="section-title">Patient Information</div>
                <table style="border:none">
                  <tr style="border:none">
                    <td style="border:none"><strong>Name:</strong> ${visit.patient.name}</td>
                    <td style="border:none"><strong>Patient ID:</strong> ${visit.patient.patientId}</td>
                  </tr>
                  <tr style="border:none">
                    <td style="border:none"><strong>Date:</strong> ${new Date(visit.createdAt).toLocaleString()}</td>
                    <td style="border:none"><strong>Visit ID:</strong> ${visit.visitId}</td>
                  </tr>
                  <tr style="border:none">
                    <td style="border:none"><strong>Age/Gender:</strong> ${visit.patient.age || "-"} / ${visit.patient.gender || "-"}</td>
                    <td style="border:none"><strong>Contact:</strong> ${visit.patient.phone || "-"}</td>
                  </tr>
                  <tr style="border:none">
                    <td style="border:none" colspan="2"><strong>Address:</strong> ${visit.patient.address || "-"}</td>
                  </tr>
                  ${visit.patient.allergies ? `<tr style="border:none"><td style="border:none; color: #dc2626;" colspan="2"><strong>Allergies:</strong> ${visit.patient.allergies}</td></tr>` : ''}
                </table>
              </div>

              <div class="section">
                <div class="section-title">Clinical Assessment</div>
                <p><strong>Symptoms:</strong> ${symptoms}</p>
                <p><strong>Diagnosis:</strong> <span class="highlight">${visit.diagnosis || "Not recorded."}</span></p>
                <p><strong>Observations:</strong> ${visit.observations || "Not recorded."}</p>
                <p><strong>Lab Tests:</strong> ${visit.labTests || "Not recorded."}</p>
                <p><strong>Follow-up Advice:</strong> ${visit.followUpAdvice || "Not recorded."}</p>
              </div>

              <div class="section">
                <div class="section-title">Treatment Plan</div>
                <p>${visit.treatmentPlan || "As discussed with doctor."}</p>
                <p><strong>Procedures:</strong> ${visit.procedures || "Not recorded."}</p>
              </div>

              ${medicines.length > 0 ? `
              <div class="section">
                <div class="section-title">Prescription</div>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                  <tr style="background-color: #f9fafb;">
                    <th style="border: 1px solid #e5e7eb; padding: 10px; text-align: left; color: #4b5563; font-weight: bold; font-size: 12px;">Medicine Name</th>
                    <th style="border: 1px solid #e5e7eb; padding: 10px; text-align: left; color: #4b5563; font-weight: bold; font-size: 12px;">Dosage</th>
                    <th style="border: 1px solid #e5e7eb; padding: 10px; text-align: left; color: #4b5563; font-weight: bold; font-size: 12px;">Frequency</th>
                    <th style="border: 1px solid #e5e7eb; padding: 10px; text-align: left; color: #4b5563; font-weight: bold; font-size: 12px;">Duration</th>
                  </tr>
                  ${medicines.map(m => `
                    <tr>
                      <td style="border: 1px solid #e5e7eb; padding: 10px; font-weight: bold; font-size: 12px;">${m.name}</td>
                      <td style="border: 1px solid #e5e7eb; padding: 10px; font-size: 12px; color: #4b5563;">${m.dosage || "-"}</td>
                      <td style="border: 1px solid #e5e7eb; padding: 10px; font-size: 12px; color: #4b5563;">${m.frequency || "-"}</td>
                      <td style="border: 1px solid #e5e7eb; padding: 10px; font-size: 12px; color: #4b5563;">${m.duration || "-"}</td>
                    </tr>
                  `).join('')}
                </table>
              </div>
              ` : `
              <div class="section">
                <div class="section-title">Prescription</div>
                <p style="font-style: italic; color: #6b7280; font-size: 12px;">No medicines prescribed for this visit.</p>
              </div>
              `}

              ${visit.bill ? `
              <div class="section">
                <div class="section-title">Billing Summary</div>
                <div class="billing-box">
                  <div class="billing-row"><span>Total Visit Charges:</span> <span>₹${visit.bill.currentCharges || 0}</span></div>
                  <div class="billing-row"><span>Discount Applied:</span> <span style="color:red">- ₹${visit.bill.discount || 0}</span></div>
                  <div class="billing-row billing-total"><span>Total Amount Payable:</span> <span class="highlight">₹${(visit.bill.currentCharges || 0) - (visit.bill.discount || 0)}</span></div>
                  <div class="billing-row"><span>Amount Received:</span> <span class="highlight">₹${visit.bill.paidAmount || 0}</span></div>
                  <div class="billing-row billing-total"><span>Current Outstanding:</span> <span class="pending">₹${visit.bill.pendingAmount || 0}</span></div>
                </div>
              </div>
              ` : `
              <div class="section">
                <div class="section-title">Billing Summary</div>
                <p style="font-style: italic; color: #6b7280; font-size: 12px;">No billing summary details available for this visit.</p>
              </div>
              `}

              <div class="footer">
                <p>This is an AI-assisted electronic medical record generated on ${new Date().toLocaleDateString()}.</p>
                <p>Consult your dentist for any clarification regarding this report.</p>
                <p><strong>Health is Wealth. Keep Smiling!</strong></p>
              </div>
            </body>
          </html>
        ` };
}

async function sendWhatsAppDocument(to, pdfBuffer, filename, caption) {
  if (!to || !pdfBuffer || !pdfBuffer.length) {
    return;
  }

  const baseUrl = String(WHATSAPP_SERVICE_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const form = new FormData();
    form.append("to", String(to));
    form.append("filename", String(filename || "report.pdf"));
    if (caption) {
      form.append("caption", String(caption));
    }
    form.append(
      "file",
      new Blob([pdfBuffer], { type: "application/pdf" }),
      String(filename || "report.pdf")
    );

    const response = await fetch(`${baseUrl}/send-document`, {
      method: "POST",
      body: form,
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`WhatsApp document send failed (${response.status}): ${body}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function sendWhatsAppText(to, text) {
  if (!to || !text) {
    return;
  }

  const baseUrl = String(WHATSAPP_SERVICE_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${baseUrl}/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ to, text }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn("WhatsApp report send failed:", response.status, body);
    }
  } catch (error) {
    console.warn("WhatsApp report send error:", error?.message || error);
  } finally {
    clearTimeout(timeout);
  }
}

function buildWhatsAppReportMessage({ visit, completed, medicines }) {
  const safeName = String(visit.patient?.name || "Patient").trim() || "Patient";
  const doctorName = String(visit.doctor?.name || "Doctor").trim() || "Doctor";
  const visitDate = new Date(visit.createdAt).toLocaleString();
  const diagnosis = String(visit.diagnosis || "Not recorded").trim();
  const followUp = String(visit.followUpAdvice || "Not recorded").trim();
  const treatment = String(visit.treatmentPlan || "Not recorded").trim();
  const symptoms = String(visit.symptoms || "Not recorded").trim();

  const medicineLines = (medicines || [])
    .slice(0, 5)
    .map((m) => {
      const name = String(m?.name || "").trim();
      const dose = String(m?.dosage || "").trim();
      const freq = String(m?.frequency || "").trim();
      const dur = String(m?.duration || "").trim();
      const details = [dose, freq, dur].filter(Boolean).join(" | ");
      return details ? `- ${name} (${details})` : `- ${name}`;
    })
    .filter(Boolean);

  const billing = visit.bill || {};
  const lines = [
    `Hello ${safeName}, your visit report is ready.`,
    `Visit ID: ${visit.visitId}`,
    `Doctor: ${doctorName}`,
    `Date: ${visitDate}`,
    `Status: ${completed ? "Completed" : "Ongoing"}`,
    `Symptoms: ${symptoms}`,
    `Diagnosis: ${diagnosis}`,
    `Treatment: ${treatment}`,
    `Follow-up: ${followUp}`
  ];

  if (medicineLines.length) {
    lines.push("Medicines:");
    lines.push(...medicineLines);
  }

  lines.push(`Total: ₹${billing.currentCharges || 0}`);
  lines.push(`Paid: ₹${billing.paidAmount || 0}`);
  lines.push(`Pending: ₹${billing.pendingAmount || 0}`);

  const message = lines.join("\n");
  return message.length > 1800 ? `${message.slice(0, 1790)}...` : message;
}

router.post(
  "/close/:visitId",
  authMiddleware(["DOCTOR"]),
  async (req, res) => {
    try {
      const { visitId } = req.params;
      const { isCompleted, patientEmail, sendEmail, sendWhatsApp, patientPhone } = req.body;
      const normalizedPatientEmail = normalizeEmailAddress(patientEmail);
      const shouldSendEmail =
        (sendEmail === true || sendEmail === "true" || sendEmail === 1 || sendEmail === "1") &&
        isLikelyEmail(normalizedPatientEmail);
      const normalizedPatientPhone = normalizePhone(patientPhone || "");
      const completed =
        isCompleted === true ||
        isCompleted === "true" ||
        isCompleted === 1 ||
        isCompleted === "1";

      const visit = await prisma.visit.findUnique({
        where: { visitId },
        include: {
          bill: true,
          patient: true,
          doctor: true
        }
      });

      if (!visit) {
        return res.status(404).json({ message: "Visit not found" });
      }

      if (!visit.bill) {
        return res.status(400).json({
          message: "Billing not completed for this visit"
        });
      }

      let completedAppointmentId = null;

      // Keep closure deterministic: close visit first, then run linkage as best-effort.
      await prisma.visit.update({
        where: { visitId },
        data: {
          clinicalStatus: completed ? "CLINICALLY_COMPLETED" : "IN_PROGRESS",
          paymentStatus: visit.bill.pendingAmount > 0 ? "PARTIALLY_PAID" : "PAID",
          caseOutcome: completed ? "COMPLETED" : "ONGOING"
        }
      });

      if (completed) {
        try {
          const appointmentSelect = {
            appointmentId: true,
            status: true,
            patientId: true,
            patientName: true,
            patientPhone: true,
            patientAge: true,
            patientGender: true,
            patientAddress: true,
            scheduledAt: true,
            reason: true
          };

          const linkedAppointment = await prisma.appointment.findUnique({
            where: {
              linkedVisitId: visitId
            },
            select: appointmentSelect
          });

          const visitPatientPhone = normalizePhone(visit.patient?.phone);

          let appointmentToComplete = linkedAppointment;

          const visitDayStart = new Date(visit.createdAt);
          visitDayStart.setHours(0, 0, 0, 0);
          const visitDayEnd = new Date(visitDayStart);
          visitDayEnd.setDate(visitDayEnd.getDate() + 1);

          if (!appointmentToComplete) {
            // Legacy fallback: auto-link only when exactly one same-day candidate exists.
            const fallbackCandidates = await prisma.appointment.findMany({
              where: {
                linkedVisitId: null,
                doctorId: visit.doctorId,
                scheduledAt: {
                  gte: visitDayStart,
                  lt: visitDayEnd
                },
                status: {
                  in: ["REQUESTED", "CONFIRMED"]
                },
                OR: [
                  { patientId: visit.patientId },
                  ...(visitPatientPhone ? [{ patientPhone: visitPatientPhone }] : [])
                ]
              },
              orderBy: {
                scheduledAt: "asc"
              },
              select: appointmentSelect,
              take: 2
            });

            if (fallbackCandidates.length === 1) {
              appointmentToComplete = fallbackCandidates[0];
            }
          }

          if (appointmentToComplete) {
            const syncedPatientId = await syncPatientFromAppointment(
              prisma,
              visit.patientId,
              appointmentToComplete
            );

            await prisma.appointment.update({
              where: {
                appointmentId: appointmentToComplete.appointmentId
              },
              data: {
                status: "COMPLETED",
                linkedVisitId: visitId,
                patientId: syncedPatientId,
                doctorId: visit.doctorId
              }
            });

            completedAppointmentId = appointmentToComplete.appointmentId;
          } else {
            // If no appointment can be linked confidently, record a completed WALK_IN appointment
            // so completed dashboards still reflect the finished visit.
            const walkInReason =
              [visit.symptoms, visit.diagnosis, visit.treatmentPlan]
                .map((value) => String(value || "").trim())
                .find(Boolean) ||
              "Completed visit";

            const createdCompletedAppointment = await prisma.appointment.create({
              data: {
                appointmentId: generateAppointmentId(),
                patientId: visit.patientId,
                doctorId: visit.doctorId,
                patientPhone: visitPatientPhone || String(visit.patient?.phone || "").trim() || "UNKNOWN",
                patientName: String(visit.patient?.name || "").trim() || "Unknown",
                patientAge: visit.patient?.age ?? null,
                patientGender: visit.patient?.gender ?? null,
                patientAddress: visit.patient?.address ?? null,
                scheduledAt: visit.createdAt,
                status: "COMPLETED",
                source: "WALK_IN",
                linkedVisitId: visitId,
                reason: walkInReason
              },
              select: {
                appointmentId: true
              }
            });

            completedAppointmentId = createdCompletedAppointment.appointmentId;
          }
        } catch (appointmentSyncError) {
          // Keep visit closure successful even if appointment-link sync hits legacy schema/data issues.
          console.error("Visit close appointment sync warning:", appointmentSyncError);
        }
      }

      // Handle Email & PDF
      let emailSent = false;
      let emailError = null;
      let sharedPdfBuffer = null;

      if (shouldSendEmail) {
        try {
          const medicines = safeParseMedicines(visit.medicines);
          const symptoms = visit.symptoms || "None";

          const smtpHost = String(process.env.SMTP_HOST || "").trim();
          const smtpUser = String(process.env.SMTP_USER || "").trim();
          const smtpPass = String(process.env.SMTP_PASS || "").trim();
          const smtpPort = Number(process.env.SMTP_PORT) || 587;
          const smtpSecure = String(process.env.SMTP_SECURE || "").trim().toLowerCase() === "true";

          if (!smtpHost || !smtpUser || !smtpPass) {
            throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in backend/.env");
          }

          const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #059669; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">Orisyn Clinical Report</h1>
              <p style="margin: 5px 0 0; opacity: 0.9;">The AI Operating System for Dental Clinics</p>
            </div>
            <div style="padding: 20px;">
              <p>Dear <strong>${visit.patient.name}</strong>,</p>
              <p>Please find attached the comprehensive clinical report for your visit on ${new Date(visit.createdAt).toLocaleDateString()}.</p>
              
              <div style="background-color: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #059669;">
                <h3 style="margin-top: 0; color: #374151;">Billing Summary:</h3>
                ${visit.bill ? `
                <p style="margin: 5px 0; font-size: 14px;">Total Charges: <strong>₹${visit.bill.currentCharges || 0}</strong></p>
                <p style="margin: 5px 0; font-size: 14px;">Discount Applied: <strong>₹${visit.bill.discount || 0}</strong></p>
                <p style="margin: 5px 0; font-size: 14px; color: #059669;">Amount Paid: <strong>₹${visit.bill.paidAmount || 0}</strong></p>
                <p style="margin: 5px 0; font-size: 14px; color: #d97706;">Current Outstanding: <strong>₹${visit.bill.pendingAmount || 0}</strong></p>
                ` : `<p>No billing completed for this visit.</p>`}
              </div>

              <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
              <h3>Visit Details:</h3>
              <ul style="list-style: none; padding: 0;">
                <li><strong>Visit ID:</strong> ${visit.visitId}</li>
                <li><strong>Doctor:</strong> ${visit.doctor?.name || "Dr. Prasad"}</li>
                <li><strong>Status:</strong> ${completed ? "Completed" : "Ongoing (Follow-up Required)"}</li>
              </ul>
              <p style="font-size: 12px; color: #666; margin-top: 30px;">Health is wealth. Keep smiling!<br>Orisyn Care Team</p>
            </div>
          </div>
        `;

          const pdfOptions = { format: 'A4' };
          const pdfFile = buildVisitReportPdfFile(visit, completed, medicines, symptoms);

          let attachments = [];
          try {
            const pdfBuffer = await html_pdf.generatePdf(pdfFile, pdfOptions);
            sharedPdfBuffer = pdfBuffer;
            attachments = [
              {
                filename: `Report_${visit.visitId}.pdf`,
                content: pdfBuffer
              }
            ];
          } catch (pdfError) {
            // Fallback to email without PDF if PDF engine fails on host machine.
            console.error("Failed to generate PDF, sending email without attachment:", pdfError);
          }

          // Configure Mailer (Using environment variables if available)
          const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
            auth: {
              user: smtpUser,
              pass: smtpPass,
            },
          });

          const fromAddress = String(process.env.SMTP_FROM || smtpUser || "reports@dentalcare.com").trim();

          await transporter.sendMail({
            from: `"Orisyn AI" <${fromAddress}>`,
            to: normalizedPatientEmail,
            subject: `Your Orisyn Visit Report - ${visit.visitId}`,
            html: htmlContent,
            attachments
          });

          emailSent = true;
          console.log(`Email sent to ${normalizedPatientEmail}`);
        } catch (err) {
          emailError = String(err?.message || err || "Unknown email error");
          console.error("Failed to send email/PDF:", err);
          // We don't fail the whole request since the visit is already closed in DB.
        }
      }

      let whatsappSent = false;
      let whatsappError = null;
      const shouldSendWhatsApp =
        (sendWhatsApp === true || sendWhatsApp === "true" || sendWhatsApp === 1 || sendWhatsApp === "1") &&
        (normalizedPatientPhone || normalizePhone(visit.patient?.phone)).length >= 10;

      if (shouldSendWhatsApp) {
        try {
          const medicines = safeParseMedicines(visit.medicines);
          const symptoms = visit.symptoms || "None";
          const targetPhone = normalizedPatientPhone || normalizePhone(visit.patient?.phone);
          const message = buildWhatsAppReportMessage({ visit, completed, medicines });

          await sendWhatsAppText(targetPhone, message);

          let pdfBuffer = sharedPdfBuffer;
          if (!pdfBuffer) {
            try {
              const pdfFile = buildVisitReportPdfFile(visit, completed, medicines, symptoms);
              pdfBuffer = await html_pdf.generatePdf(pdfFile, { format: 'A4' });
            } catch (pdfError) {
              console.error("Failed to generate PDF for WhatsApp:", pdfError);
              pdfBuffer = null;
            }
          }

          if (pdfBuffer && pdfBuffer.length) {
            await sendWhatsAppDocument(
              targetPhone,
              pdfBuffer,
              `Report_${visit.visitId}.pdf`,
              `Orisyn Clinical Report - Visit ${visit.visitId}`
            );
          }

          whatsappSent = true;
        } catch (err) {
          whatsappError = String(err?.message || err || "Unknown WhatsApp error");
          console.error("Failed to send WhatsApp report:", err);
        }
      }

      if (completedAppointmentId) {
        appEmitter.emit("appointments-changed", { action: "complete", appointmentId: completedAppointmentId });
        void runSyncCycle().catch((syncError) => {
          console.warn("Visit close appointment sync warning:", syncError?.message || syncError);
        });
      }

      return res.json({
        status: completed ? "COMPLETED" : "ONGOING",
        message: "Visit closed successfully",
        appointmentId: completedAppointmentId,
        emailSent,
        emailError,
        whatsappSent,
        whatsappError
      });
    } catch (err) {
      console.error("Visit close error:", err);
      return res.status(500).json({
        message: "Failed to close visit"
      });
    }
  }
);

router.post(
  "/send-report/:visitId",
  authMiddleware(["DOCTOR"]),
  async (req, res) => {
    try {
      const { visitId } = req.params;
      const { patientEmail, sendEmail, patientPhone, sendWhatsApp } = req.body;
      const normalizedPatientEmail = normalizeEmailAddress(patientEmail);
      const shouldSendEmail =
        (sendEmail === true || sendEmail === "true" || sendEmail === 1 || sendEmail === "1") &&
        isLikelyEmail(normalizedPatientEmail);
      const normalizedPatientPhone = normalizePhone(patientPhone || "");
      
      const visit = await prisma.visit.findUnique({
        where: { visitId },
        include: {
          bill: true,
          patient: true,
          doctor: true
        }
      });

      if (!visit) {
        return res.status(404).json({ message: "Visit not found" });
      }

      const completed =
        visit.caseOutcome === "COMPLETED" ||
        visit.clinicalStatus === "CLINICALLY_COMPLETED";

      // Handle Email & PDF
      let emailSent = false;
      let emailError = null;
      let sharedPdfBuffer = null;

      if (shouldSendEmail) {
        try {
          const medicines = safeParseMedicines(visit.medicines);
          const symptoms = visit.symptoms || "None";

          const smtpHost = String(process.env.SMTP_HOST || "").trim();
          const smtpUser = String(process.env.SMTP_USER || "").trim();
          const smtpPass = String(process.env.SMTP_PASS || "").trim();
          const smtpPort = Number(process.env.SMTP_PORT) || 587;
          const smtpSecure = String(process.env.SMTP_SECURE || "").trim().toLowerCase() === "true";

          if (!smtpHost || !smtpUser || !smtpPass) {
            throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in backend/.env");
          }

          const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #059669; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">Orisyn Clinical Report</h1>
              <p style="margin: 5px 0 0; opacity: 0.9;">The AI Operating System for Dental Clinics</p>
            </div>
            <div style="padding: 20px;">
              <p>Dear <strong>${visit.patient.name}</strong>,</p>
              <p>Please find attached the comprehensive clinical report for your visit on ${new Date(visit.createdAt).toLocaleDateString()}.</p>
              
              <div style="background-color: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #059669;">
                <h3 style="margin-top: 0; color: #374151;">Billing Summary:</h3>
                ${visit.bill ? `
                <p style="margin: 5px 0; font-size: 14px;">Total Charges: <strong>₹${visit.bill.currentCharges || 0}</strong></p>
                <p style="margin: 5px 0; font-size: 14px;">Discount Applied: <strong>₹${visit.bill.discount || 0}</strong></p>
                <p style="margin: 5px 0; font-size: 14px; color: #059669;">Amount Paid: <strong>₹${visit.bill.paidAmount || 0}</strong></p>
                <p style="margin: 5px 0; font-size: 14px; color: #d97706;">Current Outstanding: <strong>₹${visit.bill.pendingAmount || 0}</strong></p>
                ` : `<p>No billing completed for this visit.</p>`}
              </div>

              <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
              <h3>Visit Details:</h3>
              <ul style="list-style: none; padding: 0;">
                <li><strong>Visit ID:</strong> ${visit.visitId}</li>
                <li><strong>Doctor:</strong> ${visit.doctor?.name || "Dr. Prasad"}</li>
                <li><strong>Status:</strong> ${completed ? "Completed" : "Ongoing (Follow-up Required)"}</li>
              </ul>
              <p style="font-size: 12px; color: #666; margin-top: 30px;">Health is wealth. Keep smiling!<br>Orisyn Care Team</p>
            </div>
          </div>
        `;

          const pdfOptions = { format: 'A4' };
          const pdfFile = buildVisitReportPdfFile(visit, completed, medicines, symptoms);

          let attachments = [];
          try {
            const pdfBuffer = await html_pdf.generatePdf(pdfFile, pdfOptions);
            sharedPdfBuffer = pdfBuffer;
            attachments = [
              {
                filename: `Report_${visit.visitId}.pdf`,
                content: pdfBuffer
              }
            ];
          } catch (pdfError) {
            console.error("Failed to generate PDF, sending email without attachment:", pdfError);
          }

          const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
            auth: {
              user: smtpUser,
              pass: smtpPass,
            },
          });

          const fromAddress = String(process.env.SMTP_FROM || smtpUser || "reports@dentalcare.com").trim();

          await transporter.sendMail({
            from: `"Orisyn AI" <${fromAddress}>`,
            to: normalizedPatientEmail,
            subject: `Your Orisyn Visit Report - ${visit.visitId}`,
            html: htmlContent,
            attachments
          });

          emailSent = true;
          console.log(`Email sent to ${normalizedPatientEmail}`);
        } catch (err) {
          emailError = String(err?.message || err || "Unknown email error");
          console.error("Failed to send email/PDF:", err);
        }
      }

      let whatsappSent = false;
      let whatsappError = null;
      const shouldSendWhatsApp =
        (sendWhatsApp === true || sendWhatsApp === "true" || sendWhatsApp === 1 || sendWhatsApp === "1") &&
        (normalizedPatientPhone || normalizePhone(visit.patient?.phone)).length >= 10;

      if (shouldSendWhatsApp) {
        try {
          const medicines = safeParseMedicines(visit.medicines);
          const symptoms = visit.symptoms || "None";
          const targetPhone = normalizedPatientPhone || normalizePhone(visit.patient?.phone);
          const message = buildWhatsAppReportMessage({ visit, completed, medicines });

          await sendWhatsAppText(targetPhone, message);

          let pdfBuffer = sharedPdfBuffer;
          if (!pdfBuffer) {
            try {
              const pdfFile = buildVisitReportPdfFile(visit, completed, medicines, symptoms);
              pdfBuffer = await html_pdf.generatePdf(pdfFile, { format: 'A4' });
            } catch (pdfError) {
              console.error("Failed to generate PDF for WhatsApp:", pdfError);
              pdfBuffer = null;
            }
          }

          if (pdfBuffer && pdfBuffer.length) {
            await sendWhatsAppDocument(
              targetPhone,
              pdfBuffer,
              `Report_${visit.visitId}.pdf`,
              `Orisyn Clinical Report - Visit ${visit.visitId}`
            );
          }

          whatsappSent = true;
        } catch (err) {
          whatsappError = String(err?.message || err || "Unknown WhatsApp error");
          console.error("Failed to send WhatsApp report:", err);
        }
      }

      return res.json({
        emailSent,
        emailError,
        whatsappSent,
        whatsappError
      });
    } catch (err) {
      console.error("Report send error:", err);
      return res.status(500).json({
        message: "Failed to send report"
      });
    }
  }
);

router.delete(
  "/:visitId",
  authMiddleware(["DOCTOR"]),
  async (req, res) => {
    const { visitId } = req.params;

    const visit = await prisma.visit.findUnique({
      where: { visitId }
    });

    if (!visit) {
      return res.status(404).json({ message: "Visit not found" });
    }

    if (visit.clinicalStatus === "CLINICALLY_COMPLETED") {
      return res.status(400).json({
        message: "Completed visits cannot be deleted"
      });
    }

    await prisma.visit.delete({
      where: { visitId }
    });

    res.sendStatus(204);
  }
);

router.patch(
  "/:visitId/type",
  authMiddleware(["DOCTOR"]),
  async (req, res) => {
    const { visitId } = req.params;
    const { visitType } = req.body;

    if (!["NEW", "FOLLOW_UP"].includes(visitType)) {
      return res.status(400).json({ message: "Invalid visit type" });
    }

    const visit = await prisma.visit.findUnique({
      where: { visitId }
    });

    if (!visit) {
      return res.status(404).json({ message: "Visit not found" });
    }

    if (
      visit.symptoms ||
      visit.diagnosis ||
      visit.treatmentPlan
    ) {
      return res.status(400).json({
        message:
          "Visit type cannot be changed after clinical work starts"
      });
    }

    const updated = await prisma.visit.update({
      where: { visitId },
      data: { visitType }
    });

    res.json(updated);
  }
);

module.exports = router;
