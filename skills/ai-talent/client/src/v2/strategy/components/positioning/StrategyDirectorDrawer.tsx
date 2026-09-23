/**
 * StrategyDirectorDrawer — 全域常駐的「策略總監」入口。
 *
 * 2026-09-23（CJ 連續指示，位置經過一次修正）：
 *   「用戶還可以看這個策略總監的背景，或是要換其他的策略總監。要達到每
 *   一頁都能這樣，你要重新思考使用者體驗」
 *   「我不喜歡你現在擺放策略總監的位置。我喜歡在右上方的位置」（第一版）
 *   → 後來改口：「我不喜歡將策略總監放在右上方，我偏好放在右下方，然後
 *   隱藏起mia」——現在是右下角，Mia 的頭像已在 ShellLayout.tsx 隱藏
 *   （{false && (...)}，客服後端跟次要入口都還在，只是拿掉最顯眼的浮動
 *   頭像，兩個角色不用搶同一個位置）。
 *   「現在的互動方式不好，我按一段文字後，一送出它的視窗就縮小」——根因
 *   是訊息區沒有固定高度，純內容撐開：還沒送出訊息時顯示的「問我任何
 *   問題」介紹文字比較長，送出第一則訊息後這段文字被換成（通常比較短的）
 *   對話氣泡，整個容器因此看起來「縮小」了。修法是訊息區改固定高度（見
 *   StrategyDirectorChat.tsx），不再讓容器高度跟著內容量伸縮。
 *   人設數量：「2-3位，從mos_db選擇」（mos_db 金鑰目前未設定，先用一份
 *   手寫預設人設頂著框架，見 strategistPersonas.ts 的說明）
 *   「右下方的策略總監，應該要有個小標籤，顯示它是策略總監，這樣，用戶
 *   才會懂得問他」——單靠圓形頭像 + hover title 不夠，使用者不會主動
 *   hover 去發現。改成頭像左邊常駐一顆文字標籤（面板收合時才顯示，展開
 *   後面板抬頭本來就有名字，標籤會跟面板重疊所以隱藏）。
 *   「品牌策略總監擅長於品牌，而產品策略總監，應該另外找一個背景有產品
 *   策略經驗的agent」——STRATEGIST_PERSONAS 拆成品牌／產品兩位（見
 *   strategistPersonas.ts），這裡依目前 URL 的 `p`（product id）參數判斷
 *   現在是不是在看某個產品，自動選對的人當預設；使用者仍可以用下拉選單
 *   手動換人，換的選擇分品牌/產品各自記在 localStorage，不會互相蓋掉。
 *   「agent的背景⋯要直接從mos_db抓取真實描述」——實測 mos-agents MCP
 *   仍缺 MOS_MANUS_API_KEY（不是我能解決的），兩位人設的 name/bio 目前
 *   都是誠實的佔位資料（`isPlaceholder: true`），背景面板會顯示一句
 *   提醒，不會假裝是真的。
 *
 * 黑白線條 B&W 風格（呼應 AgentPersonaBar／PipelineThinkingPanel 那套
 * 「4A 代理商」視覺語言，跟 Mia 的漸層紫刻意不同——就算現在同一個角落，
 * 一眼也看得出是不同角色）。
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
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLang } from "../../../../lib/i18n";
import { STRATEGIST_PERSONAS, getPersona, defaultPersonaForScope } from "../../lib/strategistPersonas";
import StrategyDirectorChat from "./StrategyDirectorChat";

/** 品牌／產品各自記自己選過的人，互不覆蓋——見檔頭 2026-09-23 第二次註記。 */
const personaStorageKey = (scopeMode: "brand" | "product") => `sowork.strategistPersona.${scopeMode}`;

export default function StrategyDirectorDrawer({ brandId }: { brandId: number | null }) {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // 全域 scope 只有品牌（見 project_scope_model 記憶）；產品/活動是 URL
  // 帶的 per-page 參數，這裡直接讀 `p`，不需要 ShellLayout 額外接線，
  // 也自然會隨著路由切換即時更新。
  const urlProductId = searchParams.get("p");
  const scopeMode: "brand" | "product" = urlProductId ? "product" : "brand";

  const [open, setOpen] = React.useState(false);
  const [showBio, setShowBio] = React.useState(false);
  const [personaId, setPersonaId] = React.useState<string>(() => {
    try { return localStorage.getItem(personaStorageKey(scopeMode)) ?? defaultPersonaForScope(scopeMode).id; }
    catch { return defaultPersonaForScope(scopeMode).id; }
  });
  // scope 變了（例如從品牌定位頁換到某個產品定位頁）就重新選一次預設人選
  // ——不然使用者會一直看到上一個 scope 選過的人，即使沒手動換過。
  const prevScopeRef = React.useRef(scopeMode);
  React.useEffect(() => {
    if (prevScopeRef.current === scopeMode) return;
    prevScopeRef.current = scopeMode;
    try {
      setPersonaId(localStorage.getItem(personaStorageKey(scopeMode)) ?? defaultPersonaForScope(scopeMode).id);
    } catch {
      setPersonaId(defaultPersonaForScope(scopeMode).id);
    }
  }, [scopeMode]);

  const persona = getPersona(personaId);
  const choosePersona = (id: string) => {
    setPersonaId(id);
    try { localStorage.setItem(personaStorageKey(scopeMode), id); } catch { /* noop */ }
  };
  const avatarUrl = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(persona.avatarSeed)}`;

  if (!brandId) return null;

  return (
    <>
      <div style={{
        // 2026-09-23：右下角（Mia 原本的位置——她的頭像已隱藏），不再是
        // 右上角。標籤 + 頭像用同一個 fixed row 排版，標籤在左、頭像在右
        // （row 靠 right:20 貼齊，順序自然就是標籤先出現在頭像左邊）。
        position: "fixed", bottom: 20, right: 20, zIndex: 50,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        {!open && (
          <div aria-hidden style={{
            fontSize: 12.5, fontWeight: 700, color: "#171717", whiteSpace: "nowrap",
            background: "#fff", border: "2px solid #111", borderRadius: 999,
            padding: "6px 12px", boxShadow: "2px 2px 0 rgba(17,17,17,0.22)",
          }}>
            {en ? "Strategy Director" : "策略總監"}
          </div>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={en ? "Open your Strategy Director" : "打開你的策略總監"}
          title={en ? "Your Strategy Director — built for this brand" : "你的策略總監——為這個品牌而設計"}
          style={{
            position: "relative", flexShrink: 0,
            width: 56, height: 56, borderRadius: "50%",
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
      </div>

      {open && (
        <div style={{
          // 2026-09-23：從右上角改成右下角、從launcher往上長（bottom 錨定），
          // 而不是從上往下長——這樣面板的底邊永遠貼著 launcher，整串內容
          // 變長時是往上推，不會讓人覺得位置在跳動。
          position: "fixed", bottom: 84, right: 20, zIndex: 50,
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
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #EFEDE8" }}>
                {persona.isPlaceholder && (
                  <p style={{
                    fontSize: 11, lineHeight: 1.5, color: "#92400E", background: "#FEF3C7",
                    borderRadius: 8, padding: "6px 9px", marginTop: 0, marginBottom: 8,
                  }}>
                    {en
                      ? "⚠ Placeholder profile — not yet a real background from mos_db (pending API access)."
                      : "⚠ 這是佔位資料，還不是從 mos_db 抓來的真實背景（等 API 金鑰設定後補上）。"}
                  </p>
                )}
                <p style={{ fontSize: 12.5, lineHeight: 1.65, color: "#404040", margin: 0 }}>
                  {persona.bio}
                </p>
              </div>
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
