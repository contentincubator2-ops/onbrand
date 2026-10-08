/**
 * RunPage — independent route /run/:outputId
 *
 * Lives INSIDE ShellLayout (left rail + collapsible panel come from
 * the shell). The page itself renders 2 inner columns:
 *   [CENTER] mockup big card with toolbar
 *   [RIGHT]  contextual mode panel + publish actions
 *
 * The variant nav (情感版/理性版/數據版) that was a 3rd column is now
 * inline horizontal chips above the mockup — frees space for the
 * mockup to be as wide as possible (CJ feedback: '中間 mockup 都太
 * 小，被背景吃掉').
 *
 * Toolbar holds the 11 functions CJ wanted preserved:
 *   ✏️ 編輯  💬 對話  🖼️ 圖  📹 影  👥 agent×2
 *   🪄 重生  🎚️ 設定  📋 複製  💾 存
 *   ↻ 重跑  ✕ 關閉
 */
import { publishSettingsUrl } from "../../platform/lib/publishSettingsUrl";
import { shouldShowConnectHint } from "../lib/shouldShowConnectHint";
import { localizeSource } from "../../platform/lib/taskEn";
import React, { useMemo, useState, useEffect, useRef } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  Avatar, Button, Card, CardBody, Chip, Spinner, Textarea, Tooltip,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateRight, faXmark, faCalendarPlus, faFolderOpen } from "@fortawesome/free-solid-svg-icons";
import {
} from "@fortawesome/free-brands-svg-icons";
import { HelpTip } from "../../platform/components/HelpTip";
import { CommentIcon, CopyIcon, EditIcon, ImageIcon, LibraryIcon, RegenerateIcon, RewriteAsIcon, PuzzleIcon, WaitingIcon, UserIcon, TextIcon, CheckIcon, BundleIcon, WarningIcon, DoneIcon, ErrorIcon, WorkingIcon, LinkIcon, PartnerIcon } from "../../platform/components/icons";
import VendorFinder, { vendorKindOf } from "../components/VendorFinder";
import { trpc } from "../../../lib/trpc";
import { useVariantLabel } from "../lib/variantLabelEn";
import { showToastGlobal } from "../../platform/components/Toast";
import { PlatformMockup } from "../components/PlatformMockup";
import ImageCardOffer, { IMAGE_CARD_OFFER_ID } from "../components/imageCard/ImageCardOffer";
import type { MockupVariant } from "../lib/inferMockup";
import { imageCardMockup } from "../lib/imageCardMockup";
import { getStrategyPresentationMockup } from "../lib/strategyPresentation";
import {
  getIgPublicVariantImageSize,
  getStrategySelectionMockup,
  getMutationLocatorSelectionKey,
  getPlanningPublishWarning,
  getPlanningConfirmationPayload,
  getStrategyPublicGenerationState,
  getStrategyPublicTabLabel,
  getRunContentMutationLocator,
  getRunContentSelectionKey,
  isEmptyStrategyPublicSelection,
  isPlanningArtifactMissingOutput,
  isStrategyPlanningSelection,
  resolveRunContent,
  shouldApplyMutationPreview,
  shouldHideStrategyPlanningTabs,
  type RunContentKind,
  type RunContentMutationLocator,
} from "../lib/strategyContentEnvelope";
import { RUN_IMAGE_MODEL_OPTIONS } from "../lib/runImageModelOptions";
import { findValidRunProductSelection, type RunProductImage } from "../lib/runProductSelection";
import { pickImagePromptSeed } from "../lib/imagePromptSeed";
import { buildAllDayIcs, downloadIcs } from "../lib/ics";
import { parseRunOfShow } from "../lib/runOfShow";
import { sourceLabel, sourceWhy } from "../../platform/lib/sourceVocabulary";
import { useLang } from "../../../lib/i18n";
import { fireNudge } from "../../platform/components/mia/miaNudges";
import ReviewBar from "../../platform/components/review/ReviewBar";
import PerfTagPicker from "../components/PerfTagPicker";
import WriterDesk, { type DeskWriter } from "../components/WriterDesk";
import RefineNotesList from "../components/RefineNotesList";
import { agentLabel, agentTitle } from "../../platform/lib/agentName";
import { friendlyError } from "../../platform/lib/friendlyError";
import BrandConsistencyNote, { pickBrandRecord } from "../components/BrandConsistencyNote";
import ResearchSources from "../../platform/components/ResearchSources";
import RegulationComplianceNote, { toComplianceInput, type ComplianceRecord } from "../components/RegulationComplianceNote";
import { captionLimitHint } from "../lib/captionLimits";
import { cancelAgentHandoff } from "../lib/agentHandoff";
import { Mode, REWRITE_AGENTS, VariantData, sanitizeCaption, normalizeVariantData, HOLD_FOR_IMAGES, SEQUENCE_TASKS, nanoBananaJsonToPrompt, sanitizeProviderErrorForToast } from "./run/runModel";
import { CraftChip, Divider, ToolbarBtn, StepBadge } from "./run/RunParts";


/** Toast-safe error text (no raw TRPC/zod noise). */
const friendlyErr = (e: unknown, en: boolean) =>
  friendlyError(e, en ? "Something went wrong. Please try again." : "剛剛沒成功，再試一次。");

export default function RunPage() {
  const { outputId } = useParams<{ outputId: string }>();
  const navigate = useNavigate();
  // 2026-09-28（CJ「成品頁右下方只留兩顆：排程到日曆（排好跳回本週企劃）、放棄」）：
  // 從本週企劃的任務視窗產生的，網址帶 from=planner（w 週、slot 格子、d 那天、camp/item 活動格子）。
  const [runSearch] = useSearchParams();
  const fromPlanner = runSearch.get("from") === "planner";
  const plannerWeek = runSearch.get("w");
  const plannerSlot = Number(runSearch.get("slot") ?? 0);
  const plannerDate = runSearch.get("d");
  const plannerCamp = Number(runSearch.get("camp") ?? 0);
  const plannerItem = runSearch.get("item");
  const plannerReleaseMut = (trpc as any).planner?.releaseSlot?.useMutation?.();
  const campaignMarkMut = (trpc as any).campaign?.markWritten?.useMutation?.();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  /** 回本週企劃；ho＝剛處理的那篇（週曆上亮起來）。 */
  const plannerHref = (highlight: boolean) => {
    const sp = new URLSearchParams();
    if (plannerWeek) sp.set("w", plannerWeek);
    if (highlight && outputId) sp.set("ho", String(outputId));
    return `/planner${sp.toString() ? `?${sp.toString()}` : ""}`;
  };
  /** 放棄：那一格退回沒寫、跟這篇脫鉤；這篇本身留在專案，不刪。 */
  const discardToPlanner = async () => {
    const oid = Number(outputId);
    try {
      if (plannerSlot > 0 && oid) await plannerReleaseMut?.mutateAsync?.({ slotId: plannerSlot, outputId: oid });
      if (plannerCamp > 0 && plannerItem) await campaignMarkMut?.mutateAsync?.({ eventId: plannerCamp, itemId: plannerItem, outputId: null });
    } catch { /* 退不掉也照樣回去；格子最多是顯示「已寫好」 */ }
    navigate(plannerHref(false));
  };
  const openPlannerSchedule = () => {
    setSchedMode("calendar");
    if (plannerDate && /^\d{4}-\d{2}-\d{2}$/.test(plannerDate)) setScheduleAt(`${plannerDate}T20:00`);
    setScheduleDialogOpen(true);
  };
  const { t, lang } = useLang();
  const id = Number(outputId);

  // 2026-05-14 (CJ「async polling」): when the orchestra wrote a partial
  // row (progress='caption_ready'), poll every 4s so image / QA show up
  // as they complete. Stop polling once progress reaches done/failed.
  const { data, isLoading, error, refetch: refetchRun } = trpc.output.getById.useQuery(
    { id },
    {
      enabled: !!id,
      refetchOnWindowFocus: false,
      refetchInterval: (q: any) => {
        const p = q?.state?.data?.progress;
        if (p === "caption_ready") return 4000;
        return false;
      },
    },
  );

  const publishBrandId = data?.mission?.brandId ?? data?.brand?.id;
  const connectionsQ = trpc.zernioConnect.connections.useQuery(
    { brandId: publishBrandId ?? 0 },
    { enabled: !!publishBrandId },
  );

  const [activeIdx, setActiveIdx] = useState(0);
  const [activeContentKind, setActiveContentKind] = useState<RunContentKind>("legacy");

  // 2026-09-16（CJ「完成後，旁邊的文字框，呈現出如何思考這篇文章的邏輯」）：
  // 不讓 AI 事後幫自己編理由（不可靠、容易是合理化）——顯示這張卡真實登記
  // 過的出處（得獎案例／標竿品牌／爆款結構的具體來源＋拆解結論，evergreen
  // 則是平台通則的既有理由）。跟報價頁「249 張任務卡中 208 張可追溯結構
  // 出處」是同一件事，只是第一次真的顯示給跑完任務的人看。
  const sourceTaskId = String(data?.mission?.taskId ?? "");
  const vl = useVariantLabel();
  const cardDetailQ = trpc.quickTask.cardDetail.useQuery(
    { taskId: sourceTaskId },
    { enabled: !!sourceTaskId },
  );
  // English UI: show the card's English name when the stored mission title is the (Chinese) card label.
  const cardEnName = lang === "en" ? String((cardDetailQ.data as any)?.labelEn ?? "") : "";
  const cardZhName = String((cardDetailQ.data as any)?.labelZh ?? "");
  const taskName = (zh: string): string =>
    cardEnName && zh && (zh === cardZhName || zh === (data as any)?.mission?.taskLabel) ? cardEnName : zh;

  // ── Mia contextual nudges for RunPage ────────────────────────────────
  // Fires when output first loads: tells user what they can do right now
  // on screen (AI copywriter, image prompt). Uses platform-specific catalog
  // entries so the message is accurate. Ref-guarded to fire once per output.
  const outputNudgeFiredRef = useRef<number | null>(null);
  React.useEffect(() => {
    if (!data?.content || outputNudgeFiredRef.current === id) return;
    outputNudgeFiredRef.current = id;
    const taskId = String(data?.mission?.taskId ?? "");
    const nudgeId =
      taskId.startsWith("ig-")       ? "run.ig.output_ready" :
      taskId.startsWith("fb-")       ? "run.fb.output_ready" :
      taskId.startsWith("linkedin-") ? "run.linkedin.output_ready" :
      taskId.startsWith("tiktok-")   ? "run.tiktok.output_ready" :
      taskId.startsWith("yt-")       ? "run.yt.output_ready" :
      taskId.startsWith("email-")    ? "run.email.output_ready" :
      taskId.startsWith("pr-")       ? "run.pr.output_ready" :
                                       "run.output_ready";
    setTimeout(() => fireNudge(nudgeId as any), 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.content, id]);

  // imageNudgeFiredRef declared here; the useEffect that uses `variants`
  // is placed after the variants declaration below to avoid hoisting issues.
  const imageNudgeFiredRef = useRef<number | null>(null);

  // 2026-06-05 (CJ「不阻擋，事後解釋」): when output loads with brand-rule fixes,
  // trigger a Mia nudge that explains what was auto-corrected.
  const brandFixNudgeFiredRef = useRef<number | null>(null);
  React.useEffect(() => {
    if (!data || brandFixNudgeFiredRef.current === id) return;
    const fixes: Array<{ variantIndex: number; bannedHits: string[]; subsApplied: Array<{ from: string; to: string }>; rewrittenByLLM: boolean }> =
      (data as any)?.metadata?.brandFixes ?? [];
    if (!Array.isArray(fixes) || fixes.length === 0) return;

    const allBanned = new Set<string>();
    const allSubs = new Set<string>();
    for (const f of fixes) {
      f.bannedHits?.forEach((w) => allBanned.add(w));
      f.subsApplied?.forEach((s) => allSubs.add(`${s.from} → ${s.to}`));
    }
    if (allBanned.size === 0 && allSubs.size === 0) return;

    brandFixNudgeFiredRef.current = id;
    const en = lang === "en";
    const bannedWords = en
      ? [...allBanned].slice(0, 3).map((w) => `"${w}"`).join(", ")
      : [...allBanned].slice(0, 3).map((w) => `「${w}」`).join("、");
    const subs = allSubs.size > 0
      ? (en
          ? `Substitutions: ${[...allSubs].slice(0, 3).join(", ")}. `
          : `自動套用替換：${[...allSubs].slice(0, 3).join("、")}。`)
      : "";
    setTimeout(() => fireNudge("run.brand_fix_applied", { bannedWords, subs }), 1200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, id]);
  // 2026-05-17 (CJ「存很多產出，每次給幾個，不滿意再多給」): for a large
  // candidate pool (e.g. 8 press-headline variants) surface a few and
  // reveal more on demand — the rest are already generated & persisted,
  // so "再給我幾個" is instant and free.
  const REVEAL_STEP = 3;
  const [revealCount, setRevealCount] = useState(REVEAL_STEP);
  // 2026-05-17 (CJ「下載成帶版型的簡報圖」): capture the mockup node.
  const mockupRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const exportSlidePng = async () => {
    const node = mockupRef.current;
    if (!node) return;
    setExporting(true);
    try {
      const h2c = (await import("html2canvas")).default;
      const canvas = await h2c(node, {
        backgroundColor: "#ffffff",
        scale: 2,                 // retina-crisp slide
        useCORS: true,
        logging: false,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      const safe = (data?.title ?? "ceo-speech").replace(/[^\w一-龥-]+/g, "_").slice(0, 40);
      a.download = `${safe || "ceo-speech"}.png`;
      a.click();
    } catch (e) {
      alert((lang === "en" ? "Export failed: " : "匯出失敗：") + String((e as any)?.message ?? e));
    } finally {
      setExporting(false);
    }
  };
  const [mode, setMode] = useState<Mode>("chat");
  const [focusedAgent, setFocusedAgent] = useState<"caption"|"image"|null>(null);
  const [editText, setEditText] = useState<string | null>(null);
  const [chatPrompt, setChatPrompt] = useState("");

  // React Router v6 reuses the RunPage component instance when navigating
  // between /run/:id routes — it does NOT unmount. Without this reset,
  // editText/mode/activeIdx/overrides from the previous run persist into
  // the new run, causing the editor to show stale or empty content.
  useEffect(() => {
    setEditText(null);
    setMode("chat");
    setActiveIdx(0);
    setActiveContentKind("legacy");
    setRevealCount(REVEAL_STEP);
    setOverrides({});
    setChatPrompt("");
    setFocusedAgent(null);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [copied, setCopied] = useState(false);
  /** Local override for variants — applied after save, mockup updates live. */
  const [overrides, setOverrides] = useState<Record<string, { caption: string }>>({});
  /** AI chat history per variant. */
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user"|"assistant"; content: string }>>([]);
  const [aiPreview, setAiPreview] = useState<{ text: string; locator: RunContentMutationLocator; compliance?: any } | null>(null);
  // 2026-07-07 (CJ): rewrite-agent picker — persona name in flight + preview
  const [rewriteBusy, setRewriteBusy] = useState<string | null>(null);
  const [rewritePreview, setRewritePreview] = useState<{
    agent: string;
    text: string;
    locator: RunContentMutationLocator;
    compliance?: any;
  } | null>(null);
  /** P4: human-editable image instruction — prefers the Chinese counterpart
   *  and falls back through model prompt → art direction → local template. */
  const [imagePrompt, setImagePrompt] = useState<string>("");
  const imageMutationTargetRef = useRef<{ locator: RunContentMutationLocator; promptZh: string } | null>(null);
  /** 2026-07-07 (CJ): user-editable thumbnail title text overlaid on the (now
   *  text-free) AI thumbnail. Seeded from the variant title/caption, editable
   *  in the right panel; passed to the YT mockup as overlayTitle. */
  const [overlayTitle, setOverlayTitle] = useState<string>("");
  const overlaySeededRef = useRef<string | null>(null);
  /** 2026-05-12: user-selected image model for 改圖 dropdown.
   *  2026-06-15: default gpt-image-2 across all platforms. */
  const [imageModel, setImageModel] = useState<string>("gpt-image-2");
  /** 2026-09-21: a failed generation is a result, not a thrown error, so the UI can offer
   *  「改用 Nano Banana」 (the user decides; nothing switches automatically). */
  const [imageFailure, setImageFailure] = useState<{
    message: string; canSwitchTo?: "nano-banana"; model?: string;
  } | null>(null);
  /** Video gen state — async job, polled for status. */
  /** 2026-05-12: user-selected video model for 改影片 dropdown. */
  /** 2026-05-12 Phase 1 — picked template category for the 改圖 picker. */
  const [templateCategory, setTemplateCategory] = useState<string>("");
  /** 2026-05-19 (CJ「某個影片 title 產出腳本」): inline script generation modal. */
  const [scriptModalTitle, setScriptModalTitle] = useState<string | null>(null);
  const [generatedScript, setGeneratedScript] = useState<string | null>(null);
  const [scriptCompliance, setScriptCompliance] = useState<ComplianceRecord | null>(null);
  const [scriptCopied, setScriptCopied] = useState(false);

  const utils = trpc.useUtils();

  // 2026-05-12 Phase 1: Nano-Banana prompt-template catalog (lazy on image mode).
  const templateCategoriesQ = (trpc as any).promptTemplate?.categories?.useQuery
    ? (trpc as any).promptTemplate.categories.useQuery(undefined, {
        enabled: mode === "image",
        staleTime: 60 * 60 * 1000,
      })
    : { data: [] };
  const templatesQ = (trpc as any).promptTemplate?.list?.useQuery
    ? (trpc as any).promptTemplate.list.useQuery(
        { category: templateCategory || undefined, limit: 30 },
        { enabled: mode === "image" && !!templateCategory, staleTime: 60 * 60 * 1000 },
      )
    : { data: [] };
  const updateMut = trpc.output.updateVariantCaption.useMutation({
    onSuccess: () => {
      // 2026-05-13 (CJ「編輯完文案回上一頁找不到存檔，要翻專案才看到」
      // + 「要把 toast 文字也做成可點按鈕」): toast now has a real
      // action button on the right — 1-tap to /projects.
      const missionTitle = (data as any)?.mission?.title
        ?? (data as any)?.mission?.taskLabel
        ?? "";
      const where = missionTitle
        ? (lang === "en" ? `Saved to 「${missionTitle}」` : `已存到「${missionTitle}」`)
        : (lang === "en" ? "Saved to Projects" : "已存到專案");
      showToastGlobal(where, "success", {
        label: lang === "en" ? "Open Projects" : "去專案",
        onClick: () => navigate("/projects"),
      });
      utils.output.getById.invalidate({ id });
    },
    onError: (e) => showToastGlobal(
      lang === "en" ? `Save failed: ${friendlyErr(e, true)}` : `儲存失敗：${friendlyErr(e, false)}`
    ),
  });
  const refineMut = (trpc as any).quickTask?.refineCaption?.useMutation
    ? (trpc as any).quickTask.refineCaption.useMutation()
    : null;
  // 2026-05-19: inline script generation for YT 12-title tab
  const scriptMut = (trpc as any).quickTask?.generateVideoScript?.useMutation
    ? (trpc as any).quickTask.generateVideoScript.useMutation({
        onSuccess: (r: any) => {
          if (r.ok) { setGeneratedScript(r.script); setScriptCompliance(r.regulationCompliance ?? null); }
          else showToastGlobal(lang === "en" ? `Script failed: ${typeof r.error === "string" ? r.error : "unknown error"}` : `腳本生成失敗：${typeof r.error === "string" ? r.error : "未知錯誤"}`);
        },
        onError: (e: any) => showToastGlobal(lang === "en" ? `Script error: ${friendlyErr(e, true)}` : `腳本錯誤：${friendlyErr(e, false)}`),
      })
    : null;
  const emailMut = trpc.output.emailToTeam.useMutation({
    onSuccess: (r) => {
      if (r.ok) showToastGlobal(
        lang === "en" ? `Sent to ${r.sentCount} recipient(s)` : `已寄給 ${r.sentCount} 位收件人`
      );
      else showToastGlobal(
        lang === "en" ? `Partially failed: ${r.failures.join("; ")}` : `部分寄送失敗：${r.failures.join("; ")}`
      );
    },
    onError: (e) => showToastGlobal(
      lang === "en" ? `Send failed: ${friendlyErr(e, true)}` : `寄送失敗：${friendlyErr(e, false)}`
    ),
  });
  const scheduleMut = trpc.output.scheduleIcs.useMutation({
    onSuccess: (r) => {
      // Trigger .ics download
      const blob = new Blob([r.ics], { type: "text/calendar;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(a.href);
      showToastGlobal(
        lang === "en" ? ".ics downloaded — open it to add to your calendar" : "已產生 .ics — 拖進日曆 App 即可"
      );
      utils.output.getById.invalidate({ id });
    },
    onError: (e) => showToastGlobal(
      lang === "en" ? `Schedule failed: ${friendlyErr(e, true)}` : `排程失敗：${friendlyErr(e, false)}`
    ),
  });
  // 2026-05-09 (P3): regen single variant
  const regenMut = (trpc as any).quickTask?.regenerateVariant?.useMutation
    ? (trpc as any).quickTask.regenerateVariant.useMutation({
        onSuccess: () => {
          showToastGlobal(
            lang === "en" ? "Version rewritten" : "已重生此變體"
          );
          utils.output.getById.invalidate({ id });
          setOverrides({});
        },
        onError: (e: any) => showToastGlobal(
          lang === "en" ? `Rewrite failed: ${friendlyErr(e, true)}` : `重生失敗：${friendlyErr(e, false)}`
        ),
      })
    : { mutate: () => {}, isPending: false };
  // 2026-05-09 (P4): image regen pipeline
  const updateImageMut = (trpc as any).output?.updateVariantImage?.useMutation
    ? (trpc as any).output.updateVariantImage.useMutation({
        onSuccess: () => utils.output.getById.invalidate({ id }),
        onError: (e: any) => {
          // 2026-05-12 (CJ「生圖完成但顯示 can't transfer」): surface the
          // actual error so we never silently swallow it again.
          const msg = String(e?.message ?? "");
          if (/payload|too large|413/i.test(msg)) {
            showToastGlobal(
              lang === "en"
                ? "Image too large to save (please contact support)"
                : "圖片檔太大，無法保存到伺服器（請聯絡客服）"
            );
          } else {
            showToastGlobal(
              lang === "en"
                ? `Couldn't save image: ${msg.slice(0, 120)}`
                : `圖片保存失敗：${msg.slice(0, 120)}`
            );
          }
        },
      })
    : null;
  // Scheduling stays in Calendar; platform authorization lives in brand settings.
  const scheduleToCalMut = (trpc as any).calendar?.schedule?.useMutation?.({
    onSuccess: (_r: any) => {
      showToastGlobal(
        lang === "en"
          ? "Added to Calendar — go to Calendar page to publish"
          : "已加入日曆 — 前往「日曆」頁面發布"
      );
    },
    onError: (e: any) => {
      showToastGlobal(
        lang === "en"
          ? `Schedule failed: ${friendlyErr(e, true)}`
          : `排程失敗：${friendlyErr(e, false)}`
      );
    },
  }) ?? { mutateAsync: async () => {}, isPending: false };

  const imageGenMut = (trpc as any).image?.generate?.useMutation
    ? (trpc as any).image.generate.useMutation({
        onSuccess: async (r: any) => {
          // A failed generation comes back as a normal result (status "failed") carrying
          // canSwitchTo — the server already retried the same model once and refunded the points.
          if (r?.status === "failed" || !r?.url) {
            imageMutationTargetRef.current = null;
            const detail = sanitizeProviderErrorForToast(r?.friendlyMessage ?? r?.errorMsg ?? r?.message ?? "").slice(0, 400);
            setImageFailure({ message: detail, canSwitchTo: r?.canSwitchTo, model: r?.model });
            showToastGlobal(
              r?.canSwitchTo
                ? (lang === "en" ? "Image failed — retry, or switch to Nano Banana below" : "這次沒有產出圖 — 可以再試一次，或改用 Nano Banana")
                : (lang === "en" ? "Image failed — please try again" : "這次沒有產出圖，請再試一次")
            );
            return;
          }
          setImageFailure(null);
          const target = imageMutationTargetRef.current;
          if (!target) {
            showToastGlobal(lang === "en" ? "Image target was lost — please try again" : "找不到原本的圖片位置，請重試");
            return;
          }
          if (!updateImageMut) return;
          try {
            await updateImageMut.mutateAsync({
              id,
              ...target.locator,
              imageUrl: r.url,
              prompt: r?.effectivePrompt ?? target.promptZh,
              promptZh: r?.normalizedDisplayPrompt ?? target.promptZh,
              modelId: r?.model ?? undefined,
              requestedModelId: r?.requestedModel ?? undefined,
            });
          } catch {
            // updateImageMut.onError already shows the persistence error.
            imageMutationTargetRef.current = null;
            return;
          }
          imageMutationTargetRef.current = null;
          const actualModel = String(r?.model ?? "").trim();
          showToastGlobal(
            lang === "en"
              ? `Image ready${actualModel ? ` — ${actualModel}` : ""} (the previous image is kept — switch back anytime)`
              : `已產圖${actualModel ? ` — ${actualModel}` : ""}（前一張圖有保留，隨時可以切回去）`
          );
        },
        onError: (e: any) => {
          imageMutationTargetRef.current = null;
          const detail = sanitizeProviderErrorForToast(e?.message ?? e);
          showToastGlobal(lang === "en" ? `Image failed: ${detail}` : `產圖失敗：${detail}`);
        },
      })
    : { mutate: () => {}, isPending: false };

  // 2026-09-21 (CJ「生成過的圖，要讓用戶可以選選用」): switching back to an earlier image is a pointer
  // move on the server — nothing is regenerated and no points are spent.
  const selectVersionMut = (trpc as any).output?.selectVariantImageVersion?.useMutation
    ? (trpc as any).output.selectVariantImageVersion.useMutation({
        onSuccess: () => {
          utils.output.getById.invalidate({ id });
          showToastGlobal(lang === "en" ? "Switched back (no regeneration)" : "已切回這張圖（不用重新生成）");
        },
        onError: (e: any) => showToastGlobal(
          lang === "en" ? `Couldn't switch image: ${friendlyErr(e, true)}` : `切換圖片失敗：${friendlyErr(e, false)}`
        ),
      })
    : { mutate: () => {}, isPending: false };

  // 2026-07-25 (CJ product-faithful gen「📦 使用真實產品圖」— 改圖面板入口):
  // this is the panel the mockup's 點此手動生圖 opens, so the product picker
  // must live HERE (MediaGenFlow got it first, but that flow isn't on this
  // click path). When on, image.generate routes to Nano Banana with the
  // real photo + fidelity guard (see project_product_faithful_imagegen).
  const runProductImagesQ = (trpc as any).media?.listProductImages?.useQuery(
    { brandId: data?.brand?.id ?? 0 },
    { enabled: !!data?.brand?.id, refetchOnWindowFocus: false, staleTime: 60_000 },
  ) ?? { data: null };
  const runProductImages: RunProductImage[] =
    (runProductImagesQ.data as any)?.products ?? [];
  const [useRealProduct, setUseRealProduct] = React.useState(false);
  const [pickedRunProduct, setPickedRunProduct] = React.useState<RunProductImage | null>(null);
  const validRunProduct = findValidRunProductSelection(pickedRunProduct, runProductImages);
  const missingRealProductSelection = useRealProduct && !validRunProduct;
  const realProductMode = useRealProduct && !!validRunProduct;

  // RunPage is reused between route ids, and brand data can also change while
  // the component stays mounted. Never carry a product photo across either
  // boundary.
  React.useEffect(() => {
    setUseRealProduct(false);
    setPickedRunProduct(null);
  }, [id, data?.brand?.id]);

  // A different variant is a different image slot — its failure notice is not ours.
  React.useEffect(() => { setImageFailure(null); }, [id, activeIdx]);

  /** Generate (or regenerate) the current variant's image with exactly `model`. Used by the
   *  panel's 產圖 button and by the failure banner's 再試一次 / 改用 Nano Banana. */
  const startImageGen = (model: string, promptText: string) => {
    if (!data?.brand?.id) {
      showToastGlobal(
        lang === "en"
          ? "This run isn't linked to a brand, can't generate"
          : "此 run 沒有綁定品牌，無法產圖"
      );
      return;
    }
    if (useRealProduct && !validRunProduct) {
      showToastGlobal(
        lang === "en"
          ? "Select a product photo from this brand before generating"
          : "請先從目前品牌選擇有效的產品圖，再進行產圖"
      );
      return;
    }
    setImageFailure(null);
    setImageModel(model);
    imageMutationTargetRef.current = {
      locator: getRunContentMutationLocator(selectedContentKind, activeIdx),
      promptZh: promptText,
    };
    imageGenMut.mutate({
      brandId: data.brand.id,
      prompt: promptText,
      // image.generate expects short codes: fb / ig / linkedin / youtube / tiktok / threads / line / email / press
      channel: (
        mockupVariant?.platform === "facebook"  ? "fb" :
        mockupVariant?.platform === "instagram" ? "ig" :
        mockupVariant?.platform === "linkedin"  ? "linkedin" :
        mockupVariant?.platform === "youtube"   ? "youtube" :
        mockupVariant?.platform === "tiktok"    ? "tiktok" :
        "fb"
      ) as any,
      modelChoice: model,
      size: getIgPublicVariantImageSize(selectedContentKind, variants[activeIdx]?.format),
      // TODO: send productId and resolve the brand-owned image
      // server-side. This hotfix intentionally closes the gap
      // with current-brand client validation only.
      ...(realProductMode ? { subjectImageUrl: validRunProduct!.imageUrl } : {}),
    });
  };

  // 2026-09-28（CJ「產出的圖片跟真實產品圖片差很多」）：從文案產生的圖片指令，要知道有沒有
  // 真實產品照。沒帶的話它會自己想像主體（照片是生的橫膈牛排，指令寫「剛起鍋的厚切牛舌」），
  // 模型就照文字畫另一個東西。產品照也一起給它看，它會回報「這篇要的畫面跟照片對不上」
  // （CJ「發現衝突的時候，應該提醒用戶上傳新的照片」）。
  // 「使用真實產品圖」的勾選在 Step 1 下面，使用者常常先有指令再勾——所以勾選／換照片時，
  // 只要輸入框裡不是使用者自己打的字，就照這張照片自動重產一次。
  const productKeyNow = realProductMode ? validRunProduct!.imageUrl : "";
  const lastPromptReqRef = React.useRef<any>(null);
  const userEditedPromptRef = React.useRef(false);
  const [photoConflict, setPhotoConflict] = React.useState<{ photoShows: string; postNeeds: string; suggestPhoto: string; forUrl: string } | null>(null);
  const pendingPhotoRef = React.useRef<string>("");
  const captionPromptReq = () => {
    const v = variants[activeIdx];
    if (!v?.caption || !data?.brand?.id) return null;
    return {
      brandId: data.brand.id,
      caption: v.caption,
      channel: (
        mockupVariant?.platform === "facebook"  ? "fb" :
        mockupVariant?.platform === "instagram" ? "ig" :
        mockupVariant?.platform === "linkedin"  ? "linkedin" :
        mockupVariant?.platform === "youtube"   ? "youtube" :
        mockupVariant?.platform === "tiktok"    ? "tiktok" :
        undefined
      ) as any,
      imageStyle: v?.imageStyle ?? undefined,
      size: getIgPublicVariantImageSize(selectedContentKind, v?.format),
    };
  };
  const requestPromptFromCaption = (req: any) => {
    if (!req) return;
    lastPromptReqRef.current = req;
    pendingPhotoRef.current = productKeyNow;
    const withProduct = realProductMode
      ? { ...req, product: { name: String(validRunProduct!.name ?? ""), imageUrl: validRunProduct!.imageUrl } }
      : req;
    captionToPromptMut.mutate(withProduct);
  };
  // 2026-06-15: generate image prompt from the current variant's caption.
  const captionToPromptMut = (trpc as any).image?.promptFromCaption?.useMutation
    ? (trpc as any).image.promptFromCaption.useMutation({
        onSuccess: (r: any) => {
          const c = r?.conflict;
          setPhotoConflict(c && pendingPhotoRef.current ? { ...c, forUrl: pendingPhotoRef.current } : null);
          if (r?.promptZh || r?.prompt) {
            userEditedPromptRef.current = false;
            setImagePrompt(lang === "en" ? (r.prompt || r.promptZh) : (r.promptZh || r.prompt));
            showToastGlobal(lang === "en" ? "Image prompt generated from caption" : "已從文案產生圖片指令");
          }
        },
        onError: (e: any) => showToastGlobal(
          lang === "en" ? `Couldn't generate prompt: ${friendlyErr(e, true)}` : `產生失敗：${friendlyErr(e, false)}`
        ),
      })
    : { mutate: () => {}, isPending: false };
  // 勾選／換了產品照：輸入框不是使用者自己打的字（自動產生的或系統預填的，兩種都會描述產品本身），
  // 就照這張照片重產；使用者自己改過的不動（那是他的字）。
  React.useEffect(() => {
    if (!productKeyNow || userEditedPromptRef.current || captionToPromptMut.isPending) return;
    requestPromptFromCaption(lastPromptReqRef.current ?? captionPromptReq());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKeyNow]);
  // 換了一篇（變體或成品）：之前的指令與衝突提醒都不是這篇的。
  React.useEffect(() => { lastPromptReqRef.current = null; userEditedPromptRef.current = false; setPhotoConflict(null); }, [id, activeIdx]);

  // 衝突時直接在這裡上傳新照片：存進這個產品的照片庫（不改主圖），選起來，指令照新照片重產。
  const conflictFileRef = React.useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = React.useState(false);
  const uploadConflictPhoto = async (file: File | undefined) => {
    if (!file || !validRunProduct || !data?.brand?.id) return;
    setUploadingPhoto(true);
    try {
      const res = await fetch("/api/asset-photo/upload", {
        method: "POST", credentials: "include",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-brand-id": String(data.brand.id), "x-scope": "product",
          "x-scope-id": String(validRunProduct.productId), "x-filename": encodeURIComponent(file.name),
        },
        body: file,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.photo?.url) throw new Error(json?.error ?? `HTTP ${res.status}`);
      await runProductImagesQ?.refetch?.();
      setPhotoConflict(null);
      setPickedRunProduct({ productId: validRunProduct.productId, name: validRunProduct.name, imageUrl: String(json.photo.url) });
      showToastGlobal(lang === "en" ? "Photo added to this product" : "已加進這個產品的照片", "success");
    } catch (e: any) {
      showToastGlobal(friendlyErr(e, lang === "en"), "error");
    } finally {
      setUploadingPhoto(false);
      if (conflictFileRef.current) conflictFileRef.current.value = "";
    }
  };

  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState("");
  const [emailNote, setEmailNote] = useState("");
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  // schedMode: which action triggered the schedule dialog
  //   "ics"      → download .ics only, no redirect
  //   "calendar" → write to scheduled_posts + navigate /calendar
  //   "publish"  → platform-specific write to scheduled_posts + navigate /calendar
  const [schedMode, setSchedMode] = useState<"ics" | "calendar" | "publish">("ics");
  // 2026-09-29 送審是排程的一個狀態：排程視窗裡勾「排好後送審」。專業方案才有審核工作流；
  // 已經在審／已放行的不再顯示。
  const [reviewOnSchedule, setReviewOnSchedule] = useState(true);
  const reviewBillingQ = (trpc as any).billing?.getStatus?.useQuery
    ? (trpc as any).billing.getStatus.useQuery(undefined, { staleTime: 60_000, refetchOnWindowFocus: false })
    : { data: null };
  const reviewStatusQ = (trpc as any).review?.statusFor?.useQuery
    ? (trpc as any).review.statusFor.useQuery({ outputId: id }, { enabled: Number.isFinite(id) && id > 0 })
    : { data: null, refetch: () => {} };
  const reviewSubmitMut = (trpc as any).review?.submit?.useMutation?.();
  const reviewState = String((reviewStatusQ.data as any)?.status ?? "");
  const reviewCanSubmit = (reviewBillingQ.data as any)?.quota?.reviewWorkflow === true
    && !!(data as any)?.mission?.id
    && !["pending", "in_review", "approved"].includes(reviewState);
  const submitReviewIfAsked = async () => {
    if (!reviewCanSubmit || !reviewOnSchedule || !reviewSubmitMut) return;
    try {
      await reviewSubmitMut.mutateAsync({ missionId: (data as any).mission.id, outputId: id });
      showToastGlobal(lang === "en" ? "Scheduled and sent for review" : "已排程並送審", "success");
      reviewStatusQ.refetch?.();
    } catch (e: any) {
      showToastGlobal(lang === "en" ? `Scheduled, but review failed: ${friendlyErr(e, true)}` : `已排程，但送審失敗：${friendlyErr(e, false)}`);
    }
  };
  const [schedPlatform, setSchedPlatform] = useState("facebook");
  const [scheduleAt, setScheduleAt] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 24);
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16); // local datetime-local format
  });

  // Multi-day series: countdown / serial / live-suite etc. need a date-range
  // picker so each post lands on the right day automatically.
  const taskIdStr = String((data as any)?.mission?.taskId ?? "");
  const isCountdownTask = taskIdStr.includes("countdown");
  const isMultiDayTask = /countdown|serial|highlight-suite|live-suite|launch-kit|reel-series/.test(taskIdStr);
  // For countdown: anchor = event date (posts count back from it).
  // For others: anchor = start date (posts count forward from it).
  const [seriesAnchorDate, setSeriesAnchorDate] = useState(() => {
    const d = new Date();
    // Default anchor: 7 days out so there's room for the series
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });

  const resolvedContent = useMemo(() => {
    if (!data) return resolveRunContent<VariantData>([], null);
    try {
      const parsed = JSON.parse(data.content);
      return resolveRunContent<any>(parsed, data?.mission?.taskId ?? null, data?.metadata);
    } catch {
      return resolveRunContent<any>([
        { label: lang === "en" ? "Main version" : "主版本", caption: sanitizeCaption(data.content || "") },
      ], data?.mission?.taskId ?? null, data?.metadata);
    }
  }, [data, lang]);

  const planningVariants = useMemo(
    () => resolvedContent.planningArtifacts.map(normalizeVariantData),
    [resolvedContent],
  );
  const publicVariants = useMemo(
    () => resolvedContent.publicVariants.map(normalizeVariantData),
    [resolvedContent],
  );
  const legacyVariants = useMemo(
    () => resolvedContent.legacyVariants.map(normalizeVariantData),
    [resolvedContent],
  );
  const isStrategyEnvelope = resolvedContent.isStrategyEnvelope;
  const hideStrategyPlanningTabs = shouldHideStrategyPlanningTabs(
    data?.mission?.taskId,
    isStrategyEnvelope,
  );
  const strategyPublicGenerationState = getStrategyPublicGenerationState({
    taskId: data?.mission?.taskId,
    isStrategyEnvelope,
    progress: (data as any)?.progress,
    publicVariantCount: publicVariants.length,
  });
  const selectedContentKind: RunContentKind = isStrategyEnvelope
    ? hideStrategyPlanningTabs
      ? "publicVariants"
      : activeContentKind === "legacy"
      ? (publicVariants.length > 0 ? "publicVariants" : "planningArtifacts")
      : activeContentKind
    : "legacy";
  const variants: VariantData[] = selectedContentKind === "publicVariants"
    ? publicVariants
    : selectedContentKind === "planningArtifacts"
      ? planningVariants
      : legacyVariants;
  const isEmptyPublicSelection = hideStrategyPlanningTabs && isEmptyStrategyPublicSelection(
    isStrategyEnvelope,
    selectedContentKind,
    publicVariants.length,
  );
  const isStrategyPlanning = isStrategyPlanningSelection(
    isStrategyEnvelope,
    selectedContentKind,
  );
  const activeSelectionKey = getRunContentSelectionKey(selectedContentKind, activeIdx);
  const activeSelectionKeyRef = useRef(activeSelectionKey);

  useEffect(() => {
    activeSelectionKeyRef.current = activeSelectionKey;
  }, [activeSelectionKey]);

  useEffect(() => {
    if (!isStrategyEnvelope) {
      if (activeContentKind !== "legacy") {
        setActiveContentKind("legacy");
        setActiveIdx(0);
      }
      return;
    }
    if (hideStrategyPlanningTabs && activeContentKind !== "publicVariants") {
      setActiveContentKind("publicVariants");
      setActiveIdx(0);
    } else if (activeContentKind === "legacy") {
      setActiveContentKind(publicVariants.length > 0 ? "publicVariants" : "planningArtifacts");
      setActiveIdx(0);
    }
  }, [isStrategyEnvelope, hideStrategyPlanningTabs, activeContentKind, publicVariants.length]);

  const selectContent = React.useCallback((contentKind: RunContentKind, index: number) => {
    if (isStrategyPlanningSelection(isStrategyEnvelope, contentKind)) {
      setMode((currentMode) => currentMode === "image" ? "chat" : currentMode);
      manualImageRef.current = false;
    }
    setActiveContentKind(contentKind);
    setActiveIdx(index);
    setEditText(null);
    setChatPrompt("");
    setChatHistory([]);
    setAiPreview(null);
    setRewritePreview(null);
  }, [isStrategyEnvelope]);

  const rerunOriginalTask = React.useCallback(() => {
    const taskId = data?.mission?.taskId;
    if (!taskId) {
      showToastGlobal(lang === "en" ? "Original task ID not found" : "找不到原任務 ID");
      return;
    }
    const ws = String(data?.mission?.workspace ?? "").toLowerCase();
    // 2026-09-29 CJ：LinkedIn／YouTube／新聞稿／X 下架。舊產出還看得到，但不能再跑——
    // 導去 /tasks/li 只會被踢回 FB、rerun 參數也丟了，不如直接說清楚。
    if (/linkedin|youtube|press|^pr$|^x$|twitter/.test(ws) || /^(li|yt|pr|x)-/.test(String(taskId))) {
      showToastGlobal(lang === "en" ? "This channel is no longer offered." : "這個通路的任務卡已下架，無法重跑。");
      return;
    }
    const slug =
      ws.includes("instagram") ? "ig" :
      ws.includes("tiktok")    ? "tt" :
      ws.includes("email")     ? "email" :
      ws.includes("website")   ? "web" :
      "fb";
    navigate(`/tasks/${slug}?rerun=${id}`);
  }, [data?.mission?.taskId, data?.mission?.workspace, id, lang, navigate]);

  // 2026-07-20 (CJ「FB 短貼文的『改圖』應隱藏但仍顯示、點了也不會生圖」):
  // text-only tasks (every variant image status "skipped", no url) have
  // nothing to redo — hide the 改圖 toolbar entry for them. Manual opt-in
  // image gen stays available via the mockup's 點此手動生圖.
  const hasImageSlot = useMemo(
    () => !isStrategyPlanning && variants.some((v) => v.imageUrl || (v.imageStatus && v.imageStatus !== "skipped")),
    [isStrategyPlanning, variants],
  );
  // 2026-07-23 (CJ IRIS QA「點此手動生圖，但我按下去以後，並沒有生圖」):
  // the fallback below used to bounce EVERY entry into image mode back to
  // chat on text-only tasks — including the mockup's 點此手動生圖 click,
  // which set mode="image" and got instantly reverted (= click did
  // nothing). Track manual intent so opt-in survives; the fallback only
  // guards against LANDING on the hidden mode without a click.
  const manualImageRef = React.useRef(false);
  React.useEffect(() => { manualImageRef.current = false; }, [id]);
  // If the panel somehow lands on the (now hidden) image mode, fall back.
  React.useEffect(() => {
    if (isStrategyPlanning && mode === "image") {
      manualImageRef.current = false;
      setMode("chat");
      return;
    }
    if (!hasImageSlot && mode === "image" && !manualImageRef.current) setMode("chat");
  }, [hasImageSlot, isStrategyPlanning, mode]);

  // Fires when the active variant's image finishes generating. Placed here
  // (after variants declaration) so the hook can safely read variants[activeIdx].
  React.useEffect(() => {
    const currentVariant = variants[activeIdx];
    if (currentVariant?.imageStatus !== "ready" || !currentVariant?.imageUrl) return;
    if (imageNudgeFiredRef.current === id) return;
    imageNudgeFiredRef.current = id;
    setTimeout(() => fireNudge("run.image_ready"), 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants[activeIdx]?.imageStatus, id]);

  // 2026-07-07 (CJ): seed the editable thumbnail-title overlay from the active
  // variant (title or first caption line), once per (id, activeIdx) so a user's
  // edits aren't clobbered on re-render. Only meaningful for YT thumbnail tasks.
  React.useEffect(() => {
    const seedKey = `${id}:${selectedContentKind}:${activeIdx}`;
    if (overlaySeededRef.current === seedKey) return;
    overlaySeededRef.current = seedKey;
    const cap = variants[activeIdx]?.caption ?? "";
    const seed = (data?.title?.trim() || cap.split("\n").map((l) => l.trim()).find(Boolean) || "").slice(0, 60);
    setOverlayTitle(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, activeIdx, selectedContentKind, variants]);

  // Compute per-variant post dates for multi-day series tasks.
  // Countdown: anchor = event date, posts go Day5…Day1 (earliest to latest).
  // Others: anchor = start date, posts go Day1, Day2… (forward).
  const postDates: Date[] = useMemo(() => {
    if (!isMultiDayTask || variants.length === 0) return [];
    const anchor = new Date(seriesAnchorDate + "T09:00:00");
    return variants.map((_, i) => {
      const d = new Date(anchor);
      if (isCountdownTask) {
        d.setDate(anchor.getDate() - variants.length + i);
      } else {
        d.setDate(anchor.getDate() + i);
      }
      return d;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesAnchorDate, variants.length, isMultiDayTask, isCountdownTask]);

  // ── Unified schedule-dialog confirm handler ─────────────────────────────
  // (Defined here, after schedMode / schedPlatform / scheduleAt / variants are
  //  all in scope — was above them before which caused TS2448 TDZ errors.)
  const handleScheduleConfirm = React.useCallback(async () => {
    const planningWarning = getPlanningPublishWarning(
      selectedContentKind,
      schedMode === "publish" ? "publish" : "schedule",
      lang === "en" ? "en" : "zh",
    );
    if (planningWarning && !confirm(planningWarning)) return;

    const _tid = (data as any)?.mission?.taskId ?? "";
    const _pfxMap: Record<string, string> = {
      fb: "facebook", ig: "instagram", yt: "youtube", tt: "tiktok",
      li: "linkedin", em: "email", pr: "press",
    };
    const _pfx = (_tid.match(/^([a-z]+)-/) ?? [])[1] ?? "";
    const _platform = schedMode === "publish"
      ? schedPlatform
      : ((data as any)?.metadata?.platform ?? _pfxMap[_pfx] ?? "facebook");

    // ── Multi-day series path ─────────────────────────────────────────────
    if (isMultiDayTask && postDates.length === variants.length && schedMode !== "publish") {
      if (schedMode === "ics") {
        // Build multi-event .ics, one per variant
        const brandName = (data as any)?.brand?.name ?? "";
        const icsStr = buildAllDayIcs(
          variants.flatMap((v, i) => {
            const d = postDates[i];
            if (!d) return [];
            return [{
              uid: `${id}-series-${i}@onbrand.sowork.ai`,
              date: d,
              summary: (brandName ? brandName + " · " : "") + (v.label ?? `Day ${i + 1}`),
              description: v.caption ?? "",
            }];
          }),
        );
        downloadIcs(icsStr, `series-${id}.ics`);
        setScheduleDialogOpen(false);
        showToastGlobal(lang === "en"
          ? `Exported ${variants.length} posts — drop the .ics into your calendar`
          : `已匯出 ${variants.length} 篇 — 拖進日曆 App 即可`);
        return;
      }

      // "calendar" mode: write each variant to scheduled_posts sequentially
      try {
        for (let i = 0; i < variants.length; i++) {
          const d = postDates[i];
          if (!d) continue;
          await scheduleToCalMut?.mutateAsync?.({
            outputId: id,
            ...getRunContentMutationLocator(selectedContentKind, i),
            ...getPlanningConfirmationPayload(selectedContentKind),
            platform: _platform,
            scheduledAt: d.toISOString(),
          });
        }
        setScheduleDialogOpen(false);
        await submitReviewIfAsked();
        navigate(fromPlanner ? plannerHref(true) : "/planner");
      } catch {
        // error toast already shown by scheduleToCalMut.onError
      }
      return;
    }

    // ── Single-post path (original behaviour) ────────────────────────────
    // 從本週企劃來的：時間照台北時間解讀——週曆是用台北時間畫的，瀏覽器在別的時區時
    // （實測美國時區把 9/29 20:00 排成台北 9/30 09:00）格子會掉到隔天。
    const _scheduledAt = fromPlanner && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduleAt)
      ? new Date(`${scheduleAt}:00+08:00`).toISOString()
      : new Date(scheduleAt).toISOString();
    if (schedMode === "ics") {
      scheduleMut.mutate({
        id, ...getRunContentMutationLocator(selectedContentKind, activeIdx),
        ...getPlanningConfirmationPayload(selectedContentKind),
        scheduledAt: _scheduledAt,
        durationMinutes: 30,
      }, {
        onSuccess: () => {
          setScheduleDialogOpen(false);
          scheduleToCalMut?.mutateAsync?.({
            outputId: id, ...getRunContentMutationLocator(selectedContentKind, activeIdx),
            ...getPlanningConfirmationPayload(selectedContentKind),
            platform: _platform, scheduledAt: _scheduledAt,
          }).catch(() => {/* non-fatal */});
        },
      });
    } else {
      try {
        await scheduleToCalMut?.mutateAsync?.({
          outputId: id, ...getRunContentMutationLocator(selectedContentKind, activeIdx),
          ...getPlanningConfirmationPayload(selectedContentKind),
          platform: _platform, scheduledAt: _scheduledAt,
        });
        setScheduleDialogOpen(false);
        await submitReviewIfAsked();
        navigate(fromPlanner ? plannerHref(true) : "/planner");
      } catch {
        // error toast already shown by scheduleToCalMut.onError
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedMode, schedPlatform, scheduleAt, seriesAnchorDate, id, activeIdx, selectedContentKind, data, variants, postDates, isMultiDayTask, scheduleMut, scheduleToCalMut, navigate, lang, reviewCanSubmit, reviewOnSchedule]);

  // ── Bulk .ics export (calendar-type tasks only) ──────────────────────────
  const handleBulkIcsExport = React.useCallback(() => {
    const brandName = (data as any)?.brand?.name ?? "";
    const events = (variants as any[]).flatMap((v: any, i: number) => {
      const m = /(\d{4})\/(\d{2})\/(\d{2})/.exec(String(v.label ?? ""));
      if (!m) return [];
      const summary = String(v.label ?? "").replace(/^\d{4}\/\d{2}\/\d{2}\s*·\s*/, "");
      return [{
        uid: `${id}-${i}@onbrand.sowork.ai`,
        date: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
        summary: (brandName ? brandName + " · " : "") + summary,
        description: v.caption ?? "",
      }];
    });
    if (events.length === 0) {
      showToastGlobal(lang === "en" ? "No dated posts to export" : "沒有可匯出的日期貼文");
      return;
    }
    downloadIcs(buildAllDayIcs(events), `content-calendar-${id}.ics`);
    showToastGlobal(lang === "en"
      ? `Exported ${events.length} posts — drop the .ics into your calendar`
      : `已匯出 ${events.length} 篇 — 拖進日曆 App 即可`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants, id, data, lang]);

  // Apply local overrides so mockup reflects unsaved edits in real time
  // 2026-05-12 pre-launch zombie audit: clamp activeIdx so deleted-variant
  // / archive scenarios don't return undefined slide and crash mockup render.
  const slide = useMemo(() => {
    if (!variants || variants.length === 0) return undefined;
    const safeIdx = Math.min(Math.max(0, activeIdx), variants.length - 1);
    const base = variants[safeIdx];
    if (!base) return base;
    const ov = overrides[getRunContentSelectionKey(selectedContentKind, safeIdx)];
    return ov ? { ...base, caption: ov.caption } : base;
  }, [variants, activeIdx, overrides, selectedContentKind]);

  // ── 2026-09-29 主筆桌（CJ「只有一個版本；右邊是主筆＋這樣寫的原因＋換人寫；要改就跟那位對話」）──
  // 左邊本文可以直接打字（自動存），右邊換人寫／請主筆改，改完直接進本文。
  // 每位寫過的稿由伺服器留在 item.writerDrafts（server/content/core/engine/writerDrafts.ts）。
  const writerDesk = !isStrategyEnvelope && !isEmptyPublicSelection;
  const deskLeadAgentId: number | undefined = (() => {
    const ca: any = (data as any)?.metadata?.captionAgent;
    const n = Number(typeof ca === "object" ? ca?.id : NaN);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  })();
  const deskLead: DeskWriter = useMemo(() => {
    const ca: any = (data as any)?.metadata?.captionAgent;
    const name = (typeof ca === "object" ? ca?.name : ca) || (lang === "en" ? "Lead writer" : "主筆");
    return {
      key: "lead", name: String(name),
      nameEn: typeof ca === "object" ? ca?.nameEn : undefined, titleEn: typeof ca === "object" ? ca?.titleEn : undefined,
      title: String((typeof ca === "object" ? ca?.title : "") ?? ""),
      avatarUrl: typeof ca === "object" ? ca?.avatarUrl ?? null : null,
    };
  }, [data, lang]);
  const deskOthers: DeskWriter[] = useMemo(() => REWRITE_AGENTS
    .filter((a) => a.agentId !== deskLeadAgentId)
    .map((a) => ({
      key: String(a.agentId), name: a.name,
      title: lang === "en" ? a.titleEn : a.title,
      pitch: lang === "en" ? a.styleEn : a.style,
    })), [lang, deskLeadAgentId]);
  const deskActiveKey = slide?.activeWriter ?? "lead";
  const deskDrafts = slide?.writerDrafts ?? {};
  const [deskBusyKey, setDeskBusyKey] = useState<string | null>(null);
  const [deskChatBusy, setDeskChatBusy] = useState(false);
  const [deskUndo, setDeskUndo] = useState<{ key: string; caption: string } | null>(null);
  const [deskView, setDeskView] = useState<"text" | "preview">("text");
  // 2026-09-30：從任務 modal 飛過來的主筆頭像降落後，本文像紙一樣從上往下展開。
  const [handoffReveal, setHandoffReveal] = useState(false);
  const hasData = !!data;
  useEffect(() => {
    if (hasData && !writerDesk) cancelAgentHandoff();
  }, [hasData, writerDesk]);
  const deskPendingRef = useRef<{ timer: ReturnType<typeof setTimeout>; text: string } | null>(null);
  const saveCaptionQuietMut = trpc.output.updateVariantCaption.useMutation({
    onError: (e) => showToastGlobal(lang === "en" ? `Save failed: ${friendlyErr(e, true)}` : `儲存失敗：${friendlyErr(e, false)}`),
  });
  useEffect(() => {
    setDeskUndo(null);
    setChatHistory([]);
    setDeskView("text");
  }, [id, activeSelectionKey]);

  const deskWriterRef = (key: string): { key: string; name: string; title?: string; agentId?: number; instruction?: string } => {
    if (key === "lead") return { key, name: deskLead.name, title: deskLead.title || undefined, agentId: deskLeadAgentId };
    const a = REWRITE_AGENTS.find((x) => String(x.agentId) === key);
    if (!a) return { key, name: key };
    return {
      key, name: a.name, title: lang === "en" ? a.titleEn : a.title, agentId: a.agentId,
      instruction: lang === "en" ? a.instructionEn : a.instruction,
    };
  };
  const deskScope = {
    brandId: data?.mission?.brandId ?? undefined,
    productId: (data as any)?.metadata?.productId ?? undefined,
    eventId: (data as any)?.metadata?.eventId ?? undefined,
    // 改寫要守這張卡的字數與形式（server rewriteContract.ts）。
    taskId: String(data?.mission?.taskId ?? "") || undefined,
  };
  /** 打字：預覽即時更新，停手 1.2 秒後存檔（不跳 toast）。 */
  const onDeskType = (v: string) => {
    setOverrides((o) => ({ ...o, [activeSelectionKey]: { caption: v } }));
    if (deskPendingRef.current) clearTimeout(deskPendingRef.current.timer);
    const locator = getRunContentMutationLocator(selectedContentKind, activeIdx);
    const timer = setTimeout(() => {
      deskPendingRef.current = null;
      saveCaptionQuietMut.mutate({ id, ...locator, caption: v });
    }, 1200);
    deskPendingRef.current = { timer, text: v };
  };
  /** 換人／請他改之前，先把還沒存的手改存掉 —— 伺服器要拿它當上一位的稿。 */
  const flushDeskTyping = async () => {
    const p = deskPendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    deskPendingRef.current = null;
    await saveCaptionQuietMut.mutateAsync({ id, ...getRunContentMutationLocator(selectedContentKind, activeIdx), caption: p.text });
  };
  /** 一段文字成為本文。帶 writer＝換人寫。 */
  const commitDeskCaption = async (text: string, writer?: { key: string; name: string; title?: string; agentId?: number }, compliance?: any) => {
    const locator = getRunContentMutationLocator(selectedContentKind, activeIdx);
    setOverrides((o) => ({ ...o, [getMutationLocatorSelectionKey(locator)]: { caption: text } }));
    const w = writer ? { key: writer.key, name: writer.name, title: writer.title, agentId: writer.agentId } : undefined;
    // 2026-09-30：AI 改寫回來的合規紀錄跟著存（見 RegulationComplianceNote）。
    await saveCaptionQuietMut.mutateAsync({ id, ...locator, caption: text, ...(w ? { writer: w } : {}), ...(compliance ? { regulationCompliance: toComplianceInput(compliance) } : {}) });
    if (w || compliance) await utils.output.getById.invalidate({ id });
  };
  const pickDeskWriter = async (key: string) => {
    if (!refineMut) { showToastGlobal(lang === "en" ? "AI rewrite is unavailable" : "AI 改寫服務暫不可用"); return; }
    const w = deskWriterRef(key);
    const locator = getRunContentMutationLocator(selectedContentKind, activeIdx);
    setDeskBusyKey(key);
    try {
      await flushDeskTyping();
      const cached = deskDrafts[key]?.caption;
      if (typeof cached === "string" && cached.trim()) {
        // 寫過的：原樣切回，不重寫。
        setDeskUndo(null); setChatHistory([]);
        await commitDeskCaption(cached, w);
        return;
      }
      // 沒寫過的：以主筆的稿（含用戶手改）為底，用這位的寫法重寫。
      const base = deskActiveKey === "lead" ? (slide?.caption ?? "") : (deskDrafts.lead?.caption ?? slide?.caption ?? "");
      if (!base.trim()) { showToastGlobal(lang === "en" ? "Nothing to rewrite yet" : "還沒有文案可以改寫"); return; }
      const r = await refineMut.mutateAsync({
        currentCaption: base,
        userFeedback: w.instruction ?? (lang === "en" ? "Rewrite this in your own style." : "請用你的寫法重寫這篇。"),
        agentId: w.agentId, agentName: w.name, agentTitle: w.title,
        ...deskScope,
      });
      if (!r.ok) {
        showToastGlobal(lang === "en"
          ? `Rewrite failed: ${typeof r.error === "string" ? r.error : "unknown error"}`
          : `改寫失敗：${typeof r.error === "string" ? r.error : "未知錯誤"}`);
        return;
      }
      if (!shouldApplyMutationPreview(activeSelectionKeyRef.current, locator)) return;
      setDeskUndo(null); setChatHistory([]);
      await commitDeskCaption(r.rewritten, w, r.regulationCompliance);
    } catch (e: any) {
      showToastGlobal(lang === "en" ? `Error: ${friendlyErr(e, true)}` : `錯誤：${friendlyErr(e, false)}`);
    } finally {
      setDeskBusyKey(null);
    }
  };
  /** 跟目前那位說哪裡要改：改完直接進本文，可復原一步。回傳是否成功（成功才清輸入框）。 */
  const sendDeskChat = async (text: string): Promise<boolean> => {
    if (!refineMut) { showToastGlobal(lang === "en" ? "AI rewrite is unavailable" : "AI 改寫服務暫不可用"); return false; }
    const w = deskWriterRef(deskActiveKey);
    const locator = getRunContentMutationLocator(selectedContentKind, activeIdx);
    setDeskChatBusy(true);
    try {
      await flushDeskTyping();
      const before = slide?.caption ?? "";
      const r = await refineMut.mutateAsync({
        currentCaption: before, userFeedback: text,
        agentId: w.agentId, agentName: w.name, agentTitle: w.title,
        ...deskScope,
        history: chatHistory.slice(-12),
        // 2026-10-08：帶上是哪一篇的哪個版本——先前的修改意見存在伺服器，重新整理也還在。
        outputId: id, ...locator,
      });
      if (!r.ok) {
        showToastGlobal(lang === "en"
          ? `AI rewrite failed: ${typeof r.error === "string" ? r.error : "unknown error"}`
          : `AI 改寫失敗：${typeof r.error === "string" ? r.error : "未知錯誤"}`);
        return false;
      }
      if (!shouldApplyMutationPreview(activeSelectionKeyRef.current, locator)) return false;
      setChatHistory((h) => [...h,
        { role: "user", content: text },
        { role: "assistant", content: r.explanation || (lang === "en" ? "Done — updated the draft." : "改好了，已更新本文。") },
      ]);
      setDeskUndo({ key: activeSelectionKey, caption: before });
      await commitDeskCaption(r.rewritten, undefined, r.regulationCompliance);
      (utils as any)?.quickTask?.refineNotes?.invalidate?.({ outputId: id });
      return true;
    } catch (e: any) {
      showToastGlobal(lang === "en" ? `Error: ${friendlyErr(e, true)}` : `錯誤：${friendlyErr(e, false)}`);
      return false;
    } finally {
      setDeskChatBusy(false);
    }
  };
  const undoDeskChat = async () => {
    if (!deskUndo || deskUndo.key !== activeSelectionKey) return;
    const prev = deskUndo.caption;
    setDeskUndo(null);
    await commitDeskCaption(prev);
  };

  /* 2026-08-20 (CJ「IG 留言回覆（一般）… 為什麼沒有產出內容」): reply-type
   * tasks answer something the user pasted in (用戶留言 / 評價 / 提問). The
   * writer's own `description` field is never persisted (OrchestraVariant has
   * no such field), so the comment mockups used to render a grey「原始留言會
   * 顯示在這」stand-in forever. The text IS on the row though — metadata.inputs
   * keeps every answer the user typed. Read it here and hand it to the mockup
   * as liveSourceComment (a dedicated field: liveDescription already carries
   * model-produced sub-copy elsewhere, e.g. FBPoll parses it as JSON).
   * Scoped to comment/reply tasks, so no other mockup sees a new value. */
  const sourceComment = useMemo(() => {
    const tid = data?.mission?.taskId ?? "";
    if (!/comment|reply|recommendation/i.test(tid)) return undefined;
    const inputs = (data as any)?.metadata?.inputs;
    if (!inputs || typeof inputs !== "object") return undefined;
    // Key order = specificity. li-30-comment stores the post being answered
    // under "context" (quickTaskLI.ts:108), everything else uses
    // "user_comment" (quickTaskFB/IG/YT/TikTok).
    const preferred = [
      "user_comment", "comment", "original_comment", "customer_comment",
      "review", "user_review", "testimonial_source", "question", "context",
    ];
    for (const k of preferred) {
      const v = inputs[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    // Deliberately no "just take the only input" fallback: yt-30-pinned-comment
    // asks for a video URL / topic, which is not a comment. Better to show the
    // mockup's own hint than to caption someone else's words with a URL.
    return undefined;
  }, [data]);

  // 2026-08-22 (CJ「應該是指完整的直播範本」): sequence tasks deliver ONE
  // timeline split across variants. Besides never pooling the pills, they
  // also get the whole thing as a table under the mockup — the deliverable
  // is the run of show, not 6 separate cards the user has to click through.
  const isSequenceTask = SEQUENCE_TASKS.has((data as any)?.mission?.taskId ?? "");

  // 2026-07-17 (CJ「文案偶爾很短、沒講重點，推測系統不穩」— seen on
  // fb-30-ad-headline / link-desc): those are COMPONENT tasks — the
  // deliverable per variant is ONE short line (ad headline ≤25字 / link
  // description / CTA button text / email subject), by design. Rendered
  // inside a full-post mockup they read as a broken half-empty post, so
  // both CJ and end customers misdiagnose them as system instability.
  // Detect them (short-form task id + every caption short + no images
  // configured) and explain the deliverable right above the preview.
  const isComponentTask = useMemo(() => {
    const tid = data?.mission?.taskId ?? "";
    if (!/(headline|desc|cta|subject|hook|title|bio|hashtag|comment|reply|opening)/i.test(tid)) return false;
    const caps = (variants ?? []).map((v) => (v?.caption ?? "").trim()).filter(Boolean);
    if (caps.length === 0) return false;
    const allShort = caps.every((c) => c.length <= 80);
    const noImages = (variants ?? []).every((v) => !v?.imageUrl);
    return allShort && noImages;
  }, [data?.mission?.taskId, variants]);

  // 2026-07-17 (CJ「產出的示意會讓人覺得應該有全文，怎麼避開誤會」): for FB
  // ad component tasks, tell the mockup WHICH ad slot the deliverable fills —
  // it renders the caption into that slot (highlighted) and ghosts the rest.
  const componentSlot: "headline" | "description" | "cta" | undefined = useMemo(() => {
    const tid = data?.mission?.taskId ?? "";
    if (/ad-headline/.test(tid)) return "headline";
    if (/ad-description|link-desc/.test(tid)) return "description";
    if (/ad-cta/.test(tid)) return "cta";
    return undefined;
  }, [data?.mission?.taskId]);

  // 2026-05-19: for email tasks (EDM), extract the per-slide email subject
  // so the title row can show "主旨：<current email subject>" rather than
  // the static mission title which always shows slide-0's subject.
  // 2026-05-19 (CJ 驗收 P0-4「主旨面板始終停留在第一封」): the old code
  // gated on data.mission.taskId.startsWith("em-"), but the client often
  // has no resolved taskId (it's derived from the description tag and is
  // frequently empty) → useMemo returned null → the panel fell back to the
  // static data.title which is identical on every tab. Detect the subject
  // straight from the current slide's caption instead — no taskId gate,
  // mirroring EDMMockup's own header parsing (which IS correct per tab).
  const currentEmailSubject = useMemo(() => {
    const cap = slide?.caption ?? "";
    const m = cap.match(/^[\s#*>\-]*主旨\s*[：:]\s*(.+?)\**\s*$/m);
    return m?.[1]?.trim() || null;
  }, [slide?.caption]);

  // P4: pre-fill image / video prompt when entering that mode or switching
  // variant. 2026-05-12 (CJ「按下改圖/改影片，應該要有預設的提示詞」).
  useEffect(() => {
    if (mode !== "image") return;

    const cap = String(slide?.caption ?? "").trim();

    // Extract a SUBJECT noun phrase from the caption — not just the first
    // sentence which often is a hook question. We try several signals.
    const extractSubject = (s: string): string => {
      if (!s) return "";
      // Pull the first meaningful sentence (skip pure-question hooks)
      const sentences = s.split(/[\n。！？!?]/).map(t => t.trim()).filter(t => t.length >= 6);
      // Prefer sentences that describe a scene (contain 在/坐/站/拿/看/聽/喝/吃/泡/煮/拍/走/笑/睡/穿)
      const sceneRe = /(在|坐|站|拿|看|聽|喝|吃|泡|煮|拍|走|笑|睡|穿|裝|擺|放|沖|淋|抱|牽|握|寫|讀|畫|種|插)/;
      const scenic = sentences.find(t => sceneRe.test(t)) ?? sentences[0] ?? "";
      return scenic.slice(0, 80);
    };

    const subject = extractSubject(cap);

    if (mode === "image") {
      // 2026-08-19 (客戶回報「產出跟指令大相逕庭的圖」): this box is an
      // editable instruction. CJK input is transparently translated on the
      // server before generation. It used to be seeded from `imageStyle`,
      // the agent-written Chinese 風格方向, which is display-only and never reached the model
      // (quickTaskOrchestra.genOneImage converts the CAPTION into the real
      // brief). So the prompt on screen described one image and the picture
      // beside it came from another — every single quick-task run. Seed from
      // the image's equivalent Chinese prompt first, then the actual English
      // model prompt, and only then the display-only style for older runs.
      // 2026-08-20: `imageStyle` is the last-resort, display-only fallback and
      // is the one IG-strategy runs land on. Drop it when it is an English
      // keyword slug so the box falls through to the Chinese caption-derived
      // brief below instead of showing an unusable slug (see isKeywordSlug).
      const seedPrompt = pickImagePromptSeed({
        imagePromptZh: slide?.imagePromptZh,
        imagePrompt: slide?.imagePrompt,
        imageStyle: slide?.imageStyle,
      });
      if (seedPrompt) {
        setImagePrompt(seedPrompt);
        return;
      }
      // Richer image brief: subject + lighting + composition + mood + style cue
      const seed = subject
        ? `主角 / 場景：${subject}\n` +
          `鏡頭：中景，主體稍微偏左、留白給文字。\n` +
          `光線：自然柔光，從窗戶斜進來的暖色調。\n` +
          `氛圍：寫實、生活感、不刻意擺拍。\n` +
          `風格：摹片風（不要過度修圖、不要 3D 渲染感），會自動套用品牌色彩 / 調性。`
        : "";
      setImagePrompt(seed);
      return;
    }
  }, [mode, activeIdx, slide?.imagePromptZh, slide?.imagePrompt, slide?.imageStyle, slide?.caption]);

  // 2026-05-09 (CJ direction「只留一個 mockup 路徑」): 一律渲染 mockup，
  // 不再 block on missing taskId. Inference falls through 3 layers:
  //   1. metadata.taskId (rich — distinguishes ad/reel/story/carousel)
  //   2. output.platform + output.outputType (always present from DB)
  //   3. generic:feed (last resort — never errors out)
  const mockupVariant: MockupVariant = useMemo(() => {
    // 100s→99s rename compat: server already normalizes output.getById,
    // but a legacy "fb-100-…" id reaching here from any other path must
    // still resolve to the renamed mockup/prefix logic. Inline + idempotent.
    const taskId = (data?.mission?.taskId ?? "").replace(/^([a-z]+)-100-/, "$1-99-");

    // Server-owned metadata flag: only the five catalogued IG strategy
    // reports use this presentation. Check before task-id substring routing
    // so visual-story/live-first/document cannot be mistaken for post mockups.
    const strategyReportMockup = getStrategyPresentationMockup(data?.metadata, taskId);
    if (strategyReportMockup) return strategyReportMockup as any;

    // 2026-10-04：商品頁（電商／開店平台 tray）。伺服器在成品 metadata 放了欄位規格，
    // 有它就是欄位卡——排在 taskId 推斷之前，自建卡 id（u<brandId>-…）本來就推不出任何平台。
    if ((data?.metadata as any)?.listing?.fields?.length) {
      return { platform: "generic" as any, format: "listing" as any, label: "generic:listing" };
    }

    // 2026-05-18 (CJ「改成用 word 形式，不要 ppt」): these FB squads are
    // strategy plans / reports / playbooks, NOT postable social content
    // → render as a written document (Word-style), not a slide deck.
    // 2026-05-19 (CJ): ig-hormozi-save-worthy is a CONTENT squad (actual IG
    // posts), not a strategy doc — exclude from the research-doc blanket.
    // "save-worthy" tasks produce social posts → should show instagram:feed.
    if (/quarterly-strategy|monthly-analytics|account-reposition|mass-control|offer-first|magnetic|kennedy/.test(taskId) ||
        (/hormozi/.test(taskId) && !/save-worthy/.test(taskId))) {
      return { platform: "generic" as any, format: "research-doc" as any, label: "generic:research-doc" };
    }
    // 2026-05-18 (CJ): carousel-cvo squad is a 10-card carousel narrative
    // → render as a carousel, not a feed post.
    if (/deiss-cvo|carousel-cvo/.test(taskId)) {
      return { platform: "facebook" as any, format: "carousel" as any, label: "facebook:carousel" };
    }

    // ── Layer 1: Brand + Research (proposal-style mockups) ──
    if (taskId.startsWith("br-") || taskId.startsWith("rs-")) {
      const coverIds = ["br-30-tagline", "br-30-positioning", "br-30-elevator-pitch", "br-30-manifesto"];
      const personaIds = ["rs-30-persona-draft", "rs-30-journey-map", "rs-30-competitive-interview", "rs-30-synthesis-template"];
      const researchDocIds = [
        "rs-30-interview-guide", "rs-30-survey", "rs-30-jtbd-guide",
        "rs-30-usability-script", "rs-30-screener", "rs-30-consent-form",
      ];
      const format =
        coverIds.includes(taskId) ? "proposal-cover" :
        personaIds.includes(taskId) ? "persona-card" :
        researchDocIds.includes(taskId) ? "research-doc" :
        taskId.startsWith("rs-") ? "research-doc" :
        "proposal-spec";
      return { platform: "generic" as any, format: format as any, label: `generic:${format}` };
    }

    // ── Layer 1: KOL outreach → 1:1 email letter mockup ──
    // 2026-05-16: only the actual MESSAGE tasks (invite opener /
    // follow-up) use the 寄件人/收件人/主旨 letter layout. kl-30-
    // brief-oneliner is a single-sentence brand brief, NOT a letter
    // (CJ「這只是剪短改寫，不是濃縮」) — let it fall through to the
    // clean generic card instead of being dressed as an email.
    if (taskId === "kl-30-invite-opener" || taskId === "kl-30-followup") {
      return { platform: "email" as any, format: "dm" as any, label: "email:dm" };
    }
    // KOL 合作 Brief is a structured document handed to the influencer
    // → render as a spec-sheet doc, not a letter / one-liner card.
    if (taskId === "kl-30-influencer-brief" || taskId === "kl-30-brief-oneliner") {
      return { platform: "generic" as any, format: "proposal-spec" as any, label: "generic:proposal-spec" };
    }
    // 2026-05-18 (CJ): KOL Campaign 完整話術包 = a multi-part outreach
    // playbook document, not a social post → research-doc.
    if (taskId === "kl-99-campaign-toolkit") {
      return { platform: "generic" as any, format: "research-doc" as any, label: "generic:research-doc" };
    }

    // 2026-10-04 圖片卡存成的「圖＋文」貼文：版型跟圖片卡頁的預覽用同一份對照。
    const md = (data?.metadata ?? {}) as { source?: string; cardId?: string; platform?: string };
    if (md.source === "image-card" && md.cardId && md.platform) {
      let n = 1;
      try { const c = JSON.parse(String(data?.content ?? "[]")); n = Array.isArray(c?.[0]?.cards) ? c[0].cards.length : 1; } catch { /* 單張 */ }
      return imageCardMockup(md.cardId, md.platform, n);
    }

    // ── Layer 1: taskId prefix → platform/format (richest mapping) ──
    const idPrefixMap: Record<string, string> = {
      fb: "facebook", ig: "instagram", yt: "youtube", tt: "tiktok",
      li: "linkedin", em: "email", pr: "press",
      // 2026-08-29 官網頻道。web:blog / web:product-page / web:landing 三個
      // mockup 元件早就實作並註冊了，缺的只是這條前綴對應。
      web: "web",
      // 2026-09-10 X 通路。mockup 那側的 key 仍是 "twitter:"（XTweet /
      // XThread 早就註冊了），所以 x → twitter，不是 x → x。
      x: "twitter",
      // 2026-09-29 Threads（th-）→ threads:post；LINE（ln-）→ line:broadcast／richmenu。
      th: "threads", ln: "line",
    };
    const formatFromTaskId = (id: string): string => {
      // 2026-08-29 官網 (web-)：跟 pr- / em- 同樣的理由——先用前綴決斷，
      // 否則下面的關鍵字掃描會誤傷，例如 "web-30-product-faq" 會被 faq
      // 規則搶去判成 "qa"（那是新聞稿的 Q&A 卡片版型，不是產品頁）。
      if (id.startsWith("web-")) {
        if (id.includes("product")) return "product-page";
        if (id.includes("landing")) return "landing";
        return "blog";
      }
      // 2026-09-10 X (x-)：跟 web- / pr- / em- 同樣的理由 —— 前綴先決斷，
      // 否則下面的關鍵字掃描會誤傷。x-30-thread-listicle 會被 "list" 之外
      // 的規則放過，但 x-30-thread-story 會被 story 規則搶成 IG Stories，
      // x-30-hot-take 則會落到 "feed"。X 只有兩個 mockup，判斷就這兩條。
      if (id.startsWith("x-")) {
        return id.includes("thread") ? "thread" : "tweet";
      }
      if (id.startsWith("th-")) return "post";
      if (id.startsWith("ln-")) return id.includes("rich-menu") ? "richmenu" : "broadcast";
      // 2026-05-16 (CJ「pr-30-lead-paragraph mockup 格式不對」):
      // press (pr-) + email (em-) each have ONE mockup family. Decide
      // by prefix FIRST — otherwise generic keyword scans below
      // misfire, e.g. "pr-30-le[ad-]paragraph".includes("ad-") → "ad".
      // 2026-05-17 (CJ「QA 任務不該長得像報紙，要 Q&A 卡片」):
      // spokesperson-qa / any -qa / faq → dedicated Q&A mockup, not the
      // newspaper press-release sheet.
      if (id === "pr-30-spokesperson-qa" || /(?:^|-)qa(?:-|$)/.test(id) || id.includes("faq")) return "qa";
      // 2026-05-17 (CJ「CEO QUOTE → CEO SPEECH，致辭簡報版型」):
      // ceo-quote / ceo-speech / any -speech → slide-style speech mockup.
      if (id.includes("ceo-quote") || id.includes("speech")) return "speech";
      // 2026-05-17 (CJ「factsheet 要像 factsheet」): scannable one-pager.
      if (id.includes("fact-sheet") || id.includes("factsheet")) return "factsheet";
      // 2026-05-17 (CJ「公司簡介改成官網版型，好複製」): boilerplate →
      // official-website "About" page mockup, not the newspaper sheet.
      if (id.includes("boilerplate") || id.includes("about")) return "about";
      // 2026-05-17 (CJ「新聞點子產生器」): earned-idea angle card.
      if (id.includes("news-hook") || id.includes("newshook") || id.includes("newsjack")) return "hook";
      if (id.startsWith("pr-")) return "press-release";
      if (id.startsWith("em-")) return "edm";
      // Match a real "-ad-" / "ad-" / "-ad" segment, NOT the "ad-"
      // inside words like "lead-paragraph" / "broadcast".
      if (/(?:^|-)ad(?:-|$)/.test(id)) return "ad";
      // 2026-08-20: a PINNED comment is still a comment — but YouTube shows
      // it with the「由頻道發布者置頂」row, so give it its own key. Must be
      // tested before the plain "comment" rule below (and before "pinned",
      // which would otherwise never see it).
      if (id.startsWith("yt-") && id.includes("pinned-comment")) return "pinned-comment";
      if (id.includes("comment")) return "comment";
      if (id.includes("pinned")) return "pinned";
      // 2026-08-01: check BEFORE the "story" rule below — "storyboard"
      // contains "story" as a substring and was silently misclassified
      // as an IG/FB Stories mockup (CJ「分鏡圖的產出明顯不是分鏡圖」).
      if (id.includes("storyboard")) return "storyboard";
      if (id.includes("story")) return "story";
      if (id.includes("reel")) return "reel";
      // 2026-05-18 (CJ「每篇一個可編輯 mockup」): calendar posts are now
      // one VARIANT per post → render each as a normal FB feed post so
      // the per-variant edit / 改圖 / 排程 UI works per post.
      if (id.includes("calendar")) return "feed";
      if (id.includes("carousel")) return "carousel";
      if (id.includes("bio") || id.includes("profile")) return "profile";
      if (id.includes("live")) return "live";
      if (id.includes("thumbnail")) return "video-card";
      if (id.includes("shorts")) return "shorts";
      if (id.includes("community")) return "community";
      if (id.startsWith("yt-")) return "watch";
      if (id.includes("article")) return "article";
      if (id.includes("newsletter")) return "newsletter";
      if (id.includes("poll")) return "poll";
      if (id.includes("document")) return "document";
      if (id.startsWith("tt-")) return "foryou";
      if (id.startsWith("em-")) return "edm";
      if (id.startsWith("pr-")) return "press-release";
      return "feed";
    };

    if (taskId) {
      const idPrefix = taskId.split("-")[0];
      const platform = idPrefixMap[idPrefix];
      if (platform) {
        const format = formatFromTaskId(taskId);
        return { platform: platform as any, format: format as any, label: `${platform}:${format}` };
      }
    }

    // ── Layer 2: output.platform + outputType (DB columns, always present) ──
    // mission_outputs.platform is the enum (facebook/instagram/.../other)
    // mission_outputs.outputType maps to a sensible mockup format.
    const outputTypeToFormat: Record<string, string> = {
      post: "feed", story: "story", reel: "reel",
      ad_copy: "ad", email_html: "edm", slide: "carousel",
      script: "watch", product_desc: "feed", report: "research-doc",
    };
    const platformFromOutput = data?.platform && data.platform !== "other" ? data.platform : null;
    const formatFromOutput = outputTypeToFormat[data?.outputType ?? ""] ?? "feed";
    if (platformFromOutput) {
      return { platform: platformFromOutput as any, format: formatFromOutput as any, label: `${platformFromOutput}:${formatFromOutput}` };
    }

    // ── Layer 3: generic feed (last resort — caption still renders) ──
    return { platform: "generic" as any, format: formatFromOutput as any, label: `generic:${formatFromOutput}` };
  }, [data]);

  // 2026-05-16 (CJ「pr-30-launch-social 其實是三平台貼文，個別要 FB /
  // LinkedIn / Threads 的 mockup」): some tasks fan out variants by
  // PLATFORM TONE, not stylistic tone. When the active variant's label
  // names a platform, render THAT platform's mockup instead of the
  // task-level one. Tone labels (真誠版 / 事實式…) match no platform
  // keyword → base variant kept, so this is safe globally.
  const effectiveVariant: MockupVariant = useMemo(() => {
    const strategySelectionMockup = getStrategySelectionMockup(
      isStrategyEnvelope,
      selectedContentKind,
      slide?.format,
    );
    if (strategySelectionMockup) return strategySelectionMockup;
    // 商品頁不被版本標籤的關鍵字改版型（標籤含「Facebook」「IG」之類的字時會被認成貼文）。
    if (mockupVariant?.format === ("listing" as any)) return mockupVariant;
    const lbl = String(slide?.label ?? "");
    const v = (platform: string, format: string): MockupVariant =>
      ({ platform: platform as any, format: format as any, label: `${platform}:${format}` });
    // 2026-05-18 (CJ「釘選主文要 PIN / FAQ 要問答 / about us 要關於我們」;
    // follow-up「沒看到調整」): the taskId gate was unreliable (taskId
    // isn't always persisted → no-task → gate failed → fell to feed).
    // Drive the pinned-suite per-piece mockup off the DISTINCTIVE piece
    // labels themselves — these zh phrases are specific enough not to
    // collide with other tasks' tone labels (情感版 / 理性版 …).
    // 2026-05-19 (CJ 驗收 kl-60-pitch-pack「generic:feed 純白框，KOL 邀約
    // 應有訊息/信件 UI」): per-variant mockup for the KOL pitch pack —
    // 信件類 → email:dm（寄件人/收件人/主旨 letter UI）；Brief 附件 →
    // proposal-spec 文件。labels 同時涵蓋 squad step 名與新 orchestra 標籤。
    if (/合作\s*Brief|Brief（附件）|資料包|brand\s*brief/i.test(lbl)) return v("generic", "proposal-spec");
    if (/邀約主信|邀請開場|主信|報價回應|議價|追蹤信|後續追蹤|follow-?up|收尾感謝|發布後感謝|結案感謝/i.test(lbl)) return v("email", "dm");
    // 2026-09-10 顯示字改成「置頂」之後，這條**必須兩個都收**：
    // mission_outputs 裡已經存著大量「釘選…」的舊 variantLabel，只認新字
    // 會讓那些既有產出改用 feed 版型，而且不會有任何地方報錯。
    if (/已釘選|釘選主文|^釘選|已置頂|置頂主文|^置頂/i.test(lbl)) return v("facebook", "pinned");
    if (/常見問答|常見問題|FAQ|Q&A|問答集/i.test(lbl)) return v("facebook", "qa");
    if (/關於我們|about us/i.test(lbl)) return v("facebook", "about");
    if (/代表案例|客戶成功|case study/i.test(lbl)) return v("facebook", "feed");
    // 2026-05-18 (CJ「launch-toolkit 加總覽」): the 「活動總覽」 variant is
    // a one-page campaign plan → render as a doc; the 8 post variants
    // stay FB feed.
    if (/活動總覽|總覽|campaign overview/i.test(lbl)) return v("generic", "research-doc");
    // 2026-05-19 (CJ「這四個tab分別適合不同的mockup」): yt-99-quarterly-strategy
    // 4 tabs (即時趨勢報告 / 內容支柱 / 12 影片 title / Community 月曆).
    // Default mockupVariant is youtube:video-card (correct for 12 影片 tab).
    // Strategy/research tabs → generic doc; Community → YT community post.
    // 2026-05-19 v2: Competitor 分析 removed (5→4 tabs); chip order updated.
    if (/內容支柱|content pillar|即時趨勢/i.test(lbl)) return v("generic", "research-doc");
    if (/community\s*月曆|社群月曆/i.test(lbl)) return v("youtube", "community");
    // 2026-05-19 v2 (CJ): ig-99-save-worthy per-slide tabs.
    // Each "Slide N" tab → instagram:carousel (1:1 square with copy + AI image).
    // "主題研究" and "指標追蹤" tabs → research docs (general rules, safe globally).
    if (/^Slide\s+\d+/i.test(lbl)) return v("instagram", "carousel");
    if (/主題研究/.test(lbl)) return v("generic", "research-doc");
    if (/指標追蹤/.test(lbl)) return v("generic", "research-doc");
    if (/threads/i.test(lbl)) return v("threads", "post");
    if (/linkedin|領英/i.test(lbl)) return v("linkedin", "feed");
    if (/facebook|臉書|\bFB\b/i.test(lbl)) return v("facebook", "feed");
    if (/instagram|\bIG\b/i.test(lbl)) return v("instagram", "feed");
    if (/\bLINE\b/i.test(lbl)) return v("line", "broadcast");
    return mockupVariant;
  }, [mockupVariant, slide?.label, slide?.format, isStrategyEnvelope, selectedContentKind, data?.mission?.taskId]);

  if (!id || isNaN(id)) {
    return <div className="p-12 text-center text-default-500">{lang === "en" ? "Invalid run ID" : "無效的 run ID"}</div>;
  }
  if (isLoading) {
    return <div role="status" aria-live="polite" aria-label={lang === "en" ? "Loading" : "載入中"} className="p-12 flex justify-center"><Spinner size="lg" /></div>;
  }
  if (error || !data) {
    const notFound = (error as any)?.data?.code === "NOT_FOUND" || (error as any)?.data?.code === "FORBIDDEN";
    return (
      <div role="alert" className="p-12 flex flex-col items-center gap-3 text-default-600 text-center">
        {!notFound && !!error && (
          <>
            <p>{lang === "en" ? "This output didn't load. Check your connection and try again." : "這份產出沒載入，請檢查網路後再試一次。"}</p>
            <Button variant="flat" onPress={() => refetchRun?.()}>{lang === "en" ? "Retry" : "重試"}</Button>
          </>
        )}
        {(notFound || !error) && <p>{lang === "en" ? "Run not found (it may have been removed or you don't have access)" : "找不到這個 run（可能已被移除或無權限）"}</p>}
        <Button variant="flat" onPress={() => navigate("/projects")}>{lang === "en" ? "Back to Projects" : "回專案"}</Button>
      </div>
    );
  }
  // 2026-05-09 (CJ direction「我們只要留一個 mockup 模板，根除引用舊樣板的」):
  // No more red error blocking. mockupVariant always resolves to a usable
  // template via 3-layer fallback (taskId → output.platform → generic).

  const renderWhyWritten = (): React.ReactNode => {
    const detail: any = cardDetailQ.data;
    if (cardDetailQ.isLoading) return <p className="text-[12.5px] text-default-500">{lang === "en" ? "Loading…" : "載入中…"}</p>;
    if (!detail) return <p className="text-[12.5px] text-default-500">{lang === "en" ? "No registered source for this card." : "這張卡沒有登記出處。"}</p>;
    const src = localizeSource(detail.source ?? { type: "evergreen" }, detail, lang);
    return (
      <div className="space-y-1.5 rounded-lg bg-default-50 p-2.5 text-[12.5px] leading-relaxed text-default-800">
        <p className="font-medium">{sourceLabel(src.type, lang, { long: true })}</p>
        {src.short && <p><span className="text-default-500">{lang === "en" ? "Source: " : "出處："}</span>{src.short}</p>}
        {src.metric && <p><span className="text-default-500">{lang === "en" ? "Evidence: " : "傳播證據："}</span>{src.metric}{src.asOf ? (lang === "en" ? ` (measured ${src.asOf})` : `（${src.asOf} 量測）`) : ""}</p>}
        {src.takeaway && <p><span className="text-default-500">{lang === "en" ? "Why it works: " : "為什麼有效："}</span>{src.takeaway}</p>}
        {detail.rationale && <p className="whitespace-pre-wrap">{detail.rationale}</p>}
        {!src.short && !src.takeaway && !detail.rationale && <p className="text-default-500">{sourceWhy(src.type, lang)}</p>}
      </div>
    );
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(slide?.caption ?? "");
      setCopied(true);
      showToastGlobal(t("toast_copied"));
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div className="px-4 py-3 max-w-[1500px] mx-auto">
      {/* Header removed 2026-05-09 (CJ): was overlapping with ShellLayout's
          global brand picker. ShellLayout already shows the current brand
          + tier nav. Tier chip + 重跑 + 關閉 moved into the toolbar below. */}

      {/* ─── Breadcrumb (CJ 2026-05-13「編輯完文案回上一頁找不到存檔」):
            explicit path so the user knows where this output lives and
            has a 1-click way back to /projects without using the bare X.
            The save toast now mirrors this with an "Open Projects →" hint. */}
      <div className="flex items-center gap-1.5 text-tiny text-default-500 mb-2 px-1">
        <button
          onClick={() => navigate("/projects")}
          className="hover:text-default-900 transition flex items-center gap-1"
        >
          <FontAwesomeIcon icon={faFolderOpen} className="text-tiny" />
          {lang === "en" ? "Projects" : "專案"}
        </button>
        {(data as any)?.mission?.brandName && (
          <>
            <span className="text-default-300">›</span>
            <button
              onClick={() => navigate("/projects")}
              className="hover:text-default-900 transition truncate max-w-[160px]"
              title={(data as any).mission.brandName}
            >
              {String((data as any).mission.brandName ?? "")}
            </button>
          </>
        )}
        {(data as any)?.mission?.title && (
          <>
            <span className="text-default-300">›</span>
            <button
              onClick={() => navigate("/projects")}
              className="hover:text-default-900 transition truncate max-w-[260px]"
              title={taskName(String((data as any).mission.title ?? ""))}
            >
              {taskName(String((data as any).mission.title ?? ""))}
            </button>
          </>
        )}
        <span className="text-default-300">›</span>
        <span className="text-default-700 font-medium">
          {lang === "en" ? `Version #${(data as any)?.version ?? 1}` : `版本 #${(data as any)?.version ?? 1}`}
        </span>
      </div>

      {/* 2026-09-06 送審／審核狀態。沒有這條，/review 佇列永遠是空的 ——
          後端能收、佇列頁有，但沒有入口把稿子送進去。 */}
      <ReviewBar outputId={id} missionId={(data as any)?.mission?.id ?? null} statusOnly={writerDesk} />

      {/* 2026-05-14 (async polling): progress banner — only shown when the
          orchestra wrote captions early and is still working on images/QA */}
      {(() => {
        const p = (data as any)?.progress;
        if (strategyPublicGenerationState === "generating") {
          return (
            <div className="mb-3 mx-1 flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-tiny text-primary-700">
              <span className="inline-block w-3 h-3 border-2 border-primary-400 border-t-primary-700 rounded-full animate-spin" />
              <span className="flex-1">
                {lang === "en"
                  ? "Planning is ready — public posts are being generated in the background. This card will refresh automatically."
                  : "內容規劃已完成 · 對外貼文正在背景產生，這張卡會自動更新"}
              </span>
            </div>
          );
        }
        // hold-for-images tasks show their own full-card generating state
        // (the mockup is replaced) — skip the redundant slim banner.
        if (p === "caption_ready" &&
            (HOLD_FOR_IMAGES.has(data.mission?.taskId ?? "") || data.mission?.tier === "60s")) {
          return null;
        }
        if (p === "caption_ready") {
          return (
            <div className="mb-3 mx-1 flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-tiny text-primary-700">
              <span className="inline-block w-3 h-3 border-2 border-primary-400 border-t-primary-700 rounded-full animate-spin" />
              <span className="flex-1">
                {lang === "en"
                  ? "Captions are ready — images and QA are still finishing in the background. This card will refresh automatically."
                  : "文案已就緒 · 圖片與 QA 還在背景生成，這張卡會自動更新（約 30-60 秒）"}
              </span>
            </div>
          );
        }
        if (p === "failed") {
          const detailRaw = (data as any)?.progressDetail;
          const detail = typeof detailRaw === "string" ? detailRaw : null;
          return (
            <div className="mb-3 mx-1 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-tiny text-danger-700">
              <p className="font-semibold">
                {lang === "en" ? "Background generation failed" : "背景處理失敗"}
              </p>
              <p className="mt-0.5 line-clamp-2">{detail ?? (lang === "en" ? "Image gen or QA threw — captions above are still usable." : "圖片或 QA 階段失敗，但上面的文案仍可使用。")}</p>
            </div>
          );
        }
        return null;
      })()}

      {/* ─── Task label + status row (slim, non-overlapping) ────────── */}
      {/* 2026-05-14 (CJ「標題很長」): min-w-0 lets flex item shrink so
          `truncate` works; cap visible length explicitly as a defense net
          for legacy data that has caption.slice(0,80) baked in. */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <p
          className="text-tiny text-default-500 truncate flex-1 min-w-0"
          title={currentEmailSubject ? `主旨：${currentEmailSubject}` : (data.title || taskName(data.mission?.taskLabel || ""))}
        >
          {(() => {
            // For email tasks: show current slide's email subject (updates on tab switch)
            const raw = currentEmailSubject
              ? `主旨：${currentEmailSubject}`
              : data.title || taskName(data.mission?.taskLabel || "") || (lang === "en" ? "(Untitled)" : "(無標題)");
            const cps = Array.from(raw);
            return cps.length > 40 ? cps.slice(0, 38).join("") + "…" : raw;
          })()}
        </p>
        {/* DEBUG (2026-05-09): show mockup variant + taskId so we can trace
            which mockup is being chosen. Remove after verification. */}
        <Chip size="sm" variant="flat" className="font-mono text-[12px]">
          {effectiveVariant ? `${effectiveVariant.platform}:${effectiveVariant.format}` : "?"} · {data.mission?.taskId ?? "no-task"}
        </Chip>
        {/* 2026-09-30（CJ「廣告文案要標註」）：活動企劃上標了廣告的那一篇，寫出來就是廣告文案。 */}
        {(data as any)?.metadata?.campaignItem?.paid && (
          <Chip size="sm" className="bg-foreground text-background font-semibold">{lang === "en" ? "Ad copy" : "廣告文案"}</Chip>
        )}
        <Chip size="sm" variant="flat" color={data.status === "published" ? "success" : data.status === "scheduled" ? "warning" : "default"}>
          {data.status}
        </Chip>
        <CraftChip taskId={data.mission?.taskId} en={lang === "en"} />
      </div>

      {/* ─── Variant pills (horizontal) ─────────────────────────────── */}
      {isStrategyEnvelope ? (
        hideStrategyPlanningTabs ? (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {publicVariants.map((v, i) => (
              <button
                key={v.id ?? `public-${i}`}
                onClick={() => selectContent("publicVariants", i)}
                className={`px-3 py-1 rounded-full text-tiny transition border ${
                  i === activeIdx
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-default-700 border-default-200 hover:border-primary"
                }`}
              >
                {getStrategyPublicTabLabel({
                  taskId: data?.mission?.taskId,
                  isStrategyEnvelope,
                  format: v.format,
                  index: i,
                  fallbackLabel: vl(v.label),
                  language: lang === "en" ? "en" : "zh",
                })}
              </button>
            ))}
          </div>
        ) : (
        <div className="mb-3 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-default-500 mr-1">
              {lang === "en" ? "Strategy:" : "策略："}
            </span>
            {planningVariants.map((v, i) => (
              <button
                key={v.id ?? `planning-${i}`}
                onClick={() => selectContent("planningArtifacts", i)}
                className={`px-3 py-1 rounded-full text-tiny transition border ${
                  selectedContentKind === "planningArtifacts" && i === activeIdx
                    ? "bg-secondary text-white border-secondary"
                    : "bg-white text-default-700 border-default-200 hover:border-secondary"
                }`}
              >
                {v.label ? vl(v.label) : (lang === "en" ? `Plan ${i + 1}` : `策略 ${i + 1}`)}
              </button>
            ))}
            <button
              onClick={() => selectContent("publicVariants", 0)}
              className={`px-3 py-1 rounded-full text-tiny font-semibold transition border ${
                selectedContentKind === "publicVariants"
                  ? "bg-primary text-white border-primary"
                  : "bg-primary-50 text-primary-700 border-primary-200 hover:border-primary"
              }`}
            >
              {lang === "en" ? "Public posts" : "對外貼文"}
              {publicVariants.length > 0 ? ` (${publicVariants.length})` : ""}
            </button>
          </div>
          {selectedContentKind === "publicVariants" && publicVariants.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 pl-2 border-l-2 border-primary-100">
              <span className="text-[12px] text-default-600 mr-1">
                {lang === "en" ? "Posts:" : "貼文："}
              </span>
              {publicVariants.map((v, i) => (
                <button
                  key={v.id ?? `public-${i}`}
                  onClick={() => selectContent("publicVariants", i)}
                  className={`px-2.5 py-1 rounded-full text-[12px] transition border ${
                    i === activeIdx
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-default-600 border-default-200 hover:border-primary"
                  }`}
                >
                  {v.label ? vl(v.label) : (lang === "en" ? `Post ${i + 1}` : `貼文 ${i + 1}`)}
                </button>
              ))}
            </div>
          )}
        </div>
        )
      ) : variants.length > 1 && (() => {
        // Pool mode: >4 variants → progressive reveal (headline pool).
        // ≤4 → show all (normal multi-variant task, unchanged behavior).
        // Sequence tasks (每個變體是流程的一段) never pool — see SEQUENCE_TASKS.
        const isSequence = isSequenceTask;
        const pool = variants.length > 4 && !isSequence;
        const shown = pool ? Math.min(revealCount, variants.length) : variants.length;
        const more = variants.length - shown;
        return (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className="text-[12px] text-default-500 mr-1">
              {pool
                ? (lang === "en" ? "Headlines:" : "標題：")
                : isSequence
                ? (lang === "en" ? "Run of show:" : "流程：")
                : (lang === "en" ? "Versions:" : "版本：")}
            </span>
            {variants.slice(0, shown).map((v, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                className={`px-3 py-1 rounded-full text-tiny transition border ${
                  i === activeIdx
                    ? "bg-secondary text-white border-secondary"
                    : "bg-white text-default-700 border-default-200 hover:border-secondary"
                }`}
              >
                {vl(v.label)}
              </button>
            ))}
            {pool && more > 0 && (
              <button
                onClick={() => setRevealCount((c) => Math.min(variants.length, c + REVEAL_STEP))}
                className="px-3 py-1 rounded-full text-tiny border border-dashed border-secondary text-secondary hover:bg-secondary/5 transition"
              >
                {lang === "en"
                  ? `+ ${Math.min(REVEAL_STEP, more)} more (${more} left)`
                  : `再給我 ${Math.min(REVEAL_STEP, more)} 個（還有 ${more} 個）`}
              </button>
            )}
          </div>
        );
      })()}

      {/* ─── 2-COL: mockup big (no toolbar) + right tool panel ──────── */}
      {/* 2026-05-10: mobile responsive — stack on small screens. md+ keeps 2-col. */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-4 items-start">
        {handoffReveal && (
          <style>{`
            @keyframes ob-unfold-in {
              from { clip-path: inset(0 0 100% 0 round 16px); transform: translateY(-6px); opacity: .4 }
              to   { clip-path: inset(0 0 0 0 round 16px);   transform: none;              opacity: 1 }
            }
            .ob-unfold { animation: ob-unfold-in .8s cubic-bezier(.2,.8,.2,1) .5s both }
            @media (prefers-reduced-motion: reduce) { .ob-unfold { animation: none } }
          `}</style>
        )}
        {/* CENTER: pure mockup, no toolbar above (CJ direction 2026-05-09) */}
        <section className="min-w-0 flex flex-col gap-3">
          {/* 2026-09-29 主筆桌：本文是主角，直接打字改（回到寫文案的習慣）；貼文長相切到「預覽」看。 */}
          {writerDesk && (
            <div className="flex items-center gap-1 self-start rounded-lg bg-default-100 p-0.5">
              {(["text", "preview"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDeskView(v)}
                  className={`rounded-md px-3 py-1 text-[13px] transition ${deskView === v ? "bg-white font-medium text-default-900 shadow-sm" : "text-default-500 hover:text-default-800"}`}
                >
                  {v === "text" ? (lang === "en" ? "Draft" : "本文") : (lang === "en" ? "Post preview" : "貼文預覽")}
                </button>
              ))}
            </div>
          )}
          {writerDesk && deskView === "text" && (
            <div className={`rounded-2xl bg-white px-6 py-5 ring-1 ring-black/5 shadow-[0_4px_24px_rgba(0,0,0,0.05)] ${handoffReveal ? "ob-unfold" : ""}`}>
              <textarea
                value={slide?.caption ?? ""}
                onChange={(e) => onDeskType(e.target.value)}
                disabled={!!deskBusyKey || deskChatBusy}
                rows={Math.max(12, (slide?.caption ?? "").split("\n").length + 3)}
                placeholder={lang === "en" ? "Write here…" : "在這裡寫…"}
                className="w-full resize-none border-0 bg-transparent text-[16px] leading-[1.9] text-default-900 outline-none placeholder:text-default-300 disabled:opacity-50"
              />
              {(slide?.hashtags?.length ?? 0) > 0 && (
                <p className="mt-2 text-[14px] text-default-500">{(slide?.hashtags ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>
              )}
              <div className="mt-3 flex items-center justify-between border-t border-default-100 pt-2 text-[12px] text-default-600">
                <span>{lang === "en" ? `${(slide?.caption ?? "").length} characters` : `${(slide?.caption ?? "").length} 字`}</span>
                <span>
                  {deskBusyKey || deskChatBusy
                    ? (lang === "en" ? "Rewriting…" : "改寫中…")
                    : saveCaptionQuietMut.isPending
                    ? (lang === "en" ? "Saving…" : "儲存中…")
                    : (lang === "en" ? "Auto-saved" : "已自動儲存")}
                </span>
              </div>
            </div>
          )}
          <div ref={mockupRef} style={writerDesk && deskView === "text" ? { display: "none" } : undefined} className={`relative bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden ${handoffReveal && deskView === "preview" ? "ob-unfold" : ""}`}>
            {(() => {
              const holdMockup =
                (HOLD_FOR_IMAGES.has(data.mission?.taskId ?? "") ||
                  data.mission?.tier === "60s") &&
                (data as any)?.progress === "caption_ready";
              if (holdMockup) {
                return (
                  <div className="flex flex-col items-center justify-center gap-3 py-24 px-6 text-center">
                    <span className="inline-block w-8 h-8 border-[3px] border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                    <p className="text-small font-medium text-default-700">
                      {lang === "en" ? "Crafting your complete post…" : "完整貼文生成中…"}
                    </p>
                    <p className="text-tiny text-default-600 max-w-xs">
                      {lang === "en"
                        ? "Copy is done — images are rendering. The full post (copy + image) will appear here automatically (~30-60s)."
                        : "文案已完成，圖片生成中。完整貼文（文案＋圖片）會在這裡自動顯示（約 30-60 秒）"}
                    </p>
                  </div>
                );
              }
              if (isStrategyEnvelope && selectedContentKind === "publicVariants" && publicVariants.length === 0) {
                const isGeneratingPublicPosts = strategyPublicGenerationState === "generating";
                return (
                  <div className="flex flex-col items-center justify-center gap-3 py-20 px-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center text-xl">
                      {isGeneratingPublicPosts
                        ? <span className="inline-block w-6 h-6 border-[3px] border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                        : <RegenerateIcon size={18} />}
                    </div>
                    <p className="text-small font-semibold text-default-800">
                      {isGeneratingPublicPosts
                        ? (lang === "en" ? "Generating the public post…" : "對外貼文產生中…")
                        : (lang === "en" ? "The public post wasn't generated" : "尚未產生對外貼文")}
                    </p>
                    <p className="text-tiny text-default-500 max-w-sm leading-relaxed">
                      {isGeneratingPublicPosts
                        ? (lang === "en"
                            ? "Planning is ready. The publish-ready Instagram post will appear here automatically when background generation finishes."
                            : "內容規劃已完成。背景產生結束後，可直接發布的 Instagram 貼文會自動顯示在這裡。")
                        : (lang === "en"
                            ? "This run has no publish-ready post. Re-run the original task to try again."
                            : "這次產出尚未完成可直接發布的貼文，請重跑原任務再試一次。")}
                    </p>
                  </div>
                );
              }
              if (isPlanningArtifactMissingOutput(
                isStrategyEnvelope,
                selectedContentKind,
                slide?.caption,
                slide?.imageStatus,
              )) {
                return (
                  <div className="flex flex-col items-center justify-center gap-3 py-20 px-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-warning-50 text-warning-600 flex items-center justify-center text-xl">!</div>
                    <p className="text-small font-semibold text-default-800">
                      {lang === "en" ? "This step produced no output" : "這個步驟沒有產出"}
                    </p>
                    <p className="text-tiny text-default-500 max-w-sm leading-relaxed">
                      {lang === "en"
                        ? "This is an incomplete strategy step, not an image-generation failure. Re-run the original task to try the full strategy workflow again."
                        : "這是策略步驟未完成，不是圖片生成失敗。請重新執行原任務，再跑一次完整策略流程。"}
                    </p>
                    <Button color="primary" variant="flat" onPress={rerunOriginalTask}>
                      {lang === "en" ? "Re-run this task" : "重新產生這個任務"}
                    </Button>
                  </div>
                );
              }
              return effectiveVariant && slide ? (
              <>
              {isComponentTask && (
                <div className="mx-4 mt-3 flex items-center gap-1.5 text-tiny text-default-600">
                  <PuzzleIcon size={13} />
                  <span className="font-medium">{lang === "en" ? "Component task" : "元件任務"}</span>
                  <HelpTip>
                    {componentSlot
                      ? (lang === "en"
                          ? "Component task: your deliverable is rendered in its real ad slot below (outlined). Dashed gray areas are NOT produced by this task. Switch the version pills above to compare angles."
                          : "元件任務：交付物已放進下方版型的實際位置（框線標記處）；灰色虛線區塊非本任務產出。切換上方版本標籤比較不同切角。")
                      : (lang === "en"
                          ? "Component task: each version is ONE short, copy-ready line (e.g. ad headline / description / button text) — not a full post. Switch the version pills above to compare angles; the post frame is just placement context."
                          : "元件任務：每個版本是「一條」可直接複製使用的短句（廣告標題／描述／按鈕文字等），本來就不是完整貼文。切換上方版本標籤比較不同切角；貼文外框只是示意擺放位置。")}
                  </HelpTip>
                </div>
              )}
              <PlatformMockup
                variant={{ ...effectiveVariant, label: `${effectiveVariant.label} · ${slide.label}` }}
                title={data.title ?? ""}
                brief={""}
                brandName={(data as any).product?.name ?? data.brand?.name ?? ""}
                brandLogoUrl={(data as any).product?.logoUrl ?? data.brand?.logoUrl ?? null}
                liveCaption={slide.caption}
                liveListing={(data?.metadata as any)?.listing ?? null}
                liveSourceComment={sourceComment}
                liveHashtags={slide.hashtags}
                liveImageStyle={slide.imageStyle}
                liveImageUrl={slide.imageUrl ?? undefined}
                liveImageStatus={slide.imageStatus as any}
                liveCards={slide.cards as any}
                overlayTitle={mockupVariant?.platform === "youtube" ? overlayTitle : undefined}
                onGenerateImage={isStrategyPlanning
                  ? undefined
                  : () => {
                      // 2026-09-29（CJ「要生圖嗎？要的話會打開生圖的任務卡」）：純文字任務點預覽圖區，
                      // 帶到下方的圖片任務卡清單（選尺寸 → 開卡、帶入文案）；有該通路圖片卡才這樣走。
                      const offer = slide.imageStatus === "skipped" && document.getElementById(IMAGE_CARD_OFFER_ID);
                      if (offer) { offer.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
                      manualImageRef.current = true; setMode("image");
                    }}
                componentSlot={componentSlot}
              />
              {!isStrategyPlanning && !isComponentTask && (
                <ImageCardOffer
                  platform={mockupVariant?.platform}
                  copy={String(slide.caption ?? "")}
                  runId={outputId}
                  hasImage={!!slide.imageUrl}
                  locator={getRunContentMutationLocator(selectedContentKind, activeIdx)}
                />
              )}
              {/* 2026-09-21 (CJ「不行的時候，再讓用戶選 NANO BANANA」): gpt-image-2 failed even after the
                  automatic same-model retry. Say so plainly and let the USER pick — nothing switches on
                  its own. Also covers a failed manual attempt (imageFailure). */}
              {!isStrategyPlanning && (slide.imageStatus === "failed" || imageFailure) && !imageGenMut.isPending && (() => {
                const canNano = (imageFailure?.canSwitchTo ?? slide.imageCanSwitchTo) === "nano-banana";
                const reason = imageFailure?.message || sanitizeProviderErrorForToast(slide.imageErrorMsg ?? "");
                const promptText = imagePrompt.trim()
                  || pickImagePromptSeed({ imagePromptZh: slide.imagePromptZh, imagePrompt: slide.imagePrompt, imageStyle: slide.imageStyle })
                  || String(slide.caption ?? "").slice(0, 300);
                return (
                  <div className="mx-4 mt-3 rounded-lg border border-warning-300 bg-warning-50 px-3 py-2.5 space-y-2">
                    <p className="text-tiny font-semibold text-warning-800">
                      {lang === "en"
                        ? "The image wasn't generated (GPT Image 2 was retried once automatically)."
                        : "這張圖沒有產出成功（GPT Image 2 已自動重試一次）。"}
                    </p>
                    {reason && <p className="text-[12px] text-warning-700 whitespace-pre-line leading-relaxed">{reason.slice(0, 300)}</p>}
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" color="secondary" variant="flat" isDisabled={!promptText}
                        onPress={() => startImageGen("gpt-image-2", promptText)}>
                        {lang === "en" ? "Try GPT Image 2 again" : "再試一次（GPT Image 2）"}
                      </Button>
                      {canNano && (
                        <Button size="sm" color="secondary" variant="bordered" isDisabled={!promptText}
                          onPress={() => startImageGen("nano-banana", promptText)}>
                          {lang === "en" ? "Try Nano Banana instead" : "改用 Nano Banana"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })()}
              </>
              ) : null;
            })()}
            {/* 2026-08-12 (bug checklist C7「任務承諾之留言模板/發文時段/24h
                跟進未見於輸出」): the backend has generated these (Stage 3.5
                in quickTaskOrchestra) and the client was already capturing
                them into slide.extras — just never rendering them anywhere.
                Confirmed via grep: zero references to replyTemplates/
                postingTime/followupPost in the entire PlatformMockup tree. */}
            {slide?.extras && (slide.extras.postingTime || slide.extras.replyTemplates?.length > 0 || slide.extras.followupPost) && (
              <div className="mx-4 mt-3 space-y-2">
                {slide.extras.postingTime && (
                  <div className="rounded-lg border border-divider bg-default-50 px-3 py-2">
                    <p className="text-tiny font-semibold text-default-700 mb-1">
                      <WaitingIcon size={11} /> {lang === "en" ? "Suggested posting time" : "建議發文時段"}
                    </p>
                    <p className="text-tiny text-default-600">{slide.extras.postingTime}</p>
                  </div>
                )}
                {Array.isArray(slide.extras.replyTemplates) && slide.extras.replyTemplates.length > 0 && (
                  <div className="rounded-lg border border-divider bg-default-50 px-3 py-2">
                    <p className="text-tiny font-semibold text-default-700 mb-1.5">
                      <CommentIcon size={11} /> {lang === "en" ? "Suggested reply templates" : "建議留言模板"}
                    </p>
                    <div className="space-y-1.5">
                      {slide.extras.replyTemplates.map((r: { userSays: string; yourReply: string }, i: number) => (
                        <div key={i} className="text-tiny">
                          <p className="text-default-500"><UserIcon size={10} /> {r.userSays}</p>
                          <p className="text-default-700 pl-4">↳ {r.yourReply}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {slide.extras.followupPost && (
                  <div className="rounded-lg border border-divider bg-default-50 px-3 py-2">
                    <p className="text-tiny font-semibold text-default-700 mb-1">
                      <RegenerateIcon size={11} /> {lang === "en" ? "24h follow-up post" : "24 小時後續貼文"}
                    </p>
                    <p className="text-tiny text-default-600 whitespace-pre-line">{slide.extras.followupPost}</p>
                  </div>
                )}
              </div>
            )}
            {/* 2026-05-18 (CJ「下載圖示出現在圖片某個地方就好」): a small
                download ICON floating over the mockup (top-right), instead
                of a separate button below. fetch→blob forces a real save
                (cross-origin PiAPI/storage); falls back to a new tab. */}
            {(slide?.imageUrl && slide?.imageStatus === "ready") && (() => {
              const dlUrl = slide!.imageUrl as string;
              const dlLabel = lang === "en" ? "Download image" : "下載圖片";
              return (
              <button
                title={dlLabel}
                aria-label={dlLabel}
                onClick={async () => {
                  const url = dlUrl;
                  try {
                    const res = await fetch(url, { mode: "cors" });
                    const blob = await res.blob();
                    const obj = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = obj;
                    const safe = (data?.title ?? "image").replace(/[^\w一-龥-]+/g, "_").slice(0, 40);
                    const ext = (blob.type.split("/")[1] || "png").split("+")[0];
                    a.download = `${safe || "image"}.${ext}`;
                    a.click();
                    URL.revokeObjectURL(obj);
                  } catch {
                    window.open(url, "_blank", "noopener");
                  }
                }}
                className="absolute top-3 right-3 z-20 flex items-center justify-center w-9 h-9 rounded-full shadow-md transition hover:scale-105"
                style={{ background: "rgba(24,24,27,0.88)", color: "#fff", backdropFilter: "blur(2px)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              );
            })()}
          </div>
          {/* 2026-08-22 (CJ「IG 直播配套…應該是指完整的直播範本」): the
              deliverable is one timeline, so show all segments together as a
              rundown table. Row click switches the mockup to that segment;
              edits made above are reflected because `overrides` feeds in. */}
          {isSequenceTask && variants.length > 1 && (
            <div className="rounded-2xl bg-white shadow-[0_4px_24px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-divider">
                <p className="text-small font-semibold text-default-800">
                  {lang === "en" ? "Full run of show" : "完整流程表"}
                </p>
                <button
                  onClick={async () => {
                    const text = variants
                      .map((v, i) => {
                        const r = parseRunOfShow(overrides[i]?.caption ?? v.caption ?? "", v.label ?? "");
                        return [
                          `${r.time}　${r.stage}`.trim(),
                          r.cues && `${lang === "en" ? "Screen / action" : "畫面／動作指示"}：\n${r.cues}`,
                          r.script && `${lang === "en" ? "Host script" : "主播口白"}：\n${r.script}`,
                        ].filter(Boolean).join("\n");
                      })
                      .join("\n\n");
                    try {
                      await navigator.clipboard.writeText(text);
                      showToastGlobal(lang === "en" ? "Run of show copied" : "已複製整份流程表");
                    } catch {
                      showToastGlobal(lang === "en" ? "Copy failed" : "複製失敗");
                    }
                  }}
                  className="text-tiny px-3 py-1 rounded-full border border-default-200 text-default-700 hover:border-secondary hover:text-secondary transition"
                >
                  {lang === "en" ? "Copy all" : "複製整份"}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-tiny border-collapse">
                  <thead>
                    <tr className="bg-default-50 text-default-500">
                      <th className="text-left font-medium px-3 py-2 w-[96px]">{lang === "en" ? "Time" : "時間"}</th>
                      <th className="text-left font-medium px-3 py-2 w-[104px]">{lang === "en" ? "Stage" : "流程階段"}</th>
                      <th className="text-left font-medium px-3 py-2">{lang === "en" ? "Screen / action" : "畫面／動作指示"}</th>
                      <th className="text-left font-medium px-3 py-2">{lang === "en" ? "Host script" : "主播口白"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((v, i) => {
                      const r = parseRunOfShow(overrides[i]?.caption ?? v.caption ?? "", v.label ?? "");
                      return (
                        <tr
                          key={i}
                          onClick={() => setActiveIdx(i)}
                          className={`cursor-pointer border-t border-divider align-top ${
                            i === activeIdx ? "bg-secondary/10" : "hover:bg-default-50"
                          }`}
                        >
                          <td className="px-3 py-2 whitespace-nowrap text-default-700 font-medium">{r.time}</td>
                          <td className="px-3 py-2 text-default-700">{r.stage}</td>
                          <td className="px-3 py-2 text-default-600 whitespace-pre-line">{r.cues}</td>
                          <td className="px-3 py-2 text-default-600 whitespace-pre-line">{r.script}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* 2026-05-17 (CJ「可以讓用戶編輯後直接下載」): speech script
              download. Uses the current (edited) caption + the same
              <a download> blob pattern as the .ics export. */}
          {(["speech", "factsheet", "about"].includes(effectiveVariant?.format as string)) && slide?.caption && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(slide.caption);
                    showToastGlobal(lang === "en" ? "Copied" : "已複製全文");
                  } catch {
                    showToastGlobal(lang === "en" ? "Copy failed — select & copy manually" : "複製失敗，請手動選取");
                  }
                }}
                className="px-4 py-2 rounded-lg text-tiny font-semibold text-white"
                style={{ background: "#18181b" }}
              >
                {lang === "en" ? "Copy full text" : "複製全文"}
              </button>
              <button
                onClick={exportSlidePng}
                disabled={exporting}
                className="px-4 py-2 rounded-lg text-tiny font-semibold border disabled:opacity-60"
                style={{ borderColor: "#18181b", color: "#18181b" }}
              >
                {exporting
                  ? (lang === "en" ? "Rendering…" : "產生圖片中…")
                  : (lang === "en" ? "Image (PNG)" : "圖片（PNG）")}
              </button>
              <button
                onClick={() => {
                  const md = slide.caption;
                  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  const safe = (data.title ?? "press-output").replace(/[^\w一-龥-]+/g, "_").slice(0, 40);
                  a.download = `${safe || "press-output"}.md`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
                className="px-4 py-2 rounded-lg text-tiny font-semibold border"
                style={{ borderColor: "#18181b", color: "#18181b" }}
              >
                {lang === "en" ? "Full text (.md)" : "全文（.md）"}
              </button>
            </div>
          )}

          {/* 2026-05-19 (CJ「某個影片 title 產出腳本」): 12-title script panel.
              Only visible when the active tab is "12 影片 title". Parses
              ①–⑫ titles from the caption and renders a compact list;
              each row has a "📝 腳本" button that opens the script modal. */}
          {/12\s*影片\s*title/i.test(slide?.label ?? "") && (() => {
            const raw = slide?.caption ?? "";
            const rows = [...raw.matchAll(/^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫])\s*(.+)$/gmu)].map(m => ({
              num: m[1], title: m[2].trim(),
            }));
            if (rows.length === 0) return null;
            return (
              <div className="rounded-xl border border-default-200 bg-white overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b border-default-100 flex items-center justify-between">
                  <span className="text-small font-semibold text-default-700">
                    {lang === "en" ? "12 Video Titles" : "12 支影片 title"}
                  </span>
                  <span className="text-tiny text-default-600">{rows.length} 支</span>
                </div>
                <div className="divide-y divide-default-100">
                  {rows.map((row, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-default-50 transition group">
                      <span className="text-default-600 text-tiny font-mono w-5 shrink-0">{row.num}</span>
                      <span className="flex-1 text-small text-default-800 leading-snug">{row.title}</span>
                      <button
                        onClick={() => {
                          setScriptModalTitle(row.title);
                          setGeneratedScript(null); setScriptCompliance(null);
                          setScriptCopied(false);
                        }}
                        className="shrink-0 px-2.5 py-1 rounded-lg text-tiny font-semibold border border-secondary/40 text-secondary opacity-0 group-hover:opacity-100 transition hover:bg-secondary/5"
                      >
                        <span className="inline-flex items-center gap-1"><TextIcon size={11} />{lang === "en" ? "Script" : "腳本"}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Script generation modal */}
          {scriptModalTitle !== null && (
            <Modal
              isOpen
              onClose={() => { setScriptModalTitle(null); setGeneratedScript(null); setScriptCompliance(null); }}
              size="3xl"
              scrollBehavior="inside"
            >
              <ModalContent>
                <ModalHeader className="flex flex-col gap-1">
                  <span className="text-small font-normal text-default-500">
                    {lang === "en" ? "Script for" : "腳本 ·"}
                  </span>
                  <span className="text-medium font-bold leading-snug">{scriptModalTitle}</span>
                </ModalHeader>
                <ModalBody>
                  {!generatedScript && !scriptMut?.isPending && (
                    <div className="flex flex-col items-center gap-4 py-8 text-center">
                      <Button
                        color="secondary"
                        onPress={() => {
                          if (!scriptMut) return;
                          scriptMut.mutate({
                            videoTitle: scriptModalTitle,
                            titleContext: slide?.caption ?? undefined,
                            brandId: data?.brand?.id ?? undefined,
                            productId: (data as any)?.metadata?.productId ?? undefined,
                            eventId: (data as any)?.metadata?.eventId ?? undefined,
                          });
                        }}
                      >
                        {lang === "en" ? "Generate script" : "產出腳本"}
                      </Button>
                    </div>
                  )}
                  {scriptMut?.isPending && (
                    <div className="flex flex-col items-center gap-3 py-12">
                      <span className="w-8 h-8 border-[3px] border-secondary/20 border-t-secondary rounded-full animate-spin inline-block" />
                      <span className="text-small text-default-500">
                        {lang === "en" ? "Generating script…" : "腳本生成中（約 20–40 秒）…"}
                      </span>
                    </div>
                  )}
                  {generatedScript && scriptCompliance && (
                    <RegulationComplianceNote rec={scriptCompliance} en={lang === "en"} />
                  )}
                  {generatedScript && (
                    <div className="prose prose-sm max-w-none text-default-800 text-small leading-relaxed whitespace-pre-wrap font-[inherit]">
                      {generatedScript}
                    </div>
                  )}
                </ModalBody>
                <ModalFooter className="gap-2">
                  {generatedScript && (
                    <>
                      <Button
                        variant="flat"
                        size="sm"
                        onPress={async () => {
                          try {
                            await navigator.clipboard.writeText(generatedScript);
                            setScriptCopied(true);
                            setTimeout(() => setScriptCopied(false), 2000);
                          } catch { showToastGlobal(lang === "en" ? "Copy failed" : "複製失敗"); }
                        }}
                      >
                        {scriptCopied ? <span className="inline-flex items-center gap-1"><CheckIcon size={11} />{lang === "en" ? "Copied" : "已複製"}</span> : (lang === "en" ? "Copy script" : "複製腳本")}
                      </Button>
                      <Button
                        variant="flat"
                        size="sm"
                        onPress={() => {
                          setGeneratedScript(null); setScriptCompliance(null);
                          setScriptCopied(false);
                          if (scriptMut) {
                            scriptMut.mutate({
                              videoTitle: scriptModalTitle!,
                              titleContext: slide?.caption ?? undefined,
                              brandId: data?.brand?.id ?? undefined,
                              productId: (data as any)?.metadata?.productId ?? undefined,
                              eventId: (data as any)?.metadata?.eventId ?? undefined,
                            });
                          }
                        }}
                      >
                        {lang === "en" ? "Regenerate" : "重新產出"}
                      </Button>
                    </>
                  )}
                  <Button
                    variant="light"
                    size="sm"
                    onPress={() => { setScriptModalTitle(null); setGeneratedScript(null); setScriptCompliance(null); }}
                  >
                    {lang === "en" ? "Close" : "關閉"}
                  </Button>
                </ModalFooter>
              </ModalContent>
            </Modal>
          )}
        </section>

        {/* RIGHT: toolbar (top) + mode panel + publish actions
            CJ direction 2026-05-09: 'toolbar 一道右方對話窗上面，當用戶選擇
            不同按鍵，在顯示出該功能' — toolbar is the tab bar for the panel */}
        <aside className="space-y-3 sticky top-2 self-start md:max-h-[calc(100vh-1rem)] md:overflow-y-auto">
          {isEmptyPublicSelection ? (
            <Card>
              <CardBody className="space-y-3 p-4">
                <p className="text-small font-semibold">
                  {lang === "en" ? "No public post to edit yet" : "目前沒有可操作的對外貼文"}
                </p>
                <p className="text-[12px] text-default-500 leading-relaxed">
                  {lang === "en"
                    ? "Re-run this task to generate the public post again."
                    : "請重跑此任務，再次產生對外貼文。"}
                </p>
                <Button color="primary" fullWidth onPress={rerunOriginalTask}>
                  {lang === "en" ? "Re-run task" : "重跑此任務"}
                </Button>
                <Button variant="light" fullWidth onPress={() => navigate("/projects")}>
                  {lang === "en" ? "Back to Projects" : "返回專案"}
                </Button>
              </CardBody>
            </Card>
          ) : (
          <>
          {/* Toolbar — clicking a button switches mode + the panel below
              expands to show that tool. */}
          {writerDesk ? (
            <div className="bg-white rounded-xl border border-default-200 shadow-sm">
              <div className="flex items-center gap-0.5 px-2 py-1.5">
                {hasImageSlot && (
                  <ToolbarBtn icon={ImageIcon} label={lang === "en" ? "Redo image" : "改圖"} active={mode === "image"}
                    onClick={() => { if (mode === "image") setMode("chat"); else { setMode("image"); setDeskView("preview"); } }} />
                )}
                <ToolbarBtn icon={CopyIcon} label={lang === "en" ? "Copy caption" : "複製文案"} onClick={onCopy} highlight={copied} />
                <div className="flex-1" />
                <Tooltip content={lang === "en" ? "Re-run task" : "重跑同任務"} placement="bottom">
                  <button onClick={rerunOriginalTask} aria-label={lang === "en" ? "Re-run" : "重跑"}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-default-500 hover:bg-default-100 hover:text-default-800 transition">
                    <FontAwesomeIcon icon={faRotateRight} className="text-tiny" />
                  </button>
                </Tooltip>
                <Tooltip content={lang === "en" ? "Close → Projects" : "關閉 → 專案"} placement="bottom">
                  <button onClick={() => navigate("/projects")} aria-label={lang === "en" ? "Close to Projects" : "關閉到專案"}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-default-500 hover:bg-default-100 hover:text-default-800 transition">
                    <FontAwesomeIcon icon={faXmark} className="text-tiny" />
                  </button>
                </Tooltip>
              </div>
            </div>
          ) : (
          <div className="bg-white rounded-xl border border-default-200 shadow-sm">
            <div className="flex items-center gap-0.5 px-2 py-1.5 flex-wrap">
              <ToolbarBtn icon={EditIcon}        label={lang === "en" ? "Edit text" : "編輯"}      active={mode==="edit"}  onClick={() => setMode("edit")} />
              <ToolbarBtn icon={CommentIcon} label={lang === "en" ? "Chat with AI" : "對話修改"} active={mode==="chat"}  onClick={() => setMode("chat")} />
              {hasImageSlot && (
                <ToolbarBtn icon={ImageIcon}   label={lang === "en" ? "Redo image" : "改圖"}          active={mode==="image"} onClick={() => setMode("image")} />
              )}
              <Divider />
              {/* Agent avatars — click to see that agent's thinking */}
              <Tooltip content={lang === "en" ? "Caption agent — see thinking" : "撰寫者 — 看思考過程"}>
                <button
                  onClick={() => { setMode("agent"); setFocusedAgent("caption"); }}
                  className={`w-7 h-7 rounded-full overflow-hidden ring-1 transition ${mode==="agent" && focusedAgent==="caption" ? "ring-secondary ring-2" : "ring-default-200 hover:ring-secondary"}`}
                >
                  {(() => {
                    const ca: any = data.metadata?.captionAgent;
                    const name = typeof ca === "object" ? ca?.name : ca;
                    const av = typeof ca === "object" ? ca?.avatarUrl : null;
                    return <Avatar src={av || `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(name ?? "Caption")}`} alt={typeof ca === "object" ? agentLabel(ca, lang) : name} className="w-7 h-7" />;
                  })()}
                </button>
              </Tooltip>
              <Tooltip content={lang === "en" ? "Visual AI — see thinking" : "視覺 AI 專家 — 看思考過程"}>
                <button
                  onClick={() => { setMode("agent"); setFocusedAgent("image"); }}
                  className={`w-7 h-7 rounded-full overflow-hidden ring-1 transition ${mode==="agent" && focusedAgent==="image" ? "ring-secondary ring-2" : "ring-default-200 hover:ring-secondary"}`}
                >
                  {(() => {
                    const ia: any = data.metadata?.imageAgent;
                    const name = typeof ia === "object" ? ia?.name : ia;
                    const av = typeof ia === "object" ? ia?.avatarUrl : null;
                    return <Avatar src={av || `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(name ?? "Visual")}`} alt={typeof ia === "object" ? agentLabel(ia, lang) : name} className="w-7 h-7" />;
                  })()}
                </button>
              </Tooltip>
              <Divider />
              {!isStrategyEnvelope && (
                <ToolbarBtn icon={RegenerateIcon} label={lang === "en" ? "Rewrite this" : "重生這段"} active={mode==="regen"} onClick={() => setMode("regen")} />
              )}
              {/* 2026-07-07 (CJ「參數儀表板客戶看不懂 → 換成選不同 agent 重寫」) */}
              <ToolbarBtn icon={RewriteAsIcon}   label={lang === "en" ? "Rewrite by agent" : "換人重寫"}   active={mode==="rewrite"}  onClick={() => setMode("rewrite")} />
              <ToolbarBtn icon={LibraryIcon}      label={lang === "en" ? "Why it's written this way" : "為什麼這樣寫"} active={mode==="source"} onClick={() => setMode("source")} />
              {/* 2026-10-01（CJ「用 AI 幫忙查出可以合作的廠商，可以自己接洽聯繫」）：網紅、異業合作、廣告的產出才有。 */}
              {vendorKindOf(data.mission?.taskId, !!(data as any)?.metadata?.campaignItem?.paid) && (
                <ToolbarBtn icon={PartnerIcon} label={lang === "en" ? "Find partners" : "找合作對象"} active={mode==="vendors"} onClick={() => setMode("vendors")} />
              )}
              <Divider />
              <ToolbarBtn icon={CopyIcon}    label={lang === "en" ? "Copy caption" : "複製文案"}       onClick={onCopy} highlight={copied} />
              {/* 2026-05-11 (CJ feedback「存 Mission 不要出現在工具列，只要在下方」):
                  publish card 已經有「存到 Mission」按鈕，工具列這個是重複，砍掉。 */}
              <Divider />
              <Tooltip content={lang === "en" ? "Re-run task" : "重跑同任務"} placement="bottom">
                <button
                  onClick={rerunOriginalTask}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-default-500 hover:bg-default-100 hover:text-default-800 transition"
                  aria-label={lang === "en" ? "Re-run" : "重跑"}
                >
                  <FontAwesomeIcon icon={faRotateRight} className="text-tiny" />
                </button>
              </Tooltip>
              <Tooltip content={lang === "en" ? "Close → Projects" : "關閉 → 專案"} placement="bottom">
                <button
                  onClick={() => navigate("/projects")}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-default-500 hover:bg-default-100 hover:text-default-800 transition"
                  aria-label={lang === "en" ? "Close to Projects" : "關閉到專案"}
                >
                  <FontAwesomeIcon icon={faXmark} className="text-tiny" />
                </button>
              </Tooltip>
            </div>
          </div>
          )}
          <Card>
            <CardBody className="space-y-3">
              {/* 2026-09-30（CJ「表示有進行合規檢查」）：產出時的法規合規檢查結果（品牌沒有法規就沒有這筆）。 */}
              {mode !== "image" && (() => {
                const recs: ComplianceRecord[] = Array.isArray((data as any)?.metadata?.regulationCompliance)
                  ? (data as any).metadata.regulationCompliance : [];
                const rec = recs.find((r) => r.variantIndex === activeIdx);
                return rec ? <RegulationComplianceNote rec={rec} en={lang === "en"} /> : null;
              })()}
              {/* 2026-10-04：寫作前針對當次主題上網查到的案例與說法（researchTopic 任務才有）。 */}
              {mode !== "image" && (() => {
                const md = (data as any)?.metadata;
                const refs = Array.isArray(md?.references) ? md.references : [];
                return <ResearchSources refs={refs} note={typeof md?.researchNote === "string" ? md.researchNote : null} en={lang === "en"} />;
              })()}
              {/* 品牌一致性檢查（brandConsistency.ts）：同一份品牌大腦寫、也審。skipped 顯示「未檢查」。 */}
              {mode !== "image" && (() => {
                const brec = pickBrandRecord((data as any)?.metadata?.brandConsistency, activeIdx);
                return brec ? <BrandConsistencyNote rec={brec} en={lang === "en"} /> : null;
              })()}
              {writerDesk && mode !== "image" && (
                <WriterDesk
                  en={lang === "en"}
                  lead={deskLead}
                  others={deskOthers}
                  activeKey={deskActiveKey}
                  draftKeys={Object.keys(deskDrafts)}
                  busyKey={deskBusyKey}
                  onPick={pickDeskWriter}
                  leadReason={renderWhyWritten()}
                  chatHistory={chatHistory}
                  notes={<RefineNotesList outputId={id} locator={getRunContentMutationLocator(selectedContentKind, activeIdx)} en={lang === "en"} />}
                  chatBusy={deskChatBusy}
                  onSend={sendDeskChat}
                  canUndo={!!deskUndo && deskUndo.key === activeSelectionKey}
                  onUndo={undoDeskChat}
                  onHandoffLanded={() => setHandoffReveal(true)}
                />
              )}
              {!writerDesk && mode === "chat" && (
                <>
                  <p className="text-tiny font-semibold">{lang === "en" ? "Tell the AI specialist what to change" : "跟 AI 專家改文案"}</p>
                  {chatHistory.length > 0 && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto bg-default-50 rounded-lg p-2">
                      {chatHistory.slice(-4).map((m, i) => (
                        <div key={i} className={`text-[12px] leading-relaxed ${m.role==="user" ? "text-default-900" : "text-secondary"}`}>
                          <span className="font-semibold mr-1">{m.role==="user" ? (lang === "en" ? "You" : "你") : "AI"}{lang === "en" ? ": " : "："}</span>
                          {m.content.slice(0, 180)}{m.content.length > 180 ? "…" : ""}
                        </div>
                      ))}
                    </div>
                  )}
                  <Textarea
                    placeholder={lang === "en" ? "Describe how to change it…" : "說明你想怎麼改…"}
                    value={chatPrompt}
                    onChange={(e) => setChatPrompt(e.target.value)}
                    minRows={3}
                  />
                  {aiPreview && (
                    <div className="text-[12px] bg-secondary-50 border border-secondary-200 rounded-lg p-2 space-y-1.5">
                      <p className="font-semibold text-secondary-700">{lang === "en" ? "AI rewrite preview" : "AI 改寫預覽"}</p>
                      <p className="whitespace-pre-wrap leading-relaxed text-default-800 max-h-32 overflow-y-auto">{aiPreview.text}</p>
                      <div className="flex gap-1.5 pt-1">
                        <Button size="sm" color="secondary"
                          isDisabled={updateMut.isPending}
                          onPress={() => {
                            const key = getMutationLocatorSelectionKey(aiPreview.locator);
                            setOverrides(o => ({ ...o, [key]: { caption: aiPreview.text } }));
                            updateMut.mutate({ id, ...aiPreview.locator, caption: aiPreview.text, ...(aiPreview.compliance ? { regulationCompliance: toComplianceInput(aiPreview.compliance) } : {}) });
                            setAiPreview(null);
                          }}
                        >{lang === "en" ? "Use it" : "採用"}</Button>
                        <Button size="sm" variant="flat" onPress={() => setAiPreview(null)}>{lang === "en" ? "Discard" : "放棄"}</Button>
                      </div>
                    </div>
                  )}
                  <Button
                    color="secondary" fullWidth
                    isDisabled={!chatPrompt.trim() || !refineMut || refineMut.isPending}
                    isLoading={refineMut?.isPending}
                    onPress={async () => {
                      if (!refineMut) { showToastGlobal(lang === "en" ? "AI rewrite is unavailable" : "AI 改寫服務暫不可用"); return; }
                      const locator = getRunContentMutationLocator(selectedContentKind, activeIdx);
                      try {
                        const r = await refineMut.mutateAsync({
                          currentCaption: slide?.caption ?? "",
                          userFeedback: chatPrompt,
                          brandId: data.mission?.brandId ?? undefined,
                          // 2026-09-29：改寫讀同一份品牌大腦，含原本那篇的產品／活動。
                          productId: (data as any)?.metadata?.productId ?? undefined,
                          eventId: (data as any)?.metadata?.eventId ?? undefined,
                          history: chatHistory,
                          outputId: id, ...locator,
                        });
                        (utils as any)?.quickTask?.refineNotes?.invalidate?.({ outputId: id });
                        if (r.ok) {
                          if (shouldApplyMutationPreview(activeSelectionKeyRef.current, locator)) {
                            setChatHistory(h => [
                              ...h,
                              { role: "user", content: chatPrompt },
                              { role: "assistant", content: r.explanation || (lang === "en" ? "(rewritten)" : "(已改寫)") },
                            ]);
                            setAiPreview({ text: r.rewritten, locator, compliance: r.regulationCompliance });
                            setChatPrompt("");
                          }
                        } else {
                          showToastGlobal(
                            lang === "en"
                              ? `AI rewrite failed: ${typeof r.error === "string" ? r.error : "unknown error"}`
                              : `AI 改寫失敗：${typeof r.error === "string" ? r.error : "未知錯誤"}`
                          );
                        }
                      } catch (e: any) {
                        showToastGlobal(
                          lang === "en" ? `Error: ${friendlyErr(e, true)}` : `錯誤：${friendlyErr(e, false)}`
                        );
                      }
                    }}
                  >
                    {lang === "en" ? "Send changes" : "送出修改"}
                  </Button>
                </>
              )}
              {!writerDesk && mode === "edit" && (
                <>
                  <p className="text-tiny font-semibold flex items-center gap-1">
                    {t("run_mode_edit")}
                    <HelpTip>{lang === "en" ? "Edit here — the mockup updates live." : "在這裡改文字，左邊預覽即時更新。"}</HelpTip>
                  </p>
                  <Textarea
                    value={editText ?? slide?.caption ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEditText(v);
                      // Live preview in mockup
                      setOverrides(o => ({ ...o, [activeSelectionKey]: { caption: v } }));
                    }}
                    minRows={10}
                  />
                  <div className="flex gap-1.5">
                    <Button
                      color="secondary" fullWidth
                      isDisabled={editText == null || editText === (variants[activeIdx]?.caption ?? "") || updateMut.isPending}
                      isLoading={updateMut.isPending}
                      onPress={() => {
                        if (editText == null) return;
                        updateMut.mutate({ id, ...getRunContentMutationLocator(selectedContentKind, activeIdx), caption: editText });
                      }}
                    >{t("run_save_btn")}</Button>
                    <Button
                      variant="flat"
                      isDisabled={editText == null}
                      onPress={() => {
                        setEditText(null);
                        setOverrides(o => { const n = { ...o }; delete n[activeSelectionKey]; return n; });
                      }}
                    >{t("run_revert")}</Button>
                  </div>
                </>
              )}
              {mode === "image" && !isStrategyPlanning && (
                <>
                  <p className="text-tiny font-semibold">{t("run_mode_image")}</p>
                  {/* 2026-07-07 (CJ「產圖畫面有不是國字的國字」→ 圖改為無字背景，
                      標題文字改成用戶可編輯的疊層。只在 YT（縮圖有標題）顯示。 */}
                  {mockupVariant?.platform === "youtube" && (
                    <div className="border border-default-200 rounded-lg p-2.5 space-y-1.5">
                      <label className="flex items-center gap-1 text-tiny font-semibold text-default-800">
                        {lang === "en" ? "Thumbnail title (overlaid on the image)" : "縮圖標題文字（疊在圖片上）"}
                        <HelpTip>
                          {lang === "en"
                            ? "AI can't render Chinese cleanly, so the image is generated text-free. Type your real title here — it overlays on the thumbnail and is included in the templated download."
                            : "AI 無法正確畫中文，所以圖片刻意產成無字背景。真正的標題在這裡打 — 會疊在縮圖上，並包含在「帶版型下載」裡。"}
                        </HelpTip>
                      </label>
                      <input
                        type="text"
                        value={overlayTitle}
                        onChange={(e) => setOverlayTitle(e.target.value.slice(0, 60))}
                        placeholder={lang === "en" ? "e.g. 3 signs your kid isn't just picky" : "例：孩子挑食的 3 個警訊"}
                        maxLength={60}
                        className="w-full text-sm border border-default-300 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:border-default-500"
                      />
                    </div>
                  )}
                  {/* 2026-05-11 (CJ feedback「應該要先給用戶指令」):
                      明確分兩步 — Step 1 寫指令 → Step 2 產圖。
                      底下圖片變成「目前的圖」獨立區塊，不混在 prompt 裡 */}
                  <Textarea
                    label={
                      <span className="inline-flex items-center gap-1.5">
                        <StepBadge n={1} />
                        {lang === "en" ? "Your image instruction" : "你的圖片指令"}
                        <HelpTip>
                          {lang === "en"
                            ? "Write naturally in Chinese or English. Chinese instructions are automatically translated to English before being sent to the image AI; brand colors / style / tone are also applied."
                            : "請直接用中文描述；送給圖片 AI 前會自動翻成英文，並帶入品牌色彩 / 風格 / 調性。翻譯失敗時仍會用原指令繼續產圖。"}
                        </HelpTip>
                      </span>
                    }
                    placeholder={lang === "en"
                      ? "e.g. Sunlight on a warm wooden table, a steaming bowl of soup, soft-focus background with a homey feel"
                      : "例：陽光灑落在溫暖木桌上，一碗冒著煙的健力湯，柔焦背景帶有家庭溫度"}
                    value={imagePrompt}
                    onChange={(e) => { userEditedPromptRef.current = true; setImagePrompt(e.target.value); }}
                    minRows={3}
                    maxRows={6}
                    autoFocus
                  />
                  {/* 2026-05-17 (CJ「右側欄不需要展示出圖片了」): the
                      generated image now renders in the mockup's own
                      image slot (left), so the duplicate "目前這篇的圖"
                      preview here is removed to avoid showing it twice. */}
                  {/* 2026-06-15: auto-generate image prompt from the current
                      variant's caption + brand context via LLM. Replaces
                      manual template hunting for caption-aware prompts. */}
                  {variants[activeIdx]?.caption && data.brand?.id && (
                    <Button
                      size="sm"
                      variant="flat"
                      color="secondary"
                      fullWidth
                      isLoading={captionToPromptMut.isPending}
                      onPress={() => requestPromptFromCaption(captionPromptReq())}
                    >
                      {captionToPromptMut.isPending
                        ? (lang === "en" ? "Generating…" : "產生中…")
                        : (lang === "en" ? "Auto-generate prompt from this post" : "根據這篇文案自動產生圖片指令")}
                    </Button>
                  )}

                  {/* 2026-05-12 Phase 1 (CJ「prompt library 整合」):
                      Nano-Banana 175 商業攝影 prompt 範本。先選類別 → 列表
                      → 點 card 套用到 prompt textarea。 */}
                  <label className="mt-2 flex items-center gap-1.5 text-tiny text-default-600 -mb-1">
                    <StepBadge n={2} />
                    {lang === "en" ? "Template category (optional)" : "範本類別（選填）"}
                    <HelpTip>{lang === "en" ? "Start from a commercial-photography template" : "用商業攝影範本當起點"}</HelpTip>
                  </label>
                  <select
                    value={templateCategory}
                    onChange={(e) => setTemplateCategory(e.target.value)}
                    className="w-full text-xs border border-default-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-secondary"
                  >
                    <option value="">{lang === "en" ? "— No template (write your own prompt) —" : "— 不用範本（直接寫 prompt）—"}</option>
                    {((templateCategoriesQ?.data ?? []) as any[]).map((c) => (
                      <option key={c.key} value={c.key}>
                        {lang === "en" ? (c.label_en ?? c.label_zh) : c.label_zh}{lang === "en" ? ` (${c.count} templates)` : `（${c.count} 個範本）`}
                      </option>
                    ))}
                  </select>
                  {templateCategory && (templatesQ?.data ?? []).length > 0 && (
                    <div className="max-h-48 overflow-y-auto border border-default-200 rounded-lg divide-y divide-default-100">
                      {((templatesQ?.data ?? []) as any[]).map((t) => (
                        <button
                          key={t.id}
                          onClick={async () => {
                            try {
                              const full = await (utils as any).promptTemplate?.detail?.fetch?.({ id: t.id });
                              if (full?.prompt) {
                                // Brand substitution: replace the template's hardcoded
                                // product/brand references with the user's own brand.
                                // Nano-Banana templates embed real brand names (Coca-Cola,
                                // Sprite, etc.) as style anchors — we swap them out so
                                // the image comes out as the user's product, not the
                                // template's original product.
                                const brandName = (data as any)?.brand?.name ?? "";
                                const productName = (data as any)?.product?.name ?? brandName;
                                const subjectLabel = productName || brandName;

                                // For JSON-format Nano-Banana templates, convert to a
                                // clean natural-language prompt so the model never sees
                                // `concept_id: "iron_man_coke"` or any other competitor-
                                // brand anchor that causes the wrong product to appear.
                                // For plain-text templates, fall back to token replacement.
                                let adapted = full.prompt;
                                const trimmedPrompt = adapted.trim();
                                const isJsonTemplate =
                                  trimmedPrompt.startsWith("{") || trimmedPrompt.startsWith("[");

                                if (isJsonTemplate && subjectLabel) {
                                  const converted = nanoBananaJsonToPrompt(trimmedPrompt, subjectLabel);
                                  if (converted) {
                                    adapted = converted;
                                  }
                                } else if (subjectLabel) {
                                  // Plain-text templates: replace the most common hardcoded
                                  // beverage/consumer brand names in this prompt library.
                                  const brandTokens = [
                                    "Coca-Cola Can", "Coca-Cola Bottle", "Coca-Cola",
                                    "Sprite Bottle", "Sprite Can", "Sprite",
                                    "Fanta Bottle", "Fanta Can", "Fanta",
                                    "Pepsi Bottle", "Pepsi Can", "Pepsi",
                                    "Red Bull Can", "Red Bull",
                                    "iPhone", "Samsung Galaxy",
                                  ];
                                  for (const token of brandTokens) {
                                    adapted = adapted.split(token).join(`${subjectLabel} product`);
                                  }
                                }

                                // If there's a caption for the active variant, blend
                                // the template's visual style with the caption content
                                // via the LLM — so the image reflects BOTH what the post
                                // is about AND how the template should look.
                                // Without this, the template's visual style is used as-is
                                // and the caption is silently ignored.
                                const activeCaption = variants[activeIdx]?.caption ?? "";
                                const brandId = (data as any)?.brand?.id;
                                if (activeCaption && brandId) {
                                  const channelVal = (
                                    mockupVariant?.platform === "facebook"  ? "fb" :
                                    mockupVariant?.platform === "instagram" ? "ig" :
                                    mockupVariant?.platform === "linkedin"  ? "linkedin" :
                                    mockupVariant?.platform === "youtube"   ? "youtube" :
                                    mockupVariant?.platform === "tiktok"    ? "tiktok" :
                                    undefined
                                  ) as any;
                                  // Plain-text templates can be up to ~2600 chars; server
                                  // allows max 3000. Truncate to 2800 to leave margin.
                                  const styleHint = adapted.length > 2800
                                    ? adapted.slice(0, 2797) + "…"
                                    : adapted;
                                  requestPromptFromCaption({
                                    brandId,
                                    caption: activeCaption,
                                    channel: channelVal,
                                    imageStyle: styleHint,
                                    size: getIgPublicVariantImageSize(selectedContentKind, variants[activeIdx]?.format),
                                  });
                                  showToastGlobal(
                                    lang === "en"
                                      ? "Blending template style with your caption…"
                                      : "正在將範本風格與你的文案結合，產生圖片指令…"
                                  );
                                } else {
                                  // No caption yet: set the template style directly.
                                  setImagePrompt(adapted);
                                  showToastGlobal(
                                    lang === "en"
                                      ? "Template applied. Edit the prompt or write a caption first for best results."
                                      : "已套用範本視覺風格。建議先寫好文案，再點範本效果更佳。"
                                  );
                                }
                              }
                            } catch (e: any) {
                              showToastGlobal(
                                lang === "en" ? `Couldn't apply template: ${friendlyErr(e, true)}` : `套用失敗：${friendlyErr(e, false)}`
                              );
                            }
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-default-50 transition"
                        >
                          <p className="text-xs font-medium text-default-800 truncate">{t.title}</p>
                          <p className="text-[12px] text-default-500 line-clamp-2 mt-0.5">{t.preview}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* 2026-07-25 (CJ): real-product compositing — the actual
                      IRIS/Iris Girls photo instead of an AI-imagined product. */}
                  {(runProductImages.length > 0 || useRealProduct) && (
                    <div className="rounded-lg border border-default-200 bg-default-50 px-3 py-2.5 mt-2">
                      <label className="flex items-center gap-2 cursor-pointer flex-wrap">
                        <input
                          type="checkbox"
                          checked={useRealProduct}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setUseRealProduct(checked);
                            if (checked && !findValidRunProductSelection(pickedRunProduct, runProductImages)) {
                              setPickedRunProduct(runProductImages[0] ?? null);
                            }
                          }}
                        />
                        <span className="text-tiny font-semibold inline-flex items-center gap-1"><BundleIcon size={11} /> {lang === "en" ? "Use real product photo" : "使用真實產品圖"}</span>
                        <HelpTip>
                          {lang === "en"
                            ? "Uses your real product photo as the base (GPT Image 2 edits it; pick Nano Banana below if you prefer)"
                            : "以真實產品照為基準生圖 — 預設 GPT Image 2 依照片編輯；想換 Nano Banana 可在下方自行選擇"}
                        </HelpTip>
                      </label>
                      {useRealProduct && (
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {runProductImages.slice(0, 16).map((p) => (
                            <button
                              key={p.imageUrl}
                              onClick={() => setPickedRunProduct(p)}
                              title={p.name}
                              className={`w-12 h-12 rounded-md overflow-hidden border-2 transition ${
                                validRunProduct?.imageUrl === p.imageUrl ? "border-secondary" : "border-transparent hover:border-default-300"
                              }`}
                            >
                              <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                            </button>
                          ))}
                          {pickedRunProduct && (
                            <span className="text-[12px] text-default-600 self-center ml-1 truncate max-w-[160px]">{pickedRunProduct.name}</span>
                          )}
                        </div>
                      )}
                      {useRealProduct && photoConflict && validRunProduct?.imageUrl === photoConflict.forUrl && (
                        <div className="mt-2 rounded-lg border border-warning-300 bg-warning-50 px-3 py-2.5">
                          <p className="text-[12.5px] leading-relaxed text-warning-800">
                            {lang === "en"
                              ? `This photo shows “${photoConflict.photoShows}”, but this post needs “${photoConflict.postNeeds}”. Upload: ${photoConflict.suggestPhoto}`
                              : `這張照片是「${photoConflict.photoShows}」，這篇要的是「${photoConflict.postNeeds}」。建議用：${photoConflict.suggestPhoto}${
                                  runProductImages.filter((x) => x.productId === validRunProduct.productId).length > 1 ? "（可以從上面換一張，或上傳新照片）" : ""}`}
                          </p>
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" className="bg-neutral-900 text-white" isLoading={uploadingPhoto}
                              onPress={() => conflictFileRef.current?.click()}>
                              {lang === "en" ? "Upload new photo" : "上傳新照片"}
                            </Button>
                            <Button size="sm" variant="light" onPress={() => setPhotoConflict(null)}>
                              {lang === "en" ? "Use this one anyway" : "照舊用這張"}
                            </Button>
                          </div>
                          <input ref={conflictFileRef} type="file" accept="image/*" className="hidden"
                            onChange={(e) => uploadConflictPhoto(e.target.files?.[0])} />
                        </div>
                      )}
                    </div>
                  )}
                  <label className="mt-2 flex items-center gap-1.5 text-tiny text-default-600 -mb-1">
                    <StepBadge n={3} />
                    {lang === "en" ? "AI model" : "AI 模型"}
                    <HelpTip>{lang === "en" ? "GPT Image 2 by default; try Nano Banana if it doesn't work out" : "預設 GPT Image 2；不行再換 Nano Banana"}</HelpTip>
                  </label>
                  <select
                    value={imageModel}
                    onChange={(e) => setImageModel(e.target.value)}
                    className="w-full text-xs border border-default-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-secondary"
                  >
                    {RUN_IMAGE_MODEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {lang === "en" ? option.en : option.zh}
                      </option>
                    ))}
                  </select>
                  {slide?.imageModelId && (
                    <p className="text-[12px] text-default-500">
                      {lang === "en" ? "Current image model: " : "目前這張圖的模型："}
                      <span className="font-mono">{slide.imageModelId}</span>
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-1.5 text-[12px] text-default-600">
                    <StepBadge n={4} />
                    <HelpTip>
                      {lang === "en"
                        ? "Hit the button to make a new image (the current one is kept — switch back below)"
                        : "按下面按鈕，會用你的指令重新產圖（目前的圖會保留，可在下方切回去）"}
                    </HelpTip>
                  </div>
                  <Button
                    color="secondary" fullWidth
                    isLoading={imageGenMut.isPending}
                    isDisabled={imageGenMut.isPending || !imagePrompt.trim() || !data.brand?.id || missingRealProductSelection}
                    onPress={() => startImageGen(imageModel, imagePrompt)}
                  >
                    {imageGenMut.isPending
                      ? (lang === "en" ? "Generating… (~15-30s)" : "產圖中…（約 15–30 秒）")
                      : t("run_image_make")}
                  </Button>
                  {!data.brand?.id && (
                    <p className="text-[12px] text-warning-700"><WarningIcon size={11} /> {lang === "en" ? "This run has no brand — link a brand first" : "此 run 沒有 brand，請先綁品牌再產圖"}</p>
                  )}
                  {missingRealProductSelection && (
                    <p className="text-[12px] text-warning-700"><WarningIcon size={11} /> {lang === "en" ? "Choose a valid product photo from this brand" : "已勾選使用真實產品圖，請先從目前品牌選擇有效產品圖"}</p>
                  )}
                  {imageFailure && !imageGenMut.isPending && (
                    <div className="rounded-lg border border-warning-300 bg-warning-50 px-3 py-2.5 space-y-2">
                      <p className="text-[12px] text-warning-800 whitespace-pre-line leading-relaxed">{imageFailure.message}</p>
                      {imageFailure.canSwitchTo === "nano-banana" && (
                        <Button
                          size="sm" color="secondary" variant="flat"
                          isDisabled={imageGenMut.isPending || !imagePrompt.trim() || missingRealProductSelection}
                          onPress={() => startImageGen("nano-banana", imagePrompt)}
                        >
                          {lang === "en" ? "Try Nano Banana instead" : "改用 Nano Banana"}
                        </Button>
                      )}
                    </div>
                  )}
                  {/* 2026-09-21: every earlier image of this slot stays selectable — switching is free. */}
                  {(slide?.imageVersions?.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[12px] font-semibold text-default-700 flex items-center gap-1">
                        {lang === "en" ? "Earlier images" : "之前的圖"}
                        <HelpTip>{lang === "en" ? "Click to switch back — no regeneration." : "點一下切回去，不用重新生成。"}</HelpTip>
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {slide?.imageUrl && slide?.imageStatus === "ready" && (
                          <div className="relative w-16 h-16 rounded-md overflow-hidden border-2 border-secondary" title={lang === "en" ? "In use" : "使用中"}>
                            <img src={slide.imageUrl} alt="" className="w-full h-full object-cover" />
                            <span className="absolute bottom-0 inset-x-0 bg-secondary text-white text-[9px] leading-3.5 text-center">{lang === "en" ? "In use" : "使用中"}</span>
                          </div>
                        )}
                        {slide!.imageVersions!.map((v) => (
                          <button
                            key={v.url}
                            type="button"
                            disabled={selectVersionMut.isPending}
                            onClick={() => selectVersionMut.mutate({
                              id, ...getRunContentMutationLocator(selectedContentKind, activeIdx), imageUrl: v.url,
                            })}
                            title={`${v.modelId ?? ""}${v.promptZh ? `\n${v.promptZh}` : ""}`.slice(0, 200)}
                            className="relative w-16 h-16 rounded-md overflow-hidden border-2 border-transparent hover:border-secondary transition disabled:opacity-50"
                          >
                            <img src={v.url} alt="" className="w-full h-full object-cover" />
                            <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[9px] leading-3.5 text-center truncate px-0.5">
                              {String(v.modelId ?? "").replace(/^(openai|google)\//, "") || (lang === "en" ? "earlier" : "先前")}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              {!writerDesk && mode === "agent" && (() => {
                // 2026-05-09 (P2): real agent timeline from persisted metadata.
                // captionAgent/imageAgent are now full {id,name,title,avatarUrl}
                // (was string). Stages = orchestra timeline. Backward compat for
                // legacy outputs where metadata only has agent name as string.
                const md: any = data.metadata ?? {};
                const captionAg = typeof md.captionAgent === "object" ? md.captionAgent : (md.captionAgent ? { name: md.captionAgent } : null);
                const imageAg = typeof md.imageAgent === "object" ? md.imageAgent : (md.imageAgent ? { name: md.imageAgent } : null);
                const focusedAg = focusedAgent === "image" ? imageAg : captionAg;
                const focusedAgName = focusedAg?.name ?? (focusedAgent === "image"
                  ? (lang === "en" ? "Visual AI" : "視覺 AI 專家")
                  : (lang === "en" ? "Caption agent" : "撰寫者"));
                const focusedAgTitle = focusedAg ? agentTitle(focusedAg, lang) : "";
                const focusedAgLabel = focusedAg?.name ? agentLabel(focusedAg, lang) : focusedAgName;
                const stages: Array<{key: string; label: string; status: string; startedAt?: number; completedAt?: number}> = Array.isArray(md.stages) ? md.stages : [];
                const totalMs = md.latencyMs ?? 0;
                const fetchedUrl = typeof md.fetchedUrl === "string"
                  ? md.fetchedUrl
                  : (typeof md.fetchedUrl?.url === "string" ? md.fetchedUrl.url : null);
                const unavailableUrl = typeof md.urlFetchFailure === "string"
                  ? md.urlFetchFailure
                  : (typeof md.urlFetchFailure?.url === "string" ? md.urlFetchFailure.url : null);
                return (
                  <>
                    <p className="text-tiny font-semibold flex items-center gap-2">
                      <Avatar
                        src={focusedAg?.avatarUrl || `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(focusedAgName)}`}
                        className="w-7 h-7"
                      />
                      <span className="flex flex-col leading-tight">
                        <span>{focusedAgLabel}</span>
                        {focusedAgTitle && <span className="text-[12px] text-default-600 font-normal">{focusedAgTitle}</span>}
                      </span>
                    </p>
                    {/* Real orchestra stage timeline */}
                    {stages.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-[12px] text-default-500 font-medium">{lang === "en" ? `Execution timeline (total ${(totalMs/1000).toFixed(1)}s)` : `執行流程（總耗時 ${(totalMs/1000).toFixed(1)}s）`}</p>
                        <ol className="space-y-1">
                          {stages.map((s, i) => {
                            const dur = (s.completedAt ?? 0) - (s.startedAt ?? 0);
                            const statusColor =
                              s.status === "done" ? "text-success" :
                              s.status === "failed" ? "text-danger" :
                              s.status === "running" ? "text-warning" : "text-default-600";
                            const dot =
                              s.status === "done" ? <DoneIcon size={11} /> :
                              s.status === "failed" ? <ErrorIcon size={11} /> :
                              s.status === "running" ? <WorkingIcon size={11} /> : <WaitingIcon size={11} />;
                            return (
                              <li key={i} className="flex items-start gap-2 text-[12px] leading-tight py-1 border-b border-default-100 last:border-0">
                                <span className={`${statusColor} font-mono text-sm leading-none mt-0.5`}>{dot}</span>
                                <span className="flex-1 min-w-0">
                                  <span className="block text-default-800">{s.label}</span>
                                  <span className="block text-[12px] text-default-600 font-mono">
                                    {s.status === "done" && dur > 0 ? `${(dur/1000).toFixed(1)}s` : s.status}
                                  </span>
                                </span>
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    ) : (
                      <p className="text-[12px] text-default-500 italic">{lang === "en" ? "No stage timeline for this run (older output)" : "這筆紀錄沒有 stage timeline（舊版產出）"}</p>
                    )}
                    {/* Per-agent contextual content */}
                    <div className="bg-default-50 rounded-lg p-2.5 text-[12px] leading-relaxed space-y-1.5 max-h-56 overflow-y-auto">
                      {focusedAgent === "image" ? (
                        <>
                          <p className="font-semibold">{lang === "en" ? "Image brief for this version:" : "本版本配圖指引："}</p>
                          <p className="whitespace-pre-wrap text-default-800">
                            {slide?.imageStyle || (lang === "en" ? "(This task has no image brief)" : "（這個任務沒有配圖指引）")}
                          </p>
                          {slide?.imagePrompt && (
                            <>
                              <p className="font-semibold pt-1">{lang === "en" ? "Model-ready prompt used:" : "實際使用的模型指令："}</p>
                              <p className="whitespace-pre-wrap text-default-800">{slide.imagePrompt}</p>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="font-semibold">{lang === "en" ? "Caption for this version:" : "本版本文案："}</p>
                          <p className="whitespace-pre-wrap text-default-800">
                            {(slide?.caption ?? "").slice(0, 400)}{(slide?.caption?.length ?? 0) > 400 ? "…" : ""}
                          </p>
                        </>
                      )}
                    </div>
                    {unavailableUrl ? (
                      <p className="text-[12px] text-warning-700" title={unavailableUrl}>
                        <WarningIcon size={11} /> {lang === "en"
                          ? "This link's content could not be fetched (platform restriction). Paste the video caption or describe the topic instead."
                          : "這個連結抓不到內容（平台限制），建議直接貼上影片文案或描述主題。"}
                      </p>
                    ) : fetchedUrl && (
                      <p className="text-[12px] text-default-500">
                        <LinkIcon size={11} /> {lang === "en" ? "Reference fetched: " : "抓取參考："}<a href={fetchedUrl} target="_blank" rel="noreferrer" className="underline truncate inline-block max-w-[260px] align-bottom">{fetchedUrl}</a>
                      </p>
                    )}
                    {Array.isArray(md.errors) && md.errors.length > 0 && (
                      <div className="bg-danger-50 border border-danger-200 rounded p-2 text-[12px] text-danger-700">
                        <WarningIcon size={11} /> {md.errors.slice(0, 2).join(" · ")}
                      </div>
                    )}
                  </>
                );
              })()}
              {!writerDesk && mode === "vendors" && (
                <VendorFinder outputId={id} taskId={data.mission?.taskId} caption={slide?.caption ?? ""}
                  title={data.title ?? data.mission?.taskLabel ?? ""} en={lang === "en"} />
              )}
              {!writerDesk && mode === "source" && (() => {
                const detail: any = cardDetailQ.data;
                if (cardDetailQ.isLoading) {
                  return <p className="text-[12px] text-default-500">{lang === "en" ? "Loading…" : "載入中…"}</p>;
                }
                if (!detail) {
                  return <p className="text-[12px] text-default-500">{lang === "en" ? "Source info unavailable for this task." : "這個任務目前拿不到出處資訊。"}</p>;
                }
                const src = localizeSource(detail.source ?? { type: "evergreen" }, detail, lang);
                return (
                  <>
                    <p className="text-tiny font-semibold">{sourceLabel(src.type, lang, { long: true })}</p>
                    <p className="text-[12px] text-default-500 leading-relaxed">{sourceWhy(src.type, lang)}</p>
                    <div className="bg-default-50 rounded-lg p-2.5 text-[12px] leading-relaxed space-y-1.5">
                      {src.short && (
                        <p><span className="font-semibold">{lang === "en" ? "Source: " : "具體出處："}</span>{src.short}</p>
                      )}
                      {src.metric && (
                        <p><span className="font-semibold">{lang === "en" ? "Evidence: " : "傳播證據："}</span>{src.metric}{src.asOf ? (lang === "en" ? ` (measured ${src.asOf})` : `（${src.asOf} 量測）`) : ""}</p>
                      )}
                      {src.takeaway && (
                        <p><span className="font-semibold">{lang === "en" ? "Structural takeaway: " : "拆解結論："}</span>{src.takeaway}</p>
                      )}
                      {detail.rationale && (
                        <p className="whitespace-pre-wrap text-default-800">{detail.rationale}</p>
                      )}
                    </div>
                    {detail.craftRef && (
                      <details className="text-[12px]">
                        <summary className="cursor-pointer text-default-500 select-none">{lang === "en" ? "Reference material used" : "實際參考的原始素材"}</summary>
                        <p className="whitespace-pre-wrap text-default-700 mt-1.5 max-h-56 overflow-y-auto bg-default-50 rounded-lg p-2.5">{detail.craftRef}</p>
                      </details>
                    )}
                  </>
                );
              })()}
              {!writerDesk && mode === "regen" && !isStrategyEnvelope && (
                <>
                  <p className="text-tiny font-semibold flex items-center gap-1">
                    {lang === "en" ? "Rewrite this version" : "重生這段文案"}
                    <HelpTip>
                      {lang === "en"
                        ? <>The same agent rewrites &quot;{slide?.label ? vl(slide.label) : `Version ${activeIdx + 1}`}&quot;. The original is archived.</>
                        : <>同一位 AI 專家重寫「{slide?.label ?? `版本 ${activeIdx + 1}`}」。原版會歸檔到歷史。</>}
                    </HelpTip>
                  </p>
                  <Button
                    color="secondary"
                    fullWidth
                    isLoading={regenMut.isPending}
                    isDisabled={regenMut.isPending}
                    onPress={() => {
                      regenMut.mutate({ outputId: id, ...getRunContentMutationLocator(selectedContentKind, activeIdx) });
                    }}
                  >
                    {regenMut.isPending
                      ? (lang === "en" ? "Rewriting…" : "重生中…")
                      : (lang === "en" ? "Rewrite this version" : "重生這個版本")}
                  </Button>
                  {Array.isArray(data.metadata?.archivedVariants) && data.metadata.archivedVariants.length > 0 && (
                    <p className="text-[12px] text-default-500">
                      <LibraryIcon size={11} /> {lang === "en"
                        ? `Rewritten ${data.metadata.archivedVariants.length} time(s) — history kept`
                        : `已重生 ${data.metadata.archivedVariants.length} 次（歷史保留）`}
                    </p>
                  )}
                </>
              )}
              {!writerDesk && mode === "rewrite" && (
                <>
                  <p className="text-tiny font-semibold flex items-center gap-1">
                    {lang === "en" ? "Have another agent rewrite it" : "換一位 AI 專家重寫"}
                    <HelpTip>
                      {lang === "en"
                        ? "Pick a specialist below — they rewrite this caption in their own style. Nothing changes until you accept the preview."
                        : "挑一位不同風格的專家，用他的寫法重寫這篇文案。改完先給你預覽，按「採用」才會生效。"}
                    </HelpTip>
                  </p>
                  <div className="space-y-1.5">
                    {REWRITE_AGENTS.map((a) => (
                      <button
                        key={a.name}
                        disabled={!!rewriteBusy || !refineMut}
                        onClick={async () => {
                          if (!refineMut) { showToastGlobal(lang === "en" ? "AI rewrite is unavailable" : "AI 改寫服務暫不可用"); return; }
                          const caption = slide?.caption ?? "";
                          if (!caption.trim()) { showToastGlobal(lang === "en" ? "This version has no caption yet" : "這個版本還沒有文案可以重寫"); return; }
                          const locator = getRunContentMutationLocator(selectedContentKind, activeIdx);
                          setRewriteBusy(a.name);
                          try {
                            const r = await refineMut.mutateAsync({
                              currentCaption: caption,
                              userFeedback: lang === "en" ? a.instructionEn : a.instruction,
                              agentId: a.agentId,
                              agentName: a.name,
                              agentTitle: lang === "en" ? a.titleEn : a.title,
                              brandId: data.mission?.brandId ?? undefined,
                              // 2026-09-29：改寫讀同一份品牌大腦，含原本那篇的產品／活動。
                              productId: (data as any)?.metadata?.productId ?? undefined,
                              eventId: (data as any)?.metadata?.eventId ?? undefined,
                            });
                            if (r.ok) {
                              if (shouldApplyMutationPreview(activeSelectionKeyRef.current, locator)) {
                                setRewritePreview({ agent: a.name, text: r.rewritten, locator, compliance: r.regulationCompliance });
                              }
                            } else {
                              showToastGlobal(
                                lang === "en"
                                  ? `Rewrite failed: ${typeof r.error === "string" ? r.error : "unknown error"}`
                                  : `改寫失敗：${typeof r.error === "string" ? r.error : "未知錯誤"}`
                              );
                            }
                          } catch (e: any) {
                            showToastGlobal(lang === "en" ? `Error: ${friendlyErr(e, true)}` : `錯誤：${friendlyErr(e, false)}`);
                          } finally {
                            setRewriteBusy(null);
                          }
                        }}
                        className={`w-full flex items-center gap-2.5 rounded-lg border p-2 text-left transition ${
                          rewritePreview?.agent === a.name
                            ? "border-secondary bg-secondary-50"
                            : "border-default-200 hover:border-secondary hover:bg-default-50"
                        } ${rewriteBusy && rewriteBusy !== a.name ? "opacity-40" : ""}`}
                      >
                        <Avatar
                          src={`https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(a.name)}`}
                          className="w-8 h-8 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-semibold text-default-900 leading-tight">
                            {a.name}
                            <span className="ml-1.5 font-normal text-default-500">{lang === "en" ? a.titleEn : a.title}</span>
                          </p>
                          <p className="text-[12px] text-default-500 truncate">{lang === "en" ? a.styleEn : a.style}</p>
                        </div>
                        {rewriteBusy === a.name && <Spinner size="sm" color="secondary" />}
                      </button>
                    ))}
                  </div>
                  {rewritePreview && (
                    <div className="text-[12px] bg-secondary-50 border border-secondary-200 rounded-lg p-2 space-y-1.5">
                      <p className="font-semibold text-secondary-700">
                        {lang === "en" ? `Rewritten by ${rewritePreview.agent}` : `${rewritePreview.agent} 的重寫版本`}
                      </p>
                      <p className="whitespace-pre-wrap leading-relaxed text-default-800 max-h-40 overflow-y-auto">{rewritePreview.text}</p>
                      <div className="flex gap-1.5 pt-1">
                        <Button size="sm" color="secondary"
                          isDisabled={updateMut.isPending}
                          onPress={() => {
                            const key = getMutationLocatorSelectionKey(rewritePreview.locator);
                            setOverrides(o => ({ ...o, [key]: { caption: rewritePreview.text } }));
                            updateMut.mutate({ id, ...rewritePreview.locator, caption: rewritePreview.text, ...(rewritePreview.compliance ? { regulationCompliance: toComplianceInput(rewritePreview.compliance) } : {}) });
                            setRewritePreview(null);
                          }}
                        >{lang === "en" ? "Use it" : "採用"}</Button>
                        <Button size="sm" variant="flat" onPress={() => setRewritePreview(null)}>{lang === "en" ? "Discard" : "放棄"}</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardBody>
          </Card>

          {!!publishBrandId && shouldShowConnectHint(effectiveVariant?.platform, connectionsQ.isSuccess ? connectionsQ.data : undefined) && (
            <p className="text-small text-default-500">
              {lang === "en" ? "Need to connect a publishing account? " : "發布帳號尚未連接？"}
              <Link className="text-primary underline" to={publishSettingsUrl(publishBrandId)}>
                {lang === "en" ? "Connect" : "去連接"}
              </Link>
            </p>
          )}

          <Card>
            <CardBody className="space-y-2 p-3">

              {fromPlanner ? (
                <>
                  <Button fullWidth className="bg-neutral-900 font-semibold text-white"
                    startContent={<FontAwesomeIcon icon={faCalendarPlus} />} onPress={openPlannerSchedule}>
                    {lang === "en" ? "Add to calendar" : "排進行事曆"}
                  </Button>
                  {confirmDiscard ? (
                    <div className="rounded-lg border border-neutral-200 p-2.5">
                      <p className="m-0 text-[12.5px] leading-relaxed text-neutral-600">
                        {lang === "en" ? "Discard this draft? It stays in Projects." : "放棄這篇？週曆那一格會退回沒寫，內容仍留在專案。"}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="flat" className="flex-1" onPress={() => setConfirmDiscard(false)}>
                          {lang === "en" ? "Keep" : "留著"}
                        </Button>
                        <Button size="sm" className="flex-1 bg-neutral-900 text-white"
                          isLoading={plannerReleaseMut?.isPending || campaignMarkMut?.isPending} onPress={discardToPlanner}>
                          {lang === "en" ? "Discard" : "放棄"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button fullWidth variant="light" className="text-neutral-600" onPress={() => setConfirmDiscard(true)}>
                      {lang === "en" ? "Discard" : "放棄"}
                    </Button>
                  )}
                </>
              ) : (<>
              {/* 2026-09-29（CJ「不需要下載 ics、也不需要分享連結，只有排程或送審」）：
                  送審不再是另一條路 —— 排程視窗裡勾「排好後送審」，週曆格子會標待審。
                  成效標籤移進排程視窗。 */}
              <Button
                fullWidth className="bg-neutral-900 font-semibold text-white"
                startContent={<FontAwesomeIcon icon={faCalendarPlus} />}
                onPress={() => {
                  setSchedMode("calendar");
                  setScheduleDialogOpen(true);
                }}
              >
                {lang === "en" ? "Add to calendar" : "排進行事曆"}
              </Button>

              {/* Auto-save note — always true, no action needed */}
              <div className="text-[12px] text-default-600 text-center px-1 leading-relaxed">
                <CheckIcon size={11} /> {lang === "en" ? "Auto-saved" : "已自動儲存"}
              </div>
              </>)}

            </CardBody>
          </Card>
          </>
          )}
        </aside>
      </div>

      {/* ── EMAIL DIALOG ────────────────────────────────────────────── */}
      <Modal isOpen={emailDialogOpen} onClose={() => setEmailDialogOpen(false)} size="md">
        <ModalContent>
          <ModalHeader className="text-base">{lang === "en" ? "Send to team for review" : "寄給團隊 review"}</ModalHeader>
          <ModalBody className="space-y-3">
            <Input
              label={lang === "en" ? "Recipient emails (comma-separated)" : "收件人 email（用逗號分隔多個）"}
              placeholder="cj@sowork.ai, anna@client.com"
              value={emailRecipients}
              onChange={(e) => setEmailRecipients(e.target.value)}
            />
            <Textarea
              label={lang === "en" ? "Note (optional)" : "附加訊息（可選）"}
              placeholder={lang === "en"
                ? "Please check whether this version's hook lands with the target audience"
                : "請幫我看一下這版本的開場鉤是否打到目標族群"}
              value={emailNote}
              onChange={(e) => setEmailNote(e.target.value)}
              minRows={3}
            />
            <div><HelpTip>{lang === "en" ? "We'll include the full caption and brand context." : "寄出時會附上完整文案 + 品牌資訊。"}</HelpTip></div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setEmailDialogOpen(false)}>{t("cancel")}</Button>
            <Button
              color="primary"
              isLoading={emailMut.isPending}
              isDisabled={!emailRecipients.trim()}
              onPress={() => {
                const recipients = emailRecipients.split(",").map(s => s.trim()).filter(Boolean);
                if (recipients.length === 0) return;
                emailMut.mutate({
                  id, ...getRunContentMutationLocator(selectedContentKind, activeIdx),
                  recipients, note: emailNote || undefined,
                }, {
                  onSuccess: () => setEmailDialogOpen(false),
                });
              }}
            >{lang === "en" ? "Send" : "寄出"}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── UNIFIED SCHEDULE DIALOG ────────────────────────────────────
          Three modes controlled by schedMode state:
          "ics"      → download .ics file only
          "calendar" → write to scheduled_posts + navigate to /calendar
          "publish"  → platform-specific write + navigate to /calendar
          ─────────────────────────────────────────────────────────── */}
      <Modal isOpen={scheduleDialogOpen} onClose={() => setScheduleDialogOpen(false)} size="sm">
        <ModalContent>
          <ModalHeader className="text-base">
            {schedMode === "ics"
              ? (lang === "en" ? "Download .ics" : "下載 .ics")
              : schedMode === "calendar"
              ? (lang === "en" ? "Add to calendar" : "排進行事曆")
              : (lang === "en" ? `Publish — ${schedPlatform}` : `排程發布 — ${schedPlatform}`)}
          </ModalHeader>
          <ModalBody className="space-y-3">
            {/* Multi-day series: show anchor-date picker + per-post date preview */}
            {isMultiDayTask && schedMode !== "publish" ? (
              <>
                <Input
                  type="date"
                  label={
                    isCountdownTask
                      ? (lang === "en" ? "Event date" : "活動日期")
                      : (lang === "en" ? "First post date" : "第一篇發布日期")
                  }
                  value={seriesAnchorDate}
                  onChange={(e) => setSeriesAnchorDate(e.target.value)}
                />
                <div><HelpTip>
                  {isCountdownTask
                    ? (lang === "en"
                        ? "Posts are scheduled day-by-day counting down to the event date."
                        : "系統會自動從活動日期往前，每天一篇排好 5 天倒數。")
                    : (lang === "en"
                        ? "Posts are scheduled one per day starting from the first post date."
                        : "從第一篇日期開始，每天依序排一篇。")}
                </HelpTip></div>
                {/* Per-variant date preview */}
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E5E5E5" }}>
                  {variants.map((v, i) => {
                    const d = postDates[i];
                    const weekdays = lang === "en"
                      ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
                      : ["日", "一", "二", "三", "四", "五", "六"];
                    const dateStr = d
                      ? `${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）`
                      : "—";
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between px-3 py-2 text-[12px]"
                        style={i < variants.length - 1 ? { borderBottom: "1px solid #F5F5F5" } : undefined}
                      >
                        <span className="font-medium text-default-700">{v.label ? vl(v.label) : `Day ${i + 1}`}</span>
                        <span className="text-default-600">{dateStr}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              /* Single-post: original datetime-local picker */
              <Input
                type="datetime-local"
                label={lang === "en" ? "Publish at" : "發布時間"}
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
              />
            )}
            {(() => {
              const _pf = schedMode === "publish"
                ? schedPlatform
                : ((data as any)?.metadata?.platform ?? "");
              const _h = captionLimitHint(_pf, (variants as any[])[activeIdx]?.caption, lang === "en");
              return _h ? (
                <p className={`text-[12px] ${_h.over ? "text-danger-600" : "text-default-500"}`} role={_h.over ? "alert" : undefined}>{_h.text}</p>
              ) : null;
            })()}
            {schedMode === "calendar" && (
              <>
                {/* 2026-09-29 成效標籤從右欄移進來：排程時順手標，發布後成效落進成效層矩陣 */}
                <PerfTagPicker outputId={id} platform={schedPlatform} />
                {reviewCanSubmit && (
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-default-200 px-3 py-2">
                    <input type="checkbox" className="mt-1" checked={reviewOnSchedule} onChange={(e) => setReviewOnSchedule(e.target.checked)} />
                    <span className="text-[13px] leading-relaxed text-default-700">
                      {lang === "en" ? "Send for review after scheduling" : "排好後送審"}
                      <span className="block text-[12px] text-default-500">
                        {lang === "en"
                          ? "The calendar cell shows “In review” until someone else approves it."
                          : "週曆格子會標「待審」，要由作者以外的人放行。"}
                      </span>
                    </span>
                  </label>
                )}
              </>
            )}
            {!isMultiDayTask || schedMode === "publish" ? (
              <p className="text-tiny text-default-500">
                {schedMode === "ics"
                  ? (lang === "en"
                    ? "Downloads a .ics file — drag into Google Calendar / Outlook / Apple Calendar."
                    : "產生 .ics 檔 — 拖進 Google Calendar / Outlook / Apple Calendar 即可。")
                  : schedMode === "calendar"
                  ? (lang === "en"
                    ? "Adds this post to your weekly plan. You can change the time or publish from there."
                    : "排進本週企劃的週曆，確認後回到週曆；之後可以在那裡改時間或立即發布。")
                  : (lang === "en"
                    ? `Schedules this post to ${schedPlatform}. After confirming you'll be taken to the Calendar page to publish.`
                    : `排程此貼文到 ${schedPlatform}。確認後跳轉行事曆頁面，可在那裡發布。`)}
              </p>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setScheduleDialogOpen(false)}>{t("cancel")}</Button>
            <Button
              color="primary"
              isLoading={schedMode === "ics" ? scheduleMut.isPending : (scheduleToCalMut?.isPending ?? false)}
              onPress={handleScheduleConfirm}
            >
              {isMultiDayTask && schedMode !== "publish"
                ? (lang === "en" ? `Schedule all ${variants.length} posts` : `排程全部 ${variants.length} 篇`)
                : schedMode === "ics"
                ? (lang === "en" ? "Download" : "下載")
                : (lang === "en" ? "Confirm" : "確認排程")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

    </div>
  );
}

