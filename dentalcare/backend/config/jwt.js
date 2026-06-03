const crypto = require("node:crypto");

const TEST_FALLBACK_SECRET = "dentalcare_secret";

function resolveJwtSecret() {
  const envSecret = String(process.env.JWT_SECRET || "").trim();
  if (envSecret) {
    return envSecret;
  }

  if (process.env.NODE_ENV === "test") {
    return TEST_FALLBACK_SECRET;
  }

  const generated = crypto.randomBytes(48).toString("hex");
  console.warn(
    "JWT_SECRET is not set. Generated an ephemeral JWT secret for this process. Set JWT_SECRET in backend/.env for persistent authentication."
  );
  return generated;
}

const JWT_SECRET = resolveJwtSecret();

module.exports = {
  JWT_SECRET
};