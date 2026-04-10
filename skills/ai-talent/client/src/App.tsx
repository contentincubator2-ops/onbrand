/**
 * App.tsx — New shell routing
 *
 * OLD: Layout sidebar -> Dashboard / Chat / Campaigns / BrandAnalysis / ...
 * NEW: Layout (thin icon rail) -> WorkspacePage is the default index route.
 *      Settings, Credits, Campaigns, BrandAnalysis, AgentWorkspace remain as sub-routes.
 *      Dashboard and ChatInterface are REMOVED (replaced by WorkspacePage).
 *      ChatPage is embedded inside WorkspacePage (not a standalone route).
 */
import WorkspacePage from "./pages/WorkspacePage";
import Login from "./pages/Login";
import OnboardingWizard from "./pages/OnboardingWizard";
import Campaigns from "./pages/Campaigns";
import BrandAnalysis from "./pages/BrandAnalysis";
import Credits from "./pages/Credits";
import Settings from "./pages/Settings";
import AgentWorkspace from "./pages/AgentWorkspace";
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
      <Route path="/onboarding" element={<RequireAuth><OnboardingWizard /></RequireAuth>} />

      {/* Authenticated shell */}
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        {/* Default: three-column workspace */}
        <Route index element={<WorkspacePage />} />
        <Route path="workspace" element={<WorkspacePage />} />
        <Route path="workspace/:workspaceId" element={<WorkspacePage />} />

        {/* Management pages (still full-page for now, will become overlays later) */}
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="brand-analysis" element={<BrandAnalysis />} />
        <Route path="credits" element={<Credits />} />
        <Route path="settings" element={<Settings />} />
        <Route path="agents" element={<AgentWorkspace />} />
      </Route>
    </Routes>
  );
}
