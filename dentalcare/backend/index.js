const app = require("./app");
const { startSyncEngine, stopSyncEngine } = require("./sync/engine");

console.log("DB PATH:", process.cwd());

const server = app.listen(4000, () => {
  console.log("Backend running on http://localhost:4000");
  startSyncEngine();
});

function shutdown() {
  stopSyncEngine();
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);