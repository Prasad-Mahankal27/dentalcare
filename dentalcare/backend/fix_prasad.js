const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("Updating prasad's password and clinicId in local database...");
  const user = await prisma.user.findFirst({
    where: { email: "prasad.mahankal@gmail.com" }
  });

  if (!user) {
    console.error("User prasad.mahankal@gmail.com not found!");
    return;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      password: "$2b$10$Vf32qtyu6hKsJPJwnH7aluA7sbUPttWp2Su4xMYRJRUpmbGhXb2Qq",
      clinicId: "72c2db42-3a3c-453f-bfaa-3f81fa2ffe0e"
    }
  });

  console.log("User updated successfully:", JSON.stringify(updated, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
