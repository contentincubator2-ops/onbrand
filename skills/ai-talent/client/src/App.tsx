import ChatPage from "./pages/ChatPage";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Campaigns from "./pages/Campaigns";
import BrandAnalysis from "./pages/BrandAnalysis";
import Credits from "./pages/Credits";
import Settings from "./pages/Settings";
import Layout from "./components/Layout";
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
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="chat/:conversationId" element={<ChatPage />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="brand-analysis" element={<BrandAnalysis />} />
        <Route path="credits" element={<Credits />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
