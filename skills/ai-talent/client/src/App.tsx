import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import BrandAnalysis from "./pages/BrandAnalysis";
import Campaigns from "./pages/Campaigns";
import Credits from "./pages/Credits";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/brand" element={<BrandAnalysis />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/credits" element={<Credits />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}
