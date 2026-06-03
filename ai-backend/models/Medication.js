const mongoose = require("mongoose");

const medicationSchema = new mongoose.Schema({
    icdCode: String,
    disease: String,
    symptoms: [String],
    medications: [
        {
            name: String,
            dosage: String,
            frequency: String,
        },
    ],
    tests: [String],
    embedding: { type: [Number], index: true },
});

module.exports = mongoose.model("Medication", medicationSchema, "medicines");
