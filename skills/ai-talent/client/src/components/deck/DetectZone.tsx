/**
 * DetectZone — the "偵測情報" tab of the Strategy Deck (Phase 2A).
 *
 * Lets users log real-world signals (competitor moves, industry trends,
 * social mentions, internal data, manual notes). These feed directly into
 * strategyDeck.autoFill so generated strategy cards reference real data
 * instead of generic methodology templates.
 *
 * Phase 2A = manual entry only. Automatic scraping / Trends API / RSS
 * will come in Phase 2A Ext.
 */
import React, { useMemo, useState } from "react";
import { trpc } from "../../lib/trpc";

const C = {
  panelBg:   "#FFFFFF",
  bg:        "#F9F9F8",
  border:    "#E4E3E1",
  borderSoft:"#EDECEA",
  text:      "#1A1A18",
  textMuted: "#6B6A64",
  textDim:   "#9B9990",
  accent:    "#E8631A",
  accentSoft:"#FDEFE3",
  danger:    "#C43F3F",
};

type SignalType = "competitor" | "trend" | "social" | "internal" | "manual";
type Relevance = "high" | "medium" | "low";

const TYPE_META: Record<SignalType, { label: string; emoji: string; color: string; bg: string }> = {
  competitor: { label: "競品動態", emoji: "⚔️", color: "#B0410B", bg: "#FDEFE3" },
  trend:      { label: "產業趨勢", emoji: "📈", color: "#1B5FA1", bg: "#E6F0FB" },
  social:     { label: "社群聲量", emoji: "💬", color: "#6E3BA4", bg: "#F1EAFA" },
  internal:   { label: "內部數據", emoji: "📊", color: "#2B8A3E", bg: "#E7F5EB" },
  manual:     { label: "手動記錄", emoji: "📝", color: "#6B6A64", bg: "#F1F0EE" },
};

const REL_META: Record<Relevance, { label: string; color: string }> = {
  high:   { label: "⭐ 高", color: "#C59A2E" },
  medium: { label: "中",   color: "#6B6A64" },
  low:    { label: "低",   color: "#9B9990" },
};

export function DetectZone({ brandId }: { brandId: number }) {
  const [typeFilter, setTypeFilter] = useState<SignalType | "all">("all");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const listQuery = trpc.brandIntel.listByBrand.useQuery(
    { brandId, type: typeFilter === "all" ? undefined : typeFilter, limit: 100 },
    { refetchOnWindowFocus: false }
  );
  const summaryQuery = trpc.brandIntel.summarize.useQuery(
    { brandId },
    { refetchOnWindowFocus: false }
  );

  const signals = (listQuery.data ?? []) as any[];
  const summary = summaryQuery.data as any;
  const total = summary?.total ?? 0;

  async function refetch() {
    await Promise.all([listQuery.refetch(), summaryQuery.refetch()]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header with filter pills + create button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <FilterPill
            label={`全部 ${total}`}
            active={typeFilter === "all"}
            onClick={() => setTypeFilter("all")}
          />
          {(Object.keys(TYPE_META) as SignalType[]).map((t) => (
            <FilterPill
              key={t}
              label={`${TYPE_META[t].emoji} ${TYPE_META[t].label} ${summary?.byType?.[t] ?? 0}`}
              active={typeFilter === t}
              onClick={() => setTypeFilter(t)}
            />
          ))}
        </div>
        <button
          onClick={() => setCreating(true)}
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
          + 新增情報
        </button>
      </div>

      {/* Grounding hint — explain the why */}
      <div
        style={{
          padding: "10px 14px",
          background: C.accentSoft,
          borderRadius: 8,
          fontSize: 12,
          color: "#7A3B0F",
          lineHeight: 1.6,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 16 }}>💡</span>
        <span>
          這裡記錄的情報會自動被策略卡的「🤖 AI 產生」引用。情報越具體（含日期、數字、來源），產出的策略越有數據感。
        </span>
      </div>

      {/* Signal grid or empty state */}
      {listQuery.isLoading ? (
        <CenteredMessage text="載入中…" />
      ) : signals.length === 0 ? (
        <EmptyState onCreate={() => setCreating(true)} filtered={typeFilter !== "all"} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 12,
          }}
        >
          {signals.map((s) => (
            <SignalCard key={s.id} signal={s} onEdit={() => setEditingId(s.id)} />
          ))}
        </div>
      )}

      {/* Modals */}
      {creating && (
        <SignalFormModal
          mode="create"
          brandId={brandId}
          onClose={() => setCreating(false)}
          onSaved={async () => { setCreating(false); await refetch(); }}
        />
      )}
      {editingId != null && (
        <SignalFormModal
          mode="edit"
          brandId={brandId}
          signalId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={async () => { setEditingId(null); await refetch(); }}
        />
      )}
    </div>
  );
}

// ─── SignalCard ─────────────────────────────────────────────────────────────
function SignalCard({ signal, onEdit }: { signal: any; onEdit: () => void }) {
  const meta = TYPE_META[signal.type as SignalType] ?? TYPE_META.manual;
  const rel = REL_META[signal.relevance as Relevance] ?? REL_META.medium;
  const date = signal.capturedAt
    ? new Date(signal.capturedAt).toLocaleDateString("zh-TW", {
        year: "numeric", month: "2-digit", day: "2-digit",
      })
    : "";

  return (
    <div
      onClick={onEdit}
      style={{
        background: C.panelBg,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: 14,
        cursor: "pointer",
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.06)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: meta.color,
            background: meta.bg,
            padding: "2px 8px",
            borderRadius: 4,
          }}
        >
          {meta.emoji} {meta.label}
        </span>
        <span style={{ fontSize: 10, color: rel.color, fontWeight: 600 }}>{rel.label}</span>
      </div>

      <div
        style={{
          fontSize: 13.5,
          fontWeight: 600,
          color: C.text,
          lineHeight: 1.5,
          marginBottom: 6,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {signal.headline}
      </div>

      {signal.body && (
        <div
          style={{
            fontSize: 12,
            color: C.textMuted,
            lineHeight: 1.6,
            marginBottom: 8,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {signal.body}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 11,
          color: C.textDim,
        }}
      >
        <span title={signal.source}>{truncate(signal.source, 30)}</span>
        <span>{date}</span>
      </div>

      {signal.url && (
        <div style={{ marginTop: 6 }}>
          <a
            href={signal.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontSize: 11,
              color: C.accent,
              textDecoration: "none",
              wordBreak: "break-all",
            }}
          >
            🔗 {truncate(signal.url, 50)}
          </a>
        </div>
      )}
    </div>
  );
}

// ─── FormModal (create + edit) ──────────────────────────────────────────────
function SignalFormModal({
  mode,
  brandId,
  signalId,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  brandId: number;
  signalId?: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const createMutation = trpc.brandIntel.create.useMutation();
  const updateMutation = trpc.brandIntel.update.useMutation();
  const removeMutation = trpc.brandIntel.remove.useMutation();

  // For edit mode, load current signal
  const allQuery = trpc.brandIntel.listByBrand.useQuery(
    { brandId, limit: 200 },
    { enabled: mode === "edit", refetchOnWindowFocus: false }
  );
  const current = useMemo(() => {
    if (mode !== "edit" || !signalId) return null;
    return (allQuery.data as any[])?.find((s) => s.id === signalId) ?? null;
  }, [allQuery.data, signalId, mode]);

  const [type, setType] = useState<SignalType>(current?.type ?? "competitor");
  const [source, setSource] = useState(current?.source ?? "");
  const [headline, setHeadline] = useState(current?.headline ?? "");
  const [body, setBody] = useState(current?.body ?? "");
  const [url, setUrl] = useState(current?.url ?? "");
  const [relevance, setRelevance] = useState<Relevance>(current?.relevance ?? "medium");
  const [saving, setSaving] = useState(false);

  // Sync when edit data arrives
  React.useEffect(() => {
    if (current && mode === "edit") {
      setType(current.type);
      setSource(current.source);
      setHeadline(current.headline);
      setBody(current.body ?? "");
      setUrl(current.url ?? "");
      setRelevance(current.relevance);
    }
  }, [current?.id]);

  const valid = source.trim().length > 0 && headline.trim().length > 0;

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      if (mode === "create") {
        await createMutation.mutateAsync({
          brandId,
          type,
          source: source.trim(),
          headline: headline.trim(),
          body: body.trim() || undefined,
          url: url.trim() || undefined,
          relevance,
        });
      } else if (signalId) {
        await updateMutation.mutateAsync({
          id: signalId,
          type,
          source: source.trim(),
          headline: headline.trim(),
          body: body.trim() || undefined,
          url: url.trim() || undefined,
          relevance,
        });
      }
      await onSaved();
    } catch (err: any) {
      alert(err?.message ?? "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!signalId) return;
    if (!confirm("刪除這筆情報？此動作無法復原。")) return;
    try {
      await removeMutation.mutateAsync({ id: signalId });
      await onSaved();
    } catch (err: any) {
      alert(err?.message ?? "刪除失敗");
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(18,18,16,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 95,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 95vw)",
          maxHeight: "90vh",
          background: C.panelBg,
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
        }}
      >
        <div
          style={{
            padding: "14px 20px",
            borderBottom: `1px solid ${C.borderSoft}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {mode === "create" ? "新增情報" : "編輯情報"}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 16,
              color: C.textMuted,
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>
          <FieldLabel>類型</FieldLabel>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {(Object.keys(TYPE_META) as SignalType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 14,
                  fontSize: 12,
                  border: `1px solid ${type === t ? TYPE_META[t].color : C.border}`,
                  background: type === t ? TYPE_META[t].bg : "#fff",
                  color: type === t ? TYPE_META[t].color : C.textMuted,
                  cursor: "pointer",
                  fontWeight: type === t ? 600 : 400,
                }}
              >
                {TYPE_META[t].emoji} {TYPE_META[t].label}
              </button>
            ))}
          </div>

          <FieldLabel>來源 *</FieldLabel>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="例：元大投信官網、Financial Times、客戶訪談、Google Trends"
            style={textInputStyle}
          />

          <FieldLabel>標題 *</FieldLabel>
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="一句話講情報重點，例：元大推出 0050 ETF 定期定額 100 元起"
            style={textInputStyle}
          />

          <FieldLabel>內容（可選，越具體越好）</FieldLabel>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="貼原文摘錄、數據、你的觀察。AI 產生策略時會引用。"
            style={{ ...textInputStyle, resize: "vertical", fontFamily: "inherit" }}
          />

          <FieldLabel>URL（可選）</FieldLabel>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            style={textInputStyle}
          />

          <FieldLabel>相關度</FieldLabel>
          <div style={{ display: "flex", gap: 6 }}>
            {(Object.keys(REL_META) as Relevance[]).map((r) => (
              <button
                key={r}
                onClick={() => setRelevance(r)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  fontSize: 12,
                  border: `1px solid ${relevance === r ? C.accent : C.border}`,
                  background: relevance === r ? C.accentSoft : "#fff",
                  color: relevance === r ? C.accent : C.textMuted,
                  cursor: "pointer",
                  fontWeight: relevance === r ? 600 : 400,
                }}
              >
                {REL_META[r].label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 6, lineHeight: 1.55 }}>
            「⭐ 高」相關的情報會被 AI 優先引用到策略卡裡。
          </div>
        </div>

        <div
          style={{
            padding: "12px 20px",
            borderTop: `1px solid ${C.borderSoft}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#FBFBFA",
            borderRadius: "0 0 10px 10px",
          }}
        >
          <div>
            {mode === "edit" && (
              <button
                onClick={remove}
                style={{
                  background: "#fff",
                  color: C.danger,
                  border: `1px solid ${C.border}`,
                  padding: "8px 14px",
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                刪除
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                background: "#fff",
                color: C.textMuted,
                border: `1px solid ${C.border}`,
                padding: "8px 14px",
                borderRadius: 6,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              取消
            </button>
            <button
              onClick={save}
              disabled={!valid || saving}
              style={{
                background: valid && !saving ? C.accent : "#D9D7D2",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: valid && !saving ? "pointer" : "not-allowed",
              }}
            >
              {saving ? "儲存中…" : mode === "create" ? "新增" : "儲存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared bits ────────────────────────────────────────────────────────────
function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px",
        borderRadius: 14,
        fontSize: 12,
        border: `1px solid ${active ? C.accent : C.border}`,
        background: active ? C.accentSoft : "#fff",
        color: active ? C.accent : C.textMuted,
        cursor: "pointer",
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}

function EmptyState({
  onCreate,
  filtered,
}: {
  onCreate: () => void;
  filtered: boolean;
}) {
  return (
    <div
      style={{
        margin: "40px auto",
        maxWidth: 520,
        textAlign: "center",
        padding: "36px 28px",
        background: C.panelBg,
        border: `1px dashed ${C.border}`,
        borderRadius: 10,
      }}
    >
      <div style={{ fontSize: 36, marginBottom: 10 }}>📡</div>
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px" }}>
        {filtered ? "這個類別還沒有情報" : "這個品牌還沒有情報記錄"}
      </h3>
      <p style={{ fontSize: 12, color: C.textMuted, margin: "0 0 18px", lineHeight: 1.6 }}>
        {filtered
          ? "切換到其他類別或新增一筆試試。"
          : "記錄下第一筆競品動態或產業趨勢，AI 產出策略卡時就會引用。"}
      </p>
      <button
        onClick={onCreate}
        style={{
          background: C.accent,
          color: "#fff",
          border: "none",
          padding: "9px 16px",
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        + 新增第一筆情報
      </button>
    </div>
  );
}

function CenteredMessage({ text }: { text: string }) {
  return (
    <div style={{ padding: 40, textAlign: "center", color: C.textDim, fontSize: 13 }}>
      {text}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 5, marginTop: 10, letterSpacing: 0.3 }}>
      {children}
    </div>
  );
}

const textInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  fontSize: 13,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  boxSizing: "border-box",
  fontFamily: "inherit",
  marginBottom: 6,
  color: C.text,
  background: "#fff",
};

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}
