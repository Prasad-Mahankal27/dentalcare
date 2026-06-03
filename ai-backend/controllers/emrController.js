const EMR = require("../models/EMR");

/**
 * POST /api/doctor/fetch-existing-emr/:patientId
 *
 * If a body is provided with EMR data → upsert (create or update) the EMR for the patient.
 * If body is empty → fetch the most recent EMR for the patient.
 */
exports.fetchOrSaveEmr = async (req, res) => {
    try {
        const { patientId } = req.params;

        if (!patientId) {
            return res.status(400).json({ message: "patientId is required." });
        }

        const bodyIsEmpty =
            !req.body || Object.keys(req.body).length === 0;

        if (bodyIsEmpty) {
            // Fetch the most recent EMR for this patient
            const emr = await EMR.findOne({ "patient.patientId": patientId })
                .sort({ updatedAt: -1 })
                .lean();

            if (!emr) {
                return res.status(404).json({ message: "No existing EMR found for this patient." });
            }

            return res.json({
                message: "Existing EMR fetched successfully.",
                data: emr,
            });
        }

        // Upsert: create or overwrite the EMR for this patient
        const payload = { ...req.body };
        if (!payload.patient) payload.patient = {};
        payload.patient.patientId = patientId;

        // Update audit timestamps
        if (!payload.audit) payload.audit = {};
        payload.audit.updatedAt = new Date();
        if (!payload.audit.createdAt) payload.audit.createdAt = new Date();

        const saved = await EMR.findOneAndUpdate(
            { "patient.patientId": patientId },
            { $set: payload },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        return res.json({
            message: "EMR saved successfully.",
            data: saved,
        });
    } catch (err) {
        console.error("[EMR Controller] Error:", err);
        return res.status(500).json({ message: "Internal server error.", error: err.message });
    }
};
