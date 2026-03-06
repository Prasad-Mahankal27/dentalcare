/**
 * Dashboard API tests
 */
const request = require("supertest");
const app = require("../app");
const {
    seedTestData,
    cleanupTestData,
    disconnectPrisma,
    generateTestToken,
} = require("./setup");

let testData;
let doctorToken;

beforeAll(async () => {
    testData = await seedTestData();
    doctorToken = generateTestToken(testData.doctor.id, "DOCTOR");
});

afterAll(async () => {
    await cleanupTestData();
    await disconnectPrisma();
});

describe("GET /dashboard/stats", () => {
    it("should return dashboard stats with expected shape", async () => {
        const res = await request(app)
            .get("/dashboard/stats")
            .set("Authorization", `Bearer ${doctorToken}`);

        expect(res.statusCode).toBe(200);

        // Verify top-level shape
        expect(res.body).toHaveProperty("appointments");
        expect(res.body).toHaveProperty("operations");
        expect(res.body).toHaveProperty("newPatients");
        expect(res.body).toHaveProperty("earnings");
        expect(res.body).toHaveProperty("recentAppointments");
        expect(res.body).toHaveProperty("doctorsList");

        // Verify trend arrays exist and have 7 entries (last 7 days)
        expect(res.body.appointmentTrend).toHaveLength(7);
        expect(res.body.operationTrend).toHaveLength(7);
        expect(res.body.patientTrend).toHaveLength(7);
        expect(res.body.earningsTrend).toHaveLength(7);

        // Verify chart data arrays
        expect(res.body.patientSurveyData).toHaveLength(7);
        expect(res.body.dentalIssuesData).toHaveLength(7);

        // Verify arrays contain objects with expected fields
        expect(Array.isArray(res.body.recentAppointments)).toBe(true);
        expect(Array.isArray(res.body.doctorsList)).toBe(true);
    });

    it("should reject unauthenticated requests", async () => {
        const res = await request(app).get("/dashboard/stats");
        expect(res.statusCode).toBe(401);
    });
});
