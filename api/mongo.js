import mongoose from "mongoose";

const attendanceLogSchema = new mongoose.Schema({
  username: { type: String, required: true },
  firstName: { type: String },
  lastName: { type: String },
  action: { type: String, enum: ["clock-in", "clock-out"], required: true },
  timestamp: { type: Date, default: Date.now },
  date: { type: String, required: true },       // e.g. "15/07/26"
  columnName: { type: String, required: true }, // e.g. "15/07/26" or "15/07/26 out"
  rowIndex: { type: Number },                   // row in the sheet (1-indexed)
  deviceId: { type: String },                   // UUID from local storage to prevent buddy punching
  status: { type: String, enum: ["success", "failed"], default: "success" },
  errorMessage: { type: String },
});

const AttendanceLog = mongoose.model("AttendanceLog", attendanceLogSchema);


if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectMongo(uri) {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      bufferCommands: false, 
    }).then((mongoose) => {
      console.log("✅ MongoDB connected successfully in Serverless");
      return mongoose;
    });
  }
  
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }
  
  return cached.conn;
}

export async function saveLog(data) {
  const log = new AttendanceLog(data);
  await log.save();
  return log;
}

/**
 * Checks if the given deviceId has already been used by a DIFFERENT username today.
 */
export async function checkBuddyPunching(deviceId, currentUsername, dateLabel) {
  if (!deviceId) return false;
  
  const existingLog = await AttendanceLog.findOne({
    deviceId,
    date: dateLabel,
    username: { $ne: currentUsername },
    status: "success"
  });

  return !!existingLog; // returns true if another user used this device today
}
