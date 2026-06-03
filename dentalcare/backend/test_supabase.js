const { loadEnv } = require("./config/loadEnv");
loadEnv();
const { isRemoteSyncConfigured } = require("./sync/remoteAuth");

console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("SUPABASE_SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "EXISTS" : "MISSING");
console.log("isRemoteSyncConfigured:", isRemoteSyncConfigured());
