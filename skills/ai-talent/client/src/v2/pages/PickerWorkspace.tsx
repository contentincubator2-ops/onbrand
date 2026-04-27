/**
 * PickerWorkspace — Canva-style "open in new tab" picker.
 *
 * Reference study: Canva home → click "Presentation" tile → opens a new
 * tab with: left icon rail, middle squad-thumbnail panel with search +
 * AI-generate input, right canvas area. Click a squad → detail panel
 * shows workflow step previews + a primary "套用 / 啟動小組" CTA.
 *
 * Routing
 *   /picker?workspace=facebook       → pre-filter to FB squads
 *   /picker?layer=L1                 → pre-filter to L1 squads
 *   /picker?title=Facebook 月度經營  → seed mission title for launch
 *   /picker?source=upload            → open ingest modal on mount
 *
 * Layout (Canva-faithful)
 *   ┌──┬───────────────┬────────────────────────────────────┐
 *   │  │ search + pills │                                    │
 *   │ι │ squad thumbs   │   canvas placeholder OR squad      │
 *   │  │ (vertical)     │   detail panel (steps grid)        │
 *   └──┴───────────────┴────────────────────────────────────┘
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { LAYER_TOKENS, resolveLayer, type MosLayer } from "../../studio/primitives/tokens";
import { useLang } from "../../lib/i18n";
import { safeLocalizedText, pickLocaleText } from "../../lib/localizeText";
import WorkflowRunner from "./WorkflowRunner";

/* ─────────────────────────── Icon rail ─────────────────────────── */

type RailKey = "templates" | "layers" | "channels" | "recent" | "upload";

const RAIL_ITEMS: Array<{ key: RailKey; label: string; glyph: string }> = [
  { key: "templates", label: "範本",   glyph: "▣" },
  { key: "layers",    label: "圖層",   glyph: "≡" },
  { key: "channels",  label: "通路",   glyph: "◎" },
  { key: "recent",    label: "我的",   glyph: "◔" },
  { key: "upload",    label: "上傳",   glyph: "↑" },
];

const CHANNEL_OPTIONS = [
  { key: "facebook",  label: "Facebook",  glyph: "f"  },
  { key: "instagram", label: "Instagram", glyph: "IG" },
  { key: "linkedin",  label: "LinkedIn",  glyph: "in" },
  { key: "youtube",   label: "YouTube",   glyph: "▶"  },
  { key: "pr",        label: "公關",      glyph: "PR" },
  { key: "email",     label: "電子報",    glyph: "✉"  },
];

/**
 * Channel match aliases — squads tag themselves with various spellings.
 * Tests against squad.workspace[] (string[]), squad.tags[], slug, and name.
 */
const CHANNEL_ALIASES: Record<string, string[]> = {
  facebook:  ["facebook", "fb", "meta-fb", "fb-page", "fb-ads"],
  instagram: ["instagram", "ig", "ig-reels", "ig-feed"],
  linkedin:  ["linkedin", "li", "linkedin-post"],
  youtube:   ["youtube", "yt", "shorts", "yt-shorts"],
  pr:        ["pr", "public-relations", "media-relations", "press"],
  email:     ["email", "edm", "newsletter", "mailer"],
};

const LAYER_OPTIONS: MosLayer[] = ["L1", "L2", "L3", "L4", "L5", "L6"];

/**
 * Lightweight zh↔en synonym expander for the picker search bar.
 *
 * The squad corpus mixes Chinese names with English seed metadata
 * (methodology author, tags, outputFormats). A user typing "貼文"
 * should also match "post", "content", "social-media"; "廣告" should
 * match "ad", "ads", "advertising"; etc. We do this by looking up the
 * raw query term in a small alias map and OR-ing the expansions.
 */
const SEARCH_SYNONYMS: Array<string[]> = [
  ["貼文", "po文", "post", "posts", "content", "social-media", "social media"],
  ["文案", "copy", "copywriting", "copywrite", "ad copy"],
  ["廣告", "ad", "ads", "advertising", "paid", "paid-ads", "campaign-ads"],
  ["影片", "短影音", "影音", "video", "reels", "shorts", "tiktok"],
  ["品牌", "brand", "branding", "brand-positioning"],
  ["定位", "positioning"],
  ["上市", "發表", "上線", "發佈", "launch", "launching", "go-to-market", "gtm"],
  ["受眾", "客群", "audience", "persona", "icp", "segmentation"],
  ["公關", "媒體", "pr", "public-relations", "press", "media-relations"],
  ["電子報", "edm", "email", "newsletter", "mailer"],
  ["互動", "engagement", "engage"],
  ["故事", "說故事", "敘事", "story", "storytelling", "narrative"],
  ["分析", "research", "analysis", "audit"],
  ["策略", "strategy", "strategic"],
  ["活動", "campaign", "event"],
  ["驗證", "validation", "audit", "scorecard", "monitor"],
  ["創意", "創作", "creative"],
];

function expandSynonyms(q: string): string[] {
  const ql = q.trim().toLowerCase();
  if (!ql) return [];
  const out = new Set<string>([ql]);
  for (const group of SEARCH_SYNONYMS) {
    if (group.some((g) => ql.includes(g.toLowerCase()) || g.toLowerCase().includes(ql))) {
      for (const g of group) out.add(g.toLowerCase());
    }
  }
  return [...out];
}

/* ─────────────────────────── Page ─────────────────────────── */

export default function PickerWorkspace() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { lang } = useLang();

  const initialWorkspace = params.get("workspace");
  const initialLayer = params.get("layer") as MosLayer | null;
  const seedTitle = params.get("title") ?? "";
  const initialSlug = params.get("slug");
  const initialMissionId = params.get("mission");

  // Active mission — when set, right pane shows WorkflowRunner instead of
  // SquadDetailPanel. Set on launch (or rehydrated from /picker?mission=).
  const [activeMissionId, setActiveMissionId] = useState<number | null>(
    initialMissionId ? Number(initialMissionId) : null,
  );

  // Rail always starts on "templates" — that's the primary browsing mode.
  // A locked channel/layer (from URL params) is shown as a dismissable
  // badge under the search bar, not as a rail switch. This matches Canva,
  // where 範本 is always the default active rail item.
  const [rail, setRail] = useState<RailKey>("templates");
  const [layerFilter, setLayerFilter] = useState<MosLayer | "ALL">(
    initialLayer && LAYER_OPTIONS.includes(initialLayer) ? initialLayer : "ALL",
  );
  const [channelFilter, setChannelFilter] = useState<string>(initialWorkspace ?? "all");
  const [q, setQ] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug);

  // ── Data ────────────────────────────────────────────────────────────
  const squadsQuery = (trpc.squad as any).listByBrand?.useQuery
    ? (trpc.squad as any).listByBrand.useQuery(
        { brandId: 0 },
        { refetchOnWindowFocus: false },
      )
    : { data: [] };

  const allSquads: any[] = useMemo(
    () => ((squadsQuery.data as any[]) ?? []).filter(
      (s) => Array.isArray(s.steps) && s.steps.length > 0,
    ),
    [squadsQuery.data],
  );

  // Recent missions — drives the 最近使用的方法論 section.
  const recentMissionsQuery = (trpc as any).mission?.listAllForUser?.useQuery
    ? (trpc as any).mission.listAllForUser.useQuery(undefined, { refetchOnWindowFocus: false })
    : { data: [] };

  /** Build "recently used" squad list from the user's mission history. */
  const recentSquads: any[] = useMemo(() => {
    const missions = (recentMissionsQuery.data as any[]) ?? [];
    const slugOrder: string[] = [];
    const seen = new Set<string>();
    for (const m of missions) {
      const slug = m.squadSlug;
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      slugOrder.push(slug);
    }
    const bySlug = new Map(allSquads.map((s) => [s.slug, s]));
    return slugOrder
      .map((sl) => bySlug.get(sl))
      .filter(Boolean);
  }, [recentMissionsQuery.data, allSquads]);

  /** Brand-saved / user-ingested squads — the 品牌範本 section.
   *  source: "ingested" or "forked" → user-created; "seeded" → built-in. */
  const brandTemplates: any[] = useMemo(
    () => allSquads.filter((s) => s.source && s.source !== "seeded"),
    [allSquads],
  );

  // ── Filter pipeline ─────────────────────────────────────────────────
  // Predicate: keeps a squad if it passes the active layer + channel
  // filters. Reused for "all results", "recently used", and
  // "brand templates" so each section honors the same scope.
  const passesFacets = (s: any): boolean => {
    if (layerFilter !== "ALL") {
      const lk = (s.strategyLayer ?? "").toString().slice(0, 2);
      if (lk !== layerFilter) return false;
    }
    if (channelFilter !== "all") {
      const aliases = CHANNEL_ALIASES[channelFilter] ?? [channelFilter];
      const wsArr = Array.isArray(s.workspace) ? s.workspace : (s.workspace ? [s.workspace] : []);
      const tagArr = Array.isArray(s.tags) ? s.tags : [];
      const channelHaystack = [
        ...wsArr,
        ...tagArr,
        s.slug,
        pickLocaleText(s.name, "en"),
        pickLocaleText(s.name, "zh-TW"),
      ].filter(Boolean).join(" ").toLowerCase();
      if (!aliases.some((a) => channelHaystack.includes(a))) return false;
    }
    return true;
  };

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return allSquads.filter((s) => {
      if (!passesFacets(s)) return false;
      // Text search — match if ANY synonym hits the expanded haystack.
      if (ql) {
        const stepText = Array.isArray(s.steps)
          ? s.steps.map((st: any) => `${st.name ?? ""} ${st.description ?? ""} ${st.outputType ?? ""}`).join(" ")
          : "";
        const memberNames = Array.isArray(s.members)
          ? s.members.map((m: any) => `${m.name ?? ""} ${m.role ?? ""} ${m.primarySkill ?? ""}`).join(" ")
          : "";
        const haystack = [
          pickLocaleText(s.name, "zh-TW"),
          pickLocaleText(s.name, "en"),
          pickLocaleText(s.description, "zh-TW"),
          pickLocaleText(s.description, "en"),
          s.slug,
          s.methodology?.author,
          s.methodology?.summary,
          typeof s.methodology === "string" ? s.methodology : "",
          (s.tags ?? []).join(" "),
          (s.useCases ?? []).join(" "),
          (s.outputFormats ?? []).join(" "),
          (s.workspace ?? []).join(" "),
          stepText,
          memberNames,
          s.lead?.name,
          s.lead?.primarySkill,
        ].filter(Boolean).join(" ").toLowerCase();
        const terms = expandSynonyms(ql);
        if (!terms.some((t) => haystack.includes(t))) return false;
      }
      return true;
    });
  }, [allSquads, layerFilter, channelFilter, q]);

  const selectedSquad = useMemo(
    () => filtered.find((s) => s.slug === selectedSlug)
      ?? allSquads.find((s) => s.slug === selectedSlug)
      ?? null,
    [filtered, allSquads, selectedSlug],
  );

  // ── Auto-select first squad when filter changes & nothing chosen
  useEffect(() => {
    if (!selectedSlug && filtered.length > 0) {
      setSelectedSlug(filtered[0].slug);
    }
  }, [filtered, selectedSlug]);

  // ── Mission creation ────────────────────────────────────────────────
  const createMission = trpc.mission.create.useMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const launchSquad = async (sq: any) => {
    setError(null);
    setBusy(true);
    try {
      const ws = (Array.isArray(sq.workspace) ? sq.workspace[0] : sq.workspace) || channelFilter || "";
      const res = await createMission.mutateAsync({
        title: seedTitle || pickLocaleText(sq.name, lang) || sq.slug,
        description: safeLocalizedText(sq.description, lang) ?? undefined,
        squadSlug: sq.slug,
        workspace: ws,
      });
      if (!res?.id) throw new Error("後端沒有回傳 mission id");
      // In-place launch — swap right pane to WorkflowRunner. Persist
      // mission id in URL so refresh / share-link rehydrates the runner.
      const missionId = Number(res.id);
      setActiveMissionId(missionId);
      const next = new URLSearchParams(params);
      next.set("mission", String(missionId));
      next.set("slug", sq.slug);
      setParams(next, { replace: true });
      setBusy(false);
    } catch (e: any) {
      setError(`啟動失敗：${e?.message ?? String(e)}`);
      setBusy(false);
    }
  };

  // ── Pretty channel/layer titles for header ──────────────────────────
  const headerTitle = (() => {
    if (channelFilter !== "all") {
      const c = CHANNEL_OPTIONS.find((x) => x.key === channelFilter);
      return c ? `挑選方法論 — ${c.label}` : "挑選方法論";
    }
    if (layerFilter !== "ALL") {
      return `挑選方法論 — ${layerFilter}・${LAYER_TOKENS[layerFilter].label}`;
    }
    return "挑選方法論";
  })();

  // Sync URL when filter changes (so refresh / share-link works)
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (channelFilter !== "all") next.set("workspace", channelFilter); else next.delete("workspace");
    if (layerFilter !== "ALL") next.set("layer", layerFilter); else next.delete("layer");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelFilter, layerFilter]);

  return (
    <div className="fixed inset-0 flex flex-col bg-mos-cream">
      {/* ── Top header ───────────────────────────────────────────────── */}
      <header className="h-12 flex items-center justify-between px-3 border-b border-mos-hair bg-white">
        <button
          onClick={() => { if (window.history.length > 1) window.history.back(); else window.close(); }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[0.78rem] text-mos-ink hover:bg-mos-ink/5 rounded transition"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>返回</span>
        </button>
        <div className="font-display text-[0.92rem] text-mos-ink truncate px-4">
          {headerTitle}
        </div>
        <div className="w-[60px]" />
      </header>

      {/* ── Body: 3-column ───────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex">
        {/* Icon rail */}
        <aside className="w-[68px] border-r border-mos-hair bg-white flex flex-col items-stretch py-2">
          {RAIL_ITEMS.map((it) => {
            const active = rail === it.key;
            return (
              <button
                key={it.key}
                onClick={() => {
                  setRail(it.key);
                  if (it.key === "templates") {
                    setLayerFilter("ALL"); setChannelFilter("all");
                  }
                }}
                className={[
                  "h-14 mx-1 my-0.5 rounded flex flex-col items-center justify-center gap-0.5 transition",
                  active ? "bg-mos-ink text-white" : "text-mos-ink hover:bg-mos-ink/5",
                ].join(" ")}
              >
                <span className="text-[1.05rem] leading-none">{it.glyph}</span>
                <span className="text-[0.62rem] tracking-[0.06em]">{it.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Middle column — search + sub-filter + thumbnails */}
        <section className="w-[380px] border-r border-mos-hair bg-white flex flex-col min-h-0">
          {/* Search + AI generate */}
          <div className="p-3 border-b border-mos-hair">
            <div className="relative">
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={
                  channelFilter !== "all"
                    ? `描述你的 ${CHANNEL_OPTIONS.find((c) => c.key === channelFilter)?.label ?? ""} 詳細需求…`
                    : layerFilter !== "ALL"
                      ? `描述你的 ${LAYER_TOKENS[layerFilter].label} 詳細需求…`
                      : "描述你的行銷需求或搜尋方法論…"
                }
                className="w-full pl-9 pr-9 py-2.5 text-[0.84rem] bg-mos-cream border border-mos-hair rounded-full focus:outline-none focus:border-mos-orange focus:ring-2 focus:ring-mos-orange/20 transition"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mos-muted pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" />
              </svg>
              {q && (
                <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center text-mos-muted hover:text-mos-ink rounded-full hover:bg-mos-ink/5">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                disabled
                title="AI 推薦方法論（即將推出）"
                className="px-3 py-2 text-[0.78rem] bg-white border border-mos-hair text-mos-ink rounded-full hover:border-mos-ink transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
              >
                <span className="text-mos-orange">✦</span> 生成
              </button>
              <button
                onClick={() => { /* search runs live; this just blurs focus */ (document.activeElement as HTMLElement)?.blur(); }}
                className="px-3 py-2 text-[0.78rem] bg-mos-orange hover:bg-mos-orange-hover text-white rounded-full transition"
              >
                搜尋
              </button>
            </div>
          </div>

          {/* Sub-filter row (varies by rail).
              When a channel is locked (came in via a channel quick tile),
              suppress the cross-layer pill row — Canva keeps the picker
              focused on the chosen category. */}
          {rail === "channels" && channelFilter === "all" && (
            <div className="px-3 pt-2 pb-1 flex flex-wrap gap-1.5">
              <RailPill active={channelFilter === "all"} onClick={() => setChannelFilter("all")}>全部</RailPill>
              {CHANNEL_OPTIONS.map((c) => (
                <RailPill key={c.key} active={(channelFilter as string) === c.key} onClick={() => setChannelFilter(c.key)}>{c.label}</RailPill>
              ))}
            </div>
          )}
          {rail === "layers" && channelFilter === "all" && (
            <div className="px-3 pt-2 pb-1 flex flex-wrap gap-1.5">
              <RailPill active={layerFilter === "ALL"} onClick={() => setLayerFilter("ALL")}>全部</RailPill>
              {LAYER_OPTIONS.map((l) => (
                <RailPill
                  key={l}
                  active={layerFilter === l}
                  onClick={() => setLayerFilter(l)}
                  dot={LAYER_TOKENS[l].bg}
                >
                  {l}・{LAYER_TOKENS[l].label}
                </RailPill>
              ))}
            </div>
          )}
          {/* Locked-filter badges (channel and/or layer). Each is
              dismissable so user can broaden the picker scope. */}
          {(channelFilter !== "all" || layerFilter !== "ALL") && (
            <div className="px-3 pt-2 pb-1 flex items-center flex-wrap gap-1.5">
              {channelFilter !== "all" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[0.72rem] bg-mos-ink text-white rounded-full">
                  {CHANNEL_OPTIONS.find((c) => c.key === channelFilter)?.label
                    ?? channelFilter}
                  <button
                    onClick={() => setChannelFilter("all")}
                    aria-label="清除通路篩選"
                    className="ml-0.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-white/20"
                  >
                    <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {layerFilter !== "ALL" && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[0.72rem] text-white rounded-full"
                  style={{ background: LAYER_TOKENS[layerFilter].bg }}
                >
                  {layerFilter}・{LAYER_TOKENS[layerFilter].label}
                  <button
                    onClick={() => setLayerFilter("ALL")}
                    aria-label="清除圖層篩選"
                    className="ml-0.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-white/20"
                  >
                    <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
            </div>
          )}

          {/* Sectioned thumbnails — Canva pattern: 最近使用 / 品牌範本 / 所有結果.
              Recently-used and brand-templates sections hide while a search
              query is active so the user sees a single relevance-ranked
              "所有結果" list. */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {squadsQuery.isLoading ? (
              <div className="text-[0.84rem] text-mos-muted py-6 text-center">載入中…</div>
            ) : (
              <>
                {/* ── 1. 最近使用的方法論 (hidden while searching) ── */}
                {!q && (() => {
                  const items = recentSquads.filter(passesFacets).slice(0, 4);
                  if (items.length === 0) return null;
                  return (
                    <ThumbSection
                      title="最近使用的方法論"
                      onCta={() => navigate("/")}
                      ctaLabel="查看全部"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        {items.map((sq) => (
                          <SquadMiniCard
                            key={`recent-${sq.id ?? sq.slug}`}
                            squad={sq}
                            active={selectedSlug === sq.slug}
                            onClick={() => setSelectedSlug(sq.slug)}
                            lang={lang}
                          />
                        ))}
                      </div>
                    </ThumbSection>
                  );
                })()}

                {/* ── 2. 品牌範本 (hidden while searching) ── */}
                {!q && (() => {
                  const items = brandTemplates.filter(passesFacets);
                  return (
                    <ThumbSection title="品牌範本">
                      {items.length > 0 ? (
                        <div className="space-y-2">
                          {items.slice(0, 3).map((sq) => (
                            <SquadThumb
                              key={`brand-${sq.id ?? sq.slug}`}
                              squad={sq}
                              active={selectedSlug === sq.slug}
                              onClick={() => setSelectedSlug(sq.slug)}
                              lang={lang}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="border border-mos-hair rounded-lg p-3 flex items-start gap-3 bg-white">
                          <div className="w-12 h-12 shrink-0 border border-mos-hair rounded flex items-center justify-center text-mos-muted text-[1.4rem]">
                            +
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[0.82rem] font-semibold text-mos-ink">
                              發佈為品牌範本
                            </div>
                            <div className="text-[0.7rem] text-mos-muted leading-snug mt-0.5">
                              完成此設計後，你可以將其變成可重複使用的範本。
                            </div>
                          </div>
                        </div>
                      )}
                    </ThumbSection>
                  );
                })()}

                {/* ── 3. 所有結果 ── */}
                <ThumbSection
                  title={q ? `搜尋結果（${filtered.length}）` : "所有結果"}
                >
                  {filtered.length === 0 ? (
                    <div className="text-[0.84rem] text-mos-muted py-6 text-center px-4">
                      {q ? `沒有找到符合「${q}」的方法論。` : "這個分類目前沒有方法論。"}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filtered.map((sq) => (
                        <SquadThumb
                          key={sq.id ?? sq.slug}
                          squad={sq}
                          active={selectedSlug === sq.slug}
                          onClick={() => setSelectedSlug(sq.slug)}
                          lang={lang}
                        />
                      ))}
                    </div>
                  )}
                </ThumbSection>
              </>
            )}
          </div>
        </section>

        {/* Right pane — canvas / detail / runner */}
        <section className="flex-1 min-w-0 bg-mos-cream flex flex-col min-h-0">
          {activeMissionId && selectedSquad ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="px-4 py-1.5 border-b border-mos-hair bg-white/50 flex items-center justify-between">
                <span className="text-[0.7rem] text-mos-muted">執行中 · 隨時可從左側切換方法論</span>
                <button
                  onClick={() => {
                    setActiveMissionId(null);
                    const next = new URLSearchParams(params);
                    next.delete("mission");
                    setParams(next, { replace: true });
                  }}
                  className="text-[0.7rem] text-mos-muted hover:text-mos-ink transition"
                >
                  返回預覽
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <WorkflowRunner
                  missionId={activeMissionId}
                  squad={selectedSquad}
                  lang={lang}
                />
              </div>
            </div>
          ) : selectedSquad ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
            <SquadDetailPanel
              squad={selectedSquad}
              busy={busy}
              error={error}
              onLaunch={() => launchSquad(selectedSquad)}
              lang={lang}
            />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-10">
              <div className="text-center max-w-[420px]">
                <div className="text-[3rem] mb-4 text-mos-muted">▣</div>
                <h2 className="font-display text-[1.4rem] text-mos-ink mb-2">
                  從左側挑一個方法論小組來開始
                </h2>
                <p className="text-[0.86rem] text-mos-muted leading-relaxed">
                  每個方法論都附帶完整的工作步驟與 AI 專員陣容，點擊 → 預覽 → 啟動。
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ─────────────────────────── Sub: pill ─────────────────────────── */

function RailPill({
  active, onClick, children, dot,
}: { active: boolean; onClick: () => void; children: React.ReactNode; dot?: string }) {
  return (
    <button
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 px-2.5 py-1 text-[0.72rem] rounded-full border transition",
        active
          ? "bg-mos-ink text-white border-mos-ink"
          : "bg-white text-mos-ink border-mos-hair hover:border-mos-ink",
      ].join(" ")}
    >
      {dot && <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: active ? "#fff" : dot }} />}
      {children}
    </button>
  );
}

/* ─────────────────────────── Sub: ThumbSection ─────────────────────────── */

function ThumbSection({
  title, children, onCta, ctaLabel,
}: {
  title: string;
  children: React.ReactNode;
  onCta?: () => void;
  ctaLabel?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <h3 className="text-[0.78rem] font-semibold text-mos-ink">{title}</h3>
        {onCta && ctaLabel && (
          <button
            onClick={onCta}
            className="text-[0.7rem] text-mos-muted hover:text-mos-ink transition"
          >
            {ctaLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/* ─────────────────────────── Sub: SquadMiniCard (recent grid) ─────────────────────────── */

function SquadMiniCard({
  squad, active, onClick, lang,
}: { squad: any; active: boolean; onClick: () => void; lang: "zh-TW" | "en" }) {
  const lk = resolveLayer(squad.strategyLayer);
  const tone = LAYER_TOKENS[lk];
  const name = pickLocaleText(squad.name, lang) || squad.slug;

  return (
    <button
      onClick={onClick}
      className={[
        "rounded-md overflow-hidden border transition text-left flex flex-col",
        active ? "border-mos-ink shadow-[0_2px_8px_rgba(0,0,0,0.06)]" : "border-mos-hair hover:border-mos-ink",
      ].join(" ")}
    >
      <div
        className="aspect-[16/10] flex items-center justify-center text-white font-bold text-[1.6rem]"
        style={{ background: tone.bg }}
      >
        {(name.charAt(0) || "?").toUpperCase()}
      </div>
      <div className="px-2 py-1.5 bg-white">
        <div className="text-[0.74rem] text-mos-ink line-clamp-1 leading-snug">{name}</div>
      </div>
    </button>
  );
}

/* ─────────────────────────── Sub: SquadThumb ─────────────────────────── */

function SquadThumb({
  squad, active, onClick, lang,
}: { squad: any; active: boolean; onClick: () => void; lang: "zh-TW" | "en" }) {
  const lk = resolveLayer(squad.strategyLayer);
  const tone = LAYER_TOKENS[lk];
  const name = pickLocaleText(squad.name, lang) || squad.slug;
  const stepCount = Array.isArray(squad.steps) ? squad.steps.length : 0;
  const author = squad.methodology?.author;

  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left p-2.5 rounded-md border transition flex items-start gap-2.5",
        active ? "bg-white border-mos-ink shadow-[0_2px_8px_rgba(0,0,0,0.06)]" : "bg-white border-mos-hair hover:border-mos-ink",
      ].join(" ")}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
        style={{ background: tone.bg }}
      >
        {(name.charAt(0) || "?").toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[0.82rem] font-semibold text-mos-ink line-clamp-1">{name}</div>
        <div className="text-[0.7rem] text-mos-muted line-clamp-1 mt-0.5">
          {author ? `${author}` : tone.label} · {stepCount} 個步驟
        </div>
      </div>
    </button>
  );
}

/* ─────────────────────────── Sub: Detail panel ─────────────────────────── */

function SquadDetailPanel({
  squad, busy, error, onLaunch, lang,
}: {
  squad: any;
  busy: boolean;
  error: string | null;
  onLaunch: () => void;
  lang: "zh-TW" | "en";
}) {
  const lk = resolveLayer(squad.strategyLayer);
  const tone = LAYER_TOKENS[lk];
  const name = pickLocaleText(squad.name, lang) || squad.slug;
  const description = safeLocalizedText(squad.description, lang);
  const author = squad.methodology?.author;
  const year = squad.methodology?.year;
  const steps: any[] = Array.isArray(squad.steps) ? squad.steps : [];
  const memberCount = Array.isArray(squad.members) ? squad.members.length : 0;

  return (
    <div className="max-w-[820px] mx-auto px-8 py-8">
      {/* Title block (Canva-style) */}
      <h1 className="font-display text-[1.6rem] leading-tight text-mos-ink tracking-[-0.01em]">
        {name}
      </h1>
      <div className="mt-2 text-[0.84rem] text-mos-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: tone.bg }} />
          {lk}・{tone.label}
        </span>
        <span className="mx-2 text-mos-hair">|</span>
        <span>{steps.length} 個工作步驟</span>
        <span className="mx-2 text-mos-hair">|</span>
        <span>{memberCount} 位成員</span>
      </div>

      {/* Author byline */}
      {(author || year) && (
        <div className="mt-3 inline-flex items-center gap-2 text-[0.78rem] text-mos-muted">
          <span className="w-6 h-6 rounded-full bg-mos-cream-dark inline-flex items-center justify-center text-[0.62rem] font-bold text-mos-ink">
            {(author?.charAt(0) ?? "·").toUpperCase()}
          </span>
          <span>方法論：{author ?? "—"}{year ? ` · ${year}` : ""}</span>
        </div>
      )}

      {/* Description */}
      {description && (
        <p className="mt-4 text-[0.92rem] text-mos-body leading-relaxed">
          {description}
        </p>
      )}

      {/* Primary CTA — 套用 / 啟動 */}
      <button
        onClick={onLaunch}
        disabled={busy}
        className="mt-6 w-full py-3 text-white font-semibold text-[0.92rem] transition-all hover:opacity-90 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: "linear-gradient(135deg, #EA580C, #F97316)",
          borderRadius: "50px",
          border: "none",
          boxShadow: "0 2px 8px rgba(234,88,12,0.25)",
        }}
      >
        {busy ? "啟動中…" : `啟動小組（含 ${steps.length} 個工作步驟）`}
      </button>

      {error && (
        <div className="mt-3 px-4 py-2.5 bg-red-50 border border-red-200 text-[0.82rem] text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Step grid (Canva's "16 pages" preview) */}
      {steps.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-[1.0rem] text-mos-ink mb-3">工作步驟預覽</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {steps.map((step: any, idx: number) => (
              <StepCard key={idx} step={step} idx={idx + 1} tone={tone} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Sub: StepCard ─────────────────────────── */

function StepCard({ step, idx, tone }: { step: any; idx: number; tone: any }) {
  const title = step.name ?? step.title ?? `Step ${idx}`;
  const skills: string[] = Array.isArray(step.requiredSkills) ? step.requiredSkills : [];
  const out = step.outputType ?? step.output ?? "";
  const agent = step.assignedAgentName ?? step.owner ?? "";
  const tool = step.tool ?? "";

  return (
    <div className="bg-white border border-mos-hair rounded-lg p-4 hover:border-mos-ink transition">
      <div className="flex items-start gap-3">
        <div
          className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-white text-[0.72rem] font-bold"
          style={{ background: tone.bg }}
        >
          {idx}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[0.86rem] font-semibold text-mos-ink line-clamp-2">{title}</div>
          {agent && (
            <div className="text-[0.72rem] text-mos-muted mt-0.5 line-clamp-1">{agent}</div>
          )}
          {(skills.length > 0 || out || tool) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {skills.slice(0, 3).map((sk, i) => (
                <span key={i} className="px-1.5 py-0.5 text-[0.66rem] bg-mos-cream-dark text-mos-ink rounded">{sk}</span>
              ))}
              {out && (
                <span className="px-1.5 py-0.5 text-[0.66rem] bg-mos-ink text-white rounded">{out}</span>
              )}
              {tool && (
                <span className="px-1.5 py-0.5 text-[0.66rem] border border-mos-hair text-mos-muted rounded">{tool}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
