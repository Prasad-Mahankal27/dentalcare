const bcrypt = require("bcrypt");

async function main() {
  const hash1 = "$2b$10$Vf32qtyu6hKsJPJwnH7aluA7sbUPttWp2Su4xMYRJRUpmbGhXb2Qq"; // doctor
  const hash2 = "$2b$10$dxZYmCmr3oqAxwwQNyzBCeGkLw6u.1Eerdl.Nsv9Qv4N2CX/7DQqq"; // receptionist

  const match1 = await bcrypt.compare("123456", hash1);
  const match2 = await bcrypt.compare("123456", hash2);

  console.log("Doctor hash matches '123456':", match1);
  console.log("Receptionist hash matches '123456':", match2);
}

main().catch(console.error);
