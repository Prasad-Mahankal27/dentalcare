const fs = require("node:fs");
const path = require("node:path");

function loadEnv() {
  let dotenv;
  try {
    dotenv = require("dotenv");
  } catch (e) {
    // dotenv is not available in the packaged app, env variables are provided by Electron
    return null;
  }

  const backendRoot = path.resolve(__dirname, "..");
  const explicitEnvPath = path.join(backendRoot, ".env");

  if (fs.existsSync(explicitEnvPath)) {
    dotenv.config({ path: explicitEnvPath });
    return explicitEnvPath;
  }

  dotenv.config();
  return null;
}

module.exports = {
  loadEnv
};
