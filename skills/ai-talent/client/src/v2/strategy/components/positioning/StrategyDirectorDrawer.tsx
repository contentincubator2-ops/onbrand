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
 * 3. 產品頁面有自己的三個角色（2026-09-24 定案，CJ:「產品定位就用你推薦的
 *    那三位人選」）：產品價值主張（Osterwalder VPC）／Kano 產品策略／定價與
 *    組合。URL 有 ?p= 就是產品頁，scope 跟著切，連 localStorage 的「選過誰」
 *    也分開記——兩組角色不同，共用一個 key 會讓產品頁掛著品牌定位總監。
 *    角色定義在 server 的 STRATEGIST_ROLES，這裡不再有任何人選知識。
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
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import {
  type StrategistDirector, avatarSrcOf, roleLabelOf, readStoredDirector, writeStoredDirector, scopeFromUrl,
  isChannelScope, isPageScope, advisorLabelOf, advisorSubtitleOf, isAdvisorHiddenPath,
} from "../../lib/strategistDirectors";
import StrategyDirectorChat from "./StrategyDirectorChat";
import { DirectorRoster, DirectorProfile } from "./StrategyDirectorPicker";
import StrategyHistoryModal from "./StrategyHistoryModal";
import { CloseIcon } from "../../../platform/components/icons";
import { useDirectorDocked } from "../../lib/directorDock";

/** 三個檢視共用的高度——切換檢視時面板不會變大變小。 */
const PANEL_HEIGHT = 440;

type View = "chat" | "roster" | "profile";

export default function StrategyDirectorDrawer({ brandId }: { brandId: number | null }) {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  // 2026-09-23（CJ「每一個頁面駐守的總監，都能先讀取該品牌完整的資料」）：
  // 使用者正在看某個產品時（URL 的 ?p=），把產品 id 一起送給後端，那個產品
  // 的完整定位會進 prompt。品牌大腦與整份產品清單則是後端一律附上，不靠
  // 這個參數——所以就算不在產品頁，總監也答得出「我有哪些產品」。
  const [searchParams] = useSearchParams();
  const urlProductId = Number(searchParams.get("p"));
  const productId = Number.isFinite(urlProductId) && urlProductId > 0 ? urlProductId : null;
  // 2026-09-24（CJ「產品定位就用你推薦的那三位人選」＋「右下方還是寫著策略總監，
  // 沒有更換成產品的專家」）：產品情境用另一組角色（產品價值主張／Kano／定價與
  // 組合）。判斷規則在 scopeFromUrl——**產品清單頁（cat=products）也算**，
  // 不是只有單一產品頁（?p=）。
  const { pathname } = useLocation();
  const scope = scopeFromUrl({ p: searchParams.get("p"), cat: searchParams.get("cat"), e: searchParams.get("e"), path: pathname });
  // 2026-10-01：設定／後台這類頁面不掛顧問（見 isAdvisorHiddenPath）。hooks 照跑，只在 render 前 return。
  const hiddenHere = isAdvisorHiddenPath(pathname);

  const docked = useDirectorDocked();
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<View>("chat");
  // 2026-09-30（CJ「內容企劃…跟右下方的策略總監，是否會衝突」）：活動頁的內容企劃被問到
  // 方向（訴求、主角、對誰說）時不自己改，丟 onbrand:ask-director 過來——這裡打開面板、
  // 把問題填進輸入框。一件事只有一個人負責，兩個對話框才不會打架。
  const [prefill, setPrefill] = React.useState<{ text: string; nonce: number } | null>(null);
  React.useEffect(() => {
    const onAsk = (e: Event) => {
      const q = String((e as CustomEvent).detail?.question ?? "").trim();
      if (!q) return;
      setOpen(true);
      setView("chat");
      setPrefill({ text: q, nonce: Date.now() });
    };
    window.addEventListener("onbrand:ask-director", onAsk);
    return () => window.removeEventListener("onbrand:ask-director", onAsk);
  }, []);
  const [agentId, setAgentId] = React.useState<number | null>(null);
  /** 正在看誰的背景——可能不是目前聊天的那一位（在人選列表裡點「查看背景」）。 */
  const [profileOf, setProfileOf] = React.useState<StrategistDirector | null>(null);

  // 不等使用者點開才查：收合狀態那顆頭像就是「你的策略總監長這樣」，
  // 先查好才不會出現「點開之後頭像才換人」。三支 indexed SELECT 而已，
  // 再加 staleTime 讓同一個品牌在頁面之間切換不重查。
  // 2026-09-24（自我 debug）：使用者可能從「換更多人選」挑了不在這三位裡面的人。
  // 把存起來的那個 id 一起送給後端，後端會把那一位附在名單後面——前端不必自己
  // 維護第二份名單，重新整理之後選擇也還在。
  const storedAgentId = React.useMemo(
    () => (brandId ? readStoredDirector(brandId, scope) : null),
    [brandId, scope],
  );
  const listQ = (trpc as any).strategistChat?.listDirectors?.useQuery
    ? (trpc as any).strategistChat.listDirectors.useQuery(
        { brandId: brandId ?? 0, scope, ...(storedAgentId ? { includeAgentId: storedAgentId } : {}) },
        { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 5 * 60_000 },
      )
    : { data: null, isLoading: false };
  // useMemo 綁在 data 上：`?? []` 每次 render 都是新陣列，下面那些以 directors
  // 當 dependency 的 effect 會因此每次 render 都重跑一遍。
  const fetched: StrategistDirector[] = React.useMemo(
    () => listQ?.data?.directors ?? [],
    [listQ?.data],
  );
  // 這一輪剛從搜尋挑的人——後端要等下一次查詢才會帶他回來，中間這段時間得先
  // 靠這個 state 撐著，不然按下「找他聊」會瞬間變成「找不到策略總監」。
  const [pickedExtra, setPickedExtra] = React.useState<StrategistDirector | null>(null);
  // 2026-09-26（CJ「按一個鈕，跳出一個視窗，決定要看跟哪個 AGENT 的對話紀錄」）：
  // 歷史視窗掛在這一層，因為選了別位的紀錄要連人一起換——agentId 由這裡管。
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [viewingConversationId, setViewingConversationId] = React.useState<number | null>(null);
  const directors: StrategistDirector[] = React.useMemo(() => (
    pickedExtra && !fetched.some((d) => d.agentId === pickedExtra.agentId)
      ? [...fetched, pickedExtra]
      : fetched
  ), [fetched, pickedExtra]);

  // 換品牌、或在品牌頁/產品頁之間切換，都要重選一次預設人選——那是兩組
  // 不同的角色，沿用上一組的選擇會變成「產品頁掛著品牌定位總監」。
  //
  // 2026-09-27：這個 reset 必須寫在「選預設人選」那個 effect **前面**。React 依宣告
  // 順序跑 effect：原本是先選人、再 reset 成 null；新頁的名單若已在快取裡，directors
  // 不會再變，選人 effect 不會重跑，面板就卡在「找不到可用的策略總監」（在 FB→X 等
  // 通路頁之間切換時重現）。
  React.useEffect(() => {
    setAgentId(null); setPickedExtra(null); setView("chat");
    setViewingConversationId(null); setHistoryOpen(false);
  }, [brandId, scope]);

  // 選過的人記在 localStorage（per brand）。三位人選回來之後才決定目前是誰：
  // 存過的那位還在名單裡就用他，否則用第一位。換品牌時 brandId 會變，這個
  // effect 會重跑，所以不會把 A 品牌選的人帶到 B 品牌。
  React.useEffect(() => {
    if (!brandId || directors.length === 0) return;
    setAgentId((prev) => {
      if (prev && directors.some((d) => d.agentId === prev)) return prev;
      const stored = readStoredDirector(brandId, scope);
      if (stored && directors.some((d) => d.agentId === stored)) return stored;
      return directors[0]!.agentId;
    });
  }, [brandId, directors, scope]);

  const current = React.useMemo(
    () => directors.find((d) => d.agentId === agentId) ?? null,
    [directors, agentId],
  );

  const pick = (d: StrategistDirector) => {
    setPickedExtra(d);          // 搜尋來的人先留在本地，下一次 listDirectors 會正式帶回來
    setAgentId(d.agentId);
    if (brandId) writeStoredDirector(brandId, d.agentId, scope);
    setViewingConversationId(null);   // 換人＝回到那個人的目前這串，不要沿用上一位的歷史
    setView("chat");
  };

  // 活動頁把總監收進左邊的對話卡了（directorDock.ts）：右下角不再開第二個對話框。
  // 設定／後台這類頁面不掛顧問（isAdvisorHiddenPath）。
  if (!brandId || docked || hiddenHere) return null;

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
            {/* 2026-09-24：標籤也跟著 scope 換字。CJ 在產品清單頁看到的是
                「策略總監」＋一位品牌策略師，兩個訊號都說「這不是產品專家」；
                人換了、標籤沒換的話，收合狀態下還是看不出來切過。 */}
            {/* 2026-09-26：文字頁也有自己的三位（語氣／用詞規範／產業用語），
                標籤跟著換——標籤沒換的話，收合狀態下看不出人已經換過。 */}
            {advisorLabelOf(scope, en)}
          </div>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={en ? "Open your Strategy Director" : "打開你的策略總監"}
          title={
            scope === "product"
              ? (en ? "Your product strategy directors — value proposition, Kano, pricing" : "你的產品策略總監——價值主張、Kano、定價與組合")
              : scope === "copy"
                ? (en ? "Your wording directors — tone of voice, word rules, industry language" : "你的用詞總監——品牌語氣、用詞規範、產業用語")
                : (isChannelScope(scope) || isPageScope(scope))
                  ? `${en ? "Your " : /^[A-Za-z]/.test(advisorLabelOf(scope, en)) ? "你的 " : "你的"}${advisorLabelOf(scope, en)}${directors.length ? `${en ? " — " : "——"}${directors.map((d) => roleLabelOf(d, en)).join(en ? ", " : "、")}` : ""}`
                : (en ? "Your Strategy Director — built for this brand" : "你的策略總監——為這個品牌而設計")
          }
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
                    {current?.name
                      ?? ((listQ?.isLoading || listQ?.isFetching)
                            ? (en ? "Loading…" : "載入中…")
                            : advisorLabelOf(scope, en))}
                  </div>
                  <div style={{ fontSize: 11, color: "#737373", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {current
                      ? `${roleLabelOf(current, en)}・${current.title}`
                      : advisorSubtitleOf(scope, en)}
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
                  <CloseIcon size={14} />
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
          {view === "chat" && !current && (listQ?.isLoading || listQ?.isFetching) && (
            <div style={{
              height: PANEL_HEIGHT, border: "2px solid #111", borderRadius: 18, background: "#fff",
              boxShadow: "4px 4px 0 rgba(17,17,17,0.15)", padding: 18,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <p style={{ fontSize: 12.5, color: "#a3a3a3", margin: 0 }}>{en ? "Loading…" : "載入中…"}</p>
            </div>
          )}
          {/* 2026-09-25（CJ 回報「目前在 mos_db 找不到可用的策略總監人選」，但
              server 端實測兩種 scope 都正常回三位）：原本的空狀態**在說謊**——
              查詢失敗時也顯示同一句「mos_db 找不到人選」，於是真正的原因（權限、
              網路、伺服器例外）被蓋掉，使用者跟我都只能猜。三種狀態現在分開講：
              載入中／查詢失敗（顯示真正的錯誤訊息＋重試）／真的沒有人選。 */}
          {view === "chat" && !current && !listQ?.isLoading && !listQ?.isFetching && listQ?.error && (
            <div style={{
              height: PANEL_HEIGHT, border: "2px solid #111", borderRadius: 18, background: "#fff",
              boxShadow: "4px 4px 0 rgba(17,17,17,0.15)", padding: 18,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 10,
            }}>
              <p style={{ fontSize: 12.5, lineHeight: 1.7, color: "#B45309", margin: 0, maxWidth: 300 }}>
                {en ? "Couldn't load your directors." : "讀取策略總監失敗。"}
                <br />
                <span style={{ color: "#737373", fontSize: 11.5 }}>
                  {String((listQ.error as any)?.message ?? "").slice(0, 200)}
                </span>
              </p>
              <button
                onClick={() => listQ.refetch?.()}
                style={{
                  fontSize: 12, fontWeight: 700, border: "1.5px solid #171717", borderRadius: 999,
                  padding: "4px 12px", background: "#fff", cursor: "pointer", color: "#171717",
                }}
              >
                {en ? "Try again" : "重試"}
              </button>
            </div>
          )}
          {view === "chat" && !current && !listQ?.isLoading && !listQ?.isFetching && !listQ?.error && (
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
              productId={productId}
              director={current}
              scope={scope}
              height={PANEL_HEIGHT}
              onOpenMonitor={() => { setOpen(false); navigate(`/brands/edit?b=${brandId}&cat=positioning&tool=monitor`); }}
              onOpenHistory={() => setHistoryOpen(true)}
              viewingConversationId={viewingConversationId}
              onBackToCurrent={() => setViewingConversationId(null)}
              prefill={prefill}
            />
          )}
        </div>
      )}

      {/* 對話紀錄：先選人、再選那串。選了別位就連人一起換——不然畫面上會
          出現「A 的名字配 B 的對話」。 */}
      <StrategyHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        brandId={brandId}
        scope={scope}
        currentAgentId={agentId}
        onPickConversation={(nextAgentId, conversationId) => {
          if (nextAgentId !== agentId) {
            setAgentId(nextAgentId);
            if (brandId) writeStoredDirector(brandId, nextAgentId, scope);
          }
          setViewingConversationId(conversationId);
          setView("chat");
          setOpen(true);
        }}
      />
    </>
  );
}
