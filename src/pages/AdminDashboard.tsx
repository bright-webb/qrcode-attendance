import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../App.css";

export const AdminDashboard = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Basic protection: if no token, kick them back to login
    const token = localStorage.getItem("admin_token");
    if (!token) {
      navigate("/admin/login");
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    navigate("/admin/login");
  };

  return (
    <div className="App" style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0f172a", color: "#f1f5f9" }}>
      <header style={{ padding: "20px 40px", borderBottom: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, color: "#fb923c" }}>🔒 Admin Dashboard</h2>
        <button 
          onClick={handleLogout}
          style={{ padding: "8px 16px", background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}
        >
          Logout
        </button>
      </header>
      
      <main style={{ flex: 1, padding: "40px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "rgba(255,255,255,0.05)", padding: "40px", borderRadius: "12px", textAlign: "center", maxWidth: "600px" }}>
          <h1>Welcome, Administrator 👋</h1>
          <p style={{ color: "#94a3b8", fontSize: "1.1rem", lineHeight: "1.6" }}>
            You are successfully logged into the secure admin portal. <br />
            (Future updates can place live attendance logs, export buttons, and settings here).
          </p>
        </div>
      </main>
    </div>
  );
};
