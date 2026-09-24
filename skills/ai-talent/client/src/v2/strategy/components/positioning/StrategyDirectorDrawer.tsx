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
 *   是訊息區沒有固定高度，純內容撐開（見 StrategyDirectorChat.tsx）。
 *   「右下方的策略總監，應該要有個小標籤，顯示它是策略總監，這樣，用戶
 *   才會懂得問他」——頭像左邊常駐一顆文字標籤（面板收合時才顯示）。
 *
 * ── 2026-09-23 第三輪：三個人選 + 互動方式重做 ────────────────────────
 * CJ「品牌頁面的右下方，品牌策略總監的三個人選，以及和品牌策略總監的互動
 * 方式，包括問問題的引導還有查看背景的使用者體驗設計」。
 *
 * 1. 人選改成真的。前一版的 strategistPersonas.ts 是兩位寫死的佔位人設
 *    （isPlaceholder: true），理由寫的是「mos_db 沒金鑰查不到」——那個判斷
 *    是錯的：mos_db 就是這個 app 自己的 MySQL，金鑰只有本機 MCP bridge 那條
 *    路才需要，server 一直都查得到。現在三位人選來自
 *    strategistChat.listDirectors（真實 agent 列），那個檔案已刪除。
 *    三位固定的是「角度」不是 agent id：品牌定位 / 定價與價值 / 消費者行為，
 *    每個角度在使用者品牌的產業裡找人，找不到才用預設人選（見 server 的
 *    strategistDirectory.ts）。
 *
 * 2. 面板改成三個等高檢視（chat / roster / profile）而不是「抬頭下面展開
 *    一小段」。理由見 StrategyDirectorPicker.tsx 的檔頭：小抽屜裡塞不下
 *    「一位有經歷的顧問」，而且高度會跳。
 *
 * 3. 產品頁面的人選還沒決定（CJ:「我們先決定品牌策略師，等等再決定產品頁面
 *    的策略人選」），所以這一輪產品頁面暫時共用同一組品牌角度的人選——這比
 *    留著原本那位標著「⚠ 這是佔位資料」的假產品總監誠實。下一輪要做的是在
 *    STRATEGIST_ROLES 加上產品向的角色（scope 欄位），不是回頭改這裡。
 *
 * 黑白線條 B&W 風格（呼應 AgentPersonaBar／PipelineThinkingPanel 那套
 * 「4A 代理商」視覺語言，跟 Mia 的漸層紫刻意不同——就算現在同一個角落，
 * 一眼也看得出是不同角色）。
 *
 * 全域可見的前提是「有品牌在 scope 裡」——沒有品牌時不出現。brandId 來自
 * ShellLayout 自己的全域 scope（跟 Mia 讀的是同一個來源）。
 *
 * 「引導進行策略監測/健檢」的動作在這裡會先關閉面板、導去品牌定位頁，
 * 帶著 ?tool= 參數——BrandsPage 讀到這個參數會自動展開對應的面板。
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import {
  type StrategistDirector, avatarSrcOf, roleLabelOf, readStoredDirector, writeStoredDirector,
} from "../../lib/strategistDirectors";
import StrategyDirectorChat from "./StrategyDirectorChat";
import { DirectorRoster, DirectorProfile } from "./StrategyDirectorPicker";

/** 三個檢視共用的高度——切換檢視時面板不會變大變小。 */
const PANEL_HEIGHT = 440;

type View = "chat" | "roster" | "profile";

export default function StrategyDirectorDrawer({ brandId }: { brandId: number | null }) {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();

  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<View>("chat");
  const [agentId, setAgentId] = React.useState<number | null>(null);
  /** 正在看誰的背景——可能不是目前聊天的那一位（在人選列表裡點「查看背景」）。 */
  const [profileOf, setProfileOf] = React.useState<StrategistDirector | null>(null);

  // 不等使用者點開才查：收合狀態那顆頭像就是「你的策略總監長這樣」，
  // 先查好才不會出現「點開之後頭像才換人」。三支 indexed SELECT 而已，
  // 再加 staleTime 讓同一個品牌在頁面之間切換不重查。
  const listQ = (trpc as any).strategistChat?.listDirectors?.useQuery
    ? (trpc as any).strategistChat.listDirectors.useQuery(
        { brandId: brandId ?? 0 },
        { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 5 * 60_000 },
      )
    : { data: null, isLoading: false };
  const directors: StrategistDirector[] = listQ?.data?.directors ?? [];

  // 選過的人記在 localStorage（per brand）。三位人選回來之後才決定目前是誰：
  // 存過的那位還在名單裡就用他，否則用第一位。換品牌時 brandId 會變，這個
  // effect 會重跑，所以不會把 A 品牌選的人帶到 B 品牌。
  React.useEffect(() => {
    if (!brandId || directors.length === 0) return;
    setAgentId((prev) => {
      if (prev && directors.some((d) => d.agentId === prev)) return prev;
      const stored = readStoredDirector(brandId);
      if (stored && directors.some((d) => d.agentId === stored)) return stored;
      return directors[0]!.agentId;
    });
  }, [brandId, directors]);
  React.useEffect(() => { setAgentId(null); setView("chat"); }, [brandId]);

  const current = React.useMemo(
    () => directors.find((d) => d.agentId === agentId) ?? null,
    [directors, agentId],
  );

  const pick = (d: StrategistDirector) => {
    setAgentId(d.agentId);
    if (brandId) writeStoredDirector(brandId, d.agentId);
    setView("chat");
  };

  if (!brandId) return null;

  const headerBtn = (active: boolean): React.CSSProperties => ({
    fontSize: 11.5, fontWeight: 600, border: "1px solid #D4D4D4", borderRadius: 999, padding: "3px 10px",
    background: active ? "#171717" : "#fff", color: active ? "#fff" : "#525252", cursor: "pointer",
  });

  return (
    <>
      <div style={{
        // 右下角（Mia 原本的位置——她的頭像已隱藏）。標籤 + 頭像同一個
        // fixed row，標籤在左、頭像在右。
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
          <img src={avatarSrcOf(current)} alt={current?.name ?? ""} style={{ width: "100%", height: "100%", borderRadius: "50%", display: "block" }} />
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
          // 從 launcher 往上長（bottom 錨定），面板底邊永遠貼著 launcher。
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
                <img src={avatarSrcOf(current)} alt="" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#171717", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {current?.name ?? (listQ?.isLoading ? (en ? "Loading…" : "載入中…") : (en ? "Strategy Director" : "策略總監"))}
                  </div>
                  <div style={{ fontSize: 11, color: "#737373", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {current ? `${roleLabelOf(current, en)}・${current.title}` : (en ? "Built for your brand" : "為你的品牌而設計")}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => setView((v) => (v === "roster" ? "chat" : "roster"))}
                  disabled={directors.length === 0}
                  style={{ ...headerBtn(view === "roster"), opacity: directors.length === 0 ? 0.45 : 1 }}
                >
                  {en ? "Switch" : "換人"}
                </button>
                <button
                  onClick={() => {
                    if (view === "profile") { setView("chat"); return; }
                    if (!current) return;
                    setProfileOf(current);
                    setView("profile");
                  }}
                  disabled={!current}
                  style={{ ...headerBtn(view === "profile"), opacity: current ? 1 : 0.45 }}
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
          </div>

          {view === "roster" && (
            <DirectorRoster
              directors={directors}
              currentAgentId={agentId}
              onPick={pick}
              onViewProfile={(d) => { setProfileOf(d); setView("profile"); }}
              onBack={() => setView("chat")}
              height={PANEL_HEIGHT}
            />
          )}
          {view === "profile" && profileOf && (
            <DirectorProfile
              director={profileOf}
              isCurrent={profileOf.agentId === agentId}
              onPick={pick}
              onBack={() => setView(directors.some((d) => d.agentId === profileOf.agentId) && profileOf.agentId !== agentId ? "roster" : "chat")}
              height={PANEL_HEIGHT}
            />
          )}
          {view === "chat" && !current && !listQ?.isLoading && (
            // mos_db 一位都查不到（資料被改動過）——說清楚是哪裡沒有東西，
            // 不要留一個永遠打不出字的輸入框讓人以為是壞掉。
            <div style={{
              height: PANEL_HEIGHT, border: "2px solid #111", borderRadius: 18, background: "#fff",
              boxShadow: "4px 4px 0 rgba(17,17,17,0.15)", padding: 18,
              display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
            }}>
              <p style={{ fontSize: 12.5, lineHeight: 1.7, color: "#737373", margin: 0 }}>
                {en
                  ? "No strategy director is available in mos_db right now."
                  : "目前在 mos_db 找不到可用的策略總監人選。"}
              </p>
            </div>
          )}
          {view === "chat" && current && (
            <StrategyDirectorChat
              brandId={brandId}
              agentId={agentId}
              director={current}
              height={PANEL_HEIGHT}
              onOpenMonitor={() => { setOpen(false); navigate(`/brands/edit?b=${brandId}&cat=positioning&tool=monitor`); }}
              onOpenHealthCheck={() => { setOpen(false); navigate(`/brands/edit?b=${brandId}&cat=positioning&tool=healthcheck`); }}
            />
          )}
        </div>
      )}
    </>
  );
}
