import ChatInterface from "./pages/ChatInterface";
import { Navigate, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import BrandAnalysis from "./pages/BrandAnalysis";
import Campaigns from "./pages/Campaigns";
import Credits from "./pages/Credits";
import Settings from "./pages/Settings";
import Login from "./pages/Login";

/** SEC-1: Route guard — redirects to /login if no JWT token present */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("authToken");
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Layout>
              <Routes>
                <Route path="/chat" element={<RequireAuth><ChatInterface /></RequireAuth>} />
          <Route path="/" element={<Dashboard />} />
                <Route path="/brand" element={<BrandAnalysis />} />
                <Route path="/campaigns" element={<Campaigns />} />
                <Route path="/credits" element={<Credits />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Layout>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
