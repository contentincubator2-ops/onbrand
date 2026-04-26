/**
 * BoardroomPage — 顧問區 / Consultation Room
 *
 * 對齊使用者反饋：「顧問區是 agents 跟用戶提案，不是用戶跟 agents 提案」
 *
 * UX 重塑：
 *   1. 進到頁面 → 6 位真實 squad lead（從 DB 讀，每個 strategy_layer 一位）
 *      已經在桌邊等候。不是抽象大師，是 SoWork 真的養出來的顧問。
 *   2. 用戶不用先「寫 brief」 — 按下「請顧問為我提案」即可。
 *      6 位顧問依各自小組的方法論主動診斷 + 提方案。
 *   3. 每張卡片 4 段固定結構：
 *        ## 我看見的問題
 *        ## 我的小組會這樣做
 *        ## 第一週可交付
 *        ## 需要您決定的問題
 *   4. 用戶可選在下方「想再多問一句」之後再次召集，把更具體的關注點丟進去。
 *
 * 模型調度：所有顧問預設用 forge（SoWork gateway，最穩），失敗時依序退到
 * qwen / zhipu / openai。多 LLM 多樣性是 flair，不是功能 — 等 VM env 全綠
 * 再開放選擇。
 */
import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";

type Tone = "research" | "analyze" | "write" | "craft" | "orchestrate";

type SquadLead = {
  squadId: number;
  squadSlug: string;
  squadName: string;
  squadMethodology: string | null;
  strategyLayer: string;
  layerLabel: string;
  layerEmoji: string;
  tone: Tone;
  order: number;
  agentId: number | null;
  agentName: string;
  agentTitle: string;
  agentBio: string | null;
  agentPrimarySkill: string | null;
};

type Proposal = SquadLead & {
  proposal: string;
  provider: string;
  model: string;
  error: string | null;
};

const TONE_COLOR: Record<Tone, string> = {
  research: "#2EA4A0",
  analyze: "#3D6BCC",
  write: "#E07AAE",
  craft: "#E8A23B",
  orchestrate: "#5B3CC8",
};

const ACCENT = "#5B3CC8";
const STAGE_GOLD = "#D4B36A";

// ─── PortraitAvatar (shared with /ai) ────────────────────────────────────

function PortraitAvatar({
  name,
  tone,
  size,
  pulse = false,
  glow = false,
  dim = false,
}: {
  name: string;
  tone: Tone;
  size: number;
  pulse?: boolean;
  glow?: boolean;
  dim?: boolean;
}) {
  const ringColor = TONE_COLOR[tone];
  const url = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
    name
  )}&radius=50&backgroundColor=ffffff,f5f5f5,fef9e7,e8f5e9`;
  const ringWidth = Math.max(2, Math.round(size * 0.08));
  return (
    <div
      className="relative shrink-0"
      style={{
        width: size,
        height: size,
        opacity: dim ? 0.45 : 1,
        transition: "opacity 240ms ease",
      }}
    >
      {pulse && (
        <span
          className="absolute inset-0 rounded-full animate-ping"
          style={{ background: ringColor, opacity: 0.35 }}
        />
      )}
      <div
        className="rounded-full overflow-hidden bg-white"
        style={{
          width: size,
          height: size,
          border: `${ringWidth}px solid ${ringColor}`,
          boxShadow: glow
            ? `0 0 0 2px white, 0 0 0 4px ${STAGE_GOLD}, 0 8px 22px rgba(212,179,106,0.45)`
            : "0 2px 8px rgba(0,0,0,0.18)",
        }}
      >
        <img src={url} alt={name} className="w-full h-full block" />
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function BoardroomPage() {
  const { brands, brandId } = useOutletContext<ShellOutletCtx>();
  const currentBrand = useMemo(
    () => brands.find((b: any) => b.id === brandId) ?? null,
    [brands, brandId]
  );

  // Pull real squad leads from DB (one per strategy layer L1–L6)
  const leadsQuery = (trpc as any).boardroom.listSquadLeads.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );
  const leads: SquadLead[] = (leadsQuery.data as any[]) ?? [];

  const consultMut = (trpc as any).boardroom.consult.useMutation();

  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [concern, setConcern] = useState("");
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Sequential reveal effect (drama)
  const [revealedCount, setRevealedCount] = useState(0);
  useEffect(() => {
    if (!proposals) {
      setRevealedCount(0);
      return;
    }
    setRevealedCount(0);
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setRevealedCount(i);
      if (i >= proposals.length) clearInterval(t);
    }, 600);
    return () => clearInterval(t);
  }, [proposals]);

  const handleConsult = async () => {
    if (!brandId) {
      setErr("請先在右上角選擇品牌");
      return;
    }
    setRunning(true);
    setErr(null);
    setProposals(null);
    try {
      const r = await consultMut.mutateAsync({
        brandId,
        concern: concern.trim() || undefined,
      });
      setProposals((r.proposals as Proposal[]) ?? []);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="px-8 py-10 max-w-[1280px] mx-auto">
      {/* ─── Hero ────────────────────────────────────────── */}
      <div className="mb-8">
        <div
          className="text-[0.66rem] tracking-[0.24em] uppercase mb-2"
          style={{ color: ACCENT }}
        >
          BOARDROOM · 顧問區
        </div>
        <h1 className="font-display text-[2.4rem] leading-tight text-mos-ink mb-3">
          {currentBrand
            ? `${currentBrand.name} 的 6 位顧問已就坐`
            : "您的諮詢室"}
        </h1>
        <p className="text-mos-muted text-[0.95rem] max-w-[680px] leading-relaxed">
          這裡是顧問向您提案 — 不是您向顧問報告。
          每位都帶著一支真實的 squad，按下「為我提案」後，他們會用各自小組的方法論主動診斷您的品牌，
          並提出他們會怎麼做。
          {currentBrand && (
            <>
              {" "}
              品牌大腦已連線 ·{" "}
              <span style={{ color: ACCENT }}>{currentBrand.name}</span>
            </>
          )}
        </p>
      </div>

      {/* ─── Stage: leads waiting at the table ─────────────────── */}
      <StageRow leads={leads} loading={leadsQuery.isLoading} />

      {/* ─── CTA + optional follow-up question ──────────────────── */}
      <div
        className="mt-8 mb-10 rounded-2xl border bg-white p-6"
        style={{ borderColor: "#E5E5E5" }}
      >
        <label className="block">
          <span className="text-[0.66rem] tracking-[0.18em] uppercase text-mos-muted">
            想多告訴顧問什麼？（選填）
          </span>
          <textarea
            value={concern}
            onChange={(e) => setConcern(e.target.value)}
            placeholder="例：我們最近 IG 互動率掉了一半 / 想在 Q3 進入新品線 / 創辦人想要重塑品牌靈魂…"
            className="mt-2 w-full min-h-[80px] rounded-lg border border-mos-hair px-3 py-2 text-[0.9rem] focus:outline-none focus:border-mos-ink/50 resize-y"
          />
        </label>
        <p className="text-[0.7rem] text-mos-muted mt-2">
          留空也可以 — 顧問會主動依您小組的專長點出他們看見的問題。
        </p>

        <div className="flex items-center justify-between mt-4 gap-4 flex-wrap">
          <div className="text-[0.74rem] text-mos-muted">
            {currentBrand ? (
              <>
                ✓ 將以 <span className="font-medium text-mos-ink">{currentBrand.name}</span> 的品牌大腦做基礎
              </>
            ) : (
              <span className="text-amber-600">⚠ 尚未選擇品牌</span>
            )}
          </div>
          <button
            onClick={handleConsult}
            disabled={running || !brandId || leadsQuery.isLoading}
            className="px-6 h-11 rounded-xl font-medium text-white disabled:opacity-50 transition hover:brightness-110"
            style={{ background: ACCENT }}
          >
            {running ? "顧問商議中…" : proposals ? "請顧問再提案一輪" : "請各位顧問為我提案 →"}
          </button>
        </div>

        {err && (
          <div className="mt-3 text-[0.78rem] text-red-600">{err}</div>
        )}
      </div>

      {/* ─── Proposals ───────────────────────────────────── */}
      {proposals && (
        <div className="space-y-4">
          {proposals.map((p, idx) => (
            <ProposalCard
              key={p.squadId}
              proposal={p}
              revealed={idx < revealedCount}
            />
          ))}
        </div>
      )}

      {!proposals && !running && leads.length === 0 && !leadsQuery.isLoading && (
        <div className="text-center py-12 text-mos-muted text-[0.88rem]">
          還沒有可諮詢的顧問。請先到任務範本建立至少一個 squad。
        </div>
      )}
    </div>
  );
}

// ─── StageRow: leads waiting at the table ────────────────────────────────

function StageRow({
  leads,
  loading,
}: {
  leads: SquadLead[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-end justify-center gap-4 py-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="w-20 h-20 rounded-full bg-mos-hair animate-pulse"
          />
        ))}
      </div>
    );
  }
  if (leads.length === 0) {
    return (
      <div
        className="rounded-2xl border bg-mos-paper py-10 text-center text-mos-muted text-[0.86rem]"
        style={{ borderColor: "#E5E5E5" }}
      >
        尚未有 tier=core 的 squad，無法載入顧問桌。
      </div>
    );
  }
  return (
    <div
      className="rounded-2xl border bg-white py-7 px-4"
      style={{ borderColor: "#E5E5E5" }}
    >
      <div className="flex items-end justify-center gap-5 flex-wrap">
        {leads.map((l) => (
          <div key={l.squadId} className="flex flex-col items-center gap-2 w-24">
            <PortraitAvatar
              name={l.agentName}
              tone={l.tone}
              size={72}
            />
            <div className="text-[0.74rem] font-medium text-mos-ink truncate max-w-full">
              {l.agentName}
            </div>
            <div
              className="text-[0.6rem] uppercase tracking-wider text-center leading-tight"
              style={{ color: TONE_COLOR[l.tone] }}
            >
              {l.layerEmoji} {l.layerLabel}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ProposalCard: 4-section structure ───────────────────────────────────

function ProposalCard({
  proposal,
  revealed,
}: {
  proposal: Proposal;
  revealed: boolean;
}) {
  const color = TONE_COLOR[proposal.tone];
  const sections = parseProposal(proposal.proposal);

  if (!revealed) {
    return (
      <div
        className="rounded-2xl border bg-white p-6 flex items-center gap-4"
        style={{ borderColor: "#E5E5E5", opacity: 0.4 }}
      >
        <PortraitAvatar
          name={proposal.agentName}
          tone={proposal.tone}
          size={56}
          dim
        />
        <div className="text-[0.86rem] text-mos-muted">
          {proposal.agentName} 正在準備…
        </div>
      </div>
    );
  }

  if (proposal.error) {
    return (
      <div
        className="rounded-2xl border bg-white p-6"
        style={{ borderColor: "#E5E5E5" }}
      >
        <div className="flex items-start gap-4">
          <PortraitAvatar
            name={proposal.agentName}
            tone={proposal.tone}
            size={56}
            dim
          />
          <div className="flex-1">
            <div className="font-display text-[1.05rem] text-mos-ink">
              {proposal.agentName}
            </div>
            <div className="text-[0.7rem] uppercase tracking-wider text-mos-muted mt-1">
              {proposal.layerEmoji} {proposal.layerLabel} · {proposal.squadName}
            </div>
            <div className="mt-3 text-[0.82rem] text-red-600">
              無法生成提案：{proposal.error}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border bg-white p-6 transition-all duration-500"
      style={{ borderColor: `${color}40` }}
    >
      <div className="flex items-start gap-4 mb-4">
        <PortraitAvatar
          name={proposal.agentName}
          tone={proposal.tone}
          size={64}
          glow
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline flex-wrap gap-2">
            <span className="font-display text-[1.15rem] text-mos-ink">
              {proposal.agentName}
            </span>
            <span className="text-[0.78rem] text-mos-muted">
              {proposal.agentTitle}
            </span>
          </div>
          <div className="text-[0.72rem] uppercase tracking-wider mt-1" style={{ color }}>
            {proposal.layerEmoji} {proposal.layerLabel} · 帶領小組「{proposal.squadName}」
          </div>
          {proposal.squadMethodology && (
            <div className="text-[0.74rem] text-mos-muted mt-1.5 italic">
              方法論：{truncate(proposal.squadMethodology, 80)}
            </div>
          )}
        </div>
        <ProviderPill provider={proposal.provider} model={proposal.model} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <ProposalSection
          icon="🎯"
          title="我看見的問題"
          color={color}
          body={sections.problem}
        />
        <ProposalSection
          icon="🛠"
          title="我的小組會這樣做"
          color={color}
          body={sections.steps}
        />
        <ProposalSection
          icon="📦"
          title="第一週可交付"
          color={color}
          body={sections.deliverables}
        />
        <ProposalSection
          icon="❓"
          title="需要您決定的問題"
          color={color}
          body={sections.decisions}
        />
      </div>
    </div>
  );
}

function ProposalSection({
  icon,
  title,
  color,
  body,
}: {
  icon: string;
  title: string;
  color: string;
  body: string;
}) {
  return (
    <div>
      <div
        className="text-[0.66rem] tracking-[0.18em] uppercase mb-2 flex items-center gap-1.5"
        style={{ color }}
      >
        <span>{icon}</span>
        <span>{title}</span>
      </div>
      <div className="text-[0.86rem] text-mos-ink leading-relaxed whitespace-pre-line">
        {body || <span className="text-mos-muted italic">（顧問未提供此項）</span>}
      </div>
    </div>
  );
}

function ProviderPill({
  provider,
  model,
}: {
  provider: string;
  model: string;
}) {
  const labelMap: Record<string, { label: string; bg: string }> = {
    forge: { label: "Forge", bg: "#525866" },
    qwen: { label: "Qwen", bg: "#D9893E" },
    zhipu: { label: "Zhipu", bg: "#A8451E" },
    openai: { label: "GPT", bg: "#0E8567" },
    perplexity: { label: "Perplexity", bg: "#1F8A9A" },
  };
  const m = labelMap[provider] ?? { label: provider, bg: "#525866" };
  return (
    <div className="text-right shrink-0">
      <span
        className="inline-block text-[0.6rem] tracking-wider uppercase text-white px-2 py-0.5 rounded"
        style={{ background: m.bg }}
        title={model}
      >
        {m.label}
      </span>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function parseProposal(text: string): {
  problem: string;
  steps: string;
  deliverables: string;
  decisions: string;
} {
  const out = { problem: "", steps: "", deliverables: "", decisions: "" };
  if (!text) return out;
  const sections = text.split(/^##\s+/m).map((s) => s.trim()).filter(Boolean);
  for (const s of sections) {
    const newlineIdx = s.indexOf("\n");
    const heading = (newlineIdx >= 0 ? s.slice(0, newlineIdx) : s).trim();
    const body = (newlineIdx >= 0 ? s.slice(newlineIdx + 1) : "").trim();
    if (heading.includes("看見") || heading.includes("問題")) out.problem = body || heading;
    else if (heading.includes("這樣做") || heading.includes("步驟") || heading.includes("方案")) out.steps = body;
    else if (heading.includes("交付") || heading.includes("產出") || heading.includes("deliver")) out.deliverables = body;
    else if (heading.includes("決定") || heading.includes("決策") || heading.includes("問題")) {
      // duplicate match guard — only take if not already taken
      if (!out.decisions) out.decisions = body;
    }
  }
  // If parsing didn't yield 4 buckets (model didn't follow format), dump raw into "problem"
  if (!out.problem && !out.steps && !out.deliverables && !out.decisions) {
    out.problem = text;
  }
  return out;
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
