import ChatPage from "./pages/ChatPage";
import Login from "./pages/Login";
import { Navigate, Routes, Route } from "react-router-dom";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("authToken");
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={<RequireAuth><ChatPage /></RequireAuth>} />
    </Routes>
  );
}
