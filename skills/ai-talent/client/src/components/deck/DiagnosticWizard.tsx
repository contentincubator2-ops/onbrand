/**
 * DiagnosticWizard — 2-step modal that asks 2 questions, recommends 2–3
 * methodologies, and on pick creates a draft strategy card.
 *
 * Step 1: 你現在想解決什麼？ (6 situations)
 * Step 2: 品牌階段？ (3 stages)
 * Step 3: Show recommendations → user picks one → creates draft
 *
 * User can also click "自己選" in step 3 to see the full catalog.
 */
import React, { useMemo, useState } from "react";
import { trpc } from "../../lib/trpc";

const C = {
  overlay:    "rgba(18,18,16,0.55)",
  panel:      "#FFFFFF",
  border:     "#E4E3E1",
  borderSoft: "#EDECEA",
  text:       "#1A1A18",
  textMuted:  "#6B6A64",
  textDim:    "#9B9990",
  accent:     "#E8631A",
  accentSoft: "#FDEFE3",
  bg:         "#F9F9F8",
};

type Situation =
  | "new-launch"
  | "pricing-stuck"
  | "audience-unclear"
  | "competitor-pressure"
  | "rebranding"
  | "new-market";
type Stage = "early" | "growth" | "mature";

const SITUATIONS: { id: Situation; label: string; desc: string }[] = [
  { id: "new-launch",          label: "新品上市",  desc: "新產品 / 新服務即將或剛上線" },
  { id: "competitor-pressure", label: "競品逼近",  desc: "對手拉近差距或搶走市佔" },
  { id: "audience-unclear",    label: "受眾模糊",  desc: "不確定誰在買、為什麼買" },
  { id: "pricing-stuck",       label: "定價卡住",  desc: "調漲困難、毛利被壓縮" },
  { id: "rebranding",          label: "品牌重塑",  desc: "老品牌想換新形象或敘事" },
  { id: "new-market",          label: "擴張新市場",desc: "跨品類、跨地區或跨通路" },
];

const STAGES: { id: Stage; label: string; desc: string }[] = [
  { id: "early",  label: "早期創業",  desc: "0–2 年、市場驗證中" },
  { id: "growth", label: "成長期",    desc: "產品驗證完、要擴規模" },
  { id: "mature", label: "成熟期",    desc: "穩定營收、要守或重啟" },
];

export function DiagnosticWizard({
  brandId,
  onClose,
  onCreated,
}: {
  brandId: number;
  onClose: () => void;
  onCreated: (strategyId: number) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | "catalog">(1);
  const [situation, setSituation] = useState<Situation | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const diagnoseQuery = trpc.strategyDeck.diagnose.useQuery(
    { situation: situation ?? "new-launch", stage: stage ?? "early" },
    { enabled: !!situation && !!stage, refetchOnWindowFocus: false }
  );
  const catalogQuery = trpc.strategyDeck.listMethodologies.useQuery(
    { layer: "L1" } as any,
    { enabled: step === "catalog", refetchOnWindowFocus: false }
  );
  const createMutation = trpc.strategyDeck.create.useMutation();

  const recommendations = (diagnoseQuery.data ?? []) as any[];
  const catalog = (catalogQuery.data ?? []) as any[];

  const picked = useMemo(() => {
    if (!selectedSlug) return null;
    const fromRec = recommendations.find((r) => r.methodology.slug === selectedSlug);
    if (fromRec) return fromRec.methodology;
    return catalog.find((m) => m.slug === selectedSlug) ?? null;
  }, [selectedSlug, recommendations, catalog]);

  async function submit() {
    if (!picked || !name.trim()) return;
    setCreating(true);
    try {
      const res = await createMutation.mutateAsync({
        brandId,
        methodologySlug: picked.slug,
        name: name.trim(),
        summary: picked.summary,
      } as any);
      const id = (res as any)?.id;
      if (id) onCreated(id);
      else onClose();
    } catch (err: any) {
      alert(`建立失敗：${err?.message ?? String(err)}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div
        style={{
          width: "min(720px, 92vw)",
          maxHeight: "88vh",
          background: C.panel,
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 22px",
            borderBottom: `1px solid ${C.borderSoft}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>策略診斷精靈</div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
              {step === 1 && "Step 1 / 2 · 你現在想解決什麼？"}
              {step === 2 && "Step 2 / 2 · 品牌處於哪個階段？"}
              {step === 3 && "為你推薦 2–3 套方法論"}
              {step === "catalog" && "從 10 套 L1 方法論中自選"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: C.textMuted,
              fontSize: 18,
              cursor: "pointer",
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "22px", overflowY: "auto" }}>
          {step === 1 && (
            <Grid>
              {SITUATIONS.map((s) => (
                <OptionCard
                  key={s.id}
                  label={s.label}
                  desc={s.desc}
                  selected={situation === s.id}
                  onClick={() => setSituation(s.id)}
                />
              ))}
            </Grid>
          )}

          {step === 2 && (
            <Grid cols={3}>
              {STAGES.map((s) => (
                <OptionCard
                  key={s.id}
                  label={s.label}
                  desc={s.desc}
                  selected={stage === s.id}
                  onClick={() => setStage(s.id)}
                />
              ))}
            </Grid>
          )}

          {step === 3 && (
            <div>
              {diagnoseQuery.isLoading && <CenterText>推薦中…</CenterText>}
              {!diagnoseQuery.isLoading && recommendations.length === 0 && (
                <CenterText>
                  沒有強匹配，建議從完整目錄挑選。
                  <br />
                  <button
                    style={linkBtn}
                    onClick={() => setStep("catalog")}
                  >
                    查看全部 10 套
                  </button>
                </CenterText>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {recommendations.map((r) => (
                  <RecommendationCard
                    key={r.methodology.slug}
                    methodology={r.methodology}
                    reason={r.reason}
                    selected={selectedSlug === r.methodology.slug}
                    onClick={() => setSelectedSlug(r.methodology.slug)}
                  />
                ))}
              </div>
              {recommendations.length > 0 && (
                <div style={{ marginTop: 16, textAlign: "center" }}>
                  <button style={linkBtn} onClick={() => setStep("catalog")}>
                    或從全部 10 套自己選 →
                  </button>
                </div>
              )}

              {selectedSlug && (
                <div style={{ marginTop: 22, padding: 16, background: C.bg, borderRadius: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 8 }}>
                    幫這張策略卡取個名字（之後執行時會用這個名字引用）
                  </div>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：2026 Q2 新品上市定位"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: 13,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      boxSizing: "border-box",
                      fontFamily: "inherit",
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {step === "catalog" && (
            <div>
              {catalogQuery.isLoading && <CenterText>載入目錄中…</CenterText>}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {catalog.map((m: any) => (
                  <RecommendationCard
                    key={m.slug}
                    methodology={m}
                    reason={`${m.layer} · ${m.author}`}
                    selected={selectedSlug === m.slug}
                    onClick={() => setSelectedSlug(m.slug)}
                  />
                ))}
              </div>
              {selectedSlug && (
                <div style={{ marginTop: 22, padding: 16, background: C.bg, borderRadius: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 8 }}>
                    幫這張策略卡取個名字
                  </div>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：2026 Q2 新品上市定位"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      fontSize: 13,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      boxSizing: "border-box",
                      fontFamily: "inherit",
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 22px",
            borderTop: `1px solid ${C.borderSoft}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#FBFBFA",
          }}
        >
          <div style={{ fontSize: 11, color: C.textDim }}>
            不確定？<button style={linkBtn} onClick={() => setStep("catalog")}>跳過診斷，自己選</button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {(step === 2 || step === 3 || step === "catalog") && (
              <button
                onClick={() => {
                  if (step === "catalog") setStep(3);
                  else if (step === 3) setStep(2);
                  else if (step === 2) setStep(1);
                }}
                style={secondaryBtn}
              >
                ← 上一步
              </button>
            )}
            {step === 1 && (
              <button
                disabled={!situation}
                onClick={() => setStep(2)}
                style={situation ? primaryBtn : disabledBtn}
              >
                下一步 →
              </button>
            )}
            {step === 2 && (
              <button
                disabled={!stage}
                onClick={() => setStep(3)}
                style={stage ? primaryBtn : disabledBtn}
              >
                查看推薦 →
              </button>
            )}
            {(step === 3 || step === "catalog") && (
              <button
                disabled={!selectedSlug || !name.trim() || creating}
                onClick={submit}
                style={selectedSlug && name.trim() && !creating ? primaryBtn : disabledBtn}
              >
                {creating ? "建立中…" : "建立策略卡（草稿）"}
              </button>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: C.overlay,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      {children}
    </div>
  );
}

function Grid({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 10,
      }}
    >
      {children}
    </div>
  );
}

function OptionCard({
  label,
  desc,
  selected,
  onClick,
}: {
  label: string;
  desc: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: "14px 16px",
        background: selected ? C.accentSoft : "#fff",
        border: `1.5px solid ${selected ? C.accent : C.border}`,
        borderRadius: 8,
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all .15s",
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: selected ? C.accent : C.text,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.4 }}>{desc}</div>
    </button>
  );
}

function RecommendationCard({
  methodology,
  reason,
  selected,
  onClick,
}: {
  methodology: any;
  reason: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: "14px 16px",
        background: selected ? C.accentSoft : "#fff",
        border: `1.5px solid ${selected ? C.accent : C.border}`,
        borderRadius: 8,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: selected ? C.accent : C.text }}>
          {methodology.name}
        </span>
        <span
          style={{
            fontSize: 10,
            background: "#EDECEA",
            color: C.textMuted,
            padding: "1px 6px",
            borderRadius: 4,
            fontWeight: 600,
          }}
        >
          {methodology.layer}
        </span>
      </div>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>
        {methodology.author}
        {methodology.year && ` · ${methodology.year}`}
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, marginBottom: 6 }}>
        {methodology.summary}
      </div>
      <div style={{ fontSize: 11, color: C.accent, fontWeight: 600 }}>
        ✓ {reason}
      </div>
    </button>
  );
}

function CenterText({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: C.textMuted }}>
      {children}
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  background: C.accent,
  color: "#fff",
  border: "none",
  padding: "9px 16px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};
const disabledBtn: React.CSSProperties = {
  ...primaryBtn,
  background: "#D9D7D2",
  cursor: "not-allowed",
};
const secondaryBtn: React.CSSProperties = {
  background: "#fff",
  color: C.textMuted,
  border: `1px solid ${C.border}`,
  padding: "9px 14px",
  borderRadius: 6,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};
const linkBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: C.accent,
  cursor: "pointer",
  fontSize: 12,
  padding: 0,
  textDecoration: "underline",
  fontFamily: "inherit",
};
