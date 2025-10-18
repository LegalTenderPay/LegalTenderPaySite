/**
 * purchase-backend/server.js
 *
 * - POST /api/send-code   { email }
 * - POST /api/verify-code { email, code }
 *
 * Env:
 *   EMAIL_PROVIDER = "sendgrid" | "resend" | "smtp"   (default smtp)
 *   SENDGRID_API_KEY
 *   RESEND_API_KEY
 *   EMAIL_USER (for SMTP: sender email)
 *   EMAIL_PASS (for SMTP: app password)
 *   FROM_NAME (optional) default "LegalTenderPay"
 *   RATE_LIMIT_PER_HOUR (optional) default 3
 *   CODE_TTL_MINUTES (optional) default 15
 */

import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import fetch from "node-fetch";
import { isEmail } from "validator";

const app = express();
app.use(cors());
app.use(express.json());

// configuration (can be set as Replit secrets or process.env)
const PROVIDER = (process.env.EMAIL_PROVIDER || "smtp").toLowerCase(); // sendgrid | resend | smtp
const FROM_NAME = process.env.FROM_NAME || "LegalTenderPay";
const FROM_EMAIL = process.env.EMAIL_USER || (`no-reply@${process.env.REPLIT_DB_INSTANCE || "legaltenderpay.example"}`);
const RATE_LIMIT_PER_HOUR = parseInt(process.env.RATE_LIMIT_PER_HOUR || "3", 10);
const CODE_TTL_MINUTES = parseInt(process.env.CODE_TTL_MINUTES || "15", 10);

// in-memory stores (suitable for small apps / dev; use DB for production)
const codes = new Map(); // email -> { code, expiresAt (ms) }
const sendCounts = new Map(); // email -> [timestamps ms] (for rate limiting)

// helper: cleanup expired codes periodically
setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of codes.entries()) {
    if (entry.expiresAt <= now) codes.delete(email);
  }
  // also prune old timestamps for rate limiting
  for (const [email, arr] of sendCounts.entries()) {
    const recent = arr.filter(t => t > now - 1000 * 3600);
    if (recent.length === 0) sendCounts.delete(email);
    else sendCounts.set(email, recent);
  }
}, 60 * 1000);

// generate 6-digit code
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Email templates (you can modify HTML here)
function makeHtmlEmail(code) {
  return `
  <div style="font-family: Inter, system-ui, Arial; color:#111; padding:20px;">
    <div style="max-width:600px;margin:0 auto;border-radius:8px;padding:18px;background:#0b0c10;color:#fff;">
      <h2 style="margin:0 0 10px 0;color:#fcd535">LegalTenderPay</h2>
      <p style="color:#ddd">Thanks for signing up — here is your verification code:</p>
      <div style="margin:16px 0; font-weight:700; font-size:28px; color:#ffffff; background:#111; padding:14px; text-align:center; border-radius:6px;">${code}</div>
      <p style="color:#bbb;font-size:14px">This code expires in ${CODE_TTL_MINUTES} minutes. If you didn't request this, please ignore.</p>
      <p style="color:#999;font-size:13px; margin-top:18px">— LegalTenderPay Team</p>
    </div>
  </div>`;
}

function makeTextEmail(code) {
  return `Your LegalTenderPay verification code is: ${code}\nIt expires in ${CODE_TTL_MINUTES} minutes.`;
}

// sendMail abstraction: supports sendgrid/resend/smtp
async function sendMail({ to, subject, text, html }) {
  if (PROVIDER === "sendgrid") {
    const key = process.env.SENDGRID_API_KEY;
    if (!key) throw new Error("Missing SENDGRID_API_KEY");
    const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject,
        content: [
          { type: "text/plain", value: text },
          { type: "text/html", value: html },
        ],
      }),
    });
    if (!resp.ok) {
      const textBody = await resp.text();
      throw new Error(`SendGrid failed: ${resp.status} ${textBody}`);
    }
    return;
  }

  if (PROVIDER === "resend") {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("Missing RESEND_API_KEY");
    const resp = await fetch("https://api.resend.com/email", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [to],
        subject,
        html,
        text,
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Resend failed: ${resp.status} ${txt}`);
    }
    return;
  }

  // default: SMTP via nodemailer
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) throw new Error("Missing EMAIL_USER or EMAIL_PASS for SMTP");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `${FROM_NAME} <${user}>`,
    to,
    subject,
    text,
    html,
  });
}

// rate-limiter simple: allow up to RATE_LIMIT_PER_HOUR per hour per email
function canSend(email) {
  const windowStart = Date.now() - 60 * 60 * 1000;
  const arr = sendCounts.get(email) || [];
  const recent = arr.filter(t => t > windowStart);
  return recent.length < RATE_LIMIT_PER_HOUR;
}

function recordSend(email) {
  const arr = sendCounts.get(email) || [];
  arr.push(Date.now());
  sendCounts.set(email, arr);
}

// === API ===
app.post("/api/send-code", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || !isEmail(email)) return res.status(400).json({ error: "Valid email required" });

    // Rate limit
    if (!canSend(email)) return res.status(429).json({ error: `Rate limit: max ${RATE_LIMIT_PER_HOUR} codes per hour` });

    // Generate and store
    const code = generateCode();
    const expiresAt = Date.now() + CODE_TTL_MINUTES * 60 * 1000;
    codes.set(email, { code, expiresAt });

    // send email
    const subject = "Your LegalTenderPay verification code";
    const html = makeHtmlEmail(code);
    const text = makeTextEmail(code);

    await sendMail({ to: email, subject, text, html });

    // record send for rate limiting
    recordSend(email);

    // IMPORTANT: never return the code in production responses.
    return res.json({ success: true, message: "Verification email sent" });
  } catch (err) {
    console.error("send-code error:", err);
    return res.status(500).json({ error: "Failed to send code" });
  }
});

app.post("/api/verify-code", (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !isEmail(email) || !code) return res.status(400).json({ error: "Email and code required" });

    const entry = codes.get(email);
    if (!entry) return res.status(400).json({ error: "No code found or code expired" });

    if (entry.expiresAt < Date.now()) {
      codes.delete(email);
      return res.status(400).json({ error: "Code expired" });
    }

    if (entry.code !== String(code).trim()) return res.status(400).json({ error: "Invalid code" });

    // success: remove used code
    codes.delete(email);
    return res.json({ success: true, message: "Email verified" });
  } catch (err) {
    console.error("verify-code error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
});

// small health route
app.get("/api/ping", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 purchase-backend listening on ${PORT} (provider=${PROVIDER})`));
