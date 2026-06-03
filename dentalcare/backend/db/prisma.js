const { loadEnv } = require("../config/loadEnv");
loadEnv();

const { PrismaClient } = require("@prisma/client");

const { isSyncPublishSuppressed } = require("../sync/context");
const { publishMutation } = require("../sync/publisher");

const basePrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "file:./dev.db"
    }
  }
});

const TRACKED_MODELS = new Set([
  "User",
  "Patient",
  "Visit",
  "Appointment",
  "Billing"
]);

const TRACKED_ACTIONS = new Set(["create", "update", "upsert", "delete"]);

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const result = await query(args);

        if (!model || !TRACKED_MODELS.has(model)) {
          return result;
        }

        if (!TRACKED_ACTIONS.has(operation)) {
          return result;
        }

        if (isSyncPublishSuppressed()) {
          return result;
        }

        try {
          await publishMutation({
            prisma,
            model,
            action: operation,
            result
          });
        } catch (error) {
          console.error("Failed to publish mutation to sync outbox:", {
            model,
            action: operation,
            error: error?.message || String(error)
          });
        }

        return result;
      }
    }
  }
});

module.exports = {
  prisma
};
