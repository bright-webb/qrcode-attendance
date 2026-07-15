import express from "express";
import cors from "cors";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import "dotenv/config";
import { markAttendance, getTodayColumnLabel } from "./sheets.js";
import { connectMongo, saveLog, checkBuddyPunching } from "./mongo.js";

const app = express();
const PORT = process.env.PORT || 3001;

const CAMPUS_LAT = parseFloat(process.env.CAMPUS_LAT || "0");
const CAMPUS_LNG = parseFloat(process.env.CAMPUS_LNG || "0");
const MAX_DISTANCE_METERS = parseInt(process.env.MAX_DISTANCE_METERS || "50", 10);

app.use(cors());
app.use(express.json());

// MongoDB will be connected inside the route handlers instead of globally on startup
// to properly support Vercel Serverless Architecture.

/**
 * GET /api/qr-token
 * Generates a stateless, short-lived JWT for the QR code.
 */
app.get("/api/qr-token", (_req, res) => {
  const token = jwt.sign({ purpose: "qr" }, process.env.JWT_SECRET || "default_super_secret", { expiresIn: "65s" });
  res.json({ token });
});

/**
 * POST /api/admin/login
 * Body: { username, password }
 */
app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body;
  const { MONGODB_URI, ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;

  // 1. Ensure DB connection is ready for this specific request
  try {
    await connectMongo(MONGODB_URI);
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
    return res.status(500).json({ error: "Database connection failed. Please try again." });
  }

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET || "default_super_secret", { expiresIn: "8h" });
    return res.json({ success: true, token });
  }

  return res.status(401).json({ error: "Invalid admin credentials" });
});

/**
 * POST /api/clock-in
 * Body: { username, token, lat, lng, deviceId }
 */
app.post("/api/clock-in", async (req, res) => {
  await handleClock(req, res, false);
});

/**
 * POST /api/clock-out
 * Body: { username, token, lat, lng, deviceId }
 */
app.post("/api/clock-out", async (req, res) => {
  await handleClock(req, res, true);
});

/**
 * Haversine formula to calculate distance between two lat/lng coordinates in meters
 */
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

async function handleClock(req, res, isClockOut) {
  const { username, token, lat, lng, deviceId } = req.body;
  const action = isClockOut ? "clock-out" : "clock-in";

  try {
    await connectMongo(process.env.MONGODB_URI);
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
    return res.status(500).json({ error: "Database connection failed. Please try again." });
  }

  // 1. Basic Validation
  if (!username || typeof username !== "string" || !username.trim()) {
    return res.status(400).json({ error: "Username is required." });
  }

  // 2. Token Validation (Stateless Serverless-friendly Anti-Link Sharing)
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "default_super_secret");
    if (decoded.purpose !== "qr") throw new Error("Invalid token purpose");
  } catch (err) {
    console.error("JWT Verification failed:", err.message, "| Token:", token);
    return res.status(403).json({ error: "Invalid or expired QR code. Please scan the screen again." });
  }

  // 3. Geolocation Validation
  if (CAMPUS_LAT !== 0 && CAMPUS_LNG !== 0) {
    if (!lat || !lng) {
      return res.status(403).json({ error: "Location access is required to clock in." });
    }
    const distance = getDistanceInMeters(lat, lng, CAMPUS_LAT, CAMPUS_LNG);
    if (distance > MAX_DISTANCE_METERS) {
      return res.status(403).json({ 
        error: `You must be on campus to clock in. You are ${Math.round(distance)} meters away. (Max allowed: ${MAX_DISTANCE_METERS}m)` 
      });
    }
  }

  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yy = String(today.getFullYear()).slice(-2);
  const dateLabel = `${dd}/${mm}/${yy}`;
  const columnLabel = getTodayColumnLabel(isClockOut);

  // 4. Buddy Punching Validation
  try {
    const isBuddyPunching = await checkBuddyPunching(deviceId, username.trim(), dateLabel);
    if (isBuddyPunching) {
      return res.status(403).json({ error: "This device has already been used to clock in someone else today." });
    }
  } catch (err) {
    console.error("Buddy punching check failed:", err);
  }

  // 5. Execute Attendance Update
  try {
    const result = await markAttendance(
      process.env.SPREADSHEET_ID,
      process.env.SHEET_NAME || "Orientation Attendance",
      username.trim(),
      isClockOut
    );

    // Save log to MongoDB
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

    // Still log the failed attempt
    await saveLog({
      username: username.trim(),
      action,
      date: dateLabel,
      columnName: columnLabel,
      deviceId,
      status: "failed",
      errorMessage: err.message,
    }).catch(() => {});

    const isNotFound = err.message.includes("not found");
    return res.status(isNotFound ? 404 : 500).json({
      error: isNotFound
        ? `Username "${username}" was not found. Please check and try again.\n Error: ${err.message}`
        : `Something went wrong. Please try again. \nError: ${err.message}`,
    });
  }
}

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Export the Express API so Vercel can run it as Serverless Functions
export default app;
