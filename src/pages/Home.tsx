import React from "react";
import QRCode from "react-qr-code";
import "../App.css";

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:3001" : "");

export const Home = () => {
  const [title, setTitle] = React.useState("Clock In");
  const [time, setTime] = React.useState(new Date().toLocaleTimeString());
  const [qrToken, setQrToken] = React.useState("");

  // Fetch a new token from the server for the QR code
  const fetchToken = async () => {
    try {
      const res = await fetch(`${API_URL}/api/qr-token`);
      const data = await res.json();
      if (data.token) {
        setQrToken(data.token);
      }
    } catch (err) {
      console.error("Failed to fetch QR token", err);
    }
  };

  React.useEffect(() => {
    // Initial fetch
    fetchToken();

    // Fetch new token every 15 seconds
    const tokenInterval = setInterval(fetchToken, 15000);
    
    // Update time every second
    const timeInterval = setInterval(() => {
      setTime(new Date().toLocaleTimeString());
    }, 1000);

    return () => {
      clearInterval(tokenInterval);
      clearInterval(timeInterval);
    };
  }, []);

  React.useEffect(() => {
    setTitle(new Date().getHours() >= 12 ? "Clock Out" : "Clock In");
  }, []);

  const baseUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "https://example.com/login";
  const qrValue = qrToken ? `${baseUrl}?token=${qrToken}` : baseUrl;

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
    </div>
  );
};