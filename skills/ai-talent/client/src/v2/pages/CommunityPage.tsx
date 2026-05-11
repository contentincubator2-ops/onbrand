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
import { Heart, Sparkles, TrendingUp, Search, X, ExternalLink } from "lucide-react";

type Sort = "trending" | "newest" | "most-used" | "most-liked";
type Kind = "caption" | "campaign" | "positioning" | "prompt" | "all";

interface TemplateRow {
  id: number;
  authorUserId: number;
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

const KIND_LABELS: Record<string, string> = {
  caption: "貼文",
  campaign: "Campaign",
  positioning: "定位",
  prompt: "Prompt",
  all: "全部",
};
const KIND_LABELS_LIST: Kind[] = ["all", "caption", "campaign", "positioning", "prompt"];

export default function CommunityPage() {
  const navigate = useNavigate();
  const [sort, setSort] = useState<Sort>("trending");
  const [kind, setKind] = useState<Kind>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const listQ = (trpc as any).community?.list?.useQuery?.(
    {
      limit: 60,
      sort,
      kind: kind === "all" ? undefined : kind,
      search: search.trim() || undefined,
    },
    { refetchOnWindowFocus: false, staleTime: 30_000 },
  );
  const list: TemplateRow[] = listQ?.data ?? [];
  const featured = useMemo(() => list.filter((t) => t.featured), [list]);
  const regular = useMemo(() => list.filter((t) => !t.featured), [list]);

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFA" }}>
      {/* Hero */}
      <div className="relative pt-10 pb-6 px-6 text-center">
        <div className="relative z-10 flex flex-col items-center max-w-[1100px] mx-auto">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-default-600 mb-3">
            COMMUNITY · TEMPLATES
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
            社群範本庫
          </h1>
          <p
            className="mt-3 mx-auto text-default-700"
            style={{
              fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
              fontStyle: "italic", fontSize: 14, lineHeight: 1.7, maxWidth: 640,
            }}
          >
            別的操盤者跑出來的成功範本 · 你也可以把自己的產出公開回饋給社群
          </p>
          <p
            className="mt-2 mx-auto text-default-700"
            style={{ fontSize: 12, lineHeight: 1.55, maxWidth: 640, letterSpacing: "0.02em" }}
          >
            <span style={{ fontWeight: 600, color: "#171717", marginRight: 6 }}>機制：</span>
            被別人用一次 = 你 +2 credits（每日上限 50） · 像 Spotify 一樣靠播放分潤
          </p>

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
                placeholder="搜尋範本 / 平台 / 主題…"
                className="flex-1 bg-transparent text-sm outline-none"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-default-600 hover:text-default-900 text-sm shrink-0">
                  清除
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
            label="類型"
            options={KIND_LABELS_LIST.map((k) => ({ value: k, label: KIND_LABELS[k] ?? k }))}
            value={kind}
            onChange={(v) => setKind(v as Kind)}
          />
          <div className="flex-1 min-w-[200px]" />
          <SortToggle value={sort} onChange={setSort} />
        </div>
      </div>

      {/* Featured row */}
      {featured.length > 0 && (
        <div className="max-w-[1100px] mx-auto px-6 mb-6">
          <SectionLabel label="EDITOR'S PICK · 精選" />
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {featured.map((t) => (
              <TemplateCard key={t.id} t={t} onClick={() => setOpenId(t.id)} highlight />
            ))}
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="max-w-[1100px] mx-auto px-6 pb-24">
        <SectionLabel
          label={
            sort === "trending" ? "TRENDING · 過去 7 天熱門"
            : sort === "newest" ? "LATEST · 最新發布"
            : sort === "most-used" ? "MOST USED · 累積最高"
            : "MOST LIKED · 最多 ❤️"
          }
        />
        {listQ?.isLoading ? (
          <div className="text-center py-16 text-default-600">載入中…</div>
        ) : regular.length === 0 ? (
          <div className="text-center py-20">
            <Sparkles size={32} className="mx-auto mb-3 text-default-500" strokeWidth={1.4} />
            <p className="text-default-700 font-medium mb-1">這個區段還沒有公開的範本</p>
            <p className="text-tiny text-default-600">換個篩選，或第一個發布範本的人就是你 →</p>
            <button
              onClick={() => navigate("/projects")}
              className="mt-4 px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium"
            >
              到專案找產出去公開
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {regular.map((t) => (
              <TemplateCard key={t.id} t={t} onClick={() => setOpenId(t.id)} />
            ))}
          </div>
        )}
      </div>

      {openId && (
        <TemplateDetailModal
          id={openId}
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

function SortToggle({ value, onChange }: { value: Sort; onChange: (v: Sort) => void }) {
  const options: Array<{ v: Sort; label: string; icon: React.ReactNode }> = [
    { v: "trending",   label: "熱門",  icon: <TrendingUp size={11} /> },
    { v: "newest",     label: "最新",  icon: null },
    { v: "most-used",  label: "最常用", icon: null },
    { v: "most-liked", label: "最愛",   icon: <Heart size={11} /> },
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
  t, onClick, highlight,
}: {
  t: TemplateRow;
  onClick: () => void;
  highlight?: boolean;
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
        <span
          className="text-[9px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: "#525252" }}
        >
          {KIND_LABELS[t.kind] ?? t.kind}
        </span>
        {t.tier && (
          <span
            className="text-[9px] font-semibold uppercase tracking-wider px-1.5 rounded"
            style={{ background: "#171717", color: "white" }}
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
          <span title="使用次數">▶ {t.useCount}</span>
          <span title="收藏" className="flex items-center gap-0.5">
            <Heart size={10} /> {t.likeCount}
          </span>
        </span>
      </div>
    </button>
  );
}

function TemplateDetailModal({
  id, onClose, onUsed,
}: { id: number; onClose: () => void; onUsed: () => void }) {
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
          <div className="p-12 text-center text-default-600">載入中…</div>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-default-200">
              <div className="flex items-center gap-2 mb-2 flex-wrap text-[10px] uppercase tracking-[0.18em] text-default-600">
                <span style={{ fontWeight: 600 }}>{KIND_LABELS[d.kind] ?? d.kind}</span>
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
                ▶ 已被使用 {d.useCount} 次 · ❤️ {d.likeCount} · 作者已賺 {d.creditsEarned ?? 0} credits
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
                  {d.likedByMe ? "已收藏" : "收藏"}
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
                      alert(`使用失敗：${e?.message ?? e}`);
                    }
                  }}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold text-white flex items-center gap-1"
                  style={{ background: "#171717" }}
                >
                  使用此模板 <ExternalLink size={11} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
