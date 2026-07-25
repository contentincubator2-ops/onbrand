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
import React, { useMemo, useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Avatar, Button, Card, CardBody, Chip, Spinner, Textarea, Tooltip,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClipboard, faClipboardCheck, faRotateRight, faXmark,
  faShare, faCalendarPlus, faEnvelope, faRocket, faFolderPlus,
  faChevronLeft, faFolderOpen, faDownload, faChevronDown, faChevronUp,
} from "@fortawesome/free-solid-svg-icons";
import {
  faFacebook, faInstagram, faLinkedin, faYoutube,
} from "@fortawesome/free-brands-svg-icons";
import {
  Pencil, MessageCircle, Image as LucideImage, Video,
  Wand2, Users as LucideUsers, Save, Copy as LucideCopy,
  Share2 as LucideShare,
} from "lucide-react";
import { trpc } from "../../lib/trpc";
import { showToastGlobal } from "../../components/ui/Toast";
import { PlatformMockup } from "../components/PlatformMockup";
import type { MockupVariant } from "../lib/inferMockup";
import { TRPCClientError } from "@trpc/client";
import { useLang } from "../../lib/i18n";
import { fireNudge } from "../components/mia/miaNudges";

type Mode = "edit" | "chat" | "image" | "video" | "agent" | "regen" | "rewrite" | "publish";

/* 2026-07-07 (CJ「參數儀表板 technical data 客戶看不懂，乾脆換成可以選擇
 * 不同 agent 幫他重寫」): the settings/telemetry panel is gone from the
 * client UI. In its place: a rewrite-agent picker. Each persona maps to
 * quickTask.refineCaption's existing agentName/agentTitle params (the
 * server builds the system prompt from them), so no new endpoint. */
const REWRITE_AGENTS: Array<{
  name: string;
  title: string; titleEn: string;          // card subtitle + agentTitle param
  style: string; styleEn: string;          // one-line pitch shown on the card
  instruction: string; instructionEn: string; // sent as userFeedback
}> = [
  {
    name: "林曉青", title: "感性故事文案", titleEn: "Story-driven Copywriter",
    style: "小故事帶入，品牌溫度", styleEn: "Warm, narrative-led",
    instruction: "請用你最擅長的感性說故事風格完整重寫這篇文案：以一個貼近受眾日常的小情境開場，把產品自然帶進故事，結尾收在情感共鳴加上輕聲的行動呼籲。保留原文的關鍵賣點與事實，不要新增原文沒有的功能或承諾。",
    instructionEn: "Rewrite fully in your signature story-driven style: open with a relatable everyday scene, weave the product in naturally, close with emotional resonance and a soft CTA. Keep every factual selling point; invent nothing.",
  },
  {
    name: "張凱強", title: "直球促購文案", titleEn: "Direct-response Copywriter",
    style: "第一句就是賣點，轉單導向", styleEn: "Punchy, conversion-first",
    instruction: "請用直球促購風格完整重寫：第一句就丟最強賣點，全篇短句有力、節奏快，營造明確的行動急迫感，結尾一個不囉嗦的行動呼籲。保留原文的關鍵資訊與優惠條件，不得捏造價格、折扣或期限。",
    instructionEn: "Rewrite in direct-response style: strongest hook in the first line, short punchy sentences, clear urgency, one crisp CTA. Keep original facts and offer terms; never invent prices or deadlines.",
  },
  {
    name: "Ray", title: "網感幽默文案", titleEn: "Meme-savvy Copywriter",
    style: "口語有梗，年輕化", styleEn: "Playful, youthful, witty",
    instruction: "請用年輕、有網感的幽默風格完整重寫：口語、有梗、帶一點自嘲或反差，讓人看完想 tag 朋友。梗要新不要老，幽默不能蓋過賣點，品牌的禁用語與事實照舊遵守。",
    instructionEn: "Rewrite with playful internet humor: conversational, witty, tag-a-friend energy. Keep the selling points visible under the humor and respect all brand rules.",
  },
  {
    name: "沈以柔", title: "專業顧問文案", titleEn: "Expert-authority Copywriter",
    style: "觀點與信任感，專業口吻", styleEn: "Credible, insight-led",
    instruction: "請用專業顧問的口吻完整重寫：以觀點或洞察切入，語氣可信、克制、不浮誇，讓讀者覺得是內行人給的建議。只使用原文已有的數據與事實，沒有數據就用定性描述，不得編造數字。",
    instructionEn: "Rewrite in a credible consultant voice: lead with an insight, restrained and trustworthy. Use only facts present in the original; never fabricate numbers.",
  },
  {
    name: "阿捷", title: "極簡俐落文案", titleEn: "Minimalist Copywriter",
    style: "砍到最短，一眼看完", styleEn: "Cut to the bone",
    instruction: "請把這篇文案砍到最精簡：保留一個主賣點加一個行動呼籲，其餘全部拿掉，句子要短，總長度不超過原文的一半。刪減可以，但不能改變原意，也不能遺漏優惠的關鍵條件。",
    instructionEn: "Cut this caption to the bone: one key selling point plus one CTA, short lines, under half the original length. Trim aggressively but never change meaning or drop offer terms.",
  },
];

interface VariantData {
  label: string;
  caption: string;
  hashtags?: string[];
  imageStyle?: string;
  imageUrl?: string | null;
  imageStatus?: string;
  qa?: any;
  extras?: any;
  // 2026-05-18 (CJ): carousel / album — N cards, each its own image
  cards?: Array<{
    headline: string;
    body: string;
    image: { style: string | null; url: string | null; status: string; errorMsg?: string };
  }>;
}

/* 2026-05-18 (CJ「還有 \n\n 的符號」): models sometimes emit the literal
 * two-char sequence backslash-n instead of a real newline (double-escaped
 * JSON). Normalize to real line breaks + collapse runs so every mockup
 * renders clean paragraphs. */
function sanitizeCaption(s: unknown): string {
  let t = typeof s === "string" ? s : (s == null ? "" : String(s));
  t = t.replace(/\\r\\n|\\n|\\r/g, "\n").replace(/\\t/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

/* 2026-05-17 (CJ「把得獎工藝依據展示在前台」): per-task craft reference.
 * Mirrors the 【得獎工藝參考】 baked into each PR task's systemPrompt.
 * Wording is deliberately "工藝原則參考，非案例背書" — we apply the
 * transferable craft principle, NOT a claim of award/endorsement. */
const PR_CRAFT_REF: Record<string, {
  case: string; award: string; principle: string;
  caseEn: string; awardEn: string; principleEn: string;
}> = {
  "pr-30-headline":        {
    case: "The Tampon Book", award: "Cannes Lions 2019 PR 全場大獎", principle: "用一個「重新框架」把舊事實變成不可忽視的新聞——標題＝reframe＋具體數字。",
    caseEn: "The Tampon Book", awardEn: "Cannes Lions 2019 PR Grand Prix", principleEn: "One reframe turns an old fact into unmissable news — headline = reframe + specific number.",
  },
  "pr-30-subhead":         {
    case: "Project Revoice", award: "Cannes Lions 2018 健康類全場大獎", principle: "副標扛起標題扛不動的「人的代價/影響」，補上利害關係，不是重述標題。",
    caseEn: "Project Revoice", awardEn: "Cannes Lions 2018 Health & Wellness Grand Prix", principleEn: "The subhead carries what the headline can't — the human cost, the stakes. It adds context, not a restatement.",
  },
  "pr-30-lead-paragraph":  {
    case: "The Lost Class", award: "Cannes Lions 2022", principle: "第一句就是一個讓人重新理解全局的事實揭露，不鋪陳。",
    caseEn: "The Lost Class", awardEn: "Cannes Lions 2022", principleEn: "First sentence = a fact that reframes everything. No buildup. No preamble.",
  },
  "pr-30-ceo-quote":       {
    case: "Patagonia「Earth is now our only shareholder」", award: "2022 全球 earned-media 典範", principle: "高層發言＝行動＋價值，每句可被記者原句引用，不是場面話。",
    caseEn: "Patagonia — \"Earth is now our only shareholder\"", awardEn: "2022 global earned-media benchmark", principleEn: "Executive quotes = action + values. Every sentence quotable as-is. Not corporate filler.",
  },
  "pr-30-boilerplate":     {
    case: "PR Awards 評審準則 + Dove 長青一致性", award: "業界評審共通準則", principle: "用可驗證事實＋第三方背書建立可信度，能長期沿用不過期。",
    caseEn: "PR Awards judging criteria + Dove long-term consistency", awardEn: "Industry standard", principleEn: "Verifiable facts + third-party proof = credibility that doesn't expire.",
  },
  "pr-30-fact-sheet":      {
    case: "Spotify Wrapped", award: "全球 earned / 多獎", principle: "把資料變成「10 秒看懂、想分享」的數字，掃描性 > 完整性。",
    caseEn: "Spotify Wrapped", awardEn: "Global earned media + multiple awards", principleEn: "Turn data into numbers people grasp in 10 seconds and want to share. Scannable beats comprehensive.",
  },
  "pr-30-media-pitch":     {
    case: "Whopper Detour", award: "Cannes Lions 2019", principle: "賣「記者的讀者會在乎的角度」與不可抗拒的鉤，不是賣品牌。",
    caseEn: "Whopper Detour", awardEn: "Cannes Lions 2019", principleEn: "Sell the angle the journalist's readers will care about — and an irresistible hook. Not the brand.",
  },
  "pr-30-spokesperson-qa": {
    case: "KFC「FCK」", award: "Cannes Lions 2019 多項金獅 + D&AD", principle: "危機回應：立刻 own it＋坦誠＋機智＋馬上講怎麼修，化攻擊為信任。",
    caseEn: "KFC \"FCK\"", awardEn: "Cannes Lions 2019 multiple Gold Lions + D&AD", principleEn: "Crisis response: own it immediately + be honest + use wit + say what you're fixing. Turn attack into trust.",
  },
  "pr-30-launch-social":   {
    case: "Spotify Wrapped 社群擴散", award: "全球 earned", principle: "被分享的是「有觀點、有梗、與我有關」，不是公告。",
    caseEn: "Spotify Wrapped — social amplification", awardEn: "Global earned media", principleEn: "What gets shared: has a POV, has a hook, feels personal. Not an announcement.",
  },
  "pr-100-launch-toolkit": {
    case: "Whopper Detour（整合 earned）", award: "Cannes Lions 2019", principle: "一個新聞鉤貫穿所有素材，互相加乘而非各說各話。",
    caseEn: "Whopper Detour (integrated earned)", awardEn: "Cannes Lions 2019", principleEn: "One news hook threads through every asset — each amplifies the others instead of going solo.",
  },
  "pr-99-launch-toolkit":  {
    case: "Whopper Detour（整合 earned）", award: "Cannes Lions 2019", principle: "一個新聞鉤貫穿所有素材，互相加乘而非各說各話。",
    caseEn: "Whopper Detour (integrated earned)", awardEn: "Cannes Lions 2019", principleEn: "One news hook threads through every asset — each amplifies the others instead of going solo.",
  },
  "pr-30-news-hook":       {
    case: "The Tampon Book + Whopper Detour", award: "Cannes Lions 2019 PR", principle: "得獎不是把公告寫好，而是先找到「記者會主動報、群眾會主動傳」的角度（earned idea）。",
    caseEn: "The Tampon Book + Whopper Detour", awardEn: "Cannes Lions 2019 PR", principleEn: "Awards don't go to well-written press releases. They go to the angle journalists want to cover and audiences want to share — the earned idea.",
  },
  "pr-99-newsjack":        {
    case: "Oreo「Dunk in the Dark」", award: "2013 即時 newsjack 經典", principle: "在對的時刻、用對的角度、夠快且自然地把品牌接上正在發燒的話題——不硬蹭。",
    caseEn: "Oreo \"Dunk in the Dark\"", awardEn: "2013 real-time newsjack classic", principleEn: "Right moment, right angle, fast and natural — attach the brand to a trending story. Never force it.",
  },
};

// 2026-05-18 (CJ「承諾是完整貼文 → 圖完成才展示 mockup」): tasks whose
// deliverable is a complete post (copy + image). For these, while the
// orchestra is still on the caption_ready checkpoint (image pending) we
// hold the mockup and show a "generating" state, then reveal the full
// post once images finish. Mirrors OrchestraConfig.holdForImages server-side.
const HOLD_FOR_IMAGES = new Set<string>(["fb-60-single-full", "fb-99-carousel-5"]);

function CraftChip({ taskId, en }: { taskId?: string | null; en: boolean }) {
  const [open, setOpen] = React.useState(false);
  const ref = taskId ? PR_CRAFT_REF[taskId] : undefined;
  if (!ref) return null;
  const caseLabel  = en ? ref.caseEn  : ref.case;
  const awardLabel = en ? ref.awardEn : ref.award;
  const princLabel = en ? ref.principleEn : ref.principle;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition"
        style={{ borderColor: "#e5d9b6", background: "#fbf6e7", color: "#8a6d1d" }}
        title={en ? "Craft reference" : "工藝依據"}
      >
        ✨ {en ? "Craft reference" : "工藝依據"}：{caseLabel}
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 left-0 rounded-lg border bg-white p-3 shadow-lg"
          style={{ width: 300, borderColor: "#ece7d6" }}
        >
          <div className="text-[11px] font-bold text-neutral-900 mb-0.5">{caseLabel}</div>
          <div className="text-[10px] text-neutral-500 mb-2">{awardLabel}</div>
          <div className="text-[11px] leading-relaxed text-neutral-700">{princLabel}</div>
          <div className="mt-2 pt-2 border-t text-[9px] text-neutral-400" style={{ borderColor: "#f0eee6" }}>
            {en
              ? "Transferable craft principle applied — not an award certification or endorsement."
              : "套用可轉移的工藝原則，非得獎認證或案例背書。"}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Convert a Nano-Banana JSON prompt template into a clean natural-language
 * image prompt, substituting the original product/brand with the user's brand.
 *
 * Nano-Banana templates store the brand name in `concept_id` (e.g.
 * "iron_man_coke") and multiple nested fields (focus_object, character_element,
 * artistic_direction, etc.). Passing the raw JSON to an image model causes it
 * to generate the original brand's product even when focus_object is replaced.
 *
 * This function extracts only the visual/compositional elements (environment,
 * character, lighting, mood, style) and synthesizes a clean English prompt
 * that never mentions any competitor brand name.
 */
function nanoBananaJsonToPrompt(rawJson: string, brandLabel: string): string | null {
  let obj: any;
  try { obj = JSON.parse(rawJson); } catch { return null; }
  if (Array.isArray(obj)) obj = obj[0];
  if (!obj || typeof obj !== "object") return null;

  // Recursively find the first non-empty string value for any of the given keys.
  const find = (node: any, ...keys: string[]): string | undefined => {
    if (!node || typeof node !== "object") return undefined;
    for (const k of keys) {
      if (typeof node[k] === "string" && node[k].trim()) return node[k].trim();
    }
    for (const v of Object.values(node)) {
      const r = find(v, ...keys);
      if (r) return r;
    }
    return undefined;
  };

  const subject   = brandLabel ? `${brandLabel} product` : "product";
  const charEl    = find(obj, "character_element", "character", "hand_element");
  const env       = find(obj, "environment", "setting", "background", "scene");
  const lighting  = find(obj, "lighting", "light", "illumination");
  const mood      = find(obj, "mood", "atmosphere", "emotion", "feeling");
  const style     = find(obj, "style", "aesthetic", "render_style", "rendering", "visual_style");
  const camera    = find(obj, "camera_angle", "camera", "shot_type", "framing", "perspective");
  const texture   = find(obj, "texture", "material", "surface");

  const parts: string[] = [
    subject,
    charEl   ? `featuring ${charEl}` : undefined,
    env      ? `set in ${env}` : undefined,
    camera   ? camera : undefined,
    lighting ? `${lighting} lighting` : undefined,
    mood     ? `${mood} atmosphere` : undefined,
    style    ? `${style} render` : undefined,
    texture  ? texture : undefined,
  ].filter((x): x is string => Boolean(x));

  return parts.join(", ");
}


function sanitizeProviderErrorForToast(input: unknown): string {
  const raw = String(input ?? "");
  const redacted = raw
    .replace(/api_key:[A-Za-z0-9_\-]+/g, "api_key:[REDACTED]")
    .replace(/key=([A-Za-z0-9_\-]+)/g, "key=[REDACTED]")
    .replace(/API KEY\s*:?\s*[A-Za-z0-9_\-]+/gi, "API KEY:[REDACTED]")
    .replace(/AIza[0-9A-Za-z_\-]{20,}/g, "[REDACTED_GOOGLE_KEY]");
  if (/key|unauthorized|api_key|permission_denied|suspended|consumer|forbidden|403/i.test(redacted)) {
    return "AI 圖片服務的金鑰異常，SoWork 已收到通知正在處理。";
  }
  return redacted;
}

export default function RunPage() {
  const { outputId } = useParams<{ outputId: string }>();
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const id = Number(outputId);

  // 2026-05-14 (CJ「async polling」): when the orchestra wrote a partial
  // row (progress='caption_ready'), poll every 4s so image / QA show up
  // as they complete. Stop polling once progress reaches done/failed.
  const { data, isLoading, error } = trpc.output.getById.useQuery(
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

  const [activeIdx, setActiveIdx] = useState(0);

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
    setRevealCount(REVEAL_STEP);
    setOverrides({});
    setChatPrompt("");
    setFocusedAgent(null);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [copied, setCopied] = useState(false);
  // 2026-05-11 (CJ「Spotify 模式」): community-template publish modal state.
  const [shareModal, setShareModal] = useState(false);
  // 2026-05-28: FB flow state
  // fbOauthDone    — OAuth popup completed this session (button switches to "發布")
  // fbOauthPending — popup is open; show "✓ 已完成授權" confirm button instead
  // fbPagePickerOpen — page picker shown when user clicks publish
  // fbPages        — pages fetched from Graph API (cached after OAuth)
  const [fbOauthDone, setFbOauthDone] = useState(false);
  const [fbOauthPending, setFbOauthPending] = useState(false);
  const [fbPagePickerOpen, setFbPagePickerOpen] = useState(false);
  const [fbPages, setFbPages] = useState<Array<{
    id: string;
    name: string;
    category: string;
    publishReady?: boolean;
    permissionError?: string;
  }>>([]);
  /** Local override for variants — applied after save, mockup updates live. */
  const [overrides, setOverrides] = useState<Record<number, { caption: string }>>({});
  /** AI chat history per variant. */
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user"|"assistant"; content: string }>>([]);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  // 2026-07-07 (CJ): rewrite-agent picker — persona name in flight + preview
  const [rewriteBusy, setRewriteBusy] = useState<string | null>(null);
  const [rewritePreview, setRewritePreview] = useState<{ agent: string; text: string } | null>(null);
  /** P4: image regen prompt — pre-filled from variant.imageStyle, editable. */
  const [imagePrompt, setImagePrompt] = useState<string>("");
  /** 2026-07-07 (CJ): user-editable thumbnail title text overlaid on the (now
   *  text-free) AI thumbnail. Seeded from the variant title/caption, editable
   *  in the right panel; passed to the YT mockup as overlayTitle. */
  const [overlayTitle, setOverlayTitle] = useState<string>("");
  const overlaySeededRef = useRef<string | null>(null);
  /** 2026-05-12: user-selected image model for 改圖 dropdown.
   *  2026-06-15: default gpt-image-2 across all platforms. */
  const [imageModel, setImageModel] = useState<string>("gpt-image-2");
  /** Video gen state — async job, polled for status. */
  const [videoDuration, setVideoDuration] = useState<number>(30);
  const [videoJobId, setVideoJobId] = useState<number | null>(null);
  /** 2026-05-12: user-selected video model for 改影片 dropdown. */
  const [videoModel, setVideoModel] = useState<string>("auto");
  /** 2026-05-12 Phase 1 — picked template category for the 改圖 picker. */
  const [templateCategory, setTemplateCategory] = useState<string>("");
  /** 2026-05-19 (CJ「某個影片 title 產出腳本」): inline script generation modal. */
  const [scriptModalTitle, setScriptModalTitle] = useState<string | null>(null);
  const [generatedScript, setGeneratedScript] = useState<string | null>(null);
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
      lang === "en" ? `Save failed: ${e.message}` : `儲存失敗：${e.message}`
    ),
  });
  const refineMut = (trpc as any).quickTask?.refineCaption?.useMutation
    ? (trpc as any).quickTask.refineCaption.useMutation()
    : null;
  // 2026-05-19: inline script generation for YT 12-title tab
  const scriptMut = (trpc as any).quickTask?.generateVideoScript?.useMutation
    ? (trpc as any).quickTask.generateVideoScript.useMutation({
        onSuccess: (r: any) => {
          if (r.ok) setGeneratedScript(r.script);
          else showToastGlobal(lang === "en" ? `Script failed: ${typeof r.error === "string" ? r.error : "unknown error"}` : `腳本生成失敗：${typeof r.error === "string" ? r.error : "未知錯誤"}`);
        },
        onError: (e: any) => showToastGlobal(lang === "en" ? `Script error: ${e.message}` : `腳本錯誤：${e.message}`),
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
      lang === "en" ? `Send failed: ${e.message}` : `寄送失敗：${e.message}`
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
      lang === "en" ? `Schedule failed: ${e.message}` : `排程失敗：${e.message}`
    ),
  });
  const statusMut = trpc.output.updateStatus.useMutation({
    onSuccess: () => {
      showToastGlobal(t("run_saved_to_mission"));
      utils.output.getById.invalidate({ id });
    },
  });
  // 2026-05-09 (P3): regen single variant
  const regenMut = (trpc as any).quickTask?.regenerateVariant?.useMutation
    ? (trpc as any).quickTask.regenerateVariant.useMutation({
        onSuccess: () => {
          showToastGlobal(
            lang === "en" ? "Version rewritten ✓" : "已重生此變體 ✓"
          );
          utils.output.getById.invalidate({ id });
          setOverrides({});
        },
        onError: (e: any) => showToastGlobal(
          lang === "en" ? `Rewrite failed: ${e?.message ?? e}` : `重生失敗：${e?.message ?? e}`
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
  // 2026-05-09 (P5 — CJ「use pipedream for OAuth」): publish to FB via
  // Pipedream Connect. Server hits a Pipedream webhook; Pipedream's
  // workflow handles Meta OAuth/token, calls Graph API, returns post_id.
  // 2026-05-12 (CJ「直接發 facebook 應該直接跳出 pipedream 授權」):
  // On '尚未連接' error, automatically open the Pipedream Connect popup
  // for that platform. After successful authorization, the user can press
  // 直接發 again to publish.
  const getConnectTokenMut = (trpc as any).platformConnect?.getConnectToken?.useMutation?.();
  const [pipedreamBusy, setPipedreamBusy] = useState(false);

  // 2026-05-18 (CJ「Connect account popup blocked」): the Pipedream SDK
  // opens its OAuth popup inside connectAccount(). Browsers block that
  // popup if it runs AFTER an await (the user-gesture/transient
  // activation is gone) — and the old code did `await getConnectToken`
  // + `await import(sdk)` BEFORE connectAccount. Fix: PREFETCH the token
  // and the SDK module (on hover/focus/mount) so the click handler can
  // call connectAccount with NO awaits in front of it → no popup block.
  // bundle.social connect path — which platforms use it is decided server-side.
  const bundleProvidersQ    = (trpc as any).bundleConnect?.getProviders?.useQuery?.();
  const bundleConnectUrlMut = (trpc as any).bundleConnect?.getConnectUrl?.useMutation?.();
  const bundleUrlRef = React.useRef<Record<string, string | undefined>>({});

  const pdSdkRef = React.useRef<any>(null);
  const pdTokenRef = React.useRef<Record<string, {
    token: string;
    expiresAt: number;
    appSlug: string;
    env: string;
    connectLinkUrl: string;
    oauthAppId: string | null;
  }>>({});
  const pdPrefetchingRef = React.useRef<Record<string, boolean>>({});
  const PLATFORM_LABEL: Record<string, string> = {
    facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", youtube: "YouTube",
  };

  React.useEffect(() => {
    import("@pipedream/sdk/browser")
      .then((m) => { pdSdkRef.current = (m as any).PipedreamClient; })
      .catch(() => { /* retried lazily in prefetch */ });
  }, []);

  const prefetchConnect = React.useCallback(async (platform: "facebook" | "instagram" | "linkedin" | "youtube") => {
    if (pdPrefetchingRef.current[platform]) return;
    const cached = pdTokenRef.current[platform];
    const sdkReady = !!pdSdkRef.current;
    if (cached && cached.expiresAt - Date.now() > 60_000 && sdkReady) return;
    pdPrefetchingRef.current[platform] = true;
    try {
      if (!pdSdkRef.current) {
        const m = await import("@pipedream/sdk/browser");
        pdSdkRef.current = (m as any).PipedreamClient;
      }
      const brandIdForToken = (data?.mission?.brandId ?? data?.brand?.id ?? 0) as number;
      const tk = await getConnectTokenMut?.mutateAsync?.({ platform, brandId: brandIdForToken });
      if (tk?.token) {
        pdTokenRef.current[platform] = {
          token: tk.token,
          expiresAt: new Date(tk.expiresAt || Date.now() + 300_000).getTime(),
          appSlug: tk.appSlug,
          env: tk.env ?? "production",
          connectLinkUrl: tk.connectLinkUrl ?? "",
          oauthAppId: tk.oauthAppId ?? null,
        };
      }
    } catch { /* surfaced on click if still cold */ } finally {
      pdPrefetchingRef.current[platform] = false;
    }
  }, [getConnectTokenMut]);

  // Synchronous: NO awaits before pd.connectAccount() so the popup keeps
  // the click's user activation. If not warmed yet, warm it and ask the
  // user to tap again (never attempt a popup that will be blocked).
  const openPipedreamConnect = (platform: "facebook" | "instagram" | "linkedin" | "youtube") => {
    if (pipedreamBusy) return;

    // bundle.social path: a hosted portal in a new tab, no Pipedream SDK.
    // YouTube is never routed here — getProviders only covers fb/ig/li.
    if (bundleProvidersQ?.data?.[platform] === "bundle") {
      const brandId = data?.mission?.brandId ?? data?.brand?.id ?? 0;
      if (!brandId) return;
      const url = bundleUrlRef.current[platform];
      if (!url) {
        void bundleConnectUrlMut?.mutateAsync?.({
          brandId,
          platform,
          redirectUrl: window.location.href,
        }).then((r: any) => {
          if (r?.url) bundleUrlRef.current[platform] = r.url;
        }).catch(() => { /* retried on next tap */ });
        showToastGlobal(
          lang === "en"
            ? "Preparing authorization — please tap again in a moment."
            : "正在準備授權，請稍候 1-2 秒再點一次"
        );
        return;
      }
      // Portal links are single-use.
      delete bundleUrlRef.current[platform];
      window.open(url, "_blank", "noopener");
      showToastGlobal(
        lang === "en"
          ? "Complete the authorization in the new tab, then return here."
          : "請在新分頁完成授權後回到此頁"
      );
      return;
    }

    const tk = pdTokenRef.current[platform];
    const Ctor = pdSdkRef.current;
    if (!Ctor || !tk || tk.expiresAt - Date.now() < 30_000) {
      prefetchConnect(platform);
      showToastGlobal(
        lang === "en"
          ? "Preparing authorization — please tap again in a moment."
          : "正在準備授權，請稍候 1-2 秒再點一次"
      );
      return;
    }
    setPipedreamBusy(true);
    try {
      const pd = new Ctor({
        projectEnvironment: tk.env as "production" | "development",
        externalUserId: `sowork-brand-${(data?.mission?.brandId ?? data?.brand?.id ?? 0)}`,
        tokenCallback: async () => ({
          token: tk.token,
          expiresAt: new Date(tk.expiresAt),
          connectLinkUrl: tk.connectLinkUrl,
        }),
      });
      pd.connectAccount({
        app: tk.appSlug,
        oauthAppId: tk.oauthAppId ?? undefined,
        onSuccess: () => {
          showToastGlobal(
            lang === "en"
              ? `${PLATFORM_LABEL[platform]} connected ✓ Ready to publish`
              : `已授權 ${PLATFORM_LABEL[platform]} ✓ 現在可以發布`
          );
          setPipedreamBusy(false);
          // token consumed — refresh for a possible next connect
          delete pdTokenRef.current[platform];
          prefetchConnect(platform);
        },
        onError: (err: any) => {
          setPipedreamBusy(false);
          showToastGlobal(
            lang === "en" ? `Authorization failed: ${String(err).slice(0, 120)}` : `授權失敗：${String(err).slice(0, 120)}`
          );
        },
        onClose: ({ successful }: any) => {
          setPipedreamBusy(false);
          if (!successful) {
            delete pdTokenRef.current[platform];
            prefetchConnect(platform);
          }
        },
      });
    } catch (e: any) {
      setPipedreamBusy(false);
      showToastGlobal(
        lang === "en" ? `Authorization failed: ${String(e?.message ?? e).slice(0, 120)}` : `授權失敗：${String(e?.message ?? e).slice(0, 120)}`
      );
    }
  };

  // 2026-05-18 (CJ「toast 叫我點下方連接 Facebook 按鈕，但根本沒有那顆」):
  // for Facebook there was ONLY the 直接發 button — no connect button —
  // so the not-connected toast pointed at a button that didn't exist.
  // Query FB status; when not connected the FB button BECOMES the
  // connect action (clicking it IS a user gesture → popup allowed).
  const fbBrandId = (data?.mission?.brandId ?? data?.brand?.id ?? 0) as number;
  const fbStatusQuery = (trpc as any).publish?.getBrandFacebookStatus?.useQuery
    ? (trpc as any).publish.getBrandFacebookStatus.useQuery(
        { brandId: fbBrandId },
        { enabled: fbBrandId > 0, refetchOnWindowFocus: false, staleTime: 15_000 },
      )
    : { data: null };
  const fbConnected = !!(fbStatusQuery?.data as any)?.connected;

  // 2026-05-30: brand-scoped platform connection status (for polling)
  const platformsQRun = (trpc as any).publish?.getConnectedPlatforms?.useQuery?.(
    { brandId: fbBrandId },
    { enabled: fbBrandId > 0, refetchOnWindowFocus: false, staleTime: 20_000 },
  );

  // fbPagesMutRef: ref so connectFacebookViaUrl's async retry loop can call
  // the latest mutation without stale closure issues.
  const fbPagesMutRef = useRef<any>(null);

  const fbConnectUrlMut = (trpc as any).publish?.getFacebookConnectUrl?.useMutation?.();
  const fbPagesMut      = (trpc as any).publish?.getFacebookPages?.useMutation?.();
  fbPagesMutRef.current = fbPagesMut;
  const setBrandFbPageMut = (trpc as any).publish?.setBrandFacebookPage?.useMutation?.();
  // 2026-06-01 (CJ): Route all publishing through Calendar instead of direct Pipedream call.
  // scheduleToCalMut: schedules the output as a "pending" scheduled_post, then user
  // goes to CalendarPage where they click "立即發布" to actually push via Pipedream.
  const scheduleToCalMut = (trpc as any).calendar?.schedule?.useMutation?.({
    onSuccess: (_r: any) => {
      showToastGlobal(
        lang === "en"
          ? "Added to Calendar ✓ — go to Calendar page to publish"
          : "已加入日曆 ✓ — 前往「日曆」頁面發布"
      );
    },
    onError: (e: any) => {
      showToastGlobal(
        lang === "en"
          ? `Schedule failed: ${e?.message ?? e}`
          : `排程失敗：${e?.message ?? e}`
      );
    },
  }) ?? { mutateAsync: async () => {}, isPending: false };

  // Called when user clicks "排程發布" on a specific platform row.
  // `rowPlatform` = the p.key of the row the user clicked ("facebook","instagram",…).
  // Schedules the current output to calendar, then user publishes from CalendarPage.
  const handleScheduleToCalendar = React.useCallback(async (rowPlatform: string) => {
    if (!confirm(lang === "en"
      ? `Add to Calendar as ${rowPlatform}? You can then publish from the Calendar page.`
      : `加入日曆（${rowPlatform}）？可在日曆頁面選擇時間並發布。`)) return;

    await scheduleToCalMut?.mutateAsync?.({
      outputId: id,
      variantIndex: activeIdx,
      platform: rowPlatform,
      scheduledAt: new Date().toISOString(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, id, activeIdx]);

  // Uses Pipedream SDK iframe — window.open popup throws "Must be inside iframe"
  const connectFacebookViaUrl = () => {
    (async () => {
      try {
        const r = await fbConnectUrlMut?.mutateAsync?.({ brandId: fbBrandId });
        if (!r?.token) {
          showToastGlobal(lang === "en" ? "Couldn't get auth token — contact sowork@sowork.ai" : "無法取得授權 token — 請聯絡 sowork@sowork.ai");
          return;
        }
        const { createFrontendClient } = await import("@pipedream/sdk/browser");
        const pd = createFrontendClient({
          externalUserId: `sowork-brand-${fbBrandId}`,
          tokenCallback: async () => ({ token: r.token, expiresAt: new Date(Date.now() + 300_000), connectLinkUrl: "" } as any),
        });
        setFbOauthPending(true);
        pd.connectAccount({
          token: r.token,
          app: "facebook_pages",
          oauthAppId: r.oauthAppId ?? undefined,
          onSuccess: async () => {
            setFbOauthPending(false);
            setFbOauthDone(true);
            // Poll getFacebookPages with backoff for Pipedream propagation delay
            for (let i = 0; i < 10; i++) {
              await new Promise<void>(res => setTimeout(res, i === 0 ? 1500 : 2000));
              try {
                const pages = await fbPagesMutRef.current?.mutateAsync?.({
                  brandId: fbBrandId,
                  waitForPropagation: false,
                });
                const readyPages = (pages?.pages ?? [])
                  .filter((page: any) => page.publishReady !== false);
                if (readyPages.length > 0) {
                  setFbPages(readyPages);
                  setFbPagePickerOpen(true);
                  return;
                }
              } catch { /* keep retrying */ }
            }
          },
          onError: (err: any) => {
            setFbOauthPending(false);
            showToastGlobal(lang === "en" ? `Authorization failed: ${err?.message ?? "Unknown"}` : `授權失敗：${err?.message ?? "未知錯誤"}`);
          },
          onClose: (status: any) => {
            if (!status?.successful) setFbOauthPending(false);
          },
        });
      } catch (e: any) {
        setFbOauthPending(false);
        showToastGlobal(lang === "en" ? `Authorization failed: ${String(e?.message ?? e).slice(0, 120)}` : `授權失敗：${String(e?.message ?? e).slice(0, 120)}`);
      }
    })();
  };

  // Video gen — async pipeline. Spawn job, poll for status until ready.
  // 2026-05-12 (CJ「我要改成只給腳本 — C」): storyboard mode replaces full
  // video gen. Calls video.generateStoryboard which returns a script with
  // one Flux Schnell reference image per scene. ~30-90 seconds end-to-end.
  const videoGenMut = (trpc as any).video?.generateStoryboard?.useMutation
    ? (trpc as any).video.generateStoryboard.useMutation({
        onSuccess: (r: any) => {
          setVideoJobId(r.jobId);
          showToastGlobal(
            lang === "en"
              ? `Storyboard generating #${r.jobId} — done in ~1 minute`
              : `故事板生成中 #${r.jobId} — 約 1 分鐘內完成`
          );
        },
        onError: (e: any) => showToastGlobal(
          lang === "en" ? `Storyboard failed to start: ${e?.message ?? e}` : `故事板啟動失敗：${e?.message ?? e}`
        ),
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
    !videoStatus ? (lang === "en" ? "Checking…" : "查詢中…") :
    videoStatus.status === "pending" ? (lang === "en" ? `Queued (${videoStatus.progress ?? 0}%)` : `排隊中 (${videoStatus.progress ?? 0}%)`) :
    videoStatus.status === "processing" ? (lang === "en" ? `Generating (${videoStatus.progress ?? 0}%)` : `生成中 (${videoStatus.progress ?? 0}%)`) :
    videoStatus.status === "running" ? (lang === "en" ? `Generating (${videoStatus.progress ?? 0}%)` : `生成中 (${videoStatus.progress ?? 0}%)`) :
    videoStatus.status === "completed" ? (lang === "en" ? "Done ✓" : "完成 ✓") :
    videoStatus.status === "failed" ? (lang === "en" ? `Failed: ${videoStatus.errorMessage ?? "?"}` : `失敗：${videoStatus.errorMessage ?? "?"}`) :
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
            showToastGlobal(lang === "en" ? "Image ready ✓" : "已產圖 ✓");
          } else {
            // 2026-05-12: server should TRPCError on failure now; this branch
            // only reaches if a provider returned success-shaped but empty
            // data. Include any returned errorMsg if present.
            const detail = sanitizeProviderErrorForToast(r?.errorMsg ?? r?.message ?? "").slice(0, 200);
            showToastGlobal(
              detail
                ? (lang === "en" ? `Image failed: ${detail}` : `產圖失敗：${detail}`)
                : (lang === "en"
                    ? "Image finished but API returned no URL (please contact support)"
                    : "產圖完成但 API 沒回傳圖片網址（請聯絡客服）")
            );
          }
        },
        onError: (e: any) => {
          const detail = sanitizeProviderErrorForToast(e?.message ?? e);
          showToastGlobal(lang === "en" ? `Image failed: ${detail}` : `產圖失敗：${detail}`);
        },
      })
    : { mutate: () => {}, isPending: false };

  // 2026-07-25 (CJ product-faithful gen「📦 使用真實產品圖」— 改圖面板入口):
  // this is the panel the mockup's 點此手動生圖 opens, so the product picker
  // must live HERE (MediaGenFlow got it first, but that flow isn't on this
  // click path). When on, image.generate routes to Nano Banana with the
  // real photo + fidelity guard (see project_product_faithful_imagegen).
  const runProductImagesQ = (trpc as any).media?.listProductImages?.useQuery?.(
    { brandId: data?.brand?.id ?? 0 },
    { enabled: !!data?.brand?.id, refetchOnWindowFocus: false, staleTime: 60_000 },
  ) ?? { data: null };
  const runProductImages: Array<{ productId: number; name: string; imageUrl: string }> =
    (runProductImagesQ.data as any)?.products ?? [];
  const [useRealProduct, setUseRealProduct] = React.useState(false);
  const [pickedRunProduct, setPickedRunProduct] = React.useState<{ productId: number; name: string; imageUrl: string } | null>(null);
  const realProductMode = useRealProduct && !!pickedRunProduct;

  // 2026-06-15: generate image prompt from the current variant's caption.
  const captionToPromptMut = (trpc as any).image?.promptFromCaption?.useMutation
    ? (trpc as any).image.promptFromCaption.useMutation({
        onSuccess: (r: any) => {
          if (r?.prompt) {
            setImagePrompt(r.prompt);
            showToastGlobal(lang === "en" ? "Image prompt generated from caption ✓" : "已從文案產生圖片指令 ✓");
          }
        },
        onError: (e: any) => showToastGlobal(
          lang === "en" ? `Couldn't generate prompt: ${e?.message ?? e}` : `產生失敗：${e?.message ?? e}`
        ),
      })
    : { mutate: () => {}, isPending: false };

  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState("");
  const [emailNote, setEmailNote] = useState("");
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  // schedMode: which action triggered the schedule dialog
  //   "ics"      → download .ics only, no redirect
  //   "calendar" → write to scheduled_posts + navigate /calendar
  //   "publish"  → platform-specific write to scheduled_posts + navigate /calendar
  const [schedMode, setSchedMode] = useState<"ics" | "calendar" | "publish">("ics");
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

  const variants: VariantData[] = useMemo(() => {
    if (!data) return [];
    try {
      const parsed = JSON.parse(data.content);
      const raw: any[] = Array.isArray(parsed) ? parsed : (parsed?.variants ?? []);
      // 2026-05-14 (CJ「圖片還是跑很久」根因): orchestra persists nested
      //   { image: { url, status, style, errorMsg } }
      // but the VariantData interface + mockup expect FLAT
      //   { imageUrl, imageStatus, imageStyle }.
      // Without this normalize, even a successfully-generated image showed
      // as "等待 AI 生成" because imageUrl was always undefined.
      return raw.map((v: any) => {
        const img = v.image ?? {};
        return {
          label: v.label,
          caption: sanitizeCaption(v.caption),
          hashtags: v.hashtags ?? [],
          imageUrl: v.imageUrl ?? img.url ?? null,
          imageStatus: v.imageStatus ?? img.status ?? undefined,
          imageStyle: v.imageStyle ?? img.style ?? undefined,
          qa: v.qa,
          extras: v.extras,
          cards: Array.isArray(v.cards) ? v.cards : undefined,
        } as VariantData;
      });
    } catch { /* ignore */ }
    return [{ label: lang === "en" ? "Main version" : "主版本", caption: sanitizeCaption(data.content || "") }];
  }, [data]);

  // 2026-07-20 (CJ「FB 短貼文的『改圖』應隱藏但仍顯示、點了也不會生圖」):
  // text-only tasks (every variant image status "skipped", no url) have
  // nothing to redo — hide the 改圖 toolbar entry for them. Manual opt-in
  // image gen stays available via the mockup's 點此手動生圖.
  const hasImageSlot = useMemo(
    () => variants.some((v) => v.imageUrl || (v.imageStatus && v.imageStatus !== "skipped")),
    [variants],
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
    if (!hasImageSlot && mode === "image" && !manualImageRef.current) setMode("chat");
  }, [hasImageSlot, mode]);

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
    const seedKey = `${id}:${activeIdx}`;
    if (overlaySeededRef.current === seedKey) return;
    overlaySeededRef.current = seedKey;
    const cap = variants[activeIdx]?.caption ?? "";
    const seed = (data?.title?.trim() || cap.split("\n").map((l) => l.trim()).find(Boolean) || "").slice(0, 60);
    setOverlayTitle(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, activeIdx, variants]);

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
      const esc = (s: string) => String(s ?? "")
        .replace(/\\/g, "\\\\").replace(/;/g, "\\;")
        .replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

      if (schedMode === "ics") {
        // Build multi-event .ics, one per variant
        const brandName = (data as any)?.brand?.name ?? "";
        const ev: string[] = [];
        variants.forEach((v, i) => {
          const d = postDates[i];
          if (!d) return;
          const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
          const dEnd = new Date(d); dEnd.setDate(d.getDate() + 1);
          const ymdEnd = `${dEnd.getFullYear()}${String(dEnd.getMonth() + 1).padStart(2, "0")}${String(dEnd.getDate()).padStart(2, "0")}`;
          const summary = (brandName ? brandName + " · " : "") + (v.label ?? `Day ${i + 1}`);
          ev.push(
            "BEGIN:VEVENT",
            `UID:${id}-series-${i}@onbrand.sowork.ai`,
            `DTSTART;VALUE=DATE:${ymd}`,
            `DTEND;VALUE=DATE:${ymdEnd}`,
            `SUMMARY:${esc(summary)}`,
            `DESCRIPTION:${esc(v.caption ?? "")}`,
            "END:VEVENT",
          );
        });
        const icsStr = [
          "BEGIN:VCALENDAR", "VERSION:2.0",
          "PRODID:-//OnBrand//Content Calendar//ZH",
          "CALSCALE:GREGORIAN", ...ev, "END:VCALENDAR",
        ].join("\r\n");
        const blob = new Blob([icsStr], { type: "text/calendar;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `series-${id}.ics`;
        a.click();
        URL.revokeObjectURL(a.href);
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
            variantIndex: i,
            platform: _platform,
            scheduledAt: d.toISOString(),
          });
        }
        setScheduleDialogOpen(false);
        navigate("/calendar");
      } catch {
        // error toast already shown by scheduleToCalMut.onError
      }
      return;
    }

    // ── Single-post path (original behaviour) ────────────────────────────
    const _scheduledAt = new Date(scheduleAt).toISOString();
    if (schedMode === "ics") {
      scheduleMut.mutate({
        id, variantIndex: activeIdx,
        scheduledAt: _scheduledAt,
        durationMinutes: 30,
      }, {
        onSuccess: () => {
          setScheduleDialogOpen(false);
          scheduleToCalMut?.mutateAsync?.({
            outputId: id, variantIndex: activeIdx,
            platform: _platform, scheduledAt: _scheduledAt,
          }).catch(() => {/* non-fatal */});
        },
      });
    } else {
      try {
        await scheduleToCalMut?.mutateAsync?.({
          outputId: id, variantIndex: activeIdx,
          platform: _platform, scheduledAt: _scheduledAt,
        });
        setScheduleDialogOpen(false);
        navigate("/calendar");
      } catch {
        // error toast already shown by scheduleToCalMut.onError
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedMode, schedPlatform, scheduleAt, seriesAnchorDate, id, activeIdx, data, variants, postDates, isMultiDayTask, scheduleMut, scheduleToCalMut, navigate, lang]);

  // ── Bulk .ics export (calendar-type tasks only) ──────────────────────────
  const handleBulkIcsExport = React.useCallback(() => {
    const esc = (s: string) => String(s ?? "")
      .replace(/\\/g, "\\\\").replace(/;/g, "\\;")
      .replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
    const ev: string[] = [];
    let eventCount = 0;
    variants.forEach((v: any, i: number) => {
      const m = /(\d{4})\/(\d{2})\/(\d{2})/.exec(String(v.label ?? ""));
      if (!m) return;
      eventCount++;
      const ymd = `${m[1]}${m[2]}${m[3]}`;
      const next = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1);
      const ymdEnd = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, "0")}${String(next.getDate()).padStart(2, "0")}`;
      const summary = String(v.label ?? "").replace(/^\d{4}\/\d{2}\/\d{2}\s*·\s*/, "");
      ev.push(
        "BEGIN:VEVENT",
        `UID:${id}-${i}@onbrand.sowork.ai`,
        `DTSTART;VALUE=DATE:${ymd}`,
        `DTEND;VALUE=DATE:${ymdEnd}`,
        `SUMMARY:${esc(((data as any)?.brand?.name ? (data as any).brand.name + " · " : "") + summary)}`,
        `DESCRIPTION:${esc(v.caption ?? "")}`,
        "END:VEVENT",
      );
    });
    if (ev.length === 0) {
      showToastGlobal(lang === "en" ? "No dated posts to export" : "沒有可匯出的日期貼文");
      return;
    }
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0",
      "PRODID:-//OnBrand//Content Calendar//ZH",
      "CALSCALE:GREGORIAN", ...ev, "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `content-calendar-${id}.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToastGlobal(lang === "en"
      ? `Exported ${eventCount} posts — drop the .ics into your calendar`
      : `已匯出 ${eventCount} 篇 — 拖進日曆 App 即可`);
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
    const ov = overrides[safeIdx];
    return ov ? { ...base, caption: ov.caption } : base;
  }, [variants, activeIdx, overrides]);

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
        ? `開頭 3 秒（開場鉤）：${subject} —— 鏡頭抓住一個吸睛瞬間。\n` +
          `中段（10-20 秒）：產品 / 場景特寫 + 一個具體動作（手部、表情、物件接觸）。\n` +
          `結尾（3-5 秒）：字卡呼應文案核心，3-8 字。可配「定格 + 留白」收尾。\n` +
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
    // 100s→99s rename compat: server already normalizes output.getById,
    // but a legacy "fb-100-…" id reaching here from any other path must
    // still resolve to the renamed mockup/prefix logic. Inline + idempotent.
    const taskId = (data?.mission?.taskId ?? "").replace(/^([a-z]+)-100-/, "$1-99-");

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

    // ── Layer 1: taskId prefix → platform/format (richest mapping) ──
    const idPrefixMap: Record<string, string> = {
      fb: "facebook", ig: "instagram", yt: "youtube", tt: "tiktok",
      li: "linkedin", em: "email", pr: "press",
    };
    const formatFromTaskId = (id: string): string => {
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
      if (id.includes("comment")) return "comment";
      if (id.includes("pinned")) return "pinned";
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
    if (/已釘選|釘選主文|^釘選/i.test(lbl)) return v("facebook", "pinned");
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
  }, [mockupVariant, slide?.label, data?.mission?.taskId]);

  if (!id || isNaN(id)) {
    return <div className="p-12 text-center text-default-500">{lang === "en" ? "Invalid run ID" : "無效的 run ID"}</div>;
  }
  if (isLoading) {
    return <div className="p-12 flex justify-center"><Spinner size="lg" /></div>;
  }
  if (error || !data) {
    return (
      <div className="p-12 flex flex-col items-center gap-3 text-default-500">
        <p>{lang === "en" ? "Run not found (it may have been removed or you don't have access)" : "找不到這個 run（可能已被移除或無權限）"}</p>
        <Button variant="flat" onPress={() => navigate("/projects")}>{lang === "en" ? "Back to Projects" : "回專案"}</Button>
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
              title={String((data as any).mission.title ?? "")}
            >
              {String((data as any).mission.title ?? "")}
            </button>
          </>
        )}
        <span className="text-default-300">›</span>
        <span className="text-default-700 font-medium">
          {lang === "en" ? `Version #${(data as any)?.version ?? 1}` : `版本 #${(data as any)?.version ?? 1}`}
        </span>
      </div>

      {/* 2026-05-14 (async polling): progress banner — only shown when the
          orchestra wrote captions early and is still working on images/QA */}
      {(() => {
        const p = (data as any)?.progress;
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
          title={currentEmailSubject ? `主旨：${currentEmailSubject}` : (data.title || data.mission?.taskLabel || "")}
        >
          {(() => {
            // For email tasks: show current slide's email subject (updates on tab switch)
            const raw = currentEmailSubject
              ? `主旨：${currentEmailSubject}`
              : data.title || data.mission?.taskLabel || (lang === "en" ? "(Untitled)" : "(無標題)");
            const cps = Array.from(raw);
            return cps.length > 40 ? cps.slice(0, 38).join("") + "…" : raw;
          })()}
        </p>
        {/* DEBUG (2026-05-09): show mockup variant + taskId so we can trace
            which mockup is being chosen. Remove after verification. */}
        <Chip size="sm" variant="flat" className="font-mono text-[10px]">
          {effectiveVariant ? `${effectiveVariant.platform}:${effectiveVariant.format}` : "?"} · {data.mission?.taskId ?? "no-task"}
        </Chip>
        {/* 2026-07-17 (CJ): deliverable label, not duration — tier is internal config */}
        {data.mission?.tier && (
          <Chip size="sm" variant="flat" color="secondary">
            {data.mission.tier === "60s" ? (lang === "en" ? "Pack" : "套組")
              : data.mission.tier === "99s" ? (lang === "en" ? "Campaign" : "企劃")
              : (lang === "en" ? "Single" : "單篇")}
          </Chip>
        )}
        <Chip size="sm" variant="flat" color={data.status === "published" ? "success" : data.status === "scheduled" ? "warning" : "default"}>
          {data.status}
        </Chip>
        <CraftChip taskId={data.mission?.taskId} en={lang === "en"} />
      </div>

      {/* ─── Variant pills (horizontal) ─────────────────────────────── */}
      {variants.length > 1 && (() => {
        // Pool mode: >4 variants → progressive reveal (headline pool).
        // ≤4 → show all (normal multi-variant task, unchanged behavior).
        const pool = variants.length > 4;
        const shown = pool ? Math.min(revealCount, variants.length) : variants.length;
        const more = variants.length - shown;
        return (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className="text-[10px] text-default-500 mr-1">
              {pool
                ? (lang === "en" ? "Headlines:" : "標題：")
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
                {v.label}
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
        {/* CENTER: pure mockup, no toolbar above (CJ direction 2026-05-09) */}
        <section className="min-w-0 flex flex-col gap-3">
          <div ref={mockupRef} className="relative bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden">
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
                    <p className="text-tiny text-default-400 max-w-xs">
                      {lang === "en"
                        ? "Copy is done — images are rendering. The full post (copy + image) will appear here automatically (~30-60s)."
                        : "文案已完成，圖片生成中。完整貼文（文案＋圖片）會在這裡自動顯示（約 30-60 秒）"}
                    </p>
                  </div>
                );
              }
              return effectiveVariant && slide ? (
              <>
              {isComponentTask && (
                <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2">
                  <span className="text-small leading-none pt-0.5">🧩</span>
                  <p className="text-tiny text-primary-800 leading-relaxed">
                    {componentSlot
                      ? (lang === "en"
                          ? "Component task: your deliverable is rendered in its real ad slot below (purple highlight). Dashed gray areas are NOT produced by this task. Switch the version pills above to compare angles."
                          : "元件任務：交付物已放進下方版型的實際位置（紫色標記處）；灰色虛線區塊非本任務產出。切換上方版本標籤比較不同切角。")
                      : (lang === "en"
                          ? "Component task: each version is ONE short, copy-ready line (e.g. ad headline / description / button text) — not a full post. Switch the version pills above to compare angles; the post frame is just placement context."
                          : "元件任務：每個版本是「一條」可直接複製使用的短句（廣告標題／描述／按鈕文字等），本來就不是完整貼文。切換上方版本標籤比較不同切角；貼文外框只是示意擺放位置。")}
                  </p>
                </div>
              )}
              <PlatformMockup
                variant={{ ...effectiveVariant, label: `${effectiveVariant.label} · ${slide.label}` }}
                title={data.title ?? ""}
                brief={""}
                brandName={(data as any).product?.name ?? data.brand?.name ?? ""}
                brandLogoUrl={(data as any).product?.logoUrl ?? data.brand?.logoUrl ?? null}
                liveCaption={slide.caption}
                liveHashtags={slide.hashtags}
                liveImageStyle={slide.imageStyle}
                liveImageUrl={slide.imageUrl ?? undefined}
                liveImageStatus={slide.imageStatus as any}
                liveCards={slide.cards as any}
                overlayTitle={mockupVariant?.platform === "youtube" ? overlayTitle : undefined}
                onGenerateImage={() => { manualImageRef.current = true; setMode("image"); }}
                componentSlot={componentSlot}
              />
              </>
              ) : null;
            })()}
            {/* 2026-05-18 (CJ「下載圖示出現在圖片某個地方就好」): a small
                download ICON floating over the mockup (top-right), instead
                of a separate button below. fetch→blob forces a real save
                (cross-origin PiAPI/storage); falls back to a new tab. */}
            {slide?.imageUrl && slide?.imageStatus === "ready" && (
              <button
                title={lang === "en" ? "Download image" : "下載圖片"}
                aria-label={lang === "en" ? "Download image" : "下載圖片"}
                onClick={async () => {
                  const url = slide.imageUrl as string;
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
                style={{ background: "rgba(31,42,77,0.88)", color: "#fff", backdropFilter: "blur(2px)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            )}
          </div>
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
                style={{ background: "#1f2a4d" }}
              >
                {lang === "en" ? "Copy full text" : "複製全文"}
              </button>
              <button
                onClick={exportSlidePng}
                disabled={exporting}
                className="px-4 py-2 rounded-lg text-tiny font-semibold border disabled:opacity-60"
                style={{ borderColor: "#1f2a4d", color: "#1f2a4d" }}
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
                style={{ borderColor: "#1f2a4d", color: "#1f2a4d" }}
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
                    {lang === "en" ? "12 Video Titles — click to generate script" : "12 支影片 title — 點選產出腳本"}
                  </span>
                  <span className="text-tiny text-default-400">{rows.length} 支</span>
                </div>
                <div className="divide-y divide-default-100">
                  {rows.map((row, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-default-50 transition group">
                      <span className="text-default-400 text-tiny font-mono w-5 shrink-0">{row.num}</span>
                      <span className="flex-1 text-small text-default-800 leading-snug">{row.title}</span>
                      <button
                        onClick={() => {
                          setScriptModalTitle(row.title);
                          setGeneratedScript(null);
                          setScriptCopied(false);
                        }}
                        className="shrink-0 px-2.5 py-1 rounded-lg text-tiny font-semibold border border-secondary/40 text-secondary opacity-0 group-hover:opacity-100 transition hover:bg-secondary/5"
                      >
                        {lang === "en" ? "📝 Script" : "📝 腳本"}
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
              onClose={() => { setScriptModalTitle(null); setGeneratedScript(null); }}
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
                      <p className="text-small text-default-600 max-w-sm">
                        {lang === "en"
                          ? "Generate a full shooting script. Includes an opening hook, 3–5 main points, and a closing call to action."
                          : "為這支影片 title 產出完整拍攝腳本，包含開場鉤、主體論點（3–5個）、收尾行動呼籲。"}
                      </p>
                      <Button
                        color="secondary"
                        onPress={() => {
                          if (!scriptMut) return;
                          scriptMut.mutate({
                            videoTitle: scriptModalTitle,
                            titleContext: slide?.caption ?? undefined,
                            brandId: data?.brand?.id ?? undefined,
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
                        {scriptCopied ? (lang === "en" ? "✓ Copied" : "✓ 已複製") : (lang === "en" ? "Copy script" : "複製腳本")}
                      </Button>
                      <Button
                        variant="flat"
                        size="sm"
                        onPress={() => {
                          setGeneratedScript(null);
                          setScriptCopied(false);
                          if (scriptMut) {
                            scriptMut.mutate({
                              videoTitle: scriptModalTitle!,
                              titleContext: slide?.caption ?? undefined,
                              brandId: data?.brand?.id ?? undefined,
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
                    onPress={() => { setScriptModalTitle(null); setGeneratedScript(null); }}
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
        <aside className="space-y-3 sticky top-2 self-start">
          {/* Toolbar — clicking a button switches mode + the panel below
              expands to show that tool. */}
          <div className="bg-white rounded-xl border border-default-200 shadow-sm">
            <div className="flex items-center gap-0.5 px-2 py-1.5 flex-wrap">
              <ToolbarBtn icon={Pencil}        label={lang === "en" ? "Edit text" : "直接編輯"}      active={mode==="edit"}  onClick={() => setMode("edit")} />
              <ToolbarBtn icon={MessageCircle} label={lang === "en" ? "Chat with AI" : "跟 AI 專家對話"} active={mode==="chat"}  onClick={() => setMode("chat")} />
              {hasImageSlot && (
                <ToolbarBtn icon={LucideImage}   label={lang === "en" ? "Redo image" : "改圖"}          active={mode==="image"} onClick={() => setMode("image")} />
              )}
              {/* 2026-05-12 (CJ「影片功能我想要先拿掉，現在看起來不穩」):
                  hide 改影片 entry. The /trpc/video.* router still exists
                  so existing video jobs continue to render, but new
                  generation entry point is closed until stability work. */}
              {/* <ToolbarBtn icon={Video}         label={lang === "en" ? "Redo video" : "改影片"}        active={mode==="video"} onClick={() => setMode("video")} /> */}
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
                    return <Avatar src={av || `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(name ?? "Caption")}`} className="w-7 h-7" />;
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
                    return <Avatar src={av || `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(name ?? "Visual")}`} className="w-7 h-7" />;
                  })()}
                </button>
              </Tooltip>
              <Divider />
              <ToolbarBtn icon={Wand2}         label={lang === "en" ? "Rewrite this" : "重生這段"}       active={mode==="regen"}    onClick={() => setMode("regen")} />
              {/* 2026-07-07 (CJ「參數儀表板客戶看不懂 → 換成選不同 agent 重寫」) */}
              <ToolbarBtn icon={LucideUsers}   label={lang === "en" ? "Rewrite by agent" : "換人重寫"}   active={mode==="rewrite"}  onClick={() => setMode("rewrite")} />
              <Divider />
              <ToolbarBtn icon={LucideCopy}    label={lang === "en" ? "Copy caption" : "複製文案"}       onClick={onCopy} highlight={copied} />
              {/* 2026-05-11 (CJ feedback「存 Mission 不要出現在工具列，只要在下方」):
                  publish card 已經有「存到 Mission」按鈕，工具列這個是重複，砍掉。 */}
              {/* 2026-05-11 (CJ「這個功能可以晚一點再上，先處理別的」):
                  範本收藏 / 市集功能暫緩到 P1 後 — 等 insights 回饋系統做完
                  才能設計品質門檻。Button 暫時拿掉，schema + endpoints 保留。
                  設計留在 docs/template-marketplace-design.md。 */}
              {/* <ToolbarBtn icon={LucideShare} label="存為我的模板" onClick={() => setShareModal(true)} /> */}
              <Divider />
              <Tooltip content={lang === "en" ? "Re-run task" : "重跑同任務"} placement="bottom">
                <button
                  onClick={() => {
                    const taskId = data.mission?.taskId;
                    if (!taskId) { showToastGlobal(lang === "en" ? "Original task ID not found" : "找不到原任務 ID"); return; }
                    // 2026-07-07 (CJ「重跑同任務 404」): tier routes (/30s
                    // /60s /99s) were removed 2026-05-27 when tasks went
                    // platform-first — this still navigated to /${tier} and
                    // landed on the 404 page. Map the mission's workspace to
                    // the /tasks/:platform slug instead; PlatformTaskPage
                    // already understands ?rerun=<outputId>.
                    const ws = String(data.mission?.workspace ?? "").toLowerCase();
                    const slug =
                      ws.includes("instagram") ? "ig" :
                      ws.includes("linkedin")  ? "li" :
                      ws.includes("youtube")   ? "yt" :
                      ws.includes("tiktok")    ? "tt" :
                      ws.includes("email")     ? "email" :
                      (ws.includes("press") || ws.includes("pr")) ? "pr" :
                      "fb";
                    navigate(`/tasks/${slug}?rerun=${id}`);
                  }}
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
          <Card>
            <CardBody className="space-y-3">
              {mode === "chat" && (
                <>
                  <p className="text-tiny font-semibold">{lang === "en" ? "Tell the AI specialist what to change" : "跟 AI 專家改文案"}</p>
                  <p className="text-[11px] text-default-500 leading-relaxed">
                    {lang === "en"
                      ? "Tell the agent how to adjust it — e.g. \"end with a limited-time offer\" or \"too wordy, cut the second paragraph\"."
                      : "告訴 AI 專家你想怎麼調整：例如「結尾改成限時優惠」、「太囉嗦砍第二段」。"}
                  </p>
                  {chatHistory.length > 0 && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto bg-default-50 rounded-lg p-2">
                      {chatHistory.slice(-4).map((m, i) => (
                        <div key={i} className={`text-[11px] leading-relaxed ${m.role==="user" ? "text-default-900" : "text-secondary"}`}>
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
                    <div className="text-[11px] bg-secondary-50 border border-secondary-200 rounded-lg p-2 space-y-1.5">
                      <p className="font-semibold text-secondary-700">{lang === "en" ? "AI rewrite preview" : "AI 改寫預覽"}</p>
                      <p className="whitespace-pre-wrap leading-relaxed text-default-800 max-h-32 overflow-y-auto">{aiPreview}</p>
                      <div className="flex gap-1.5 pt-1">
                        <Button size="sm" color="secondary"
                          isDisabled={updateMut.isPending}
                          onPress={() => {
                            setOverrides(o => ({ ...o, [activeIdx]: { caption: aiPreview } }));
                            updateMut.mutate({ id, variantIndex: activeIdx, caption: aiPreview });
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
                            { role: "assistant", content: r.explanation || (lang === "en" ? "(rewritten)" : "(已改寫)") },
                          ]);
                          setAiPreview(r.rewritten);
                          setChatPrompt("");
                        } else {
                          showToastGlobal(
                            lang === "en"
                              ? `AI rewrite failed: ${typeof r.error === "string" ? r.error : "unknown error"}`
                              : `AI 改寫失敗：${typeof r.error === "string" ? r.error : "未知錯誤"}`
                          );
                        }
                      } catch (e: any) {
                        showToastGlobal(
                          lang === "en" ? `Error: ${e.message ?? String(e)}` : `錯誤：${e.message ?? String(e)}`
                        );
                      }
                    }}
                  >
                    {lang === "en" ? "Send changes" : "送出修改"}
                  </Button>
                </>
              )}
              {mode === "edit" && (
                <>
                  <p className="text-tiny font-semibold">{t("run_mode_edit")}</p>
                  <p className="text-[10px] text-default-500">
                    {lang === "en" ? "Edit here — the mockup updates live." : "在這裡改文字，左邊預覽即時更新。"}
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
                    >{t("run_save_btn")}</Button>
                    <Button
                      variant="flat"
                      isDisabled={editText == null}
                      onPress={() => {
                        setEditText(null);
                        setOverrides(o => { const n = { ...o }; delete n[activeIdx]; return n; });
                      }}
                    >{t("run_revert")}</Button>
                  </div>
                </>
              )}
              {mode === "image" && (
                <>
                  <p className="text-tiny font-semibold">{t("run_mode_image")}</p>
                  {/* 2026-07-07 (CJ「產圖畫面有不是國字的國字」→ 圖改為無字背景，
                      標題文字改成用戶可編輯的疊層。只在 YT（縮圖有標題）顯示。 */}
                  {mockupVariant?.platform === "youtube" && (
                    <div className="bg-warning-50 border border-warning-200 rounded-lg p-2.5 space-y-1.5">
                      <label className="block text-tiny font-semibold text-warning-800">
                        {lang === "en" ? "Thumbnail title (overlaid on the image)" : "縮圖標題文字（疊在圖片上）"}
                      </label>
                      <input
                        type="text"
                        value={overlayTitle}
                        onChange={(e) => setOverlayTitle(e.target.value.slice(0, 60))}
                        placeholder={lang === "en" ? "e.g. 3 signs your kid isn't just picky" : "例：孩子挑食的 3 個警訊"}
                        maxLength={60}
                        className="w-full text-sm border border-warning-300 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:border-warning-500"
                      />
                      <p className="text-[10px] text-warning-700 leading-relaxed">
                        {lang === "en"
                          ? "AI can't render Chinese cleanly, so the image is generated text-free. Type your real title here — it overlays on the thumbnail and is included in the templated download."
                          : "AI 無法正確畫中文，所以圖片刻意產成無字背景。真正的標題在這裡打 — 會疊在縮圖上，並包含在「帶版型下載」裡。"}
                      </p>
                    </div>
                  )}
                  {/* 2026-05-11 (CJ feedback「應該要先給用戶指令」):
                      明確分兩步 — Step 1 寫指令 → Step 2 產圖。
                      底下圖片變成「目前的圖」獨立區塊，不混在 prompt 裡 */}
                  <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-2 text-[11px] text-secondary-700">
                    {lang === "en"
                      ? "Step 1: Describe the image you want (or adjust the current prompt)"
                      : "Step 1：先告訴我你想要什麼樣的圖（或調整現有 prompt）"}
                  </div>
                  <Textarea
                    label={lang === "en" ? "Image prompt" : "圖片指令（prompt）"}
                    placeholder={lang === "en"
                      ? "e.g. Sunlight on a warm wooden table, a steaming bowl of soup, soft-focus background with a homey feel"
                      : "例：陽光灑落在溫暖木桌上，一碗冒著煙的健力湯，柔焦背景帶有家庭溫度"}
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    minRows={3}
                    maxRows={6}
                    description={lang === "en"
                      ? "We'll auto-apply your brand's colors / style / tone. The more specific you are, the closer to what you want."
                      : "會自動帶入品牌的色彩 / 風格 / 調性脈絡。寫越具體圖越貼近你要的"}
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
                      onPress={() => {
                        captionToPromptMut.mutate({
                          brandId: data.brand!.id,
                          caption: variants[activeIdx].caption,
                          channel: (
                            mockupVariant?.platform === "facebook"  ? "fb" :
                            mockupVariant?.platform === "instagram" ? "ig" :
                            mockupVariant?.platform === "linkedin"  ? "linkedin" :
                            mockupVariant?.platform === "youtube"   ? "youtube" :
                            mockupVariant?.platform === "tiktok"    ? "tiktok" :
                            undefined
                          ) as any,
                          imageStyle: variants[activeIdx]?.imageStyle ?? undefined,
                        });
                      }}
                    >
                      {captionToPromptMut.isPending
                        ? (lang === "en" ? "Generating…" : "產生中…")
                        : (lang === "en" ? "✨ Auto-generate prompt from this post" : "✨ 根據這篇文案自動產生圖片指令")}
                    </Button>
                  )}

                  {/* 2026-05-12 Phase 1 (CJ「prompt library 整合」):
                      Nano-Banana 175 商業攝影 prompt 範本。先選類別 → 列表
                      → 點 card 套用到 prompt textarea。 */}
                  <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-2 text-[11px] text-secondary-700 mt-2">
                    {lang === "en"
                      ? "Step 2 (optional): Start from a commercial-photography template"
                      : "Step 2（選填）：用商業攝影範本當起點"}
                  </div>
                  <label className="block text-tiny text-default-600 -mb-1">{lang === "en" ? "Template category" : "範本類別"}</label>
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
                                  captionToPromptMut.mutate({
                                    brandId,
                                    caption: activeCaption,
                                    channel: channelVal,
                                    imageStyle: styleHint,
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
                                lang === "en" ? `Couldn't apply template: ${e?.message ?? e}` : `套用失敗：${e?.message ?? e}`
                              );
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
                  {/* 2026-07-25 (CJ): real-product compositing — the actual
                      IRIS/Iris Girls photo instead of an AI-imagined product. */}
                  {runProductImages.length > 0 && (
                    <div className="rounded-lg border border-default-200 bg-default-50 px-3 py-2.5 mt-2">
                      <label className="flex items-center gap-2 cursor-pointer flex-wrap">
                        <input
                          type="checkbox"
                          checked={useRealProduct}
                          onChange={(e) => {
                            setUseRealProduct(e.target.checked);
                            if (e.target.checked && !pickedRunProduct) setPickedRunProduct(runProductImages[0] ?? null);
                          }}
                        />
                        <span className="text-tiny font-semibold">📦 {lang === "en" ? "Use real product photo" : "使用真實產品圖"}</span>
                        <span className="text-[10px] text-default-500">
                          {lang === "en"
                            ? "Composites the actual product (Nano Banana; model picker below is ignored)"
                            : "把真實產品原貌合成進場景 — 自動用 Nano Banana 保真模型，下方模型選擇不適用"}
                        </span>
                      </label>
                      {useRealProduct && (
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {runProductImages.slice(0, 12).map((p) => (
                            <button
                              key={p.productId}
                              onClick={() => setPickedRunProduct(p)}
                              title={p.name}
                              className={`w-12 h-12 rounded-md overflow-hidden border-2 transition ${
                                pickedRunProduct?.productId === p.productId ? "border-secondary" : "border-transparent hover:border-default-300"
                              }`}
                            >
                              <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                            </button>
                          ))}
                          {pickedRunProduct && (
                            <span className="text-[10px] text-default-600 self-center ml-1 truncate max-w-[160px]">{pickedRunProduct.name}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-2 text-[11px] text-secondary-700 mt-2">
                    {lang === "en"
                      ? "Step 3: Pick a model (each is best for a different style)"
                      : "Step 3：選用哪個模型（不同模型擅長不同風格）"}
                  </div>
                  <label className="block text-tiny text-default-600 -mb-1">{lang === "en" ? "AI model" : "AI 模型"}</label>
                  <select
                    value={imageModel}
                    onChange={(e) => setImageModel(e.target.value)}
                    disabled={realProductMode}
                    className="w-full text-xs border border-default-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-secondary disabled:opacity-50"
                  >
                    <option value="auto">{lang === "en" ? "Auto (default)" : "自動（預設）"}</option>
                    <option value="flux-schnell">{lang === "en" ? "Fast — Flux Schnell (5-10s)" : "快速 — Flux Schnell（5-10 秒）"}</option>
                    <option value="gpt-image-2">{lang === "en" ? "Best — GPT Image-2 (20-30s, OpenAI latest)" : "最佳 — GPT Image-2（20-30 秒，OpenAI 最新）"}</option>
                    <option value="gpt-image-1">{lang === "en" ? "Photo-real — GPT Image-1 (15-25s)" : "寫實 — GPT Image-1（15-25 秒）"}</option>
                    <option value="flux-realism">{lang === "en" ? "Photographic — Flux Realism (15-30s)" : "攝影感 — Flux Realism（15-30 秒）"}</option>
                    <option value="ideogram-v3">{lang === "en" ? "With text — Ideogram V3 (best in-image text)" : "含文字 — Ideogram V3（圖中文字最強）"}</option>
                    <option value="imagen-3">Google Imagen 4</option>
                  </select>
                  <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-2 text-[11px] text-secondary-700 mt-2">
                    {lang === "en"
                      ? "Step 4: Hit the button to make a new image (replaces the current one)"
                      : "Step 4：按下面按鈕，會用你的指令重新產圖（蓋掉目前的圖）"}
                  </div>
                  <Button
                    color="secondary" fullWidth
                    isLoading={imageGenMut.isPending}
                    isDisabled={imageGenMut.isPending || !imagePrompt.trim() || !data.brand?.id}
                    onPress={() => {
                      if (!data.brand?.id) {
                        showToastGlobal(
                          lang === "en"
                            ? "This run isn't linked to a brand, can't generate"
                            : "此 run 沒有綁定品牌，無法產圖"
                        );
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
                        ...(realProductMode ? { subjectImageUrl: pickedRunProduct!.imageUrl } : {}),
                      });
                    }}
                  >
                    {imageGenMut.isPending
                      ? (lang === "en" ? "Generating… (~15-30s)" : "產圖中…（約 15-30s）")
                      : t("run_image_make")}
                  </Button>
                  {!data.brand?.id && (
                    <p className="text-[10px] text-warning-700">⚠ {lang === "en" ? "This run has no brand — link a brand first" : "此 run 沒有 brand，請先綁品牌再產圖"}</p>
                  )}
                </>
              )}
              {mode === "video" && (
                <>
                  <p className="text-tiny font-semibold">{lang === "en" ? "Generate storyboard" : "生成影片故事板"}</p>
                  {/* 2026-05-12 (CJ「我要改成只給腳本 — C」):
                      Storyboard mode = 腳本 + 每個 scene 配 Flux 參考圖。
                      用戶可拿這份 brief 自己拍 / 給拍攝團隊。 */}
                  <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-2 text-[11px] text-secondary-700">
                    {lang === "en"
                      ? "Step 1: Describe what the video should show (we'll also use this caption as context)"
                      : "第 1 步：寫影片想呈現什麼（會自動帶入這篇的文案當補充）"}
                  </div>
                  <Textarea
                    label={lang === "en" ? "Video brief" : "影片指令"}
                    placeholder={lang === "en"
                      ? "e.g. Open with a 3-sec kitchen hook, then a closeup of steaming soup, with the title card 'Too busy? Get protein anyway'"
                      : "例：開頭 3 秒抓住觀眾的廚房畫面，接著鏡頭帶到一碗冒煙的健力湯，配上「忙到沒時間，也能餐餐補蛋白」的字卡"}
                    value={imagePrompt /* 重用 imagePrompt 也存影片指令 */}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    minRows={3}
                    maxRows={6}
                    description={lang === "en"
                      ? "Can be blank — we'll use this variant's caption as the topic"
                      : "可空白 — 留空就用此變體的文案當題目"}
                    autoFocus
                  />
                  <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-2 text-[11px] text-secondary-700">
                    {lang === "en"
                      ? "Step 2: Pick video length"
                      : "Step 2：選影片長度（決定分鏡數量）"}
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
                    {lang === "en"
                      ? "Step 3: Generate storyboard (~1 min — script + one reference image per scene)"
                      : "Step 3：生成故事板（約 1 分鐘 — 腳本 + 每個 scene 一張參考圖）"}
                  </div>
                  <Button
                    color="secondary" fullWidth
                    isLoading={videoGenMut.isPending}
                    isDisabled={videoGenMut.isPending || !slide?.caption?.trim()}
                    onPress={() => {
                      const topic = (imagePrompt.trim() || (slide?.caption ?? "").slice(0, 200)).trim();
                      if (!topic) {
                        showToastGlobal(
                          lang === "en"
                            ? "Fill in the video brief, or pick a variant that has a caption"
                            : "請先填影片指令，或這個版本要有文案"
                        );
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
                    {videoGenMut.isPending
                      ? (lang === "en" ? "Starting…" : "啟動中…")
                      : t("run_video_make", { n: videoDuration })}
                  </Button>
                  {videoJobId && (
                    <div className="bg-default-50 rounded-lg p-2.5 text-[11px] space-y-2 border border-secondary-200 mt-2">
                      <p className="font-semibold flex items-center gap-2">
                        {lang === "en" ? `Storyboard #${videoJobId}` : `故事板 #${videoJobId}`}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                          videoStatus?.status === "completed" ? "bg-success-100 text-success-800" :
                          videoStatus?.status === "failed" ? "bg-danger-100 text-danger-800" :
                          "bg-warning-100 text-warning-800"
                        }`}>{videoStatusLabel}</span>
                      </p>
                      {videoStatus?.status === "failed" && (
                        <p className="text-[11px] text-danger-700 leading-relaxed">
                          {typeof videoStatus?.errorMessage === "string" ? videoStatus.errorMessage : (lang === "en" ? "Unknown error" : "未知錯誤")}
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
                                  {lang === "en"
                                    ? "(Reference image not generated / failed)"
                                    : "（此 scene 參考圖尚未產出 / 失敗）"}
                                </div>
                              )}
                              <div className="p-2 space-y-1">
                                <p className="text-[10px] font-semibold text-secondary-700">
                                  Scene {i + 1} · {typeof scene.durationSec === "number" ? scene.durationSec : (scene.durationSec ?? "?")}s · {typeof scene.cameraMove === "string" ? scene.cameraMove : "static"}
                                </p>
                                <p className="text-[11px] text-default-700 leading-snug">
                                  <span className="text-default-500">{lang === "en" ? "Visual: " : "畫面："}</span>{typeof scene.visualPrompt === "string" ? scene.visualPrompt : ""}
                                </p>
                                <p className="text-[11px] text-default-700 leading-snug">
                                  <span className="text-default-500">{lang === "en" ? "Voiceover: " : "旁白："}</span>{typeof scene.narration === "string" ? scene.narration : ""}
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
                              `${lang === "en" ? "Visual" : "畫面"}: ${s.visualPrompt}\n` +
                              `${lang === "en" ? "Voiceover" : "旁白"}: ${s.narration}\n`
                            ).join("\n");
                            navigator.clipboard.writeText(text);
                            showToastGlobal(lang === "en" ? "Script copied" : "已複製腳本");
                          }}
                        >{lang === "en" ? "Copy full script" : "複製整份腳本"}</Button>
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
                const focusedAgName = focusedAg?.name ?? (focusedAgent === "image"
                  ? (lang === "en" ? "Visual AI" : "視覺 AI 專家")
                  : (lang === "en" ? "Caption agent" : "撰寫者"));
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
                        <p className="text-[10px] text-default-500 font-medium">{lang === "en" ? `Execution timeline (total ${(totalMs/1000).toFixed(1)}s)` : `執行流程（總耗時 ${(totalMs/1000).toFixed(1)}s）`}</p>
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
                      <p className="text-[11px] text-default-500 italic">{lang === "en" ? "No stage timeline for this run (older output)" : "這筆紀錄沒有 stage timeline（舊版產出）"}</p>
                    )}
                    {/* Per-agent contextual content */}
                    <div className="bg-default-50 rounded-lg p-2.5 text-[11px] leading-relaxed space-y-1.5 max-h-56 overflow-y-auto">
                      {focusedAgent === "image" ? (
                        <>
                          <p className="font-semibold">{lang === "en" ? "Image brief for this version:" : "本版本配圖指引："}</p>
                          <p className="whitespace-pre-wrap text-default-800">
                            {slide?.imageStyle || (lang === "en" ? "(This task has no image brief)" : "（這個任務沒有配圖指引）")}
                          </p>
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
                    {md.fetchedUrl && (
                      <p className="text-[10px] text-default-500">
                        🔗 {lang === "en" ? "Reference fetched: " : "抓取參考："}<a href={md.fetchedUrl} target="_blank" rel="noreferrer" className="underline truncate inline-block max-w-[260px] align-bottom">{md.fetchedUrl}</a>
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
                  <p className="text-tiny font-semibold">{lang === "en" ? "Rewrite this version" : "重生這段文案"}</p>
                  <p className="text-[11px] text-default-500 leading-relaxed">
                    {lang === "en"
                      ? <>Have the same agent write this version again — &quot;{slide?.label ?? `Version ${activeIdx + 1}`}&quot;. The original is archived.</>
                      : <>讓同一位 AI 專家重新寫一次當前版本「{slide?.label ?? `版本 ${activeIdx + 1}`}」。原版會歸檔到歷史。</>}
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
                    {regenMut.isPending
                      ? (lang === "en" ? "Rewriting…" : "重生中…")
                      : (lang === "en" ? "Rewrite this version" : "立即重生這個版本")}
                  </Button>
                  <p className="text-[10px] text-default-400">
                    {lang === "en"
                      ? <>Will ask {(typeof data.metadata?.captionAgent === "object" ? data.metadata.captionAgent?.name : data.metadata?.captionAgent) ?? "the copywriter"} to rewrite version {activeIdx + 1}.</>
                      : <>將呼叫 {(typeof data.metadata?.captionAgent === "object" ? data.metadata.captionAgent?.name : data.metadata?.captionAgent) ?? "撰寫者"} 重新產出第 {activeIdx + 1} 個版本。</>}
                  </p>
                  {Array.isArray(data.metadata?.archivedVariants) && data.metadata.archivedVariants.length > 0 && (
                    <p className="text-[10px] text-default-500">
                      📚 {lang === "en"
                        ? `Rewritten ${data.metadata.archivedVariants.length} time(s) — history kept`
                        : `已重生 ${data.metadata.archivedVariants.length} 次（歷史保留）`}
                    </p>
                  )}
                </>
              )}
              {mode === "rewrite" && (
                <>
                  <p className="text-tiny font-semibold">{lang === "en" ? "Have another agent rewrite it" : "換一位 AI 專家重寫"}</p>
                  <p className="text-[11px] text-default-500 leading-relaxed">
                    {lang === "en"
                      ? "Pick a specialist below — they rewrite this caption in their own style. Nothing changes until you accept the preview."
                      : "挑一位不同風格的專家，用他的寫法重寫這篇文案。改完先給你預覽，按「採用」才會生效。"}
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
                          setRewriteBusy(a.name);
                          try {
                            const r = await refineMut.mutateAsync({
                              currentCaption: caption,
                              userFeedback: lang === "en" ? a.instructionEn : a.instruction,
                              agentName: a.name,
                              agentTitle: lang === "en" ? a.titleEn : a.title,
                              brandId: data.mission?.brandId ?? undefined,
                            });
                            if (r.ok) {
                              setRewritePreview({ agent: a.name, text: r.rewritten });
                            } else {
                              showToastGlobal(
                                lang === "en"
                                  ? `Rewrite failed: ${typeof r.error === "string" ? r.error : "unknown error"}`
                                  : `改寫失敗：${typeof r.error === "string" ? r.error : "未知錯誤"}`
                              );
                            }
                          } catch (e: any) {
                            showToastGlobal(lang === "en" ? `Error: ${e.message ?? String(e)}` : `錯誤：${e.message ?? String(e)}`);
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
                          <p className="text-[11px] text-default-500 truncate">{lang === "en" ? a.styleEn : a.style}</p>
                        </div>
                        {rewriteBusy === a.name && <Spinner size="sm" color="secondary" />}
                      </button>
                    ))}
                  </div>
                  {rewritePreview && (
                    <div className="text-[11px] bg-secondary-50 border border-secondary-200 rounded-lg p-2 space-y-1.5">
                      <p className="font-semibold text-secondary-700">
                        {lang === "en" ? `Rewritten by ${rewritePreview.agent}` : `${rewritePreview.agent} 的重寫版本`}
                      </p>
                      <p className="whitespace-pre-wrap leading-relaxed text-default-800 max-h-40 overflow-y-auto">{rewritePreview.text}</p>
                      <div className="flex gap-1.5 pt-1">
                        <Button size="sm" color="secondary"
                          isDisabled={updateMut.isPending}
                          onPress={() => {
                            setOverrides(o => ({ ...o, [activeIdx]: { caption: rewritePreview.text } }));
                            updateMut.mutate({ id, variantIndex: activeIdx, caption: rewritePreview.text });
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

          {/* 2026-06-01: FB page picker — shown after OAuth when brand has no saved page binding.
              After binding, schedules to calendar (unified flow) instead of direct publish. */}
          {fbPagePickerOpen && fbPages.length > 0 && (
            <Card className="border border-primary/40">
              <CardBody className="space-y-2">
                <p className="text-small font-semibold">{lang === "en" ? "Which Facebook page to bind?" : "要綁定哪個粉絲團？"}</p>
                <div className="space-y-1.5">
                  {fbPages.map((p) => (
                    <Button
                      key={p.id} fullWidth variant="flat" color="primary" size="sm"
                      isLoading={setBrandFbPageMut?.isPending}
                      onPress={async () => {
                        try {
                          await setBrandFbPageMut?.mutateAsync?.({ brandId: fbBrandId, fbPageId: p.id, fbPageName: p.name });
                          fbStatusQuery?.refetch?.();
                          setFbPagePickerOpen(false);
                          // After binding, schedule to calendar instead of direct publish
                          await handleScheduleToCalendar("facebook");
                        } catch (e: any) {
                          showToastGlobal(`Error: ${String(e?.message ?? e).slice(0, 100)}`);
                        }
                      }}
                    >
                      <span className="text-left w-full truncate">{p.name}{p.category ? ` · ${p.category}` : ""}</span>
                    </Button>
                  ))}
                </div>
                <Button size="sm" variant="light" fullWidth onPress={() => setFbPagePickerOpen(false)}>
                  {lang === "en" ? "Cancel" : "取消"}
                </Button>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardBody className="space-y-2 p-3">

              {/* ── 1. 送到行事曆 ─────────────────────────── */}
              <Button
                variant="flat" fullWidth
                startContent={<FontAwesomeIcon icon={faCalendarPlus} />}
                onPress={() => {
                  setSchedMode("calendar");
                  setScheduleDialogOpen(true);
                }}
              >
                {lang === "en" ? "Add to Calendar" : "送到行事曆"}
              </Button>

              {/* ── 3. 下載 .ics ──────────────────────────── */}
              <Button
                variant="flat" fullWidth
                startContent={<FontAwesomeIcon icon={faDownload} />}
                onPress={() => {
                  setSchedMode("ics");
                  setScheduleDialogOpen(true);
                }}
              >
                {lang === "en" ? "Download .ics" : "下載 .ics"}
              </Button>

              {/* Bulk export — calendar-type tasks only */}
              {(data?.mission?.taskId ?? "").includes("calendar") && variants.length > 1 && (
                <Button
                  variant="flat" fullWidth size="sm" color="secondary"
                  startContent={<FontAwesomeIcon icon={faCalendarPlus} />}
                  onPress={handleBulkIcsExport}
                >
                  {lang === "en" ? "Export all to calendar (.ics)" : "批量下載到行事曆（全部 .ics）"}
                </Button>
              )}

              {/* ── 4. 分享連結 ───────────────────────────── */}
              <Button
                variant="light" fullWidth size="sm"
                startContent={<FontAwesomeIcon icon={faShare} />}
                onPress={() => {
                  navigator.clipboard.writeText(window.location.href);
                  showToastGlobal(t("toast_link_copied"));
                }}
              >
                {lang === "en" ? "Share link" : "分享連結"}
              </Button>

              {/* Auto-save note — always true, no action needed */}
              <div className="text-[10px] text-default-400 text-center px-1 leading-relaxed">
                {lang === "en"
                  ? "✓ Auto-saved to Projects — no action needed"
                  : "✓ 任務完成即自動記錄到專案，無需手動儲存"}
              </div>

            </CardBody>
          </Card>
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
            <p className="text-tiny text-default-500">{lang === "en" ? "We'll include the full caption and brand context." : "寄出時會附上完整文案 + 品牌資訊。"}</p>
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
                  id, variantIndex: activeIdx,
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
              ? (lang === "en" ? "Add to Calendar" : "排程到行事曆")
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
                <p className="text-tiny text-default-500">
                  {isCountdownTask
                    ? (lang === "en"
                        ? "Posts are scheduled day-by-day counting down to the event date."
                        : "系統會自動從活動日期往前，每天一篇排好 5 天倒數。")
                    : (lang === "en"
                        ? "Posts are scheduled one per day starting from the first post date."
                        : "從第一篇日期開始，每天依序排一篇。")}
                </p>
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
                        <span className="font-medium text-default-700">{v.label ?? `Day ${i + 1}`}</span>
                        <span className="text-default-400">{dateStr}</span>
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
            {!isMultiDayTask || schedMode === "publish" ? (
              <p className="text-tiny text-default-500">
                {schedMode === "ics"
                  ? (lang === "en"
                    ? "Downloads a .ics file — drag into Google Calendar / Outlook / Apple Calendar."
                    : "產生 .ics 檔 — 拖進 Google Calendar / Outlook / Apple Calendar 即可。")
                  : schedMode === "calendar"
                  ? (lang === "en"
                    ? "Adds this post to Calendar. You can track it and publish from the Calendar page."
                    : "將此貼文加入日曆。確認後自動跳轉日曆頁面，可在那裡追蹤並一鍵發布。")
                  : (lang === "en"
                    ? `Schedules this post to ${schedPlatform}. After confirming you'll be taken to the Calendar page to publish.`
                    : `排程此貼文到 ${schedPlatform}。確認後跳轉行事曆頁面，可在那裡一鍵發布。`)}
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
  const { t, lang } = useLang();

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
            {lang === "en"
              ? "Share this output back to the community (+2 credits each time someone uses it)"
              : "把這個產出公開回饋給社群（被別人用一次 +2 credits）"}
          </p>
        </ModalHeader>
        <ModalBody className="space-y-3 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-default-600 mb-1">{lang === "en" ? "Title" : "標題"}</p>
            <Input
              size="sm"
              value={title}
              onValueChange={setTitle}
              placeholder={lang === "en"
                ? "e.g. Holiday limited-offer hook + CTA template"
                : "例：節慶限時優惠 hook + CTA 套版"}
              variant="flat"
            />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-default-600 mb-1">
              {lang === "en" ? "Description (when to use, why it works)" : "描述（用什麼情境、為什麼好用）"}
            </p>
            <Textarea
              size="sm"
              value={description}
              onValueChange={setDescription}
              minRows={3}
              placeholder={lang === "en"
                ? "e.g. Great for e-commerce 7-day countdown campaigns — hook leads with benefit, then time pressure"
                : "例：適合電商品牌做 7 天倒數活動，hook 先給好處再點時間限制"}
              variant="flat"
            />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-default-600 mb-1">
              {lang === "en"
                ? "Template content (replace brand-specific words with [variables] so others can plug in)"
                : "範本內容（你可以把品牌專屬字眼改成 [變數]，讓別人套用）"}
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
            <span className="font-semibold uppercase tracking-[0.18em] text-default-600">{lang === "en" ? "Visibility:" : "可見："}</span>
            <button
              className="px-2 py-1 rounded border text-xs"
              style={{
                borderColor: visibility === "public" ? "#171717" : "#D4D4D4",
                background: visibility === "public" ? "#171717" : "white",
                color: visibility === "public" ? "white" : "#404040",
              }}
              onClick={() => setVisibility("public")}
            >
              {lang === "en" ? "Public (in template library)" : "公開（出現在範本庫）"}
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
              {lang === "en" ? "Only people with the link" : "只給有連結的人"}
            </button>
          </div>
          <div className="text-[11px] text-default-600 bg-default-50 border border-default-200 rounded-md p-2 leading-relaxed">
            {lang === "en" ? (
              <>⚡ We don't share your brand name / audience / banned words — others get their own brand auto-applied. This template captures your <strong>structure and writing style</strong>, not your content data.</>
            ) : (
              <>⚡ 我們不會公開你的品牌名 / 受眾 / 禁忌詞 — 別人用時系統會自動套用他們的品牌。
              這份模板代表你的 <strong>結構與寫法</strong>，不是你的內容資料。</>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>{t("cancel")}</Button>
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
                showToastGlobal(
                  lang === "en"
                    ? `Published to template library (#${r?.id ?? "?"}) — +2 credits each time someone uses it ✓`
                    : `已發布到範本庫（#${r?.id ?? "?"}）— 被別人用一次 +2 credits ✓`
                );
                onClose();
                // /community retired 2026-05-14 — just close, no redirect.
              } catch (e: any) {
                showToastGlobal(
                  lang === "en" ? `Publish failed: ${e?.message ?? e}` : `發布失敗：${e?.message ?? e}`
                );
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {lang === "en" ? "Publish to library" : "發布到範本庫"}
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
