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
import React, { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Avatar, Button, Card, CardBody, Chip, Spinner, Textarea, Tooltip,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClipboard, faClipboardCheck, faRotateRight, faXmark,
  faShare, faCalendarPlus, faEnvelope, faRocket, faFolderPlus,
  faChevronLeft,
} from "@fortawesome/free-solid-svg-icons";
import {
  Pencil, MessageCircle, Image as LucideImage, Video,
  Wand2, Sliders as LucideSliders, Save, Copy as LucideCopy,
  Share2 as LucideShare,
} from "lucide-react";
import { trpc } from "../../lib/trpc";
import { showToastGlobal } from "../../components/ui/Toast";
import { PlatformMockup } from "../components/PlatformMockup";
import type { MockupVariant } from "../lib/inferMockup";
import { TRPCClientError } from "@trpc/client";

type Mode = "edit" | "chat" | "image" | "video" | "agent" | "regen" | "settings" | "publish";

interface VariantData {
  label: string;
  caption: string;
  hashtags?: string[];
  imageStyle?: string;
  imageUrl?: string | null;
  imageStatus?: string;
  qa?: any;
  extras?: any;
}

export default function RunPage() {
  const { outputId } = useParams<{ outputId: string }>();
  const navigate = useNavigate();
  const id = Number(outputId);

  const { data, isLoading, error } = trpc.output.getById.useQuery(
    { id },
    { enabled: !!id, refetchOnWindowFocus: false },
  );

  const [activeIdx, setActiveIdx] = useState(0);
  const [mode, setMode] = useState<Mode>("chat");
  const [focusedAgent, setFocusedAgent] = useState<"caption"|"image"|null>(null);
  const [editText, setEditText] = useState<string | null>(null);
  const [chatPrompt, setChatPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  // 2026-05-11 (CJ「Spotify 模式」): community-template publish modal state.
  const [shareModal, setShareModal] = useState(false);
  /** Local override for variants — applied after save, mockup updates live. */
  const [overrides, setOverrides] = useState<Record<number, { caption: string }>>({});
  /** AI chat history per variant. */
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user"|"assistant"; content: string }>>([]);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  /** P4: image regen prompt — pre-filled from variant.imageStyle, editable. */
  const [imagePrompt, setImagePrompt] = useState<string>("");
  /** 2026-05-12: user-selected image model for 改圖 dropdown. */
  const [imageModel, setImageModel] = useState<string>("auto");
  /** Video gen state — async job, polled for status. */
  const [videoDuration, setVideoDuration] = useState<number>(30);
  const [videoJobId, setVideoJobId] = useState<number | null>(null);
  /** 2026-05-12: user-selected video model for 改影片 dropdown. */
  const [videoModel, setVideoModel] = useState<string>("auto");
  /** 2026-05-12 Phase 1 — picked template category for the 改圖 picker. */
  const [templateCategory, setTemplateCategory] = useState<string>("");

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
      showToastGlobal("已儲存");
      utils.output.getById.invalidate({ id });
    },
    onError: (e) => showToastGlobal(`儲存失敗：${e.message}`),
  });
  const refineMut = (trpc as any).quickTask?.refineCaption?.useMutation
    ? (trpc as any).quickTask.refineCaption.useMutation()
    : null;
  const emailMut = trpc.output.emailToTeam.useMutation({
    onSuccess: (r) => {
      if (r.ok) showToastGlobal(`已寄給 ${r.sentCount} 位收件人`);
      else showToastGlobal(`部分寄送失敗：${r.failures.join("; ")}`);
    },
    onError: (e) => showToastGlobal(`寄送失敗：${e.message}`),
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
      showToastGlobal("已產生 .ics — 拖進日曆 App 即可");
      utils.output.getById.invalidate({ id });
    },
    onError: (e) => showToastGlobal(`排程失敗：${e.message}`),
  });
  const statusMut = trpc.output.updateStatus.useMutation({
    onSuccess: () => {
      showToastGlobal("已存到 Mission");
      utils.output.getById.invalidate({ id });
    },
  });
  // 2026-05-09 (P3): regen single variant
  const regenMut = (trpc as any).quickTask?.regenerateVariant?.useMutation
    ? (trpc as any).quickTask.regenerateVariant.useMutation({
        onSuccess: () => {
          showToastGlobal("已重生此變體 ✓");
          utils.output.getById.invalidate({ id });
          setOverrides({});
        },
        onError: (e: any) => showToastGlobal(`重生失敗：${e?.message ?? e}`),
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
            showToastGlobal("圖片檔太大，無法保存到伺服器（請聯絡客服）");
          } else {
            showToastGlobal(`圖片保存失敗：${msg.slice(0, 120)}`);
          }
        },
      })
    : null;
  // 2026-05-09 (P5 — CJ「use pipedream for OAuth」): publish to FB via
  // Pipedream Connect. Server hits a Pipedream webhook; Pipedream's
  // workflow handles Meta OAuth/token, calls Graph API, returns post_id.
  // 2026-05-12 (CJ「直接發 facebook 應該直接跳出 pipedream 授權」):
  // On '尚未連接' error, automatically open the Pipedream Connect popup
  // for that platform. After successful authorization, the user can press
  // 直接發 again to publish.
  const getConnectTokenMut = (trpc as any).platformConnect?.getConnectToken?.useMutation?.();
  const [pipedreamBusy, setPipedreamBusy] = useState(false);

  const openPipedreamConnect = async (platform: "facebook" | "instagram" | "linkedin" | "youtube") => {
    if (pipedreamBusy) return;
    setPipedreamBusy(true);
    try {
      const tk = await getConnectTokenMut?.mutateAsync?.({ platform });
      if (!tk?.token) {
        showToastGlobal("無法取得授權 token — 請聯絡 sowork@sowork.tw");
        return;
      }
      const { PipedreamClient } = await import("@pipedream/sdk/browser");
      const pd = new PipedreamClient({
        projectEnvironment: (tk.env ?? "production") as "production" | "development",
        externalUserId: `sowork-user`,
        tokenCallback: async () => ({
          token: tk.token,
          expiresAt: new Date(tk.expiresAt || Date.now() + 300_000),
          connectLinkUrl: "",
        }),
      });
      const PLATFORM_LABEL: Record<string, string> = {
        facebook: "Facebook",
        instagram: "Instagram",
        linkedin: "LinkedIn",
        youtube: "YouTube",
      };
      await new Promise<void>((resolve, reject) => {
        pd.connectAccount({
          app: tk.appSlug,
          onSuccess: () => {
            showToastGlobal(`已授權 ${PLATFORM_LABEL[platform]} ✓ 現在可以發布`);
            resolve();
          },
          onError: (err: any) => reject(new Error(String(err))),
          onClose: ({ successful }: any) => {
            if (!successful) reject(new Error("授權視窗已關閉"));
            else resolve();
          },
        });
      });
    } catch (e: any) {
      const m = String(e?.message ?? "");
      if (!/視窗已關閉|closed/i.test(m)) {
        showToastGlobal(`授權失敗：${m.slice(0, 120)}`);
      }
    } finally {
      setPipedreamBusy(false);
    }
  };

  const fbPublishMut = (trpc as any).publish?.toFacebook?.useMutation
    ? (trpc as any).publish.toFacebook.useMutation({
        onSuccess: (r: any) => {
          showToastGlobal(r.permalink ? `已發布 ✓ ${r.permalink}` : "已發布到 Facebook ✓");
          utils.output.getById.invalidate({ id });
        },
        onError: (e: any) => {
          const msg = String(e?.message ?? "");
          if (msg.includes("尚未連接") || msg.includes("缺 FB Page ID")) {
            // Auto-open Pipedream connect popup — no manual navigate to brand settings
            showToastGlobal("尚未授權 Facebook — 正在開啟授權視窗…");
            openPipedreamConnect("facebook");
          } else if (msg.includes("FB 發布服務尚未啟用") || msg.includes("Facebook 授權服務")) {
            showToastGlobal("FB 發布服務尚未啟用 — 請聯絡 sowork@sowork.tw");
          } else {
            showToastGlobal(`FB 發布失敗：${e?.message ?? e}`);
          }
        },
      })
    : { mutate: () => {}, isPending: false };
  // Video gen — async pipeline. Spawn job, poll for status until ready.
  // 2026-05-12 (CJ「我要改成只給腳本 — C」): storyboard mode replaces full
  // video gen. Calls video.generateStoryboard which returns a script with
  // one Flux Schnell reference image per scene. ~30-90 seconds end-to-end.
  const videoGenMut = (trpc as any).video?.generateStoryboard?.useMutation
    ? (trpc as any).video.generateStoryboard.useMutation({
        onSuccess: (r: any) => {
          setVideoJobId(r.jobId);
          showToastGlobal(`故事板生成中 #${r.jobId} — 約 1 分鐘內完成`);
        },
        onError: (e: any) => showToastGlobal(`故事板啟動失敗：${e?.message ?? e}`),
      })
    : { mutate: () => {}, isPending: false };
  const videoStatusQuery = (trpc as any).video?.status?.useQuery
    ? (trpc as any).video.status.useQuery(
        { jobId: videoJobId ?? 0 },
        // Poll faster than full-video mode since storyboard is ~30-90s
        { enabled: !!videoJobId, refetchInterval: 5_000, refetchOnWindowFocus: false },
      )
    : { data: null };
  const videoStatus = (videoStatusQuery?.data ?? null) as any;
  const videoUrl: string | null = videoStatus?.videoUrl ?? null;
  // Parse script JSON for storyboard scene rendering
  const storyboardScenes: Array<{
    sceneIndex: number; durationSec: number; visualPrompt: string;
    narration: string; cameraMove: string; imageUrl?: string | null;
  }> = useMemo(() => {
    const s = videoStatus?.script;
    if (!s) return [];
    try {
      const obj = typeof s === "string" ? JSON.parse(s) : s;
      return Array.isArray(obj?.scenes) ? obj.scenes : [];
    } catch { return []; }
  }, [videoStatus?.script]);
  const storyboardTitle: string = useMemo(() => {
    const s = videoStatus?.script;
    if (!s) return "";
    try {
      const obj = typeof s === "string" ? JSON.parse(s) : s;
      return String(obj?.title ?? "");
    } catch { return ""; }
  }, [videoStatus?.script]);
  const videoStatusLabel: string =
    !videoStatus ? "查詢中…" :
    videoStatus.status === "pending" ? `排隊中 (${videoStatus.progress ?? 0}%)` :
    videoStatus.status === "processing" ? `生成中 (${videoStatus.progress ?? 0}%)` :
    videoStatus.status === "running" ? `生成中 (${videoStatus.progress ?? 0}%)` :
    videoStatus.status === "completed" ? "完成 ✓" :
    videoStatus.status === "failed" ? `失敗：${videoStatus.errorMessage ?? "?"}` :
    String(videoStatus.status);
  const imageGenMut = (trpc as any).image?.generate?.useMutation
    ? (trpc as any).image.generate.useMutation({
        onSuccess: (r: any) => {
          // 2026-05-10: image.generate returns either {url} (Flux/Leonardo) or
          // {b64} (OpenAI gpt-image-1). Normalize to a usable image source —
          // for b64 we wrap as data: URL so <img> tag renders directly.
          let imageSrc = r?.imageUrl ?? r?.url ?? r?.publicUrl ?? null;
          if (!imageSrc && typeof r?.b64 === "string" && r.b64.length > 100) {
            imageSrc = `data:image/png;base64,${r.b64}`;
          }
          if (imageSrc && updateImageMut) {
            updateImageMut.mutate({ id, variantIndex: activeIdx, imageUrl: imageSrc, style: imagePrompt.slice(0, 480) });
            showToastGlobal("已產圖 ✓");
          } else {
            // 2026-05-12: server should TRPCError on failure now; this branch
            // only reaches if a provider returned success-shaped but empty
            // data. Include any returned errorMsg if present.
            const detail = String(r?.errorMsg ?? r?.message ?? "").slice(0, 200);
            showToastGlobal(detail ? `產圖失敗：${detail}` : "產圖完成但 API 沒回傳圖片網址（請聯絡客服）");
          }
        },
        onError: (e: any) => showToastGlobal(`產圖失敗：${e?.message ?? e}`),
      })
    : { mutate: () => {}, isPending: false };

  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState("");
  const [emailNote, setEmailNote] = useState("");
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 24);
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16); // local datetime-local format
  });

  const variants: VariantData[] = useMemo(() => {
    if (!data) return [];
    try {
      const parsed = JSON.parse(data.content);
      if (Array.isArray(parsed)) return parsed;
      if (parsed?.variants) return parsed.variants;
    } catch { /* ignore */ }
    return [{ label: "主版本", caption: data.content || "" }];
  }, [data]);

  // Apply local overrides so mockup reflects unsaved edits in real time
  const slide = useMemo(() => {
    const base = variants[activeIdx];
    if (!base) return base;
    const ov = overrides[activeIdx];
    return ov ? { ...base, caption: ov.caption } : base;
  }, [variants, activeIdx, overrides]);

  // P4: pre-fill image / video prompt when entering that mode or switching
  // variant. 2026-05-12 (CJ「按下改圖/改影片，應該要有預設的提示詞」).
  // imagePrompt state is reused for video — different seed format per mode.
  useEffect(() => {
    if (mode !== "image" && mode !== "video") return;

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
      // Prefer existing imageStyle (the brief that produced current image)
      if (slide?.imageStyle && slide.imageStyle.trim().length > 0) {
        setImagePrompt(slide.imageStyle);
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

    // Video: 3-beat storyboard seed (hook → main shot → text overlay/CTA)
    if (mode === "video") {
      const seed = subject
        ? `開頭 3 秒（hook）：${subject} —— 鏡頭抓住一個吸睛瞬間。\n` +
          `中段（10-20 秒）：產品 / 場景特寫 + 一個具體動作（手部、表情、物件接觸）。\n` +
          `結尾（3-5 秒）：字卡呼應 caption 核心，3-8 字。可配「定格 + 留白」收尾。\n` +
          `風格：自然光、節奏穩、不刻意配音、字卡簡潔。`
        : "";
      setImagePrompt(seed);
      return;
    }
  }, [mode, activeIdx, slide?.imageStyle, slide?.caption]);

  // 2026-05-09 (CJ direction「只留一個 mockup 路徑」): 一律渲染 mockup，
  // 不再 block on missing taskId. Inference falls through 3 layers:
  //   1. metadata.taskId (rich — distinguishes ad/reel/story/carousel)
  //   2. output.platform + output.outputType (always present from DB)
  //   3. generic:feed (last resort — never errors out)
  const mockupVariant: MockupVariant = useMemo(() => {
    const taskId = data?.mission?.taskId ?? "";

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

    // ── Layer 1: taskId prefix → platform/format (richest mapping) ──
    const idPrefixMap: Record<string, string> = {
      fb: "facebook", ig: "instagram", yt: "youtube", tt: "tiktok",
      li: "linkedin", em: "email", pr: "press",
    };
    const formatFromTaskId = (id: string): string => {
      if (id.includes("ad-")) return "ad";
      if (id.includes("comment")) return "comment";
      if (id.includes("pinned")) return "pinned";
      if (id.includes("story")) return "story";
      if (id.includes("reel")) return "reel";
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

  if (!id || isNaN(id)) {
    return <div className="p-12 text-center text-default-500">無效的 run ID</div>;
  }
  if (isLoading) {
    return <div className="p-12 flex justify-center"><Spinner size="lg" /></div>;
  }
  if (error || !data) {
    return (
      <div className="p-12 flex flex-col items-center gap-3 text-default-500">
        <p>找不到這個 run（可能已被移除或無權限）</p>
        <Button variant="flat" onPress={() => navigate(-1)}>返回</Button>
      </div>
    );
  }
  // 2026-05-09 (CJ direction「我們只要留一個 mockup 模板，根除引用舊樣板的」):
  // No more red error blocking. mockupVariant always resolves to a usable
  // template via 3-layer fallback (taskId → output.platform → generic).

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(slide?.caption ?? "");
      setCopied(true);
      showToastGlobal("已複製到剪貼簿");
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div className="px-4 py-3 max-w-[1500px] mx-auto">
      {/* Header removed 2026-05-09 (CJ): was overlapping with ShellLayout's
          global brand picker. ShellLayout already shows the current brand
          + tier nav. Tier chip + 重跑 + 關閉 moved into the toolbar below. */}

      {/* ─── Task label + status row (slim, non-overlapping) ────────── */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <p className="text-tiny text-default-500 truncate flex-1">
          {data.title || data.mission?.taskLabel || "(無標題)"}
        </p>
        {/* DEBUG (2026-05-09): show mockup variant + taskId so we can trace
            which mockup is being chosen. Remove after verification. */}
        <Chip size="sm" variant="flat" className="font-mono text-[10px]">
          {mockupVariant ? `${mockupVariant.platform}:${mockupVariant.format}` : "?"} · {data.mission?.taskId ?? "no-task"}
        </Chip>
        {data.mission?.tier && <Chip size="sm" variant="flat" color="secondary">{data.mission.tier}</Chip>}
        <Chip size="sm" variant="flat" color={data.status === "published" ? "success" : data.status === "scheduled" ? "warning" : "default"}>
          {data.status}
        </Chip>
      </div>

      {/* ─── Variant pills (horizontal) ─────────────────────────────── */}
      {variants.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-[10px] text-default-500 mr-1">版本：</span>
          {variants.map((v, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              className={`px-3 py-1 rounded-full text-tiny transition border ${
                i === activeIdx
                  ? "bg-secondary text-white border-secondary"
                  : "bg-white text-default-700 border-default-200 hover:border-secondary"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {/* ─── 2-COL: mockup big (no toolbar) + right tool panel ──────── */}
      {/* 2026-05-10: mobile responsive — stack on small screens. md+ keeps 2-col. */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-4 items-start">
        {/* CENTER: pure mockup, no toolbar above (CJ direction 2026-05-09) */}
        <section className="min-w-0 flex flex-col gap-3">
          <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden">
            {mockupVariant && slide && (
              <PlatformMockup
                variant={{ ...mockupVariant, label: `${mockupVariant.label} · ${slide.label}` }}
                title={data.title ?? ""}
                brief={""}
                brandName={data.brand?.name ?? ""}
                brandLogoUrl={data.brand?.logoUrl ?? null}
                liveCaption={slide.caption}
                liveHashtags={slide.hashtags}
                liveImageStyle={slide.imageStyle}
                liveImageUrl={slide.imageUrl ?? undefined}
                liveImageStatus={slide.imageStatus as any}
              />
            )}
          </div>
        </section>

        {/* RIGHT: toolbar (top) + mode panel + publish actions
            CJ direction 2026-05-09: 'toolbar 一道右方對話窗上面，當用戶選擇
            不同按鍵，在顯示出該功能' — toolbar is the tab bar for the panel */}
        <aside className="space-y-3 sticky top-2 self-start">
          {/* Toolbar — clicking a button switches mode + the panel below
              expands to show that tool. */}
          <div className="bg-white rounded-xl border border-default-200 shadow-sm">
            <div className="flex items-center gap-0.5 px-2 py-1.5 flex-wrap">
              <ToolbarBtn icon={Pencil}        label="直接編輯"      active={mode==="edit"}  onClick={() => setMode("edit")} />
              <ToolbarBtn icon={MessageCircle} label="跟 agent 對話" active={mode==="chat"}  onClick={() => setMode("chat")} />
              <ToolbarBtn icon={LucideImage}   label="改圖"          active={mode==="image"} onClick={() => setMode("image")} />
              {/* 2026-05-12 (CJ「影片功能我想要先拿掉，現在看起來不穩」):
                  hide 改影片 entry. The /trpc/video.* router still exists
                  so existing video jobs continue to render, but new
                  generation entry point is closed until stability work. */}
              {/* <ToolbarBtn icon={Video}         label="改影片"        active={mode==="video"} onClick={() => setMode("video")} /> */}
              <Divider />
              {/* Agent avatars — click to see that agent's thinking */}
              <Tooltip content="撰寫 agent — 看思考過程">
                <button
                  onClick={() => { setMode("agent"); setFocusedAgent("caption"); }}
                  className={`w-7 h-7 rounded-full overflow-hidden ring-1 transition ${mode==="agent" && focusedAgent==="caption" ? "ring-secondary ring-2" : "ring-default-200 hover:ring-secondary"}`}
                >
                  {(() => {
                    const ca: any = data.metadata?.captionAgent;
                    const name = typeof ca === "object" ? ca?.name : ca;
                    const av = typeof ca === "object" ? ca?.avatarUrl : null;
                    return <Avatar src={av || `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(name ?? "Caption")}`} className="w-7 h-7" />;
                  })()}
                </button>
              </Tooltip>
              <Tooltip content="視覺 agent — 看思考過程">
                <button
                  onClick={() => { setMode("agent"); setFocusedAgent("image"); }}
                  className={`w-7 h-7 rounded-full overflow-hidden ring-1 transition ${mode==="agent" && focusedAgent==="image" ? "ring-secondary ring-2" : "ring-default-200 hover:ring-secondary"}`}
                >
                  {(() => {
                    const ia: any = data.metadata?.imageAgent;
                    const name = typeof ia === "object" ? ia?.name : ia;
                    const av = typeof ia === "object" ? ia?.avatarUrl : null;
                    return <Avatar src={av || `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(name ?? "Visual")}`} className="w-7 h-7" />;
                  })()}
                </button>
              </Tooltip>
              <Divider />
              <ToolbarBtn icon={Wand2}         label="重生這段"       active={mode==="regen"}    onClick={() => setMode("regen")} />
              <ToolbarBtn icon={LucideSliders} label="參數"           active={mode==="settings"} onClick={() => setMode("settings")} />
              <Divider />
              <ToolbarBtn icon={LucideCopy}    label="複製文案"       onClick={onCopy} highlight={copied} />
              {/* 2026-05-11 (CJ feedback「存 Mission 不要出現在工具列，只要在下方」):
                  publish card 已經有「存到 Mission」按鈕，工具列這個是重複，砍掉。 */}
              {/* 2026-05-11 (CJ「這個功能可以晚一點再上，先處理別的」):
                  範本收藏 / 市集功能暫緩到 P1 後 — 等 insights 回饋系統做完
                  才能設計品質門檻。Button 暫時拿掉，schema + endpoints 保留。
                  設計留在 docs/template-marketplace-design.md。 */}
              {/* <ToolbarBtn icon={LucideShare} label="存為我的模板" onClick={() => setShareModal(true)} /> */}
              <Divider />
              <Tooltip content="重跑同任務" placement="bottom">
                <button
                  onClick={() => {
                    const tier = data.mission?.tier ?? "30s";
                    const taskId = data.mission?.taskId;
                    if (!taskId) { showToastGlobal("找不到原任務 ID"); return; }
                    navigate(`/${tier}?rerun=${id}`);
                  }}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-default-500 hover:bg-default-100 hover:text-default-800 transition"
                  aria-label="重跑"
                >
                  <FontAwesomeIcon icon={faRotateRight} className="text-tiny" />
                </button>
              </Tooltip>
              <Tooltip content="返回" placement="bottom">
                <button
                  onClick={() => navigate(-1)}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-default-500 hover:bg-default-100 hover:text-default-800 transition"
                  aria-label="返回"
                >
                  <FontAwesomeIcon icon={faXmark} className="text-tiny" />
                </button>
              </Tooltip>
            </div>
          </div>
          <Card>
            <CardBody className="space-y-3">
              {mode === "chat" && (
                <>
                  <p className="text-tiny font-semibold">跟 agent 改文案</p>
                  <p className="text-[11px] text-default-500 leading-relaxed">
                    告訴 agent 你想怎麼調整：例如「結尾改成限時優惠」、「太囉嗦砍第二段」。
                  </p>
                  {chatHistory.length > 0 && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto bg-default-50 rounded-lg p-2">
                      {chatHistory.slice(-4).map((m, i) => (
                        <div key={i} className={`text-[11px] leading-relaxed ${m.role==="user" ? "text-default-900" : "text-secondary"}`}>
                          <span className="font-semibold mr-1">{m.role==="user"?"你":"AI"}：</span>
                          {m.content.slice(0, 180)}{m.content.length > 180 ? "…" : ""}
                        </div>
                      ))}
                    </div>
                  )}
                  <Textarea
                    placeholder="說明你想怎麼改…"
                    value={chatPrompt}
                    onChange={(e) => setChatPrompt(e.target.value)}
                    minRows={3}
                  />
                  {aiPreview && (
                    <div className="text-[11px] bg-secondary-50 border border-secondary-200 rounded-lg p-2 space-y-1.5">
                      <p className="font-semibold text-secondary-700">AI 改寫預覽</p>
                      <p className="whitespace-pre-wrap leading-relaxed text-default-800 max-h-32 overflow-y-auto">{aiPreview}</p>
                      <div className="flex gap-1.5 pt-1">
                        <Button size="sm" color="secondary"
                          isDisabled={updateMut.isPending}
                          onPress={() => {
                            setOverrides(o => ({ ...o, [activeIdx]: { caption: aiPreview } }));
                            updateMut.mutate({ id, variantIndex: activeIdx, caption: aiPreview });
                            setAiPreview(null);
                          }}
                        >採用</Button>
                        <Button size="sm" variant="flat" onPress={() => setAiPreview(null)}>放棄</Button>
                      </div>
                    </div>
                  )}
                  <Button
                    color="secondary" fullWidth
                    isDisabled={!chatPrompt.trim() || !refineMut || refineMut.isPending}
                    isLoading={refineMut?.isPending}
                    onPress={async () => {
                      if (!refineMut) { showToastGlobal("AI 改寫服務暫不可用"); return; }
                      try {
                        const r = await refineMut.mutateAsync({
                          currentCaption: slide?.caption ?? "",
                          userFeedback: chatPrompt,
                          brandId: data.mission?.brandId ?? undefined,
                          history: chatHistory,
                        });
                        if (r.ok) {
                          setChatHistory(h => [
                            ...h,
                            { role: "user", content: chatPrompt },
                            { role: "assistant", content: r.explanation || "(已改寫)" },
                          ]);
                          setAiPreview(r.rewritten);
                          setChatPrompt("");
                        } else {
                          showToastGlobal(`AI 改寫失敗：${r.error ?? "未知錯誤"}`);
                        }
                      } catch (e: any) {
                        showToastGlobal(`錯誤：${e.message ?? String(e)}`);
                      }
                    }}
                  >
                    送出修改
                  </Button>
                </>
              )}
              {mode === "edit" && (
                <>
                  <p className="text-tiny font-semibold">直接編輯</p>
                  <p className="text-[10px] text-default-500">
                    在這裡改文字，左邊 mockup 即時更新。
                  </p>
                  <Textarea
                    value={editText ?? slide?.caption ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEditText(v);
                      // Live preview in mockup
                      setOverrides(o => ({ ...o, [activeIdx]: { caption: v } }));
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
                        updateMut.mutate({ id, variantIndex: activeIdx, caption: editText });
                      }}
                    >儲存修改</Button>
                    <Button
                      variant="flat"
                      isDisabled={editText == null}
                      onPress={() => {
                        setEditText(null);
                        setOverrides(o => { const n = { ...o }; delete n[activeIdx]; return n; });
                      }}
                    >還原</Button>
                  </div>
                </>
              )}
              {mode === "image" && (
                <>
                  <p className="text-tiny font-semibold">改配圖</p>
                  {/* 2026-05-11 (CJ feedback「應該要先給用戶指令」):
                      明確分兩步 — Step 1 寫指令 → Step 2 產圖。
                      底下圖片變成「目前的圖」獨立區塊，不混在 prompt 裡 */}
                  <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-2 text-[11px] text-secondary-700">
                    Step 1：先告訴我你想要什麼樣的圖（或調整現有 prompt）
                  </div>
                  <Textarea
                    label="圖片指令（prompt）"
                    placeholder="例：陽光灑落在溫暖木桌上，一碗冒著煙的健力湯，柔焦背景帶有家庭溫度"
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    minRows={3}
                    maxRows={6}
                    description="會自動帶入品牌的色彩 / 風格 / 調性脈絡。寫越具體圖越貼近你要的"
                    autoFocus
                  />
                  {slide?.imageUrl && (
                    <div className="rounded-lg overflow-hidden border border-default-200 mt-2">
                      <p className="text-[10px] text-default-500 px-2 py-1 bg-default-50">目前這篇的圖：</p>
                      <img src={slide.imageUrl} alt="current" className="w-full h-auto" />
                    </div>
                  )}
                  {/* 2026-05-12 Phase 1 (CJ「prompt library 整合」):
                      Nano-Banana 175 商業攝影 prompt 範本。先選類別 → 列表
                      → 點 card 套用到 prompt textarea。 */}
                  <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-2 text-[11px] text-secondary-700 mt-2">
                    Step 2（選填）：用商業攝影範本當起點
                  </div>
                  <label className="block text-tiny text-default-600 -mb-1">範本類別</label>
                  <select
                    value={templateCategory}
                    onChange={(e) => setTemplateCategory(e.target.value)}
                    className="w-full text-xs border border-default-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-secondary"
                  >
                    <option value="">— 不用範本（直接寫 prompt）—</option>
                    {((templateCategoriesQ?.data ?? []) as any[]).map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label_zh}（{c.count} 個範本）
                      </option>
                    ))}
                  </select>
                  {templateCategory && (templatesQ?.data ?? []).length > 0 && (
                    <div className="max-h-48 overflow-y-auto border border-default-200 rounded-lg divide-y divide-default-100">
                      {((templatesQ?.data ?? []) as any[]).map((t) => (
                        <button
                          key={t.id}
                          onClick={async () => {
                            // Fetch full prompt body, then prepend to user's prompt
                            try {
                              const full = await (utils as any).promptTemplate?.detail?.fetch?.({ id: t.id });
                              if (full?.prompt) {
                                setImagePrompt(full.prompt);
                                showToastGlobal(`已套用範本：${full.title.slice(0, 30)}`);
                              }
                            } catch (e: any) {
                              showToastGlobal(`套用失敗：${e?.message ?? e}`);
                            }
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-default-50 transition"
                        >
                          <p className="text-xs font-medium text-default-800 truncate">{t.title}</p>
                          <p className="text-[10px] text-default-500 line-clamp-2 mt-0.5">{t.preview}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-2 text-[11px] text-secondary-700 mt-2">
                    Step 3：選用哪個模型（不同模型擅長不同風格）
                  </div>
                  <label className="block text-tiny text-default-600 -mb-1">AI 模型</label>
                  <select
                    value={imageModel}
                    onChange={(e) => setImageModel(e.target.value)}
                    className="w-full text-xs border border-default-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-secondary"
                  >
                    <option value="auto">自動（預設）</option>
                    <option value="flux-schnell">快速 — Flux Schnell（5-10 秒）</option>
                    <option value="gpt-image-1">寫實 — GPT Image-1（15-25 秒，最像照片）</option>
                    <option value="flux-realism">攝影感 — Flux Realism（15-30 秒）</option>
                    <option value="ideogram-v3">含文字 — Ideogram V3（圖中文字最強）</option>
                    <option value="imagen-3">Google Imagen 3</option>
                  </select>
                  <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-2 text-[11px] text-secondary-700 mt-2">
                    Step 4：按下面按鈕，會用你的指令重新產圖（蓋掉目前的圖）
                  </div>
                  <Button
                    color="secondary" fullWidth
                    isLoading={imageGenMut.isPending}
                    isDisabled={imageGenMut.isPending || !imagePrompt.trim() || !data.brand?.id}
                    onPress={() => {
                      if (!data.brand?.id) {
                        showToastGlobal("此 run 沒有綁定品牌，無法產圖");
                        return;
                      }
                      imageGenMut.mutate({
                        brandId: data.brand.id,
                        prompt: imagePrompt,
                        // image.generate expects short codes: fb / ig / linkedin / youtube / tiktok / threads / line / email / press
                        channel: (
                          mockupVariant?.platform === "facebook"  ? "fb" :
                          mockupVariant?.platform === "instagram" ? "ig" :
                          mockupVariant?.platform === "linkedin"  ? "linkedin" :
                          mockupVariant?.platform === "youtube"   ? "youtube" :
                          mockupVariant?.platform === "tiktok"    ? "tiktok" :
                          "fb"
                        ) as any,
                        modelChoice: imageModel as any,
                      });
                    }}
                  >
                    {imageGenMut.isPending ? "產圖中…（約 15-30s）" : "立即產圖"}
                  </Button>
                  {!data.brand?.id && (
                    <p className="text-[10px] text-warning-700">⚠ 此 run 沒有 brand，請先綁品牌再產圖</p>
                  )}
                </>
              )}
              {mode === "video" && (
                <>
                  <p className="text-tiny font-semibold">生成影片故事板</p>
                  {/* 2026-05-12 (CJ「我要改成只給腳本 — C」):
                      Storyboard mode = 腳本 + 每個 scene 配 Flux 參考圖。
                      用戶可拿這份 brief 自己拍 / 給拍攝團隊。 */}
                  <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-2 text-[11px] text-secondary-700">
                    Step 1：寫影片想呈現什麼（會自動帶入這篇的 caption 當補充）
                  </div>
                  <Textarea
                    label="影片指令"
                    placeholder="例：開頭 3 秒抓住觀眾的廚房畫面，接著鏡頭帶到一碗冒煙的健力湯，配上「忙到沒時間，也能餐餐補蛋白」的字卡"
                    value={imagePrompt /* 重用 imagePrompt 也存影片指令 */}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    minRows={3}
                    maxRows={6}
                    description="可空白 — 留空就用此 variant 的 caption 當題目"
                    autoFocus
                  />
                  <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-2 text-[11px] text-secondary-700">
                    Step 2：選影片長度（決定分鏡數量）
                  </div>
                  <div className="flex gap-1.5">
                    {(["15", "30", "60"] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setVideoDuration(Number(d))}
                        className={`flex-1 px-2 py-1.5 text-tiny rounded border transition ${
                          videoDuration === Number(d)
                            ? "bg-secondary text-white border-secondary"
                            : "bg-white text-default-700 border-default-200 hover:border-secondary"
                        }`}
                      >{d}s</button>
                    ))}
                  </div>
                  <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-2 text-[11px] text-secondary-700 mt-2">
                    Step 3：生成故事板（約 1 分鐘 — 腳本 + 每個 scene 一張參考圖）
                  </div>
                  <Button
                    color="secondary" fullWidth
                    isLoading={videoGenMut.isPending}
                    isDisabled={videoGenMut.isPending || !slide?.caption?.trim()}
                    onPress={() => {
                      const topic = (imagePrompt.trim() || (slide?.caption ?? "").slice(0, 200)).trim();
                      if (!topic) {
                        showToastGlobal("請先填影片指令，或這個 variant 要有文案");
                        return;
                      }
                      videoGenMut.mutate({
                        topic,
                        platform: (mockupVariant?.platform === "youtube" ? "youtube"
                          : mockupVariant?.platform === "tiktok" ? "tiktok"
                          : mockupVariant?.platform === "instagram" ? "instagram"
                          : "youtube") as any,
                        language: "zh-TW" as any,
                        duration: videoDuration,
                        style: "professional" as any,
                        brandId: data.brand?.id,
                      });
                    }}
                  >
                    {videoGenMut.isPending ? "啟動中…" : `生成 ${videoDuration} 秒故事板`}
                  </Button>
                  {videoJobId && (
                    <div className="bg-default-50 rounded-lg p-2.5 text-[11px] space-y-2 border border-secondary-200 mt-2">
                      <p className="font-semibold flex items-center gap-2">
                        故事板 #{videoJobId}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                          videoStatus?.status === "completed" ? "bg-success-100 text-success-800" :
                          videoStatus?.status === "failed" ? "bg-danger-100 text-danger-800" :
                          "bg-warning-100 text-warning-800"
                        }`}>{videoStatusLabel}</span>
                      </p>
                      {videoStatus?.status === "failed" && (
                        <p className="text-[11px] text-danger-700 leading-relaxed">
                          {videoStatus?.errorMessage ?? "未知錯誤"}
                        </p>
                      )}
                      {storyboardTitle && (
                        <p className="text-xs font-semibold text-default-800 mt-1">{storyboardTitle}</p>
                      )}
                      {storyboardScenes.length > 0 && (
                        <div className="space-y-3 mt-1">
                          {storyboardScenes.map((scene, i) => (
                            <div key={i} className="border border-default-200 rounded-lg overflow-hidden bg-white">
                              {scene.imageUrl ? (
                                <img src={scene.imageUrl} alt={`scene ${i + 1}`} className="w-full h-auto" />
                              ) : (
                                <div className="w-full aspect-video bg-default-100 flex items-center justify-center text-[10px] text-default-400">
                                  （此 scene 參考圖尚未產出 / 失敗）
                                </div>
                              )}
                              <div className="p-2 space-y-1">
                                <p className="text-[10px] font-semibold text-secondary-700">
                                  Scene {i + 1} · {scene.durationSec ?? "?"}s · {scene.cameraMove || "static"}
                                </p>
                                <p className="text-[11px] text-default-700 leading-snug">
                                  <span className="text-default-500">畫面：</span>{scene.visualPrompt}
                                </p>
                                <p className="text-[11px] text-default-700 leading-snug">
                                  <span className="text-default-500">旁白：</span>{scene.narration}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {videoStatus?.status === "completed" && storyboardScenes.length > 0 && (
                        <Button
                          size="sm" variant="flat" fullWidth
                          onPress={() => {
                            const text = storyboardScenes.map((s, i) =>
                              `Scene ${i + 1} (${s.durationSec}s, ${s.cameraMove}):\n` +
                              `畫面：${s.visualPrompt}\n` +
                              `旁白：${s.narration}\n`
                            ).join("\n");
                            navigator.clipboard.writeText(text);
                            showToastGlobal("已複製腳本");
                          }}
                        >複製整份腳本</Button>
                      )}
                    </div>
                  )}
                </>
              )}
              {mode === "agent" && (() => {
                // 2026-05-09 (P2): real agent timeline from persisted metadata.
                // captionAgent/imageAgent are now full {id,name,title,avatarUrl}
                // (was string). Stages = orchestra timeline. Backward compat for
                // legacy outputs where metadata only has agent name as string.
                const md: any = data.metadata ?? {};
                const captionAg = typeof md.captionAgent === "object" ? md.captionAgent : (md.captionAgent ? { name: md.captionAgent } : null);
                const imageAg = typeof md.imageAgent === "object" ? md.imageAgent : (md.imageAgent ? { name: md.imageAgent } : null);
                const focusedAg = focusedAgent === "image" ? imageAg : captionAg;
                const focusedAgName = focusedAg?.name ?? (focusedAgent === "image" ? "視覺 agent" : "撰寫 agent");
                const focusedAgTitle = focusedAg?.title ?? "";
                const stages: Array<{key: string; label: string; status: string; startedAt?: number; completedAt?: number}> = Array.isArray(md.stages) ? md.stages : [];
                const totalMs = md.latencyMs ?? 0;
                return (
                  <>
                    <p className="text-tiny font-semibold flex items-center gap-2">
                      <Avatar
                        src={focusedAg?.avatarUrl || `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(focusedAgName)}`}
                        className="w-7 h-7"
                      />
                      <span className="flex flex-col leading-tight">
                        <span>{focusedAgName}</span>
                        {focusedAgTitle && <span className="text-[10px] text-default-400 font-normal">{focusedAgTitle}</span>}
                      </span>
                    </p>
                    {/* Real orchestra stage timeline */}
                    {stages.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-default-500 font-medium">執行流程（總耗時 {(totalMs/1000).toFixed(1)}s）</p>
                        <ol className="space-y-1">
                          {stages.map((s, i) => {
                            const dur = (s.completedAt ?? 0) - (s.startedAt ?? 0);
                            const statusColor =
                              s.status === "done" ? "text-success" :
                              s.status === "failed" ? "text-danger" :
                              s.status === "running" ? "text-warning" : "text-default-400";
                            const dot =
                              s.status === "done" ? "●" :
                              s.status === "failed" ? "✕" :
                              s.status === "running" ? "◌" : "○";
                            return (
                              <li key={i} className="flex items-start gap-2 text-[11px] leading-tight py-1 border-b border-default-100 last:border-0">
                                <span className={`${statusColor} font-mono text-sm leading-none mt-0.5`}>{dot}</span>
                                <span className="flex-1 min-w-0">
                                  <span className="block text-default-800">{s.label}</span>
                                  <span className="block text-[10px] text-default-400 font-mono">
                                    {s.status === "done" && dur > 0 ? `${(dur/1000).toFixed(1)}s` : s.status}
                                  </span>
                                </span>
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    ) : (
                      <p className="text-[11px] text-default-500 italic">這筆紀錄沒有 stage timeline（舊版產出）</p>
                    )}
                    {/* Per-agent contextual content */}
                    <div className="bg-default-50 rounded-lg p-2.5 text-[11px] leading-relaxed space-y-1.5 max-h-56 overflow-y-auto">
                      {focusedAgent === "image" ? (
                        <>
                          <p className="font-semibold">本變體配圖 brief：</p>
                          <p className="whitespace-pre-wrap text-default-800">
                            {slide?.imageStyle || "（這個任務沒有配圖 brief）"}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-semibold">本變體文案：</p>
                          <p className="whitespace-pre-wrap text-default-800">
                            {(slide?.caption ?? "").slice(0, 400)}{(slide?.caption?.length ?? 0) > 400 ? "…" : ""}
                          </p>
                        </>
                      )}
                    </div>
                    {md.fetchedUrl && (
                      <p className="text-[10px] text-default-500">
                        🔗 抓取參考：<a href={md.fetchedUrl} target="_blank" rel="noreferrer" className="underline truncate inline-block max-w-[260px] align-bottom">{md.fetchedUrl}</a>
                      </p>
                    )}
                    {Array.isArray(md.errors) && md.errors.length > 0 && (
                      <div className="bg-danger-50 border border-danger-200 rounded p-2 text-[10px] text-danger-700">
                        ⚠ {md.errors.slice(0, 2).join(" · ")}
                      </div>
                    )}
                  </>
                );
              })()}
              {mode === "regen" && (
                <>
                  <p className="text-tiny font-semibold">重生這段文案</p>
                  <p className="text-[11px] text-default-500 leading-relaxed">
                    讓同一位 agent 重新寫一次當前 variant「{slide?.label ?? `版本 ${activeIdx + 1}`}」。原版會歸檔到歷史。
                  </p>
                  <Button
                    color="secondary"
                    fullWidth
                    isLoading={regenMut.isPending}
                    isDisabled={regenMut.isPending}
                    onPress={() => {
                      regenMut.mutate({ outputId: id, variantIndex: activeIdx });
                    }}
                  >
                    {regenMut.isPending ? "重生中…" : "立即重生這個變體"}
                  </Button>
                  <p className="text-[10px] text-default-400">
                    將呼叫 {(typeof data.metadata?.captionAgent === "object" ? data.metadata.captionAgent?.name : data.metadata?.captionAgent) ?? "撰寫 agent"} 重新產出 variant {activeIdx + 1}。
                  </p>
                  {Array.isArray(data.metadata?.archivedVariants) && data.metadata.archivedVariants.length > 0 && (
                    <p className="text-[10px] text-default-500">
                      📚 已重生 {data.metadata.archivedVariants.length} 次（歷史保留）
                    </p>
                  )}
                </>
              )}
              {mode === "settings" && (
                <>
                  <p className="text-tiny font-semibold">參數設定</p>
                  <div className="text-[11px] space-y-1.5 text-default-700">
                    <div className="flex justify-between"><span>任務</span><span className="font-mono text-tiny">{data.mission?.taskId ?? "—"}</span></div>
                    <div className="flex justify-between"><span>Tier</span><span>{data.mission?.tier ?? "—"}</span></div>
                    <div className="flex justify-between"><span>變體數</span><span>{variants.length}</span></div>
                    <div className="flex justify-between"><span>產出延遲</span><span>{data.metadata?.latencyMs ? `${(data.metadata.latencyMs/1000).toFixed(1)}s` : "—"}</span></div>
                    <div className="flex justify-between"><span>撰寫 agent</span><span>{(typeof data.metadata?.captionAgent === "object" ? data.metadata.captionAgent?.name : data.metadata?.captionAgent) ?? "—"}</span></div>
                    <div className="flex justify-between"><span>視覺 agent</span><span>{(typeof data.metadata?.imageAgent === "object" ? data.metadata.imageAgent?.name : data.metadata?.imageAgent) ?? "—"}</span></div>
                  </div>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-2">
              <p className="text-tiny font-semibold">發布到</p>
              {/* 2026-05-12 (CJ「若是產出為 instagram/linkedin/youtube，也要有
                  一鍵授權的按鈕」): platform-aware publish row.
                  - Facebook: 直接發 (full publish via Pipedream webhook, auto-auth
                    popup on '尚未連接')
                  - Instagram / LinkedIn / YouTube: 一鍵授權 (publish backend not
                    wired yet — button opens Pipedream auth popup; once authorized,
                    the platform's connect token is stored against this user so a
                    future publish.toX call can use it without re-auth) */}
              {(() => {
                const platform = (mockupVariant?.platform ?? "facebook") as string;
                if (platform === "facebook") {
                  return (
                    <Button
                      color="primary" fullWidth
                      startContent={<FontAwesomeIcon icon={faRocket} />}
                      isLoading={fbPublishMut.isPending}
                      isDisabled={fbPublishMut.isPending}
                      onPress={() => {
                        if (!confirm("確定要把這個 variant 發到 Facebook？發布後會直接出現在你的 FB 粉專。")) return;
                        fbPublishMut.mutate({ outputId: id, variantIndex: activeIdx });
                      }}
                    >
                      {fbPublishMut.isPending ? "發布中…" : "直接發 Facebook"}
                    </Button>
                  );
                }
                const PLATFORM_AUTH: Record<string, { label: string; key: "instagram" | "linkedin" | "youtube" }> = {
                  instagram: { label: "Instagram", key: "instagram" },
                  linkedin:  { label: "LinkedIn",  key: "linkedin"  },
                  youtube:   { label: "YouTube",   key: "youtube"   },
                };
                const cfg = PLATFORM_AUTH[platform];
                if (!cfg) {
                  // Threads / LINE / TikTok / Email / PR don't have Pipedream
                  // connect support yet — show a neutral disabled state.
                  return (
                    <Button
                      variant="flat" fullWidth isDisabled
                      startContent={<FontAwesomeIcon icon={faRocket} />}
                    >此平台發布功能即將開放</Button>
                  );
                }
                return (
                  <Button
                    color="primary" fullWidth
                    startContent={<FontAwesomeIcon icon={faRocket} />}
                    isLoading={pipedreamBusy}
                    isDisabled={pipedreamBusy}
                    onPress={() => openPipedreamConnect(cfg.key)}
                  >
                    {pipedreamBusy ? "授權中…" : `一鍵授權 ${cfg.label}`}
                  </Button>
                );
              })()}
              <Button
                variant="flat" fullWidth
                startContent={<FontAwesomeIcon icon={faCalendarPlus} />}
                onPress={() => setScheduleDialogOpen(true)}
              >排程到日曆（.ics）</Button>
              {/* 2026-05-12 (CJ「移除寄給團隊」+「先移除 agency 邀請團隊的設計」):
                  寄給團隊 button removed. Email dialog code kept in file but
                  unreachable — can resurrect later if team review re-enabled. */}
              {/* 2026-05-11 (CJ feedback「存 Mission 沒有成功反饋」):
                  - 成功後 button 變綠色 + 顯示「✓ 已存到 /projects」
                  - 加 link 到 /projects 讓用戶能立刻去看 */}
              <Button
                variant="flat" fullWidth
                startContent={<FontAwesomeIcon icon={data.status === "approved" ? faClipboardCheck : faFolderPlus} />}
                color={data.status === "approved" ? "success" : "default"}
                isDisabled={data.status === "approved" || statusMut.isPending}
                isLoading={statusMut.isPending}
                onPress={() => statusMut.mutate({ id, status: "approved" })}
              >
                {data.status === "approved"
                  ? "✓ 已存到 Mission（點開「專案」找）"
                  : "存到 Mission"}
              </Button>
              {data.status === "approved" && (
                <button
                  onClick={() => navigate("/projects")}
                  className="text-[11px] text-secondary hover:underline text-center"
                >→ 直接去專案頁看</button>
              )}
              {/* 2026-05-09 (CJ): removed 複製文字 here — duplicates the
                  toolbar 📋 複製文案 button. Keep only 複製此頁網址 (different
                  function: shares the run URL, not the caption). */}
              <Button
                variant="light" fullWidth size="sm"
                startContent={<FontAwesomeIcon icon={faShare} />}
                onPress={() => {
                  navigator.clipboard.writeText(window.location.href);
                  showToastGlobal("已複製此頁網址");
                }}
              >
                複製此頁網址
              </Button>
            </CardBody>
          </Card>
        </aside>
      </div>

      {/* ── EMAIL DIALOG ────────────────────────────────────────────── */}
      <Modal isOpen={emailDialogOpen} onClose={() => setEmailDialogOpen(false)} size="md">
        <ModalContent>
          <ModalHeader className="text-base">寄給團隊 review</ModalHeader>
          <ModalBody className="space-y-3">
            <Input
              label="收件人 email（用逗號分隔多個）"
              placeholder="cj@sowork.ai, anna@client.com"
              value={emailRecipients}
              onChange={(e) => setEmailRecipients(e.target.value)}
            />
            <Textarea
              label="附加訊息（可選）"
              placeholder="請幫我看一下這版本的 hook 是否打到目標族群"
              value={emailNote}
              onChange={(e) => setEmailNote(e.target.value)}
              minRows={3}
            />
            <p className="text-tiny text-default-500">寄出時會附上完整 caption + 品牌資訊。</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setEmailDialogOpen(false)}>取消</Button>
            <Button
              color="primary"
              isLoading={emailMut.isPending}
              isDisabled={!emailRecipients.trim()}
              onPress={() => {
                const recipients = emailRecipients.split(",").map(s => s.trim()).filter(Boolean);
                if (recipients.length === 0) return;
                emailMut.mutate({
                  id, variantIndex: activeIdx,
                  recipients, note: emailNote || undefined,
                }, {
                  onSuccess: () => setEmailDialogOpen(false),
                });
              }}
            >寄出</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── SCHEDULE DIALOG ─────────────────────────────────────────── */}
      <Modal isOpen={scheduleDialogOpen} onClose={() => setScheduleDialogOpen(false)} size="sm">
        <ModalContent>
          <ModalHeader className="text-base">排程發布時間</ModalHeader>
          <ModalBody className="space-y-3">
            <Input
              type="datetime-local"
              label="發布時間"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
            />
            <p className="text-tiny text-default-500">
              產生 .ics 檔下載 — 拖進 Google Calendar / Outlook / Apple Calendar 即可。
              這個 run 也會在系統內標記為「已排程」。
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setScheduleDialogOpen(false)}>取消</Button>
            <Button
              color="primary"
              isLoading={scheduleMut.isPending}
              onPress={() => {
                scheduleMut.mutate({
                  id, variantIndex: activeIdx,
                  scheduledAt: new Date(scheduleAt).toISOString(),
                  durationMinutes: 30,
                }, {
                  onSuccess: () => setScheduleDialogOpen(false),
                });
              }}
            >下載 .ics</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 2026-05-11 (CJ「Spotify 模式」): publish this output as a
          community template. activeVariant + brand context already in scope. */}
      <PublishTemplateModal
        isOpen={shareModal}
        onClose={() => setShareModal(false)}
        outputId={id}
        defaultTitle={data?.mission?.title?.toString().slice(0, 80) ?? ""}
        defaultKind={data?.mission?.tier === "99s" ? "campaign" : "caption"}
        tier={data?.mission?.tier ?? null}
        platform={data?.metadata?.platform ?? null}
        taskId={data?.mission?.taskId ?? null}
        previewText={(() => {
          // Variants live inside the output's content JSON, not as a top-
          // level field. Parse defensively + strip super long.
          const anyData: any = data;
          const variants = anyData?.variants
            ?? (() => {
                 try {
                   const parsed = typeof anyData?.content === "string"
                     ? JSON.parse(anyData.content)
                     : anyData?.content;
                   return Array.isArray(parsed) ? parsed : (parsed?.variants ?? []);
                 } catch { return []; }
               })();
          const v = variants?.[0] ?? variants?.[activeIdx];
          const cap = v?.caption ?? "";
          return cap.length > 280 ? cap.slice(0, 280) + "…" : cap;
        })()}
      />
    </div>
  );
}

/* ────────────────── PublishTemplateModal ──────────────────
   One-shot dialog that lets a user push the current RunPage output to
   the community template gallery. Strips obvious brand-specific tokens
   from the content body so the template stays portable; users can
   review + edit before submit.
   ─────────────────────────────────────────────────────────── */
function PublishTemplateModal({
  isOpen, onClose, outputId, defaultTitle, defaultKind, tier, platform, taskId, previewText,
}: {
  isOpen: boolean;
  onClose: () => void;
  outputId: number;
  defaultTitle: string;
  defaultKind: "caption" | "campaign" | "positioning" | "prompt";
  tier: string | null;
  platform: string | null;
  taskId: string | null;
  previewText: string;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  // 2026-05-11 (CJ refocus): default to PRIVATE — primary use case is
  // "save my own successful template", sharing is the opt-in extra.
  const [visibility, setVisibility] = useState<"private" | "public" | "unlisted">("private");
  const [body, setBody] = useState(previewText);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    if (isOpen) {
      setTitle(defaultTitle || "");
      setDescription("");
      setBody(previewText || "");
      setVisibility("private");
    }
  }, [isOpen, defaultTitle, previewText]);

  const publishMut = (trpc as any).community?.publishTemplate?.useMutation?.();

  if (!isOpen) return null;
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" backdrop="blur">
      <ModalContent>
        <ModalHeader className="flex flex-col items-stretch gap-0 py-2 px-4 border-b border-default-100">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-default-600">
            COMMUNITY · PUBLISH TEMPLATE
          </p>
          <p className="text-[13px] font-medium text-default-800">
            把這個產出公開回饋給社群（被別人用一次 +2 credits）
          </p>
        </ModalHeader>
        <ModalBody className="space-y-3 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-default-600 mb-1">標題</p>
            <Input
              size="sm"
              value={title}
              onValueChange={setTitle}
              placeholder="例：節慶限時優惠 hook + CTA 套版"
              variant="flat"
            />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-default-600 mb-1">
              描述（用什麼情境、為什麼好用）
            </p>
            <Textarea
              size="sm"
              value={description}
              onValueChange={setDescription}
              minRows={3}
              placeholder="例：適合電商品牌做 7 天倒數活動，hook 先給好處再點時間限制"
              variant="flat"
            />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-default-600 mb-1">
              範本內容（你可以把品牌專屬字眼改成 [變數]，讓別人套用）
            </p>
            <Textarea
              size="sm"
              value={body}
              onValueChange={setBody}
              minRows={6}
              maxRows={14}
              placeholder=""
              variant="flat"
              classNames={{ input: "font-serif" }}
            />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-default-700">
            <span className="font-semibold uppercase tracking-[0.18em] text-default-600">可見：</span>
            <button
              className="px-2 py-1 rounded border text-xs"
              style={{
                borderColor: visibility === "public" ? "#171717" : "#D4D4D4",
                background: visibility === "public" ? "#171717" : "white",
                color: visibility === "public" ? "white" : "#404040",
              }}
              onClick={() => setVisibility("public")}
            >
              公開（出現在範本庫）
            </button>
            <button
              className="px-2 py-1 rounded border text-xs"
              style={{
                borderColor: visibility === "unlisted" ? "#171717" : "#D4D4D4",
                background: visibility === "unlisted" ? "#171717" : "white",
                color: visibility === "unlisted" ? "white" : "#404040",
              }}
              onClick={() => setVisibility("unlisted")}
            >
              只給有連結的人
            </button>
          </div>
          <div className="text-[11px] text-default-600 bg-default-50 border border-default-200 rounded-md p-2 leading-relaxed">
            ⚡ 我們不會公開你的品牌名 / 受眾 / 禁忌詞 — 別人用時系統會自動套用他們的品牌。
            這份模板代表你的 <strong>結構與寫法</strong>，不是你的內容資料。
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>取消</Button>
          <Button
            color="primary"
            isLoading={submitting}
            isDisabled={!title.trim() || !body.trim()}
            onPress={async () => {
              setSubmitting(true);
              try {
                const r = await publishMut?.mutateAsync?.({
                  title: title.trim(),
                  description: description.trim() || undefined,
                  kind: defaultKind,
                  tier: (tier ?? undefined) as any,
                  platform: platform ?? undefined,
                  taskId: taskId ?? undefined,
                  content: { body, structure: defaultKind },
                  previewText: body.slice(0, 280),
                  sourceOutputId: outputId,
                  visibility,
                });
                showToastGlobal(`已發布到範本庫（#${r?.id ?? "?"}）— 被別人用一次 +2 credits ✓`);
                onClose();
                setTimeout(() => navigate("/community"), 800);
              } catch (e: any) {
                showToastGlobal(`發布失敗：${e?.message ?? e}`);
              } finally {
                setSubmitting(false);
              }
            }}
          >
            發布到範本庫
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-default-200 mx-1" />;
}

function ToolbarBtn({
  icon: Icon, label, active, highlight, onClick,
}: {
  icon: any; label: string; active?: boolean; highlight?: boolean; onClick?: () => void;
}) {
  return (
    <Tooltip content={label} placement="bottom">
      <button
        onClick={onClick}
        className={`w-7 h-7 rounded-md flex items-center justify-center transition ${
          active
            ? "bg-secondary/15 text-secondary"
            : highlight
              ? "bg-success-100 text-success-700"
              : "text-default-500 hover:bg-default-100 hover:text-default-800"
        }`}
        aria-label={label}
      >
        <Icon size={14} strokeWidth={1.75} />
      </button>
    </Tooltip>
  );
}
