/**
 * Patient API tests
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
let receptionistToken;

beforeAll(async () => {
    testData = await seedTestData();
    doctorToken = generateTestToken(testData.doctor.id, "DOCTOR");
    receptionistToken = generateTestToken(testData.receptionist.id, "RECEPTIONIST");
});

afterAll(async () => {
    await cleanupTestData();
    await disconnectPrisma();
});

describe("POST /patients/register", () => {
    it("should register a new patient (receptionist)", async () => {
        const res = await request(app)
            .post("/patients/register")
            .set("Authorization", `Bearer ${receptionistToken}`)
            .send({
                name: "New Test Patient",
                phone: "99999" + Math.floor(Math.random() * 100000), // Ensure uniqueness
                age: 25,
                gender: "Female",
            });

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("patientId");
        expect(res.body.name).toBe("New Test Patient");

        // Cleanup: store patientId for later cleanup
        testData._createdPatientId = res.body.patientId;
    });

    it("should reject duplicate phone registration", async () => {
        const res = await request(app)
            .post("/patients/register")
            .set("Authorization", `Bearer ${receptionistToken}`)
            .send({
                name: "Duplicate Patient",
                phone: "8888800001", // same phone as test patient from setup
            });

        expect(res.statusCode).toBe(409);
        expect(res.body.message).toMatch(/already exists/i);
    });

    it("should reject if name or phone missing", async () => {
        const res = await request(app)
            .post("/patients/register")
            .set("Authorization", `Bearer ${receptionistToken}`)
            .send({ name: "No Phone" });

        expect(res.statusCode).toBe(400);
    });

    it("should reject if doctor tries to register (wrong role)", async () => {
        const res = await request(app)
            .post("/patients/register")
            .set("Authorization", `Bearer ${doctorToken}`)
            .send({ name: "Blocked", phone: "1111111111" });

        expect(res.statusCode).toBe(403);
    });
});

describe("GET /patients/search", () => {
    it("should find patient by patientId", async () => {
        const res = await request(app)
            .get("/patients/search")
            .query({ query: "PAT_TEST_001" })
            .set("Authorization", `Bearer ${doctorToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.name).toBe("Test Patient");
    });

    it("should find patient by phone", async () => {
        const res = await request(app)
            .get("/patients/search")
            .query({ query: "8888800001" })
            .set("Authorization", `Bearer ${doctorToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.phone).toBe("8888800001");
    });

    it("should return 404 for unknown patient", async () => {
        const res = await request(app)
            .get("/patients/search")
            .query({ query: "NONEXISTENT" })
            .set("Authorization", `Bearer ${doctorToken}`);

        expect(res.statusCode).toBe(404);
    });
});
