/**
 * StrategyDeckPage.tsx — Phase 1 of the Strategy Deck overhaul.
 *
 * Route: /b/:brandId/deck
 *
 * Layout:
 *   ┌─ Top bar ────────────────────────────────────────────────────────┐
 *   │ ← back   [Brand Name]                           [+ New strategy] │
 *   ├─ Timeline ───────────────────────────────────────────────────────┤
 *   │  偵測情報 ──→ 決策策略 ──→ 製作執行 ──→ 複盤優化 (cycle back)     │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │                                                                   │
 *   │  Strategy zone: grid of strategy cards                            │
 *   │  ┌────┐ ┌────┐ ┌────┐                                             │
 *   │  │    │ │    │ │ +  │                                             │
 *   │  └────┘ └────┘ └────┘                                             │
 *   │                                                                   │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Zones 偵測/製作/複盤 render placeholders in Phase 1.
 * Clicking a card opens a detail modal with a mini chat drawer on the back.
 */
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { DiagnosticWizard } from "../components/deck/DiagnosticWizard";
import { StrategyCardDetail } from "../components/deck/StrategyCardDetail";
import { StrategyCard } from "../components/deck/StrategyCard";
import { ZoneTimeline } from "../components/deck/ZoneTimeline";
import type { DeckZone } from "../components/deck/types";

// ─── Colors / tokens ────────────────────────────────────────────────────────
const C = {
  bg:        "#F9F9F8",
  panelBg:   "#FFFFFF",
  border:    "#E4E3E1",
  borderSoft:"#EDECEA",
  text:      "#1A1A18",
  textMuted: "#6B6A64",
  textDim:   "#9B9990",
  accent:    "#E8631A",
  accentSoft:"#FDEFE3",
  draft:     "#B5B4AF",
  active:    "#2B8A3E",
  stale:     "#C59A2E",
  archived:  "#9B9990",
};

// ─── Main page ──────────────────────────────────────────────────────────────
export default function StrategyDeckPage() {
  const { brandId: brandIdParam } = useParams<{ brandId: string }>();
  const navigate = useNavigate();
  const brandId = brandIdParam ? Number(brandIdParam) : null;

  const [activeZone, setActiveZone] = useState<DeckZone>("decide");
  const [showWizard, setShowWizard] = useState(false);
  const [openStrategyId, setOpenStrategyId] = useState<number | null>(null);

  const brandQuery = trpc.brand.get.useQuery(
    { id: brandId! },
    { enabled: !!brandId, refetchOnWindowFocus: false }
  );
  const strategiesQuery = trpc.strategyDeck.listByBrand.useQuery(
    { brandId: brandId! },
    { enabled: !!brandId, refetchOnWindowFocus: false }
  );

  if (!brandId) {
    return (
      <CenteredMessage text="缺少 brandId" />
    );
  }

  const brand = brandQuery.data as any;
  const strategies = (strategiesQuery.data ?? []) as any[];

  const active = strategies.filter((s) => s.status === "active");
  const drafts = strategies.filter((s) => s.status === "draft");
  const archived = strategies.filter((s) => s.status === "archived");

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Noto Sans TC', 'Inter', sans-serif",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 52,
          padding: "0 24px",
          background: C.panelBg,
          borderBottom: `1px solid ${C.border}`,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={() => navigate("/")}
            style={{
              background: "none",
              border: "none",
              color: C.textMuted,
              cursor: "pointer",
              fontSize: 13,
              padding: "4px 8px",
            }}
          >
            ← 返回
          </button>
          <div style={{ width: 1, height: 18, background: C.border }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {brand?.name ?? "（讀取中…）"}
          </div>
          <span
            style={{
              fontSize: 10,
              color: C.accent,
              background: C.accentSoft,
              padding: "2px 6px",
              borderRadius: 4,
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            STRATEGY DECK · BETA
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setShowWizard(true)}
            style={{
              background: C.accent,
              color: "#fff",
              border: "none",
              padding: "8px 14px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + 建立策略卡
          </button>
        </div>
      </div>

      {/* Zone timeline */}
      <ZoneTimeline
        active={activeZone}
        onChange={setActiveZone}
        badges={{
          decide: active.length,
        }}
      />

      {/* Zone content */}
      <div style={{ padding: "20px 28px 60px" }}>
        {activeZone === "decide" && (
          <DecideZone
            loading={strategiesQuery.isLoading}
            active={active}
            drafts={drafts}
            archived={archived}
            onOpen={(id) => setOpenStrategyId(id)}
            onCreate={() => setShowWizard(true)}
          />
        )}
        {activeZone === "detect" && <PlaceholderZone title="偵測情報" subtitle="市場監聽、競品動態、情境雷達 — Phase 4" />}
        {activeZone === "make" && <PlaceholderZone title="製作執行" subtitle="策略 × 通路 × 目標組合器 — Phase 2" />}
        {activeZone === "review" && <PlaceholderZone title="複盤優化" subtitle="效果歸因、AB 總結、下一步建議 — Phase 4" />}
      </div>

      {/* Diagnostic wizard modal */}
      {showWizard && (
        <DiagnosticWizard
          brandId={brandId}
          onClose={() => setShowWizard(false)}
          onCreated={(id) => {
            setShowWizard(false);
            setOpenStrategyId(id);
            strategiesQuery.refetch();
          }}
        />
      )}

      {/* Strategy card detail modal (with mini chat drawer) */}
      {openStrategyId && (
        <StrategyCardDetail
          strategyId={openStrategyId}
          onClose={() => {
            setOpenStrategyId(null);
            strategiesQuery.refetch();
          }}
        />
      )}
    </div>
  );
}

// ─── Decide zone (the core of Phase 1) ──────────────────────────────────────
function DecideZone({
  loading,
  active,
  drafts,
  archived,
  onOpen,
  onCreate,
}: {
  loading: boolean;
  active: any[];
  drafts: any[];
  archived: any[];
  onOpen: (id: number) => void;
  onCreate: () => void;
}) {
  const total = active.length + drafts.length + archived.length;

  if (loading) {
    return <CenteredMessage text="載入中…" />;
  }
  if (total === 0) {
    return <EmptyState onCreate={onCreate} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {active.length > 0 && (
        <CardSection
          title="使用中"
          hint="執行與優化時會自動引用"
          cards={active}
          onOpen={onOpen}
        />
      )}
      {drafts.length > 0 && (
        <CardSection title="草稿" hint="填完設定後按「啟用」" cards={drafts} onOpen={onOpen} />
      )}
      {archived.length > 0 && (
        <CardSection title="封存" hint="歷史紀錄，可隨時復活" cards={archived} onOpen={onOpen} />
      )}
    </div>
  );
}

function CardSection({
  title,
  hint,
  cards,
  onOpen,
}: {
  title: string;
  hint: string;
  cards: any[];
  onOpen: (id: number) => void;
}) {
  return (
    <section>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{title}</h2>
          <span style={{ fontSize: 11, color: C.textDim }}>{cards.length}</span>
        </div>
        <span style={{ fontSize: 11, color: C.textDim }}>{hint}</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        {cards.map((c) => (
          <StrategyCard key={c.id} card={c} onClick={() => onOpen(c.id)} />
        ))}
      </div>
    </section>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      style={{
        margin: "60px auto",
        maxWidth: 520,
        textAlign: "center",
        padding: "40px 32px",
        background: C.panelBg,
        border: `1px dashed ${C.border}`,
        borderRadius: 10,
      }}
    >
      <div style={{ fontSize: 44, marginBottom: 12, filter: "grayscale(0.3)" }}>🎴</div>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>
        這個品牌還沒有策略卡
      </h3>
      <p style={{ fontSize: 13, color: C.textMuted, margin: "0 0 20px", lineHeight: 1.6 }}>
        策略卡是執行、優化、情報的引用來源。
        <br />
        先回答兩個問題，我們幫你挑 2–3 套合適的方法論。
      </p>
      <button
        onClick={onCreate}
        style={{
          background: C.accent,
          color: "#fff",
          border: "none",
          padding: "10px 18px",
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        開始診斷
      </button>
    </div>
  );
}

function PlaceholderZone({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div
      style={{
        margin: "40px auto",
        maxWidth: 520,
        textAlign: "center",
        padding: "48px 32px",
        background: C.panelBg,
        border: `1px dashed ${C.border}`,
        borderRadius: 10,
      }}
    >
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>{title}</h3>
      <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>{subtitle}</p>
    </div>
  );
}

function CenteredMessage({ text }: { text: string }) {
  return (
    <div
      style={{
        height: "70vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#9B9990",
        fontSize: 13,
      }}
    >
      {text}
    </div>
  );
}
