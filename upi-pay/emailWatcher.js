require("dotenv").config();

const imaps = require("imap-simple");
const { simpleParser } = require("mailparser");

const IMAP_USER = process.env.IMAP_USER || process.env.GMAIL_USER || process.env.EMAIL_USER || "";
const IMAP_PASSWORD =
  process.env.IMAP_PASSWORD ||
  process.env.IMAP_PASS ||
  process.env.EMAIL_PASS ||
  process.env.GMAIL_APP_PASSWORD ||
  process.env.EMAIL_PASSWORD ||
  "";
const IMAP_HOST = process.env.IMAP_HOST || process.env.GMAIL_IMAP_HOST || "imap.gmail.com";
const IMAP_PORT = Number(process.env.IMAP_PORT || 993);
const IMAP_TLS = String(process.env.IMAP_TLS || "true").toLowerCase() !== "false";
const IMAP_MAILBOX = process.env.IMAP_MAILBOX || "INBOX";
const IMAP_LOOKBACK_MINUTES = Math.max(5, Number(process.env.IMAP_LOOKBACK_MINUTES || 30));
const BANK_EMAIL_SENDERS = (process.env.BANK_EMAIL_SENDERS || process.env.BANK_EMAIL_SENDER || "eservices@iob.in")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let hasWarnedConfig = false;
let isChecking = false;
let highestProcessedUid = 0;
const processedUids = new Set();

function toImapDate(date) {
  const day = String(date.getDate());
  const month = MONTH_NAMES[date.getMonth()];
  const year = String(date.getFullYear());
  return `${day}-${month}-${year}`;
}

function pruneProcessedUids(maxSize = 5000) {
  while (processedUids.size > maxSize) {
    const oldestUid = processedUids.values().next().value;
    processedUids.delete(oldestUid);
  }
}

function senderAllowed(parsedFrom) {
  if (BANK_EMAIL_SENDERS.length === 0) {
    return true;
  }

  const fromText = String(parsedFrom?.text || "").toLowerCase();
  const fromAddress = String(parsedFrom?.value?.[0]?.address || "").toLowerCase();

  return BANK_EMAIL_SENDERS.some(
    (sender) => fromAddress.includes(sender) || fromText.includes(sender)
  );
}

function buildImapConfig() {
  return {
    imap: {
      user: IMAP_USER,
      password: IMAP_PASSWORD,
      host: IMAP_HOST,
      port: IMAP_PORT,
      tls: IMAP_TLS,
      authTimeout: 10000,
      tlsOptions: {
        rejectUnauthorized: false
      }
    }
  };
}

async function checkEmailsInternal(onPaymentEmail) {
  if (typeof onPaymentEmail !== "function") {
    console.warn("[upi-pay] checkEmails called without a callback function.");
    return;
  }

  if (isChecking) {
    return;
  }

  if (!IMAP_USER || !IMAP_PASSWORD || !IMAP_HOST) {
    if (!hasWarnedConfig) {
      console.warn(
        "[upi-pay] Email polling disabled: set IMAP_USER, IMAP_PASSWORD and IMAP_HOST in upi-pay/.env"
      );
      hasWarnedConfig = true;
    }
    return;
  }

  isChecking = true;
  let connection = null;

  try {
    connection = await imaps.connect(buildImapConfig());
    await connection.openBox(IMAP_MAILBOX);

    const sinceDate = new Date(Date.now() - IMAP_LOOKBACK_MINUTES * 60 * 1000);
    const searchCriteria = [["SINCE", toImapDate(sinceDate)]];
    const fetchOptions = {
      bodies: [""],
      markSeen: false,
      struct: true
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    const candidates = messages
      .map((message) => {
        const uid = Number(message?.attributes?.uid || 0);
        const bodyPart = Array.isArray(message?.parts)
          ? message.parts.find((part) => part.which === "")
          : null;

        return {
          uid,
          rawBody: typeof bodyPart?.body === "string" ? bodyPart.body : ""
        };
      })
      .filter((candidate) => candidate.uid > 0 && candidate.rawBody.length > 0)
      .sort((a, b) => a.uid - b.uid);

    for (const candidate of candidates) {
      if (candidate.uid <= highestProcessedUid || processedUids.has(candidate.uid)) {
        continue;
      }

      const parsed = await simpleParser(candidate.rawBody);
      if (!senderAllowed(parsed.from)) {
        continue;
      }

      const plainText = String(parsed.text || "").trim();
      const htmlText = typeof parsed.html === "string"
        ? parsed.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        : "";
      const emailBody = [plainText, htmlText].filter(Boolean).join("\n").trim();

      if (!emailBody) {
        continue;
      }

      try {
        onPaymentEmail({
          uid: candidate.uid,
          body: emailBody,
          from: String(parsed.from?.value?.[0]?.address || ""),
          subject: String(parsed.subject || "")
        });
      } catch (callbackError) {
        console.error("[upi-pay] onPaymentEmail callback failed:", callbackError.message || callbackError);
      }

      processedUids.add(candidate.uid);
      if (candidate.uid > highestProcessedUid) {
        highestProcessedUid = candidate.uid;
      }
      pruneProcessedUids();
    }
  } catch (err) {
    console.error("[upi-pay] Email polling error:", err.message || err);
  } finally {
    isChecking = false;
    if (connection) {
      try {
        await connection.end();
      } catch (closeErr) {
        console.error("[upi-pay] IMAP close error:", closeErr.message || closeErr);
      }
    }
  }
}

function checkEmails(onPaymentEmail) {
  void checkEmailsInternal(onPaymentEmail);
}

module.exports = checkEmails;
