require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const authRoutes = require("./routes/auth");
const patientRoutes = require("./routes/patient");
const visitRoutes = require("./routes/visit");
const billingRoutes = require("./routes/billing");
const dashboardRoutes = require("./routes/dashboard");

app.use(cors());
app.use(express.json());
app.use("/auth", authRoutes);
app.use("/patients", patientRoutes);
app.use("/visits", visitRoutes);
app.use("/billing", billingRoutes);
app.use("/dashboard", dashboardRoutes);

app.get("/health", (req, res) => {
    res.json({ status: "OK" });
});

module.exports = app;
