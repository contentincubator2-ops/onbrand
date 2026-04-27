/**
 * MissionsHome — 任務牆 (v2 D4 — Canva-faithful, monochrome)
 *
 * Reference study: Canva home (2024–2026).
 *   ─ Pastel airy gradient hero, large display headline
 *   ─ Pill search bar with subtle purple accent
 *   ─ Quick-start row: small circular tiles, NEUTRAL (no colored icons),
 *     subtle dark glyph on white bg, hover reveals layer tint
 *   ─ Section header "為你推薦的範本" with horizontal scroll of preview cards
 *   ─ Section header "最近的項目" with filter chips, dense 6-col thumb grid
 *   ─ Generous whitespace, soft shadows, 8–12px radii throughout
 *
 * The previous version used solid-color circles with emoji which felt
 * cheap. This version is monochrome by default — restraint is the point.
 * Color appears only contextually (layer chips, hover tints, hero
 * gradient) to keep the interface feeling like an agency tool, not a
 * meme generator.
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { LAYER_TOKENS, resolveLayer, type MosLayer } from "../../studio/primitives/tokens";
import { useLang } from "../../lib/i18n";
import { safeLocalizedText, pickLocaleText } from "../../lib/localizeText";
import { SquadEntityCard } from "../components/SquadEntityCard";
import MethodologyGlyph from "../components/methodology/MethodologyGlyph";
import CreateMethodologyModal, { type SourceId } from "../components/methodology/CreateMethodologyModal";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import { Avatar, Badge, Button, Input, Textarea, Tooltip, Chip, Card, CardBody, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass, faChevronDown, faArrowDownWideShort, faArrowUpWideShort,
  faTableCells, faList, faBookmark, faEllipsis,
} from "@fortawesome/free-solid-svg-icons";

interface MissionRow {
  id: number;
  title: string;
  description?: string | null;
  workspace?: string | null;
  methodology?: string | null;
  squadSlug?: string | null;
  squadName?: string | null;
  squadLayer?: string | null;
  squadStepCount?: number | null;
  brandId?: number | null;
  status?: string | null;
  brandName?: string | null;
  updatedAt?: string;
}

interface QuickTile {
  /** Short monogram or unicode glyph — stays monochrome on white. */
  glyph: string;
  label: string;
  /** Layer hint for hover tint only. */
  layer?: MosLayer;
  badge?: string;
  missionTitle: string;
  missionDesc: string;
  squadSlug?: string;
  workspace?: string;
  isMore?: boolean;
  /** Open CreateMethodologyModal instead of creating a mission. */
  opensIngest?: SourceId;
}

const QUICK_TILES: QuickTile[] = [
  { glyph: "f",   label: "Facebook",   layer: "L4",
    missionTitle: "Facebook 月度經營計畫",
    missionDesc: "為品牌規劃下一個月的 Facebook 內容主軸、貼文節奏與互動策略。",
    workspace: "facebook" },
  { glyph: "IG",  label: "Instagram",  layer: "L4",
    missionTitle: "Instagram 圖文系列企劃",
    missionDesc: "規劃 Instagram 連續貼文系列：視覺主題、文案結構、Hashtag、限動延伸。",
    workspace: "instagram" },
  { glyph: "in",  label: "LinkedIn",   layer: "L4",
    missionTitle: "LinkedIn 個人品牌經營",
    missionDesc: "以創辦人視角產出 B2B 思想領袖內容，建立信任與商機。",
    workspace: "linkedin" },
  { glyph: "▶",   label: "YouTube",    layer: "L4",
    missionTitle: "YouTube 頻道內容企劃",
    missionDesc: "規劃 YouTube 頻道主題、長影片企劃與短影音延伸。",
    workspace: "youtube" },
  { glyph: "品",  label: "品牌定位",   layer: "L1", badge: "推薦",
    missionTitle: "品牌定位重塑（12 原型）",
    missionDesc: "用 Carol Pearson 12 原型任務範本梳理品牌個性與市場立足點。",
    squadSlug: "brand-archetype-positioning",
    workspace: "brand-positioning" },
  { glyph: "新",  label: "新品上市",   layer: "L5",
    missionTitle: "新品上市發表計畫",
    missionDesc: "依 Jeff Walker Product Launch Formula，規劃 4 階段發表節奏。",
    squadSlug: "plf-launch-formula",
    workspace: "campaign" },
  { glyph: "眾",  label: "受眾分析",   layer: "L3",
    missionTitle: "受眾洞察與分群",
    missionDesc: "用 STP 與 Persona Canvas 產出可操作的受眾分群與訊息切入。",
    workspace: "audience" },
  { glyph: "PR",  label: "公關",       layer: "L4",
    missionTitle: "公關媒體曝光計畫",
    missionDesc: "規劃 PR 故事框架、新聞稿節奏與媒體名單。",
    workspace: "pr" },
  { glyph: "✉",   label: "電子報",     layer: "L4",
    missionTitle: "電子報內容規劃",
    missionDesc: "建立電子報主題曲線、開信率優化與訂閱者分眾。",
    workspace: "email" },
  { glyph: "+",   label: "自訂任務",
    missionTitle: "",
    missionDesc: "" },
  { glyph: "☁",   label: "上傳",
    missionTitle: "",
    missionDesc: "",
    opensIngest: "upload" },
  { glyph: "···", label: "顯示更多",
    missionTitle: "",
    missionDesc: "",
    isMore: true },
];

export default function MissionsHome() {
  const navigate = useNavigate();
  const { brandId, brands } = useOutletContext<ShellOutletCtx>();

  const allQuery = (trpc as any).mission?.listAllForUser?.useQuery
    ? (trpc as any).mission.listAllForUser.useQuery(undefined, { refetchOnWindowFocus: false })
    : null;
  const fallbackQuery = trpc.mission.listByBrand.useQuery(
    { brandId: brandId ?? 0 },
    { enabled: !allQuery && !!brandId, refetchOnWindowFocus: false }
  );

  // Featured entities (squad + agent + skill) via the unified endpoint.
  // Falls back to the legacy squad endpoint if entity router isn't deployed yet.
  const entityQuery = (trpc as any).entity?.listForHome?.useQuery
    ? (trpc as any).entity.listForHome.useQuery(
        { brandId: brandId ?? null },
        { refetchOnWindowFocus: false }
      )
    : null;
  const squadsQuery = !entityQuery && (trpc.squad as any).listByBrand?.useQuery
    ? (trpc.squad as any).listByBrand.useQuery(
        { brandId: brandId ?? 0 },
        { enabled: !!brandId, refetchOnWindowFocus: false }
      )
    : { data: [] };

  const rows: MissionRow[] = useMemo(() => {
    if (allQuery?.data) return allQuery.data as MissionRow[];
    const fb = (fallbackQuery.data as any[]) ?? [];
    const brandName = brands.find((b) => b.id === brandId)?.name ?? null;
    return fb.map((m) => ({ ...m, brandName }));
  }, [allQuery?.data, fallbackQuery.data, brands, brandId]);

  const isLoading = allQuery?.isLoading ?? fallbackQuery.isLoading;

  // ── Filters
  const [selectedLayer, setSelectedLayer] = useState<MosLayer | "ALL">("ALL");
  // 類型 (entity kind): squad / agent / skill — drives the dropdown
  const [kindFilter, setKindFilter] = useState<"all" | "squad" | "agent" | "skill">("all");

  // Unified entity list (preferred path) — already comes pre-shaped from server.
  // Legacy squad list (fallback) — coerce to a near-compatible shape.
  const allEntities = useMemo<any[]>(() => {
    if (entityQuery?.data) return entityQuery.data as any[];
    const legacy = (squadsQuery.data as any[]) ?? [];
    return legacy
      .filter((s) => Array.isArray(s.steps) && s.steps.length > 0)
      .map((s) => ({ ...s, kind: "squad" }));
  }, [entityQuery?.data, squadsQuery.data]);

  // Counts per layer (drives LayerNav badges)
  const layerCounts = useMemo(() => {
    const filtered = kindFilter === "all" ? allEntities : allEntities.filter((s) => s.kind === kindFilter);
    const c: Record<string, number> = { ALL: filtered.length, L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, L6: 0 };
    for (const s of filtered) {
      const k = (s.strategyLayer ?? "").toString().slice(0, 2);
      if (k in c) c[k]++;
    }
    return c;
  }, [allEntities, kindFilter]);

  // Counts per kind (drives 類型 dropdown labels)
  const kindCounts = useMemo(() => {
    const c = { squad: 0, agent: 0, skill: 0 } as Record<string, number>;
    for (const e of allEntities) {
      const k = String(e.kind ?? "squad");
      if (k in c) c[k]++;
    }
    return c;
  }, [allEntities]);

  const [searchQ, setSearchQ] = useState("");

  // Featured: filter by selected layer + searchQ, then sort, then slice
  const featured = useMemo(() => {
    const layerOrder = ["L1", "L2", "L3", "L4", "L5", "L6"];
    const q = searchQ.trim().toLowerCase();
    const synonymGroups: Array<string[]> = [
      ["貼文", "po文", "post", "posts", "content", "social-media", "social media"],
      ["文案", "copy", "copywriting", "ad copy"],
      ["廣告", "ad", "ads", "advertising", "paid", "paid-ads"],
      ["影片", "短影音", "video", "reels", "shorts", "tiktok"],
      ["品牌", "brand", "branding"],
      ["定位", "positioning"],
      ["上市", "發表", "launch", "go-to-market", "gtm"],
      ["受眾", "客群", "audience", "persona", "icp"],
      ["公關", "媒體", "pr", "press", "media-relations"],
      ["電子報", "edm", "email", "newsletter"],
      ["故事", "敘事", "story", "storytelling", "narrative"],
      ["策略", "strategy"],
      ["活動", "campaign", "event"],
      ["創意", "creative"],
    ];
    const expandTerms = (ql: string): string[] => {
      const out = new Set<string>([ql]);
      for (const g of synonymGroups) {
        if (g.some((t) => ql.includes(t.toLowerCase()) || t.toLowerCase().includes(ql))) {
          for (const t of g) out.add(t.toLowerCase());
        }
      }
      return [...out];
    };
    const matchesQ = (s: any) => {
      if (!q) return true;
      const stepText = Array.isArray(s.steps)
        ? s.steps.map((st: any) => `${st.name ?? ""} ${st.outputType ?? ""}`).join(" ")
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
        Array.isArray(s.workspace) ? s.workspace.join(" ") : (s.workspace ?? ""),
        Array.isArray(s.tags) ? s.tags.join(" ") : "",
        Array.isArray(s.useCases) ? s.useCases.join(" ") : "",
        Array.isArray(s.outputFormats) ? s.outputFormats.join(" ") : "",
        stepText,
        s.lead?.name,
        s.lead?.primarySkill,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const terms = expandTerms(q);
      return terms.some((t) => haystack.includes(t));
    };
    const filtered = allEntities
      .filter((s) => kindFilter === "all" ? true : s.kind === kindFilter)
      .filter((s) =>
        selectedLayer === "ALL"
          ? true
          : (s.strategyLayer ?? "").toString().slice(0, 2) === selectedLayer
      )
      .filter(matchesQ);
    return [...filtered]
      .sort((a, b) => {
        const la = (a.strategyLayer ?? "L9").slice(0, 2);
        const lb = (b.strategyLayer ?? "L9").slice(0, 2);
        return layerOrder.indexOf(la) - layerOrder.indexOf(lb);
      })
      .slice(0, q ? 24 : (selectedLayer === "ALL" ? 12 : 24));
  }, [allEntities, kindFilter, selectedLayer, searchQ]);
  const [ownerFilter, setOwnerFilter] = useState<"mine" | "all">("mine");
  const [sortDesc, setSortDesc] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const filteredRows = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    let r = rows;
    if (q) {
      r = r.filter((m) =>
        (m.title ?? "").toLowerCase().includes(q) ||
        (m.description ?? "").toLowerCase().includes(q) ||
        (m.squadName ?? "").toLowerCase().includes(q) ||
        (m.workspace ?? "").toLowerCase().includes(q)
      );
    }
    r = [...r].sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return sortDesc ? tb - ta : ta - tb;
    });
    return r;
  }, [rows, searchQ, sortDesc]);

  // Type (kind) dropdown options
  const kindOptions = useMemo(() => ([
    { value: "all",   label: `任何類型 (${allEntities.length})` },
    { value: "squad", label: `小組 (${kindCounts.squad ?? 0})` },
    { value: "agent", label: `Agent (${kindCounts.agent ?? 0})` },
    { value: "skill", label: `純技能 (${kindCounts.skill ?? 0})` },
  ]), [allEntities.length, kindCounts]);
  const kindLabelMap: Record<string, string> = {
    all:   "類型",
    squad: "小組",
    agent: "Agent",
    skill: "純技能",
  };

  const goToMission = (m: MissionRow) => {
    const ws = m.workspace || "_";
    if (m.brandId) navigate(`/b/${m.brandId}/${ws}/m/${m.id}`);
    else navigate(`/m/${m.id}`);
  };

  const createMission = trpc.mission.create.useMutation();
  const [showCustom, setShowCustom] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creatingTpl, setCreatingTpl] = useState<string | null>(null);
  const [createSource, setCreateSource] = useState<SourceId | null>(null);

  const startFromTile = async (t: QuickTile) => {
    if (t.isMore) { navigate("/templates"); return; }
    if (t.opensIngest) { setCreateSource(t.opensIngest); return; }
    if (!t.missionTitle) { setShowCustom(true); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    // ── Canva-style: open Picker workspace in a new tab.
    // The picker is pre-filtered by workspace (channel) or layer, lets the
    // user browse methodology squads + preview steps, then click 啟動 to
    // create the mission and land in /m/:id.
    const qs = new URLSearchParams();
    if (t.workspace) qs.set("workspace", t.workspace);
    if (t.layer) qs.set("layer", t.layer);
    qs.set("title", t.missionTitle);
    if (t.squadSlug) qs.set("slug", t.squadSlug);
    window.open(`/picker?${qs.toString()}`, "_blank", "noopener");
  };

  const submitCustom = async () => {
    setError(null);
    if (!customTitle.trim()) { setError("請輸入任務標題"); return; }
    try {
      const res = await createMission.mutateAsync({
        title: customTitle.trim(),
        description: customDesc.trim() || undefined,
        brandId: brandId ?? undefined,
      });
      if (!res?.id) throw new Error("後端沒有回傳 mission id");
      navigate(brandId ? `/b/${brandId}/_/m/${res.id}` : `/m/${res.id}`);
    } catch (e: any) {
      setError(`建立任務失敗：${e?.message ?? String(e)}`);
    }
  };

  const startFromSquad = async (sq: any) => {
    setError(null);
    setCreatingTpl(`sq-${sq.slug}`);
    try {
      const ws = (Array.isArray(sq.workspace) ? sq.workspace[0] : sq.workspace) || "";
      const res = await createMission.mutateAsync({
        title: `${sq.name ?? sq.slug}`,
        description: sq.description ?? undefined,
        squadSlug: sq.slug,
        workspace: ws,
        brandId: brandId ?? undefined,
      });
      if (!res?.id) throw new Error("後端沒有回傳 mission id");
      navigate(brandId ? `/b/${brandId}/${ws || "_"}/m/${res.id}` : `/m/${res.id}`);
    } catch (e: any) {
      setError(`建立任務失敗：${e?.message ?? String(e)}`);
      setCreatingTpl(null);
    }
  };

  return (
    <main>
      {/* ─── Hero (HeroUI content1 background) ──────────────────── */}
      <section className="relative px-8 pt-16 pb-12 border-b border-divider bg-content1">
        {/* Top-right CTAs */}
        <div className="absolute top-5 right-6 flex items-center gap-2 z-10">
          <Button
            size="sm"
            variant="bordered"
            onPress={() => navigate("/templates")}
            startContent={<span aria-hidden>✦</span>}
          >
            瀏覽方法論型錄
          </Button>
          <Button
            size="sm"
            color="primary"
            onPress={() => setCreateSource("recommended")}
            endContent={<span aria-hidden>→</span>}
          >
            立即開新任務
          </Button>
        </div>

        <div className="max-w-[1280px] mx-auto">
          <div className="text-center">
            <Chip variant="flat" color="warning" size="sm" className="mb-4">
              SoWork · Marketing OS
            </Chip>
            <h1 className="text-4xl leading-tight tracking-tight font-bold">
              今天，把哪一個<span className="text-warning">方法論</span>變成成果？
            </h1>
            <p className="mt-3 text-medium text-default-500 max-w-[560px] mx-auto leading-relaxed">
              100+ 行銷方法論小組，按 6 層策略分工。挑一層、選一個、開工。
            </p>
          </div>

          {/* Search bar */}
          <div className="mt-7 max-w-[680px] mx-auto">
            <Input
              size="lg"
              radius="full"
              variant="bordered"
              value={searchQ}
              onValueChange={setSearchQ}
              isClearable
              onClear={() => setSearchQ("")}
              placeholder="搜尋方法論、任務、最近的工作"
              startContent={<FontAwesomeIcon icon={faMagnifyingGlass} className="text-default-400" />}
            />

            {/* Filter pills under search bar — Canva style */}
            <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
              <FilterChip
                label={kindLabelMap[kindFilter] ?? "類型"}
                options={kindOptions}
                onSelect={(v) => setKindFilter(v as typeof kindFilter)}
              />
              <FilterChip
                label={
                  selectedLayer === "ALL"
                    ? "類別"
                    : `${selectedLayer}・${LAYER_TOKENS[selectedLayer].label}`
                }
                options={[
                  { value: "ALL", label: "全部層級" },
                  { value: "L1", label: "L1・品牌策略" },
                  { value: "L2", label: "L2・產品策略" },
                  { value: "L3", label: "L3・受眾策略" },
                  { value: "L4", label: "L4・通路策略" },
                  { value: "L5", label: "L5・活動策略" },
                  { value: "L6", label: "L6・驗證校準" },
                ]}
                onSelect={(v) => setSelectedLayer(v as MosLayer | "ALL")}
              />
              <FilterChip
                label={ownerFilter === "mine" ? "擁有者・我的" : "擁有者・全部"}
                options={[
                  { value: "mine", label: "我的" },
                  { value: "all", label: "全部" },
                ]}
                onSelect={(v) => setOwnerFilter(v as "mine" | "all")}
              />
              <FilterChip
                label={sortDesc ? "已修改日期・新→舊" : "已修改日期・舊→新"}
                options={[
                  { value: "desc", label: "新→舊" },
                  { value: "asc", label: "舊→新" },
                ]}
                onSelect={(v) => setSortDesc(v === "desc")}
              />
            </div>
          </div>

          {/* Monochrome quick-start tiles */}
          <div className="mt-10 flex items-start justify-center gap-2 flex-wrap">
            {QUICK_TILES.map((t) => (
              <CircleTile
                key={t.label}
                tile={t}
                busy={creatingTpl === t.label}
                disabled={!!creatingTpl}
                onClick={() => startFromTile(t)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─── Body sections ──────────────────────────────────────── */}
      <section className="max-w-[1280px] mx-auto px-8 py-10">
        {showCustom && (
          <CustomMissionForm
            title={customTitle}
            desc={customDesc}
            onTitleChange={setCustomTitle}
            onDescChange={setCustomDesc}
            onSubmit={submitCustom}
            onCancel={() => { setShowCustom(false); setError(null); }}
            busy={createMission.isPending}
            error={error}
          />
        )}
        {error && !showCustom && (
          <Card shadow="none" className="mb-6 border border-danger">
            <CardBody className="text-small text-danger">{error}</CardBody>
          </Card>
        )}

        {/* Recent missions — header + filter chips */}
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <h2 className="text-xl font-semibold">最近的任務</h2>
          <div className="flex items-center gap-2">
            <FilterChip
              label={ownerFilter === "mine" ? "擁有者" : "全部"}
              onClick={() => setOwnerFilter((v) => (v === "mine" ? "all" : "mine"))}
            />
            <FilterChip
              label={kindLabelMap[kindFilter] ?? "類型"}
              options={kindOptions}
              onSelect={(v) => setKindFilter(v as typeof kindFilter)}
            />
            <IconButton
              title={sortDesc ? "新→舊" : "舊→新"}
              onClick={() => setSortDesc((v) => !v)}
            >
              <FontAwesomeIcon icon={sortDesc ? faArrowDownWideShort : faArrowUpWideShort} />
            </IconButton>
            <IconButton
              title={viewMode === "grid" ? "切換為列表" : "切換為網格"}
              onClick={() => setViewMode((v) => (v === "grid" ? "list" : "grid"))}
            >
              <FontAwesomeIcon icon={viewMode === "grid" ? faList : faTableCells} />
            </IconButton>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <ThumbSkeleton key={i} />)}
          </div>
        ) : filteredRows.length === 0 ? (
          <Card shadow="none" className="border-2 border-dashed border-divider">
            <CardBody className="py-12 text-center text-small text-default-500">
              {searchQ ? `沒有找到「${searchQ}」相關的項目。` : "還沒有任務 — 從上方挑一個快速開始。"}
            </CardBody>
          </Card>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {filteredRows.map((m) => (
              <MissionThumb key={m.id} mission={m} onClick={() => goToMission(m)} />
            ))}
          </div>
        ) : (
          <Card shadow="none" className="border border-divider overflow-hidden">
            <div className="flex flex-col divide-y divide-divider">
              {filteredRows.map((m) => (
                <MissionListRow key={m.id} mission={m} onClick={() => goToMission(m)} />
              ))}
            </div>
          </Card>
        )}
      </section>

      {/* ─── Create-methodology modal (Canva-style source picker) ── */}
      <CreateMethodologyModal
        open={createSource !== null}
        initialSource={createSource ?? "recommended"}
        onClose={() => setCreateSource(null)}
        onCreated={(slug) => {
          setCreateSource(null);
          navigate(`/templates/${slug}`);
        }}
      />
    </main>
  );
}

/* ─────────────────────────── Section header ─────────────────────────── */

function SectionHeader({
  title, cta, onCtaClick,
}: { title: string; cta?: string; onCtaClick?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      {cta && (
        <Button size="sm" variant="light" onPress={onCtaClick}>
          {cta}
        </Button>
      )}
    </div>
  );
}

/* ─────────────────────────── Layer nav (L1–L6 chips) ──────────────── */

function LayerNav({
  selected, counts, onSelect,
}: {
  selected: MosLayer | "ALL";
  counts: Record<string, number>;
  onSelect: (l: MosLayer | "ALL") => void;
}) {
  const layers: Array<MosLayer | "ALL"> = ["ALL", "L1", "L2", "L3", "L4", "L5", "L6"];
  return (
    <div className="-mt-2 mb-5 flex items-center gap-1.5 flex-wrap">
      {layers.map((l) => {
        const isAll = l === "ALL";
        const tone = isAll ? null : LAYER_TOKENS[l as MosLayer];
        const active = selected === l;
        return (
          <Button
            key={l}
            size="sm"
            variant={active ? "solid" : "bordered"}
            color={isAll ? "default" : tone!.heroColor}
            onPress={() => onSelect(l)}
            endContent={
              <span className="text-tiny tabular-nums opacity-70">
                {counts[l] ?? 0}
              </span>
            }
          >
            {isAll ? "全部" : `${l} · ${tone!.label}`}
          </Button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── Quick-start circle (monochrome) ───────── */

function CircleTile({
  tile, busy, disabled, onClick,
}: {
  tile: QuickTile;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const tone = tile.layer ? LAYER_TOKENS[tile.layer] : null;
  return (
    <Button
      onPress={onClick}
      isDisabled={disabled}
      variant="light"
      isLoading={busy}
      className="flex flex-col items-center gap-2 h-auto w-[78px] py-2 px-1 min-w-0"
    >
      <Badge
        content={tile.badge}
        color="primary"
        isInvisible={!tile.badge}
        placement="top-right"
        size="sm"
      >
        <Avatar
          name={tile.glyph}
          color={tone?.heroColor ?? "default"}
          radius="full"
          size="md"
          isBordered
          classNames={{ name: "text-medium" }}
        />
      </Badge>
      <span className="text-tiny leading-tight text-center text-foreground">
        {tile.label}
      </span>
    </Button>
  );
}

/* ─────────────────────────── Mission thumb ─────────────────────────── */

function MissionThumb({ mission, onClick }: { mission: MissionRow; onClick: () => void }) {
  const layerStr = (mission.squadLayer ?? "").toString().slice(0, 2);
  const isLayerKnown = layerStr in LAYER_TOKENS;
  const lk = (isLayerKnown ? layerStr : "L1") as MosLayer;
  const tone = LAYER_TOKENS[lk];
  const updatedTxt = formatRelative(mission.updatedAt);
  const ws = (mission.workspace ?? "").toLowerCase();
  const wsBadge = WORKSPACE_BADGE[ws] ?? null;
  const stepCount = mission.squadStepCount ?? 0;

  return (
    <div className="group relative">
      <Card
        isPressable
        isHoverable
        onPress={onClick}
        shadow="sm"
        className="flex flex-col text-left overflow-hidden w-full"
      >
        <div
          className="relative w-full overflow-hidden bg-default-100"
          style={{ aspectRatio: "5 / 4" }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <MethodologyGlyph
              seed={mission.squadSlug ?? mission.id}
              layer={lk}
              size={70}
            />
          </div>
          {isLayerKnown && (
            <Chip
              size="sm"
              color={tone.heroColor}
              variant="solid"
              className="absolute top-2 left-2"
            >
              {lk}・{tone.label}
            </Chip>
          )}
          {stepCount > 0 && (
            <Chip size="sm" variant="flat" className="absolute top-2 right-2">
              {stepCount} 步
            </Chip>
          )}
        </div>
        <CardBody className="p-3 gap-1">
          <p className="text-small font-medium leading-snug line-clamp-2 min-h-[2.4em]">
            {mission.title}
          </p>
          {mission.squadName && (
            <p className="text-tiny text-warning truncate">
              {mission.squadName}
            </p>
          )}
          <div className="flex items-center gap-1.5 text-tiny text-default-500">
            {wsBadge && (
              <Avatar
                name={wsBadge.glyph}
                size="sm"
                className="w-4 h-4 text-tiny shrink-0"
                style={{ background: wsBadge.color, color: "white" }}
              />
            )}
            <span className="truncate">{updatedTxt}</span>
          </div>
        </CardBody>
      </Card>
      {/* Hover action — bookmark + ⋯ menu (Canva pattern) */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
        <ThumbAction title="收藏" onClick={(e) => { e.stopPropagation(); /* TODO: bookmark */ }}>
          <FontAwesomeIcon icon={faBookmark} />
        </ThumbAction>
        <ThumbAction title="更多" onClick={(e) => { e.stopPropagation(); /* TODO: menu */ }}>
          <FontAwesomeIcon icon={faEllipsis} />
        </ThumbAction>
      </div>
    </div>
  );
}

function ThumbAction({
  title, onClick, children,
}: { title: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <Tooltip content={title}>
      <Button
        isIconOnly
        size="sm"
        radius="full"
        variant="flat"
        onClick={onClick}
        aria-label={title}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

function MissionListRow({ mission, onClick }: { mission: MissionRow; onClick: () => void }) {
  const layerStr = (mission.squadLayer ?? "").toString().slice(0, 2);
  const lk = (layerStr in LAYER_TOKENS ? layerStr : "L1") as MosLayer;
  const tone = LAYER_TOKENS[lk];
  const ws = (mission.workspace ?? "").toLowerCase();
  const wsBadge = WORKSPACE_BADGE[ws] ?? null;
  return (
    <Card
      isPressable
      onPress={onClick}
      shadow="none"
      radius="none"
      className="flex flex-row items-center gap-4 px-4 py-3 bg-transparent data-[hover=true]:bg-default-100 transition text-left w-full"
    >
      <div className="shrink-0 w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden bg-default-100">
        <MethodologyGlyph seed={mission.squadSlug ?? mission.id} layer={lk} size={36} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-small font-medium truncate">{mission.title}</p>
        <div className="mt-0.5 flex items-center gap-2 text-tiny text-default-500">
          <Chip size="sm" color={tone.heroColor} variant="flat">{lk}</Chip>
          {wsBadge && <span className="capitalize">{ws}</span>}
          <span>·</span>
          <span>{formatRelative(mission.updatedAt)}</span>
        </div>
      </div>
      {wsBadge && (
        <Avatar
          name={wsBadge.glyph}
          size="sm"
          className="shrink-0 w-5 h-5 text-tiny"
          style={{ background: wsBadge.color, color: "white" }}
        />
      )}
    </Card>
  );
}

const WORKSPACE_BADGE: Record<string, { glyph: string; color: string }> = {
  facebook:  { glyph: "f",  color: "#1877F2" },
  instagram: { glyph: "ig", color: "#E4405F" },
  linkedin:  { glyph: "in", color: "#0A66C2" },
  youtube:   { glyph: "▶",  color: "#FF0000" },
  pr:        { glyph: "PR", color: "#525866" },
  email:     { glyph: "@",  color: "#7B5BC8" },
  audience:  { glyph: "眾", color: "#E07B0F" },
  campaign:  { glyph: "→",  color: "#1A9B8E" },
  "brand-positioning": { glyph: "品", color: "#5B3CC8" },
};

/* ─────────────────────────── Filter chip + Icon button ─────────────── */

function FilterChip({
  label, options, onClick, onSelect,
}: {
  label: string;
  options?: Array<{ value: string; label: string }>;
  onClick?: () => void;
  onSelect?: (v: string) => void;
}) {
  const chevron = <FontAwesomeIcon icon={faChevronDown} className="text-tiny" />;

  if (!options) {
    return (
      <Button size="sm" radius="full" variant="bordered" onPress={onClick} endContent={chevron}>
        {label}
      </Button>
    );
  }

  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <Button size="sm" radius="full" variant="bordered" endContent={chevron} className="capitalize">
          {label}
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label={label}
        onAction={(key) => onSelect?.(String(key))}
      >
        {options.map((o) => (
          <DropdownItem key={o.value} className="capitalize">{o.label}</DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
}

function IconButton({
  title, onClick, children,
}: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip content={title}>
      <Button isIconOnly size="sm" radius="full" variant="bordered" onPress={onClick} aria-label={title}>
        {children}
      </Button>
    </Tooltip>
  );
}

function formatRelative(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "剛剛編輯";
  if (min < 60) return `${min} 分鐘前編輯`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小時前編輯`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} 天前編輯`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 個月前編輯`;
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "numeric", day: "numeric" });
}

/* ─────────────────────────── Skeleton + Custom form ─────────────── */

function ThumbSkeleton() {
  return (
    <Card shadow="none" className="overflow-hidden">
      <Skeleton className="w-full" style={{ aspectRatio: "4 / 3" }} />
      <CardBody className="p-3 gap-1.5">
        <Skeleton className="h-3 w-4/5 rounded" />
        <Skeleton className="h-2 w-2/5 rounded" />
      </CardBody>
    </Card>
  );
}

function CustomMissionForm({
  title, desc, onTitleChange, onDescChange, onSubmit, onCancel, busy, error,
}: {
  title: string;
  desc: string;
  onTitleChange: (v: string) => void;
  onDescChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <Card shadow="sm" className="mb-8">
      <CardBody className="p-6 gap-4">
        <h3 className="text-small font-semibold text-default-500 uppercase tracking-wider">
          自訂任務
        </h3>
        <Input
          autoFocus
          label="任務標題"
          labelPlacement="outside"
          value={title}
          onValueChange={onTitleChange}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit(); }}
          placeholder="例如：4 月 SoWork 自有 FB 經營"
          variant="bordered"
        />
        <Textarea
          label="任務說明（選填）"
          labelPlacement="outside"
          value={desc}
          onValueChange={onDescChange}
          minRows={3}
          placeholder="說一下這個任務想達成什麼、給誰看、限制是什麼。"
          variant="bordered"
        />
        {error && (
          <p className="text-small text-danger whitespace-pre-wrap">{error}</p>
        )}
        <div className="flex gap-3 justify-end">
          <Button variant="light" onPress={onCancel} isDisabled={busy}>
            取消
          </Button>
          <Button
            color="primary"
            onPress={onSubmit}
            isDisabled={busy || !title.trim()}
            isLoading={busy}
          >
            {busy ? "建立中…" : "建立任務"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
