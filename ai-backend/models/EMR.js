const mongoose = require("mongoose");
const { Schema } = mongoose;

const durationSchema = new Schema(
    { value: { type: Number, default: null }, unit: { type: String, default: null } },
    { _id: false }
);

const symptomSchema = new Schema(
    {
        name: { type: String, default: null },
        duration: { type: String, default: null },
        severity: { type: String, default: null },
        source: { type: String, default: null },
    },
    { _id: false }
);

const vitalUnitSchema = new Schema(
    { value: { type: Number, default: null }, unit: { type: String, default: null } },
    { _id: false }
);

const bloodPressureSchema = new Schema(
    {
        systolic: { type: Number, default: null },
        diastolic: { type: Number, default: null },
        unit: { type: String, default: null },
    },
    { _id: false }
);

const conditionSchema = new Schema(
    {
        condition: { type: String, default: null },
        icdCode: { type: String, default: null },
        diagnosedDate: { type: Date, default: null },
        status: { type: String, default: null },
    },
    { _id: false }
);

const surgerySchema = new Schema(
    { name: { type: String, default: null }, date: { type: Date, default: null } },
    { _id: false }
);

const allergySchema = new Schema(
    {
        allergen: { type: String, default: null },
        type: { type: String, default: null },
        reaction: { type: String, default: null },
        severity: { type: String, default: null },
    },
    { _id: false }
);

const medicationSchema = new Schema(
    {
        medicationId: { type: String, default: null },
        name: { type: String, default: null },
        dosage: { type: String, default: null },
        frequency: { type: String, default: null },
        route: { type: String, default: null },
        startDate: { type: Date, default: null },
        status: { type: String, default: null },
        duration: { type: String, default: null },
        instructions: { type: String, default: null },
        reason: { type: String, default: null },
        source: { type: String, default: null },
    },
    { _id: false }
);

const diagnosisItemSchema = new Schema(
    {
        condition: { type: String, default: null },
        icdCode: { type: String, default: null },
        confidence: { type: Number, default: null },
        source: { type: String, default: null },
    },
    { _id: false }
);

const testSchema = new Schema(
    {
        testName: { type: String, default: null },
        reason: { type: String, default: null },
        status: { type: String, default: null },
    },
    { _id: false }
);

const riskScoreSchema = new Schema(
    { condition: { type: String, default: null }, risk: { type: Number, default: null } },
    { _id: false }
);

const alertSchema = new Schema(
    { type: { type: String, default: null }, message: { type: String, default: null } },
    { _id: false }
);

const recommendationSchema = new Schema(
    { type: { type: String, default: null }, message: { type: String, default: null } },
    { _id: false }
);

const emrSchema = new Schema(
    {
        patient: {
            patientId: { type: String, default: null },
            name: { type: String, default: null },
            dob: { type: Date, default: null },
            age: { type: Number, default: null },
            gender: { type: String, default: null },
            bloodGroup: { type: String, default: null },
            phone: { type: String, default: null },
            email: { type: String, default: null },
            address: { type: String, default: null },
        },
        visit: {
            visitId: { type: String, default: null },
            date: { type: Date, default: null },
            doctorId: { type: String, default: null },
            doctorName: { type: String, default: null },
            department: { type: String, default: null },
            visitType: { type: String, default: null },
            mode: { type: String, default: null },
            hospitalId: { type: String, default: null },
        },
        chiefComplaint: {
            complaint: { type: String, default: null },
            duration: durationSchema,
            severity: { type: String, default: null },
            onset: { type: String, default: null },
        },
        symptoms: { type: [symptomSchema], default: [] },
        vitals: {
            temperature: vitalUnitSchema,
            bloodPressure: bloodPressureSchema,
            heartRate: vitalUnitSchema,
            respiratoryRate: vitalUnitSchema,
            oxygenSaturation: vitalUnitSchema,
            height: vitalUnitSchema,
            weight: vitalUnitSchema,
            bmi: { type: Number, default: null },
        },
        medicalHistory: {
            conditions: { type: [conditionSchema], default: [] },
            surgeries: { type: [surgerySchema], default: [] },
            hospitalizations: { type: [Schema.Types.Mixed], default: [] },
        },
        allergies: { type: [allergySchema], default: [] },
        currentMedications: { type: [medicationSchema], default: [] },
        examination: {
            general: { type: String, default: null },
            cardiovascular: { type: String, default: null },
            respiratory: { type: String, default: null },
            abdomen: { type: String, default: null },
            neurological: { type: String, default: null },
        },
        diagnosis: {
            primary: diagnosisItemSchema,
            secondary: { type: [diagnosisItemSchema], default: [] },
            differential: { type: [diagnosisItemSchema], default: [] },
        },
        testsOrdered: { type: [testSchema], default: [] },
        prescription: { type: [medicationSchema], default: [] },
        treatmentPlan: {
            plan: { type: String, default: null },
            diet: { type: String, default: null },
            exercise: { type: String, default: null },
            precautions: { type: String, default: null },
        },
        followUp: {
            required: { type: Boolean, default: null },
            date: { type: Date, default: null },
            instructions: { type: String, default: null },
        },
        conversation: {
            transcript: { type: String, default: null },
            audioUrl: { type: String, default: null },
            summary: { type: String, default: null },
            aiExtracted: { type: Boolean, default: null },
        },
        aiInsights: {
            riskScores: { type: [riskScoreSchema], default: [] },
            alerts: { type: [alertSchema], default: [] },
            recommendations: { type: [recommendationSchema], default: [] },
        },
        audit: {
            createdAt: { type: Date, default: null },
            createdBy: { type: String, default: null },
            updatedAt: { type: Date, default: null },
            aiConfidenceScore: { type: Number, default: null },
            version: { type: Number, default: null },
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("EMR", emrSchema);
