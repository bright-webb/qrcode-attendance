import express from "express";
import cors from "cors";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import "dotenv/config";
import { markAttendance, getTodayColumnLabel } from "./sheets.js";
import { connectMongo, saveLog, checkBuddyPunching } from "./mongo.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── Helpers ───────────────────────────────────────────────────────────────

function getSecret() {
  return process.env.JWT_SECRET || "fallback_hmac_secret_change_me";
}

/**
 * Generate a tamper-proof, URL-safe QR token using HMAC-SHA256.
 * Format: "<timestamp>.<hex_signature>"
 * No external JWT library required for generation — fully stateless.
 */
function generateQRToken() {
  const timestamp = Date.now().toString();
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(timestamp)
    .digest("hex")
    .slice(0, 24);
  return `${timestamp}.${sig}`;
}

/**
 * Verify an HMAC QR token. Returns true if valid and not expired.
 */
function verifyQRToken(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [timestamp, sig] = parts;
  const age = Date.now() - parseInt(timestamp, 10);

  // Reject if expired (65 seconds) or from the future
  if (isNaN(age) || age > 65000 || age < 0) return false;

  const expectedSig = crypto
    .createHmac("sha256", getSecret())
    .update(timestamp)
    .digest("hex")
    .slice(0, 24);

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, "hex"),
      Buffer.from(expectedSig, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Haversine formula — distance between two GPS points in metres.
 */
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Routes ────────────────────────────────────────────────────────────────

/**
 * GET /api/qr-token
 * Returns a fresh HMAC-signed QR token valid for 65 seconds.
 */
app.get("/api/qr-token", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const token = generateQRToken();
  res.json({ token });
});

/**
 * POST /api/admin/login
 * Body: { username, password }
 */
app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body;
  const { MONGODB_URI, ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;

  try {
    await connectMongo(MONGODB_URI);
  } catch (err) {
    console.error("MongoDB Error:", err.message);
    return res.status(500).json({ error: "Database connection failed." });
  }

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: "admin" }, getSecret(), { expiresIn: "8h" });
    return res.json({ success: true, token });
  }

  return res.status(401).json({ error: "Invalid admin credentials." });
});

/**
 * POST /api/clock-in
 */
app.post("/api/clock-in", async (req, res) => {
  await handleClock(req, res, false);
});

/**
 * POST /api/clock-out
 */
app.post("/api/clock-out", async (req, res) => {
  await handleClock(req, res, true);
});

// ─── Core Handler ──────────────────────────────────────────────────────────

async function handleClock(req, res, isClockOut) {
  const { username, token, lat, lng, deviceId } = req.body;
  const action = isClockOut ? "clock-out" : "clock-in";

  // 1. Connect to DB first — fail fast with a clear message
  try {
    await connectMongo(process.env.MONGODB_URI);
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    return res.status(500).json({ error: "Database is unavailable. Please try again in a moment." });
  }

  // 2. Basic input validation
  if (!username || typeof username !== "string" || !username.trim()) {
    return res.status(400).json({ error: "Username is required." });
  }

  // 3. QR Token Validation (HMAC-based, stateless, serverless-safe)
  if (!verifyQRToken(token)) {
    console.warn("Invalid QR token attempt:", token);
    return res.status(403).json({ error: "QR code has expired. Please scan the screen again." });
  }

  // 4. Geolocation Validation (Temporarily disabled due to inaccuracy issues)
  // const campusLat = parseFloat(process.env.CAMPUS_LAT || "0");
  // const campusLng = parseFloat(process.env.CAMPUS_LNG || "0");
  // const maxDistance = parseInt(process.env.MAX_DISTANCE_METERS || "50", 10);

  // if (campusLat !== 0 && campusLng !== 0) {
  //   if (!lat || !lng) {
  //     return res.status(403).json({ error: "Location access is required to clock in." });
  //   }
  //   const distance = getDistanceInMeters(lat, lng, campusLat, campusLng);
  //   if (distance > maxDistance) {
  //     return res.status(403).json({
  //       error: `You must be on campus to clock in. You are ${Math.round(distance)}m away (max: ${maxDistance}m).`,
  //     });
  //   }
  // }

  // Build date labels
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yy = String(today.getFullYear()).slice(-2);
  const dateLabel = `${dd}/${mm}/${yy}`;
  const columnLabel = getTodayColumnLabel(isClockOut);

  // 5. Buddy-Punching Check
  try {
    const isBuddy = await checkBuddyPunching(deviceId, username.trim(), dateLabel);
    if (isBuddy) {
      return res.status(403).json({ error: "This device has already been used by someone else today." });
    }
  } catch (err) {
    console.error("Buddy punching check error:", err.message);
    // Non-fatal — continue
  }

  // 6. Mark Attendance in Google Sheets + save log
  try {
    const result = await markAttendance(
      process.env.SPREADSHEET_ID,
      process.env.SHEET_NAME || "Orientation Attendance",
      username.trim(),
      isClockOut
    );

    await saveLog({
      username: username.trim(),
      firstName: result.firstName,
      lastName: result.lastName,
      action,
      date: dateLabel,
      columnName: columnLabel,
      rowIndex: result.rowIndex,
      deviceId,
      status: "success",
    });

    return res.json({
      success: true,
      action,
      username: username.trim(),
      firstName: result.firstName,
      lastName: result.lastName,
      column: columnLabel,
      cell: result.cellRange,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`${action} error for "${username}":`, err.message);

    // Log the failure — don't let a log failure mask the real error
    await saveLog({
      username: username.trim(),
      action,
      date: dateLabel,
      columnName: columnLabel,
      deviceId,
      status: "failed",
      errorMessage: err.message,
    }).catch(() => {});

    const isNotFound = err.message.toLowerCase().includes("not found");
    return res.status(isNotFound ? 404 : 500).json({
      error: isNotFound
        ? `Username "${username.trim()}" was not found in the sheet. Please check and try again.`
        : `Something went wrong. Please try again.\nDetails: ${err.message}`,
    });
  }
}

// ─── Server ────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Export for Vercel Serverless
export default app;
