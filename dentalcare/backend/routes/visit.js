const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authMiddleware } = require("../auth");
const generateVisitId = require("../utils/visitId");

const prisma = new PrismaClient();
const router = express.Router();

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

router.post(
  "/close/:visitId",
  authMiddleware(["DOCTOR"]),
  async (req, res) => {
    const { visitId } = req.params;
    const { isCompleted, patientEmail, sendEmail } = req.body;

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

    // Update visit status
    const updatedVisit = await prisma.visit.update({
      where: { visitId },
      data: {
        clinicalStatus: isCompleted ? "CLINICALLY_COMPLETED" : "IN_PROGRESS",
        paymentStatus: visit.bill.pendingAmount > 0 ? "PARTIALLY_PAID" : "PAID",
        caseOutcome: isCompleted ? "COMPLETED" : "ONGOING"
      }
    });

    // Handle Email & PDF
    if (sendEmail && patientEmail) {
      try {
        const medicines = JSON.parse(visit.medicines || "[]");
        const symptoms = visit.symptoms || "None";

        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #059669; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">Dental Care Report</h1>
              <p style="margin: 5px 0 0; opacity: 0.9;">Visit Summary & Prescription</p>
            </div>
            <div style="padding: 20px;">
              <p>Dear <strong>${visit.patient.name}</strong>,</p>
              <p>Please find attached the comprehensive clinical report for your visit on ${new Date(visit.createdAt).toLocaleDateString()}.</p>
              
              <div style="background-color: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #059669;">
                <h3 style="margin-top: 0; color: #374151;">Billing Summary:</h3>
                <p style="margin: 5px 0; font-size: 14px;">Total Charges: <strong>₹${visit.bill.currentCharges || 0}</strong></p>
                <p style="margin: 5px 0; font-size: 14px;">Discount Applied: <strong>₹${visit.bill.discount || 0}</strong></p>
                <p style="margin: 5px 0; font-size: 14px; color: #059669;">Amount Paid: <strong>₹${visit.bill.paidAmount || 0}</strong></p>
                <p style="margin: 5px 0; font-size: 14px; color: #d97706;">Current Outstanding: <strong>₹${visit.bill.pendingAmount || 0}</strong></p>
              </div>

              <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
              <h3>Visit Details:</h3>
              <ul style="list-style: none; padding: 0;">
                <li><strong>Visit ID:</strong> ${visit.visitId}</li>
                <li><strong>Doctor:</strong> ${visit.doctor?.name || "Dr. Prasad"}</li>
                <li><strong>Status:</strong> ${isCompleted ? "Completed" : "Ongoing (Follow-up Required)"}</li>
              </ul>
              <p style="font-size: 12px; color: #666; margin-top: 30px;">Health is wealth. Keep smiling!<br>DentalCare Team</p>
            </div>
          </div>
        `;

        const pdfOptions = { format: 'A4' };
        const pdfFile = {
          content: `
          <html>
            <head>
              <style>
                body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 40px; color: #1f2937; line-height: 1.5; }
                .header { background: #059669; color: white; padding: 30px; border-radius: 8px; margin-bottom: 30px; text-align: center; }
                .section { margin-bottom: 25px; border-bottom: 1px solid #f3f4f6; padding-bottom: 15px; }
                .section-title { color: #059669; font-weight: bold; margin-bottom: 10px; font-size: 18px; border-bottom: 2px solid #059669; display: inline-block; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; font-size: 12px; }
                th { background-color: #f9fafb; color: #4b5563; font-weight: bold; }
                .billing-box { background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px; }
                .billing-row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 13px; }
                .billing-total { font-weight: bold; border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 10px; font-size: 15px; }
                .footer { font-size: 10px; color: #9ca3af; text-align: center; margin-top: 50px; border-top: 1px solid #f3f4f6; pt: 20px; }
                .highlight { color: #059669; font-weight: bold; }
                .pending { color: #d97706; font-weight: bold; }
              </style>
            </head>
            <body>
              <div class="header">
                <h1 style="margin:0">Dental Care</h1>
                <p style="margin:5px 0 0; opacity: 0.9;">Official Clinical & Billing Report</p>
              </div>
              
              <div class="section">
                <div class="section-title">Patient Information</div>
                <table style="border:none">
                  <tr style="border:none"><td style="border:none"><strong>Name:</strong> ${visit.patient.name}</td><td style="border:none"><strong>Patient ID:</strong> ${visit.patient.patientId}</td></tr>
                  <tr style="border:none"><td style="border:none"><strong>Date:</strong> ${new Date(visit.createdAt).toLocaleString()}</td><td style="border:none"><strong>Visit ID:</strong> ${visit.visitId}</td></tr>
                </table>
              </div>

              <div class="section">
                <div class="section-title">Clinical Assessment</div>
                <p><strong>Symptoms:</strong> ${symptoms}</p>
                <p><strong>Diagnosis:</strong> <span class="highlight">${visit.diagnosis || "—"}</span></p>
                <p><strong>Observations:</strong> ${visit.observations || "—"}</p>
              </div>

              <div class="section">
                <div class="section-title">Treatment Plan</div>
                <p>${visit.treatmentPlan || "As discussed with doctor."}</p>
              </div>

              ${medicines.length > 0 ? `
              <div class="section">
                <div class="section-title">Prescription</div>
                <table>
                  <tr><th>Medicine</th><th>Dosage</th><th>Frequency</th><th>Duration</th></tr>
                  ${medicines.map(m => `<tr><td><strong>${m.name}</strong></td><td>${m.dosage || "-"}</td><td>${m.frequency || "-"}</td><td>${m.duration || "-"}</td></tr>`).join('')}
                </table>
              </div>
              ` : ''}

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

              <div class="footer">
                <p>This is an AI-assisted electronic medical record generated on ${new Date().toLocaleDateString()}.</p>
                <p>Consult your dentist for any clarification regarding this report.</p>
                <p><strong>Health is Wealth. Keep Smiling!</strong></p>
              </div>
            </body>
          </html>
        ` };

        const pdfBuffer = await html_pdf.generatePdf(pdfFile, pdfOptions);

        // Configure Mailer (Using environment variables if available)
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT),
          secure: process.env.SMTP_SECURE === 'true', // Converts the string "true" to a boolean true
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        await transporter.sendMail({
          from: '"DentalCare AI" <reports@dentalcare.com>',
          to: patientEmail,
          subject: `Your Dental Visit Report - ${visit.visitId}`,
          html: htmlContent,
          attachments: [
            {
              filename: `Report_${visit.visitId}.pdf`,
              content: pdfBuffer
            }
          ]
        });

        console.log(`Email sent to ${patientEmail}`);
      } catch (err) {
        console.error("Failed to send email/PDF:", err);
        // We don't fail the whole request since the visit is already closed in DB
      }
    }

    res.json({
      status: isCompleted ? "COMPLETED" : "ONGOING",
      message: "Visit closed successfully"
    });
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
