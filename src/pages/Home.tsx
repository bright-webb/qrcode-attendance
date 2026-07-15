import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import "../App.css";

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:3001" : "");
const REFRESH_INTERVAL = 60; // seconds

export const Home = () => {
  const [title, setTitle] = useState("Clock In");
  const [time, setTime] = useState(new Date().toLocaleTimeString());
  const [qrToken, setQrToken] = useState("");
  const [timeLeft, setTimeLeft] = useState(REFRESH_INTERVAL);

  const fetchToken = async () => {
    try {
      const res = await fetch(`${API_URL}/api/qr-token`);
      const data = await res.json();
      if (data.token) {
        setQrToken(data.token);
        setTimeLeft(REFRESH_INTERVAL); // Reset timer when new token is fetched
      }
    } catch (err) {
      console.error("Failed to fetch QR token", err);
    }
  };

  useEffect(() => {
    fetchToken();

    // Fetch new token every 60 seconds
    const tokenInterval = setInterval(fetchToken, REFRESH_INTERVAL * 1000);
    
    // Update time and countdown every second
    const timeInterval = setInterval(() => {
      setTime(new Date().toLocaleTimeString());
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(tokenInterval);
      clearInterval(timeInterval);
    };
  }, []);

  useEffect(() => {
    setTitle(new Date().getHours() >= 12 ? "Clock Out" : "Clock In");
  }, []);

  const baseUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "https://example.com/login";
  const qrValue = qrToken ? `${baseUrl}?token=${qrToken}` : baseUrl;

  // Calculate progress bar percentage (0 to 100%)
  const progressPercent = (timeLeft / REFRESH_INTERVAL) * 100;

  return (
    <div className="App">
      <h1>{title}</h1>
      <div className="divider"></div>
      <div className="time">Current Time: {time}</div>
      
      <div className="qrContainer">
        <div className="qr-card">
          <QRCode value={qrValue} size={680} bgColor="#ffffff" fgColor="#0f172a" />
        </div>
      </div>
      
      {/* Progress Bar UI */}
      <div style={{ marginTop: "30px", width: "100%", maxWidth: "680px", textAlign: "center" }}>
        <p style={{ color: "#94a3b8", marginBottom: "10px", fontSize: "1.1rem" }}>
          QR Code refreshes in {timeLeft} seconds
        </p>
        <div style={{ 
          width: "100%", 
          height: "8px", 
          backgroundColor: "rgba(255,255,255,0.1)", 
          borderRadius: "4px",
          overflow: "hidden"
        }}>
          <div style={{
            height: "100%",
            width: `${progressPercent}%`,
            backgroundColor: timeLeft < 10 ? "#ef4444" : "#fb923c",
            transition: "width 1s linear, background-color 0.5s ease"
          }} />
        </div>
      </div>
      
    </div>
  );
};