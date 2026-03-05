const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authMiddleware } = require("../auth");
const generateBillId = require("../utils/billId");

const prisma = new PrismaClient();
const router = express.Router();

router.post(
  "/create",
  authMiddleware(["DOCTOR"]),
  async (req, res) => {
    try {
      const {
        visitId,
        currentCharges,
        discount = 0,
        paidAmount = 0,
        pendingCleared = 0
      } = req.body;

      if (!visitId) {
        return res.status(400).json({ message: "visitId missing" });
      }

      if (currentCharges <= 0) {
        return res.status(400).json({
          message: "Current charges must be greater than 0"
        });
      }

      if (discount < 0 || paidAmount < 0 || pendingCleared < 0) {
        return res.status(400).json({
          message: "Amounts cannot be negative"
        });
      }

      if (discount > currentCharges) {
        return res.status(400).json({
          message: "Discount cannot exceed visit charges"
        });
      }

      const visit = await prisma.visit.findUnique({
        where: { id: visitId }
      });

      if (!visit) {
        return res.status(404).json({ message: "Visit not found" });
      }

      const existingBill = await prisma.billing.findUnique({
        where: { visitId: visit.id }
      });

      if (existingBill) {
        return res.status(400).json({
          message: "Bill already exists for this visit"
        });
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

      if (pendingCleared > previousPending) {
        return res.status(400).json({
          message: "Pending cleared cannot exceed previous pending"
        });
      }

      const totalAmount = currentCharges - discount;
      const visitPending = totalAmount - paidAmount;

      const updatedPending =
        previousPending - pendingCleared + visitPending;

      let paymentStatus = "NOT_BILLED";

      if (paidAmount > 0 && visitPending > 0) {
        paymentStatus = "PARTIALLY_PAID";
      }

      if (visitPending <= 0) {
        paymentStatus = "PAID";
      }

      const bill = await prisma.billing.create({
        data: {
          billId: generateBillId(),
          visitId: visit.id,

          previousPending,
          pendingCleared,
          updatedPending,

          currentCharges,
          discount,
          totalAmount,
          paidAmount,
          pendingAmount: visitPending
        }
      });

      await prisma.visit.update({
        where: { id: visit.id },
        data: { paymentStatus }
      });

      return res.json({
        message: "Bill generated successfully",
        bill
      });

    } catch (err) {
      console.error("Billing error:", err);
      return res.status(500).json({
        message: "Failed to generate bill"
      });
    }
  }
);

module.exports = router;
