/**
 * TheaterPage — 內容企劃台 v2 (CJ direction 2026-05-07).
 *
 * Layout (top → bottom):
 *   1. Top bar — platform multi-select + 加入重要日子 + 開始按鈕
 *   2. 大腦區 (sticky) — 1 line-art portrait frame + speech bubble
 *      typewriter. Single speaker, slides L→R between handoffs.
 *   3. Day-by-day waterfall — 1 row per day × N selected platforms.
 *      Each cell = mockup with caption (typed) + image (lazy gen).
 *
 * Generation pacing (per CJ "max 2 captions concurrent, images 1 by 1"):
 *   captionQueue concurrency = 2
 *   imageQueue   concurrency = 1
 *   image fires only after caption done; visual cascade by date order.
 *
 * Phase 1 (this commit): pure-frontend skeleton with mocked stage progression
 * so CJ can verify the brain bar animation + cast handoff feel before we
 * wire the real `runCalendar` backend (next commit).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { fireNudge } from "../../platform/components/mia/miaNudges";
import { logActivation } from "../../platform/lib/activationTelemetry";
import { useLang } from "../../../lib/i18n";
import type { ShellOutletCtx } from "../../app/shell/ShellLayout";
import { Avatar, Button, Spinner } from "@heroui/react";
import { PlatformMockup } from "../components/PlatformMockup";
import { AddIcon, CheckIcon, ChevronRightIcon, CloseIcon, CopyIcon, DoneIcon, EditIcon, GenerateIcon, PlannerIcon, PlayIcon, RegenerateIcon, TaskCardsIcon, WaitingIcon, WarningIcon, UploadIcon } from "../../platform/components/icons";
import { HelpTip } from "../../platform/components/HelpTip";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFacebook,
  faInstagram,
  faYoutube,
  faThreads,
  faLine,
  faBloggerB,
} from "@fortawesome/free-brands-svg-icons";

/** 2026-05-10 (CJ「icon 要該社群平台 or NOTION B&W」): map iconKey to
 *  the actual platform brand glyph. Renderer always paints in neutral
 *  text color so platform shape is recognizable but palette stays B&W. */
const PLATFORM_ICON_MAP: Record<string, any> = {
  facebook:  faFacebook,
  instagram: faInstagram,
  youtube:   faYoutube,
  threads:   faThreads,
  line:      faLine,
  blog:      faBloggerB,
};
function PlatformIcon({ platformKey, className }: { platformKey: string; className?: string }) {
  const icon = PLATFORM_ICON_MAP[platformKey];
  if (!icon) return null;
  return <FontAwesomeIcon icon={icon} className={className ?? "text-neutral-700"} />;
}
import {
  THEATER_CAST,
  PLATFORM_META,
  VISIBLE_THEATER_PLATFORMS,
  HIDDEN_THEATER_PLATFORMS,
  DEFAULT_THEATER_PLATFORMS,
  sanitizeTheaterPlatforms,
  getChief,
  getQA,
  getPlatformLead,
  getPlatformWriter,
  getPlatformImage,
  castIds,
  type CastMember,
  type TheaterPlatform,
} from "../../config/theaterCast";
import EditCellModal from "../components/theater/EditCellModal";

// ─── Types ────────────────────────────────────────────────────────────────

interface ImportantDate {
  id: string;
  entityId?: number;   // DB event id when imported from brand
  date: string;        // YYYY-MM-DD  (primary/start date)
  endDate?: string;    // YYYY-MM-DD  for multi-day events
  name: string;
  promoFreqPerWeek?: number; // how many posts per week to dedicate (default 1 = just the day itself)
}

// Phase 3b — 素材 (產品 / 照片)
interface ProductMaterial {
  id: string;
  entityId?: number;   // DB product id when imported from brand
  name: string;
  usp: string;
  launchDate?: string; // YYYY-MM-DD
  photoUrl?: string;
  // Promotion schedule settings
  promoFreqPerWeek?: number; // 1–7 posts per week featuring this product
  promoStartDate?: string;   // YYYY-MM-DD (default: first day of Theater window)
  promoEndDate?: string;     // YYYY-MM-DD (default: last day of Theater window)
}
interface PhotoMaterial {
  id: string;
  url: string;
  tag: "product" | "scene" | "person" | "lifestyle";
  note?: string;
}

interface CellState {
  status: "idle" | "queued" | "writing" | "qa" | "imaging" | "done" | "failed";
  /** Phase 2: per-platform structured fields (IG hashtags, YT chapters,
   *  LINE subject, Threads thread chain, Blog h2 list, etc). Mockup pulls
   *  what it knows; missing keys render with default skeleton. */
  structured?: Record<string, any>;
  caption?: string;
  imageUrl?: string | null;
  /** Last image brief/prompt used — shown in EditCellModal for user to review/edit. */
  imagePrompt?: string;
  /** true when image generation was attempted but failed (distinct from
   *  imageUrl===null due to platform not requiring an image). */
  imageError?: boolean;
  startedAt?: number;
  doneAt?: number;
  /** Set after user schedules this cell to the calendar. */
  scheduledPostId?: number;
  scheduledAt?: string; // ISO string
}

type CellKey = string; // `${platform}::${date}`
const cellKey = (p: TheaterPlatform, d: string) => `${p}::${d}` as CellKey;

/**
 * 排程分配器 — 根據推廣設定把產品/活動分配到 7 天內的具體日期。
 * 回傳 Record<YYYY-MM-DD, { products, events }> 供 server 注入 per-cell prompt。
 */
function buildPromotionSlots(
  products: ProductMaterial[],
  events: ImportantDate[],
  days: string[], // 7 個 YYYY-MM-DD
): Record<string, { products: Array<{ name: string; usp: string }>; events: Array<{ name: string; date: string }> }> {
  const slots: Record<string, { products: Array<{ name: string; usp: string }>; events: Array<{ name: string; date: string }> }> = {};
  days.forEach((d) => { slots[d] = { products: [], events: [] }; });

  // Products — distribute based on freq + optional date range
  for (const product of products) {
    if (!product.promoFreqPerWeek) continue;
    const eligible = days.filter((d) =>
      (!product.promoStartDate || d >= product.promoStartDate) &&
      (!product.promoEndDate   || d <= product.promoEndDate),
    );
    if (!eligible.length) continue;
    const freq = Math.min(product.promoFreqPerWeek, eligible.length);
    const step = eligible.length / freq;
    for (let i = 0; i < freq; i++) {
      const day = eligible[Math.floor(i * step)];
      if (day && slots[day]) {
        slots[day].products.push({ name: product.name, usp: product.usp });
      }
    }
  }

  // Events — appear on their date + optional pre-event warm-up posts
  for (const ev of events) {
    if (slots[ev.date]) {
      slots[ev.date].events.push({ name: ev.name, date: ev.date });
    }
    // If freq > 1, warm-up posts on days leading up to the event
    const freq = ev.promoFreqPerWeek ?? 1;
    if (freq > 1) {
      const before = days.filter((d) => d < ev.date);
      const extra = Math.min(freq - 1, before.length);
      for (let i = 1; i <= extra; i++) {
        const day = before[before.length - i];
        if (day && slots[day]) {
          slots[day].events.push({ name: ev.name, date: ev.date });
        }
      }
    }
  }

  return slots;
}

interface BrainStation {
  member: CastMember;
  thought: string;
  durationMs: number;
}

// ─── Brain bar component ──────────────────────────────────────────────────

function BrainBar({
  member,
  thought,
  avatarUrl,
}: {
  member: CastMember;
  thought: string;
  avatarUrl: string | null;
}) {
  const { t } = useLang();
  // Typewriter effect for thought
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(thought.slice(0, i));
      if (i >= thought.length) clearInterval(id);
    }, 22);
    return () => clearInterval(id);
  }, [thought]);

  // 2026-05-10 (CJ B&W): brain bar uses neutral palette regardless of
  // platform. Was tinting bg + shadow with brand color.
  const accent = "#171717"; // neutral-900
  const roleLabel = {
    chief:  t("theater_role_chief"),
    lead:   member.platform ? `${PLATFORM_META[member.platform].label} ${t("theater_role_lead_suffix")}` : t("theater_role_lead_suffix"),
    writer: member.platform ? `${PLATFORM_META[member.platform].label} ${t("theater_role_writer_suffix")}` : t("theater_role_writer_suffix"),
    image:  member.platform ? `${PLATFORM_META[member.platform].label} ${t("theater_role_image_suffix")}` : t("theater_role_image_suffix"),
    qa:     t("theater_role_qa"),
  }[member.role];

  return (
    <div
      className="sticky top-0 z-30 w-full border-b border-neutral-200 backdrop-blur-md"
      style={{ background: `${accent}08` }}
    >
      <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-5">
        {/* line-art portrait frame */}
        <div className="flex-shrink-0 relative">
          <div
            className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center"
            style={{
              border: "2px solid #111",
              boxShadow: `4px 4px 0 ${accent}66`,
            }}
          >
            <Avatar
              src={avatarUrl ?? `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(member.name)}`}
              size="lg"
              className="w-16 h-16"
              radius="md"
            />
          </div>
          <div
            className="absolute -bottom-2 -right-2 px-2 py-0.5 text-[12px] font-bold text-white rounded-md"
            style={{ background: accent, border: "1.5px solid #111" }}
          >
            {roleLabel}
          </div>
        </div>

        {/* speech bubble (line-art) */}
        <div className="flex-1 relative">
          <div
            className="relative bg-white px-5 py-4 rounded-2xl"
            style={{
              border: "2px solid #111",
              boxShadow: `4px 4px 0 ${accent}33`,
              minHeight: 72,
            }}
          >
            {/* tail pointing left to portrait */}
            <div
              className="absolute left-[-10px] top-6 w-5 h-5 bg-white"
              style={{
                borderLeft: "2px solid #111",
                borderBottom: "2px solid #111",
                transform: "rotate(45deg)",
              }}
            />
            <div className="text-xs text-neutral-500 mb-1 flex items-center gap-2">
              <span className="font-semibold text-neutral-800">{member.name}</span>
              <span>·</span>
              <span>{member.title}</span>
            </div>
            <div
              className="text-[15px] leading-relaxed text-neutral-900 font-medium"
              style={{ minHeight: 22 }}
            >
              {shown}
              <span
                className="inline-block w-[2px] h-[16px] ml-0.5 align-middle bg-neutral-900"
                style={{ animation: "blink 1s steps(2) infinite" }}
              />
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes blink { 50% { opacity: 0 } }`}</style>
    </div>
  );
}

// ─── Cell card ────────────────────────────────────────────────────────────

function PlatformCell({
  platform,
  state,
  caption,
  writerAvatar,
  imageDirAvatar,
  qaAvatar,
  brandName,
  brandLogoUrl,
  onRedo,
  onCopy,
  onEdit,
  onRetryImage,
}: {
  platform: TheaterPlatform;
  state: CellState;
  caption: string;
  writerAvatar: string | null;
  imageDirAvatar: string | null;
  qaAvatar: string | null;
  brandName: string | null;
  brandLogoUrl: string | null;
  onRedo?: () => void;
  onCopy?: () => void;
  onEdit?: () => void;
  /** Re-make just this cell's image with exactly this model (the user picks; nothing switches on its own). */
  onRetryImage?: (model: "gpt-image-2" | "nano-banana") => void;
}) {
  const { t, lang } = useLang();
  const meta = PLATFORM_META[platform];
  const isIdle    = state.status === "idle" || state.status === "queued";
  const isWriting = state.status === "writing";
  const isQA      = state.status === "qa";
  const isImaging = state.status === "imaging";
  const isDone    = state.status === "done";
  const hasContent = isWriting || isQA || isImaging || isDone;

  // Tiny status pill (replaces the heavy colored header strip — mockup
  // already shows the platform identity, we just need a state indicator).
  const statusLabel =
    state.status === "queued"  ? t("theater_status_queued") :
    state.status === "writing" ? t("theater_status_writing") :
    state.status === "qa"      ? t("theater_status_qa") :
    state.status === "imaging" ? t("theater_status_imaging") :
    state.status === "done"    ? t("theater_status_done")   :
    state.status === "failed"  ? t("theater_status_failed") : t("theater_status_waiting");

  return (
    <div className="relative flex flex-col">
      {/* Status chip — only shown for non-done states (queued / writing / qa / imaging / failed).
          When done, the primary action buttons replace it. */}
      {(hasContent || state.status === "queued") && !isDone && (
        <span
          className={`absolute top-2 right-2 z-10 px-2 py-0.5 text-[12px] font-medium rounded-full shadow-sm ${
            state.status === "failed"
              ? "bg-red-600 text-white"
              : "bg-white text-neutral-700 border border-neutral-300"
          }`}
        >
          {statusLabel}
        </span>
      )}

      {/* ── Edit button — top-right, always visible when cell is done ─── */}
      {isDone && caption && onEdit && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
          <button
            onClick={() => onEdit()}
            className="flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur-sm border border-neutral-300 text-neutral-700 hover:bg-white hover:border-neutral-500 shadow-sm transition"
          >
            <EditIcon size={10} strokeWidth={2.5} />
            {lang === "en" ? "Edit" : "編輯"}
          </button>
          {/* Scheduled indicator — compact badge next to edit button */}
          {state.scheduledPostId && (
            <span className="flex items-center gap-0.5 text-[12px] font-medium px-2 py-1 rounded-lg bg-emerald-500/90 text-white backdrop-blur-sm shadow-sm">
              <DoneIcon size={10} strokeWidth={2.5} />
              {lang === "en" ? "Scheduled" : "已排程"}
            </span>
          )}
        </div>
      )}

      {/* Real platform mockup — full-width, no outer frame */}
      {hasContent ? (
        <div className="relative bg-white">
          <PlatformMockup
            variant={meta.mockup as any}
            title={(state.structured as any)?.headline ?? caption.split("\n")[0]?.slice(0, 40) ?? ""}
            brief={caption}
            brandName={brandName}
            brandLogoUrl={brandLogoUrl ?? null}
            liveCaption={caption}
            // Phase 2: pass platform-specific structured fields
            liveHashtags={(state.structured as any)?.hashtags}
            liveDescription={
              (state.structured as any)?.subject ??
              (state.structured as any)?.h2?.join(" · ") ??
              undefined
            }
            liveImageUrl={state.imageUrl ?? undefined}
            liveImageStatus={state.imageUrl ? "ready" : (isImaging ? undefined : "skipped")}
          />
          {/* Per-platform structured tail (chapters / thread / h2)
              shown beneath the mockup since not all PlatformMockup
              variants support these slots natively. */}
          {(state.structured as any)?.chapters?.length > 0 && (
            <div className="mt-1.5 px-2 py-1 bg-neutral-50 rounded text-[12px] leading-relaxed">
              <p className="text-neutral-500 mb-0.5">{t("theater_chapters_label")}</p>
              {((state.structured as any).chapters as string[]).slice(0, 5).map((c, i) => (
                <p key={i} className="text-neutral-700">{c}</p>
              ))}
            </div>
          )}
          {(state.structured as any)?.thread?.length > 1 && (
            <div className="mt-1.5 px-2 py-1 bg-neutral-50 rounded text-[12px] leading-relaxed">
              <p className="text-neutral-500 mb-0.5">{t("theater_thread_label", { n: (state.structured as any).thread.length })}</p>
              {((state.structured as any).thread as any[])
                .filter((item: any) => typeof item === "string")
                .slice(1, 4)
                .map((t: string, i: number) => (
                  <p key={i} className="text-neutral-700">{`${i + 2}. ${t.slice(0, 80)}`}</p>
                ))}
            </div>
          )}
          {isImaging && !state.imageUrl && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
              <Avatar src={imageDirAvatar ?? undefined} size="sm" className="w-8 h-8" />
              <Spinner size="sm" />
              <p className="text-[12px] text-neutral-600">{t("theater_image_dir_busy")}</p>
            </div>
          )}
          {/* Image generation failed — show retry hint instead of empty space */}
          {isDone && state.imageError && !state.imageUrl && (
            <div className="absolute bottom-2 left-0 right-0 flex justify-center items-center gap-1.5 flex-wrap px-1">
              <span className="text-[12px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                <WarningIcon size={11} /> {t("theater_image_failed")}
              </span>
              {onRetryImage && (
                <>
                  <button type="button" onClick={() => onRetryImage("gpt-image-2")}
                    className="text-[12px] text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-50 rounded-full px-2 py-0.5">
                    {lang === "en" ? "Try again" : "再試一次"}
                  </button>
                  <button type="button" onClick={() => onRetryImage("nano-banana")}
                    className="text-[12px] text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-50 rounded-full px-2 py-0.5">
                    {lang === "en" ? "Use Nano Banana" : "改用 Nano Banana"}
                  </button>
                </>
              )}
            </div>
          )}
          {isWriting && !caption && (
            <div className="absolute inset-0 bg-white/80 flex items-center gap-2 justify-center">
              <Avatar src={writerAvatar ?? undefined} size="sm" className="w-6 h-6" />
              <p className="text-[12px] text-neutral-600">{t("theater_writer_busy")}</p>
            </div>
          )}
          {isQA && (
            <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 px-2 py-1 bg-white/90 backdrop-blur-sm rounded-full shadow-sm">
              <Avatar src={qaAvatar ?? undefined} size="sm" className="w-5 h-5" />
              <Spinner size="sm" classNames={{ wrapper: "w-3 h-3", circle1: "border-b-amber-500", circle2: "border-b-amber-500" }} />
              <span className="text-[12px] text-amber-700 font-medium pr-1">{t("theater_qa_busy")}</span>
            </div>
          )}
        </div>
      ) : (
        <div
          className="bg-neutral-50 rounded-lg flex flex-col items-center gap-2 justify-center text-center px-3"
          style={{ minHeight: 200, border: "1px dashed #d4d4d4" }}
        >
          <PlatformIcon platformKey={meta.iconKey} className="text-2xl text-neutral-400" />
          <p className="text-[12px] text-neutral-400">
            {isIdle ? t("theater_cell_idle_hint", { platform: meta.short }) : "—"}
          </p>
        </div>
      )}

      {/* Double-click area on the mockup body opens edit modal */}
      {isDone && caption && onEdit && (
        <div
          className="absolute inset-0 cursor-text"
          style={{ background: "transparent" }}
          onDoubleClick={() => onEdit()}
          title={t("theater_dblclick_to_edit")}
        />
      )}

      {/* Secondary actions — copy + redo only, icon-only */}
      {isDone && caption && (
        <div className="mt-1 px-1 py-0.5 flex items-center gap-0.5">
          {onCopy && (
            <button
              onClick={onCopy}
              className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition"
              title={t("theater_copy_tip")}
            >
              <CopyIcon size={12} strokeWidth={2} />
            </button>
          )}
          {onRedo && (
            <button
              onClick={onRedo}
              className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition"
              title={t("theater_btn_redo_tip")}
            >
              <RegenerateIcon size={12} strokeWidth={2} />
            </button>
          )}
          {/* Scheduled time — tiny timestamp when scheduled */}
          {state.scheduledPostId && state.scheduledAt && (
            <span className="ml-auto text-[12px] text-emerald-600 pr-1 truncate">
              {new Date(state.scheduledAt).toLocaleString(
                lang === "en" ? "en-US" : "zh-TW",
                { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

/** localStorage key for persisting run state per brand. */
const persistKey = (brandId: number | null) =>
  brandId ? `theater:run:brand-${brandId}` : null;

interface PersistedRun {
  activePlatforms: TheaterPlatform[];
  importantDates: ImportantDate[];
  products?: ProductMaterial[];
  photos?: PhotoMaterial[];
  cells: Array<[CellKey, CellState]>;
  cellMeta: Array<[CellKey, {
    usp: string;
    importantDateName: string | null;
    brandTagline: string | null;
    brandVoice: string | null;
    weekday: string;
    date: string;
  }]>;
  savedAt: number;
}

function loadPersisted(brandId: number | null): PersistedRun | null {
  const k = persistKey(brandId);
  if (!k) return null;
  try {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // sanity check shape
    if (!parsed.cells || !Array.isArray(parsed.cells)) return null;
    // 2026-09-29（CJ）：YouTube 已下架，舊 run 存的 activePlatforms 讀進來就濾掉。
    parsed.activePlatforms = sanitizeTheaterPlatforms(parsed.activePlatforms);
    return parsed as PersistedRun;
  } catch {
    return null;
  }
}

function savePersisted(brandId: number | null, data: PersistedRun) {
  const k = persistKey(brandId);
  if (!k) return;
  try {
    localStorage.setItem(k, JSON.stringify(data));
  } catch {
    // quota exceeded etc — silently drop
  }
}

export default function TheaterPage() {
  const { t, lang } = useLang();
  const ctx = useOutletContext<ShellOutletCtx>();
  const brandId = ctx?.brandId ?? null;
  const brandName = useMemo(
    () => (ctx?.brands ?? []).find((b: any) => b.id === brandId)?.name ?? null,
    [ctx?.brands, brandId],
  );

  // 2026-06-21 (CJ「TTFV」): activation flow detection.
  // ?firstTime=1 in the URL means we got here from the onboarding wizard
  // right after express-brain finished. We:
  //   1. Fire `theater.first_time_arrived` Mia nudge once
  //   2. Display a banner showing background-pipeline progress
  //   3. Strip the param after consumption so a refresh doesn't re-fire
  const [searchParams, setSearchParams] = useSearchParams();
  const isFirstTime = searchParams.get("firstTime") === "1";

  React.useEffect(() => {
    if (!isFirstTime) return;
    fireNudge("theater.first_time_arrived");
    // Activation funnel — stage 4
    logActivation("first_theater_arrived", { brandId });
    // Clean the URL — keep ?b= but drop firstTime so refresh / share doesn't re-trigger
    const next = new URLSearchParams(searchParams);
    next.delete("firstTime");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFirstTime]);

  // Poll the background 14-step pipeline status. When it flips done → fire
  // the `brand.positioning_complete` Mia nudge so the user knows future
  // regenerations will be sharper. Only enabled when we have a brand.
  const pipelineStatusQ = (trpc as any).positioningJobs?.getStatus?.useQuery(
    { entityKind: "brand", entityId: brandId ?? 0 },
    {
      enabled: !!brandId,
      // Poll every 8s while running, stop polling once done
      refetchInterval: (data: any) =>
        data?.status === "done" || data?.status === "failed" ? false : 8_000,
    },
  );
  const prevPipelineStatusRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const s = pipelineStatusQ?.data?.status as string | undefined;
    if (!s) return;
    if (prevPipelineStatusRef.current !== "done" && s === "done") {
      fireNudge("brand.positioning_complete");
    }
    prevPipelineStatusRef.current = s;
  }, [pipelineStatusQ?.data?.status]);

  // Hydrate from localStorage on first mount (if there's a persisted run for this brand).
  const persisted = useMemo(() => loadPersisted(brandId), [brandId]);

  // selected platforms (default: FB + IG, or restored from persistence)
  // 2026-09-29（CJ）：YouTube 拿掉，預設改 FB＋IG。
  const [activePlatforms, setActivePlatforms] = useState<TheaterPlatform[]>(
    persisted?.activePlatforms ?? DEFAULT_THEATER_PLATFORMS,
  );

  // important dates user adds
  const [importantDates, setImportantDates] = useState<ImportantDate[]>(
    persisted?.importantDates ?? [],
  );
  const [products, setProducts] = useState<ProductMaterial[]>(
    persisted?.products ?? [],
  );
  const [photos, setPhotos] = useState<PhotoMaterial[]>(
    persisted?.photos ?? [],
  );

  // Phase 3b: 加入素材 modal state
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [materialTab, setMaterialTab] = useState<"event" | "product" | "photo">("event");

  // Brand entities — always loaded when brandId is known (needed for 本週焦點 chips)
  const brandEntitiesQ = (trpc as any).theater?.getBrandEntities?.useQuery(
    { brandId: brandId ?? 0 },
    { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 60_000 },
  );
  const brandProducts: Array<{ id: number; name: string; usp: string }> =
    brandEntitiesQ?.data?.products ?? [];
  const brandEvents: Array<{ id: number; name: string; startAt: string | null; endAt: string | null; usp: string }> =
    brandEntitiesQ?.data?.events ?? [];

  // ── 本週焦點 (Weekly Focus) state ─────────────────────────────────────────
  /** Product ids user selected to feature this week */
  const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(new Set());
  /** Event ids user selected (events with fixed dates become hard constraints) */
  const [selectedEventIds, setSelectedEventIds] = useState<Set<number>>(new Set());
  /** AI-generated schedule: { "YYYY-MM-DD": { type, name, angle, rationale, entityId? } } */
  const [aiSchedule, setAiSchedule] = useState<Record<string, {
    type: "product" | "event" | "brand";
    name: string;
    angle: string;
    rationale: string;
    entityId?: number;
  }> | null>(null);
  const [scheduleVisible, setScheduleVisible] = useState(false);

  const planScheduleMut = (trpc as any).theater?.planSchedule?.useMutation?.({
    onSuccess: (data: any) => {
      if (data?.ok && data.schedule && Object.keys(data.schedule).length > 0) {
        setAiSchedule(data.schedule);
        setScheduleVisible(true);
      }
    },
  });

  const handlePlanSchedule = () => {
    if (!brandId) return;
    const selProducts = brandProducts
      .filter((p) => selectedProductIds.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, usp: p.usp }));
    const selEvents = brandEvents
      .filter((e) => selectedEventIds.has(e.id) && e.startAt)
      .map((e) => ({ id: e.id, name: e.name, date: e.startAt!, usp: e.usp }));
    planScheduleMut?.mutate?.({
      brandId,
      selectedProducts: selProducts,
      lockedEvents: selEvents,
      days: days.map((d) => d.date),
    });
  };

  /** Merge AI schedule into promotionSlots for generation */
  const scheduleToPromotionSlots = (): Record<string, {
    products: Array<{ name: string; usp: string }>;
    events: Array<{ name: string; date: string }>;
  }> => {
    if (!aiSchedule) return buildPromotionSlots(products, importantDates, days.map((d) => d.date));
    const slots: Record<string, { products: Array<{ name: string; usp: string }>; events: Array<{ name: string; date: string }> }> = {};
    days.forEach((d) => { slots[d.date] = { products: [], events: [] }; });
    for (const [date, entry] of Object.entries(aiSchedule)) {
      if (!slots[date]) continue;
      if (entry.type === "product") {
        const p = brandProducts.find((bp) => bp.id === entry.entityId);
        slots[date].products.push({ name: entry.name, usp: p?.usp ?? entry.angle });
      } else if (entry.type === "event") {
        slots[date].events.push({ name: entry.name, date });
      }
    }
    return slots;
  };

  // event tab fields (reuses newDate / newDateName below)
  // product tab fields
  const [newProductName, setNewProductName] = useState("");
  const [newProductUsp, setNewProductUsp] = useState("");
  const [newProductLaunch, setNewProductLaunch] = useState("");
  // photo tab fields
  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const [newPhotoTag, setNewPhotoTag] = useState<"product" | "scene" | "person" | "lifestyle">("product");
  const [newPhotoNote, setNewPhotoNote] = useState("");

  const totalMaterials = importantDates.length + products.length + photos.length;
  const [showAddDate, setShowAddDate] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newDateName, setNewDateName] = useState("");

  // 7 calendar days starting today
  const days = useMemo(() => {
    const out: { date: string; weekday: string; label: string; isToday: boolean }[] = [];
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const wdLabels = lang === "en"
      ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      : ["日", "一", "二", "三", "四", "五", "六"];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const wd = wdLabels[d.getDay()] as string;
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const label = lang === "en"
        ? `${d.getMonth() + 1}/${d.getDate()} (${wd})`
        : `${d.getMonth() + 1}/${d.getDate()}（${wd}）`;
      out.push({
        date: iso,
        weekday: wd,
        label,
        isToday: iso === todayIso,
      });
    }
    return out;
  }, [lang]);

  // Platform connection status (for colored dots on platform selector)
  const pdConnectQ = (trpc as any).publish?.getConnectedPlatforms?.useQuery(
    { brandId: brandId ?? 0 },
    { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 30_000 },
  );
  const connectedPlatforms: Record<string, any> = (pdConnectQ?.data as any)?.connected ?? {};

  // Preload cast avatars
  const castQuery = trpc.agent.byIds.useQuery({ ids: castIds() }, {
    staleTime: 60 * 60_000,
  });
  // Theater backend
  const utils = trpc.useUtils();
  const generateCellMut  = trpc.theater.generateCell.useMutation();
  const generateImageMut = trpc.theater.generateImage.useMutation();
  const qaReviewMut      = trpc.theater.qaReviewCell.useMutation();
  const addBrandRuleMut  = trpc.theater.addBrandRule.useMutation();
  const avatarById = useMemo(() => {
    const m = new Map<number, string | null>();
    (castQuery.data ?? []).forEach((a) => m.set(a.id, a.avatarUrl));
    return m;
  }, [castQuery.data]);
  const avatarOf = (m: CastMember) => avatarById.get(m.id) ?? null;

  // Cell state map (+ ref mirror so async workers can read latest captions
  // without re-running the closure on every state change)
  const [cells, setCells] = useState<Map<CellKey, CellState>>(
    () => new Map(persisted?.cells ?? []),
  );
  const cellsRef = useRef<Map<CellKey, CellState>>(new Map(persisted?.cells ?? []));
  useEffect(() => { cellsRef.current = cells; }, [cells]);

  // Per-cell metadata captured at run time — needed for redo.
  // Map<CellKey, { usp, importantDateName, brandTagline, brandVoice }>
  const [cellMeta, setCellMeta] = useState<Map<CellKey, {
    usp: string;
    importantDateName: string | null;
    brandTagline: string | null;
    brandVoice: string | null;
    weekday: string;
    date: string;
    hook?: string | null;
    cta?: string | null;
    scoutPatterns?: string[];
  }>>(() => new Map(persisted?.cellMeta ?? []));

  // 2026-05-11 (CJ「切換品牌應該全局切換，目前還停在前一個品牌」):
  // useState only reads `persisted` on first mount. When the user switches
  // brand in the top bar, brandId changes, persisted re-computes via
  // useMemo, but state variables stay bound to the OLD brand's snapshot.
  // Fix: re-hydrate all state from new brand's localStorage on every
  // brandId change. lastBrandIdRef avoids running the reset on initial
  // mount (state was just initialised correctly).
  // 2026-05-11 (CJ「選了 event 也要 narrow」): when shell scope has an
  // active event, fetch its details and auto-add to importantDates so the
  // caption_writer naturally references it. Auto-removes when scope cleared.
  const scopeEventId = ctx?.scope?.eventId ?? null;
  const eventQuery = (trpc as any).event?.get?.useQuery
    ? (trpc as any).event.get.useQuery(
        { id: scopeEventId ?? 0 },
        { enabled: !!scopeEventId, refetchOnWindowFocus: false },
      )
    : { data: null };
  const scopeEvent = (eventQuery?.data ?? null) as { id: number; name: string; startAt?: string; endAt?: string } | null;
  useEffect(() => {
    if (!scopeEvent || !scopeEvent.startAt) return;
    const dateStr = new Date(scopeEvent.startAt).toISOString().split("T")[0];
    setImportantDates((prev) => {
      // Already added?
      if (prev.some((d) => d.id === `scope-event-${scopeEvent.id}`)) return prev;
      // Remove any previous auto-added scope event entries first
      const cleaned = prev.filter((d) => !d.id?.toString().startsWith("scope-event-"));
      return [
        ...cleaned,
        {
          id: `scope-event-${scopeEvent.id}`,
          date: dateStr,
          name: scopeEvent.name,
        } as any,
      ];
    });
  }, [scopeEvent?.id, scopeEvent?.startAt]);

  const lastBrandIdRef = useRef<number | null>(brandId);
  useEffect(() => {
    if (lastBrandIdRef.current === brandId) return; // mount or no change
    lastBrandIdRef.current = brandId;
    if (!brandId) {
      // Cleared to null — reset to defaults
      setActivePlatforms(DEFAULT_THEATER_PLATFORMS);
      setImportantDates([]);
      setProducts([]);
      setPhotos([]);
      setCells(new Map());
      setCellMeta(new Map());
      cellsRef.current = new Map();
      return;
    }
    const p = loadPersisted(brandId);
    setActivePlatforms(p?.activePlatforms ?? DEFAULT_THEATER_PLATFORMS);
    setImportantDates(p?.importantDates ?? []);
    setProducts(p?.products ?? []);
    setPhotos(p?.photos ?? []);
    setCells(new Map(p?.cells ?? []));
    setCellMeta(new Map(p?.cellMeta ?? []));
    cellsRef.current = new Map(p?.cells ?? []);
    // NOTE: in-flight orchestration from previous brand will continue
    // and may write to stale state; this is rare and acceptable for
    // trial scope. Future: pass an abort signal to runCalendar.
  }, [brandId]);

  // Persist on any state change (debounced via single effect)
  useEffect(() => {
    if (!brandId) return;
    // Skip empty initial state to avoid writing junk before first run
    if (cells.size === 0 && cellMeta.size === 0 && products.length === 0 && photos.length === 0) return;
    savePersisted(brandId, {
      activePlatforms,
      importantDates,
      products,
      photos,
      cells: Array.from(cells.entries()),
      cellMeta: Array.from(cellMeta.entries()),
      savedAt: Date.now(),
    });
  }, [brandId, activePlatforms, importantDates, products, photos, cells, cellMeta]);

  // When brand switches, hydrate from that brand's persistence (or reset).
  const lastBrandRef = useRef<number | null>(brandId);
  useEffect(() => {
    if (lastBrandRef.current === brandId) return;
    lastBrandRef.current = brandId;
    const p = loadPersisted(brandId);
    setCells(new Map(p?.cells ?? []));
    setCellMeta(new Map(p?.cellMeta ?? []));
    setActivePlatforms(p?.activePlatforms ?? DEFAULT_THEATER_PLATFORMS);
    setImportantDates(p?.importantDates ?? []);
    setProducts(p?.products ?? []);
    setPhotos(p?.photos ?? []);
  }, [brandId]);

  // Brain bar state
  const [running, setRunning] = useState(false);
  const [station, setStation] = useState<BrainStation | null>(null);
  // 2026-05-08 (CJ test report #2): track run start so we can show
  // elapsed + ETA. Per-cell wall is ~6-8s; total = cells × 7s.
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [tickNow, setTickNow] = useState<number>(Date.now());
  React.useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Build the station script when run starts
  const startRun = async () => {
    if (running) return;
    if (!brandId) {
      alert(t("theater_alert_pick_brand"));
      return;
    }
    if (activePlatforms.length === 0) {
      alert(t("theater_alert_pick_platform"));
      return;
    }

    setRunning(true);
    setRunStartedAt(Date.now());

    // Reset all cells
    const fresh = new Map<CellKey, CellState>();
    for (const p of activePlatforms) {
      for (const d of days) fresh.set(cellKey(p, d.date), { status: "queued" });
    }
    setCells(fresh);

    // 0) Fetch run plan from backend (positioning → USP pool + chief opening + lead thoughts + hook/cta plans + scout)
    let runPlan: {
      usps: string[];
      chiefOpening: string;
      leadThoughts: Record<string, string>;
      hookPlan: Record<string, string>;
      ctaPlan: Record<string, string>;
      // Phase 1.5: real scouted viral patterns per platform
      scoutByPlatform: Record<string, string[]>;
      scoutIndustry: string | null;
      // Brand-level rules merged from brand_caption_rules + positioning._assets
      brandRules?: string[];
      // Per-tab lock state from /brands page
      lockState?: { positioning: boolean; copy: boolean; visual: boolean };
      positioning: { tagline: string | null; targetAudience: string | null; brandVoice: string | null } | null;
    };
    try {
      // 2026-06-07 (CJ「切換頁面顯示無法載入定位」fix):
      // 1. Strip base64 dataURL photos before sending — server only needs
      //    {tag, note} for context, not the full image bytes. dataURL
      //    photos can be 1-2 MB each and blow past tRPC body limits.
      // 2. Use a per-request timeout so a server hiccup doesn't leave
      //    the user staring at a generic error.
      const safePhotos = photos.map((ph) => ({
        // For dataURL (base64) photos, send a placeholder marker so server
        // still gets a count + tag for context, but no megabyte payload.
        url: ph.url.startsWith("data:") ? "[uploaded-image]" : ph.url,
        tag: ph.tag,
        note: ph.note,
      }));
      runPlan = await utils.theater.runStart.fetch({
        brandId,
        platforms: activePlatforms,
        importantDates: importantDates.map((d) => ({ date: d.date, name: d.name })),
        dates: days.map((d) => d.date),
        products: products.map((p) => ({ name: p.name, usp: p.usp, launchDate: p.launchDate })),
        photos: safePhotos,
        promotionSlots: scheduleToPromotionSlots(),
      });
    } catch (e: any) {
      console.error("[theater] runStart failed:", e);
      setRunning(false);
      // Surface the actual server message when available so users (and CJ)
      // can see what really broke instead of a generic "completion required"
      // message that was misleading when positioning was actually fine.
      const msg = String(e?.message ?? e ?? "").slice(0, 240);
      const friendly = msg && !msg.includes("UNAUTHORIZED")
        ? (lang === "en"
            ? `Couldn't start: ${msg}. Try refreshing or contact support.`
            : `無法啟動：${msg}。請重新整理或聯絡客服。`)
        : t("theater_alert_pos_failed");
      alert(friendly);
      return;
    }

    const { usps, chiefOpening, leadThoughts, hookPlan, ctaPlan, scoutByPlatform, scoutIndustry, brandRules, lockState, positioning } = runPlan;
    // Surface brand rule count + lock acknowledgment in chief station
    const brandRulesCount = brandRules?.length ?? 0;
    const lockedTabs: string[] = [];
    if (lockState?.positioning) lockedTabs.push(t("theater_lock_positioning"));
    if (lockState?.copy)        lockedTabs.push(t("theater_lock_copy"));
    if (lockState?.visual)      lockedTabs.push(t("theater_lock_visual"));
    const brandTagline = positioning?.tagline ?? null;
    const brandVoice   = positioning?.brandVoice ?? null;
    const targetAudience = positioning?.targetAudience ?? null;

    // 1) Chief opening monologue (real LLM-generated)
    //    Append brand-rule count chip if any are active so user sees the
    //    /brands 文字 tab assets are flowing through.
    const joiner = lang === "en" ? ", " : "、";
    const baseChief = chiefOpening || t("theater_default_chief", {
      usps: usps.join(joiner),
      platforms: activePlatforms.map((p) => PLATFORM_META[p].short).join(joiner),
    });
    const rulesLine = brandRulesCount > 0
      ? t("theater_brand_rules_chip", { n: brandRulesCount })
      : "";
    const lockLine = lockedTabs.length > 0
      ? t("theater_locked_chip", { tabs: lockedTabs.join(" · ") })
      : "";
    const stations: BrainStation[] = [
      {
        member: getChief(),
        thought: `${baseChief}${rulesLine}${lockLine}`,
        durationMs: 6500,
      },
    ];

    // 2) Per-platform leads talk strategy (real LLM output from runStart)
    //    Phase 1.5: append a one-line scout summary so the user can SEE
    //    that real research happened on each platform.
    for (const p of activePlatforms) {
      const lead = getPlatformLead(p);
      const baseThought = leadThoughts[p] || t("theater_default_lead", { platform: PLATFORM_META[p].label });
      const scoutCount = scoutByPlatform[p]?.length ?? 0;
      const scoutLine = scoutCount > 0
        ? t("theater_scout_line", {
            n: scoutCount,
            platform: PLATFORM_META[p].label,
            industry: scoutIndustry ?? t("theater_industry_fallback"),
          })
        : "";
      stations.push({
        member: lead,
        thought: `${baseThought}${scoutLine ? "\n" + scoutLine : ""}`,
        durationMs: 4500,
      });
    }

    // 3) Writers + image dirs (one short station per platform)
    for (const p of activePlatforms) {
      const w = getPlatformWriter(p);
      stations.push({
        member: w,
        thought: t("theater_writer_intro", { platform: PLATFORM_META[p].label }),
        durationMs: 3500,
      });
    }
    for (const p of activePlatforms) {
      const i = getPlatformImage(p);
      stations.push({
        member: i,
        thought: t("theater_image_intro", { platform: PLATFORM_META[p].label }),
        durationMs: 3500,
      });
    }

    // 4) QA closing
    stations.push({
      member: getQA(),
      thought: t("theater_qa_closing"),
      durationMs: 5000,
    });

    // Drive the station carousel + cell progression (real backend)
    runStations(stations, { usps, brandTagline, brandVoice, targetAudience, hookPlan, ctaPlan, scoutByPlatform });
  };

  const stopRun = () => {
    setRunning(false);
    setStation(null);
  };

  // ── Station playback + real backend cell pump ─────────────────────────
  const stopRef = useRef(false);
  const runStations = async (
    stations: BrainStation[],
    plan: {
      usps: string[];
      brandTagline: string | null;
      brandVoice: string | null;
      // 2026-06-10 (CJ「一篇文章只針對一個 TA 講一個 USP」改造)
      targetAudience: string | null;
      hookPlan: Record<string, string>;
      ctaPlan: Record<string, string>;
      // Phase 1.5: real scout patterns per platform
      scoutByPlatform: Record<string, string[]>;
    },
  ) => {
    if (!brandId) return;
    stopRef.current = false;

    // Build queue: by date order, all platforms per date.
    // Each task carries the USP + hook + CTA + scout assigned (Phase 1+1.5).
    type Task = {
      key: CellKey;
      platform: TheaterPlatform;
      date: string;
      weekday: string;
      usp: string;
      hook: string | null;
      cta: string | null;
      scoutPatterns: string[];
      importantDateName: string | null;
    };
    const captionTasks: Task[] = [];
    let uspCursor = 0;
    // 2026-05-12 pre-launch zombie audit: guard against modulo-by-zero
    // (RangeError) and empty plan.usps. Fall back to a brand-named default
    // so theater still ships content rather than crashing.
    const uspsArr: string[] = Array.isArray(plan?.usps) && plan.usps.length > 0
      ? plan.usps
      : [(plan?.brandTagline ?? t("theater_default_core_value"))];
    for (const d of days) {
      const matching = importantDates.find((x) => x.date === d.date);
      for (const p of activePlatforms) {
        const usp = uspsArr[uspCursor % uspsArr.length] ?? uspsArr[0]!;
        uspCursor++;
        const planKey = `${d.date}::${p}`;
        captionTasks.push({
          key: cellKey(p, d.date),
          platform: p,
          date: d.date,
          weekday: d.weekday,
          usp,
          hook: plan.hookPlan[planKey] ?? null,
          cta:  plan.ctaPlan[planKey]  ?? null,
          scoutPatterns: plan.scoutByPlatform[p] ?? [],
          importantDateName: matching ? matching.name : null,
        });
      }
    }
    let captionIdx = 0;

    // Kick off station carousel (frontend-paced, decoupled from generation)
    (async () => {
      for (const s of stations) {
        if (stopRef.current) break;
        setStation(s);
        await sleep(s.durationMs);
      }
    })();

    // Wait ~6s so chief + first lead get airtime before cells start filling.
    await sleep(6000);
    if (stopRef.current) return;

    // Caption pump — concurrency 2
    const imageQueue: Task[] = [];
    const captionWorker = async () => {
      while (captionIdx < captionTasks.length) {
        const myIdx = captionIdx++;
        const task = captionTasks[myIdx];
        if (!task) continue;
        if (stopRef.current) return;

        updateCell(task.key, { status: "writing", caption: "" });
        // Persist meta for future redo on this cell (including hook + cta
        // + scout patterns so redo reproduces full context)
        setCellMeta((prev) => {
          const next = new Map(prev);
          next.set(task.key, {
            usp: task.usp,
            importantDateName: task.importantDateName,
            brandTagline: plan.brandTagline,
            brandVoice: plan.brandVoice,
            weekday: task.weekday,
            date: task.date,
            hook: task.hook,
            cta:  task.cta,
            scoutPatterns: task.scoutPatterns,
          });
          return next;
        });
        // 2026-05-12: collect first sentences of cells already written in
        // this run on the same platform — pass them so the model is forbidden
        // from repeating the same opening structure. Mitigates gpt-4.1
        // "上週遇到一位..." / "大家都以為..." template lock-in.
        const priorOpenings: string[] = [];
        for (const [k, st] of cellsRef.current.entries()) {
          if (k === task.key) continue;
          if (!st.caption || st.status === "writing") continue;
          // Same-platform priors carry more weight; mix all platforms anyway
          // since template lock-in tends to bleed across platforms too.
          const firstLine = String(st.caption).split(/[\n。！？!?]/)[0]?.trim();
          if (firstLine && firstLine.length >= 6 && firstLine.length <= 80) {
            priorOpenings.push(firstLine);
          }
          if (priorOpenings.length >= 12) break;
        }

        try {
          const r = await callWithRetry(
            () => generateCellMut.mutateAsync({
              brandId,
              platform: task.platform,
              date: task.date,
              weekday: task.weekday,
              usp: task.usp,
              importantDateName: task.importantDateName,
              brandTagline: plan.brandTagline,
              brandVoice: plan.brandVoice,
              targetAudience: plan.targetAudience,
              // Phase 1: enforce hook + CTA diversity
              hook: task.hook as any,
              cta:  task.cta  as any,
              // Phase 1.5: real scouted viral patterns for this platform
              scoutPatterns: task.scoutPatterns,
              // Phase 3a: run-scope ad-hoc rules (brand-scope rules are
              // loaded server-side from DB)
              adhocRules: runRules,
              // Phase 3b: 素材 context
              products: products.map((p) => ({ name: p.name, usp: p.usp, launchDate: p.launchDate })),
              photoTags: photos.map((ph) => ph.tag),
              // 2026-05-12: anti-repetition (server forbids these openings)
              priorOpenings: priorOpenings.length > 0 ? priorOpenings : undefined,
            }),
            { label: `generateCell ${task.key}`, timeoutMs: 90_000 },
          );
          if (stopRef.current) return;
          if (r.ok && r.caption) {
            // Show writer's raw draft + structured fields (rewrites and all — visible on purpose)
            const structured = (r as any).structured ?? {};
            updateCell(task.key, { status: "writing", caption: r.caption, structured });
            // Brief beat so user perceives the draft, then QA passes
            await sleep(450);
            if (stopRef.current) return;
            updateCell(task.key, { status: "qa", caption: r.caption, structured });
            try {
              const qa = await callWithRetry(
                () => qaReviewMut.mutateAsync({
                  draft: r.caption,
                  platform: task.platform,
                  hook: task.hook as any,
                  cta:  task.cta  as any,
                  usp:  task.usp,
                }),
                { label: `qaReview ${task.key}`, timeoutMs: 45_000, maxAttempts: 2 },
              );
              if (stopRef.current) return;
              if (qa.ok && qa.caption) {
                updateCell(task.key, { status: "qa", caption: qa.caption, structured });
              }
            } catch (e) {
              console.warn("[theater] QA review failed, keeping draft:", task.key, e);
            }
            // Hand off to image queue with the (possibly QA-cleaned) caption
            imageQueue.push({ ...task });
          } else {
            updateCell(task.key, { status: "failed" });
          }
        } catch (e) {
          console.error("[theater] caption failed:", task.key, e);
          updateCell(task.key, { status: "failed" });
        }
      }
    };

    // Image pump — concurrency 1 (one at a time, by date order)
    const imageWorker = async () => {
      while (true) {
        if (stopRef.current) return;
        const task = imageQueue.shift();
        if (!task) {
          if (captionIdx >= captionTasks.length && imageQueue.length === 0) return;
          await sleep(400);
          continue;
        }
        updateCell(task.key, { status: "imaging" });
        // Pull caption from cell state (set by caption worker)
        const captionFromState = (cellsRef.current.get(task.key)?.caption) ?? "";
        if (!captionFromState) {
          updateCell(task.key, { status: "failed" });
          continue;
        }
        try {
          const r = await callWithRetry(
            () => generateImageMut.mutateAsync({
              brandId,
              platform: task.platform,
              caption: captionFromState,
              brandTagline: plan.brandTagline,
            }),
            { label: `generateImage ${task.key}`, timeoutMs: 120_000 },
          );
          if (stopRef.current) return;
          if (r.ok && r.imageUrl) {
            updateCell(task.key, { status: "done", imageUrl: r.imageUrl, imagePrompt: (r as any).brief ?? undefined, imageError: false, doneAt: Date.now() });
          } else {
            // image failed → keep caption, mark as done with imageError so UI can show retry hint
            console.error("[theater] image failed:", task.key, (r as any).error);
            updateCell(task.key, { status: "done", imageUrl: null, imageError: true, doneAt: Date.now() });
          }
        } catch (e) {
          console.error("[theater] image failed:", task.key, e);
          updateCell(task.key, { status: "done", imageUrl: null, imageError: true, doneAt: Date.now() });
        }
      }
    };

    // Phase 2: bumped image worker pool 1 → 3. Captions still 2-wide so
    // we don't slam the LLM provider, but Flux can comfortably handle 3
    // parallel renders and cell completion velocity matters more than
    // image-by-image waterfall (CJ flagged '圖等很久' as a P1).
    await Promise.all([
      captionWorker(),
      captionWorker(),
      imageWorker(),
      imageWorker(),
      imageWorker(),
    ]);
    setRunning(false);

    // ── Mia nudge: generation complete ───────────────────────────────────
    // 2026-06-12: switched from inline dispatchEvent to catalog-driven
    // fireNudge. Message text + action button live in miaNudgeCatalog
    // under "theater.generation_done". Page just reports the event.
    setTimeout(() => {
      // 2026-06-21 (CJ「TTFV」): on the user's FIRST 7-day generation
      // (sessionStorage flag), fire the dedicated first-week nudge
      // instead of the generic one — the activation moment is different
      // ("21 cards exist!" vs "you ran the workflow again").
      const isFirstGen =
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem("theater.firstGenerated") !== "1";
      if (isFirstGen) {
        try { sessionStorage.setItem("theater.firstGenerated", "1"); } catch {}
        fireNudge("theater.first_week_generated");
        // Activation funnel — stage 5 (final TTFV stop point)
        logActivation("first_week_generated", {
          brandId,
          platforms: activePlatforms.length,
        });
      } else {
        fireNudge("theater.generation_done");
      }
    }, 800);
  };

  const updateCell = (key: CellKey, patch: Partial<CellState>) => {
    setCells((prev) => {
      const next = new Map(prev);
      const cur = next.get(key) ?? { status: "idle" };
      next.set(key, { ...cur, ...patch });
      return next;
    });
  };

  // 2026-09-21 (CJ「不行的時候，再讓用戶選 NANO BANANA」): re-make one cell's image with the model
  // the user picked. The caption stays; a failure keeps the cell's retry buttons.
  const retryCellImage = async (key: CellKey, platform: TheaterPlatform, model: "gpt-image-2" | "nano-banana") => {
    const caption = cells.get(key)?.caption;
    if (!brandId || !caption) return;
    updateCell(key, { status: "imaging", imageError: false });
    try {
      const img: any = await generateImageMut.mutateAsync({
        brandId, platform, caption, brandTagline: cellMeta.get(key)?.brandTagline ?? null, modelChoice: model,
      });
      updateCell(key, {
        status: "done", imageUrl: img.ok ? img.imageUrl : null, imageError: !img.ok,
        imagePrompt: img.brief ?? undefined, doneAt: Date.now(),
      });
    } catch (e) {
      console.error("[theater] cell image retry failed:", key, e);
      updateCell(key, { status: "done", imageUrl: null, imageError: true });
    }
  };

  // ── Per-cell redo: re-runs caption + image with stored meta ───────────
  const redoCell = async (key: CellKey, platform: TheaterPlatform) => {
    if (!brandId) return;
    const meta = cellMeta.get(key);
    if (!meta) {
      console.warn("[theater] redo: no meta for", key);
      return;
    }
    updateCell(key, { status: "writing", caption: "" });
    try {
      const r = await generateCellMut.mutateAsync({
        brandId,
        platform,
        date: meta.date,
        weekday: meta.weekday,
        usp: meta.usp,
        importantDateName: meta.importantDateName,
        brandTagline: meta.brandTagline,
        brandVoice: meta.brandVoice,
        // Phase 1: redo reuses the original hook + cta assignment
        hook: meta.hook as any,
        cta:  meta.cta  as any,
        // Phase 1.5: redo reuses the same scout patterns
        scoutPatterns: meta.scoutPatterns,
      });
      if (!r.ok || !r.caption) {
        updateCell(key, { status: "failed" });
        return;
      }
      const newStructured = (r as any).structured ?? {};
      updateCell(key, { status: "imaging", caption: r.caption, structured: newStructured });
      const img = await generateImageMut.mutateAsync({
        brandId,
        platform,
        caption: r.caption,
        brandTagline: meta.brandTagline,
      });
      updateCell(key, {
        status: "done",
        caption: r.caption,
        structured: newStructured,
        imageUrl: img.ok ? img.imageUrl : null,
        doneAt: Date.now(),
      });
    } catch (e) {
      console.error("[theater] redo failed:", key, e);
      updateCell(key, { status: "failed" });
    }
  };

  const copyCaption = async (key: CellKey) => {
    const cap = cells.get(key)?.caption;
    if (!cap) return;
    try {
      await navigator.clipboard.writeText(cap);
    } catch {
      // fallback: select textarea trick
      const ta = document.createElement("textarea");
      ta.value = cap;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  };

  // ── Phase 3a: inline edit + 修改規則 modal ──────────────────────
  /** Inline edit handler — user committed new caption text directly */

  /** Run-scope rules: applied to all future cells in this run only.
   *  Persistent across cells in the run; cleared on stop / new run. */
  const [runRules, setRunRules] = useState<string[]>([]);

  // ── Edit cell modal state ────────────────────────────────────────────────
  const [editModal, setEditModal] = useState<{
    key: CellKey;
    platform: TheaterPlatform;
    date: string;
    dateLabel: string;
  } | null>(null);

  const openEditModal = (key: CellKey, platform: TheaterPlatform, date: string, dateLabel: string) => {
    setEditModal({ key, platform, date, dateLabel });
  };

  // ── Schedule modal state ─────────────────────────────────────────────────
  const scheduleCellMut = (trpc as any).theater?.scheduleCell?.useMutation?.();
  const [scheduleModal, setScheduleModal] = useState<{
    key: CellKey;
    platform: TheaterPlatform;
    date: string; // YYYY-MM-DD
    caption: string;
    imageUrl?: string | null;
  } | null>(null);
  // Prefill datetime: the cell's date at 09:00
  const [scheduleAt, setScheduleAt] = useState<string>("");
  const [scheduleDraft, setScheduleDraft] = useState<string>("");

  const closeScheduleModal = () => setScheduleModal(null);

  const submitSchedule = async () => {
    if (!scheduleModal || !brandId) return;
    try {
      const result = await scheduleCellMut?.mutateAsync?.({
        brandId,
        platform: scheduleModal.platform,
        date: scheduleModal.date,
        caption: scheduleDraft.trim() || scheduleModal.caption,
        imageUrl: scheduleModal.imageUrl,
        scheduledAt: new Date(scheduleAt).toISOString(),
      });
      if (result?.ok) {
        updateCell(scheduleModal.key, {
          scheduledPostId: result.scheduledPostId,
          scheduledAt: new Date(scheduleAt).toISOString(),
          caption: scheduleDraft.trim() || scheduleModal.caption,
        });
        closeScheduleModal();
      }
    } catch (e: any) {
      // Show a user-visible error — the modal stays open so the user can retry
      alert(e?.message ?? String(e));
    }
  };

  /** Modal for marking a cell as needing a fix */
  const [ruleModal, setRuleModal] = useState<{ key: CellKey; platform: TheaterPlatform } | null>(null);
  const [ruleText, setRuleText] = useState("");
  const [ruleScope, setRuleScope] = useState<"post" | "run" | "brand">("post");

  const closeRuleModal = () => { setRuleModal(null); setRuleText(""); };
  const submitRule = async () => {
    if (!ruleModal || !ruleText.trim()) return;
    const rule = ruleText.trim();
    const { key, platform } = ruleModal;
    if (ruleScope === "brand" && brandId) {
      // Persist to DB → all future runs for this brand will get this rule
      try {
        await addBrandRuleMut.mutateAsync({ brandId, rule, scope: "brand" });
      } catch (e) {
        console.error("[theater] addBrandRule failed:", e);
      }
    } else if (ruleScope === "run") {
      // Stash in client state for the rest of this run
      setRunRules((prev) => [...prev, rule]);
    }
    closeRuleModal();
    // Re-run this cell with the rule applied (single-post + run-scope both
    // benefit from immediate redo; brand-scope also redoes since the
    // user wants to see the fix now)
    const meta = cellMeta.get(key);
    if (!meta || !brandId) return;
    updateCell(key, { status: "writing", caption: "" });
    try {
      const adhoc = ruleScope === "post"
        ? [rule]
        : ruleScope === "run"
          ? [...runRules, rule]
          : []; // brand-scope is loaded server-side from DB, no adhoc needed
      const r = await generateCellMut.mutateAsync({
        brandId,
        platform,
        date: meta.date,
        weekday: meta.weekday,
        usp: meta.usp,
        importantDateName: meta.importantDateName,
        brandTagline: meta.brandTagline,
        brandVoice: meta.brandVoice,
        hook: meta.hook as any,
        cta:  meta.cta  as any,
        scoutPatterns: meta.scoutPatterns,
        adhocRules: adhoc,
      });
      if (!r.ok || !r.caption) {
        updateCell(key, { status: "failed" });
        return;
      }
      const structured = (r as any).structured ?? {};
      // Skip QA on rule-driven redo (user gave explicit edit; trust LLM)
      updateCell(key, { status: "imaging", caption: r.caption, structured });
      const img = await generateImageMut.mutateAsync({
        brandId, platform, caption: r.caption, brandTagline: meta.brandTagline,
      });
      updateCell(key, {
        status: "done",
        caption: r.caption,
        structured,
        imageUrl: img.ok ? img.imageUrl : null,
        doneAt: Date.now(),
      });
    } catch (e) {
      console.error("[theater] rule redo failed:", e);
      updateCell(key, { status: "failed" });
    }
  };

  // ── Important date add ────────────────────────────────────────────────
  const handleAddDate = () => {
    if (!newDate || !newDateName) return;
    setImportantDates((prev) => [
      ...prev,
      { id: `${newDate}-${Math.random().toString(36).slice(2, 7)}`, date: newDate, name: newDateName },
    ].sort((a, b) => a.date.localeCompare(b.date)));
    setNewDate("");
    setNewDateName("");
    setShowAddDate(false);
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Brain bar (sticky) */}
      {station ? (
        <BrainBar
          member={station.member}
          thought={station.thought}
          avatarUrl={avatarOf(station.member)}
        />
      ) : (
        <div className="sticky top-0 z-30 w-full border-b border-neutral-200 bg-white">
          <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-neutral-500" aria-label={t("theater_idle_brain")}>
              <span className="inline-flex items-center gap-1"><TaskCardsIcon size={14} />{lang === "en" ? "Platforms" : "平台"}</span>
              <ChevronRightIcon size={10} className="text-neutral-300" />
              <span className="inline-flex items-center gap-1"><PlannerIcon size={14} />{lang === "en" ? "Key dates" : "重要日子"}</span>
              <ChevronRightIcon size={10} className="text-neutral-300" />
              <span className="inline-flex items-center gap-1"><GenerateIcon size={14} />{lang === "en" ? "Generate" : "生成"}</span>
              <HelpTip>{t("theater_idle_brain")}</HelpTip>
            </div>
          </div>
        </div>
      )}

      {/* 2026-06-21 (CJ「TTFV」): background-pipeline progress banner.
          Shows while the 14-step SoWork positioning is still running
          (user got here via Express Brain after onboarding). Disappears
          when status is "done" or "failed" — the Mia nudge
          `brand.positioning_complete` takes over from there. */}
      {pipelineStatusQ?.data &&
       pipelineStatusQ.data.status !== "done" &&
       pipelineStatusQ.data.status !== "failed" && (
        <div
          className="max-w-[1400px] mx-auto px-6 mt-4"
        >
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3 text-[13px]"
            style={{
              background: "#FAFAFA",
              border: "1px solid #D4D4D8",
              color: "#27272a",
            }}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{
                background: "#18181b",
                animation: "miaUnreadRipple 1.6s ease-in-out infinite",
              }}
              aria-hidden
            />
            <span className="flex-1">
              {lang === "en" ? (
                <>
                  <strong>Express Brain</strong> · full positioning running — we'll notify you when it's done
                </>
              ) : (
                <>
                  <strong>品牌大腦初版</strong> · 完整定位背景進行中，完成後會通知你
                </>
              )}
            </span>
            <span
              className="text-[12px] font-mono tabular-nums opacity-70"
            >
              {pipelineStatusQ.data.currentStep ?? 0} / {pipelineStatusQ.data.totalSteps ?? 14}
            </span>
          </div>
          <style>{`
            @keyframes miaUnreadRipple {
              0%, 100% { transform: scale(1);   opacity: 1;   }
              50%      { transform: scale(1.4); opacity: 0.6; }
            }
          `}</style>
        </div>
      )}

      {/* 2026-05-11 (CJ「每一個功能按下去，標題 header 樣式都長這樣」):
          canonical header template — eyebrow / gradient title / serif
          subtitle / when-to-use line. Same as /30s · /60s · /99s. */}
      <div className="max-w-[1400px] mx-auto px-6 pt-10 pb-4">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-4">
          <div className="text-center mx-auto" style={{ flex: "1 1 auto" }}>
            {t("theater_hero_eyebrow") && (
              <p className="text-[12px] font-semibold uppercase tracking-[0.25em] text-default-600 mb-3">
                {t("theater_hero_eyebrow")}
              </p>
            )}
            <div className="inline-flex items-center gap-2">
              <h1
                className="font-semibold tracking-tight leading-tight text-default-900"
                style={{ fontSize: "clamp(1.6rem, 3vw, 2.25rem)" }}
              >
                {t("theater_title")}
              </h1>
              <HelpTip>
                {t("theater_hero_subtitle", { brand: brandName ?? t("theater_brand_placeholder") })}
                <span className="block mt-1 text-default-500">
                  {t("theater_suitable_label")}{t("theater_suitable_value")}
                </span>
              </HelpTip>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!running && cells.size > 0 && (
              <Button
                size="sm"
                variant="light"
                onPress={() => {
                  if (!confirm(t("theater_confirm_clear"))) return;
                  setCells(new Map());
                  setCellMeta(new Map());
                  setStation(null);
                  const k = persistKey(brandId);
                  if (k) localStorage.removeItem(k);
                }}
                startContent={<RegenerateIcon size={13} strokeWidth={2} />}
              >
                {t("theater_btn_clear")}
              </Button>
            )}
            {!running ? (
              <Button
                color="primary"
                onPress={startRun}
                startContent={<PlayIcon size={14} strokeWidth={2} />}
                isDisabled={!brandId}
              >
                {cells.size > 0 ? t("theater_btn_restart") : t("theater_btn_start")}
              </Button>
            ) : (() => {
              // 2026-05-08 (CJ test report #2): live elapsed + ETA + done/total
              const total = cells.size;
              let done = 0;
              cells.forEach((c) => { if (c.status === "done" || c.status === "failed") done++; });
              const elapsedMs = runStartedAt ? tickNow - runStartedAt : 0;
              const elapsedSec = Math.floor(elapsedMs / 1000);
              // Per-cell budget ~7s; with parallelism factor 2, total ≈ ceil(total/2) * 7s
              const expectedTotalSec = Math.ceil(total / 2) * 7;
              const remainingSec = Math.max(0, expectedTotalSec - elapsedSec);
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex flex-col items-end">
                    <div className="text-[12px] text-default-600 tabular-nums">
                      {done}/{total} · {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, "0")}
                      {" / "}
                      ~{Math.floor(expectedTotalSec / 60)}:{String(expectedTotalSec % 60).padStart(2, "0")}
                      {remainingSec > 0 && elapsedSec < expectedTotalSec && (
                        <span className="text-default-400 ml-1">{t("theater_progress_remaining", { n: remainingSec })}</span>
                      )}
                    </div>
                    <div className="w-32 h-1 bg-default-200 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-zinc-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <Button
                    color="danger"
                    variant="flat"
                    onPress={() => { stopRef.current = true; stopRun(); }}
                    startContent={<CloseIcon size={14} strokeWidth={2} />}
                  >
                    {t("theater_btn_stop")}
                  </Button>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Platform multi-select */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-xs text-neutral-500 mr-2">{t("theater_label_platforms")}</span>
          {VISIBLE_THEATER_PLATFORMS.map((p) => {
            const meta = PLATFORM_META[p];
            const on = activePlatforms.includes(p);
            return (
              <button
                key={p}
                onClick={() =>
                  setActivePlatforms((prev) =>
                    prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                  )
                }
                disabled={running}
                className={`px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 transition border ${
                  on
                    ? "bg-neutral-900 text-white border-neutral-900 font-semibold"
                    : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400 font-medium"
                } ${running ? "opacity-70" : ""}`}
              >
                <PlatformIcon platformKey={meta.iconKey} className={on ? "text-white" : "text-neutral-700"} />
                <span>{meta.label}</span>
                {/* Connection status dot — green = connected, hollow amber = not connected */}
                {connectedPlatforms[p] ? (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: on ? "#4ade80" : "#16a34a" }}
                    title={lang === "en" ? "Account connected" : "帳號已連接"}
                  />
                ) : (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0 border flex-shrink-0"
                    style={{ borderColor: on ? "rgba(255,255,255,0.5)" : "#d97706", opacity: 0.7 }}
                    title={lang === "en" ? "Account not connected" : "帳號尚未連接"}
                  />
                )}
                {on && <CheckIcon size={12} strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>

        {/* ── 本週焦點 — product/event chips + AI 排程 ──────────────── */}
        {(brandProducts.length > 0 || brandEvents.length > 0) && (
          <div className="mt-4 p-4 rounded-xl border border-neutral-200 bg-white space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-neutral-500">
                {lang === "en" ? "Weekly focus" : "本週焦點"}
              </p>
              {(selectedProductIds.size > 0 || selectedEventIds.size > 0) && (
                <button
                  onClick={handlePlanSchedule}
                  disabled={planScheduleMut?.isPending || running}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-zinc-600 text-white hover:bg-zinc-700 disabled:opacity-50 transition flex items-center gap-1.5"
                >
                  {planScheduleMut?.isPending
                    ? (lang === "en" ? "Planning…" : "排程中…")
                    : (lang === "en" ? "AI Schedule" : "AI 排程")}
                </button>
              )}
            </div>

            {/* Product chips */}
            {brandProducts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {brandProducts.map((p) => {
                  const selected = selectedProductIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProductIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                        setAiSchedule(null); // reset schedule when selection changes
                        return next;
                      })}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition ${
                        selected
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white text-neutral-600 border-neutral-300 hover:border-emerald-400"
                      }`}
                    >
                      {selected ? <CheckIcon size={10} className="inline mr-1" /> : null}{p.name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Event chips (with fixed dates) */}
            {brandEvents.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {brandEvents.map((e) => {
                  const selected = selectedEventIds.has(e.id);
                  return (
                    <button
                      key={e.id}
                      onClick={() => setSelectedEventIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
                        setAiSchedule(null);
                        return next;
                      })}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition ${
                        selected
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-white text-neutral-600 border-neutral-300 hover:border-amber-400"
                      }`}
                    >
                      <PlannerIcon size={10} className="inline mr-1" />
                      {selected ? <CheckIcon size={10} className="inline mr-1" /> : null}{e.name}
                      {e.startAt && <span className="ml-1 opacity-70 text-[12px]">{e.startAt.slice(5)}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* AI Schedule preview */}
            {scheduleVisible && aiSchedule && (
              <div className="mt-1 border-t border-neutral-100 pt-3 space-y-1.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12px] font-semibold text-zinc-700">
                    {lang === "en" ? "AI suggested schedule" : "AI 排程建議"}
                  </p>
                  <button onClick={() => setScheduleVisible(false)} className="text-[12px] text-neutral-400 hover:text-neutral-700">
                    {lang === "en" ? "hide" : "收起"}
                  </button>
                </div>
                {days.map((d) => {
                  const entry = aiSchedule[d.date];
                  if (!entry) return null;
                  const color = entry.type === "product" ? "#3f3f46" : entry.type === "event" ? "#71717a" : "#6b7280";
                  return (
                    <div key={d.date} className="flex items-start gap-2 text-[12px]">
                      <span className="text-neutral-400 w-14 shrink-0 tabular-nums">{d.label}</span>
                      <span className="font-medium shrink-0" style={{ color }}>{entry.name}</span>
                      <span className="text-neutral-500 truncate" title={entry.rationale}>· {entry.angle}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Phase 3b: 加入素材 toolbar — prominent button + summary chips */}
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <button
            onClick={() => { setMaterialModalOpen(true); setMaterialTab("event"); }}
            className="px-4 py-2 rounded-lg bg-zinc-50 hover:bg-zinc-100 text-zinc-700 hover:text-zinc-900 border-2 border-zinc-200 hover:border-zinc-400 flex items-center gap-2 text-sm font-medium transition shadow-sm"
            disabled={running}
          >
            <AddIcon size={16} strokeWidth={2.5} />
            <span>{t("theater_btn_add_materials")}</span>
            {totalMaterials > 0 && (
              <span className="ml-1 text-[12px] px-1.5 py-0.5 rounded-full bg-zinc-500 text-white font-bold">
                {totalMaterials}
              </span>
            )}
          </button>

          {/* Inline summary chips */}
          {importantDates.map((d) => (
            <span key={d.id} className="px-2.5 py-1 text-xs rounded-lg bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5">
              <PlannerIcon size={11} strokeWidth={2} />
              <span className="font-semibold">{d.date.slice(5)}</span>
              <span>{d.name}</span>
              <button onClick={() => setImportantDates((prev) => prev.filter((x) => x.id !== d.id))} className="text-amber-600 hover:text-amber-900">
                <CloseIcon size={11} />
              </button>
            </span>
          ))}
          {products.map((p) => (
            <span key={p.id} className="px-2.5 py-1 text-xs rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
              <span className="font-semibold">{p.name}</span>
              <button onClick={() => setProducts((prev) => prev.filter((x) => x.id !== p.id))} className="text-emerald-600 hover:text-emerald-900">
                <CloseIcon size={11} />
              </button>
            </span>
          ))}
          {photos.map((ph) => (
            <span key={ph.id} className="px-2.5 py-1 text-xs rounded-lg bg-zinc-50 text-zinc-800 border border-zinc-200 flex items-center gap-1.5">
              <span>{t(`theater_photo_tag_${ph.tag}` as any)}</span>
              <button onClick={() => setPhotos((prev) => prev.filter((x) => x.id !== ph.id))} className="text-zinc-600 hover:text-zinc-900">
                <CloseIcon size={11} />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Pinterest-style masonry — all cells flow into a single multi-column
          stream, sorted by date then platform. Cells have varying heights
          (each platform mockup has its own natural shape) so CSS columns
          give the proper masonry packing. */}
      <div className="max-w-[1600px] mx-auto px-6 pb-16">
        {!brandId ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
            <p className="text-neutral-500 text-sm">{t("theater_must_pick_brand")}</p>
          </div>
        ) : (
          // 2026-05-10 (CJ「5/13 整天消失」根因): 舊版 column-count masonry 把
          // (day × platform) cells flatten 後重新 pack 成 N 個 CSS column，造成
          // 5/13 cells 視覺上被插到別 column 尾巴 → 整欄看起來空白。改成 day-grid：
          // 每個 day 自己一欄，platform cells 在欄位內垂直 stack。
          <div className="grid gap-3" style={{
            gridTemplateColumns: `repeat(${days.length}, minmax(260px, 1fr))`,
            overflowX: "auto",
          }}>
            {days.map((d) => {
              const matchingDate = importantDates.find((x) => x.date === d.date);
              return (
                <div key={d.date} className="space-y-3 min-w-0">
                  {/* Day header */}
                  <div className={`flex items-center gap-1.5 px-1 py-1.5 ${d.isToday ? "bg-neutral-900 text-white rounded-md px-2" : ""}`}>
                    <span className={`text-[12px] font-semibold ${d.isToday ? "text-white" : "text-neutral-700"}`}>
                      {d.label}
                    </span>
                    {d.isToday && (
                      <span className="text-[12px] font-bold tracking-wider bg-white text-neutral-900 px-1 py-0.5 rounded">
                        {t("theater_today_pill")}
                      </span>
                    )}
                    {matchingDate && (
                      <span className="text-[12px] text-neutral-700 bg-neutral-100 border border-neutral-200 px-1.5 py-0.5 rounded">
                        {matchingDate.name}
                      </span>
                    )}
                  </div>
                  {/* Platform cells stacked vertically inside this day */}
                  {activePlatforms.map((p) => {
                    const key = cellKey(p, d.date);
                    const state = cells.get(key) ?? { status: "idle" as const };
                    return (
                      <div key={key}>
                        <PlatformCell
                      platform={p}
                      state={state}
                      caption={state.caption ?? ""}
                      writerAvatar={avatarOf(getPlatformWriter(p))}
                      imageDirAvatar={avatarOf(getPlatformImage(p))}
                      qaAvatar={avatarOf(getQA())}
                      brandName={brandName}
                      brandLogoUrl={(ctx?.brands ?? []).find((b: any) => b.id === brandId)?.logoUrl ?? null}
                      onCopy={() => copyCaption(key)}
                      onRedo={() => redoCell(key, p)}
                      onRetryImage={(model) => retryCellImage(key, p, model)}
                      onEdit={() => openEditModal(key, p, d.date, d.label)}
                        />
                      {/* Platform connection status chip on done cells — always visible */}
                      {state.status === "done" && (
                        <div className="flex justify-end mt-0.5 px-1">
                          {connectedPlatforms[p] ? (
                            <span className="text-[12px] px-1.5 py-0.5 rounded-full bg-success-50 border border-success-200 text-success-700 font-medium">
                              <CheckIcon size={10} /> {lang === "en" ? "Ready" : "可發布"}
                            </span>
                          ) : (
                            <span className="text-[12px] px-1.5 py-0.5 rounded-full bg-warning-50 border border-warning-200 text-warning-700 font-medium">
                              <WarningIcon size={10} /> {lang === "en" ? "Connect account first" : "需先連接帳號"}
                            </span>
                          )}
                        </div>
                      )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Phase 3b — 加入素材 modal (3 tabs: 活動 / 產品 / 照片) */}
        {materialModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={() => setMaterialModalOpen(false)}>
            <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full p-6 relative" onClick={(e) => e.stopPropagation()}>
              {/* 2026-05-10 (CJ feedback「產品 tab 沒有關閉鈕」): always-visible
                  ✕ in top-right regardless of which tab is active. */}
              <button
                onClick={() => setMaterialModalOpen(false)}
                className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-700 p-1 rounded-md hover:bg-neutral-100 transition"
                title={t("theater_close_tip")}
              >
                <CloseIcon size={18} />
              </button>
              <h3 className="text-base font-semibold text-neutral-900 mb-1">{t("theater_modal_materials_title")}</h3>
              <p className="text-xs text-neutral-500 mb-4">{t("theater_modal_materials_subtitle")}</p>

              {/* Tab switcher */}
              <div className="flex items-center gap-1 mb-5 border-b border-neutral-200">
                {([
                  { v: "event"   as const, label: t("theater_tab_event"),   count: importantDates.length },
                  { v: "product" as const, label: t("theater_tab_product"), count: products.length },
                  { v: "photo"   as const, label: t("theater_tab_photo"),   count: photos.length },
                ]).map((t) => (
                  <button
                    key={t.v}
                    onClick={() => setMaterialTab(t.v)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                      materialTab === t.v
                        ? "border-zinc-500 text-zinc-700"
                        : "border-transparent text-neutral-500 hover:text-neutral-800"
                    }`}
                  >
                    {t.label} {t.count > 0 && <span className="text-xs text-neutral-400">({t.count})</span>}
                  </button>
                ))}
              </div>

              {/* ── Event tab ── */}
              {materialTab === "event" && (
                <div className="space-y-4">
                  {/* Dropdown selector */}
                  <div>
                    <label className="text-[12px] font-semibold text-neutral-500 uppercase tracking-wide block mb-1.5">
                      {lang === "en" ? "Select or create event" : "選擇活動或新增"}
                    </label>
                    <select
                      className="w-full text-sm px-3 py-2 border border-neutral-300 rounded-lg bg-white focus:outline-none focus:border-zinc-500 cursor-pointer"
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        if (val === "__new__") {
                          // reset manual form and let user fill it below
                          setNewDate(""); setNewDateName("");
                          return;
                        }
                        // val = entity id (number string)
                        const ev = brandEvents.find((x) => String(x.id) === val);
                        if (!ev || importantDates.some((d) => d.entityId === ev.id)) return;
                        const dateStr = ev.startAt ?? new Date().toISOString().slice(0, 10);
                        setImportantDates((prev) => [...prev, {
                          id: `ev-${ev.id}-${Date.now()}`,
                          entityId: ev.id,
                          date: dateStr,
                          endDate: ev.endAt ?? undefined,
                          name: ev.name,
                          promoFreqPerWeek: 1,
                        }]);
                        e.target.value = ""; // reset selector
                      }}
                    >
                      <option value="">{lang === "en" ? "— Choose an event —" : "— 選擇活動 —"}</option>
                      {brandEvents.length > 0 && (
                        <optgroup label={lang === "en" ? "Your brand events" : "品牌現有活動"}>
                          {brandEvents.map((ev) => {
                            const added = importantDates.some((d) => d.entityId === ev.id);
                            return (
                              <option key={ev.id} value={String(ev.id)} disabled={added}>
                                {ev.name}{ev.startAt ? ` (${ev.startAt})` : ""}{added ? (lang === "en" ? " added" : " 已加入") : ""}
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                      <optgroup label={lang === "en" ? "Create new" : "手動新增"}>
                        <option value="__new__">{lang === "en" ? "＋ New event…" : "＋ 新增活動…"}</option>
                      </optgroup>
                    </select>
                  </div>

                  {/* Manual add form — shown when user picks "新增" OR has no brand events */}
                  <div className="flex items-center gap-2">
                    <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="text-sm px-2 py-1.5 border border-neutral-300 rounded" />
                    <input type="text" placeholder={t("theater_event_placeholder")} value={newDateName} onChange={(e) => setNewDateName(e.target.value)} className="flex-1 text-sm px-2 py-1.5 border border-neutral-300 rounded focus:outline-none focus:border-zinc-500" />
                    <button
                      onClick={() => { handleAddDate(); }}
                      disabled={!newDate || !newDateName}
                      className="text-sm px-3 py-1.5 rounded-md bg-zinc-500 hover:bg-zinc-600 text-white font-medium disabled:opacity-40"
                    >
                      {t("theater_btn_add_item")}
                    </button>
                  </div>

                  {/* Added events with promo settings */}
                  {importantDates.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[12px] font-semibold text-neutral-500 uppercase tracking-wide">
                        {lang === "en" ? "Added" : "已加入"}
                      </p>
                      {importantDates.map((d) => (
                        <div key={d.id} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium flex items-center gap-1.5">
                              <PlannerIcon size={13} className="text-amber-600" />
                              <b>{d.date}</b>
                              {d.endDate && <span className="text-neutral-500 text-xs">→ {d.endDate}</span>}
                              <span className="ml-1">{d.name}</span>
                            </span>
                            <button onClick={() => setImportantDates((prev) => prev.filter((x) => x.id !== d.id))} className="text-amber-500 hover:text-amber-800">
                              <CloseIcon size={14} />
                            </button>
                          </div>
                          <div className="flex items-center gap-2 text-[12px] text-neutral-600">
                            <span>{lang === "en" ? "Posts/week:" : "每週推廣:"}</span>
                            {[1, 2, 3].map((n) => (
                              <button
                                key={n}
                                onClick={() => setImportantDates((prev) => prev.map((x) => x.id === d.id ? { ...x, promoFreqPerWeek: n } : x))}
                                className={`w-6 h-6 rounded text-[12px] font-semibold transition ${(d.promoFreqPerWeek ?? 1) === n ? "bg-amber-500 text-white" : "bg-white border border-amber-300 text-amber-700 hover:bg-amber-100"}`}
                              >{n}</button>
                            ))}
                            <span className="text-neutral-400 text-[12px]">{lang === "en" ? "posts" : "篇"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Product tab ── */}
              {materialTab === "product" && (
                <div className="space-y-4">
                  {/* Dropdown selector */}
                  <div>
                    <label className="text-[12px] font-semibold text-neutral-500 uppercase tracking-wide block mb-1.5">
                      {lang === "en" ? "Select or create product" : "選擇產品或新增"}
                    </label>
                    <select
                      className="w-full text-sm px-3 py-2 border border-neutral-300 rounded-lg bg-white focus:outline-none focus:border-zinc-500 cursor-pointer"
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val || val === "__new__") return;
                        const bp = brandProducts.find((x) => String(x.id) === val);
                        if (!bp || products.some((p) => p.entityId === bp.id)) return;
                        setProducts((prev) => [...prev, {
                          id: `bp-${bp.id}-${Date.now()}`,
                          entityId: bp.id,
                          name: bp.name,
                          usp: bp.usp,
                          promoFreqPerWeek: 2,
                        }]);
                        e.target.value = "";
                      }}
                    >
                      <option value="">{lang === "en" ? "— Choose a product —" : "— 選擇產品 —"}</option>
                      {brandProducts.length > 0 && (
                        <optgroup label={lang === "en" ? "Your brand products" : "品牌現有產品"}>
                          {brandProducts.map((bp) => {
                            const added = products.some((p) => p.entityId === bp.id);
                            return (
                              <option key={bp.id} value={String(bp.id)} disabled={added}>
                                {bp.name}{bp.usp ? ` — ${bp.usp.slice(0, 30)}` : ""}{added ? (lang === "en" ? " added" : " 已加入") : ""}
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                      <optgroup label={lang === "en" ? "Create new" : "手動新增"}>
                        <option value="__new__">{lang === "en" ? "＋ New product…" : "＋ 新增產品…"}</option>
                      </optgroup>
                    </select>
                  </div>

                  {/* Manual add form */}
                  <div className="space-y-2">
                    <input type="text" placeholder={t("theater_product_name_ph")} value={newProductName} onChange={(e) => setNewProductName(e.target.value)} className="w-full text-sm px-2 py-1.5 border border-neutral-300 rounded focus:outline-none focus:border-zinc-500" />
                    <input type="text" placeholder={t("theater_product_usp_ph")} value={newProductUsp} onChange={(e) => setNewProductUsp(e.target.value)} className="w-full text-sm px-2 py-1.5 border border-neutral-300 rounded focus:outline-none focus:border-zinc-500" />
                    <div className="flex items-center gap-2">
                      <input type="date" value={newProductLaunch} onChange={(e) => setNewProductLaunch(e.target.value)} className="text-sm px-2 py-1.5 border border-neutral-300 rounded" />
                      <button
                        onClick={() => {
                          if (!newProductName || !newProductUsp) return;
                          setProducts((prev) => [...prev, {
                            id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            name: newProductName.trim(),
                            usp: newProductUsp.trim(),
                            launchDate: newProductLaunch || undefined,
                            promoFreqPerWeek: 2,
                          }]);
                          setNewProductName(""); setNewProductUsp(""); setNewProductLaunch("");
                        }}
                        disabled={!newProductName || !newProductUsp}
                        className="ml-auto text-sm px-3 py-1.5 rounded-md bg-zinc-500 hover:bg-zinc-600 text-white font-medium disabled:opacity-40"
                      >
                        {t("theater_btn_add_item")}
                      </button>
                    </div>
                  </div>

                  {/* Added products with promo settings */}
                  {products.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[12px] font-semibold text-neutral-500 uppercase tracking-wide">
                        {lang === "en" ? "Added" : "已加入"}
                      </p>
                      {products.map((p) => (
                        <div key={p.id} className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{p.name}</p>
                              {p.usp && <p className="text-[12px] text-neutral-500 truncate">{p.usp}</p>}
                            </div>
                            <button onClick={() => setProducts((prev) => prev.filter((x) => x.id !== p.id))} className="text-emerald-600 hover:text-emerald-900 mt-0.5 ml-2 shrink-0">
                              <CloseIcon size={14} />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <p className="text-[12px] text-neutral-500">{lang === "en" ? "Posts/week" : "每週推廣篇數"}</p>
                              <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <button
                                    key={n}
                                    onClick={() => setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, promoFreqPerWeek: n } : x))}
                                    className={`w-7 h-7 rounded text-[12px] font-semibold transition ${(p.promoFreqPerWeek ?? 2) === n ? "bg-emerald-500 text-white" : "bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100"}`}
                                  >{n}</button>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[12px] text-neutral-500">{lang === "en" ? "Promo period" : "推廣區間"}</p>
                              <div className="flex items-center gap-1">
                                <input type="date" value={p.promoStartDate ?? ""} onChange={(e) => setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, promoStartDate: e.target.value || undefined } : x))} className="text-[12px] px-1.5 py-1 border border-neutral-300 rounded w-full" />
                                <span className="text-neutral-400 text-[12px]">→</span>
                                <input type="date" value={p.promoEndDate ?? ""} onChange={(e) => setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, promoEndDate: e.target.value || undefined } : x))} className="text-[12px] px-1.5 py-1 border border-neutral-300 rounded w-full" />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )}

              {/* Photo tab */}
              {materialTab === "photo" && (
                <div className="space-y-3">
                  {photos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                      {photos.map((ph) => (
                        <div key={ph.id} className="relative group">
                          <img src={ph.url} alt={ph.note ?? ph.tag} className="w-full aspect-square object-cover rounded-lg border border-zinc-200" />
                          <span className="absolute top-1 left-1 text-[12px] px-1.5 py-0.5 rounded-full bg-zinc-500/90 text-white font-medium">
                            {t(`theater_photo_tag_${ph.tag}` as any)}
                          </span>
                          <button onClick={() => setPhotos((prev) => prev.filter((x) => x.id !== ph.id))} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <CloseIcon size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2">
                    {/* File upload OR URL — two paths to add a photo */}
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border-2 border-dashed border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:bg-zinc-50 transition">
                        <UploadIcon size={13} /> {lang === "en" ? "Upload from device" : "從電腦上傳"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const dataUrl = ev.target?.result as string;
                              if (dataUrl) {
                                setPhotos((prev) => [...prev, {
                                  id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                  url: dataUrl,
                                  tag: newPhotoTag,
                                  note: file.name,
                                }]);
                              }
                            };
                            reader.readAsDataURL(file);
                            e.target.value = ""; // reset so same file can re-select
                          }}
                        />
                      </label>
                      <span className="text-neutral-400 text-xs">{lang === "en" ? "or" : "或"}</span>
                      <input type="url" placeholder={t("theater_photo_url_ph")} value={newPhotoUrl} onChange={(e) => setNewPhotoUrl(e.target.value)} className="flex-1 text-sm px-2 py-1.5 border border-neutral-300 rounded focus:outline-none focus:border-zinc-500" />
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={newPhotoTag} onChange={(e) => setNewPhotoTag(e.target.value as any)} className="text-sm px-2 py-1.5 border border-neutral-300 rounded">
                        <option value="product">{t("theater_photo_tag_product")}</option>
                        <option value="scene">{t("theater_photo_tag_scene")}</option>
                        <option value="person">{t("theater_photo_tag_person")}</option>
                        <option value="lifestyle">{t("theater_photo_tag_lifestyle")}</option>
                      </select>
                      <input type="text" placeholder={t("theater_photo_note_ph")} value={newPhotoNote} onChange={(e) => setNewPhotoNote(e.target.value)} className="flex-1 text-sm px-2 py-1.5 border border-neutral-300 rounded focus:outline-none focus:border-zinc-500" />
                      <button
                        onClick={() => {
                          if (!newPhotoUrl) return;
                          setPhotos((prev) => [...prev, {
                            id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            url: newPhotoUrl.trim(),
                            tag: newPhotoTag,
                            note: newPhotoNote.trim() || undefined,
                          }]);
                          setNewPhotoUrl(""); setNewPhotoNote("");
                        }}
                        disabled={!newPhotoUrl}
                        className="text-sm px-3 py-1.5 rounded-md bg-zinc-500 hover:bg-zinc-600 text-white font-medium disabled:opacity-40"
                      >
                        {t("theater_btn_add_item")}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end mt-5 pt-4 border-t border-neutral-100">
                <button
                  onClick={() => setMaterialModalOpen(false)}
                  className="text-sm px-4 py-1.5 rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
                >
                  {t("theater_btn_done_modal")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 排程 modal ── */}
        {scheduleModal && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6"
            onClick={closeScheduleModal}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid #E5E5E5" }}>
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-neutral-400 mb-0.5">
                    {lang === "en" ? "SCHEDULE TO CALENDAR" : "排程到行事曆"}
                  </p>
                  <h2 className="text-[15px] font-semibold text-neutral-900">
                    {scheduleModal.platform.toUpperCase()} · {scheduleModal.date}
                  </h2>
                </div>
                <button
                  onClick={closeScheduleModal}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-400 hover:bg-neutral-100"
                >
                  <CloseIcon size={14} />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4">
                {/* Caption edit */}
                <div>
                  <label className="text-[12px] font-semibold text-neutral-600 mb-1.5 flex items-center gap-1.5">
                    <EditIcon size={11} />
                    {lang === "en" ? "Caption" : "文案"}
                  </label>
                  <textarea
                    autoFocus
                    value={scheduleDraft}
                    onChange={(e) => setScheduleDraft(e.target.value)}
                    rows={6}
                    className="w-full text-[13px] leading-relaxed px-3 py-2.5 border border-neutral-200 rounded-xl resize-none focus:outline-none focus:border-neutral-900 transition"
                    style={{ fontFamily: "inherit" }}
                  />
                  <p className="text-[12px] text-neutral-400 mt-1 text-right">
                    {scheduleDraft.length} {lang === "en" ? "chars" : "字"}
                  </p>
                </div>

                {/* Date + time picker */}
                <div>
                  <label className="text-[12px] font-semibold text-neutral-600 mb-1.5 flex items-center gap-1.5">
                    <WaitingIcon size={11} />
                    {lang === "en" ? "Publish date & time" : "發布日期與時間"}
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    min={`${new Date().toISOString().slice(0, 10)}T00:00`}
                    className="w-full px-3 py-2 border border-neutral-200 rounded-xl text-[13px] focus:outline-none focus:border-neutral-900 transition"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 pb-5 flex items-center gap-3">
                <button
                  onClick={closeScheduleModal}
                  className="flex-1 py-2.5 rounded-xl border border-neutral-200 text-[13px] text-neutral-700 hover:border-neutral-400 transition"
                >
                  {lang === "en" ? "Cancel" : "取消"}
                </button>
                <button
                  onClick={submitSchedule}
                  disabled={!scheduleAt || !scheduleDraft.trim() || scheduleCellMut?.isLoading}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50"
                  style={{ background: "#171717", color: "white" }}
                >
                  <PlannerIcon size={13} />
                  {scheduleCellMut?.isLoading
                    ? (lang === "en" ? "Scheduling…" : "排程中…")
                    : (lang === "en" ? "Confirm schedule" : "確認排程")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Phase 3a — 標記要改 modal */}
        {ruleModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={closeRuleModal}>
            <div
              className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-neutral-900 mb-1">
                {t("theater_modal_rule_title")}
              </h3>
              <p className="text-xs text-neutral-500 mb-4">
                {t("theater_modal_rule_subtitle")}
              </p>
              <textarea
                autoFocus
                value={ruleText}
                onChange={(e) => setRuleText(e.target.value)}
                placeholder={t("theater_rule_placeholder")}
                className="w-full text-sm px-3 py-2 border border-neutral-300 rounded resize-none focus:outline-none focus:border-zinc-500"
                style={{ minHeight: 80 }}
              />
              <p className="text-xs font-medium text-neutral-700 mt-4 mb-2">{t("theater_rule_scope_label")}</p>
              <div className="space-y-2">
                {([
                  { v: "post" as const,  label: t("theater_scope_post"),  hint: t("theater_scope_post_hint") },
                  { v: "run"  as const,  label: t("theater_scope_run"),   hint: t("theater_scope_run_hint") },
                  { v: "brand" as const, label: t("theater_scope_brand"), hint: t("theater_scope_brand_hint") },
                ]).map((opt) => (
                  <label
                    key={opt.v}
                    className={`block p-2.5 rounded-lg border cursor-pointer transition ${
                      ruleScope === opt.v ? "border-zinc-500 bg-zinc-50" : "border-neutral-200 hover:bg-neutral-50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="radio"
                        checked={ruleScope === opt.v}
                        onChange={() => setRuleScope(opt.v)}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium text-neutral-900">{opt.label}</p>
                        <p className="text-[12px] text-neutral-500 mt-0.5">{opt.hint}</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex items-center justify-end gap-2 mt-5">
                <button
                  onClick={closeRuleModal}
                  className="text-sm px-4 py-1.5 rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={submitRule}
                  disabled={!ruleText.trim()}
                  className="text-sm px-4 py-1.5 rounded-md bg-zinc-500 hover:bg-zinc-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t("theater_btn_apply_redo")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Edit cell modal ── */}
        {editModal && brandId && (
          <EditCellModal
            platform={editModal.platform}
            date={editModal.date}
            dateLabel={editModal.dateLabel}
            initialCaption={cells.get(editModal.key)?.caption ?? ""}
            initialStructured={cells.get(editModal.key)?.structured ?? {}}
            initialImageUrl={cells.get(editModal.key)?.imageUrl}
            initialImagePrompt={cells.get(editModal.key)?.imagePrompt}
            brandId={brandId}
            brandTagline={cellMeta.get(editModal.key)?.brandTagline ?? null}
            lang={lang}
            isAlreadyScheduled={!!cells.get(editModal.key)?.scheduledPostId}
            qaReviewMut={qaReviewMut}
            generateImageMut={generateImageMut}
            scheduleCellMut={scheduleCellMut}
            onSave={({ caption, structured, imageUrl, imagePrompt }) => {
              updateCell(editModal.key, { caption, structured, imageUrl, imagePrompt });
            }}
            onScheduleSuccess={(scheduledPostId, scheduledAt, caption, imageUrl) => {
              updateCell(editModal.key, { scheduledPostId, scheduledAt, caption, imageUrl: imageUrl ?? undefined });
            }}
            onClose={() => setEditModal(null)}
          />
        )}

        {/* Cast roster footer */}
        <div className="mt-12 pt-6 border-t border-neutral-200">
          <p className="text-xs text-neutral-500 mb-3">{t("theater_cast_footer")}</p>
          <div className="flex flex-wrap gap-2">
            {THEATER_CAST.filter((m) => !m.platform || !HIDDEN_THEATER_PLATFORMS.has(m.platform)).map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg"
                title={`${m.name} — ${m.title}`}
              >
                <Avatar src={avatarOf(m) ?? undefined} size="sm" className="w-5 h-5" />
                <span className="text-[12px] text-neutral-700 font-medium">{m.name}</span>
                {m.platform && (
                  <span className="text-[12px] px-1 rounded bg-neutral-100 text-neutral-700 flex items-center gap-1">
                    <PlatformIcon platformKey={PLATFORM_META[m.platform].iconKey} className="text-neutral-700" />
                    {PLATFORM_META[m.platform].short}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 2026-05-14 (CJ「企劃台動作比昨天慢，第二天的跑不出來」): wrap each
 * per-cell mutation in a Promise.race against a timeout. Previously a hung
 * LLM call would block a caption/image worker indefinitely — with concurrency
 * 2 captions, two hung calls on day-2 cells froze the whole 7-day pipeline.
 * Now the worker bails after `ms` and the cell is marked failed so the loop
 * advances to day 3+.
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[theater] ${label} timeout after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * 2026-05-14: retry transient gateway errors. With ~100 concurrent users
 * each running 7d × 3 platforms = 21 cells, nginx upstream gets brief 502/504
 * bursts. One retry after exponential backoff typically clears the spike.
 * Non-transient errors (400/401/403/422 etc.) bubble immediately — no retry.
 */
function isTransientError(e: unknown): boolean {
  const msg = (e as Error)?.message ?? "";
  // tRPC formats it like "伺服器忙碌（502）" or includes "TRPCClientError"
  return (
    /\b50[234]\b/.test(msg) ||         // 502, 503, 504
    /忙碌/.test(msg) ||                  // 「伺服器忙碌」
    /timeout/i.test(msg) ||
    /network/i.test(msg) ||
    /fetch failed/i.test(msg) ||
    /ECONNRESET|ETIMEDOUT|EAI_AGAIN/.test(msg)
  );
}

async function callWithRetry<T>(
  fn: () => Promise<T>,
  opts: { label: string; timeoutMs: number; maxAttempts?: number },
): Promise<T> {
  const max = opts.maxAttempts ?? 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await withTimeout(fn(), opts.timeoutMs, opts.label);
    } catch (e) {
      lastErr = e;
      if (attempt === max || !isTransientError(e)) throw e;
      // Backoff: 1.5s, 4s, 8s (with ±30% jitter to de-sync clients)
      const base = attempt === 1 ? 1500 : attempt === 2 ? 4000 : 8000;
      const jitter = base * (0.7 + Math.random() * 0.6);
      console.warn(`[theater] ${opts.label} attempt ${attempt}/${max} failed (${(e as Error).message}); retrying in ${Math.round(jitter)}ms`);
      await sleep(jitter);
    }
  }
  throw lastErr;
}
