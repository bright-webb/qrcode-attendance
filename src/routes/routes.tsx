import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Home } from "../pages/Home";
import { Login } from "../pages/Login";
import { AdminLogin } from "../pages/AdminLogin";

const AppRoutes = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/scan" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<AdminLogin />} />
      </Routes>
    </BrowserRouter>
  );
};

export default AppRoutes;