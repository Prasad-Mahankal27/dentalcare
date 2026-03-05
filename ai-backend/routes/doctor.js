const express = require("express");
const router = express.Router();
const { fetchOrSaveEmr } = require("../controllers/emrController");

// POST /api/doctor/fetch-existing-emr/:patientId
// - Empty body → fetch existing EMR
// - Body with EMR data → upsert/save EMR
router.post("/fetch-existing-emr/:patientId", fetchOrSaveEmr);

module.exports = router;
