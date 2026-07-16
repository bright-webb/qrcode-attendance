import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import "../App.css";

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:3001" : "");
const REFRESH_INTERVAL = 60; // seconds — must be less than the backend token expiry (65s)

export const Home = () => {
  const [title, setTitle] = useState("Clock In");
  const [time, setTime] = useState(new Date().toLocaleTimeString());
  const [currentHour, setCurrentHour] = useState(new Date().getHours());
  const [qrToken, setQrToken] = useState("");
  const [timeLeft, setTimeLeft] = useState(REFRESH_INTERVAL);

  const fetchToken = async () => {
    try {
      const res = await fetch(`${API_URL}/api/qr-token?t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      if (data.token) {
        setQrToken(data.token);
        setTimeLeft(REFRESH_INTERVAL); 
      }
    } catch (err) {
      console.error("Failed to fetch QR token", err);
    }
  };

  useEffect(() => {
    fetchToken();

  
    const tokenInterval = setInterval(fetchToken, REFRESH_INTERVAL * 1000);
    
    // Update time, countdown, and current hour every second
    const timeInterval = setInterval(() => {
      const now = new Date();
      setTime(now.toLocaleTimeString());
      setCurrentHour(now.getHours());
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(tokenInterval);
      clearInterval(timeInterval);
    };
  }, []);

  // Update the Title based on the exact hour
  useEffect(() => {
    if (currentHour >= 17) {
      setTitle("Clock Out");
    } else if (currentHour >= 12 && currentHour < 17) {
      setTitle("Learning Hours");
    } else {
      setTitle("Clock In");
    }
  }, [currentHour]);

  const baseUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "https://example.com/login";
  // Encode the token so special characters in the HMAC signature don't break the URL
  const qrValue = qrToken ? `${baseUrl}?token=${encodeURIComponent(qrToken)}` : baseUrl;

  const progressPercent = (timeLeft / REFRESH_INTERVAL) * 100;
  
  // Logic: Show QR before 12 PM (morning) OR after 5 PM (evening)
  const showQR = currentHour < 12 || currentHour >= 17;

  return (
    <div className="App">
      <h1>{title}</h1>
      <div className="divider"></div>
      
      {showQR ? (
        <>
          <div className="time">Current Time: {time}</div>
          <div className="qrContainer">
            <div className="qr-card">
              <QRCode value={qrValue} size={680} bgColor="#ffffff" fgColor="#0f172a" />
            </div>
          </div>
          
          {/* Progress Bar UI */}
          <div style={{ marginTop: "30px", width: "100%", maxWidth: "100%", textAlign: "center" }}>
            <p style={{ color: "#94a3b8", marginBottom: "10px", fontSize: "1.1rem" }}>
              Refreshes in {timeLeft} seconds
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
        </>
      ) : (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '680px', 
          width: '90%',
          backgroundColor: 'rgba(255,255,255,0.02)', 
          border: '1px solid rgba(251, 146, 60, 0.2)',
          borderRadius: '24px',
          margin: '40px auto'
        }}>
          <div style={{ 
            fontSize: '7rem', 
            fontWeight: '900', 
            color: '#fb923c', 
            fontVariantNumeric: 'tabular-nums',
            textShadow: '0 0 40px rgba(251, 146, 60, 0.3)'
          }}>
            {time}
          </div>
          <p style={{ fontSize: '1.8rem', color: '#94a3b8', marginTop: '90px', fontWeight: '500' }}>
            Next clock out opens at 5:00 PM
          </p>
        </div>
      )}
      
    </div>
  );
};