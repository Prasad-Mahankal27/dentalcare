const imaps = require("imap-simple");
const { simpleParser } = require("mailparser");

const config = {
  imap: {
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASS,
    host: "imap.gmail.com",
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 30000,
    connTimeout: 30000
  }
};

// Connection state management
let connection = null;
let isConnecting = false;
const processedEmails = new Set();

// Search window: 3 hours (extended for testing)
const SEARCH_WINDOW_MS = 10 * 60 * 60 * 1000;

/**
 * Main entry point - checks emails and processes payments
 * @param {Function} onPayment - Callback when payment email detected
 */
async function checkEmails(onPayment) {
  // Prevent concurrent connection attempts
  if (isConnecting) {
    console.log("⏳ Connection in progress, skipping this check...");
    return;
  }

  try {
    // Establish connection if needed
    if (!connection) {
      isConnecting = true;
      console.log("📡 Connecting to email server...");
      
      connection = await imaps.connect(config);
      await connection.openBox("INBOX");
      
      console.log("📬 Connected to email inbox");
      isConnecting = false;
    }

    // Now safe to fetch messages
    await fetchMessages(connection, onPayment);

  } catch (err) {
    console.error("❌ Check Emails Error:", err.message);
    
    // Reset connection state for next attempt
    connection = null;
    isConnecting = false;
  }
}

/**
 * Fetches and processes payment emails
 */
async function fetchMessages(conn, onPayment) {
  try {
    const sinceDate = new Date(Date.now() - SEARCH_WINDOW_MS);

    const searchCriteria = [
      ["FROM", "eservices@iob.in"],
      ["SINCE", sinceDate]
    ];

    const messages = await conn.search(searchCriteria, {
      bodies: [""],
      markSeen: true,
      struct: true
    });

    if (messages.length > 0) {
      console.log(`📥 Found ${messages.length} potential payment emails`);
    }

    for (const item of messages) {
      // Skip already processed emails (dedupe by UID)
      if (processedEmails.has(item.attributes.uid)) {
        continue;
      }
      processedEmails.add(item.attributes.uid);

      const mail = await simpleParser(item.parts[0].body);
      
      // Extract text content (fallback to HTML stripped)
      let text = mail.text;
      if (!text && mail.html) {
        text = mail.html.replace(/<[^>]*>?/gm, " ");
      }
      text = text || "";

      // Parse payment details for logging
      const amountMatch = text.match(/Rs\.?\s?(\d+(?:\.\d+)?)/i);
      const nameMatch = text.match(/\/CR\/([^\/]+)\//i);
      const amount = amountMatch ? `₹${amountMatch[1]}` : "Unknown";
      const creditor = nameMatch ? nameMatch[1].toUpperCase() : "Unknown";
      const date = mail.date ? mail.date.toLocaleString() : "Unknown Date";

      console.log(`\n-----------------------------------`);
      console.log(`📩 EMAIL DETECTED (${date})`);
      console.log(`👤 From: ${creditor}`);
      console.log(`💵 Amount: ${amount}`);
      console.log(`-----------------------------------`);

      // Only process credit notifications (Strict check: MUST contain 'credited', MUST NOT contain 'debited')
      const isCredit = /credited/i.test(text);
      const isDebit = /debited/i.test(text);

      if (isCredit && !isDebit) {
        onPayment({ body: text, uid: item.attributes.uid });
      } else {
        console.log(`⏩ Skipping email [UID: ${item.attributes.uid}] - Not a credit notification (isDebit: ${isDebit})`);
      }
    }
  } catch (err) {
    console.error("❌ Fetch Error:", err.message);
    
    // Connection might be stale, reset for next cycle
    if (err.message.includes("No mailbox") || err.message.includes("Not connected")) {
      connection = null;
    }
  }
}

module.exports = checkEmails;