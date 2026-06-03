const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "file:../dentalcare/backend/prisma/dev.db"
    }
  }
});

async function main() {
  console.log("Fetching users from dev.db...");
  const users = await prisma.user.findMany();
  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
