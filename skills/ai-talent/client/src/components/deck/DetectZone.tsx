/**
 * DetectZone — "偵測情報" tab of the Strategy Deck (Phase 2A + 2A Ext).
 *
 * Phase 2A     : manual signal entry, stored in brand_intel_signals,
 *                read by strategyDeck.autoFill for grounded LLM output.
 * Phase 2A Ext : auto-feed from sowork_db.market_data keyed by a per-brand
 *                watchlist (keywords + competitorNames + industryTags).
 *                Watchlist can be AI-suggested. Users pin interesting items
 *                into brand_intel_signals so they flow into autoFill.
 *
 * Layout (2-column, newsflow-inspired):
 *   ┌─ Header: title + watchlist button + manual add ─┐
 *   ├─ Left (2/3): 📡 自動情報 — auto-feed cards       │
 *   └─ Right (1/3): ✍️ 我的釘選 — saved signals         │
 *
 * Watchlist drawer slides in from right; AI suggestion button populates chips.
 */
import React, { useMemo, useState } from "react";
import { trpc } from "../../lib/trpc";
import { ToolCredDrawer } from "./ToolCredDrawer";

// ─── Tokens ────────────────────────────────────────────────────────────────
const C = {
  panelBg:    "#FFFFFF",
  bg:         "#F9F9F8",
  border:     "#E4E3E1",
  borderSoft: "#EDECEA",
  text:       "#1A1A18",
  textMuted:  "#6B6A64",
  textDim:    "#9B9990",
  accent:     "#E8631A",
  accentSoft: "#FDEFE3",
  accentFlow: "#FF5A1F",   // newsflow-style orange
  accentBg:   "#FFF0EB",
  danger:     "#C43F3F",
  heat: {
    extreme: { label: "極高熱度", color: "#C43F3F", bg: "#FCE8E8" },
    high:    { label: "高熱度",   color: "#E8631A", bg: "#FDEFE3" },
    medium:  { label: "中熱度",   color: "#C59A2E", bg: "#FAF3DC" },
    low:     { label: "低熱度",   color: "#6B6A64", bg: "#F1F0EE" },
  } as Record<"extreme" | "high" | "medium" | "low", { label: string; color: string; bg: string }>,
};

type SignalType = "competitor" | "trend" | "social" | "internal" | "manual";
type Relevance = "high" | "medium" | "low";
type FeedType = "competitor_news" | "trending_topic" | "social_trend";
type FeedFilter = "all" | FeedType;

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
const FEED_META: Record<FeedType, { label: string; emoji: string }> = {
  competitor_news: { label: "競品動態", emoji: "⚔️" },
  trending_topic:  { label: "市場熱點", emoji: "📈" },
  social_trend:    { label: "社群趨勢", emoji: "💬" },
};

// relevanceScore → heat bucket
function heatOf(score: number): keyof typeof C.heat {
  if (score >= 0.85) return "extreme";
  if (score >= 0.65) return "high";
  if (score >= 0.40) return "medium";
  return "low";
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}
function timeAgo(iso?: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, Date.now() - t);
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "剛剛";
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Date(iso).toISOString().slice(0, 10);
}

// ─── Main ──────────────────────────────────────────────────────────────────
export function DetectZone({ brandId }: { brandId: number }) {
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  const signalsQuery = trpc.brandIntel.listByBrand.useQuery(
    { brandId, limit: 100 },
    { refetchOnWindowFocus: false }
  );
  const watchlistQuery = trpc.brandIntel.getWatchlist.useQuery(
    { brandId },
    { refetchOnWindowFocus: false }
  );
  const feedQuery = trpc.brandIntel.feedAuto.useQuery(
    { brandId, days: 14, limit: 40 },
    { refetchOnWindowFocus: false }
  );

  const signals = (signalsQuery.data ?? []) as any[];
  const watchlist = watchlistQuery.data as any;
  const feedData = feedQuery.data as any;
  const feedItems = (feedData?.items ?? []) as any[];

  const filteredFeed = useMemo(() => {
    if (feedFilter === "all") return feedItems;
    return feedItems.filter((x) => x.type === feedFilter);
  }, [feedItems, feedFilter]);

  const feedCountByType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const x of feedItems) m[x.type] = (m[x.type] ?? 0) + 1;
    return m;
  }, [feedItems]);

  const pinnedMutation = trpc.brandIntel.pinFromAuto.useMutation();
  const [pinning, setPinning] = useState<string | null>(null);

  async function refetchAll() {
    await Promise.all([signalsQuery.refetch(), feedQuery.refetch(), watchlistQuery.refetch()]);
  }

  async function handlePin(item: any) {
    if (pinning) return;
    setPinning(item.key);
    try {
      await pinnedMutation.mutateAsync({
        brandId,
        type: item.type,
        title: item.title,
        content: item.content,
        source: item.source || "unknown",
        url: undefined,
        publishedAt: item.publishedAt || undefined,
      });
      await signalsQuery.refetch();
    } catch (e: any) {
      alert("釘選失敗：" + (e?.message ?? "未知錯誤"));
    } finally {
      setPinning(null);
    }
  }

  const hasWatchlist =
    (watchlist?.keywords?.length ?? 0) +
      (watchlist?.competitorNames?.length ?? 0) +
      (watchlist?.industryTags?.length ?? 0) > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Header ───────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>偵測情報</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            自動情報 + 我的釘選 → 即時餵進 AI 策略產生
          </div>
        </div>
        <button style={btnGhost} onClick={() => setToolsOpen(true)}>
          🔌 工具連線
        </button>
        <button style={btnGhost} onClick={() => setWatchlistOpen(true)}>
          🎯 關鍵字設定{hasWatchlist ? "" : " ·  建議"}
        </button>
        <button style={btnPrimary} onClick={() => setCreating(true)}>
          + 手動新增
        </button>
      </div>

      {/* ── 2-column body ────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* ── LEFT: Auto feed ─────────────────── */}
        <section style={pane}>
          <div style={paneHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>📡 自動情報</span>
              <span style={{ fontSize: 11, color: C.textMuted }}>
                過去 14 天 · 來源 sowork_db.market_data
              </span>
            </div>
            <button
              style={btnMini}
              onClick={() => feedQuery.refetch()}
              disabled={feedQuery.isFetching}
              title="重新抓取"
            >
              {feedQuery.isFetching ? "更新中…" : "🔄 刷新"}
            </button>
          </div>

          {/* Filter pills */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "4px 0 12px" }}>
            <FilterPill
              label={`全部 ${feedItems.length}`}
              active={feedFilter === "all"}
              onClick={() => setFeedFilter("all")}
            />
            {(Object.keys(FEED_META) as FeedType[]).map((t) => (
              <FilterPill
                key={t}
                label={`${FEED_META[t].emoji} ${FEED_META[t].label} ${feedCountByType[t] ?? 0}`}
                active={feedFilter === t}
                onClick={() => setFeedFilter(t)}
              />
            ))}
          </div>

          {/* Feed list */}
          {feedQuery.isLoading ? (
            <CenteredMessage text="載入情報中…" />
          ) : !hasWatchlist ? (
            <EmptyState
              title="尚未設定追蹤關鍵字"
              hint="點右上「關鍵字設定」→ 用 AI 建議一鍵填入"
              cta="🎯 開啟設定"
              onCta={() => setWatchlistOpen(true)}
            />
          ) : filteredFeed.length === 0 ? (
            <EmptyState
              title="這個分類近期沒有相關情報"
              hint="試試其他分類，或去設定補充關鍵字"
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredFeed.map((item: any) => (
                <AutoFeedCard
                  key={item.key}
                  item={item}
                  pinning={pinning === item.key}
                  onPin={() => handlePin(item)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── RIGHT: Pinned signals ──────────── */}
        <section style={pane}>
          <div style={paneHeader}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
              ✍️ 我的釘選 ({signals.length})
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, padding: "0 0 10px" }}>
            autoFill 會優先引用這些訊號
          </div>

          {signalsQuery.isLoading ? (
            <CenteredMessage text="載入中…" />
          ) : signals.length === 0 ? (
            <EmptyState
              title="尚未有釘選情報"
              hint="點左側卡片的 📌 釘選，或手動新增一筆"
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {signals.map((s: any) => (
                <SignalCardCompact
                  key={s.id}
                  signal={s}
                  onEdit={() => setEditingId(s.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Modals ──────────────────────────── */}
      {creating && (
        <SignalFormModal
          brandId={brandId}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await refetchAll();
          }}
        />
      )}
      {editingId !== null && (
        <SignalFormModal
          brandId={brandId}
          signal={signals.find((s: any) => s.id === editingId)}
          onClose={() => setEditingId(null)}
          onSaved={async () => {
            setEditingId(null);
            await refetchAll();
          }}
          onDeleted={async () => {
            setEditingId(null);
            await refetchAll();
          }}
        />
      )}
      {toolsOpen && (
        <ToolCredDrawer brandId={brandId} onClose={() => setToolsOpen(false)} />
      )}
      {watchlistOpen && (
        <WatchlistDrawer
          brandId={brandId}
          initial={watchlist}
          onClose={() => setWatchlistOpen(false)}
          onSaved={async () => {
            setWatchlistOpen(false);
            await refetchAll();
          }}
        />
      )}
    </div>
  );
}

// ─── AutoFeedCard (newsflow-style) ─────────────────────────────────────────
function AutoFeedCard({
  item,
  pinning,
  onPin,
}: {
  item: any;
  pinning: boolean;
  onPin: () => void;
}) {
  const heat = C.heat[heatOf(Number(item.relevanceScore ?? 0))];
  const feed = FEED_META[item.type as FeedType] ?? FEED_META.competitor_news;
  return (
    <div
      style={{
        background: C.panelBg,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        boxShadow: "0 1px 2px rgba(16,16,16,0.03)",
      }}
    >
      {/* top row: type badge + heat + time */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: C.accentFlow,
              background: C.accentBg,
              padding: "3px 8px",
              borderRadius: 6,
            }}
          >
            {feed.emoji} {feed.label}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: heat.color,
              background: heat.bg,
              padding: "3px 8px",
              borderRadius: 999,
            }}
          >
            {heat.label}
          </span>
        </div>
        <span style={{ fontSize: 11, color: C.textDim }}>{timeAgo(item.publishedAt)}</span>
      </div>

      {/* title */}
      <div
        style={{
          fontSize: 14.5,
          fontWeight: 700,
          color: C.text,
          lineHeight: 1.45,
        }}
      >
        {item.title}
      </div>

      {/* body */}
      {item.content && (
        <div
          style={{
            fontSize: 12.5,
            color: C.textMuted,
            lineHeight: 1.55,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {truncate(item.content, 300)}
        </div>
      )}

      {/* footer: source + pin */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11, color: C.textMuted }}>
          📰 {truncate(item.source, 40)}
        </span>
        <button
          style={{
            ...btnMini,
            color: pinning ? C.textMuted : C.accent,
            borderColor: C.accentSoft,
            background: pinning ? "#F5F5F4" : C.accentSoft,
          }}
          onClick={onPin}
          disabled={pinning}
          title="釘選到我的情報"
        >
          {pinning ? "釘選中…" : "📌 釘選"}
        </button>
      </div>
    </div>
  );
}

// ─── SignalCardCompact (right rail) ─────────────────────────────────────────
function SignalCardCompact({ signal, onEdit }: { signal: any; onEdit: () => void }) {
  const meta = TYPE_META[signal.type as SignalType] ?? TYPE_META.manual;
  const rel = REL_META[signal.relevance as Relevance] ?? REL_META.medium;
  return (
    <div
      style={{
        background: C.panelBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 10,
        padding: 10,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
      onClick={onEdit}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            color: meta.color,
            background: meta.bg,
            padding: "2px 6px",
            borderRadius: 5,
          }}
        >
          {meta.emoji} {meta.label}
        </span>
        <span style={{ fontSize: 10.5, color: rel.color }}>{rel.label}</span>
        <span style={{ marginLeft: "auto", fontSize: 10.5, color: C.textDim }}>
          {signal.capturedAt ? new Date(signal.capturedAt).toISOString().slice(5, 10) : ""}
        </span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.4 }}>
        {truncate(signal.headline, 80)}
      </div>
      {signal.source && (
        <div style={{ fontSize: 10.5, color: C.textMuted }}>{truncate(signal.source, 50)}</div>
      )}
    </div>
  );
}

// ─── WatchlistDrawer ──────────────────────────────────────────────────────
function WatchlistDrawer({
  brandId,
  initial,
  onClose,
  onSaved,
}: {
  brandId: number;
  initial: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords ?? []);
  const [competitorNames, setCompetitorNames] = useState<string[]>(initial?.competitorNames ?? []);
  const [industryTags, setIndustryTags] = useState<string[]>(initial?.industryTags ?? []);
  const [rationale, setRationale] = useState<string>("");
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggestion, setSuggestion] = useState<any>(null); // { keywords, competitorNames, industryTags }

  const suggestMut = trpc.brandIntel.suggestWatchlist.useMutation();
  const setMut = trpc.brandIntel.setWatchlist.useMutation();

  async function handleSuggest() {
    setSuggesting(true);
    try {
      const r = (await suggestMut.mutateAsync({ brandId })) as any;
      setSuggestion({
        keywords: r.keywords ?? [],
        competitorNames: r.competitorNames ?? [],
        industryTags: r.industryTags ?? [],
      });
      setRationale(r.rationale ?? "");
    } catch (e: any) {
      alert("AI 建議失敗：" + (e?.message ?? "未知錯誤"));
    } finally {
      setSuggesting(false);
    }
  }

  function applyAllSuggestions() {
    if (!suggestion) return;
    const merge = (cur: string[], add: string[]) => {
      const seen = new Set(cur.map((x) => x.toLowerCase()));
      const next = [...cur];
      for (const x of add) if (!seen.has(x.toLowerCase())) { next.push(x); seen.add(x.toLowerCase()); }
      return next;
    };
    setKeywords((prev) => merge(prev, suggestion.keywords));
    setCompetitorNames((prev) => merge(prev, suggestion.competitorNames));
    setIndustryTags((prev) => merge(prev, suggestion.industryTags));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await setMut.mutateAsync({ brandId, keywords, competitorNames, industryTags });
      onSaved();
    } catch (e: any) {
      alert("儲存失敗：" + (e?.message ?? "未知錯誤"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)",
        zIndex: 200, display: "flex", justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          height: "100%",
          background: C.panelBg,
          boxShadow: "-8px 0 24px rgba(0,0,0,0.12)",
          display: "flex", flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>🎯 關鍵字設定</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
              這裡設定的關鍵字會驅動左側自動情報流
            </div>
          </div>
          <button style={btnMini} onClick={onClose}>✕</button>
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
          {/* AI Suggest section */}
          <div
            style={{
              background: C.accentSoft,
              border: `1px dashed ${C.accent}`,
              borderRadius: 10,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>
                🤖 AI 建議追蹤名單
              </div>
              <button style={btnPrimary} onClick={handleSuggest} disabled={suggesting}>
                {suggesting ? "分析中…" : suggestion ? "重新建議" : "讓 AI 分析品牌"}
              </button>
            </div>
            {rationale && (
              <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.5 }}>
                {rationale}
              </div>
            )}
            {suggestion && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(["keywords", "competitorNames", "industryTags"] as const).map((k) => {
                  const items: string[] = suggestion[k] ?? [];
                  if (!items.length) return null;
                  const label = k === "keywords" ? "建議關鍵字"
                    : k === "competitorNames" ? "建議競品"
                    : "建議產業標籤";
                  return (
                    <div key={k}>
                      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>{label}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {items.map((x, i) => (
                          <button
                            key={i}
                            style={{
                              ...chipBase,
                              background: "#FFFFFF",
                              borderStyle: "dashed",
                              color: C.text,
                              cursor: "pointer",
                            }}
                            onClick={() => {
                              const setter = k === "keywords" ? setKeywords
                                : k === "competitorNames" ? setCompetitorNames
                                : setIndustryTags;
                              setter((prev) =>
                                prev.some((v) => v.toLowerCase() === x.toLowerCase())
                                  ? prev
                                  : [...prev, x]
                              );
                            }}
                            title="點擊加入下方名單"
                          >
                            + {x}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <button style={{ ...btnGhost, marginTop: 4, alignSelf: "flex-start" }} onClick={applyAllSuggestions}>
                  一鍵全部加入
                </button>
              </div>
            )}
          </div>

          {/* Edit sections */}
          <ChipEditor
            label="🔑 關鍵字"
            hint="產業術語、產品類型、趨勢名詞（非品牌自身的名字）"
            values={keywords}
            onChange={setKeywords}
          />
          <ChipEditor
            label="⚔️ 競品名稱"
            hint="真實品牌/公司名字，用來抓競品動態"
            values={competitorNames}
            onChange={setCompetitorNames}
          />
          <ChipEditor
            label="🏷️ 產業標籤"
            hint="用於篩選同產業趨勢"
            values={industryTags}
            onChange={setIndustryTags}
          />
        </div>

        {/* footer */}
        <div
          style={{
            borderTop: `1px solid ${C.border}`,
            padding: "12px 20px",
            display: "flex", justifyContent: "flex-end", gap: 8,
          }}
        >
          <button style={btnGhost} onClick={onClose}>取消</button>
          <button style={btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? "儲存中…" : "儲存"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChipEditor({
  label,
  hint,
  values,
  onChange,
}: {
  label: string;
  hint: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [input, setInput] = useState("");
  function add() {
    const v = input.trim();
    if (!v) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) { setInput(""); return; }
    onChange([...values, v]);
    setInput("");
  }
  function remove(idx: number) {
    onChange(values.filter((_, i) => i !== idx));
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</div>
      <div style={{ fontSize: 11, color: C.textMuted }}>{hint}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {values.map((v, i) => (
          <span key={i} style={{ ...chipBase, background: C.accentSoft, color: C.accent }}>
            {v}
            <button
              onClick={() => remove(i)}
              style={{
                marginLeft: 6, border: "none", background: "transparent",
                color: C.accent, cursor: "pointer", fontSize: 12, lineHeight: 1,
              }}
              title="移除"
            >✕</button>
          </span>
        ))}
        {!values.length && <span style={{ fontSize: 11, color: C.textDim }}>尚未新增</span>}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="輸入後按 Enter 加入"
          style={inputStyle}
        />
        <button style={btnMini} onClick={add}>加入</button>
      </div>
    </div>
  );
}

// ─── SignalFormModal ──────────────────────────────────────────────────────
function SignalFormModal({
  brandId,
  signal,
  onClose,
  onSaved,
  onDeleted,
}: {
  brandId: number;
  signal?: any;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const editing = !!signal;
  const [type, setType] = useState<SignalType>((signal?.type as SignalType) ?? "competitor");
  const [source, setSource] = useState<string>(signal?.source ?? "");
  const [headline, setHeadline] = useState<string>(signal?.headline ?? "");
  const [body, setBody] = useState<string>(signal?.body ?? "");
  const [url, setUrl] = useState<string>(signal?.url ?? "");
  const [relevance, setRelevance] = useState<Relevance>((signal?.relevance as Relevance) ?? "medium");
  const [busy, setBusy] = useState(false);

  const createMut = trpc.brandIntel.create.useMutation();
  const updateMut = trpc.brandIntel.update.useMutation();
  const removeMut = trpc.brandIntel.remove.useMutation();

  async function handleSave() {
    if (!source.trim() || !headline.trim()) {
      alert("請填寫來源與標題");
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await updateMut.mutateAsync({
          id: signal.id, type, source: source.trim(), headline: headline.trim(),
          body: body.trim() || undefined, url: url.trim() || undefined, relevance,
        });
      } else {
        await createMut.mutateAsync({
          brandId, type, source: source.trim(), headline: headline.trim(),
          body: body.trim() || undefined, url: url.trim() || undefined, relevance,
        });
      }
      onSaved();
    } catch (e: any) {
      alert("儲存失敗：" + (e?.message ?? "未知錯誤"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    if (!confirm("確定刪除這筆情報？")) return;
    setBusy(true);
    try {
      await removeMut.mutateAsync({ id: signal.id });
      onDeleted?.();
    } catch (e: any) {
      alert("刪除失敗：" + (e?.message ?? "未知錯誤"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.42)",
        zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(520px, 100%)", background: C.panelBg, borderRadius: 14,
          padding: 20, display: "flex", flexDirection: "column", gap: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
          {editing ? "編輯情報" : "新增情報"}
        </div>

        <FieldLabel label="類型">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {(Object.keys(TYPE_META) as SignalType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                style={{
                  ...chipBase,
                  background: type === t ? TYPE_META[t].bg : "#FFFFFF",
                  color: type === t ? TYPE_META[t].color : C.textMuted,
                  borderColor: type === t ? TYPE_META[t].color : C.border,
                  cursor: "pointer",
                }}
              >
                {TYPE_META[t].emoji} {TYPE_META[t].label}
              </button>
            ))}
          </div>
        </FieldLabel>

        <FieldLabel label="來源 *">
          <input
            style={inputStyle}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="例如：TechCrunch, 自家電商後台, 某某競品官網"
          />
        </FieldLabel>
        <FieldLabel label="標題 *">
          <input
            style={inputStyle}
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="一句話描述這個情報點"
          />
        </FieldLabel>
        <FieldLabel label="內文（選填）">
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="關鍵數字、引述、日期、細節"
          />
        </FieldLabel>
        <FieldLabel label="URL（選填）">
          <input
            style={inputStyle}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
          />
        </FieldLabel>
        <FieldLabel label="重要度">
          <div style={{ display: "flex", gap: 4 }}>
            {(Object.keys(REL_META) as Relevance[]).map((r) => (
              <button
                key={r}
                onClick={() => setRelevance(r)}
                style={{
                  ...chipBase,
                  background: relevance === r ? C.accentSoft : "#FFFFFF",
                  color: relevance === r ? C.accent : C.textMuted,
                  borderColor: relevance === r ? C.accent : C.border,
                  cursor: "pointer",
                }}
              >
                {REL_META[r].label}
              </button>
            ))}
          </div>
        </FieldLabel>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
          <div>
            {editing && (
              <button
                style={{ ...btnGhost, color: C.danger, borderColor: "#F5D1D1" }}
                onClick={handleDelete}
                disabled={busy}
              >
                刪除
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btnGhost} onClick={onClose} disabled={busy}>取消</button>
            <button style={btnPrimary} onClick={handleSave} disabled={busy}>
              {busy ? "儲存中…" : "儲存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11.5,
        padding: "5px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? C.accent : C.border}`,
        background: active ? C.accentSoft : "#FFFFFF",
        color: active ? C.accent : C.textMuted,
        cursor: "pointer",
        fontWeight: active ? 600 : 500,
      }}
    >
      {label}
    </button>
  );
}
function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: C.textMuted }}>{label}</div>
      {children}
    </div>
  );
}
function EmptyState({ title, hint, cta, onCta }: { title: string; hint?: string; cta?: string; onCta?: () => void }) {
  return (
    <div
      style={{
        border: `1px dashed ${C.border}`,
        background: C.bg,
        borderRadius: 12,
        padding: "24px 16px",
        textAlign: "center",
        color: C.textMuted,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{title}</div>
      {hint && <div style={{ fontSize: 11.5 }}>{hint}</div>}
      {cta && onCta && (
        <button style={{ ...btnPrimary, marginTop: 6 }} onClick={onCta}>{cta}</button>
      )}
    </div>
  );
}
function CenteredMessage({ text }: { text: string }) {
  return (
    <div style={{ padding: 24, textAlign: "center", color: C.textMuted, fontSize: 12.5 }}>
      {text}
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const pane: React.CSSProperties = {
  background: C.panelBg,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  padding: 16,
  display: "flex",
  flexDirection: "column",
};
const paneHeader: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
};
const btnPrimary: React.CSSProperties = {
  padding: "7px 14px", borderRadius: 8, border: "none",
  background: C.accent, color: "#FFFFFF", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
  background: "#FFFFFF", color: C.text, fontSize: 12.5, cursor: "pointer",
};
const btnMini: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
  background: "#FFFFFF", color: C.text, fontSize: 11, cursor: "pointer",
};
const inputStyle: React.CSSProperties = {
  flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
  fontSize: 13, color: C.text, background: "#FFFFFF", outline: "none",
  fontFamily: "inherit",
};
const chipBase: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 2,
  fontSize: 11.5, padding: "4px 10px", borderRadius: 999,
  border: `1px solid ${C.border}`, background: "#FFFFFF", color: C.text,
};
