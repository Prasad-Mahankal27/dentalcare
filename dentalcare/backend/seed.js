const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("123456", 10);

  const users = [
    { name: "System Admin", phone: "7777777777", password, role: "ADMIN" },
    { name: "Dr. Sharma", phone: "9999999999", password, role: "DOCTOR" },
    { name: "Reception", phone: "8888888888", password, role: "RECEPTIONIST" }
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { phone: user.phone },
      update: {
        name: user.name,
        role: user.role
      },
      create: user
    });
  }

  console.log("Seeded users");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
