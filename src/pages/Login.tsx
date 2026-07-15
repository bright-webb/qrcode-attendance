import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import "../App.css";

type ClockState = "idle" | "loading" | "success" | "error";

const isClockOut = new Date().getHours() >= 12;
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
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

  const actionLabel = isClockOut ? "Clock Out" : "Clock In";
  const endpoint = isClockOut ? "/api/clock-out" : "/api/clock-in";
  
  // Ensure we have a token
  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Invalid QR Code. Please scan the QR code on the screen again.");
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !token) return;

    setState("loading");
    setMessage("");
    setStudentName("");

    // 1. Get Geolocation
    if (!navigator.geolocation) {
      setState("error");
      setMessage("Geolocation is not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const deviceId = getDeviceId();

        // 2. Send Request
        try {
          const res = await fetch(`${API_URL}${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              username: username.trim(),
              token,
              lat: latitude,
              lng: longitude,
              deviceId
            }),
          });

          const data = await res.json();

          if (!res.ok) {
            setState("error");
            setMessage(data.error ?? "Something went wrong. Please try again.");
            return;
          }

          const name = [data.firstName, data.lastName].filter(Boolean).join(" ") || data.username;
          setStudentName(name);
          setState("success");
          setMessage(`Successfully ${isClockOut ? "clocked out" : "clocked in"}!`);
          setUsername("");

          // Auto-reset to error so they can't use the same screen again (need to scan fresh QR)
          setTimeout(() => {
            setState("error");
            setMessage("Session ended. Please scan the QR code on the screen again.");
          }, 5000);
        } catch {
          setState("error");
          setMessage("Could not reach the server. Please check your connection.");
        }
      },
      () => {
        setState("error");
        setMessage("You must allow location access to clock in. Please enable it in your browser settings and try again.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleReset = () => {
    // If they have no token, don't let them reset to the idle form
    if (!token) return;
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

        {/* Success State */}
        {state === "success" && (
          <div className="feedback-card feedback-success">
            <div className="feedback-icon">✅</div>
            <div className="feedback-name">{studentName}</div>
            <div className="feedback-message">{message}</div>
            <div className="feedback-time">{new Date().toLocaleTimeString()}</div>
            {/* Removed the Next Person button to force them to scan a fresh QR code */}
          </div>
        )}

        {/* Error State */}
        {state === "error" && (
          <div className="feedback-card feedback-error">
            <div className="feedback-icon">❌</div>
            <div className="feedback-message" style={{ whiteSpace: "pre-line" }}>{message}</div>
            {token && (
              <button className="btn-reset" onClick={handleReset}>
                Try Again
              </button>
            )}
          </div>
        )}

        {/* Form */}
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
      </div>
    </div>
  );
};