/**
 * TheaterPage — 內容企劃台 v2 (CJ direction 2026-05-07).
 *
 * Layout (top → bottom):
 *   1. Top bar — platform multi-select + 加入重要日子 + 開始按鈕
 *   2. 大腦區 (sticky) — 1 line-art portrait frame + speech bubble
 *      typewriter. Single speaker, slides L→R between handoffs.
 *   3. Day-by-day waterfall — 1 row per day × N selected platforms.
 *      Each cell = mockup with caption (typed) + image (lazy gen).
 *
 * Generation pacing (per CJ "max 2 captions concurrent, images 1 by 1"):
 *   captionQueue concurrency = 2
 *   imageQueue   concurrency = 1
 *   image fires only after caption done; visual cascade by date order.
 *
 * Phase 1 (this commit): pure-frontend skeleton with mocked stage progression
 * so CJ can verify the brain bar animation + cast handoff feel before we
 * wire the real `runCalendar` backend (next commit).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import { Avatar, Button, Spinner } from "@heroui/react";
import {
  Sparkles,
  Calendar as CalendarIcon,
  Plus,
  Play,
  X,
  Check,
  RefreshCw,
  Copy,
} from "lucide-react";
import {
  THEATER_CAST,
  PLATFORM_META,
  getChief,
  getQA,
  getPlatformLead,
  getPlatformWriter,
  getPlatformImage,
  castIds,
  type CastMember,
  type TheaterPlatform,
} from "../config/theaterCast";

// ─── Types ────────────────────────────────────────────────────────────────

interface ImportantDate {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
}

interface CellState {
  status: "idle" | "queued" | "writing" | "imaging" | "done" | "failed";
  caption?: string;
  imageUrl?: string | null;
  startedAt?: number;
  doneAt?: number;
}

type CellKey = string; // `${platform}::${date}`
const cellKey = (p: TheaterPlatform, d: string) => `${p}::${d}` as CellKey;

interface BrainStation {
  member: CastMember;
  thought: string;
  durationMs: number;
}

// ─── Brain bar component ──────────────────────────────────────────────────

function BrainBar({
  member,
  thought,
  avatarUrl,
}: {
  member: CastMember;
  thought: string;
  avatarUrl: string | null;
}) {
  // Typewriter effect for thought
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(thought.slice(0, i));
      if (i >= thought.length) clearInterval(id);
    }, 22);
    return () => clearInterval(id);
  }, [thought]);

  const accent = member.platform ? PLATFORM_META[member.platform].accent : "#6366f1";
  const roleLabel = {
    chief:  "總策畫",
    lead:   member.platform ? `${PLATFORM_META[member.platform].label} Lead` : "Lead",
    writer: member.platform ? `${PLATFORM_META[member.platform].label} 文案` : "Writer",
    image:  member.platform ? `${PLATFORM_META[member.platform].label} 視覺` : "Visual",
    qa:     "QA 總編",
  }[member.role];

  return (
    <div
      className="sticky top-0 z-30 w-full border-b border-neutral-200 backdrop-blur-md"
      style={{ background: `${accent}08` }}
    >
      <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-5">
        {/* line-art portrait frame */}
        <div className="flex-shrink-0 relative">
          <div
            className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center"
            style={{
              border: "2px solid #111",
              boxShadow: `4px 4px 0 ${accent}66`,
            }}
          >
            <Avatar
              src={avatarUrl ?? `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(member.name)}`}
              size="lg"
              className="w-16 h-16"
              radius="md"
            />
          </div>
          <div
            className="absolute -bottom-2 -right-2 px-2 py-0.5 text-[10px] font-bold text-white rounded-md"
            style={{ background: accent, border: "1.5px solid #111" }}
          >
            {roleLabel}
          </div>
        </div>

        {/* speech bubble (line-art) */}
        <div className="flex-1 relative">
          <div
            className="relative bg-white px-5 py-4 rounded-2xl"
            style={{
              border: "2px solid #111",
              boxShadow: `4px 4px 0 ${accent}33`,
              minHeight: 72,
            }}
          >
            {/* tail pointing left to portrait */}
            <div
              className="absolute left-[-10px] top-6 w-5 h-5 bg-white"
              style={{
                borderLeft: "2px solid #111",
                borderBottom: "2px solid #111",
                transform: "rotate(45deg)",
              }}
            />
            <div className="text-xs text-neutral-500 mb-1 flex items-center gap-2">
              <span className="font-semibold text-neutral-800">{member.name}</span>
              <span>·</span>
              <span>{member.title}</span>
            </div>
            <div
              className="text-[15px] leading-relaxed text-neutral-900 font-medium"
              style={{ minHeight: 22 }}
            >
              {shown}
              <span
                className="inline-block w-[2px] h-[16px] ml-0.5 align-middle bg-neutral-900"
                style={{ animation: "blink 1s steps(2) infinite" }}
              />
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes blink { 50% { opacity: 0 } }`}</style>
    </div>
  );
}

// ─── Cell card ────────────────────────────────────────────────────────────

function PlatformCell({
  platform,
  state,
  caption,
  writerAvatar,
  imageDirAvatar,
  onRedo,
  onCopy,
}: {
  platform: TheaterPlatform;
  state: CellState;
  caption: string;
  writerAvatar: string | null;
  imageDirAvatar: string | null;
  onRedo?: () => void;
  onCopy?: () => void;
}) {
  const meta = PLATFORM_META[platform];
  const isIdle    = state.status === "idle" || state.status === "queued";
  const isWriting = state.status === "writing";
  const isImaging = state.status === "imaging";
  const isDone    = state.status === "done";

  return (
    <div
      className="rounded-xl bg-white overflow-hidden flex flex-col"
      style={{
        border: "1.5px solid #111",
        boxShadow: isDone ? `3px 3px 0 ${meta.accent}33` : "none",
        minHeight: 280,
      }}
    >
      {/* header strip */}
      <div
        className="px-3 py-2 flex items-center justify-between border-b-2 border-black"
        style={{ background: meta.accent }}
      >
        <span className="text-white text-xs font-bold tracking-wide flex items-center gap-1.5">
          <span>{meta.emoji}</span>
          <span>{meta.short}</span>
        </span>
        <span className="text-white/90 text-[10px] uppercase tracking-wider">
          {state.status === "idle"    && "等待"}
          {state.status === "queued"  && "排隊中"}
          {state.status === "writing" && "撰寫中"}
          {state.status === "imaging" && "生圖中"}
          {state.status === "done"    && "完成"}
          {state.status === "failed"  && "失敗"}
        </span>
      </div>

      {/* image area */}
      <div
        className="aspect-square bg-neutral-50 flex items-center justify-center relative"
        style={{ borderBottom: isDone ? "1.5px solid #111" : "1.5px dashed #d4d4d4" }}
      >
        {state.imageUrl ? (
          <img src={state.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : isImaging ? (
          <div className="flex flex-col items-center gap-2">
            <Avatar src={imageDirAvatar ?? undefined} size="sm" className="w-8 h-8" />
            <Spinner size="sm" />
            <p className="text-[10px] text-neutral-500">視覺指導生圖中…</p>
          </div>
        ) : (
          <p className="text-[10px] text-neutral-400">{isIdle ? "待產出" : "—"}</p>
        )}
      </div>

      {/* caption area */}
      <div className="p-3 flex-1 min-h-[80px] flex flex-col">
        {(isWriting || isImaging || isDone) && caption ? (
          <p className="text-[12px] text-neutral-800 leading-relaxed whitespace-pre-wrap flex-1">
            {caption}
            {isWriting && (
              <span
                className="inline-block w-[1.5px] h-[12px] ml-0.5 align-middle bg-neutral-700"
                style={{ animation: "blink 1s steps(2) infinite" }}
              />
            )}
          </p>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <Avatar src={writerAvatar ?? undefined} size="sm" className="w-6 h-6" />
            <p className="text-[10px] text-neutral-400">
              {isIdle ? "等候 caption writer 接棒…" : "—"}
            </p>
          </div>
        )}

        {/* Action row — only on done */}
        {isDone && caption && (
          <div className="mt-2 pt-2 border-t border-neutral-100 flex items-center gap-1.5">
            {onCopy && (
              <button
                onClick={onCopy}
                className="text-[10px] px-2 py-1 rounded-md bg-neutral-50 hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900 flex items-center gap-1 transition"
                title="複製 caption"
              >
                <Copy size={11} strokeWidth={2} />
                複製
              </button>
            )}
            {onRedo && (
              <button
                onClick={onRedo}
                className="text-[10px] px-2 py-1 rounded-md bg-neutral-50 hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900 flex items-center gap-1 transition"
                title="重新生成這一格"
              >
                <RefreshCw size={11} strokeWidth={2} />
                重做
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function TheaterPage() {
  const ctx = useOutletContext<ShellOutletCtx>();
  const brandId = ctx?.brandId ?? null;
  const brandName = useMemo(
    () => (ctx?.brands ?? []).find((b: any) => b.id === brandId)?.name ?? null,
    [ctx?.brands, brandId],
  );

  // selected platforms (default: FB + IG + YT)
  const [activePlatforms, setActivePlatforms] = useState<TheaterPlatform[]>([
    "facebook", "instagram", "youtube",
  ]);

  // important dates user adds
  const [importantDates, setImportantDates] = useState<ImportantDate[]>([]);
  const [showAddDate, setShowAddDate] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newDateName, setNewDateName] = useState("");

  // 7 calendar days starting today
  const days = useMemo(() => {
    const out: { date: string; weekday: string; label: string }[] = [];
    const t = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + i);
      const wd = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      out.push({
        date: iso,
        weekday: wd,
        label: `${d.getMonth() + 1}/${d.getDate()}（${wd}）`,
      });
    }
    return out;
  }, []);

  // Preload cast avatars
  const castQuery = trpc.agent.byIds.useQuery({ ids: castIds() }, {
    staleTime: 60 * 60_000,
  });
  // Theater backend
  const utils = trpc.useUtils();
  const generateCellMut  = trpc.theater.generateCell.useMutation();
  const generateImageMut = trpc.theater.generateImage.useMutation();
  const avatarById = useMemo(() => {
    const m = new Map<number, string | null>();
    (castQuery.data ?? []).forEach((a) => m.set(a.id, a.avatarUrl));
    return m;
  }, [castQuery.data]);
  const avatarOf = (m: CastMember) => avatarById.get(m.id) ?? null;

  // Cell state map (+ ref mirror so async workers can read latest captions
  // without re-running the closure on every state change)
  const [cells, setCells] = useState<Map<CellKey, CellState>>(new Map());
  const cellsRef = useRef<Map<CellKey, CellState>>(new Map());
  useEffect(() => { cellsRef.current = cells; }, [cells]);

  // Per-cell metadata captured at run time — needed for redo.
  // Map<CellKey, { usp, importantDateName, brandTagline, brandVoice }>
  const [cellMeta, setCellMeta] = useState<Map<CellKey, {
    usp: string;
    importantDateName: string | null;
    brandTagline: string | null;
    brandVoice: string | null;
    weekday: string;
    date: string;
  }>>(new Map());

  // Brain bar state
  const [running, setRunning] = useState(false);
  const [station, setStation] = useState<BrainStation | null>(null);

  // Build the station script when run starts
  const startRun = async () => {
    if (running) return;
    if (!brandId) {
      alert("請先選擇品牌");
      return;
    }
    if (activePlatforms.length === 0) {
      alert("請至少選擇一個社群平台");
      return;
    }

    setRunning(true);

    // Reset all cells
    const fresh = new Map<CellKey, CellState>();
    for (const p of activePlatforms) {
      for (const d of days) fresh.set(cellKey(p, d.date), { status: "queued" });
    }
    setCells(fresh);

    // 0) Fetch run plan from backend (positioning → USP pool + chief opening + lead thoughts)
    let runPlan: {
      usps: string[];
      chiefOpening: string;
      leadThoughts: Record<string, string>;
      positioning: { tagline: string | null; targetAudience: string | null; brandVoice: string | null } | null;
    };
    try {
      runPlan = await utils.theater.runStart.fetch({
        brandId,
        platforms: activePlatforms,
        importantDates: importantDates.map((d) => ({ date: d.date, name: d.name })),
      });
    } catch (e) {
      console.error("[theater] runStart failed:", e);
      setRunning(false);
      alert("無法載入品牌定位 — 請先完成品牌定位再試");
      return;
    }

    const { usps, chiefOpening, leadThoughts, positioning } = runPlan;
    const brandTagline = positioning?.tagline ?? null;
    const brandVoice   = positioning?.brandVoice ?? null;

    // 1) Chief opening monologue (real LLM-generated)
    const stations: BrainStation[] = [
      {
        member: getChief(),
        thought: chiefOpening || `本週 USP 候選：${usps.join("、")}。一篇貼文 = 一個 USP。${activePlatforms.map((p) => PLATFORM_META[p].short).join("、")} 各組準備接手。`,
        durationMs: 6500,
      },
    ];

    // 2) Per-platform leads talk strategy (real LLM output from runStart)
    for (const p of activePlatforms) {
      const lead = getPlatformLead(p);
      const thought = leadThoughts[p] || `${PLATFORM_META[p].label} 我這條線接手。`;
      stations.push({ member: lead, thought, durationMs: 4500 });
    }

    // 3) Writers + image dirs (one short station per platform)
    for (const p of activePlatforms) {
      const w = getPlatformWriter(p);
      stations.push({
        member: w,
        thought: `我開始寫 ${PLATFORM_META[p].label} 的 caption，2 篇並行，照日期順序排。`,
        durationMs: 3500,
      });
    }
    for (const p of activePlatforms) {
      const i = getPlatformImage(p);
      stations.push({
        member: i,
        thought: `${PLATFORM_META[p].label} 的視覺我接著生，1 張 1 張穩穩來，照日期排瀑布。`,
        durationMs: 3500,
      });
    }

    // 4) QA closing
    stations.push({
      member: getQA(),
      thought: `所有篇章我會逐篇審 USP / 違禁 / 一致性，flag 問題我會標註紅色，沒問題的我放行。`,
      durationMs: 5000,
    });

    // Drive the station carousel + cell progression (real backend)
    runStations(stations, { usps, brandTagline, brandVoice });
  };

  const stopRun = () => {
    setRunning(false);
    setStation(null);
  };

  // ── Station playback + real backend cell pump ─────────────────────────
  const stopRef = useRef(false);
  const runStations = async (
    stations: BrainStation[],
    plan: { usps: string[]; brandTagline: string | null; brandVoice: string | null },
  ) => {
    if (!brandId) return;
    stopRef.current = false;

    // Build queue: by date order, all platforms per date.
    // Each task carries the USP assigned (round-robin from the pool).
    type Task = {
      key: CellKey;
      platform: TheaterPlatform;
      date: string;
      weekday: string;
      usp: string;
      importantDateName: string | null;
    };
    const captionTasks: Task[] = [];
    let uspCursor = 0;
    for (const d of days) {
      const matching = importantDates.find((x) => x.date === d.date);
      for (const p of activePlatforms) {
        const usp = plan.usps[uspCursor % plan.usps.length] ?? plan.usps[0]!;
        uspCursor++;
        captionTasks.push({
          key: cellKey(p, d.date),
          platform: p,
          date: d.date,
          weekday: d.weekday,
          usp,
          importantDateName: matching ? matching.name : null,
        });
      }
    }
    let captionIdx = 0;

    // Kick off station carousel (frontend-paced, decoupled from generation)
    (async () => {
      for (const s of stations) {
        if (stopRef.current) break;
        setStation(s);
        await sleep(s.durationMs);
      }
    })();

    // Wait ~6s so chief + first lead get airtime before cells start filling.
    await sleep(6000);
    if (stopRef.current) return;

    // Caption pump — concurrency 2
    const imageQueue: Task[] = [];
    const captionWorker = async () => {
      while (captionIdx < captionTasks.length) {
        const myIdx = captionIdx++;
        const task = captionTasks[myIdx];
        if (!task) continue;
        if (stopRef.current) return;

        updateCell(task.key, { status: "writing", caption: "" });
        // Persist meta for future redo on this cell
        setCellMeta((prev) => {
          const next = new Map(prev);
          next.set(task.key, {
            usp: task.usp,
            importantDateName: task.importantDateName,
            brandTagline: plan.brandTagline,
            brandVoice: plan.brandVoice,
            weekday: task.weekday,
            date: task.date,
          });
          return next;
        });
        try {
          const r = await generateCellMut.mutateAsync({
            brandId,
            platform: task.platform,
            date: task.date,
            weekday: task.weekday,
            usp: task.usp,
            importantDateName: task.importantDateName,
            brandTagline: plan.brandTagline,
            brandVoice: plan.brandVoice,
          });
          if (stopRef.current) return;
          if (r.ok && r.caption) {
            updateCell(task.key, { status: "writing", caption: r.caption });
            imageQueue.push({ ...task });
          } else {
            updateCell(task.key, { status: "failed" });
          }
        } catch (e) {
          console.error("[theater] caption failed:", task.key, e);
          updateCell(task.key, { status: "failed" });
        }
      }
    };

    // Image pump — concurrency 1 (one at a time, by date order)
    const imageWorker = async () => {
      while (true) {
        if (stopRef.current) return;
        const task = imageQueue.shift();
        if (!task) {
          if (captionIdx >= captionTasks.length && imageQueue.length === 0) return;
          await sleep(400);
          continue;
        }
        updateCell(task.key, { status: "imaging" });
        // Pull caption from cell state (set by caption worker)
        const captionFromState = (cellsRef.current.get(task.key)?.caption) ?? "";
        if (!captionFromState) {
          updateCell(task.key, { status: "failed" });
          continue;
        }
        try {
          const r = await generateImageMut.mutateAsync({
            brandId,
            platform: task.platform,
            caption: captionFromState,
            brandTagline: plan.brandTagline,
          });
          if (stopRef.current) return;
          if (r.ok && r.imageUrl) {
            updateCell(task.key, { status: "done", imageUrl: r.imageUrl, doneAt: Date.now() });
          } else {
            // image failed → keep caption, mark as done with no image rather than failing the whole cell
            updateCell(task.key, { status: "done", imageUrl: null, doneAt: Date.now() });
          }
        } catch (e) {
          console.error("[theater] image failed:", task.key, e);
          updateCell(task.key, { status: "done", imageUrl: null, doneAt: Date.now() });
        }
      }
    };

    await Promise.all([captionWorker(), captionWorker(), imageWorker()]);
    setRunning(false);
  };

  const updateCell = (key: CellKey, patch: Partial<CellState>) => {
    setCells((prev) => {
      const next = new Map(prev);
      const cur = next.get(key) ?? { status: "idle" };
      next.set(key, { ...cur, ...patch });
      return next;
    });
  };

  // ── Per-cell redo: re-runs caption + image with stored meta ───────────
  const redoCell = async (key: CellKey, platform: TheaterPlatform) => {
    if (!brandId) return;
    const meta = cellMeta.get(key);
    if (!meta) {
      console.warn("[theater] redo: no meta for", key);
      return;
    }
    updateCell(key, { status: "writing", caption: "" });
    try {
      const r = await generateCellMut.mutateAsync({
        brandId,
        platform,
        date: meta.date,
        weekday: meta.weekday,
        usp: meta.usp,
        importantDateName: meta.importantDateName,
        brandTagline: meta.brandTagline,
        brandVoice: meta.brandVoice,
      });
      if (!r.ok || !r.caption) {
        updateCell(key, { status: "failed" });
        return;
      }
      updateCell(key, { status: "imaging", caption: r.caption });
      const img = await generateImageMut.mutateAsync({
        brandId,
        platform,
        caption: r.caption,
        brandTagline: meta.brandTagline,
      });
      updateCell(key, {
        status: "done",
        caption: r.caption,
        imageUrl: img.ok ? img.imageUrl : null,
        doneAt: Date.now(),
      });
    } catch (e) {
      console.error("[theater] redo failed:", key, e);
      updateCell(key, { status: "failed" });
    }
  };

  const copyCaption = async (key: CellKey) => {
    const cap = cells.get(key)?.caption;
    if (!cap) return;
    try {
      await navigator.clipboard.writeText(cap);
    } catch {
      // fallback: select textarea trick
      const ta = document.createElement("textarea");
      ta.value = cap;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  };

  // ── Important date add ────────────────────────────────────────────────
  const handleAddDate = () => {
    if (!newDate || !newDateName) return;
    setImportantDates((prev) => [
      ...prev,
      { id: `${newDate}-${Math.random().toString(36).slice(2, 7)}`, date: newDate, name: newDateName },
    ].sort((a, b) => a.date.localeCompare(b.date)));
    setNewDate("");
    setNewDateName("");
    setShowAddDate(false);
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Brain bar (sticky) */}
      {station ? (
        <BrainBar
          member={station.member}
          thought={station.thought}
          avatarUrl={avatarOf(station.member)}
        />
      ) : (
        <div className="sticky top-0 z-30 w-full border-b border-neutral-200 bg-white">
          <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-3">
            <Sparkles size={18} className="text-neutral-400" strokeWidth={1.5} />
            <p className="text-sm text-neutral-500">
              選好平台 + 重要日子，按「開始企劃」— Claire 會率隊上場
            </p>
          </div>
        </div>
      )}

      {/* Top bar — controls */}
      <div className="max-w-[1400px] mx-auto px-6 pt-6 pb-4">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
              內容企劃台
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              20 位 AI agents 為 {brandName ?? "（請先選品牌）"} 規劃 7 天跨平台內容
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!running ? (
              <Button
                color="primary"
                onPress={startRun}
                startContent={<Play size={14} strokeWidth={2} />}
                isDisabled={!brandId}
              >
                開始企劃
              </Button>
            ) : (
              <Button
                color="danger"
                variant="flat"
                onPress={() => { stopRef.current = true; stopRun(); }}
                startContent={<X size={14} strokeWidth={2} />}
              >
                停止
              </Button>
            )}
          </div>
        </div>

        {/* Platform multi-select */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-xs text-neutral-500 mr-2">平台：</span>
          {(Object.keys(PLATFORM_META) as TheaterPlatform[]).map((p) => {
            const meta = PLATFORM_META[p];
            const on = activePlatforms.includes(p);
            return (
              <button
                key={p}
                onClick={() =>
                  setActivePlatforms((prev) =>
                    prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                  )
                }
                disabled={running}
                className="px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 transition"
                style={{
                  background: on ? meta.accent : "white",
                  color: on ? "white" : "#525252",
                  border: `1.5px solid ${on ? meta.accent : "#e5e5e5"}`,
                  fontWeight: on ? 600 : 500,
                  opacity: running ? 0.7 : 1,
                }}
              >
                <span>{meta.emoji}</span>
                <span>{meta.label}</span>
                {on && <Check size={12} strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>

        {/* Important dates */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-neutral-500 mr-2">重要日子：</span>
          {importantDates.map((d) => (
            <span
              key={d.id}
              className="px-2.5 py-1 text-xs rounded-lg bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5"
            >
              <CalendarIcon size={11} strokeWidth={2} />
              <span className="font-semibold">{d.date.slice(5)}</span>
              <span>{d.name}</span>
              <button
                onClick={() => setImportantDates((prev) => prev.filter((x) => x.id !== d.id))}
                className="text-amber-600 hover:text-amber-900"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          {showAddDate ? (
            <span className="flex items-center gap-1.5 px-2 py-1 bg-white border border-neutral-300 rounded-lg">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="text-xs outline-none"
              />
              <input
                type="text"
                placeholder="名稱（例：母親節）"
                value={newDateName}
                onChange={(e) => setNewDateName(e.target.value)}
                className="text-xs outline-none w-32"
              />
              <button onClick={handleAddDate} className="text-emerald-600 hover:text-emerald-800">
                <Check size={14} strokeWidth={2.5} />
              </button>
              <button
                onClick={() => { setShowAddDate(false); setNewDate(""); setNewDateName(""); }}
                className="text-neutral-400 hover:text-neutral-700"
              >
                <X size={14} />
              </button>
            </span>
          ) : (
            <button
              onClick={() => setShowAddDate(true)}
              className="text-xs text-neutral-600 hover:text-neutral-900 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-neutral-300 hover:border-neutral-500"
            >
              <Plus size={12} strokeWidth={2} />
              加入重要日子
            </button>
          )}
        </div>
      </div>

      {/* Day-by-day waterfall */}
      <div className="max-w-[1400px] mx-auto px-6 pb-16">
        {!brandId ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
            <p className="text-neutral-500 text-sm">請先在左上角選擇品牌</p>
          </div>
        ) : (
          <div className="space-y-4">
            {days.map((d) => {
              const matchingDate = importantDates.find((x) => x.date === d.date);
              return (
                <div key={d.date} className="flex gap-4">
                  {/* Date column */}
                  <div className="w-32 flex-shrink-0 pt-2">
                    <p className="text-sm font-bold text-neutral-900">{d.label}</p>
                    {matchingDate && (
                      <p className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded mt-1 inline-block">
                        🎀 {matchingDate.name}
                      </p>
                    )}
                  </div>
                  {/* Cells */}
                  <div
                    className="flex-1 grid gap-3"
                    style={{
                      gridTemplateColumns: `repeat(${activePlatforms.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {activePlatforms.map((p) => {
                      const key = cellKey(p, d.date);
                      const state = cells.get(key) ?? { status: "idle" as const };
                      return (
                        <PlatformCell
                          key={key}
                          platform={p}
                          state={state}
                          caption={state.caption ?? ""}
                          writerAvatar={avatarOf(getPlatformWriter(p))}
                          imageDirAvatar={avatarOf(getPlatformImage(p))}
                          onCopy={() => copyCaption(key)}
                          onRedo={() => redoCell(key, p)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Cast roster footer */}
        <div className="mt-12 pt-6 border-t border-neutral-200">
          <p className="text-xs text-neutral-500 mb-3">演職員表（20 位 AI agents · 全員不重複）</p>
          <div className="flex flex-wrap gap-2">
            {THEATER_CAST.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg"
                title={`${m.name} — ${m.title}`}
              >
                <Avatar src={avatarOf(m) ?? undefined} size="sm" className="w-5 h-5" />
                <span className="text-[11px] text-neutral-700 font-medium">{m.name}</span>
                {m.platform && (
                  <span
                    className="text-[9px] px-1 rounded"
                    style={{ background: `${PLATFORM_META[m.platform].accent}22`, color: PLATFORM_META[m.platform].accent }}
                  >
                    {PLATFORM_META[m.platform].short}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
