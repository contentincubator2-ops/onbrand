/**
 * 定位頁頂端：進度、動作與完成後的銜接。
 */
import { useNavigate } from "react-router-dom";
import { agentLabel, agentShortName } from "../../../platform/lib/agentName";
import { useLang } from "../../../../lib/i18n";
import { trpc } from "../../../../lib/trpc";
import { useState } from "react";
import { Avatar } from "@heroui/react";
import { GenerateIcon, PlayIcon, WarningIcon } from "../../../platform/components/icons";

/* ────────────────── PositioningCompletionBridge ──────────────────
   Renders right after the 14-step pipeline finishes — closes the loop
   between "定位完成" and "內容產出". Makes the methodology→content
   causality explicit (reviewer feedback 2026-05-11).
   ────────────────────────────────────────────────────────────────── */
export function PositioningCompletionBridge({
  brandId, scopeMode,
}: { brandId: number | null; scopeMode: "brand"|"product"|"event"|"none" }) {
  const navigate = useNavigate();
  const { lang } = useLang();
  if (!brandId) return null;
  const scopeLabel = scopeMode === "product"
    ? (lang === "en" ? "product positioning" : "產品定位")
    : scopeMode === "event"
      ? (lang === "en" ? "campaign positioning" : "活動定位")
      : (lang === "en" ? "brand positioning"    : "品牌定位");
  return (
    <div
      style={{
        background: "#FAFAF9",
        border: "1px solid #171717",
        borderRadius: 14,
        padding: "20px 24px",
        display: "flex",
        alignItems: "center",
        gap: 20,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: "1 1 320px", minWidth: 0 }}>
        <h3 style={{
          fontSize: 18, fontWeight: 700, color: "#171717",
          letterSpacing: "-0.01em", marginBottom: 4,
        }}>
          {lang === "en"
            ? `Your ${scopeLabel} is ready`
            : `你的${scopeLabel}已備好`}
        </h3>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {/* 2026-07-17 (CJ 去除時間分類 + zombie audit round 2): the /30s /60s
            /99s tier routes were removed 2026-05-27 — these three buttons all
            404'd. Tasks are platform-first now, one wall covers all sizes. */}
        <BridgeBtn label={lang === "en" ? "Run a task" : "去跑任務"} onClick={() => navigate(`/tasks/fb?b=${brandId}`)} primary />
        <BridgeBtn label={lang === "en" ? "Idea stage" : "靈感舞台"} onClick={() => navigate(`/inspiration?b=${brandId}`)} />
      </div>
    </div>
  );
}

export function BridgeBtn({ label, onClick, primary }: { label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 14px",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.04em",
        borderRadius: 6,
        cursor: "pointer",
        border: "1px solid #171717",
        background: primary ? "#171717" : "#FFFFFF",
        color: primary ? "#FFFFFF" : "#171717",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        if (primary) e.currentTarget.style.background = "#262626";
        else e.currentTarget.style.background = "#F5F5F4";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = primary ? "#171717" : "#FFFFFF";
      }}
    >
      {label} →
    </button>
  );
}

/* ─────────────────────────── PositioningTopRow ───────────────────────
   Compact action row for the 定位 tab — replaces wide TabActionBar.
   Shows: 自動定位 button + live job progress + 🔓 lock chip.
   The 自動定位 button fires positioningJobs.start (new background
   runner with retry × 5 + parallel waves + cost tracking).
   ───────────────────────────────────────────────────────────────────── */
export function PositioningTopRow({
  brandId, directorBrandId, scopeMode, locked,
}: {
  brandId: number | null;
  /** 挑策略總監用的品牌 id（brandId 在產品／活動 scope 時是那個實體的 id）。 */
  directorBrandId: number | null;
  scopeMode: "brand"|"product"|"event"|"none";
  locked: boolean;
}) {
  const { lang } = useLang();
  // 2026-09-30（CJ「SoWork 定位要選擇成一個 agent 來執行嗎?」）：由策略總監執行——品牌（與活動）
  // 是品牌定位總監、產品是產品價值主張總監；人選跟右下角策略總監同一支 listDirectors。
  const directorScope = scopeMode === "product" ? "product" : "brand";
  const directorsQ = (trpc as any).strategistChat.listDirectors.useQuery(
    { brandId: directorBrandId ?? 0, scope: directorScope },
    { enabled: !!directorBrandId, staleTime: 5 * 60_000, refetchOnWindowFocus: false },
  );
  const directors: Array<{ agentId: number; roleId: string; name: string; nameEn?: string; avatarUrl?: string; roleLabel?: string }> = directorsQ.data?.directors ?? [];
  const director = directors.find((d) => d.roleId === (directorScope === "product" ? "product_value_prop" : "brand_positioning")) ?? directors[0] ?? null;
  // 2026-05-08: hooks must be called unconditionally (Rules of Hooks).
  // Previous version did `(entityKind && brandId) ? useQuery(...) : null`
  // which made hook count vary across renders → React broke silently
  // and the auto-定位 button stopped working.
  const entityKind: "brand"|"product"|"event"|null =
    scopeMode === "brand" ? "brand" :
    scopeMode === "product" ? "product" :
    scopeMode === "event" ? "event" : null;

  const [startError, setStartError] = useState<string | null>(null);
  // 2026-05-11 (CJ「第一次按重新自動定位的時候，都沒有反應」): the
  // getStatus query polls every 4s, so after start mutation succeeds
  // the button label stayed "重新自動定位" for up to 4 seconds —
  // users thought nothing happened. Use a local optimistic flag so the
  // UI flips to "啟動中…" instantly, plus immediate invalidate.
  const [optimisticStarting, setOptimisticStarting] = useState(false);
  const utils = (trpc as any).useUtils?.() ?? null;

  // 2026-06-16 (CJ「產品定位卡住了，無法完成」): job 376 (product 46) showed
  // backend status=done after 26s, but the UI stayed on "分析中 0/6" forever.
  // Root cause: refetchInterval pauses while the tab is backgrounded (React
  // Query default), and this pipeline can finish faster than the user
  // switches back. refetchIntervalInBackground keeps polling even when the
  // tab isn't focused; refetchOnWindowFocus/refetchOnMount force a fresh
  // read the moment the user does look back, instead of trusting stale cache.
  const job = (trpc as any).positioningJobs?.getStatus?.useQuery(
    { entityKind: entityKind ?? "brand", entityId: brandId ?? 0 },
    {
      enabled: !!brandId && !!entityKind,
      refetchInterval: 4_000,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
    },
  );
  const jobData = (job?.data as any) ?? null;
  const isRunning = jobData?.status === "running" || optimisticStarting;
  const isDone = jobData?.status === "done";
  const isFailed = jobData?.status === "failed";
  const cur = Number(jobData?.currentStep ?? 0);
  const total = Number(jobData?.totalSteps ?? 0);

  const startMut = (trpc as any).positioningJobs?.start?.useMutation?.({
    onSuccess: (data: any) => {
      if (!data?.ok) {
        setStartError(data?.error || (lang === "en" ? "Couldn't start" : "啟動失敗"));
        setOptimisticStarting(false);
      } else {
        setStartError(null);
        // Immediately refetch status so the button flips to "自動定位中…".
        utils?.positioningJobs?.getStatus?.invalidate?.();
        // Stop optimistic state once the server reports running.
        setTimeout(() => setOptimisticStarting(false), 5_000);
      }
    },
    onError: (e: any) => {
      setStartError(String(e?.message ?? e ?? (lang === "en" ? "Couldn't start" : "啟動失敗")));
      setOptimisticStarting(false);
    },
  });

  const handleAuto = () => {
    if (!brandId || !entityKind || locked || isRunning) return;
    // 重跑會把定位段落整段換掉（自建卡片與文字資產保留，見 positioningJobRunner.mergePositioning）。
    if (isDone && !confirm(lang === "en"
      ? "Re-run the method? It rewrites the positioning sections (your own cards and copy assets stay)."
      : "要重新套用嗎？會重寫目前的定位段落（你自建的卡片與文字資產不受影響）。")) return;
    setStartError(null);
    setOptimisticStarting(true); // instant feedback
    // 2026-09-30（CJ「總監的人設應該會影響產出」）：把按下的這位總監帶給 pipeline。
    startMut?.mutate?.({ entityKind, entityId: brandId, lang: "zh-TW", ...(director?.agentId ? { directorAgentId: director.agentId } : {}) });
  };

  // 2026-05-17: brand pipeline = 10 steps (one per BRAND_SEGMENTS id).
  // 2026-06-16: event pipeline = 11 steps (one per EVENT_SEGMENTS id);
  // product = 6 (one per PRODUCT_SEGMENTS id). Match positioningSteps.ts.
  const totalSteps = entityKind === "brand" ? 10 : entityKind === "product" ? 6 : 11;
  // 2026-05-11 (reviewer:「重新自動定位 可以更名... 強調套用SoWork 品牌定位框架」)
  // — frame the button as applying a named methodology, not as a generic
  // "AI fills it in" action. Methodology becomes the competitive moat.
  const methodLabel = entityKind === "brand"
    ? (lang === "en" ? "the SoWork Brand Positioning Method (14 steps)" : "SoWork 品牌定位法（14 步）")
    : entityKind === "product"
      ? (lang === "en" ? "the product positioning framework (6 steps)" : "產品定位框架（6 步）")
      : (lang === "en" ? "the campaign positioning framework (11 steps)" : "活動定位框架（11 步）");
  const shortMethodLabel = entityKind === "brand"
    ? (lang === "en" ? "the SoWork method" : " SoWork 定位法")
    : entityKind === "product"
      ? (lang === "en" ? "the product framework" : "產品定位框架")
      : (lang === "en" ? "the campaign framework" : "活動定位框架");
  const buttonLabel =
    optimisticStarting && !jobData?.status
      ? (lang === "en" ? "Starting…" : "啟動中…")
      : isRunning
        ? (lang === "en" ? `Analyzing ${cur}/${total || totalSteps}` : `分析中 ${cur}/${total || totalSteps}`)
      : isDone
        // 2026-09-30（CJ「重新套用SoWork品牌定位法的功能，看起來可以縮小一點」）：
        // 已經跑完的版本字拿短——步數留在滑過的說明裡。
        ? (lang === "en" ? `Re-apply ${shortMethodLabel}` : `重新套用${shortMethodLabel}`)
      : isFailed
        ? (lang === "en" ? `Retry — ${methodLabel}` : `重試 — ${methodLabel}`)
        : (lang === "en" ? `Apply ${methodLabel}` : `套用${methodLabel}`);

  return (
    <>
      {/* Auto-定位 + status row。
          2026-09-23（CJ「套用SoWork定位法的按鈕，跟策略監測的按鈕大小樣式都相同，
          就可以」）：原本是一顆 px-4 py-2 的黑色實心按鈕，跟同一排的策略監測／
          策略健檢兩顆描邊 pill 不同量級。三件事是並列的入口，長得不一樣只會讓人
          以為有一個比較重要。改成跟 StrategyToolIcon 同一組 class（rounded-full /
          border / px-3 py-1.5 / text-[12.5px]）——那邊是 12.5px + icon 12，這裡照抄，
          兩邊要一起改才不會又各長各的。
          外層的 mb-3 也拿掉：現在它被包在工具列那一排裡面，間距由那一排統一給。 */}
      {/* 2026-09-30（CJ「重新套用…可以縮小一點」）：跑完之後它是少用的次要動作——
          改成不帶框的小字、靠右，不再跟「定位資料／策略監測」同一個量級。
          還沒跑過（第一次套用）時維持 pill，那時它就是這一頁最該按的東西。 */}
      {/* 2026-09-30：策略總監頭像＝開始鍵（樣式同任務卡與策略監測：橘框＋▶，名字與動作在下方）。 */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleAuto}
          disabled={!brandId || !entityKind || locked || isRunning || startMut?.isPending}
          aria-label={buttonLabel}
          className="shrink-0 flex flex-col items-center gap-1 group disabled:cursor-not-allowed"
          title={
            locked
              ? (lang === "en" ? "Locked — unlock to re-run" : "已鎖定 — 解鎖後才能重跑")
              : isRunning
                ? (lang === "en" ? `Running in the background (step ${cur}/${total})` : `背景產生中（步驟 ${cur}/${total}）`)
                : `${director ? `${agentLabel(director, lang)}${director.roleLabel ? ` · ${director.roleLabel}` : ""}\n` : ""}${lang === "en"
                    ? `${methodLabel}: auto-fill every positioning field (${totalSteps} steps, background run, retry × 5)`
                    : `${methodLabel}：自動填寫所有定位欄位（共 ${totalSteps} 步，背景執行，最多重試 5 次）`}`
          }
        >
          <span className={`relative block rounded-full p-[3px] ring-[3px] transition ${locked ? "ring-neutral-300" : "ring-[#F37E4A]"} ${isRunning ? "animate-pulse" : "group-hover:scale-105 group-active:scale-95"}`}>
            {director?.avatarUrl ? (
              <Avatar src={director.avatarUrl} alt={agentLabel(director, lang)} className="w-12 h-12" />
            ) : (
              <span className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-700">
                <GenerateIcon size={18} />
              </span>
            )}
            {!locked && (
              <span className="absolute -right-1 -bottom-1 w-6 h-6 rounded-full bg-[#F37E4A] text-white flex items-center justify-center ring-2 ring-white">
                <PlayIcon size={10} />
              </span>
            )}
          </span>
          <span className="flex flex-col items-center leading-tight">
            {director && <span className="text-[12px] font-semibold text-neutral-900 max-w-[96px] truncate" title={agentLabel(director, lang)}>{agentShortName(director, lang)}</span>}
            <span className={`text-[11px] font-semibold ${locked ? "text-neutral-400" : "text-[#F37E4A]"}`}>
              {locked ? (lang === "en" ? "Locked" : "已鎖定")
                : optimisticStarting && !jobData?.status ? (lang === "en" ? "Starting…" : "啟動中…")
                : isRunning ? (lang === "en" ? `Analyzing ${cur}/${total || totalSteps}` : `分析中 ${cur}/${total || totalSteps}`)
                : isDone ? (lang === "en" ? "Re-apply method" : "重新套用定位法")
                : isFailed ? (lang === "en" ? "Retry" : "重試")
                : (lang === "en" ? "SoWork method" : "SoWork 定位法")}
            </span>
          </span>
        </button>

        {isRunning && total > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-32 h-1.5 bg-default-200 rounded-full overflow-hidden">
              <div className="h-full bg-neutral-900 transition-all" style={{ width: `${Math.min(100, (cur / total) * 100)}%` }} />
            </div>
            <span className="text-xs text-default-700 tabular-nums">{cur}/{total}</span>
            {/* 2026-06-16: manual escape hatch — if polling ever misses the
                done/failed transition (e.g. tab was backgrounded mid-run),
                this forces an immediate re-read instead of leaving the user
                staring at a stale "分析中 0/總數" with no way to recover
                short of a full page reload. */}
            <button
              onClick={() => utils?.positioningJobs?.getStatus?.invalidate?.()}
              className="text-[12px] text-default-500 hover:text-default-800 underline"
              title={lang === "en" ? "Force-refresh status" : "強制重新查詢狀態"}
            >
              {lang === "en" ? "refresh" : "重新查詢"}
            </button>
          </div>
        )}
        {isFailed && jobData?.lastError && (
          <span className="text-xs text-amber-700 max-w-md truncate" title={jobData.lastError}><WarningIcon size={11} /> {String(jobData.lastError).slice(0, 80)}</span>
        )}
        {/* 2026-09-30（CJ「已完成10個段落這段字，不知道要做甚麼」）：那是上次跑完的狀態，
            不是能做的事——卡片本身就看得出填了沒，拿掉。 */}
        {startError && (
          <span className="text-xs text-danger truncate max-w-md" title={startError}><WarningIcon size={11} /> {startError}</span>
        )}
      </div>

      {/* CJ 2026-05-08: removed duplicate wide lock bar from inside
          PositioningTopRow — the legacy lock bar above the body
          (BrandsPage.tsx:856) already covers all 3 tabs.
          2026-09-24：連帶把當時保留的 onLockToggle prop 也拿掉了——留著一個
          永遠不會被呼叫的 callback，只會讓下一個人以為這裡按了會鎖定。 */}
    </>
  );
}
