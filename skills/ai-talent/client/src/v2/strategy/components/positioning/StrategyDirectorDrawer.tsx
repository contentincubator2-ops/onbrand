/**
 * StrategyDirectorDrawer — 全域常駐的「策略總監」入口。
 *
 * 2026-09-23（CJ 三則連續指示）：
 *   「用戶還可以看這個策略總監的背景，或是要換其他的策略總監。要達到每
 *   一頁都能這樣，你要重新思考使用者體驗」
 *   「我不喜歡你現在擺放策略總監的位置。我喜歡在右上方的位置，而且要
 *   表明自己是專為他設計的策略總監」
 *   人設數量：「2-3位，從mos_db選擇」（mos_db 金鑰目前未設定，先用一份
 *   手寫預設人設頂著框架，見 strategistPersonas.ts 的說明）
 *
 * 跟 Mia（ShellLayout.tsx 裡的 SupportDrawer，右下角、紫色圓點）刻意分開：
 * 客服跟策略顧問是兩件不同的事，合併只會讓兩邊互相干擾（見這輪討論的
 * 取捨紀錄）。這裡改放右上角、黑白線條 B&W 風格（呼應 AgentPersonaBar／
 * PipelineThinkingPanel 那套「4A 代理商」視覺語言，不是 Mia 的漸層紫）。
 *
 * 全域可見的前提是「有品牌在 scope 裡」——沒有品牌時不出現（沒有品牌可以
 * 聊策略，硬要出現只會是空殼）。brandId 來自 ShellLayout 自己的全域
 * scope（跟 Mia 讀的是同一個來源），所以每一頁只要有品牌 scope 就會出現，
 * 不需要各頁自己接線。
 *
 * 「引導進行策略監測/健檢」的動作在這裡會先關閉面板、導去品牌定位頁，
 * 帶著 ?tool= 參數——BrandsPage 讀到這個參數會自動展開對應的面板（見
 * BrandsPage.tsx 的 activeStrategyTool 初始化邏輯）。
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { useLang } from "../../../../lib/i18n";
import { STRATEGIST_PERSONAS, getPersona } from "../../lib/strategistPersonas";
import StrategyDirectorChat from "./StrategyDirectorChat";

const PERSONA_STORAGE_KEY = "sowork.strategistPersona";

export default function StrategyDirectorDrawer({ brandId }: { brandId: number | null }) {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [showBio, setShowBio] = React.useState(false);
  const [personaId, setPersonaId] = React.useState<string>(() => {
    try { return localStorage.getItem(PERSONA_STORAGE_KEY) ?? "default"; } catch { return "default"; }
  });
  const persona = getPersona(personaId);
  const choosePersona = (id: string) => {
    setPersonaId(id);
    try { localStorage.setItem(PERSONA_STORAGE_KEY, id); } catch { /* noop */ }
  };
  const avatarUrl = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(persona.avatarSeed)}`;

  if (!brandId) return null;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={en ? "Open your Strategy Director" : "打開你的策略總監"}
        title={en ? "Your Strategy Director — built for this brand" : "你的策略總監——為這個品牌而設計"}
        style={{
          position: "fixed", top: 20, right: 20, zIndex: 50,
          width: 52, height: 52, borderRadius: "50%",
          background: "white", border: "2px solid #111",
          boxShadow: open ? "3px 3px 0 rgba(17,17,17,0.4)" : "3px 3px 0 rgba(17,17,17,0.22)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", padding: 0, overflow: "visible",
          transition: "box-shadow 0.15s",
        }}
      >
        <img src={avatarUrl} alt={persona.name} style={{ width: "100%", height: "100%", borderRadius: "50%", display: "block" }} />
        {!open && (
          <span aria-hidden style={{
            position: "absolute", bottom: 2, right: 2, width: 11, height: 11,
            borderRadius: "50%", background: "#10b981", border: "2px solid white",
          }} />
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 80, right: 20, zIndex: 50,
          width: "min(400px, calc(100vw - 40px))",
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{
            border: "2px solid #111", borderRadius: 16, background: "#fff",
            boxShadow: "3px 3px 0 rgba(17,17,17,0.15)", padding: "12px 14px",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <img src={avatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#171717" }}>{persona.name}</div>
                  <div style={{ fontSize: 11, color: "#737373" }}>{en ? "Built for your brand" : "為你的品牌而設計"}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {STRATEGIST_PERSONAS.length > 1 && (
                  <select
                    value={personaId}
                    onChange={(e) => choosePersona(e.target.value)}
                    aria-label={en ? "Switch Strategy Director" : "切換策略總監"}
                    style={{ fontSize: 11.5, border: "1px solid #D4D4D4", borderRadius: 6, padding: "3px 4px", color: "#404040" }}
                  >
                    {STRATEGIST_PERSONAS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
                <button
                  onClick={() => setShowBio((v) => !v)}
                  style={{
                    fontSize: 11.5, fontWeight: 600, border: "1px solid #D4D4D4", borderRadius: 999, padding: "3px 10px",
                    background: showBio ? "#171717" : "#fff", color: showBio ? "#fff" : "#525252", cursor: "pointer",
                  }}
                >
                  {en ? "Background" : "查看背景"}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label={en ? "Close" : "關閉"}
                  style={{ fontSize: 15, border: "none", background: "transparent", color: "#a3a3a3", cursor: "pointer", lineHeight: 1, padding: 2 }}
                >
                  ✕
                </button>
              </div>
            </div>
            {showBio && (
              <p style={{
                marginTop: 10, paddingTop: 10, borderTop: "1px solid #EFEDE8",
                fontSize: 12.5, lineHeight: 1.65, color: "#404040",
              }}>
                {persona.bio}
              </p>
            )}
          </div>

          <StrategyDirectorChat
            brandId={brandId}
            onOpenMonitor={() => { setOpen(false); navigate(`/brands/edit?b=${brandId}&cat=positioning&tool=monitor`); }}
            onOpenHealthCheck={() => { setOpen(false); navigate(`/brands/edit?b=${brandId}&cat=positioning&tool=healthcheck`); }}
          />
        </div>
      )}
    </>
  );
}
