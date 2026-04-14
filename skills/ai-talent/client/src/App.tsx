/**
 * App.tsx — v7 routing
 * Index route: AppShell + ChatCore
 * Preserved: Login, OnboardingWizard
 */
import Login from "./pages/Login";
import OnboardingWizard from "./pages/OnboardingWizard";
import AppShell from "./components/AppShell";
import ChatCore from "./components/ChatCore";
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
      <Route path="/onboarding" element={<RequireAuth><OnboardingWizard onComplete={() => window.location.href = "/"} /></RequireAuth>} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell>
              <ChatCore />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
