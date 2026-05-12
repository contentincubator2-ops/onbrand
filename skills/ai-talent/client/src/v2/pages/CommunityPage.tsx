/**
 * CommunityPage — Spotify-style template marketplace.
 *
 * 2026-05-11 (CJ「Spotify 模式，大家貢獻範本」).
 *
 * Layout:
 *   Canonical hero (eyebrow / gradient title / serif subtitle / 適合 line)
 *   Filter bar: sort × kind × tier × platform × search
 *   Card grid: title / preview blurb / author / use·like counts
 *   Click → detail modal with content body + 使用此模板 / ❤️ like / 公開連結
 */
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { useLang } from "../../lib/i18n";
import { Heart, Sparkles, TrendingUp, Search, X, ExternalLink } from "lucide-react";

type Sort = "trending" | "newest" | "most-used" | "most-liked";
type Kind = "caption" | "campaign" | "positioning" | "prompt" | "all";
/** 2026-05-11 (CJ refocus): primary use case = personal collection;
 *  community sharing is secondary. Tabs reflect that hierarchy. */
type View = "mine" | "community";

interface TemplateRow {
  /** 2026-05-11 — gallery is a UNION across two canonical tables.
   *  source="template" → community_templates (lightweight caption / snippet)
   *  source="squad"    → squads (full methodology + team + steps)
   *  Both surface the same shape so cards render identically. */
  source: "template" | "squad";
  id: number;
  authorUserId: number | null;
  authorName: string | null;
  title: string;
  description: string | null;
  kind: string;
  tier: string | null;
  platform: string | null;
  taskId: string | null;
  tags: string[] | null;
  previewText: string | null;
  previewImageUrl: string | null;
  featured: number;
  useCount: number;
  likeCount: number;
  trendingScore?: number;
  createdAt: string;
}

const KIND_LABELS_ZH: Record<string, string> = {
  caption: "貼文",
  campaign: "Campaign",
  positioning: "定位",
  prompt: "Prompt",
  all: "全部",
};
const KIND_LABELS_EN: Record<string, string> = {
  caption: "Post",
  campaign: "Campaign",
  positioning: "Positioning",
  prompt: "Prompt",
  all: "All",
};
const KIND_LABELS_LIST: Kind[] = ["all", "caption", "campaign", "positioning", "prompt"];

export default function CommunityPage() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const KIND_LABELS = lang === "en" ? KIND_LABELS_EN : KIND_LABELS_ZH;
  const [view, setView] = useState<View>("mine");
  const [sort, setSort] = useState<Sort>("trending");
  const [kind, setKind] = useState<Kind>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  // Community: other users' public templates
  const communityQ = (trpc as any).community?.list?.useQuery?.(
    {
      limit: 60,
      sort,
      kind: kind === "all" ? undefined : kind,
      search: search.trim() || undefined,
    },
    { enabled: view === "community", refetchOnWindowFocus: false, staleTime: 30_000 },
  );

  // Mine: my own private + public templates (the primary use case)
  const mineQ = (trpc as any).community?.myList?.useQuery?.(
    { limit: 100, sort: sort === "newest" ? "newest" : "most-used", filter: "all" },
    { enabled: view === "mine", refetchOnWindowFocus: false, staleTime: 30_000 },
  );

  const list: TemplateRow[] = view === "mine" ? (mineQ?.data ?? []) : (communityQ?.data ?? []);
  const featured = useMemo(() => list.filter((t) => t.featured), [list]);
  const regular = useMemo(() => list.filter((t) => !t.featured), [list]);
  const listQ = view === "mine" ? mineQ : communityQ;

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFA" }}>
      {/* Hero */}
      <div className="relative pt-10 pb-6 px-6 text-center">
        <div className="relative z-10 flex flex-col items-center max-w-[1100px] mx-auto">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-default-600 mb-3">
            {view === "mine" ? "MY TEMPLATES · COLLECTION" : "COMMUNITY · CONTRIBUTIONS"}
          </p>
          <h1
            className="font-semibold tracking-tight leading-tight"
            style={{
              fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
              background: "linear-gradient(135deg, #00b4bc 0%, #7c3aed 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {view === "mine"
              ? (lang === "en" ? "Your saved winners" : "你的成功作品收藏")
              : (lang === "en" ? "Templates shared by others" : "別人公開的範本")}
          </h1>
          <p
            className="mt-3 mx-auto text-default-700"
            style={{
              fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
              fontStyle: "italic", fontSize: 14, lineHeight: 1.7, maxWidth: 640,
            }}
          >
            {view === "mine"
              ? (lang === "en" ? "Save your high-performing posts and reuse them next time" : "把互動好的貼文存下來，下次同類型內容直接套用")
              : (lang === "en" ? "Templates other operators have shared — browse, save, and reuse" : "別的操盤者貢獻的成功範本 — 你可以參考、收藏、套用")}
          </p>
          <p
            className="mt-2 mx-auto text-default-700"
            style={{ fontSize: 12, lineHeight: 1.55, maxWidth: 640, letterSpacing: "0.02em" }}
          >
            <span style={{ fontWeight: 600, color: "#171717", marginRight: 6 }}>
              {view === "mine"
                ? (lang === "en" ? "How to build:" : "如何累積：")
                : (lang === "en" ? "Want to share:" : "想分享：")}
            </span>
            {view === "mine"
              ? (lang === "en" ? "After a task, hit \"Save as template\" (private) or \"Share publicly\" on the result page" : "跑完任務 → 結果頁按「存為我的模板」（私人）或「公開分享」")
              : (lang === "en" ? "On the RunPage hit \"Share publicly\" on a winner · +2 credits each time it's used" : "在 RunPage 把自己跑得好的成果按「公開分享」 · 被別人用 +2 credits/次")}
          </p>

          {/* View toggle */}
          <div className="mt-4 inline-flex border border-default-300 rounded-md overflow-hidden">
            {(["mine", "community"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-4 py-1.5 text-xs font-medium transition"
                style={{
                  background: view === v ? "#171717" : "white",
                  color: view === v ? "white" : "#404040",
                }}
              >
                {v === "mine"
                  ? (lang === "en" ? "My collection" : "我的收藏")
                  : (lang === "en" ? "Community" : "社群範本")}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="w-full mt-5" style={{ maxWidth: 720 }}>
            <div
              className="flex items-center gap-3 px-5 bg-white rounded-[20px] border border-default-100 shadow-md"
              style={{ height: 52 }}
            >
              <Search size={18} className="text-default-600 shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={lang === "en" ? "Search templates, platforms, topics…" : "搜尋範本 / 平台 / 主題…"}
                className="flex-1 bg-transparent text-sm outline-none"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-default-600 hover:text-default-900 text-sm shrink-0">
                  {lang === "en" ? "Clear" : "清除"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filter row */}
      <div className="max-w-[1100px] mx-auto px-6 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <ChipGroup
            label={lang === "en" ? "Type" : "類型"}
            options={KIND_LABELS_LIST.map((k) => ({ value: k, label: KIND_LABELS[k] ?? k }))}
            value={kind}
            onChange={(v) => setKind(v as Kind)}
          />
          <div className="flex-1 min-w-[200px]" />
          <SortToggle value={sort} onChange={setSort} lang={lang} />
        </div>
      </div>

      {/* 2026-05-11 — card click router: squads have their own existing
          detail/run UX (picker workspace), templates open inline modal. */}
      {(() => {
        const handleClick = (t: TemplateRow) => {
          if (t.source === "squad") {
            // Existing squad pipeline route.
            navigate(`/picker?squadId=${t.id}`);
          } else {
            setOpenId(t.id);
          }
        };
        return (
          <>
            {/* Featured row */}
            {featured.length > 0 && (
              <div className="max-w-[1100px] mx-auto px-6 mb-6">
                <SectionLabel label={lang === "en" ? "EDITOR'S PICK · FEATURED" : "EDITOR'S PICK · 精選"} />
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {featured.map((t) => (
                    <TemplateCard key={`${t.source}-${t.id}`} t={t} onClick={() => handleClick(t)} highlight lang={lang} kindLabels={KIND_LABELS} />
                  ))}
                </div>
              </div>
            )}

      {/* Main grid */}
      <div className="max-w-[1100px] mx-auto px-6 pb-24">
        <SectionLabel
          label={
            sort === "trending" ? (lang === "en" ? "TRENDING · LAST 7 DAYS" : "TRENDING · 過去 7 天熱門")
            : sort === "newest" ? (lang === "en" ? "LATEST · NEW RELEASES" : "LATEST · 最新發布")
            : sort === "most-used" ? (lang === "en" ? "MOST USED · ALL-TIME" : "MOST USED · 累積最高")
            : (lang === "en" ? "MOST LIKED · TOP ❤️" : "MOST LIKED · 最多 ❤️")
          }
        />
        {listQ?.isLoading ? (
          <div className="text-center py-16 text-default-600">{t("loading")}</div>
        ) : regular.length === 0 ? (
          <div className="text-center py-20">
            <Sparkles size={32} className="mx-auto mb-3 text-default-500" strokeWidth={1.4} />
            <p className="text-default-700 font-medium mb-1">{lang === "en" ? "No public templates in this section yet" : "這個區段還沒有公開的範本"}</p>
            <p className="text-tiny text-default-600">{lang === "en" ? "Try a different filter — or be the first to publish one →" : "換個篩選，或第一個發布範本的人就是你 →"}</p>
            <button
              onClick={() => navigate("/projects")}
              className="mt-4 px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium"
            >
              {lang === "en" ? "Find an output to share" : "到專案找產出去公開"}
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {regular.map((t) => (
              <TemplateCard key={`${t.source}-${t.id}`} t={t} onClick={() => handleClick(t)} lang={lang} kindLabels={KIND_LABELS} />
            ))}
          </div>
        )}
      </div>
          </>
        );
      })()}

      {openId && (
        <TemplateDetailModal
          id={openId}
          lang={lang}
          kindLabels={KIND_LABELS}
          onClose={() => setOpenId(null)}
          onUsed={() => {
            listQ?.refetch?.();
          }}
        />
      )}
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
      <span
        style={{
          fontSize: 10, fontWeight: 600, color: "#525252",
          letterSpacing: "0.22em", textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "#D4D4D4" }} />
    </div>
  );
}

function ChipGroup<T extends string>({
  label, options, value, onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-default-600">{label}</span>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="px-3 py-1.5 rounded-full text-xs font-medium transition border"
            style={{
              borderColor: active ? "#171717" : "#D4D4D4",
              background: active ? "#171717" : "white",
              color: active ? "white" : "#404040",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function SortToggle({ value, onChange, lang }: { value: Sort; onChange: (v: Sort) => void; lang: string }) {
  const options: Array<{ v: Sort; label: string; icon: React.ReactNode }> = [
    { v: "trending",   label: lang === "en" ? "Trending"  : "熱門",  icon: <TrendingUp size={11} /> },
    { v: "newest",     label: lang === "en" ? "Newest"    : "最新",  icon: null },
    { v: "most-used",  label: lang === "en" ? "Most used" : "最常用", icon: null },
    { v: "most-liked", label: lang === "en" ? "Most liked": "最愛",   icon: <Heart size={11} /> },
  ];
  return (
    <div className="inline-flex border border-default-300 rounded-md overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.v}
          onClick={() => onChange(opt.v)}
          className="px-3 py-1.5 text-xs font-medium transition flex items-center gap-1"
          style={{
            background: value === opt.v ? "#171717" : "white",
            color: value === opt.v ? "white" : "#404040",
          }}
        >
          {opt.icon} {opt.label}
        </button>
      ))}
    </div>
  );
}

function TemplateCard({
  t, onClick, highlight, lang, kindLabels,
}: {
  t: TemplateRow;
  onClick: () => void;
  highlight?: boolean;
  lang: string;
  kindLabels: Record<string, string>;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative bg-white rounded-xl text-left transition overflow-hidden"
      style={{
        border: highlight ? "1px solid #171717" : "1px solid #D4D4D4",
        boxShadow: highlight ? "4px 4px 0 rgba(17,17,17,0.12)" : undefined,
        cursor: "pointer", padding: "14px 14px 12px",
        minHeight: 156, display: "flex", flexDirection: "column",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#171717"; }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = highlight ? "#171717" : "#D4D4D4";
      }}
    >
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {/* 2026-05-11 — source badge differentiates lightweight templates
            from full squads. Squads = full methodology + team. */}
        <span
          className="text-[9px] font-semibold uppercase tracking-[0.18em] px-1.5 rounded"
          style={{
            background: t.source === "squad" ? "#7C3AED" : "#171717",
            color: "white",
          }}
        >
          {t.source === "squad" ? "SQUAD" : kindLabels[t.kind] ?? t.kind}
        </span>
        {t.tier && (
          <span
            className="text-[9px] font-semibold uppercase tracking-wider px-1.5 rounded"
            style={{ background: "white", color: "#171717", border: "1px solid #D4D4D4" }}
          >
            {t.tier}
          </span>
        )}
        {t.platform && (
          <span className="text-[9px] uppercase tracking-wider text-default-600">{t.platform}</span>
        )}
        <div className="flex-1" />
        {highlight && (
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-amber-700">PICK</span>
        )}
      </div>

      <h3
        className="text-sm font-semibold leading-snug mb-1 line-clamp-2"
        style={{ color: "#171717" }}
      >
        {t.title}
      </h3>

      {t.previewText && (
        <p
          className="flex-1 text-[12px] leading-snug overflow-hidden"
          style={{
            color: "#525252",
            fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {t.previewText}
        </p>
      )}

      <div
        className="mt-3 pt-2 flex items-center justify-between text-[10px]"
        style={{ borderTop: "1px solid #E5E5E5", color: "#525252", letterSpacing: "0.05em" }}
      >
        <span className="truncate">{t.authorName ?? `User #${t.authorUserId}`}</span>
        <span className="flex items-center gap-3 shrink-0 tabular-nums">
          <span title={lang === "en" ? "Uses" : "使用次數"}>▶ {t.useCount}</span>
          <span title={lang === "en" ? "Likes" : "收藏"} className="flex items-center gap-0.5">
            <Heart size={10} /> {t.likeCount}
          </span>
        </span>
      </div>
    </button>
  );
}

function TemplateDetailModal({
  id, onClose, onUsed, lang, kindLabels,
}: { id: number; onClose: () => void; onUsed: () => void; lang: string; kindLabels: Record<string, string> }) {
  const navigate = useNavigate();
  const detailQ = (trpc as any).community?.detail?.useQuery?.({ id }, { refetchOnWindowFocus: false });
  const utils = (trpc as any).useUtils?.() ?? null;
  const likeM = (trpc as any).community?.toggleLike?.useMutation?.({
    onSuccess: () => { utils?.community?.detail?.invalidate?.({ id }); utils?.community?.list?.invalidate?.(); },
  });
  const useM = (trpc as any).community?.recordUse?.useMutation?.({
    onSuccess: () => { utils?.community?.list?.invalidate?.(); onUsed(); },
  });

  const d: any = detailQ?.data;

  // ESC to close
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden"
        style={{ maxHeight: "85vh", display: "flex", flexDirection: "column" }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-default-200">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-default-600">
            COMMUNITY · TEMPLATE #{id}
          </p>
          <button onClick={onClose} className="text-default-600 hover:text-default-900">
            <X size={18} />
          </button>
        </div>

        {detailQ?.isLoading || !d ? (
          <div className="p-12 text-center text-default-600">{lang === "en" ? "One sec…" : "載入中…"}</div>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-default-200">
              <div className="flex items-center gap-2 mb-2 flex-wrap text-[10px] uppercase tracking-[0.18em] text-default-600">
                <span style={{ fontWeight: 600 }}>{kindLabels[d.kind] ?? d.kind}</span>
                {d.tier && (
                  <span className="px-1.5 rounded text-white" style={{ background: "#171717" }}>{d.tier}</span>
                )}
                {d.platform && <span>{d.platform}</span>}
                <span className="text-default-500">·</span>
                <span>by {d.authorName ?? `User #${d.authorUserId}`}</span>
              </div>
              <h2 className="text-xl font-semibold text-default-900 mb-1">{d.title}</h2>
              {d.description && (
                <p
                  className="text-sm text-default-700"
                  style={{
                    fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
                    lineHeight: 1.7,
                  }}
                >
                  {d.description}
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-default-600 mb-2">
                Template Content
              </p>
              <pre
                className="text-xs leading-relaxed whitespace-pre-wrap bg-default-50 border border-default-200 rounded-lg p-3"
                style={{ fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif', color: "#262626" }}
              >
                {typeof d.content === "string" ? d.content : JSON.stringify(d.content, null, 2)}
              </pre>
            </div>

            <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-default-200 bg-default-50">
              <div className="text-[11px] text-default-600 tabular-nums">
                {lang === "en"
                  ? `▶ Used ${d.useCount} times · ❤️ ${d.likeCount} · Author earned ${d.creditsEarned ?? 0} credits`
                  : `▶ 已被使用 ${d.useCount} 次 · ❤️ ${d.likeCount} · 作者已賺 ${d.creditsEarned ?? 0} credits`}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => likeM?.mutateAsync?.({ templateId: d.id })}
                  className="px-3 py-1.5 rounded-md border text-xs font-medium flex items-center gap-1"
                  style={{
                    borderColor: d.likedByMe ? "#171717" : "#D4D4D4",
                    background: d.likedByMe ? "#171717" : "white",
                    color: d.likedByMe ? "white" : "#404040",
                  }}
                >
                  <Heart size={12} fill={d.likedByMe ? "currentColor" : "none"} />
                  {d.likedByMe
                    ? (lang === "en" ? "Liked" : "已收藏")
                    : (lang === "en" ? "Like" : "收藏")}
                </button>
                <button
                  onClick={async () => {
                    try {
                      await useM?.mutateAsync?.({ templateId: d.id });
                      // After recording the use, route to the matching task tier.
                      if (d.taskId) {
                        const tierPath = d.tier === "30s" ? "/30s"
                          : d.tier === "60s" ? "/60s"
                          : d.tier === "99s" ? "/99s" : "/30s";
                        navigate(`${tierPath}?templateId=${d.id}`);
                      } else {
                        navigate(`/30s?templateId=${d.id}`);
                      }
                    } catch (e: any) {
                      alert(lang === "en" ? `Use failed: ${e?.message ?? e}` : `使用失敗：${e?.message ?? e}`);
                    }
                  }}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold text-white flex items-center gap-1"
                  style={{ background: "#171717" }}
                >
                  {lang === "en" ? "Use this template" : "使用此模板"} <ExternalLink size={11} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
