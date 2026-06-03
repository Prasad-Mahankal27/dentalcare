require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const suggestionsRouter = require("./routes/suggestions");
const doctorRouter = require("./routes/doctor");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Health check
app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "ai-backend", port: PORT });
});

// Routes
app.use("/api/suggestions", suggestionsRouter);
app.use("/api/doctor", doctorRouter);

// 404
app.use((req, res) => {
    res.status(404).json({ message: `Route ${req.method} ${req.path} not found` });
});

// Error handler
app.use((err, req, res, _next) => {
    console.error("[Server Error]", err);
    res.status(500).json({ message: "Internal server error", error: err.message });
});

// Connect MongoDB then start server
mongoose
    .connect(process.env.MONGO_URL, {
        serverSelectionTimeoutMS: 10000,
    })
    .then(() => {
        console.log("✅ Connected to MongoDB Atlas");
        app.listen(PORT, "127.0.0.1", () => {
            console.log(`🚀 AI Backend running on http://127.0.0.1:${PORT}`);
        });
    })
    .catch((err) => {
        console.error("❌ MongoDB connection failed:", err.message);
        process.exit(1);
    });
