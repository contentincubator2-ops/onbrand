/**
 * RequireSoworkPreview — 市場數據層的路由守門。
 *
 * 2026-09-07 (CJ「請你隱藏市場數據層」)。導覽上的「市場」早就只給
 * sowork@sowork.tw，但 /market-intel 的路由沒有守門 —— 直接打網址就進得去。
 * 藏一半等於沒藏。
 *
 * 讀 ShellLayout 透過 <Outlet context> 傳下來的 userEmail（與 ShellLayout
 * 的 isPrivatePreview 同一條規則）。email 還沒載入時先不判斷 —— 每次
 * 進頁都閃一次重導，比多等半秒糟。
 */
import React from "react";
import { Navigate, useOutletContext } from "react-router-dom";

const PREVIEW_EMAIL = "sowork@sowork.tw";

export default function RequireSoworkPreview({ children }: { children: React.ReactNode }) {
  const ctx = useOutletContext<{ userEmail?: string | null } | undefined>();
  const email = ctx?.userEmail;
  if (email == null) return null;                    // 還在載入，先不判斷
  if (String(email).toLowerCase() !== PREVIEW_EMAIL) {
    return <Navigate to="/performance/overview" replace />;
  }
  return <>{children}</>;
}
