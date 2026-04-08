process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

require("dotenv").config();

const express = require("express");
const QRCode = require("qrcode");
const sqlite3 = require("sqlite3").verbose();
const cron = require("node-cron");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const checkEmails = require("./emailWatcher");

const app = express();
app.use(express.json());
const SERVICE_ROOT = __dirname;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.static(path.join(SERVICE_ROOT, "public")));

/* ================================================
   CONFIGURATION
   ================================================ */

const UPI_ID = process.env.UPI_ID || "abhibhoo.anand@oksbi";
const UPI_NAME = process.env.UPI_NAME || "Abhibhoo Anand";
const PORT = process.env.PORT || 3002;
const PAYMENTS_DB_PATH = process.env.PAYMENTS_DB_PATH || path.join(SERVICE_ROOT, "payments.db");

// Payment matching window: 20 minutes
const MATCH_WINDOW_MS = 20 * 60 * 1000;

/* ================================================
   HELPER FUNCTIONS
   ================================================ */

/**
 * Normalize name for matching with bank's 13-char truncated format
 * @param {string} name - Full name
 * @returns {string} - Normalized name (uppercase, no spaces, max 13 chars)
 */
function normalizeName(name) {
  if (!name || typeof name !== "string") return "";
  return name
    .toUpperCase()
    .replace(/\s+/g, "")  // Remove all spaces
    .substring(0, 13);     // Take first 13 characters
}

/**
 * Generate random paisa between 0.01 and 0.99
 * @returns {number} - Random paisa value
 */
function generateRandomPaisa() {
  return Math.floor(Math.random() * 99 + 1) / 100; // 0.01 to 0.99
}

/* ================================================
   DATABASE SETUP
   ================================================ */

const db = new sqlite3.Database(PAYMENTS_DB_PATH);
let server = null;
let emailPollTask = null;

function runDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }

      resolve(this);
    });
  });
}

function allDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(rows);
    });
  });
}

async function initializeDatabase() {
  await runDb(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      firstName TEXT,
      middleName TEXT,
      lastName TEXT,
      fullName TEXT NOT NULL,
      upiId TEXT,
      upiName TEXT,
      normalizedName TEXT NOT NULL,
      baseAmount REAL NOT NULL,
      finalAmount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      utr TEXT,
      matchedEmailUid INTEGER,
      createdAt INTEGER NOT NULL
    )
  `);

  const columns = await allDb("PRAGMA table_info(orders)");
  const existingColumns = new Set(columns.map(column => column.name));
  const optionalColumns = {
    firstName: "TEXT",
    middleName: "TEXT",
    lastName: "TEXT",
    upiId: "TEXT",
    upiName: "TEXT",
    utr: "TEXT",
    matchedEmailUid: "INTEGER"
  };

  for (const [columnName, columnType] of Object.entries(optionalColumns)) {
    if (existingColumns.has(columnName)) {
      continue;
    }

    await runDb(`ALTER TABLE orders ADD COLUMN ${columnName} ${columnType}`);
    console.log(`🛠️ Added missing orders.${columnName} column`);
  }

  console.log("✅ Database ready");
}

/* ================================================
   API ROUTES
   ================================================ */

/**
 * POST /create-payment
 * Creates a new payment order with random paisa and generates UPI QR code
 */
app.post("/create-payment", async (req, res) => {
  try {
    const { firstName, middleName, lastName, amount, upiId, upiName } = req.body;
    const normalizedFirstName = typeof firstName === "string" ? firstName.trim() : "";
    const normalizedMiddleName = typeof middleName === "string" ? middleName.trim() : "";
    const normalizedLastName = typeof lastName === "string" ? lastName.trim() : "";
    const senderUpiId = typeof upiId === "string" ? upiId.trim() : null;
    const senderUpiName = typeof upiName === "string" ? upiName.trim() : null;
    const fullName = [normalizedFirstName, normalizedMiddleName, normalizedLastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    // Validation
    if (!normalizedFirstName || !normalizedLastName) {
      return res.status(400).json({ error: "First name and last name are required" });
    }
    
    const baseAmount = parseFloat(amount);
    if (!baseAmount || baseAmount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    // Generate order details
    const orderId = uuidv4().slice(0, 6).toUpperCase();
    const createdAt = Date.now();
    const normalizedName = normalizeName(fullName);
    
    // Add random paisa for unique identification
    const randomPaisa = generateRandomPaisa();
    const finalAmount = Math.round((baseAmount + randomPaisa) * 100) / 100;

    // Build UPI URL with final amount
    const upiUrl = 
      `upi://pay?pa=${UPI_ID}` +
      `&pn=${encodeURIComponent(UPI_NAME)}` +
      `&am=${finalAmount.toFixed(2)}` +
      `&cu=INR` +
      `&tn=Order-${orderId}`;

    // Generate QR code
    const qr = await QRCode.toDataURL(upiUrl, {
      width: 300,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" }
    });

    // Insert order into database
    db.run(
      `INSERT INTO orders (id, firstName, middleName, lastName, fullName, upiId, upiName, normalizedName, baseAmount, finalAmount, status, createdAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        normalizedFirstName,
        normalizedMiddleName || null,
        normalizedLastName,
        fullName,
        senderUpiId,
        senderUpiName,
        normalizedName,
        baseAmount,
        finalAmount,
        "PENDING",
        createdAt
      ],
      function(err) {
        if (err) {
          console.error("❌ Insert Error:", err.message);
          return res.status(500).json({ error: "Failed to create order" });
        }

        console.log(`\n🆕 ORDER CREATED: ${orderId}`);
        console.log(`   Full Name: ${fullName}`);
        console.log(`   Normalized: ${normalizedName}`);
        console.log(`   Base Amount: ₹${baseAmount}`);
        console.log(`   Final Amount: ₹${finalAmount.toFixed(2)}`);

        res.json({
          orderId,
          qr,
          upiId: UPI_ID,
          baseAmount,
          finalAmount,
          createdAt
        });
      }
    );

  } catch (err) {
    console.error("❌ Create Payment Error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /status/:id
 * Returns the current status of an order
 */
app.get("/status/:id", (req, res) => {
  const { id } = req.params;

  db.get(
    `SELECT status, finalAmount, fullName FROM orders WHERE id = ?`,
    [id],
    (err, row) => {
      if (err) {
        console.error("❌ Status Query Error:", err.message);
        return res.status(500).json({ status: "ERROR" });
      }
      
      if (!row) {
        return res.status(404).json({ status: "NOT_FOUND" });
      }

      res.json(row);
    }
  );
});

/**
 * POST /manual-verify/:id
 * Allows clinic staff to manually approve a pending payment.
 */
app.post("/manual-verify/:id", (req, res) => {
  const { id } = req.params;

  db.get(`SELECT id, status FROM orders WHERE id = ?`, [id], (findErr, row) => {
    if (findErr) {
      console.error("❌ Manual Verify Query Error:", findErr.message);
      return res.status(500).json({ error: "Failed to verify order" });
    }

    if (!row) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (row.status === "PAID") {
      return res.json({ status: "PAID", source: "MANUAL" });
    }

    db.run(`UPDATE orders SET status = 'PAID' WHERE id = ?`, [id], (updateErr) => {
      if (updateErr) {
        console.error("❌ Manual Verify Update Error:", updateErr.message);
        return res.status(500).json({ error: "Failed to approve payment" });
      }

      console.log(`\n🧾 MANUAL APPROVAL: ${id}`);
      res.json({ status: "PAID", source: "MANUAL" });
    });
  });
});

/* ================================================
   EMAIL PAYMENT MATCHING
   ================================================ */

/**
 * Process incoming payment email and match with pending orders
 * PRIMARY: Match by exact finalAmount (with random paisa)
 * SECONDARY: Verify normalized name matches
 */
function processPaymentEmail(emailData) {
  const { body: text, uid } = emailData;

  // Extract amount with decimals (e.g., Rs.200.37, INR 500.01, ₹120.50)
  const amountMatch = text.match(/(?:Rs\.?|INR|₹)\s*(\d+(?:\.\d{1,2})?)/i);

  // Extract payer name using common bank email patterns
  const namePatterns = [
    /\/CR\/([^\/]+)\//i,
    /credited\s+by\s+([A-Za-z .]+)/i,
    /from\s+([A-Za-z .]{3,})/i
  ];

  let emailName = "";
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      emailName = match[1].trim();
      break;
    }
  }

  // Extract UTR (standard 12-digit number for UPI)
  const utrMatch = text.match(/\b\d{12}\b/);

  if (!amountMatch) {
    console.log("⚠️ Could not parse amount from email");
    return;
  }

  // Parse amount as float to preserve decimals
  const emailAmount = parseFloat(amountMatch[1]);
  const normalizedEmailName = normalizeName(emailName);
  const emailUtr = utrMatch ? utrMatch[0] : null;

  console.log(`\n📧 Parsed Email [UID: ${uid}]:`);
  console.log(`   Amount: ₹${emailAmount.toFixed(2)}`);
  console.log(`   UTR: ${emailUtr || "Not found"}`);
  console.log(`   Name: ${emailName}`);
  console.log(`   Normalized: ${normalizedEmailName}`);

  // Time window for matching (20 minutes)
  const timeWindowStart = Date.now() - MATCH_WINDOW_MS;

  const markOrderPaid = (row) => {
    db.run(
      `UPDATE orders SET status = 'PAID', utr = ?, matchedEmailUid = ? WHERE id = ?`,
      [emailUtr, uid, row.id],
      function(updateErr) {
        if (updateErr) {
          console.error("❌ Update Error:", updateErr.message);
          return;
        }

        console.log(`\n✅ PAYMENT VERIFIED!`);
        console.log(`   Order ID: ${row.id}`);
        console.log(`   Full Name: ${row.fullName}`);
        console.log(`   Amount: ₹${Number(row.finalAmount).toFixed(2)}`);
        console.log(`🎉 Payment Successfully Processed!\n`);
      }
    );
  };

  const matchByAmountOnlyIfUnique = () => {
    db.all(
      `SELECT id, fullName, normalizedName, finalAmount, createdAt FROM orders
       WHERE ABS(finalAmount - ?) < 0.001 AND status = 'PENDING' AND createdAt > ?
       ORDER BY createdAt DESC
       LIMIT 2`,
      [emailAmount, timeWindowStart],
      (amountOnlyErr, rows) => {
        if (amountOnlyErr) {
          console.error("❌ DB Amount-only Query Error:", amountOnlyErr.message);
          return;
        }

        if (!rows || rows.length === 0) {
          console.log(`❌ No pending order found for ₹${emailAmount.toFixed(2)} (amount-only)`);
          return;
        }

        if (rows.length > 1) {
          console.log(`⚠️ Multiple pending orders found for ₹${emailAmount.toFixed(2)}. Skipping auto-match.`);
          return;
        }

        console.log(`ℹ️ Matched by unique exact amount (name unavailable/mismatch).`);
        markOrderPaid(rows[0]);
      }
    );
  };

  // PRIMARY MATCH: Exact amount + normalized name
  if (normalizedEmailName) {
    db.get(
      `SELECT id, fullName, normalizedName, finalAmount, createdAt FROM orders
       WHERE ABS(finalAmount - ?) < 0.001 AND normalizedName = ? AND status = 'PENDING' AND createdAt > ?
       ORDER BY createdAt DESC
       LIMIT 1`,
      [emailAmount, normalizedEmailName, timeWindowStart],
      (err, row) => {
        if (err) {
          console.error("❌ DB Query Error:", err.message);
          return;
        }

        if (row) {
          markOrderPaid(row);
          return;
        }

        console.log(`ℹ️ Name+amount match not found, trying amount-only fallback for ₹${emailAmount.toFixed(2)}.`);
        matchByAmountOnlyIfUnique();
      }
    );
    return;
  }

  // Fallback when name was not parsable in email body.
  matchByAmountOnlyIfUnique();
}

/* ================================================
   EMAIL POLLING SCHEDULE
   ================================================ */

function startEmailPolling() {
  const checkEmailsIfPending = () => {
    db.get("SELECT COUNT(*) as count FROM orders WHERE status = 'PENDING'", (err, row) => {
      if (err) {
        console.error("❌ DB Error during poll check:", err.message);
        return;
      }

      if (row && row.count > 0) {
        checkEmails(processPaymentEmail);
      }
    });
  };

  // Check emails on startup only when pending orders exist
  setTimeout(() => {
    checkEmailsIfPending();
  }, 2000);

  // Check every 15 seconds ONLY if there are pending orders
  emailPollTask = cron.schedule("*/15 * * * * *", () => {
    checkEmailsIfPending();
  });
}

/* ================================================
   SERVER STARTUP
   ================================================ */

async function startServer() {
  try {
    await initializeDatabase();
    startEmailPolling();

    server = app.listen(PORT, () => {
      console.log(`\n🚀 UPI Payment Server running at http://localhost:${PORT}`);
      console.log(`   UPI ID: ${UPI_ID}`);
      console.log(`   Payee Name: ${UPI_NAME}\n`);
    });
  } catch (err) {
    console.error("❌ Database Initialization Error:", err.message);
    process.exit(1);
  }
}

startServer();

/* ================================================
   GRACEFUL SHUTDOWN
   ================================================ */

process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down gracefully...");

  if (emailPollTask) {
    emailPollTask.stop();
  }

  const closeDatabase = () => {
    db.close((err) => {
      if (err) console.error("DB close error:", err.message);
      console.log("👋 Server stopped");
      process.exit(0);
    });
  };

  if (!server) {
    closeDatabase();
    return;
  }

  server.close(() => {
    closeDatabase();
  });
});
