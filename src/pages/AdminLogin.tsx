import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../App.css";

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:3001" : "");

export const AdminLogin = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok && data.token) {
        localStorage.setItem("admin_token", data.token);
        navigate("/admin/dashboard");
      } else {
        setError(data.error || "Invalid credentials");
      }
    } catch (err) {
      setError("Failed to connect to the server.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="Login">
      <div className="login-container" style={{ border: "1px solid rgba(251, 146, 60, 0.3)" }}>
        <div className="login-header">
          <div className="login-badge badge-out" style={{ background: "rgba(251, 146, 60, 0.15)", color: "#fb923c" }}>
            🔒 Admin Portal
          </div>
          <h1 className="login-title">System Admin</h1>
          <p className="login-subtitle">Sign in to manage attendance logs</p>
        </div>

        {error && (
          <div className="feedback-card feedback-error" style={{ padding: "16px", marginBottom: "20px" }}>
            <div className="feedback-message">{error}</div>
          </div>
        )}

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label htmlFor="admin-username">Username</label>
            <input
              type="text"
              id="admin-username"
              value={username}
              placeholder="Admin Username"
              autoComplete="off"
              autoFocus
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="form-group" style={{ marginTop: "16px" }}>
            <label htmlFor="admin-password">Password</label>
            <input
              type="password"
              id="admin-password"
              value={password}
              placeholder="••••••••"
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <button
            type="submit"
            style={{ marginTop: "24px", background: "linear-gradient(135deg, #fb923c, #ea580c)" }}
            disabled={!username || !password || isLoading}
          >
            {isLoading ? <span className="spinner" /> : "Secure Login"}
          </button>
        </form>
      </div>
    </div>
  );
};