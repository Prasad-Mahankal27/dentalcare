/**
 * Billing API tests
 */
const request = require("supertest");
const app = require("../app");
const {
    prisma,
    seedTestData,
    cleanupTestData,
    disconnectPrisma,
    generateTestToken,
} = require("./setup");

let testData;
let doctorToken;
let visitInternalId; // numeric ID needed by billing
let visitStringId;   // string visitId for creating via API

beforeAll(async () => {
    testData = await seedTestData();
    doctorToken = generateTestToken(testData.doctor.id, "DOCTOR");

    // Create a visit for billing tests
    const res = await request(app)
        .post("/visits/create")
        .set("Authorization", `Bearer ${doctorToken}`)
        .send({ patientId: "PAT_TEST_001" });

    visitStringId = res.body.visitId;
    visitInternalId = res.body.id;
});

afterAll(async () => {
    await cleanupTestData();
    await disconnectPrisma();
});

describe("POST /billing/create", () => {
    it("should create a bill successfully", async () => {
        const res = await request(app)
            .post("/billing/create")
            .set("Authorization", `Bearer ${doctorToken}`)
            .send({
                visitId: visitInternalId,
                currentCharges: 1500,
                discount: 200,
                paidAmount: 1000,
                pendingCleared: 0,
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.bill).toBeDefined();
        expect(res.body.bill.currentCharges).toBe(1500);
        expect(res.body.bill.discount).toBe(200);
        expect(res.body.bill.totalAmount).toBe(1300); // 1500 - 200
        expect(res.body.bill.paidAmount).toBe(1000);
        expect(res.body.bill.pendingAmount).toBe(300); // 1300 - 1000
    });

    it("should reject duplicate bill for same visit", async () => {
        const res = await request(app)
            .post("/billing/create")
            .set("Authorization", `Bearer ${doctorToken}`)
            .send({
                visitId: visitInternalId,
                currentCharges: 500,
                paidAmount: 500,
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toMatch(/already exists/i);
    });

    it("should reject if currentCharges <= 0", async () => {
        const res = await request(app)
            .post("/billing/create")
            .set("Authorization", `Bearer ${doctorToken}`)
            .send({
                visitId: 999999,
                currentCharges: 0,
                paidAmount: 0,
            });

        expect(res.statusCode).toBe(400);
    });

    it("should reject if discount exceeds charges", async () => {
        const res = await request(app)
            .post("/billing/create")
            .set("Authorization", `Bearer ${doctorToken}`)
            .send({
                visitId: 999999,
                currentCharges: 500,
                discount: 600,
                paidAmount: 0,
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toMatch(/discount/i);
    });

    it("should reject missing visitId", async () => {
        const res = await request(app)
            .post("/billing/create")
            .set("Authorization", `Bearer ${doctorToken}`)
            .send({
                currentCharges: 500,
                paidAmount: 500,
            });

        expect(res.statusCode).toBe(400);
    });
});
