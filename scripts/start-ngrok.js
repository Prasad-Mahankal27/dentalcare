const http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");

function logInfo(message) {
  console.log(`[NGROK] ${message}`);
}

function logError(message) {
  console.error(`[NGROK] ${message}`);
}

function runNgrokSync(args) {
  return spawnSync("ngrok", args, {
    encoding: "utf8",
    stdio: "pipe"
  });
}

function getPort() {
  const parsed = Number.parseInt(process.env.WHATSAPP_PORT || "5000", 10);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return 5000;
}

function maybeConfigureAuthToken() {
  const token = String(process.env.NGROK_AUTHTOKEN || "").trim();
  if (!token) {
    return true;
  }

  const result = runNgrokSync(["config", "add-authtoken", token]);
  if (result.status !== 0) {
    logError("Failed to configure NGROK_AUTHTOKEN.");
    if (result.stderr) {
      logError(result.stderr.trim());
    }
    return false;
  }

  return true;
}

function checkNgrokInstalled() {
  const result = runNgrokSync(["version"]);
  if (result.status === 0) {
    return true;
  }

  logError("ngrok is not available. Install it or add it to PATH.");
  return false;
}

function pollTunnelUrl(maxAttempts = 30) {
  let attempts = 0;

  const timer = setInterval(() => {
    attempts += 1;

    const request = http.get("http://127.0.0.1:4040/api/tunnels", (response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });

      response.on("end", () => {
        if (response.statusCode !== 200) {
          if (attempts >= maxAttempts) {
            clearInterval(timer);
          }
          return;
        }

        try {
          const parsed = JSON.parse(body);
          const tunnels = Array.isArray(parsed.tunnels) ? parsed.tunnels : [];
          const httpsTunnel = tunnels.find((tunnel) => String(tunnel.proto) === "https");
          if (httpsTunnel && httpsTunnel.public_url) {
            logInfo(`Public URL: ${httpsTunnel.public_url}`);
            logInfo(`Configure webhook URL as: ${httpsTunnel.public_url}/webhook`);
            clearInterval(timer);
          }
        } catch (error) {
          if (attempts >= maxAttempts) {
            clearInterval(timer);
          }
        }
      });
    });

    request.on("error", () => {
      if (attempts >= maxAttempts) {
        clearInterval(timer);
      }
    });

    request.setTimeout(1200, () => {
      request.destroy();
      if (attempts >= maxAttempts) {
        clearInterval(timer);
      }
    });

    if (attempts >= maxAttempts) {
      clearInterval(timer);
    }
  }, 2000);

  return timer;
}

function main() {
  if (!checkNgrokInstalled()) {
    process.exit(1);
  }

  if (!maybeConfigureAuthToken()) {
    process.exit(1);
  }

  const port = getPort();
  const domain = String(process.env.NGROK_DOMAIN || "").trim();
  const args = ["http", String(port), "--log=stdout"];

  if (domain) {
    args.push("--domain", domain);
  }

  logInfo(`Starting ngrok tunnel for localhost:${port}`);

  const ngrok = spawn("ngrok", args, {
    stdio: "inherit"
  });

  const timer = pollTunnelUrl();

  ngrok.on("exit", (code) => {
    clearInterval(timer);
    process.exit(code ?? 0);
  });

  process.on("SIGINT", () => {
    ngrok.kill("SIGINT");
  });

  process.on("SIGTERM", () => {
    ngrok.kill("SIGTERM");
  });
}

main();
