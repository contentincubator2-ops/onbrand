import { useEffect } from "react";
import { Outlet } from "react-router-dom";

export default function Layout() {
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    document.body.style.background = "#FAFAF9";
    document.body.style.color = "#1C1917";
  }, []);

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      overflow: "hidden",
      background: "#FAFAF9",
      color: "#1C1917",
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    }}>
      <main style={{ flex: 1, overflow: "hidden", display: "flex" }}>
        <Outlet />
      </main>
    </div>
  );
}
