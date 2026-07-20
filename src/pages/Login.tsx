import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import "../App.css";

type ClockState = "idle" | "loading" | "success" | "error";

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:3001" : "");

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getDeviceId() {
  let deviceId = localStorage.getItem("device_id");
  if (!deviceId) {
    deviceId = generateUUID();
    localStorage.setItem("device_id", deviceId);
  }
  return deviceId;
}

export const Login = () => {
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState("");
  const [state, setState] = useState<ClockState>("idle");
  const [message, setMessage] = useState("");
  const [studentName, setStudentName] = useState("");

  const token = searchParams.get("token");
  const isClockOut = new Date().getHours() >= 17;
  const actionLabel = isClockOut ? "Clock Out" : "Clock In";
  const endpoint = isClockOut ? "/api/clock-out" : "/api/clock-in";

  // If there's no token in the URL, show an error immediately
  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Invalid QR Code. Please go back and scan the QR code on the screen.");
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !token) return;

    setState("loading");
    setMessage("");
    setStudentName("");

    // Geolocation removed temporarily due to inaccuracy
    const deviceId = getDeviceId();

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          token,
          lat: 0,
          lng: 0,
          deviceId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState("error");
        setMessage(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      const name =
        [data.firstName, data.lastName].filter(Boolean).join(" ") ||
        data.username;
      setStudentName(name);
      setState("success");
      setMessage(`Successfully ${isClockOut ? "clocked out" : "clocked in"}!`);
      setUsername("");
    } catch {
      setState("error");
      setMessage(
        "Could not reach the server. Please check your internet connection and try again."
      );
    }
  };

  const handleReset = () => {
    setState("idle");
    setMessage("");
    setStudentName("");
    setUsername("");
  };

  return (
    <div className="Login">
      <div className="login-container">
        {/* Header */}
        <div className="login-header">
          <div className={`login-badge ${isClockOut ? "badge-out" : "badge-in"}`}>
            {isClockOut ? "🌆" : "🌅"} {actionLabel}
          </div>
          <h1 className="login-title">Fellowship Attendance</h1>
          <p className="login-subtitle">Enter your Gitea username to mark your attendance</p>
        </div>

        {(state === "idle" || state === "loading") && token && (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="username">Gitea Username</label>
              <input
                type="text"
                id="username"
                name="username"
                value={username}
                placeholder="e.g. johndoe"
                autoComplete="off"
                autoFocus
                onChange={(e) => setUsername(e.target.value)}
                disabled={state === "loading"}
              />
            </div>
            <button
              type="submit"
              id="clock-btn"
              disabled={!username.trim() || state === "loading"}
              className={state === "loading" ? "btn-loading" : ""}
            >
              {state === "loading" ? (
                <>
                  <span className="spinner" />
                  {isClockOut ? "Clocking Out…" : "Clocking In…"}
                </>
              ) : (
                actionLabel
              )}
            </button>
          </form>
        )}

        {/* Success State */}
        {state === "success" && (
          <div className="feedback-card feedback-success">
            <div className="feedback-icon">✅</div>
            <div className="feedback-name">{studentName}</div>
            <div className="feedback-message">{message}</div>
            <div className="feedback-time">{new Date().toLocaleTimeString()}</div>
          </div>
        )}

        {/* Error State */}
        {state === "error" && (
          <div className="feedback-card feedback-error">
            <div className="feedback-icon">❌</div>
            <div className="feedback-message" style={{ whiteSpace: "pre-line" }}>
              {message}
            </div>
            {token && (
              <button className="btn-reset" onClick={handleReset}>
                Try Again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};