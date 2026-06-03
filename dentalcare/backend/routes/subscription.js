const express = require("express");
const { authMiddleware } = require("../auth");
const {
  resolveClinicIdForUser,
  getSubscriptionStatusForClinic
} = require("../subscription/service");

const router = express.Router();

router.get("/status", authMiddleware(), async (req, res) => {
  try {
    const clinicId = await resolveClinicIdForUser(req.user || {});
    const status = await getSubscriptionStatusForClinic(clinicId);
    return res.json(status);
  } catch (error) {
    console.error("Subscription status error:", error);
    return res.status(500).json({
      code: "SUBSCRIPTION_STATUS_ERROR",
      message: "Failed to fetch subscription status"
    });
  }
});

module.exports = router;
