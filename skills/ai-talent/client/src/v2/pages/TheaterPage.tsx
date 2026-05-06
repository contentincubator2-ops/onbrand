/**
 * TheaterPage — Content Generation Theater (CJ direction 2026-05-06).
 *
 * 3-column waterfall (FB / IG / YT) showing AI agents generating 7 days of
 * content for the active brand. Each card renders the actual platform
 * mockup with a typewriter caption animation. Click any card → opens the
 * existing 30s edit modal.
 *
 * Phase 1 MVP: 7 days × 3 platforms = 21 parallel orchestra calls,
 * staggered by 500ms between platforms so the waterfall feels alive.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import { Avatar, Button, Card, CardBody, Spinner } from "@heroui/react";
import { Sparkles, Calendar as CalendarIcon, Edit3, RefreshCw } from "lucide-react";
import { faFacebookF, faInstagram, faYoutube } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type Platform = "facebook" | "instagram" | "youtube";

interface CellState {
  status: "idle" | "queued" | "running" | "done" | "failed";
  caption?: string;
  imageStyle?: string;
  imageUrl?: string | null;
  agent?: { name: string; avatarUrl: string | null } | null;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

const PLATFORMS: Array<{ id: Platform; label: string; icon: any; bg: string; taskId: string }> = [
  { id: "facebook",  label: "Facebook",  icon: faFacebookF, bg: "#1877F2", taskId: "fb-30-caption-short" },
  { id: "instagram", label: "Instagram", icon: faInstagram, bg: "#E4405F", taskId: "ig-30-caption-short" },
  { id: "youtube",   label: "YouTube",   icon: faYoutube,   bg: "#FF0000", taskId: "yt-30-video-package" },
];

const DAYS = 7;

function formatDate(d: Date): string {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const wd = ["週日","週一","週二","週三","週四","週五","週六"][d.getDay()];
  return `${m}/${day} ${wd}`;
}

export default function TheaterPage() {
  const ctx = useOutletContext<ShellOutletCtx>();
  const brandId = (ctx?.brandId as number | null) ?? null;
  const brands = (ctx?.brands as any[]) ?? [];
  const brand = brands.find((b: any) => b.id === brandId) ?? null;

  // Generation matrix: 7 days × 3 platforms = 21 cells
  const cellsKey = (day: number, platform: Platform) => `${day}_${platform}`;
  const [cells, setCells] = useState<Record<string, CellState>>({});
  const [phase, setPhase] = useState<"ready" | "running" | "done">("ready");

  const runOrchestraMut = (trpc as any).quickTask?.runOrchestra?.useMutation();

  // Generate dates from today
  const dates = useMemo(() => {
    const today = new Date();
    return Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, []);

  // Topic seed per day — placeholder; in real flow these would be derived from
  // brand context + festival scout data.
  const topicForDay = (dayIdx: number, platform: Platform): string => {
    if (!brand) return "本月主題內容";
    const seeds = [
      `本週主推：${brand.name}的核心價值`,
      `用戶見證型內容`,
      `產品教學 / 使用情境`,
      `幕後 / 團隊故事`,
      `節慶話題切入`,
      `數據 / 趨勢洞察`,
      `週末邀請型互動`,
    ];
    return seeds[dayIdx] ?? `${brand.name} 內容`;
  };

  const startGeneration = async () => {
    if (!brandId || !runOrchestraMut) return;
    setPhase("running");

    // Initialize all cells as queued
    const initialCells: Record<string, CellState> = {};
    for (let day = 0; day < DAYS; day++) {
      for (const p of PLATFORMS) {
        initialCells[cellsKey(day, p.id)] = { status: "queued" };
      }
    }
    setCells(initialCells);

    // Stagger: kick off platform-by-platform with 500ms offset
    for (let pi = 0; pi < PLATFORMS.length; pi++) {
      const p = PLATFORMS[pi]!;
      setTimeout(() => {
        for (let day = 0; day < DAYS; day++) {
          const k = cellsKey(day, p.id);
          // Slightly stagger within platform too (200ms each)
          setTimeout(() => {
            setCells((c) => ({ ...c, [k]: { ...c[k], status: "running", startedAt: Date.now() } }));
            runOrchestraMut.mutateAsync({
              taskId: p.taskId,
              inputs: { topic: topicForDay(day, p.id) },
              brandId,
            }).then((r: any) => {
              const v = r?.variants?.[0];
              setCells((c) => ({
                ...c,
                [k]: {
                  status: r?.ok && v?.caption ? "done" : "failed",
                  caption: v?.caption ?? "",
                  imageStyle: v?.image?.style ?? r?.variants?.[0]?.image_style_direction?.summary,
                  imageUrl: v?.image?.url ?? null,
                  agent: r?.captionAgent ? { name: r.captionAgent.name, avatarUrl: r.captionAgent.avatarUrl } : null,
                  completedAt: Date.now(),
                  error: r?.errors?.[0],
                },
              }));
            }).catch((e: any) => {
              setCells((c) => ({
                ...c,
                [k]: { ...c[k], status: "failed", error: e?.message ?? String(e), completedAt: Date.now() },
              }));
            });
          }, day * 200);
        }
      }, pi * 500);
    }
  };

  // Detect "all done" → flip phase
  useEffect(() => {
    const total = DAYS * PLATFORMS.length;
    const completed = Object.values(cells).filter((c) => c.status === "done" || c.status === "failed").length;
    if (total > 0 && completed === total && phase === "running") {
      setPhase("done");
    }
  }, [cells, phase]);

  const completedCount = Object.values(cells).filter((c) => c.status === "done").length;
  const runningCount = Object.values(cells).filter((c) => c.status === "running").length;

  return (
    <div className="min-h-screen" style={{ background: "#fafafa" }}>
      {/* HERO */}
      <div className="px-6 pt-12 pb-6 max-w-[1400px] mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-tiny font-bold tracking-[0.2em] text-default-400 uppercase mb-1.5">
              Content Generation Theater
            </p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
              {phase === "ready" && "看 AI 替你的品牌生 7 天內容"}
              {phase === "running" && "AI agents 工作中…"}
              {phase === "done" && "完成 — 挑你喜歡的排進行事曆"}
            </h1>
            <p className="text-small text-default-500 max-w-xl">
              {brand
                ? `品牌：${brand.name}。${PLATFORMS.length} 個平台 × ${DAYS} 天 = ${DAYS * PLATFORMS.length} 篇內容並行生成。`
                : "請先在左上角選擇品牌"}
            </p>
          </div>
          {brand && phase === "ready" && (
            <Button
              size="lg"
              className="font-semibold"
              style={{
                background: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)",
                color: "#fff",
              }}
              onPress={startGeneration}
              startContent={<Sparkles size={18} strokeWidth={2} />}
            >
              開始 7 天劇場
            </Button>
          )}
          {phase === "running" && (
            <div className="flex items-center gap-3 bg-white border border-default-200 rounded-xl px-4 py-2.5">
              <Spinner size="sm" />
              <div className="text-tiny">
                <p className="font-semibold text-default-800">{runningCount} 位 agent 工作中</p>
                <p className="text-default-500">{completedCount} / {DAYS * PLATFORMS.length} 完成</p>
              </div>
            </div>
          )}
          {phase === "done" && (
            <Button
              size="lg"
              variant="flat"
              startContent={<RefreshCw size={16} strokeWidth={2} />}
              onPress={startGeneration}
            >
              重新生成
            </Button>
          )}
        </div>
      </div>

      {/* Platform header strip — Canva-style platform indicators */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-default-100">
        <div className="max-w-[1400px] mx-auto px-6 py-2 grid gap-3" style={{ gridTemplateColumns: "60px repeat(3, 1fr)" }}>
          <span /> {/* date column placeholder */}
          {PLATFORMS.map((p) => {
            const platformDone = Array.from({ length: DAYS }, (_, d) => cells[cellsKey(d, p.id)]?.status === "done").filter(Boolean).length;
            const isActive = platformDone > 0;
            return (
              <div key={p.id} className="flex items-center gap-2 py-1">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
                    isActive ? "" : "opacity-40"
                  }`}
                  style={{ background: p.bg, color: "#fff" }}
                >
                  <FontAwesomeIcon icon={p.icon} className="text-tiny" />
                </div>
                <div>
                  <p className="text-tiny font-semibold">{p.label}</p>
                  <p className="text-[10px] text-default-400">{platformDone} / {DAYS} 完成</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* WATERFALL — 7 rows × 3 cols */}
      <div className="max-w-[1400px] mx-auto px-6 py-4">
        {dates.map((d, dayIdx) => (
          <div
            key={dayIdx}
            className="grid gap-3 py-2 border-b border-default-100"
            style={{ gridTemplateColumns: "60px repeat(3, 1fr)" }}
          >
            {/* Date column */}
            <div className="flex flex-col items-end justify-start pt-3 pr-1">
              <span className="text-tiny font-bold text-default-700 tabular-nums">{d.getDate()}</span>
              <span className="text-[10px] text-default-400">
                {["週日","週一","週二","週三","週四","週五","週六"][d.getDay()]}
              </span>
            </div>
            {PLATFORMS.map((p) => {
              const state = cells[cellsKey(dayIdx, p.id)] ?? { status: "idle" };
              return <Cell key={p.id} state={state} platform={p} />;
            })}
          </div>
        ))}
      </div>

      {/* Footer hint when ready */}
      {phase === "ready" && brand && (
        <div className="max-w-[1400px] mx-auto px-6 py-12 text-center">
          <p className="text-tiny text-default-400">
            按上方「開始 7 天劇場」啟動生成。系統會並行呼叫 21 個 agent，1-2 分鐘完成。
          </p>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────── Cell component ──────────────────────── */
function Cell({ state, platform }: { state: CellState; platform: { id: Platform; label: string; bg: string } }) {
  const [shownChars, setShownChars] = useState(0);
  // Typewriter effect when caption arrives
  useEffect(() => {
    if (state.status !== "done" || !state.caption) {
      setShownChars(0);
      return;
    }
    let i = 0;
    const target = Math.min(state.caption.length, 200);
    const timer = setInterval(() => {
      i += 3;
      setShownChars(i);
      if (i >= target) clearInterval(timer);
    }, 18);
    return () => clearInterval(timer);
  }, [state.status, state.caption]);

  if (state.status === "idle") {
    return (
      <div className="rounded-2xl border border-dashed border-default-200 bg-white/40 min-h-[120px] flex items-center justify-center text-tiny text-default-300">
        待開始
      </div>
    );
  }
  if (state.status === "queued") {
    return (
      <div className="rounded-2xl border border-default-200 bg-default-50 min-h-[120px] flex items-center justify-center">
        <span className="text-[10px] text-default-400 tracking-widest uppercase">queued</span>
      </div>
    );
  }
  if (state.status === "running") {
    return (
      <div
        className="rounded-2xl border bg-white p-3 min-h-[120px] flex items-center gap-3 shadow-sm"
        style={{ borderColor: platform.bg + "40" }}
      >
        <Spinner size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-tiny font-semibold text-default-700 mb-0.5">生成中…</p>
          <div className="flex gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-default-300 animate-pulse" />
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-default-300 animate-pulse" style={{ animationDelay: "0.2s" }} />
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-default-300 animate-pulse" style={{ animationDelay: "0.4s" }} />
          </div>
        </div>
      </div>
    );
  }
  if (state.status === "failed") {
    return (
      <div className="rounded-2xl border border-warning-200 bg-warning-50 p-3 min-h-[120px]">
        <p className="text-tiny font-semibold text-warning-800 mb-1">✗ 生成失敗</p>
        <p className="text-[10px] text-warning-700 leading-relaxed">{state.error?.slice(0, 80) ?? "未知錯誤"}</p>
      </div>
    );
  }
  // done
  const visibleCaption = (state.caption ?? "").slice(0, shownChars);
  return (
    <div className="rounded-2xl border border-default-200 bg-white p-3 min-h-[120px] hover:shadow-md transition relative group">
      {/* Header strip */}
      <div className="flex items-center gap-2 pb-2 border-b border-default-100 mb-2">
        <div
          className="w-5 h-5 rounded-md flex items-center justify-center text-white"
          style={{ background: platform.bg }}
        >
          <span style={{ fontSize: 9 }}>●</span>
        </div>
        {state.agent && (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Avatar src={state.agent.avatarUrl ?? `https://api.dicebear.com/7.x/notionists/svg?seed=${state.agent.name}`} size="sm" className="w-4 h-4" />
            <span className="text-[10px] text-default-600 truncate">{state.agent.name}</span>
          </div>
        )}
        {state.completedAt && state.startedAt && (
          <span className="text-[9px] text-default-400 tabular-nums">
            {Math.round((state.completedAt - state.startedAt) / 1000)}s
          </span>
        )}
      </div>
      {/* Caption with typewriter effect */}
      <p className="text-[11px] text-default-800 leading-relaxed line-clamp-4 whitespace-pre-line">
        {visibleCaption}
        {shownChars < (state.caption?.length ?? 0) && (
          <span className="inline-block w-1.5 h-3 bg-default-700 ml-0.5 align-middle animate-pulse" />
        )}
      </p>
      {/* Action overlay (appears on hover) */}
      <div className="absolute right-2 bottom-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
        <button
          title="排進行事曆"
          className="w-7 h-7 rounded-full bg-white border border-default-200 hover:border-primary-400 hover:text-primary-600 transition flex items-center justify-center"
          onClick={() => window.alert("「排進行事曆」即將推出 — Phase 2 待開發")}
        >
          <CalendarIcon size={12} strokeWidth={2} />
        </button>
        <button
          title="編輯這版"
          className="w-7 h-7 rounded-full bg-white border border-default-200 hover:border-primary-400 hover:text-primary-600 transition flex items-center justify-center"
          onClick={() => window.alert("「編輯」即將打開 30s 編輯 modal — Phase 2 接好")}
        >
          <Edit3 size={12} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
