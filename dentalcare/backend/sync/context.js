const { AsyncLocalStorage } = require("node:async_hooks");

const syncContext = new AsyncLocalStorage();

function runWithSyncSuppressed(fn) {
  return syncContext.run({ suppressSyncPublish: true }, fn);
}

function isSyncPublishSuppressed() {
  const store = syncContext.getStore();
  return Boolean(store?.suppressSyncPublish);
}

module.exports = {
  runWithSyncSuppressed,
  isSyncPublishSuppressed
};
