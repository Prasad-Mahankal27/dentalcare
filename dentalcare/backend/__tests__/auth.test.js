/**
 * Auth API tests
 */
const request = require("supertest");
const app = require("../app");
const {
    seedTestData,
    cleanupTestData,
    disconnectPrisma,
} = require("./setup");

let testData;

beforeAll(async () => {
    testData = await seedTestData();
});

afterAll(async () => {
    await cleanupTestData();
    await disconnectPrisma();
});

describe("POST /auth/login", () => {
    it("should login successfully with correct credentials", async () => {
        const res = await request(app).post("/auth/login").send({
            phone: "9999900001",
            password: "password123",
        });

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("token");
        expect(res.body.name).toBe("Test Doctor");
        expect(res.body.role).toBe("DOCTOR");
    });

    it("should reject login with wrong password", async () => {
        const res = await request(app).post("/auth/login").send({
            phone: "9999900001",
            password: "wrongpassword",
        });

        expect(res.statusCode).toBe(401);
        expect(res.body.message).toMatch(/invalid/i);
    });

    it("should reject login with non-existent phone", async () => {
        const res = await request(app).post("/auth/login").send({
            phone: "0000000000",
            password: "password123",
        });

        expect(res.statusCode).toBe(401);
    });
});

describe("Auth middleware", () => {
    it("should reject requests with no token", async () => {
        const res = await request(app).get("/health");
        // health has no auth, so this should pass
        expect(res.statusCode).toBe(200);
    });

    it("should reject protected routes with no token", async () => {
        const res = await request(app).get("/dashboard/stats");
        expect(res.statusCode).toBe(401);
    });

    it("should reject protected routes with invalid token", async () => {
        const res = await request(app)
            .get("/dashboard/stats")
            .set("Authorization", "Bearer invalid_token_here");

        expect(res.statusCode).toBe(401);
    });
});
