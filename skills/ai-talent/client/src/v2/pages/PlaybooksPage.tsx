/**
 * PlaybooksPage — 成長方案 / Growth Playbooks
 *
 * Canva-Growth-Plan 對標：精選 6 個由 SoWork strategist 策劃的「成長劇本」，
 * 把 squad（任務範本）+ 顧問團（boardroom）+ 媒體中心（投放）串成 90 天 / 12 週 /
 * 8 週的可賣方案包，每一個都附真實成功案例。
 *
 * UX:
 *   1. 進入頁先看到 6 張「方案卡」grid（Canva 風格 hero card）
 *   2. 點任一卡 → 右側抽屜展開 detail（痛點 / 階段 / 成功案例 / KPI）
 *   3. detail 底部「套用此方案」→ 建 mission + 一鍵跳到顧問團 / 媒體中心
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";

const ACCENT = "#5B3CC8";
const HAIR = "#E5E5E5";
const INK = "#0E0E10";

type PlaybookSummary = {
  id: string;
  title: string;
  badge: string;
  hook: string;
  problem: string;
  audience: string;
  duration: string;
  budget: string;
  color: string;
  emoji: string;
  pitch: string;
  phaseCount: number;
  squadCount: number;
  personaCount: number;
  channelCount: number;
};

const BADGE_COPY: Record<string, string> = {
  GROWTH: "成長",
  BRAND: "品牌",
  REVIVAL: "復活",
  B2B: "B2B",
  CRISIS: "危機",
  VIRAL: "病毒",
};

export default function PlaybooksPage() {
  const navigate = useNavigate();
  const { brandId, brands } = useOutletContext<ShellOutletCtx>();
  const currentBrand = useMemo(
    () => brands.find((b: any) => b.id === brandId) ?? null,
    [brands, brandId]
  );

  const listQuery = (trpc as any).playbook.list.useQuery();
  const playbooks: PlaybookSummary[] = listQuery.data ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="px-8 py-10 max-w-[1280px] mx-auto">
      {/* ── Hero ───────────────────────────────────────────── */}
      <div className="mb-10">
        <div
          className="text-[0.66rem] tracking-[0.24em] uppercase mb-2"
          style={{ color: ACCENT }}
        >
          PLAYBOOKS · 成長方案
        </div>
        <h1 className="font-display text-[2.4rem] leading-tight text-mos-ink mb-3">
          挑一個劇本，90 天讓品牌變成下一個案例
        </h1>
        <p className="text-mos-muted text-[0.95rem] max-w-[640px] leading-relaxed">
          每個方案都是 SoWork 策展團隊把 squad（任務範本）、顧問團、媒體通路、
          KPI 串好的「可賣包」。背後是真實案例與可驗證的階段方法。
          選一個，按下「套用」，剩下交給流程。
          {currentBrand && (
            <>
              {" "}
              — 將套用到{" "}
              <span className="font-medium" style={{ color: ACCENT }}>
                {currentBrand.name}
              </span>
            </>
          )}
        </p>
      </div>

      {/* ── Grid ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {listQuery.isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[5/6] rounded-2xl border border-mos-hair bg-white animate-pulse"
              />
            ))
          : playbooks.map((p) => (
              <PlaybookCard
                key={p.id}
                playbook={p}
                onClick={() => setSelectedId(p.id)}
              />
            ))}
      </div>

      {/* ── Detail drawer ─────────────────────────────────── */}
      {selectedId && (
        <PlaybookDetail
          id={selectedId}
          onClose={() => setSelectedId(null)}
          brandId={brandId}
          brandName={currentBrand?.name ?? null}
          onApplied={(missionId, nextSteps) => {
            setSelectedId(null);
            // Pick the first action — usually 顧問團
            if (nextSteps?.[0]?.href) navigate(nextSteps[0].href);
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// PlaybookCard
// ──────────────────────────────────────────────────────────

function PlaybookCard({
  playbook,
  onClick,
}: {
  playbook: PlaybookSummary;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative aspect-[5/6] rounded-2xl border border-mos-hair bg-white overflow-hidden text-left hover:shadow-lg hover:-translate-y-0.5 transition-all"
    >
      {/* Top color band */}
      <div
        className="h-32 relative"
        style={{
          background: `linear-gradient(135deg, ${playbook.color} 0%, ${playbook.color}CC 100%)`,
        }}
      >
        <div className="absolute top-3 left-3 text-[0.58rem] tracking-[0.18em] uppercase text-white/90 px-2 py-1 rounded bg-black/20">
          {BADGE_COPY[playbook.badge] ?? playbook.badge}
        </div>
        <div className="absolute right-4 bottom-2 text-[3.4rem] leading-none drop-shadow-md">
          {playbook.emoji}
        </div>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col h-[calc(100%-128px)]">
        <div className="font-display text-[1.05rem] text-mos-ink mb-1 leading-snug">
          {playbook.title}
        </div>
        <div className="text-[0.78rem] text-mos-muted leading-relaxed line-clamp-2 mb-3">
          {playbook.hook}
        </div>

        {/* Stats row */}
        <div className="mt-auto space-y-2">
          <div className="flex items-center gap-2 text-[0.7rem] text-mos-muted">
            <Stat label="期間" value={playbook.duration} />
            <span className="opacity-30">·</span>
            <Stat label="預算" value={playbook.budget} />
          </div>
          <div className="flex items-center gap-3 text-[0.66rem] text-mos-muted pt-2 border-t border-mos-hair">
            <span>📋 {playbook.squadCount} squad</span>
            <span>👔 {playbook.personaCount} 顧問</span>
            <span>📡 {playbook.channelCount} 通路</span>
          </div>
        </div>
      </div>

      {/* Hover arrow */}
      <div
        className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
        style={{ color: playbook.color }}
      >
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 7h10v10" />
          <path d="M7 17L17 7" />
        </svg>
      </div>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[0.6rem] uppercase tracking-wider opacity-60">
        {label}
      </span>
      <span className="text-mos-ink font-medium">{value}</span>
    </span>
  );
}

// ──────────────────────────────────────────────────────────
// PlaybookDetail (right-side drawer)
// ──────────────────────────────────────────────────────────

function PlaybookDetail({
  id,
  onClose,
  brandId,
  brandName,
  onApplied,
}: {
  id: string;
  onClose: () => void;
  brandId: number | null;
  brandName: string | null;
  onApplied: (missionId: number | null, nextSteps: any[]) => void;
}) {
  const detailQuery = (trpc as any).playbook.get.useQuery({ id });
  const applyMut = (trpc as any).playbook.apply.useMutation();
  const data = detailQuery.data;

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const handleApply = async () => {
    if (!brandId) {
      setApplyError("請先在右上角選擇品牌");
      return;
    }
    setApplying(true);
    setApplyError(null);
    try {
      const r = await applyMut.mutateAsync({
        playbookId: id,
        brandId,
      });
      onApplied(r.missionId ?? null, r.nextSteps ?? []);
    } catch (e: any) {
      setApplyError(String(e?.message ?? e));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <button
        onClick={onClose}
        className="flex-1 bg-black/30 backdrop-blur-sm"
        aria-label="關閉"
      />

      {/* Drawer */}
      <div className="w-full max-w-[640px] bg-white shadow-2xl overflow-y-auto">
        {detailQuery.isLoading || !data ? (
          <div className="p-10 text-mos-muted text-sm">載入中…</div>
        ) : (
          <div>
            {/* Header */}
            <div
              className="px-8 pt-8 pb-6 relative"
              style={{
                background: `linear-gradient(135deg, ${data.color}18 0%, ${data.color}06 100%)`,
              }}
            >
              <button
                onClick={onClose}
                className="absolute top-5 right-5 w-8 h-8 rounded-full hover:bg-mos-ink/[0.06] flex items-center justify-center text-mos-muted"
                title="關閉"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 6l12 12M6 18L18 6" />
                </svg>
              </button>

              <div className="flex items-start gap-4">
                <div className="text-[3.4rem] leading-none">{data.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[0.62rem] tracking-[0.22em] uppercase mb-1"
                    style={{ color: data.color }}
                  >
                    {BADGE_COPY[data.badge] ?? data.badge} · 成長方案
                  </div>
                  <h2 className="font-display text-[1.6rem] leading-tight text-mos-ink mb-2">
                    {data.title}
                  </h2>
                  <p className="text-mos-muted text-[0.88rem] leading-relaxed">
                    {data.hook}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-6">
                <Meta label="期間" value={data.duration} />
                <Meta label="預算" value={data.budget} />
                <Meta label="適合" value={data.audience} small />
              </div>
            </div>

            <div className="px-8 py-6 space-y-7">
              {/* Problem */}
              <Section title="這個方案在解什麼痛">
                <p className="text-mos-ink text-[0.9rem] leading-relaxed whitespace-pre-line">
                  {data.problem}
                </p>
              </Section>

              {/* Pitch + Bundle */}
              <Section title="方案組合">
                <p
                  className="text-[0.85rem] mb-4"
                  style={{ color: data.color }}
                >
                  {data.pitch}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <BundleStat
                    label="任務範本"
                    count={data.bundle.squadSlugs.length}
                    detail={data.bundle.squadSlugs.join(" · ")}
                  />
                  <BundleStat
                    label="顧問"
                    count={data.bundle.personaIds.length}
                    detail={data.bundle.personaIds.join(" · ")}
                  />
                  <BundleStat
                    label="媒體通路"
                    count={data.bundle.channelIds.length}
                    detail={data.bundle.channelIds.join(" · ")}
                  />
                </div>
              </Section>

              {/* Phases */}
              <Section title="階段化 Roadmap">
                <div className="space-y-3">
                  {data.phases.map((ph: any, idx: number) => (
                    <div
                      key={idx}
                      className="border border-mos-hair rounded-xl p-4"
                    >
                      <div className="flex items-baseline gap-3 mb-2">
                        <span
                          className="text-[0.62rem] tracking-[0.18em] uppercase font-medium px-2 py-0.5 rounded"
                          style={{
                            background: `${data.color}18`,
                            color: data.color,
                          }}
                        >
                          {ph.week}
                        </span>
                        <span className="font-display text-[0.95rem] text-mos-ink">
                          {ph.name}
                        </span>
                      </div>
                      <ul className="text-[0.82rem] text-mos-ink space-y-1 mb-2 ml-1">
                        {ph.tasks.map((t: string, i: number) => (
                          <li key={i} className="flex gap-2">
                            <span style={{ color: data.color }}>·</span>
                            <span className="flex-1">{t}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="text-[0.7rem] text-mos-muted mt-2 pt-2 border-t border-mos-hair">
                        產出：{ph.deliverables.join(" / ")}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Success case */}
              <Section title="成功案例">
                <div
                  className="rounded-xl p-5 border"
                  style={{
                    background: `${data.color}08`,
                    borderColor: `${data.color}30`,
                  }}
                >
                  <div className="text-[0.66rem] tracking-[0.18em] uppercase text-mos-muted mb-1">
                    {data.successCase.industry} · {data.successCase.scope}
                  </div>
                  <div
                    className="font-display text-[1rem] mb-3"
                    style={{ color: data.color }}
                  >
                    {data.successCase.brand}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <div className="text-[0.62rem] uppercase tracking-wider text-mos-muted mb-1">
                        Before
                      </div>
                      <div className="text-[0.82rem] text-mos-ink leading-relaxed">
                        {data.successCase.before}
                      </div>
                    </div>
                    <div>
                      <div className="text-[0.62rem] uppercase tracking-wider text-mos-muted mb-1">
                        After
                      </div>
                      <div
                        className="text-[0.82rem] leading-relaxed font-medium"
                        style={{ color: data.color }}
                      >
                        {data.successCase.after}
                      </div>
                    </div>
                  </div>
                  <div className="text-[0.7rem] uppercase tracking-wider text-mos-muted mb-2">
                    關鍵動作
                  </div>
                  <ul className="text-[0.82rem] text-mos-ink space-y-1.5 mb-3">
                    {data.successCase.keyMoves.map((m: string, i: number) => (
                      <li key={i} className="flex gap-2">
                        <span style={{ color: data.color }}>▸</span>
                        <span className="flex-1">{m}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="text-[0.78rem] font-medium text-mos-ink mt-3 pt-3 border-t border-mos-hair">
                    {data.successCase.outcome}
                  </div>
                </div>
              </Section>

              {/* KPIs */}
              <Section title="預期 KPI">
                <div className="flex flex-wrap gap-2">
                  {data.kpis.map((k: string, i: number) => (
                    <span
                      key={i}
                      className="text-[0.78rem] px-3 py-1.5 rounded-full border"
                      style={{
                        borderColor: `${data.color}40`,
                        color: data.color,
                      }}
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </Section>
            </div>

            {/* Sticky CTA */}
            <div className="sticky bottom-0 bg-white border-t border-mos-hair px-8 py-4">
              {applyError && (
                <div className="text-[0.78rem] text-red-600 mb-2">
                  {applyError}
                </div>
              )}
              <button
                onClick={handleApply}
                disabled={applying || !brandId}
                className="w-full h-12 rounded-xl font-medium text-white disabled:opacity-50 transition hover:brightness-110"
                style={{ background: data.color }}
              >
                {applying
                  ? "套用中…"
                  : brandName
                  ? `套用此方案到 ${brandName} →`
                  : "套用此方案 →"}
              </button>
              <div className="text-[0.7rem] text-mos-muted text-center mt-2">
                套用後會建立任務、自動推薦 squad、預先呼叫顧問團
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3
        className="text-[0.66rem] tracking-[0.22em] uppercase text-mos-muted mb-3"
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function Meta({
  label,
  value,
  small = false,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-lg p-2.5 border border-white/60">
      <div className="text-[0.6rem] uppercase tracking-wider text-mos-muted mb-1">
        {label}
      </div>
      <div
        className={`text-mos-ink font-medium ${
          small ? "text-[0.72rem] leading-snug" : "text-[0.84rem]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function BundleStat({
  label,
  count,
  detail,
}: {
  label: string;
  count: number;
  detail: string;
}) {
  return (
    <div className="border border-mos-hair rounded-lg p-3">
      <div className="text-[0.6rem] uppercase tracking-wider text-mos-muted mb-1">
        {label}
      </div>
      <div className="font-display text-[1.4rem] text-mos-ink leading-none mb-1">
        {count}
      </div>
      <div className="text-[0.66rem] text-mos-muted line-clamp-2 leading-snug">
        {detail}
      </div>
    </div>
  );
}
