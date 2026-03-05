const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("123456", 10);

  await prisma.user.createMany({
    data: [
      { name: "Dr. Sharma", phone: "9999999999", password, role: "DOCTOR" },
      { name: "Reception", phone: "8888888888", password, role: "RECEPTIONIST" }
    ]
  });

  console.log("Seeded users");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
