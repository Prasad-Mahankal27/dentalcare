const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("=== Users in dev.db ===");
  const users = await prisma.user.findMany();
  console.log(JSON.stringify(users, null, 2));

  console.log("\n=== SyncState in dev.db ===");
  const states = await prisma.syncState.findMany();
  console.log(JSON.stringify(states, null, 2));

  console.log("\n=== SyncOutbox in dev.db ===");
  const outbox = await prisma.syncOutbox.findMany();
  console.log(JSON.stringify(outbox, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
