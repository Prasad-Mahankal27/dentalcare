const app = require("./app");

console.log("DB PATH:", process.cwd());

app.listen(4000, () => {
  console.log("Backend running on http://localhost:4000");
});