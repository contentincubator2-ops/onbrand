/**
 * BoardroomPage — 「比稿（邀比稿）」三步流程
 *
 *   STEP 1  用戶輸入需求 (concern / brief)
 *   STEP 2  系統推薦 12 位候選 agent，用戶勾選 3–5 位
 *   STEP 3  被選中的 agent 各自比稿（4 段格式）
 *
 * 不再寫死 6 位顧問 — agent 池動態從 query 篩。
 */
import React, { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";

type Candidate = {
  agentId: number;
  name: string;
  title: string;
  bio: string | null;
  primarySkill: string | null;
  aiModel: string;
  providerBucket: string;
  squadId: number | null;
  squadName: string | null;
  squadMethodology: string | null;
  squadStrategyLayer: string | null;
  matchScore: number;
  matchReasons: string[];
};

type Pitch = Candidate & {
  proposal: string;
  provider: string;
  model: string;
  error: string | null;
};

const ACCENT = "#5B3CC8";
const STAGE_GOLD = "#D4B36A";
const HAIR = "#E5E5E5";
const INK = "#0E0E10";
const SUBTLE = "#6B6B70";

const PROVIDER_COLOR: Record<string, string> = {
  "azure-foundry": "#0078D4",
  anthropic: "#D97757",
  qwen: "#0E1E40",
  zhipu: "#1B6EFD",
  perplexity: "#1FBFB8",
  forge: "#5B3CC8",
  openai: "#10A37F",
  gemini: "#4285F4",
  google: "#4285F4",
  cohere: "#FF7759",
};

function PortraitAvatar({ name, size = 72 }: { name: string; size?: number }) {
  const seed = encodeURIComponent(name || "anon");
  const url = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        background: "#F5F2EE",
        border: `2px solid ${HAIR}`,
        flexShrink: 0,
      }}
    >
      <img src={url} alt={name} width={size} height={size} />
    </div>
  );
}

function ProviderPill({ provider, model }: { provider: string; model: string }) {
  const color = PROVIDER_COLOR[provider] || "#888";
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 999,
        color,
        border: `1px solid ${color}40`,
        background: `${color}10`,
        whiteSpace: "nowrap",
      }}
    >
      {provider}
      {model ? ` · ${model}` : ""}
    </span>
  );
}

function parsePitch(md: string): { problem: string; steps: string; deliverables: string; differentiator: string } {
  if (!md) return { problem: "", steps: "", deliverables: "", differentiator: "" };
  const sections = md.split(/^##\s+/m).slice(1);
  const out = { problem: "", steps: "", deliverables: "", differentiator: "" };
  for (const s of sections) {
    const [head, ...body] = s.split("\n");
    const text = body.join("\n").trim();
    const h = (head || "").trim();
    if (h.includes("看見") || h.includes("問題") || h.includes("診斷")) out.problem = text;
    else if (h.includes("這樣做") || h.includes("步驟")) out.steps = text;
    else if (h.includes("交付") || h.includes("第一週")) out.deliverables = text;
    else if (h.includes("為什麼選我") || h.includes("選我") || h.includes("獨特")) out.differentiator = text;
  }
  return out;
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function BoardroomPage() {
  // ShellOutletCtx exposes brandId + brands[] (no currentBrand convenience).
  // Resolve the active brand object from the list ourselves.
  const ctx = useOutletContext<ShellOutletCtx>() ?? ({} as ShellOutletCtx);
  const brandId = ctx.brandId ?? null;
  const currentBrand = (ctx.brands ?? []).find((b: any) => b?.id === brandId) ?? null;
  const brandName = currentBrand?.name || "未指定品牌";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pitches, setPitches] = useState<Pitch[]>([]);

  const recommendMutation = (trpc as any).boardroom.recommendAgents.useQuery(
    { brandId, query, limit: 12 },
    { enabled: false }
  );
  const pitchMutation = (trpc as any).boardroom.pitch.useMutation();

  const onFindAgents = async () => {
    if (query.trim().length < 2) return;
    const r = await recommendMutation.refetch();
    setCandidates((r.data?.candidates as Candidate[]) ?? []);
    setSelected(new Set());
    setStep(2);
  };

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      return next;
    });
  };

  const onPitch = async () => {
    if (selected.size === 0) return;
    const result = await pitchMutation.mutateAsync({
      brandId,
      query,
      agentIds: Array.from(selected),
    });
    setPitches((result.pitches as Pitch[]) ?? []);
    setStep(3);
  };

  const reset = () => {
    setStep(1);
    setSelected(new Set());
    setCandidates([]);
    setPitches([]);
  };

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 28px 80px" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, color: SUBTLE, letterSpacing: 1, fontWeight: 600 }}>
          BOARDROOM · 比稿（邀比稿）
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: INK, margin: "8px 0 4px" }}>
          {brandName} · 邀請顧問為您比稿
        </h1>
        <p style={{ fontSize: 14, color: SUBTLE, margin: 0 }}>
          說出您的需求 → 系統推薦候選顧問 → 您勾選 → 顧問各自提案，您當評審
        </p>
      </div>

      {/* Step indicator */}
      <StepIndicator step={step} />

      {/* Step 1: Input */}
      {step === 1 && (
        <Step1Input
          query={query}
          setQuery={setQuery}
          onFindAgents={onFindAgents}
          loading={recommendMutation.isFetching}
        />
      )}

      {/* Step 2: Candidate selection */}
      {step === 2 && (
        <Step2Candidates
          candidates={candidates}
          selected={selected}
          toggle={toggle}
          onBack={() => setStep(1)}
          onPitch={onPitch}
          pitching={pitchMutation.isPending}
          query={query}
        />
      )}

      {/* Step 3: Pitches */}
      {step === 3 && <Step3Pitches pitches={pitches} onReset={reset} query={query} />}
    </div>
  );
}

// ─── Step indicator ────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "輸入需求" },
    { n: 2, label: "勾選顧問" },
    { n: 3, label: "看比稿" },
  ];
  return (
    <div style={{ display: "flex", gap: 0, alignItems: "center", marginBottom: 32, fontSize: 13 }}>
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              opacity: s.n === step ? 1 : 0.4,
              fontWeight: s.n === step ? 600 : 400,
              color: s.n <= step ? ACCENT : SUBTLE,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: s.n <= step ? ACCENT : "#EEE",
                color: s.n <= step ? "#FFF" : SUBTLE,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              {s.n}
            </div>
            {s.label}
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: "0 0 32px", height: 1, background: HAIR, margin: "0 12px" }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Step 1 ────────────────────────────────────────────────────────────────
function Step1Input({
  query,
  setQuery,
  onFindAgents,
  loading,
}: {
  query: string;
  setQuery: (s: string) => void;
  onFindAgents: () => void;
  loading: boolean;
}) {
  const examples = [
    "我要做新品上市的 IG 內容企劃",
    "B2B SaaS 想做 LinkedIn 內容增長",
    "電商品牌想找新的市場定位",
    "想做品牌故事重塑，但不知道從哪開始",
  ];
  return (
    <div
      style={{
        background: "#FFF",
        border: `1px solid ${HAIR}`,
        borderRadius: 16,
        padding: 32,
      }}
    >
      <label style={{ fontSize: 13, fontWeight: 600, color: INK, display: "block", marginBottom: 12 }}>
        您今天想解決什麼問題？
      </label>
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="例：我要做新品上市的 IG 內容企劃，預算有限，想要 30 天內看到效果..."
        style={{
          width: "100%",
          minHeight: 120,
          padding: 16,
          borderRadius: 12,
          border: `1px solid ${HAIR}`,
          fontSize: 14,
          fontFamily: "inherit",
          resize: "vertical",
          outline: "none",
          color: INK,
        }}
      />
      <div style={{ marginTop: 12, fontSize: 12, color: SUBTLE }}>
        快速範例：
        {examples.map((e) => (
          <button
            key={e}
            onClick={() => setQuery(e)}
            style={{
              marginLeft: 6,
              padding: "4px 10px",
              fontSize: 12,
              borderRadius: 999,
              border: `1px solid ${HAIR}`,
              background: "#FFF",
              cursor: "pointer",
              color: INK,
            }}
          >
            {e}
          </button>
        ))}
      </div>
      <button
        onClick={onFindAgents}
        disabled={loading || query.trim().length < 2}
        style={{
          marginTop: 24,
          padding: "12px 24px",
          background: ACCENT,
          color: "#FFF",
          border: "none",
          borderRadius: 999,
          fontSize: 14,
          fontWeight: 600,
          cursor: loading || query.trim().length < 2 ? "not-allowed" : "pointer",
          opacity: loading || query.trim().length < 2 ? 0.5 : 1,
        }}
      >
        {loading ? "搜尋中..." : "找候選顧問 →"}
      </button>
    </div>
  );
}

// ─── Step 2 ────────────────────────────────────────────────────────────────
function Step2Candidates({
  candidates,
  selected,
  toggle,
  onBack,
  onPitch,
  pitching,
  query,
}: {
  candidates: Candidate[];
  selected: Set<number>;
  toggle: (id: number) => void;
  onBack: () => void;
  onPitch: () => void;
  pitching: boolean;
  query: string;
}) {
  if (candidates.length === 0) {
    return (
      <div
        style={{
          background: "#FFF",
          border: `1px solid ${HAIR}`,
          borderRadius: 16,
          padding: 48,
          textAlign: "center",
          color: SUBTLE,
        }}
      >
        沒有找到匹配的顧問。請回到上一步換個說法。
        <div>
          <button onClick={onBack} style={{ marginTop: 16, padding: "8px 16px", border: `1px solid ${HAIR}`, borderRadius: 999, background: "#FFF", cursor: "pointer" }}>
            ← 重新輸入
          </button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: SUBTLE }}>
          您的需求：「{query}」 — 系統推薦 {candidates.length} 位候選顧問，請勾選 1–5 位邀請比稿
        </div>
        <button onClick={onBack} style={{ fontSize: 12, color: SUBTLE, background: "none", border: "none", cursor: "pointer" }}>
          ← 修改需求
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
        {candidates.map((c) => {
          const isSelected = selected.has(c.agentId);
          const isMaxedOut = !isSelected && selected.size >= 5;
          return (
            <button
              key={c.agentId}
              onClick={() => toggle(c.agentId)}
              disabled={isMaxedOut}
              style={{
                textAlign: "left",
                background: isSelected ? `${ACCENT}08` : "#FFF",
                border: `2px solid ${isSelected ? ACCENT : HAIR}`,
                borderRadius: 14,
                padding: 16,
                cursor: isMaxedOut ? "not-allowed" : "pointer",
                opacity: isMaxedOut ? 0.4 : 1,
                position: "relative",
                transition: "all 0.15s",
                fontFamily: "inherit",
              }}
            >
              {isSelected && (
                <div
                  style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: ACCENT,
                    color: "#FFF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  ✓
                </div>
              )}
              <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                <PortraitAvatar name={c.name} size={56} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: INK, marginBottom: 2 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: SUBTLE, lineHeight: 1.3 }}>{c.title}</div>
                </div>
              </div>

              {c.squadName && (
                <div style={{ fontSize: 11, color: ACCENT, fontWeight: 600, marginBottom: 6 }}>
                  📚 {c.squadName}
                </div>
              )}

              {c.matchReasons.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                  {c.matchReasons.map((r, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        background: `${STAGE_GOLD}20`,
                        color: "#7A5A1F",
                        borderRadius: 4,
                      }}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <ProviderPill provider={c.providerBucket} model={c.aiModel} />
                <span style={{ fontSize: 10, color: SUBTLE }}>匹配 {c.matchScore}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Sticky CTA */}
      <div
        style={{
          position: "sticky",
          bottom: 16,
          marginTop: 32,
          display: "flex",
          justifyContent: "center",
          zIndex: 10,
        }}
      >
        <button
          onClick={onPitch}
          disabled={selected.size === 0 || pitching}
          style={{
            padding: "14px 32px",
            background: ACCENT,
            color: "#FFF",
            border: "none",
            borderRadius: 999,
            fontSize: 15,
            fontWeight: 700,
            cursor: selected.size === 0 || pitching ? "not-allowed" : "pointer",
            opacity: selected.size === 0 ? 0.4 : 1,
            boxShadow: "0 8px 24px rgba(91, 60, 200, 0.25)",
          }}
        >
          {pitching ? "顧問撰寫中..." : `邀比稿（已選 ${selected.size} 位） →`}
        </button>
      </div>
    </div>
  );
}

// ─── Step 3 ────────────────────────────────────────────────────────────────
function Step3Pitches({ pitches, onReset, query }: { pitches: Pitch[]; onReset: () => void; query: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 13, color: SUBTLE, marginBottom: 4 }}>客戶需求：</div>
          <div style={{ fontSize: 15, color: INK, fontWeight: 500 }}>{query}</div>
        </div>
        <button
          onClick={onReset}
          style={{
            padding: "8px 16px",
            border: `1px solid ${HAIR}`,
            borderRadius: 999,
            background: "#FFF",
            cursor: "pointer",
            fontSize: 13,
            color: INK,
          }}
        >
          重新比稿
        </button>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        {pitches.map((p) => (
          <PitchCard key={p.agentId} pitch={p} />
        ))}
      </div>
    </div>
  );
}

function PitchCard({ pitch }: { pitch: Pitch }) {
  const parsed = useMemo(() => parsePitch(pitch.proposal || ""), [pitch.proposal]);
  return (
    <div
      style={{
        background: "#FFF",
        border: `1px solid ${HAIR}`,
        borderRadius: 16,
        padding: 24,
      }}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
        <PortraitAvatar name={pitch.name} size={64} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: INK, margin: 0 }}>{pitch.name}</h3>
            <ProviderPill provider={pitch.provider} model={pitch.model} />
          </div>
          <div style={{ fontSize: 12, color: SUBTLE }}>{pitch.title}</div>
          {pitch.squadName && (
            <div style={{ fontSize: 12, color: ACCENT, fontWeight: 600, marginTop: 4 }}>
              📚 {pitch.squadName}
              {pitch.squadMethodology ? ` · ${pitch.squadMethodology.slice(0, 60)}` : ""}
            </div>
          )}
        </div>
      </div>

      {pitch.error ? (
        <div style={{ padding: 12, background: "#FFF5F5", borderRadius: 8, color: "#D33", fontSize: 13 }}>
          ⚠ 提案失敗：{pitch.error}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Section title="我看見的問題" tone="#E07AAE" body={parsed.problem} />
          <Section title="我會這樣做" tone="#3D6BCC" body={parsed.steps} />
          <Section title="第一週可交付" tone="#E8A23B" body={parsed.deliverables} />
          <Section title="為什麼選我" tone="#5B3CC8" body={parsed.differentiator} />
        </div>
      )}
    </div>
  );
}

function Section({ title, tone, body }: { title: string; tone: string; body: string }) {
  return (
    <div style={{ borderLeft: `3px solid ${tone}`, paddingLeft: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: tone, letterSpacing: 0.5, marginBottom: 6 }}>
        {title.toUpperCase()}
      </div>
      <div style={{ fontSize: 13, color: INK, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
        {body || "（尚無內容）"}
      </div>
    </div>
  );
}
