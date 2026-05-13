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
import { useLang } from "../../lib/i18n";

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

const TYPE_META: Record<SignalType, { label: string; labelEn: string; emoji: string; color: string; bg: string }> = {
  competitor: { label: "競品動態", labelEn: "Competitor move", emoji: "⚔️", color: "#B0410B", bg: "#FDEFE3" },
  trend:      { label: "產業趨勢", labelEn: "Industry trend",  emoji: "📈", color: "#1B5FA1", bg: "#E6F0FB" },
  social:     { label: "社群聲量", labelEn: "Social buzz",     emoji: "💬", color: "#6E3BA4", bg: "#F1EAFA" },
  internal:   { label: "內部數據", labelEn: "Internal data",   emoji: "📊", color: "#2B8A3E", bg: "#E7F5EB" },
  manual:     { label: "手動記錄", labelEn: "Manual note",     emoji: "📝", color: "#6B6A64", bg: "#F1F0EE" },
};
const REL_META: Record<Relevance, { label: string; labelEn: string; color: string }> = {
  high:   { label: "⭐ 高", labelEn: "⭐ High", color: "#C59A2E" },
  medium: { label: "中",   labelEn: "Medium",  color: "#6B6A64" },
  low:    { label: "低",   labelEn: "Low",     color: "#9B9990" },
};
const FEED_META: Record<FeedType, { label: string; labelEn: string; emoji: string }> = {
  competitor_news: { label: "競品動態", labelEn: "Competitor news", emoji: "⚔️" },
  trending_topic:  { label: "市場熱點", labelEn: "Market trends",    emoji: "📈" },
  social_trend:    { label: "社群趨勢", labelEn: "Social trends",    emoji: "💬" },
};
const HEAT_LABEL_EN: Record<"extreme" | "high" | "medium" | "low", string> = {
  extreme: "Very hot",
  high: "Hot",
  medium: "Warm",
  low: "Quiet",
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
const SCOUT_LABELS: Record<string, string> = {
  "perplexity": "Perplexity",
  "google-news": "Google 新聞",
  "google-trends": "Google 趨勢",
  "ahrefs": "Ahrefs",
  "similarweb": "Similarweb",
  "semrush": "SEMrush",
  "youtube-data": "YouTube",
  "reddit": "Reddit",
  "opview": "Opview",
  "meltwater": "Meltwater",
  "gwi": "GWI",
};
function scoutLabel(id: string): string {
  return SCOUT_LABELS[id] ?? id;
}

function timeAgo(iso: string | undefined, lang: "zh-TW" | "en" = "zh-TW"): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, Date.now() - t);
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return lang === "en" ? "Just now" : "剛剛";
  if (hours < 24) return lang === "en" ? `${hours}h ago` : `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return lang === "en" ? `${days}d ago` : `${days} 天前`;
  return new Date(iso).toISOString().slice(0, 10);
}

// ─── Main ──────────────────────────────────────────────────────────────────
export function DetectZone({ brandId }: { brandId: number }) {
  const { t, lang } = useLang();
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
  const feedSource: string | undefined = feedData?.source;
  const feedKeywordsUsed: string[] = (feedData?.keywords ?? []) as string[];
  const feedScouts: Array<{ id: string; ok: boolean; count: number; elapsedMs: number; skipped?: string; error?: string }> =
    (feedData?.scouts ?? []) as any[];
  const availableScouts: number = feedData?.availableScouts ?? 0;
  const authedScouts: number = feedData?.authedScouts ?? 0;
  const unauthedScouts: Array<{ id: string; label: string; tier: string; requiredTool?: string }> =
    (feedData?.unauthedScouts ?? []) as any[];

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
        url: item.url || undefined,
        publishedAt: item.publishedAt || undefined,
      });
      await signalsQuery.refetch();
    } catch (e: any) {
      alert((lang === "en" ? "Pin failed: " : "釘選失敗：") + (e?.message ?? (lang === "en" ? "Unknown error" : "未知錯誤")));
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
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{lang === "en" ? "Detect intel" : "偵測情報"}</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            {lang === "en" ? "Auto intel + your pins → fed straight into AI strategy" : "自動情報 + 我的釘選 → 即時餵進 AI 策略產生"}
          </div>
        </div>
        <button style={btnGhost} onClick={() => setToolsOpen(true)}>
          {lang === "en" ? "🔌 Connect tools" : "🔌 工具連線"}
        </button>
        <button style={btnGhost} onClick={() => setWatchlistOpen(true)}>
          {lang === "en" ? `🎯 Keywords${hasWatchlist ? "" : " · suggest"}` : `🎯 關鍵字設定${hasWatchlist ? "" : " ·  建議"}`}
        </button>
        <button style={btnPrimary} onClick={() => setCreating(true)}>
          {lang === "en" ? "+ Add manually" : "+ 手動新增"}
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
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{lang === "en" ? "📡 Auto intel" : "📡 自動情報"}</span>
              <span style={{ fontSize: 11, color: C.textMuted }}>
                {lang === "en" ? `Live pulls from multiple sources · ${authedScouts}/${availableScouts} scouts on duty` : `多來源即時抓取 · ${authedScouts}/${availableScouts} 個情報員上工`}
              </span>
            </div>
            <button
              style={btnMini}
              onClick={() => feedQuery.refetch()}
              disabled={feedQuery.isFetching}
              title={lang === "en" ? "Re-fetch" : "重新抓取"}
            >
              {feedQuery.isFetching ? (lang === "en" ? "Updating…" : "更新中…") : (lang === "en" ? "🔄 Refresh" : "🔄 刷新")}
            </button>
          </div>

          {/* Filter pills */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "4px 0 12px" }}>
            <FilterPill
              label={lang === "en" ? `All ${feedItems.length}` : `全部 ${feedItems.length}`}
              active={feedFilter === "all"}
              onClick={() => setFeedFilter("all")}
            />
            {(Object.keys(FEED_META) as FeedType[]).map((ft) => (
              <FilterPill
                key={ft}
                label={`${FEED_META[ft].emoji} ${lang === "en" ? FEED_META[ft].labelEn : FEED_META[ft].label} ${feedCountByType[ft] ?? 0}`}
                active={feedFilter === ft}
                onClick={() => setFeedFilter(ft)}
              />
            ))}
          </div>

          {/* Feed status strip (debug-friendly) */}
          {!feedQuery.isLoading && hasWatchlist && (
            <div
              style={{
                fontSize: 11,
                color: feedSource === "error" ? C.danger : C.textMuted,
                padding: "0 0 8px",
              }}
            >
              {feedSource === "scouts" && (
                <span style={{ color: "#2B8A3E" }}>
                  {lang === "en" ? `✓ ${feedItems.length} items` : `✓ 共 ${feedItems.length} 筆`}
                  {feedData?.cached ? (lang === "en" ? " (cached)" : "（快取）") : ""}
                  {" · "}
                  {feedScouts.filter((s) => s.ok).map((s) => `${scoutLabel(s.id)} ${s.count}`).join(" / ")}
                </span>
              )}
              {feedSource === "empty-scouts" && (
                <span>
                  {lang === "en" ? "Scouts on duty but no hits — try tweaking your keywords" : "情報員都有上工但沒抓到資料 · 試著調整關鍵字"}
                </span>
              )}
              {feedSource === "empty-watchlist" && <span>{lang === "en" ? "Watchlist is empty — open Keywords to add some" : "watchlist 空的 — 去「關鍵字設定」加入"}</span>}
              {feedSource === "error" && (
                <span>{lang === "en" ? `❌ Fetch failed (${feedData?.error ?? "check server log"})` : `❌ 抓取失敗（${feedData?.error ?? "看 server log"}）`}</span>
              )}
              {feedSource === "none" && <span>{lang === "en" ? "DB not connected" : "DB 未連線"}</span>}
              {feedSource === undefined && <span>—</span>}
            </div>
          )}

          {/* Connect-more-tools nudge */}
          {!feedQuery.isLoading && hasWatchlist && unauthedScouts.length > 0 && (
            <div
              style={{
                fontSize: 11.5,
                color: C.textMuted,
                background: C.accentSoft,
                border: `1px dashed ${C.accent}`,
                borderRadius: 8,
                padding: "8px 10px",
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span style={{ color: C.accent, fontWeight: 600 }}>{lang === "en" ? "💡 Connect more tools for deeper intel:" : "💡 連更多工具、抓更深情報："}</span>
              <span>
                {lang === "en"
                  ? `${unauthedScouts.length} more scouts waiting for access (${unauthedScouts.map((u) => scoutLabel(u.id)).join(", ")})`
                  : `目前還有 ${unauthedScouts.length} 個情報員待授權（${unauthedScouts.map((u) => scoutLabel(u.id)).join("、")}）`}
              </span>
              <button
                style={{ ...btnMini, borderColor: C.accent, color: C.accent, marginLeft: "auto" }}
                onClick={() => setToolsOpen(true)}
              >
                {lang === "en" ? "🔌 Connect" : "🔌 去連線"}
              </button>
            </div>
          )}

          {/* Feed list */}
          {feedQuery.isLoading ? (
            <CenteredMessage text={lang === "en" ? "Loading intel…" : "載入情報中…"} />
          ) : feedQuery.isError ? (
            <EmptyState
              title={lang === "en" ? "Couldn't fetch intel" : "情報抓取失敗"}
              hint={(feedQuery.error as any)?.message ?? (lang === "en" ? "Retry, or check the server log" : "請重試或檢查 server log")}
              cta={lang === "en" ? "🔄 Retry" : "🔄 重試"}
              onCta={() => feedQuery.refetch()}
            />
          ) : !hasWatchlist ? (
            <EmptyState
              title={lang === "en" ? "No tracking keywords yet" : "尚未設定追蹤關鍵字"}
              hint={lang === "en" ? "Tap Keywords on the top right → let AI suggest some in one click" : "點右上「關鍵字設定」→ 用 AI 建議一鍵填入"}
              cta={lang === "en" ? "🎯 Open settings" : "🎯 開啟設定"}
              onCta={() => setWatchlistOpen(true)}
            />
          ) : feedSource === "error" ? (
            <EmptyState
              title={lang === "en" ? "Couldn't fetch intel" : "情報抓取失敗"}
              hint={(feedData?.error as string) ?? (lang === "en" ? `${feedKeywordsUsed.length} keywords sent but the orchestrator errored` : `${feedKeywordsUsed.length} 個關鍵字已送出但 orchestrator 報錯`)}
              cta={lang === "en" ? "🔄 Retry" : "🔄 重試"}
              onCta={() => feedQuery.refetch()}
            />
          ) : filteredFeed.length === 0 ? (
            <EmptyState
              title={feedItems.length === 0
                ? (lang === "en" ? "No matching intel in the last 14 days" : "近 14 天沒有匹配關鍵字的情報")
                : (lang === "en" ? "Nothing recent in this category" : "這個分類近期沒有相關情報")}
              hint={
                feedItems.length === 0
                  ? (lang === "en" ? `Searched ${feedKeywordsUsed.length} keywords — try adding broader industry terms` : `已搜尋 ${feedKeywordsUsed.length} 個關鍵字 · 試著加入更通用的產業詞`)
                  : (lang === "en" ? "Try another category, or add more keywords" : "試試其他分類，或去設定補充關鍵字")
              }
              cta={lang === "en" ? "🎯 Tweak keywords" : "🎯 調整關鍵字"}
              onCta={() => setWatchlistOpen(true)}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredFeed.map((item: any) => (
                <AutoFeedCard
                  key={item.key}
                  item={item}
                  pinning={pinning === item.key}
                  onPin={() => handlePin(item)}
                  lang={lang}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── RIGHT: Pinned signals ──────────── */}
        <section style={pane}>
          <div style={paneHeader}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
              {lang === "en" ? `✍️ My pins (${signals.length})` : `✍️ 我的釘選 (${signals.length})`}
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, padding: "0 0 10px" }}>
            {lang === "en" ? "autoFill prioritizes these signals" : "autoFill 會優先引用這些訊號"}
          </div>

          {signalsQuery.isLoading ? (
            <CenteredMessage text={lang === "en" ? "Loading…" : "載入中…"} />
          ) : signals.length === 0 ? (
            <EmptyState
              title={lang === "en" ? "No pinned intel yet" : "尚未有釘選情報"}
              hint={lang === "en" ? "Tap 📌 on a card on the left, or add one manually" : "點左側卡片的 📌 釘選，或手動新增一筆"}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {signals.map((s: any) => (
                <SignalCardCompact
                  key={s.id}
                  signal={s}
                  onEdit={() => setEditingId(s.id)}
                  lang={lang}
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
  lang,
}: {
  item: any;
  pinning: boolean;
  onPin: () => void;
  lang: "zh-TW" | "en";
}) {
  const heatKey = heatOf(Number(item.relevanceScore ?? 0));
  const heat = C.heat[heatKey];
  const heatLabel = lang === "en" ? HEAT_LABEL_EN[heatKey] : heat.label;
  const feed = FEED_META[item.type as FeedType] ?? FEED_META.competitor_news;
  const feedLabel = lang === "en" ? feed.labelEn : feed.label;
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
            {feed.emoji} {feedLabel}
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
            {heatLabel}
          </span>
        </div>
        <span style={{ fontSize: 11, color: C.textDim }}>{timeAgo(item.publishedAt, lang)}</span>
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
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: C.accent, textDecoration: "none" }}
            title={item.url}
          >
            📰 {truncate(item.source, 40)} ↗
          </a>
        ) : (
          <span style={{ fontSize: 11, color: C.textMuted }}>
            📰 {truncate(item.source, 40)}
          </span>
        )}
        <button
          style={{
            ...btnMini,
            color: pinning ? C.textMuted : C.accent,
            borderColor: C.accentSoft,
            background: pinning ? "#F5F5F4" : C.accentSoft,
          }}
          onClick={onPin}
          disabled={pinning}
          title={lang === "en" ? "Pin to my intel" : "釘選到我的情報"}
        >
          {pinning ? (lang === "en" ? "Pinning…" : "釘選中…") : (lang === "en" ? "📌 Pin" : "📌 釘選")}
        </button>
      </div>
    </div>
  );
}

// ─── SignalCardCompact (right rail) ─────────────────────────────────────────
function SignalCardCompact({ signal, onEdit, lang }: { signal: any; onEdit: () => void; lang: "zh-TW" | "en" }) {
  const meta = TYPE_META[signal.type as SignalType] ?? TYPE_META.manual;
  const rel = REL_META[signal.relevance as Relevance] ?? REL_META.medium;
  const metaLabel = lang === "en" ? meta.labelEn : meta.label;
  const relLabel = lang === "en" ? rel.labelEn : rel.label;
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
          {meta.emoji} {metaLabel}
        </span>
        <span style={{ fontSize: 10.5, color: rel.color }}>{relLabel}</span>
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
  const { lang } = useLang();
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
      alert((lang === "en" ? "AI suggestion failed: " : "AI 建議失敗：") + (e?.message ?? (lang === "en" ? "Unknown error" : "未知錯誤")));
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
      alert((lang === "en" ? "Save failed: " : "儲存失敗：") + (e?.message ?? (lang === "en" ? "Unknown error" : "未知錯誤")));
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
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{lang === "en" ? "🎯 Keywords" : "🎯 關鍵字設定"}</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
              {lang === "en" ? "These keywords drive the auto-intel feed on the left" : "這裡設定的關鍵字會驅動左側自動情報流"}
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
                {lang === "en" ? "🤖 AI-suggested watchlist" : "🤖 AI 建議追蹤名單"}
              </div>
              <button style={btnPrimary} onClick={handleSuggest} disabled={suggesting}>
                {suggesting ? (lang === "en" ? "Analyzing…" : "分析中…") : suggestion ? (lang === "en" ? "Suggest again" : "重新建議") : (lang === "en" ? "Let AI scan your brand" : "讓 AI 分析品牌")}
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
                  const label = lang === "en"
                    ? (k === "keywords" ? "Suggested keywords"
                        : k === "competitorNames" ? "Suggested competitors"
                        : "Suggested industry tags")
                    : (k === "keywords" ? "建議關鍵字"
                        : k === "competitorNames" ? "建議競品"
                        : "建議產業標籤");
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
                            title={lang === "en" ? "Tap to add" : "點擊加入下方名單"}
                          >
                            + {x}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <button style={{ ...btnGhost, marginTop: 4, alignSelf: "flex-start" }} onClick={applyAllSuggestions}>
                  {lang === "en" ? "Add all in one click" : "一鍵全部加入"}
                </button>
              </div>
            )}
          </div>

          {/* Edit sections */}
          <ChipEditor
            label={lang === "en" ? "🔑 Keywords" : "🔑 關鍵字"}
            hint={lang === "en" ? "Industry terms, product types, trend words (not your own brand name)" : "產業術語、產品類型、趨勢名詞（非品牌自身的名字）"}
            values={keywords}
            onChange={setKeywords}
          />
          <ChipEditor
            label={lang === "en" ? "⚔️ Competitor names" : "⚔️ 競品名稱"}
            hint={lang === "en" ? "Real brand or company names — used to fetch competitor news" : "真實品牌/公司名字，用來抓競品動態"}
            values={competitorNames}
            onChange={setCompetitorNames}
          />
          <ChipEditor
            label={lang === "en" ? "🏷️ Industry tags" : "🏷️ 產業標籤"}
            hint={lang === "en" ? "Used to filter same-industry trends" : "用於篩選同產業趨勢"}
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
          <button style={btnGhost} onClick={onClose}>{lang === "en" ? "Cancel" : "取消"}</button>
          <button style={btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? (lang === "en" ? "Saving…" : "儲存中…") : (lang === "en" ? "Save" : "儲存")}
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
  const { lang } = useLang();
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
              title={lang === "en" ? "Remove" : "移除"}
            >✕</button>
          </span>
        ))}
        {!values.length && <span style={{ fontSize: 11, color: C.textDim }}>{lang === "en" ? "Nothing added yet" : "尚未新增"}</span>}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={lang === "en" ? "Type and press Enter to add" : "輸入後按 Enter 加入"}
          style={inputStyle}
        />
        <button style={btnMini} onClick={add}>{lang === "en" ? "Add" : "加入"}</button>
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
  const { lang } = useLang();
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
      alert(lang === "en" ? "Please fill in source and title" : "請填寫來源與標題");
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
      alert((lang === "en" ? "Save failed: " : "儲存失敗：") + (e?.message ?? (lang === "en" ? "Unknown error" : "未知錯誤")));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    if (!confirm(lang === "en" ? "Delete this signal?" : "確定刪除這筆情報？")) return;
    setBusy(true);
    try {
      await removeMut.mutateAsync({ id: signal.id });
      onDeleted?.();
    } catch (e: any) {
      alert((lang === "en" ? "Delete failed: " : "刪除失敗：") + (e?.message ?? (lang === "en" ? "Unknown error" : "未知錯誤")));
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
          {editing ? (lang === "en" ? "Edit signal" : "編輯情報") : (lang === "en" ? "Add signal" : "新增情報")}
        </div>

        <FieldLabel label={lang === "en" ? "Type" : "類型"}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {(Object.keys(TYPE_META) as SignalType[]).map((tt) => (
              <button
                key={tt}
                onClick={() => setType(tt)}
                style={{
                  ...chipBase,
                  background: type === tt ? TYPE_META[tt].bg : "#FFFFFF",
                  color: type === tt ? TYPE_META[tt].color : C.textMuted,
                  borderColor: type === tt ? TYPE_META[tt].color : C.border,
                  cursor: "pointer",
                }}
              >
                {TYPE_META[tt].emoji} {lang === "en" ? TYPE_META[tt].labelEn : TYPE_META[tt].label}
              </button>
            ))}
          </div>
        </FieldLabel>

        <FieldLabel label={lang === "en" ? "Source *" : "來源 *"}>
          <input
            style={inputStyle}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder={lang === "en" ? "e.g. TechCrunch, your ecom backend, a competitor's site" : "例如：TechCrunch, 自家電商後台, 某某競品官網"}
          />
        </FieldLabel>
        <FieldLabel label={lang === "en" ? "Title *" : "標題 *"}>
          <input
            style={inputStyle}
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder={lang === "en" ? "One line that captures the signal" : "一句話描述這個情報點"}
          />
        </FieldLabel>
        <FieldLabel label={lang === "en" ? "Body (optional)" : "內文（選填）"}>
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={lang === "en" ? "Key numbers, quotes, dates, details" : "關鍵數字、引述、日期、細節"}
          />
        </FieldLabel>
        <FieldLabel label={lang === "en" ? "URL (optional)" : "URL（選填）"}>
          <input
            style={inputStyle}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
          />
        </FieldLabel>
        <FieldLabel label={lang === "en" ? "Relevance" : "重要度"}>
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
                {lang === "en" ? REL_META[r].labelEn : REL_META[r].label}
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
                {lang === "en" ? "Delete" : "刪除"}
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btnGhost} onClick={onClose} disabled={busy}>{lang === "en" ? "Cancel" : "取消"}</button>
            <button style={btnPrimary} onClick={handleSave} disabled={busy}>
              {busy ? (lang === "en" ? "Saving…" : "儲存中…") : (lang === "en" ? "Save" : "儲存")}
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
