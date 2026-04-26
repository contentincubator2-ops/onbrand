/**
 * MissionsHome — 任務牆 (v2 D2)
 *
 * Canva-style entry. The page renders **immediately** with a template
 * gallery so the user has something to click on within ~50ms, even before
 * the mission list query resolves. The mission list shows skeleton cards
 * while loading.
 *
 * Visual language:
 *   - Each template tile uses its layer's pastel tint (LAYER_TOKENS.bgTint)
 *     as a soft gradient — Canva-template feel.
 *   - Big emoji glyph as hero (cheap, instant render, no image fetch).
 *   - 4-col grid on desktop, 2-col on tablet, 1-col mobile.
 *   - Click a tile → mission.create with title/desc/squadSlug pre-filled →
 *     navigate straight to MissionDetail. Zero typing required.
 *   - Last tile is "自訂任務" — opens the inline form for free-form input.
 */
import React, { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import MissionCard from "../components/mission/MissionCard";
import { LAYER_TOKENS, type MosLayer } from "../../studio/primitives/tokens";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";

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

interface Template {
  emoji: string;
  layer: MosLayer;
  title: string;
  desc: string;
  /** Pre-filled mission title — what shows up in the user's mission wall. */
  missionTitle: string;
  /** Pre-filled mission description for the LLM. */
  missionDesc: string;
  /** Optional squad slug to attach immediately. Mission still works without one. */
  squadSlug?: string;
  /** Workspace tag — drives URL routing. */
  workspace?: string;
}

const TEMPLATES: Template[] = [
  {
    emoji: "📘",
    layer: "L4",
    title: "Facebook 月度經營",
    desc: "一個月的 FB 內容企劃與發文節奏，含 hook、CTA 與排程",
    missionTitle: "Facebook 月度經營計畫",
    missionDesc: "為品牌規劃下一個月的 Facebook 內容主軸、貼文節奏與互動策略，目標是提高自然觸及與互動率。",
    workspace: "facebook",
  },
  {
    emoji: "📷",
    layer: "L4",
    title: "Instagram 圖文系列",
    desc: "視覺一致的 IG 連續貼文與限動內容腳本",
    missionTitle: "Instagram 圖文系列企劃",
    missionDesc: "規劃 Instagram 連續貼文系列，包含視覺主題、文案結構、Hashtag 策略與限動延伸內容。",
    workspace: "instagram",
  },
  {
    emoji: "💼",
    layer: "L4",
    title: "LinkedIn 個人品牌",
    desc: "創辦人視角的 B2B 思想領袖內容操作",
    missionTitle: "LinkedIn 個人品牌經營",
    missionDesc: "以創辦人/高階主管視角產出 LinkedIn 思想領袖內容，建立 B2B 信任與商機。",
    workspace: "linkedin",
  },
  {
    emoji: "🎬",
    layer: "L4",
    title: "YouTube 內容企劃",
    desc: "頻道主題、影片節奏與短影音延伸",
    missionTitle: "YouTube 頻道內容企劃",
    missionDesc: "規劃 YouTube 頻道主題、長影片企劃與短影音延伸，建立穩定產出節奏。",
    workspace: "youtube",
  },
  {
    emoji: "🎯",
    layer: "L1",
    title: "品牌定位重塑",
    desc: "用 12 原型方法論梳理品牌個性與市場立足點",
    missionTitle: "品牌定位重塑（12 原型）",
    missionDesc: "用 Carol Pearson 12 原型方法論重新梳理品牌個性、原型敘事與市場立足點。",
    squadSlug: "brand-archetype-positioning",
    workspace: "brand-positioning",
  },
  {
    emoji: "🚀",
    layer: "L5",
    title: "新品上市發表",
    desc: "Jeff Walker 產品發表公式：4 階段倒數",
    missionTitle: "新品上市發表計畫",
    missionDesc: "依 Jeff Walker Product Launch Formula，規劃前置、預熱、發表、收尾 4 階段內容與訊息節奏。",
    squadSlug: "plf-launch-formula",
    workspace: "campaign",
  },
  {
    emoji: "👥",
    layer: "L3",
    title: "受眾洞察與分群",
    desc: "STP 與 Persona Canvas 產出可操作分眾",
    missionTitle: "受眾洞察與分群",
    missionDesc: "用 STP（Segmentation/Targeting/Positioning）與 Persona Canvas 產出可操作的受眾分群與訊息切入點。",
    workspace: "audience",
  },
  {
    emoji: "✏️",
    layer: "L1", // styled separately below
    title: "自訂任務",
    desc: "從零開始，自己寫標題與目標",
    missionTitle: "",
    missionDesc: "",
  },
];

export default function MissionsHome() {
  const navigate = useNavigate();
  const { brandId, brands } = useOutletContext<ShellOutletCtx>();

  const allQuery = (trpc as any).mission?.listAllForUser?.useQuery
    ? (trpc as any).mission.listAllForUser.useQuery(undefined, {
        refetchOnWindowFocus: false,
      })
    : null;

  const fallbackQuery = trpc.mission.listByBrand.useQuery(
    { brandId: brandId ?? 0 },
    { enabled: !allQuery && !!brandId, refetchOnWindowFocus: false }
  );

  const rows: MissionRow[] = useMemo(() => {
    if (allQuery?.data) return allQuery.data as MissionRow[];
    const fb = (fallbackQuery.data as any[]) ?? [];
    const brandName = brands.find((b) => b.id === brandId)?.name ?? null;
    return fb.map((m) => ({ ...m, brandName }));
  }, [allQuery?.data, fallbackQuery.data, brands, brandId]);

  const isLoading = allQuery?.isLoading ?? fallbackQuery.isLoading;

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

  const startFromTemplate = async (t: Template) => {
    if (!t.missionTitle) {
      setShowCustom(true);
      return;
    }
    setError(null);
    setCreatingTpl(t.title);
    try {
      const res = await createMission.mutateAsync({
        title: t.missionTitle,
        description: t.missionDesc || undefined,
        squadSlug: t.squadSlug,
        workspace: t.workspace ?? "",
        brandId: brandId ?? undefined,
      });
      if (!res?.id) throw new Error("後端沒有回傳 mission id");
      const ws = t.workspace || "_";
      navigate(brandId ? `/b/${brandId}/${ws}/m/${res.id}` : `/m/${res.id}`);
    } catch (e: any) {
      setError(`建立任務失敗：${e?.message ?? String(e)}`);
      setCreatingTpl(null);
    }
  };

  const submitCustom = async () => {
    setError(null);
    if (!customTitle.trim()) {
      setError("請輸入任務標題");
      return;
    }
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

  return (
    <main className="max-w-[1280px] mx-auto px-8 py-10">
      {/* Page hero */}
      <div className="mb-10">
        <div className="font-display text-[0.66rem] tracking-[0.28em] uppercase text-mos-soft">
          MISSION WALL
        </div>
        <h1 className="mt-1 font-display text-[2.4rem] leading-[1.05] text-mos-ink tracking-[-0.02em]">
          開始一個新任務
        </h1>
        <div className="mt-2 text-[0.86rem] text-mos-muted max-w-[640px]">
          選一張模板就能立刻開始 — AI 會自動填入任務說明、套用方法論、安排 squad。也可以選「自訂任務」自己寫。
        </div>
      </div>

      {/* ─── Canva-style template gallery ──────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
        {TEMPLATES.map((t) => (
          <TemplateTile
            key={t.title}
            template={t}
            busy={creatingTpl === t.title}
            disabled={!!creatingTpl}
            onClick={() => startFromTemplate(t)}
          />
        ))}
      </div>

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
        <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 text-[0.82rem] text-red-700">
          {error}
        </div>
      )}

      {/* ─── Mission list ─────────────────────────────────────────── */}
      <div className="flex items-end justify-between mt-12 mb-5">
        <div>
          <div className="font-display text-[0.62rem] tracking-[0.28em] uppercase text-mos-soft">
            MY MISSIONS
          </div>
          <h2 className="mt-1 font-display text-[1.4rem] text-mos-ink">
            進行中的任務
          </h2>
        </div>
        <button
          onClick={() => navigate("/methodology")}
          className="px-4 py-2 text-[0.7rem] tracking-[0.16em] uppercase border border-mos-hair text-mos-muted hover:text-mos-ink hover:border-mos-ink transition"
        >
          方法論型錄 →
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-wrap gap-6">
          {[0, 1, 2].map((i) => <MissionCardSkeleton key={i} />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="border border-dashed border-mos-hair bg-white py-12 px-10 text-center text-[0.86rem] text-mos-muted">
          還沒有任務 — 從上方的模板開始一個吧。
        </div>
      ) : (
        <div className="flex flex-wrap gap-6">
          {rows.map((m) => (
            <MissionCard
              key={m.id}
              title={m.title}
              brief={m.description ?? null}
              brandName={m.brandName ?? null}
              workspace={m.workspace ?? null}
              status={m.status ?? "active"}
              methodologySlug={m.squadSlug ?? null}
              methodologyName={m.squadName ?? m.methodology ?? m.squadSlug ?? null}
              methodologyLayer={m.squadLayer ?? null}
              stepCount={m.squadStepCount ?? null}
              lastUpdated={m.updatedAt ?? null}
              onClick={() => goToMission(m)}
              onCtaClick={() => goToMission(m)}
            />
          ))}
        </div>
      )}
    </main>
  );
}

/* ─────────────────────────── Template tile ─────────────────────────── */

function TemplateTile({
  template,
  busy,
  disabled,
  onClick,
}: {
  template: Template;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const tone = LAYER_TOKENS[template.layer];
  const isCustom = !template.missionTitle;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "group relative flex flex-col text-left bg-white",
        "border border-mos-hair overflow-hidden transition-all duration-200",
        "hover:shadow-lift hover:-translate-y-0.5 hover:border-mos-ink",
        disabled && !busy ? "opacity-50 pointer-events-none" : "",
        busy ? "ring-2 ring-mos-ink ring-offset-2" : "",
      ].join(" ")}
      style={{ aspectRatio: "5 / 6" }}
    >
      {/* Hero zone — pastel gradient + emoji */}
      <div
        className="relative flex-1 flex items-center justify-center overflow-hidden"
        style={{
          background: isCustom
            ? "linear-gradient(135deg, #F4F4F4 0%, #FAFAFA 100%)"
            : `linear-gradient(135deg, ${tone.bgTint} 0%, ${tone.bg}1A 100%)`,
        }}
      >
        <div
          className="text-[5.5rem] leading-none transition-transform duration-300 group-hover:scale-110"
          aria-hidden
        >
          {template.emoji}
        </div>
        {/* Layer chip top-left */}
        {!isCustom && (
          <div
            className="absolute top-3 left-3 px-2 py-0.5 text-[0.58rem] tracking-[0.22em] uppercase font-display"
            style={{ background: tone.bg, color: "#fff" }}
          >
            {template.layer} · {tone.shortLabel}
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <span className="text-[0.7rem] tracking-[0.16em] uppercase text-mos-ink">建立中…</span>
          </div>
        )}
      </div>

      {/* Footer — title + desc + CTA */}
      <div className="p-4 border-t border-mos-hair bg-white">
        <div className="font-display text-[1rem] leading-snug text-mos-ink">
          {template.title}
        </div>
        <div className="mt-1 text-[0.72rem] leading-snug text-mos-muted line-clamp-2">
          {template.desc}
        </div>
        <div
          className="mt-2.5 text-[0.62rem] tracking-[0.22em] uppercase font-display"
          style={{ color: isCustom ? "#525866" : tone.bg }}
        >
          {isCustom ? "從零開始 →" : "立即開始 →"}
        </div>
      </div>
    </button>
  );
}

/* ─────────────────────────── Skeleton card ─────────────────────────── */

function MissionCardSkeleton() {
  return (
    <div
      className="w-[320px] bg-white border border-mos-hair animate-pulse"
      style={{ aspectRatio: "4 / 5" }}
    >
      <div className="h-1/3 bg-mos-hair/40" />
      <div className="p-5 space-y-2">
        <div className="h-3 w-20 bg-mos-hair/60" />
        <div className="h-5 w-4/5 bg-mos-hair/60" />
        <div className="h-3 w-full bg-mos-hair/40" />
        <div className="h-3 w-3/5 bg-mos-hair/40" />
      </div>
    </div>
  );
}

/* ─────────────────────────── Custom form ─────────────────────────── */

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
    <div className="mb-8 border border-mos-ink bg-white p-6 shadow-card">
      <div className="font-display text-[0.66rem] tracking-[0.28em] uppercase text-mos-soft mb-3">
        CUSTOM MISSION
      </div>
      <label className="block">
        <span className="text-[0.72rem] tracking-[0.18em] uppercase text-mos-muted">任務標題</span>
        <input
          autoFocus
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit(); }}
          placeholder="例如：4 月 SoWork 自有 FB 經營"
          className="mt-2 w-full border border-mos-hair bg-white px-3 py-2.5 text-[0.92rem] text-mos-ink focus:outline-none focus:border-mos-ink"
        />
      </label>
      <label className="block mt-4">
        <span className="text-[0.72rem] tracking-[0.18em] uppercase text-mos-muted">任務說明（選填）</span>
        <textarea
          value={desc}
          onChange={(e) => onDescChange(e.target.value)}
          rows={3}
          placeholder="說一下這個任務想達成什麼、給誰看、限制是什麼。可以晚點再補。"
          className="mt-2 w-full border border-mos-hair bg-white px-3 py-2.5 text-[0.92rem] text-mos-ink focus:outline-none focus:border-mos-ink"
        />
      </label>
      {error && (
        <div className="mt-3 text-[0.78rem] text-red-600 whitespace-pre-wrap">{error}</div>
      )}
      <div className="mt-5 flex gap-3 justify-end">
        <button
          onClick={onCancel}
          disabled={busy}
          className="px-5 py-2.5 text-[0.72rem] tracking-[0.18em] uppercase text-mos-muted hover:text-mos-ink transition disabled:opacity-40"
        >
          取消
        </button>
        <button
          onClick={onSubmit}
          disabled={busy || !title.trim()}
          className="px-5 py-2.5 text-[0.72rem] tracking-[0.18em] uppercase bg-mos-ink text-white hover:bg-mos-body transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "建立中…" : "建立任務 →"}
        </button>
      </div>
    </div>
  );
}
