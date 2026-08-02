/**
 * PlatformTaskPage — platform-first navigation (2026-05-26).
 *
 * Route: /tasks/:platform  (platform = fb | ig | li | yt | tt | email | pr)
 *
 * Replaces the old 30s/60s/99s tier pages as the primary entry point.
 * Users pick the *platform* in the sidebar, then filter by complexity via
 * tabs inside this page:
 *   全部  |  一篇內容 · 30s  |  內容套組 · 60s  |  完整活動 · 99s
 *
 * Speed badges appear on every card so the timing expectation is clear
 * without requiring users to navigate tiers before seeing tasks.
 */
import React, { useMemo, useState, useEffect, useRef } from "react";
import { Navigate, useParams, useOutletContext, useNavigate, useSearchParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { useLang } from "../../lib/i18n";
import { showToastGlobal } from "../../components/ui/Toast";
import { matchTaskWithSynonyms } from "../lib/taskSearchSynonyms";
import type { ShellOutletCtx } from "../app/shell/ShellLayout";
import { buildContextChips, resolveDerive } from "../lib/taskContextResolver";
import {
  Avatar, Button, Card, CardBody, Chip, Input, Modal, ModalBody,
  ModalContent, ModalFooter, ModalHeader, Textarea,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt, faPaperPlane, faXmark, faMagnifyingGlass,
  faEnvelope, faBullhorn, faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";
import {
  faFacebookF, faInstagram, faYoutube, faTiktok, faLinkedinIn,
} from "@fortawesome/free-brands-svg-icons";
import RunningAgentCarousel from "../components/quickTask/RunningAgentCarousel";

// ── Recently used tasks helpers ─────────────────────────────────────────────
const LAST_USED_KEY = "onbrand_last_used_tasks_v1";
function recordTaskUsed(taskId: string) {
  try {
    const raw = localStorage.getItem(LAST_USED_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    map[taskId] = Date.now();
    localStorage.setItem(LAST_USED_KEY, JSON.stringify(map));
  } catch { /* non-fatal */ }
}
function getLastUsedDays(taskId: string): number | null {
  try {
    const raw = localStorage.getItem(LAST_USED_KEY);
    if (!raw) return null;
    const map: Record<string, number> = JSON.parse(raw);
    if (!map[taskId]) return null;
    return Math.floor((Date.now() - map[taskId]) / 86_400_000);
  } catch { return null; }
}

// ── Platform route mapping ───────────────────────────────────────────────────
// URL param → internal platform filter key (matches task.platform from listFB)
const ROUTE_TO_PLATFORM: Record<string, string> = {
  fb:    "facebook",
  ig:    "instagram",
  li:    "linkedin",
  yt:    "youtube",
  tt:    "tiktok",
  email: "email",
  pr:    "pr",
};

interface PlatformMeta {
  label: string;
  labelZh: string;
  icon: any;
  bg: string;
  heroZh: string;
  heroEn: string;
  subZh: string;
  subEn: string;
}

const PLATFORM_META: Record<string, PlatformMeta> = {
  facebook: {
    label: "Facebook", labelZh: "Facebook", icon: faFacebookF, bg: "#1877F2",
    heroZh: "讓每篇 Facebook 貼文，都有爆款的骨架",
    heroEn: "Every post has a proven structure — no more starting from scratch",
    subZh: "Clio 獲獎敘事公式 × 品牌定位鎖定，自然引發互動",
    subEn: "Narrative frameworks from award-winning campaigns, locked to your brand voice",
  },
  instagram: {
    label: "Instagram", labelZh: "Instagram", icon: faInstagram, bg: "#E4405F",
    heroZh: "文案 × 視覺指令同步產出，不再是漂亮圖片配隨便文字",
    heroEn: "Caption and visual brief in one run — never pieced together separately",
    subZh: "文案代理人 + 圖片指導代理人協作，輸出比競品深一層",
    subEn: "Caption agent and image director agent work in sync, every time",
  },
  linkedin: {
    label: "LinkedIn", labelZh: "LinkedIn", icon: faLinkedinIn, bg: "#0A66C2",
    heroZh: "不只是發文，是在 LinkedIn 建立你的專業話語權",
    heroEn: "Thought leadership that earns real attention — not just vanity metrics",
    subZh: "PR Strategist 代理人以記者邏輯構建你的觀點",
    subEn: "PR Strategist agent thinks like a journalist, writes like an executive",
  },
  youtube: {
    label: "YouTube", labelZh: "YouTube", icon: faYoutube, bg: "#FF0000",
    heroZh: "標題、章節、縮圖文案、結尾鉤子 — YouTube 影片完整佈局",
    heroEn: "Title, chapters, thumbnail brief, end hook — one run, done",
    subZh: "Strategist 規劃敘事弧，再由文案代理人完成每一段腳本",
    subEn: "Strategist maps the arc; writer handles every segment",
  },
  tiktok: {
    label: "TikTok", labelZh: "TikTok", icon: faTiktok, bg: "#EE1D52",
    heroZh: "前 3 秒留人，後 60 秒轉化 — TikTok 腳本不靠靈感",
    heroEn: "Grab them in 3 seconds, keep them for 60 — retention built in",
    subZh: "TikTok 專屬代理人以角色弧度 × 未解懸念設計驅動完播率",
    subEn: "TikTok agent that thinks in character arcs and unresolved tension",
  },
  email: {
    label: "Newsletter", labelZh: "電子報", icon: faEnvelope, bg: "#7B5BC8",
    heroZh: "每封電子報都是品牌聲音的延伸，不是隨機發文",
    heroEn: "Every email sounds like you — consistent voice, every send",
    subZh: "品牌定位鎖定主旨行、開場鉤子與 CTA，完整結構一次產出",
    subEn: "Brand voice locks the subject line, opening hook, and CTA — zero drift",
  },
  pr: {
    label: "PR", labelZh: "新聞稿", icon: faBullhorn, bg: "#475569",
    heroZh: "讓媒體真正想報導你 — 不是寫稿，是設計新聞角度",
    heroEn: "Written to get picked up — not just to check a box",
    subZh: "PR Strategist 代理人以記者視角找到新聞價值，再產出完整稿件",
    subEn: "PR Strategist finds the news angle before writing a single word",
  },
};

// ── Shared utilities ─────────────────────────────────────────────────────────
const CARD_PALETTES = [
  { from: "#fde68a", to: "#fbbf24" },
  { from: "#a5f3fc", to: "#22d3ee" },
  { from: "#c4b5fd", to: "#8b5cf6" },
  { from: "#bbf7d0", to: "#34d399" },
  { from: "#fecaca", to: "#f87171" },
  { from: "#fed7aa", to: "#fb923c" },
  { from: "#bfdbfe", to: "#60a5fa" },
  { from: "#f5d0fe", to: "#c084fc" },
];

const dicebear = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=4267B2&backgroundType=solid`;

function tierAccent(tier: string | undefined | null): string {
  if (tier === "60s") return "#7c3aed";
  if (tier === "99s") return "#f59e0b";
  return "#00b4bc";
}

// 2026-07-17 (CJ「去除 30s/60s/99s 分類標籤，不再使用時間長度分類」):
// tier stays as INTERNAL engine config (routing / quota / timeouts), but the
// user-facing classification is by deliverable, never by duration.
function tierLabel(tier: string | undefined | null, lang: string): string {
  if (tier === "60s") return lang === "en" ? "Pack" : "套組";
  if (tier === "99s") return lang === "en" ? "Campaign" : "企劃";
  return lang === "en" ? "Single" : "單篇";
}

// Tasks that should hold the modal open until image is done
const HOLD_FOR_IMAGES = new Set<string>(["fb-60-single-full", "fb-99-carousel-5"]);

function synthesizeStages(elapsedMs: number, tier: string, lang: string): any[] {
  const L = (zh: string, en: string) => (lang === "en" ? en : zh);
  const t = elapsedMs;
  const isResearch = tier === "99s";
  const isProd = tier === "60s" || tier === "99s";
  const scoutEnd = isResearch ? 12000 : 0;
  const preEnd = scoutEnd + 3000;
  const stratEnd = preEnd + 9000;
  const capStart = preEnd;
  const capEnd = capStart + 25000;
  const genEnd = capEnd + 10000;
  const extrasEnd = capEnd + 14000;
  const qaEnd = extrasEnd + 8000;
  const mk = (key: string, label: string, start: number, end: number) => ({
    key, label, startedAt: start,
    completedAt: t > end ? end : undefined,
    status: t < start ? "pending" : t > end ? "done" : "running",
  });
  const stages: any[] = [];
  if (isResearch) stages.push(mk("scout", L("🔬 Scout 爬取真實爆款數據", "🔬 Scout pulls real viral data"), 0, scoutEnd));
  stages.push(mk("pre", L("URL / persona / brand load", "URL / persona / brand load"), scoutEnd, preEnd));
  if (isProd) stages.push(mk("strategist", L("Strategist 規劃敘事弧", "Strategist maps the narrative arc"), preEnd, stratEnd));
  stages.push(mk("caption", L("文案寫手 撰寫版本", "Caption writer drafts variants"), capStart, capEnd));
  stages.push(mk("brief", L("視覺指導寫風格指示", "Image director writes the visual brief"), capStart, capEnd));
  stages.push(mk("gen", L("Flux 生圖", "Flux paints the image"), capEnd, genEnd));
  if (isProd) {
    stages.push(mk("extras", L("留言模板 / 發文時段 / 跟進", "Reply templates · timing · follow-up"), capEnd, extrasEnd));
    stages.push(mk("qa", L("Jordan Hayes 審核", "Jordan Hayes reviews"), extrasEnd, qaEnd));
  }
  return stages;
}

// ── Tier tab config ──────────────────────────────────────────────────────────
type ActiveTier = "all" | "30s" | "60s" | "99s";

interface TierTab {
  id: ActiveTier;
  labelZh: string;
  labelEn: string;
  accent: string;
}

const TIER_TABS: TierTab[] = [
  { id: "all",  labelZh: "全部",     labelEn: "All",      accent: "#171717" },
  { id: "30s",  labelZh: "單篇內容", labelEn: "Single",   accent: "#00b4bc" },
  { id: "60s",  labelZh: "內容套組", labelEn: "Pack",     accent: "#7c3aed" },
  { id: "99s",  labelZh: "完整企劃", labelEn: "Campaign", accent: "#f59e0b" },
];

// ── Format category config (FB only) ────────────────────────────────────────
type ActiveFormat =
  | "all" | "貼文" | "連結貼文" | "廣告" | "輪播 Carousel"
  | "多媒體" | "直播" | "釘選貼文" | "活動 / 系列" | "月曆 / 策略" | "互動 / 工具";

const FORMAT_TABS: { id: ActiveFormat; label: string; labelEn: string }[] = [
  { id: "all",            label: "全部",          labelEn: "All"                },
  { id: "貼文",           label: "貼文",          labelEn: "Posts"              },
  { id: "連結貼文",       label: "連結貼文",      labelEn: "Link Posts"         },
  { id: "廣告",           label: "廣告",          labelEn: "Ads"                },
  { id: "輪播 Carousel",  label: "輪播 Carousel", labelEn: "Carousel"           },
  { id: "多媒體",         label: "多媒體",        labelEn: "Media"              },
  { id: "直播",           label: "直播",          labelEn: "Live"               },
  { id: "釘選貼文",       label: "釘選貼文",      labelEn: "Pinned Posts"       },
  { id: "活動 / 系列",    label: "活動 / 系列",   labelEn: "Events & Series"    },
  { id: "月曆 / 策略",    label: "月曆 / 策略",   labelEn: "Calendar & Strategy"},
  { id: "互動 / 工具",    label: "互動 / 工具",   labelEn: "Engagement & Tools" },
];

const TASK_FORMAT_MAP: Record<string, ActiveFormat> = {
  // 貼文
  "fb-30-caption-short":          "貼文",
  "fb-30-pure-text-hook":         "貼文",
  "fb-60-single-full":            "貼文",
  // 連結貼文
  "fb-30-link-caption":           "連結貼文",
  "fb-60-link-full":              "連結貼文",
  // 廣告
  "fb-30-ad-headline":            "廣告",
  "fb-30-ad-primary":             "廣告",
  "fb-30-ad-cta":                 "廣告",
  "fb-30-ad-description":         "廣告",
  "fb-60-ad-pack-3":              "廣告",
  // 輪播 Carousel
  "fb-90-carousel-10frame":       "輪播 Carousel",
  // 多媒體 (Album + Reels + Story 合併)
  "fb-60-album-4":                "多媒體",
  "fb-90-reels-full":             "多媒體",
  "fb-30-story-text":             "多媒體",
  // 直播
  "fb-30-live-title":             "直播",
  "fb-60-live-suite":             "直播",
  "fb-90-livestream-suite":       "直播",
  // 釘選貼文
  "fb-30-pinned-short":           "釘選貼文",
  "fb-60-pinned-suite":           "釘選貼文",
  // 活動 / 系列
  "fb-30-countdown-1day":         "活動 / 系列",
  "fb-60-countdown-5day":         "活動 / 系列",
  "fb-60-launch-kit":             "活動 / 系列",
  "fb-90-event-launch":           "活動 / 系列",
  "fb-90-countdown-series":       "活動 / 系列",
  // 月曆 / 策略
  "fb-90-monthly-calendar":       "月曆 / 策略",
  "fb-90-monthly-calendar-promo": "月曆 / 策略",
  "fb-90-account-reposition":     "月曆 / 策略",
  "fb-90-quarterly-strategy":     "月曆 / 策略",
  "fb-90-monthly-analytics":      "月曆 / 策略",
  // 互動 / 工具
  "fb-30-comment-reply":          "互動 / 工具",
  "fb-30-hashtag-set":            "互動 / 工具",
  "fb-90-crisis-full":            "互動 / 工具",
};

// ── Format category config (IG) ─────────────────────────────────────────────
type IGActiveFormat =
  | "all" | "Feed 貼文" | "Reels" | "Carousel 輪播"
  | "Story 限時" | "Live 直播" | "個人頁" | "互動 / 工具" | "策略 / 月曆";

const IG_FORMAT_TABS: { id: IGActiveFormat; label: string; labelEn: string }[] = [
  { id: "all",            label: "全部",          labelEn: "All"                  },
  { id: "Feed 貼文",      label: "Feed 貼文",     labelEn: "Feed Posts"           },
  { id: "Reels",          label: "Reels",         labelEn: "Reels"                },
  { id: "Carousel 輪播",  label: "Carousel 輪播", labelEn: "Carousel"             },
  { id: "Story 限時",     label: "Story 限時",    labelEn: "Stories"              },
  { id: "Live 直播",      label: "Live 直播",     labelEn: "Live"                 },
  { id: "個人頁",         label: "個人頁",        labelEn: "Profile"              },
  { id: "互動 / 工具",    label: "互動 / 工具",   labelEn: "Engagement & Tools"   },
  { id: "策略 / 月曆",    label: "策略 / 月曆",   labelEn: "Strategy & Calendar"  },
];

const IG_TASK_FORMAT_MAP: Record<string, IGActiveFormat> = {
  // Feed 貼文
  "ig-30-caption-short":         "Feed 貼文",
  "ig-30-pure-text-hook":        "Feed 貼文",
  "ig-30-hashtag-set":           "Feed 貼文",
  "ig-60-feed-full":             "Feed 貼文",
  "ig-60-countdown-5day":        "Feed 貼文",
  "ig-60-serial-3":              "Feed 貼文",
  "ig-60-viral-rewrite":         "Feed 貼文",
  "ig-60-testimonial-rewrite":   "Feed 貼文",
  // Reels
  "ig-30-reel-hook":             "Reels",
  "ig-30-reel-script-full":      "Reels",
  "ig-60-reel-full":             "Reels",
  "ig-99-reel-series-6":         "Reels",
  // Carousel 輪播
  "ig-30-carousel-structure":    "Carousel 輪播",
  "ig-60-carousel-7":            "Carousel 輪播",
  "ig-99-save-worthy":           "Carousel 輪播",
  // Story 限時
  "ig-30-story-text":            "Story 限時",
  "ig-30-story-repost-strategy": "Story 限時",
  "ig-60-story-3frame":          "Story 限時",
  // Live 直播
  "ig-30-live-opening":          "Live 直播",
  "ig-60-live-suite":            "Live 直播",
  // 個人頁
  "ig-30-bio-rewrite":           "個人頁",
  "ig-60-highlight-suite":       "個人頁",
  "ig-99-account-reposition":    "個人頁",
  // 互動 / 工具
  "ig-30-comment-reply":         "互動 / 工具",
  "ig-30-dm-script":             "互動 / 工具",
  "ig-30-threads-cross-post":    "互動 / 工具",
  // 策略 / 月曆
  "ig-99-monthly-calendar":      "策略 / 月曆",
  "ig-99-30day-calendar":        "策略 / 月曆",
  "ig-99-youtility":             "策略 / 月曆",
  "ig-99-visual-story":          "策略 / 月曆",
  "ig-99-live-first":            "策略 / 月曆",
  "ig-99-document":              "策略 / 月曆",
  "ig-99-radical-transparency":  "策略 / 月曆",
};

// ── Format category config (LI) ─────────────────────────────────────────────
type LIActiveFormat =
  | "all" | "貼文" | "Article 長文" | "投票"
  | "Newsletter" | "Document" | "Thought Leadership" | "客戶案例" | "個人頁 / 觸達";

const LI_FORMAT_TABS: { id: LIActiveFormat; label: string; labelEn: string }[] = [
  { id: "all",                label: "全部",             labelEn: "All"               },
  { id: "貼文",               label: "貼文",             labelEn: "Posts"             },
  { id: "Article 長文",       label: "Article 長文",     labelEn: "Articles"          },
  { id: "投票",               label: "投票",             labelEn: "Polls"             },
  { id: "Newsletter",         label: "Newsletter",       labelEn: "Newsletter"        },
  { id: "Document",           label: "Document",         labelEn: "Documents"         },
  { id: "Thought Leadership", label: "Thought Leadership",labelEn: "Thought Leadership"},
  { id: "客戶案例",           label: "客戶案例",         labelEn: "Case Studies"      },
  { id: "個人頁 / 觸達",      label: "個人頁 / 觸達",    labelEn: "Profile & Outreach"},
];

const LI_TASK_FORMAT_MAP: Record<string, LIActiveFormat> = {
  // 貼文
  "li-30-insight-post":            "貼文",
  "li-30-hook-3":                  "貼文",
  "li-30-event-invite":            "貼文",
  // Article 長文
  "li-30-article-opener":          "Article 長文",
  // 投票
  "li-30-poll":                    "投票",
  // Newsletter
  "li-30-newsletter":              "Newsletter",
  "li-60-newsletter":              "Newsletter",
  "li-99-newsletter-quarterly":    "Newsletter",
  // Document
  "li-30-document":                "Document",
  // Thought Leadership
  "li-60-thought-leader":          "Thought Leadership",
  "li-99-30day-thought-leadership":"Thought Leadership",
  // 客戶案例
  "li-60-case-study":              "客戶案例",
  // 個人頁 / 觸達
  "li-30-dm-intro":                "個人頁 / 觸達",
  "li-30-comment":                 "個人頁 / 觸達",
  "li-30-headline":                "個人頁 / 觸達",
};

// ── Format category config (YT) ─────────────────────────────────────────────
// 2026-08-01 (CJ「參考 HeyGen 重新設計 YT 分類」): 舊分類是按「輸出格式」
// 切（縮圖/Community/互動…），跟用戶心裡「我現在有什麼素材」的順序不一致。
// 新分類改按 HeyGen 的成熟度階梯排：純文案（已有影片/腳本，只要文字）→
// 腳本（從零寫可拍的腳本）→ 分鏡圖（腳本拆成逐鏡頭示意圖）→ 影片（AI 真的
// 生成會動的素材）。系列/策略維持獨立分類，因為那些是跨多個階梯的整包產出。
type YTActiveFormat =
  | "all" | "純文案" | "腳本" | "分鏡圖" | "影片" | "系列 / 策略";

const YT_FORMAT_TABS: { id: YTActiveFormat; label: string; labelEn: string }[] = [
  { id: "all",         label: "全部",        labelEn: "All"               },
  { id: "純文案",      label: "純文案",      labelEn: "Pure Copy"         },
  { id: "腳本",        label: "腳本",        labelEn: "Script"            },
  { id: "分鏡圖",      label: "分鏡圖",      labelEn: "Storyboard"        },
  { id: "影片",        label: "影片 ⭐",      labelEn: "Video ⭐"           },
  { id: "系列 / 策略", label: "系列 / 策略", labelEn: "Series & Strategy" },
];

const YT_TASK_FORMAT_MAP: Record<string, YTActiveFormat> = {
  // 純文案 — 已有影片/主題，只需要文字（標題/說明/留言/社群貼文）
  "yt-30-title-strategies":  "純文案",
  "yt-30-thumbnail-text":    "純文案",
  "yt-30-description-seo":   "純文案",
  "yt-30-chapter-timeline":  "純文案",
  "yt-30-comment-reply":     "純文案",
  "yt-30-pinned-comment":    "純文案",
  "yt-30-community-post":    "純文案",
  "yt-60-video-package":     "純文案",
  "yt-60-community-post":    "純文案",
  // 腳本 — 從零規劃可拍攝的腳本（口播/字幕/鏡頭指示）
  "yt-30-shorts-script":     "腳本",
  "yt-30-opening-hook":      "腳本",
  "yt-30-end-cta":           "腳本",
  "yt-60-shorts-script":     "腳本",
  "yt-60-viral-rewrite":     "腳本",
  // 分鏡圖 — 腳本拆成逐格 AI 示意圖（縮圖包也算：同一套靜圖引擎產出多格視覺）
  "yt-60-thumbnail-suite":   "分鏡圖",
  "yt-60-storyboard":        "分鏡圖",
  // 影片 — AI 真的生成會動的素材（image-to-video）
  "yt-30-shorts-clip":       "影片",
  // 系列 / 策略 — 跨階梯的整包產出
  "yt-60-series-3ep":        "系列 / 策略",
  "yt-99-series-6ep":        "系列 / 策略",
  "yt-99-quarterly-strategy":"系列 / 策略",
  "yt-99-premiere-kit":      "系列 / 策略",
};

// ── Format category config (TT) ─────────────────────────────────────────────
//
// 2026-07-29 (CJ「重新盤點 tiktok 的任務」): the old tabs were an ad-hoc mix
// of format (腳本 / 字幕), surface (Live / 個人頁) and mechanic (Trend / Duet),
// so users couldn't tell what they'd actually receive from any given card.
//
// Replaced with a PRODUCTION-DEPTH LADDER — each rung is a legitimate place
// to stop, and the order also happens to track cost and wait time
// (文案 ≈ instant/free → 模擬影片 ≈ minutes and real spend), so the category
// itself sets the right expectation before the user clicks:
//
//   選題 → 文案 → 腳本 → 分鏡表 → 模擬影片
//
// 帳號營運 sits deliberately OUTSIDE the ladder: bio / comment replies / live
// openers aren't stages of producing one piece of content, and folding them
// in would blur what the ladder means.
//
// Empty tabs are hidden automatically (see the count===0 guard at render), so
// 分鏡表 stays invisible until its cards land.
type TTActiveFormat =
  | "all" | "選題" | "文案" | "腳本" | "分鏡表" | "模擬影片" | "帳號營運";

const TT_FORMAT_TABS: { id: TTActiveFormat; label: string; labelEn: string }[] = [
  { id: "all",        label: "全部",     labelEn: "All"            },
  { id: "選題",       label: "選題",     labelEn: "Ideation"       },
  { id: "文案",       label: "文案",     labelEn: "Copy"           },
  { id: "腳本",       label: "腳本",     labelEn: "Scripts"        },
  { id: "分鏡表",     label: "分鏡表",   labelEn: "Storyboard"     },
  { id: "模擬影片",   label: "模擬影片", labelEn: "Simulated Video" },
  { id: "帳號營運",   label: "帳號營運", labelEn: "Account Ops"    },
];

const TT_TASK_FORMAT_MAP: Record<string, TTActiveFormat> = {
  // 選題 — 還沒有內容之前，決定「要做什麼」
  "tt-30-trend-remix":         "選題",
  "tt-30-duet-angle":          "選題",
  "tt-99-trend-week":          "選題",
  "tt-99-30day-foryou":        "選題",
  "tt-60-series-3":            "選題",
  // 文案 — 交付物就是可直接貼上的文字
  "tt-30-caption-description": "文案",
  "tt-30-hashtag-set":         "文案",
  // 腳本 — 交付物是「可以照著拍」的腳本
  "tt-30-opening-hook":        "腳本",
  "tt-30-full-script":         "腳本",
  "tt-30-caption-rhythm":      "腳本",
  "tt-60-foryou-full":         "腳本",
  "tt-60-viral-rewrite":       "腳本",
  // 分鏡表 — 腳本與影片之間的橋
  "tt-30-storyboard":          "分鏡表",
  // 模擬影片 — 真的產出 mp4
  "tt-30-product-hero":        "模擬影片",
  "tt-30-product-asmr":        "模擬影片",
  "tt-30-text-hook-card":      "模擬影片",
  "tt-30-before-after":        "模擬影片",
  // 帳號營運 — 階梯之外，不隸屬於任何單一支內容
  "tt-30-bio-rewrite":         "帳號營運",
  "tt-30-comment-reply":       "帳號營運",
  "tt-30-live-opening":        "帳號營運",
};

// ── Format category config (Email) ──────────────────────────────────────────
type EMActiveFormat =
  | "all" | "主旨 / 預覽" | "Newsletter / 培育"
  | "促銷 / 發佈" | "歡迎 / Onboarding" | "挽回 / 再活化" | "開發 / 交易";

const EM_FORMAT_TABS: { id: EMActiveFormat; label: string; labelEn: string }[] = [
  { id: "all",               label: "全部",              labelEn: "All"                        },
  { id: "主旨 / 預覽",       label: "主旨 / 預覽",       labelEn: "Subject & Preview"          },
  { id: "Newsletter / 培育", label: "Newsletter / 培育", labelEn: "Newsletter & Nurture"       },
  { id: "促銷 / 發佈",       label: "促銷 / 發佈",       labelEn: "Promo & Launch"             },
  { id: "歡迎 / Onboarding", label: "歡迎 / Onboarding", labelEn: "Welcome & Onboarding"       },
  { id: "挽回 / 再活化",     label: "挽回 / 再活化",     labelEn: "Win-back & Re-engagement"   },
  { id: "開發 / 交易",       label: "開發 / 交易",       labelEn: "Prospecting & Transactional"},
];

const EM_TASK_FORMAT_MAP: Record<string, EMActiveFormat> = {
  // 主旨 / 預覽
  "em-30-subject-line":    "主旨 / 預覽",
  "em-30-preview-text":    "主旨 / 預覽",
  // Newsletter / 培育
  "em-60-newsletter-full": "Newsletter / 培育",
  "em-30-drip":            "Newsletter / 培育",
  "em-99-4week-nurture":   "Newsletter / 培育",
  // 促銷 / 發佈
  "em-30-promo":           "促銷 / 發佈",
  "em-30-event-invite":    "促銷 / 發佈",
  "em-60-promo-sequence":  "促銷 / 發佈",
  "em-99-launch-sequence": "促銷 / 發佈",
  // 歡迎 / Onboarding
  "em-30-welcome":         "歡迎 / Onboarding",
  "em-60-onboarding-3":    "歡迎 / Onboarding",
  // 挽回 / 再活化
  "em-30-abandoned-cart":  "挽回 / 再活化",
  "em-30-re-engagement":   "挽回 / 再活化",
  // 開發 / 交易
  "em-30-cold-email":      "開發 / 交易",
  "em-30-transactional":   "開發 / 交易",
};

// ── Format category config (PR) ─────────────────────────────────────────────
type PRActiveFormat =
  | "all" | "新聞稿" | "文件 / 素材" | "媒體關係" | "社群擴散" | "策略 / 發佈";

const PR_FORMAT_TABS: { id: PRActiveFormat; label: string; labelEn: string }[] = [
  { id: "all",         label: "全部",         labelEn: "All"                    },
  { id: "新聞稿",      label: "新聞稿",       labelEn: "Press Releases"         },
  { id: "文件 / 素材", label: "文件 / 素材",  labelEn: "Docs & Assets"          },
  { id: "媒體關係",    label: "媒體關係",     labelEn: "Media Relations"        },
  { id: "社群擴散",    label: "社群擴散",     labelEn: "Social Amplification"   },
  { id: "策略 / 發佈", label: "策略 / 發佈",  labelEn: "Strategy & Launch"      },
];

const PR_TASK_FORMAT_MAP: Record<string, PRActiveFormat> = {
  // 新聞稿
  "pr-30-headline":          "新聞稿",
  "pr-30-subhead":           "新聞稿",
  "pr-30-lead-paragraph":    "新聞稿",
  "pr-60-news-release-full": "新聞稿",
  // 文件 / 素材
  "pr-30-boilerplate":       "文件 / 素材",
  "pr-30-fact-sheet":        "文件 / 素材",
  "pr-30-ceo-quote":         "文件 / 素材",
  // 媒體關係
  "pr-30-media-pitch":       "媒體關係",
  "pr-30-spokesperson-qa":   "媒體關係",
  // 社群擴散
  "pr-30-launch-social":     "社群擴散",
  // 策略 / 發佈
  "pr-30-news-hook":         "策略 / 發佈",
  "pr-99-launch-toolkit":    "策略 / 發佈",
  "pr-99-newsjack":          "策略 / 發佈",
};

// ── FBTaskCard type (same as QuickTask30sPage) ───────────────────────────────
interface FBTaskCard {
  id: string;
  tier: "30s" | "60s" | "90s" | "99s";
  postType: string;
  platform?: string;
  label: string;
  label_en?: string | null;
  label_zh?: string | null;
  contextSources?: string[] | null;
  description: string;
  description_en?: string | null;
  kind: "fast" | "mid" | "squad";
  inputs?: any[];
  primary_question?: string | null;
  primary_input?: { key: string; placeholder?: string; type: "text" | "textarea"; derive?: any } | null;
  agent_id?: number | null;
  skill_slug?: string | null;
  agent?: { id: number; name: string; title: string; avatarUrl: string | null } | null;
  team?: Array<{ id: number; name: string; title: string; avatarUrl: string | null }>;
  squad_slug?: string;
  methodology?: string;
}

// ── Inline positioning-edit helpers (task modal) ─────────────────────────────
// A context chip's `source` is "brand.positioning.<segment>.<field>" (the
// "brand.positioning." prefix is a display convention even in product/event
// scope). Editing must target the raw entity positioning at "<segment>.<field>".
function chipFieldPath(source: string): string {
  return source.replace(/^brand\.positioning\./, "");
}
function getNested(obj: any, path: string): any {
  return path.split(".").reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}
/** Immutable deep-set: returns a new object with `path` set to `value`. */
function setNested(obj: any, path: string, value: any): any {
  const keys = path.split(".");
  const root = Array.isArray(obj) ? [...obj] : { ...(obj ?? {}) };
  let cur: any = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]!;
    cur[k] = (cur[k] && typeof cur[k] === "object") ? (Array.isArray(cur[k]) ? [...cur[k]] : { ...cur[k] }) : {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]!] = value;
  return root;
}
// Sibling fields offered as one-click "pick a different option" candidates
// when editing a given chip. Keyed by the chip field path (prefix stripped).
const CHIP_SIBLING_CANDIDATES: Record<string, string[]> = {
  // Product / brand
  "audience.primary":               ["audience.secondary"],
  "competition.uniqueUsp":          ["competition.rareUsp", "competition.commonUsp"],
  "core.coreStatement":             ["core.oneLineValueProp"],
  "value.userFeeling":              ["value.primaryEmotion"],
  // Event
  "audience.primaryAudience":       ["audience.secondaryAudience", "audience.keyInsight"],
  "smp.singleMindedProposition":    ["smp.rationale"],
  "creative.coreTranslation":       ["creative.creativeTheme", "creative.coreMetaphor"],
};

// ── Error boundary ───────────────────────────────────────────────────────────
class PlatformPageErrorBoundary extends React.Component<
  { children: React.ReactNode; platform: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      const e = this.state.error;
      return (
        <div style={{ padding: 32 }}>
          <div style={{ padding: 20, border: "1px solid #fca5a5", background: "#fef2f2", borderRadius: 12 }}>
            <p style={{ fontSize: 11, color: "#dc2626", textTransform: "uppercase" }}>
              /tasks/{this.props.platform} render error
            </p>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>頁面載入失敗</h2>
            <p style={{ marginTop: 8 }}>{e.message}</p>
            <button
              style={{ marginTop: 12, padding: "6px 12px", background: "#3b82f6", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
              onClick={() => this.setState({ error: null })}
            >
              重試渲染
            </button>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}

// ── Main page ────────────────────────────────────────────────────────────────
function PlatformTaskPageInner() {
  const { platform: routeParam = "fb" } = useParams<{ platform: string }>();
  const platform = ROUTE_TO_PLATFORM[routeParam] ?? "facebook";
  const meta = PLATFORM_META[platform] ?? PLATFORM_META.facebook;

  const { t, lang } = useLang();
  const ctx = useOutletContext<ShellOutletCtx>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // 2026-07-28 (CJ 策略工作台「內容角度→一鍵開任務」): the workbench's
  // dig chips deep-link here with ?topic=<角度>. Capture once, strip the
  // param, show a banner; the next task the user opens gets the topic
  // prefilled as its primary answer (strategy → copy in one line).
  const [strategyTopic, setStrategyTopic] = useState<string | null>(null);
  useEffect(() => {
    const t = searchParams.get("topic");
    if (t && t.trim()) {
      setStrategyTopic(t.trim().slice(0, 200));
      const next = new URLSearchParams(searchParams);
      next.delete("topic");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const brandId = (ctx?.brandId as number | null) ?? null;
  const brandName = useMemo(() => {
    const list = (ctx?.brands as any[]) ?? [];
    return list.find((b) => b?.id === brandId)?.name ?? null;
  }, [ctx, brandId]);

  // Onboarding redirect when no brands
  const brandsLoaded = (ctx as any)?.brandsLoaded === true;
  const brandsList = (ctx?.brands as any[]) ?? [];
  const needsOnboardingRedirect = brandsLoaded && brandsList.length === 0;

  // Brand data
  const brandQuery = (trpc as any).brand?.get?.useQuery
    ? (trpc as any).brand.get.useQuery(
        { id: brandId ?? 0 },
        { enabled: !!brandId, refetchInterval: 30_000, refetchOnWindowFocus: false },
      )
    : { data: null };

  // 2026-05-26 fix: was hardcoded productId/eventId: null → always fetched
  // brand-only positioning even when a product/event scope was active.
  // Now passes the real scope ids so context chips show the correct entity.
  // 2026-06-16 (CJ「右上只選品牌，產品/活動在任務卡跳窗時選」): per-task
  // entity selection. Defaults to brand-only; the user picks a product or
  // event inside the launch modal. This replaces relying on the global
  // scope.productId/eventId so the right-top picker can eventually drop
  // those options. Initialized from global scope when a task opens (so
  // existing right-top selections still carry through during the
  // transition), then editable in-modal.
  const [modalEntity, setModalEntity] = useState<{ kind: "brand" | "product" | "event"; id: number | null }>(
    { kind: "brand", id: null },
  );
  // Effective per-task ids fed to context resolution + orchestra. Brand
  // scope → both null; product/event scope → the matching id.
  const taskProductId = modalEntity.kind === "product" ? modalEntity.id : null;
  const taskEventId   = modalEntity.kind === "event"   ? modalEntity.id : null;

  // Product / event lists for the in-modal picker, scoped to current brand.
  const modalProductsQuery = (trpc as any).product?.list?.useQuery
    ? (trpc as any).product.list.useQuery(
        { brandId: brandId ?? undefined },
        { enabled: !!brandId, refetchOnWindowFocus: false },
      )
    : { data: [] };
  const modalEventsQuery = (trpc as any).event?.list?.useQuery
    ? (trpc as any).event.list.useQuery(
        { brandId: brandId ?? undefined },
        { enabled: !!brandId, refetchOnWindowFocus: false },
      )
    : { data: [] };
  const modalProducts = (modalProductsQuery.data as any[]) ?? [];
  const modalEvents = (modalEventsQuery.data as any[]) ?? [];

  // 2026-06-16 (CJ「受眾不對／想改賣點 — 可下拉選也可改寫」): inline editing
  // of a context field straight from the task modal. editingChip holds the
  // chip source path being edited; editValue is the working text. Saves write
  // back to the SELECTED entity's RAW positioning (never the merged overlay,
  // which would pollute a product with brand data).
  const [editingChip, setEditingChip] = useState<{ source: string; label: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const savePositioningMut = (trpc as any).scope?.savePositioning?.useMutation?.();

  const scopeActiveQuery = (trpc as any).scope?.active?.useQuery?.(
    {
      brandId:   brandId ?? 0,
      productId: taskProductId,
      eventId:   taskEventId,
    },
    { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 60_000 },
  );

  const brandAssetsForCheck: Record<string, any> =
    ((scopeActiveQuery?.data as any)?.brand?.positioning?._assets ?? {}) as Record<string, any>;

  const textAssetsEmpty = useMemo(() => {
    const b: any = brandQuery?.data ?? {};
    const brandSetUp =
      (typeof b.tagline === "string" && b.tagline.trim()) ||
      (typeof b.positioningSummary === "string" && b.positioningSummary.trim()) ||
      b.positioningStatus === "completed";
    if (brandSetUp) return false;
    const v = (assetKey: string): boolean => {
      const a = brandAssetsForCheck[assetKey];
      if (!a) return true;
      if (typeof a.text === "string" && a.text.trim()) return false;
      if (Array.isArray(a.items) && a.items.some((x: any) => typeof x === "string" && x.trim())) return false;
      if (Array.isArray(a.pairs) && a.pairs.some((p: any) => p?.from?.trim() && p?.to?.trim())) return false;
      return true;
    };
    return v("voice") && v("voice_principles") && v("preferred_terms") && v("banned_words");
  }, [brandAssetsForCheck, brandQuery?.data]);

  // Tier tab state (used for non-FB/non-IG platforms)
  const [activeTier, setActiveTier] = useState<ActiveTier>("all");
  // Format tab state (used for FB)
  const [activeFormat, setActiveFormat] = useState<ActiveFormat>("all");
  // Format tab state (used for IG)
  const [activeIGFormat, setActiveIGFormat] = useState<IGActiveFormat>("all");
  // Format tab state (used for LI)
  const [activeLIFormat, setActiveLIFormat] = useState<LIActiveFormat>("all");
  // Format tab state (used for YT)
  const [activeYTFormat, setActiveYTFormat] = useState<YTActiveFormat>("all");
  // Format tab state (used for TikTok)
  const [activeTTFormat, setActiveTTFormat] = useState<TTActiveFormat>("all");
  // Format tab state (used for Email)
  const [activeEMFormat, setActiveEMFormat] = useState<EMActiveFormat>("all");
  // Format tab state (used for PR)
  const [activePRFormat, setActivePRFormat] = useState<PRActiveFormat>("all");

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Task modal state
  const [activeTask, setActiveTask] = useState<FBTaskCard | null>(null);
  const [primaryAnswer, setPrimaryAnswer] = useState("");
  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [agentMeta, setAgentMeta] = useState<any | null>(null);
  const [imageAgentMeta, setImageAgentMeta] = useState<any | null>(null);
  const [orchestraStages, setOrchestraStages] = useState<any[] | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // Countdown
  const [countdownStart, setCountdownStart] = useState<number | null>(null);
  const [tickMs, setTickMs] = useState(0);
  useEffect(() => {
    if (countdownStart == null) return;
    const id = window.setInterval(() => setTickMs(Date.now() - countdownStart), 100);
    return () => clearInterval(id);
  }, [countdownStart]);

  // Brand context for modal chips.
  // When product/event scope is active, overlay their positioning on top of
  // the brand's so context chips reflect the selected product/event, not
  // the parent brand. Use product/event name as the display name.
  //
  // 2026-05-27 v2 (CJ「根治勝選通 modal 仍出現 SoWork」): two-level fix:
  //
  // A) Real-content check: `Object.keys(pos).length > 0` is insufficient because
  //    the auto-trigger writes `positioning._interim = {...}` which makes the check
  //    true even though no real segment data exists yet. We now check for non-"_"
  //    keys with actual string/array content (mirrors BrandsPage hasAnyPositioningContent).
  //
  // B) Interim overlay: if a product/event has only interim data (no real segments),
  //    use the interim sub-object as the overlay source — NOT the whole positioning
  //    object which would just merge brand+_interim and still expose brand chips.
  //
  // C) Hard isolation: if product/event scope is active but NOTHING exists yet,
  //    use {} so chips render as "尚未填寫" — never fall back to brand positioning.
  const brandCtx = useMemo(() => {
    const data: any = scopeActiveQuery?.data;
    if (!data?.brand) return null;
    const basePositioning    = data.brand.positioning    ?? {};
    const productPositioning = (data.product?.positioning ?? {}) as Record<string, any>;
    const eventPositioning   = (data.event?.positioning   ?? {}) as Record<string, any>;
    const productScopeActive = !!taskProductId;
    const eventScopeActive   = !!taskEventId;

    /** Does a positioning object have real (non-internal) segment data? */
    const posHasReal = (pos: Record<string, any>): boolean =>
      Object.keys(pos).filter(k => !k.startsWith("_")).some(k => {
        const v = pos[k];
        if (!v || typeof v !== "object" || Array.isArray(v)) return false;
        return Object.values(v).some(fv =>
          (typeof fv === "string" && (fv as string).trim().length > 0) ||
          (Array.isArray(fv) && (fv as any[]).length > 0)
        );
      });

    const productHasReal    = posHasReal(productPositioning);
    const productInterim    = productPositioning._interim as Record<string, any> | undefined ?? {};
    const productHasInterim = Object.keys(productInterim).length > 0;
    const eventHasReal      = posHasReal(eventPositioning);
    const eventInterim      = eventPositioning._interim as Record<string, any> | undefined ?? {};
    const eventHasInterim   = Object.keys(eventInterim).length > 0;

    // Overlay priority:
    //   1. Product real segments → merge on base (full override)
    //   2. Product interim only  → merge interim sub-object on base
    //   3. Event real segments   → merge on base
    //   4. Event interim only    → merge interim sub-object on base
    //   5. product/event scope active but truly empty → {} (no brand fallback)
    //   6. Brand scope           → brand positioning as-is
    const overlayPositioning =
      productHasReal    ? { ...basePositioning, ...productPositioning }
      : productHasInterim ? { ...basePositioning, ...productInterim }
      : eventHasReal    ? { ...basePositioning, ...eventPositioning }
      : eventHasInterim ? { ...basePositioning, ...eventInterim }
      : (productScopeActive || eventScopeActive)
        ? {}
        : basePositioning;

    const displayName =
      data.product?.name ?? data.event?.name ?? data.brand?.name ?? null;
    return {
      brand:   { ...data.brand, name: displayName, positioning: overlayPositioning },
      product: data.product ?? null,
      event:   data.event   ?? null,
    };
  }, [scopeActiveQuery?.data, taskProductId, taskEventId]);

  // Auto-trigger interim positioning for product/event scope with no positioning.
  // Mirrors BrandsPage auto-trigger so users don't need to visit BrandsPage first.
  // Phase: fires once per (kind, entityId) and is reset on scope change.
  const _autoPosTaskRef = React.useRef<string | null>(null);
  const autoRunInterimMut = (trpc as any).positioningJobs?.runInterim?.useMutation?.();
  const autoStartJobMut   = (trpc as any).positioningJobs?.start?.useMutation?.();
  const trpcUtils = (trpc as any).useUtils?.() ?? null;
  useEffect(() => {
    const productId = taskProductId;
    const eventId   = taskEventId;
    if (!productId && !eventId) return; // Brand scope — BrandsPage handles it
    const kind: "product" | "event" = productId ? "product" : "event";
    const entityId = (productId ?? eventId) as number;
    const key = `${kind}:${entityId}`;
    if (_autoPosTaskRef.current === key) return; // Already fired
    const data: any = scopeActiveQuery?.data;
    if (!data) return; // Query not yet loaded
    const entityPositioning = kind === "product"
      ? (data.product?.positioning ?? {})
      : (data.event?.positioning   ?? {});
    // Check for real content (ignore _interim / _meta internal keys)
    const hasContent = Object.keys(entityPositioning)
      .filter(k => !k.startsWith("_"))
      .some(k => {
        const v = entityPositioning[k];
        if (!v || typeof v !== "object" || Array.isArray(v)) return false;
        return Object.values(v).some(fv =>
          (typeof fv === "string" && (fv as string).trim().length > 0) ||
          (Array.isArray(fv)      && (fv as any[]).length > 0)
        );
      });
    if (hasContent) return; // Already has positioning — nothing to do
    if (!autoRunInterimMut?.mutate || !autoStartJobMut?.mutate) return;
    _autoPosTaskRef.current = key;
    (async () => {
      // 1. Fire full pipeline fire-and-forget (background, takes minutes)
      try { autoStartJobMut.mutate({ entityKind: kind, entityId }); } catch { /* non-fatal */ }
      // 2. Run interim (≤12s) — writes _interim positioning used by content tasks
      try { await autoRunInterimMut.mutateAsync?.({ entityKind: kind, entityId }); } catch { /* non-fatal */ }
      // 3. Refresh scope.active so chips pick up the new interim data
      trpcUtils?.scope?.active?.invalidate?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskProductId, taskEventId, scopeActiveQuery?.data]);

  // Polish input
  const polishInputMut = (trpc as any).quickTask?.polishInput?.useMutation();
  const [polishing, setPolishing] = useState(false);
  const [polishErr, setPolishErr] = useState<string | null>(null);

  const handlePolish = async () => {
    if (!activeTask || !primaryAnswer.trim() || !polishInputMut?.mutateAsync) return;
    setPolishErr(null);
    setPolishing(true);
    try {
      const r = await polishInputMut.mutateAsync({
        taskId: activeTask.id,
        text: primaryAnswer,
        taskLabel: typeof activeTask.label === "string" ? activeTask.label : undefined,
        primaryQuestion: activeTask.primary_question ?? undefined,
        brandId: brandId ?? undefined,
      });
      if (r?.ok && r.polished) setPrimaryAnswer(r.polished);
      else setPolishErr(lang === "en" ? "Polish failed — try again." : "潤稿失敗，請再試一次");
    } catch {
      setPolishErr(lang === "en" ? "Polish failed — try again." : "潤稿失敗，請再試一次");
    } finally {
      setPolishing(false);
    }
  };

  // Task data
  // 2026-07-20 (CJ「直連 /tasks/fb?b=XXXX 顯示 0/0 個任務」): a failed
  // catalog fetch used to silently render as「0/0 個任務」— retry transient
  // fresh-load hiccups and surface a real error state instead.
  const listQuery = (trpc as any).quickTask?.listFB?.useQuery
    ? (trpc as any).quickTask.listFB.useQuery(undefined, { refetchOnWindowFocus: false, retry: 2 })
    : { data: [] };
  const allTasks: FBTaskCard[] = (listQuery.data as FBTaskCard[]) ?? [];
  const catalogFailed = !!listQuery?.error && allTasks.length === 0;

  // Mutations
  const runOrchestraMut    = (trpc as any).quickTask?.runOrchestra?.useMutation();
  const runOrchestra60Mut  = (trpc as any).quickTask?.runOrchestra60?.useMutation();
  const runOrchestra99Mut  = (trpc as any).quickTask?.runOrchestra99?.useMutation();
  const runSquadAutoMut    = (trpc as any).quickTask?.runSquadAuto?.useMutation();
  const holdUtils          = (trpc as any).useUtils?.() ?? null;
  // 2026-07-20 (CJ「取消的任務應該就死掉，不需要留在專案中」): cancelled
  // runs archive their output on arrival (soft delete — hidden from
  // Projects). recordTaskRun's finalize never touches `status`, so the
  // archive sticks even when the server finishes writing afterwards.
  const deleteOutputMut    = (trpc as any).output?.delete?.useMutation?.();

  // ?rerun=<outputId> support
  const rerunId = Number(searchParams.get("rerun") ?? "0");
  const rerunQuery = (trpc as any).output?.getById?.useQuery
    ? (trpc as any).output.getById.useQuery(
        { id: rerunId },
        { enabled: rerunId > 0, staleTime: 60_000 },
      )
    : { data: null };
  useEffect(() => {
    if (!rerunId || !rerunQuery.data || allTasks.length === 0) return;
    const r = rerunQuery.data;
    const taskId = r.mission?.taskId;
    if (!taskId) return;
    const task = allTasks.find((x: FBTaskCard) => x.id === taskId);
    if (!task) return;
    const inputs = (r.metadata?.inputs ?? {}) as Record<string, string>;
    const primaryKey = (task as any).primary_input?.key ?? "topic";
    const prior = inputs[primaryKey] ?? Object.values(inputs)[0] ?? "";
    setActiveTask(task);
    // Rerun: restore the entity the original run used if recorded, else fall
    // back to current global scope, else brand.
    const rpid = (r.metadata as any)?.productId ?? ctx?.scope?.productId ?? null;
    const reid = (r.metadata as any)?.eventId ?? ctx?.scope?.eventId ?? null;
    setModalEntity(
      reid ? { kind: "event", id: reid } :
      rpid ? { kind: "product", id: rpid } :
      { kind: "brand", id: null },
    );
    setPrimaryAnswer(typeof prior === "string" ? prior : "");
    const next = new URLSearchParams(searchParams);
    next.delete("rerun");
    setSearchParams(next, { replace: true });
  }, [rerunId, rerunQuery.data, allTasks]);

  // ?topic=<text> prefill
  useEffect(() => {
    const topic = searchParams.get("topic");
    if (!topic) return;
    setPrimaryAnswer((prev) => prev || topic);
    const next = new URLSearchParams(searchParams);
    next.delete("topic");
    setSearchParams(next, { replace: true });
  }, [searchParams]);

  // ── Platform inference (matches QuickTask30sPage logic) ──────────────────
  const inferPlatform = (task: FBTaskCard): string =>
    task.platform ??
    (task.id?.startsWith("ig-") ? "instagram"
      : task.id?.startsWith("yt-") ? "youtube"
      : task.id?.startsWith("tt-") ? "tiktok"
      : task.id?.startsWith("li-") ? "linkedin"
      : task.id?.startsWith("em-") ? "email"
      : task.id?.startsWith("pr-") ? "pr"
      : task.id?.startsWith("br-") ? "brand"
      : task.id?.startsWith("rs-") ? "audience"
      : "facebook");

  // ── Filtered task list ────────────────────────────────────────────────────
  const visibleTasks = useMemo(() => {
    let list = allTasks.filter((task) => inferPlatform(task) === platform);
    if (platform === "facebook") {
      // Format-based filter for FB
      if (activeFormat !== "all") {
        list = list.filter((task) => TASK_FORMAT_MAP[task.id] === activeFormat);
      }
    } else if (platform === "instagram") {
      // Format-based filter for IG
      if (activeIGFormat !== "all") {
        list = list.filter((task) => IG_TASK_FORMAT_MAP[task.id] === activeIGFormat);
      }
    } else if (platform === "linkedin") {
      // Format-based filter for LI
      if (activeLIFormat !== "all") {
        list = list.filter((task) => LI_TASK_FORMAT_MAP[task.id] === activeLIFormat);
      }
    } else if (platform === "youtube") {
      // Format-based filter for YT
      if (activeYTFormat !== "all") {
        list = list.filter((task) => YT_TASK_FORMAT_MAP[task.id] === activeYTFormat);
      }
    } else if (platform === "tiktok") {
      // Format-based filter for TikTok
      if (activeTTFormat !== "all") {
        list = list.filter((task) => TT_TASK_FORMAT_MAP[task.id] === activeTTFormat);
      }
    } else if (platform === "email") {
      // Format-based filter for Email
      if (activeEMFormat !== "all") {
        list = list.filter((task) => EM_TASK_FORMAT_MAP[task.id] === activeEMFormat);
      }
    } else if (platform === "pr") {
      // Format-based filter for PR
      if (activePRFormat !== "all") {
        list = list.filter((task) => PR_TASK_FORMAT_MAP[task.id] === activePRFormat);
      }
    } else {
      // Tier-based filter for other platforms
      if (activeTier !== "all") {
        list = list.filter((task) => task.tier === activeTier);
      }
    }
    if (searchQuery.trim()) {
      list = list.filter((task) =>
        matchTaskWithSynonyms({
          query: searchQuery,
          label: task.label,
          description: task.description ?? "",
          agentName: task.agent?.name,
          skillSlug: task.skill_slug ?? undefined,
        }),
      );
    }
    return list;
  }, [allTasks, platform, activeTier, activeFormat, activeIGFormat, activeLIFormat, activeYTFormat, activeTTFormat, activeEMFormat, activePRFormat, searchQuery]);

  const totalForPlatform = useMemo(
    () => allTasks.filter((task) => inferPlatform(task) === platform).length,
    [allTasks, platform],
  );

  // Count tasks per format category (FB)
  const formatCounts = useMemo<Record<string, number>>(() => {
    if (platform !== "facebook") return {};
    const fbTasks = allTasks.filter((task) => inferPlatform(task) === platform);
    const counts: Record<string, number> = { all: fbTasks.length };
    for (const task of fbTasks) {
      const fmt = TASK_FORMAT_MAP[task.id];
      if (fmt) counts[fmt] = (counts[fmt] ?? 0) + 1;
    }
    return counts;
  }, [allTasks, platform]);

  // Count tasks per format category (IG)
  const igFormatCounts = useMemo<Record<string, number>>(() => {
    if (platform !== "instagram") return {};
    const igTasks = allTasks.filter((task) => inferPlatform(task) === platform);
    const counts: Record<string, number> = { all: igTasks.length };
    for (const task of igTasks) {
      const fmt = IG_TASK_FORMAT_MAP[task.id];
      if (fmt) counts[fmt] = (counts[fmt] ?? 0) + 1;
    }
    return counts;
  }, [allTasks, platform]);

  // Count tasks per format category (LI)
  const liFormatCounts = useMemo<Record<string, number>>(() => {
    if (platform !== "linkedin") return {};
    const liTasks = allTasks.filter((task) => inferPlatform(task) === platform);
    const counts: Record<string, number> = { all: liTasks.length };
    for (const task of liTasks) {
      const fmt = LI_TASK_FORMAT_MAP[task.id];
      if (fmt) counts[fmt] = (counts[fmt] ?? 0) + 1;
    }
    return counts;
  }, [allTasks, platform]);

  // Count tasks per format category (YT)
  const ytFormatCounts = useMemo<Record<string, number>>(() => {
    if (platform !== "youtube") return {};
    const ytTasks = allTasks.filter((task) => inferPlatform(task) === platform);
    const counts: Record<string, number> = { all: ytTasks.length };
    for (const task of ytTasks) {
      const fmt = YT_TASK_FORMAT_MAP[task.id];
      if (fmt) counts[fmt] = (counts[fmt] ?? 0) + 1;
    }
    return counts;
  }, [allTasks, platform]);

  // Count tasks per format category (TikTok)
  const ttFormatCounts = useMemo<Record<string, number>>(() => {
    if (platform !== "tiktok") return {};
    const ttTasks = allTasks.filter((task) => inferPlatform(task) === platform);
    const counts: Record<string, number> = { all: ttTasks.length };
    for (const task of ttTasks) {
      const fmt = TT_TASK_FORMAT_MAP[task.id];
      if (fmt) counts[fmt] = (counts[fmt] ?? 0) + 1;
    }
    return counts;
  }, [allTasks, platform]);

  // Count tasks per format category (Email)
  const emFormatCounts = useMemo<Record<string, number>>(() => {
    if (platform !== "email") return {};
    const emTasks = allTasks.filter((task) => inferPlatform(task) === platform);
    const counts: Record<string, number> = { all: emTasks.length };
    for (const task of emTasks) {
      const fmt = EM_TASK_FORMAT_MAP[task.id];
      if (fmt) counts[fmt] = (counts[fmt] ?? 0) + 1;
    }
    return counts;
  }, [allTasks, platform]);

  // Count tasks per format category (PR)
  const prFormatCounts = useMemo<Record<string, number>>(() => {
    if (platform !== "pr") return {};
    const prTasks = allTasks.filter((task) => inferPlatform(task) === platform);
    const counts: Record<string, number> = { all: prTasks.length };
    for (const task of prTasks) {
      const fmt = PR_TASK_FORMAT_MAP[task.id];
      if (fmt) counts[fmt] = (counts[fmt] ?? 0) + 1;
    }
    return counts;
  }, [allTasks, platform]);

  // ── Open / close task modal ───────────────────────────────────────────────
  const openTask = (task: FBTaskCard) => {
    if ((task as any).isMediaTask && (task as any).ctaPath) {
      navigate((task as any).ctaPath);
      return;
    }
    recordTaskUsed(task.id);
    setActiveTask(task);
    // Seed the per-task entity selector from the (legacy) global scope so an
    // existing right-top product/event selection still carries through. Once
    // the right-top picker drops these options, this just defaults to brand.
    const gp = ctx?.scope?.productId ?? null;
    const ge = ctx?.scope?.eventId ?? null;
    setModalEntity(
      ge ? { kind: "event", id: ge } :
      gp ? { kind: "product", id: gp } :
      { kind: "brand", id: null },
    );
    let prefill = "";
    const derive = (task as any).primary_input?.derive;
    if (derive && brandCtx) {
      const r = resolveDerive(brandCtx, derive);
      if (r && (derive.mode === "auto" || derive.mode === "confirm")) prefill = r.text;
    }
    // 策略工作台帶入的題目優先於 derive 預填（用戶剛從策略點過來，意圖明確）
    if (strategyTopic) prefill = strategyTopic;
    setPrimaryAnswer(prefill);
    setErrorMsg(null);
    setLatencyMs(null);
    setAgentMeta(null);
  };

  // 2026-07-20 (CJ QA「取消後 AI 仍在後端執行，完成時不經同意自動跳轉，
  // 中斷當下操作」): the in-flight run attempt is invalidated whenever the
  // modal closes. The server keeps generating (an HTTP mutation can't be
  // recalled) and the output still lands in /projects — but a cancelled
  // attempt must NEVER navigate or mutate UI state when it resolves.
  const runSeqRef = useRef(0);

  const closeTask = () => {
    runSeqRef.current++; // invalidate any in-flight run attempt
    setActiveTask(null);
    setRunning(false);
    setCountdownStart(null);
    setOrchestraStages(null);
    setModalEntity({ kind: "brand", id: null });
    setEditingChip(null);
    setEditValue("");
  };

  // ── Inline context-field editing ────────────────────────────────────────
  // Save target = the SELECTED entity (brand/product/event), and its RAW
  // positioning (not the merged overlay shown in chips).
  const editSaveTarget = useMemo(() => {
    const data: any = scopeActiveQuery?.data;
    if (modalEntity.kind === "product" && modalEntity.id) {
      return { kind: "product" as const, id: modalEntity.id, raw: (data?.product?.positioning ?? {}) as any };
    }
    if (modalEntity.kind === "event" && modalEntity.id) {
      return { kind: "event" as const, id: modalEntity.id, raw: (data?.event?.positioning ?? {}) as any };
    }
    if (brandId) {
      return { kind: "brand" as const, id: brandId, raw: (data?.brand?.positioning ?? {}) as any };
    }
    return null;
  }, [modalEntity, scopeActiveQuery?.data, brandId]);

  const openChipEditor = (chip: { source: string; label: string }) => {
    if (!editSaveTarget) return;
    const fieldPath = chipFieldPath(chip.source);
    const cur = getNested(editSaveTarget.raw, fieldPath);
    // Only string-typed fields are inline-editable; arrays/objects (matrix,
    // competitors, pains, etc.) are left to the full positioning editor.
    if (cur != null && typeof cur !== "string") return;
    setEditingChip(chip);
    setEditValue(typeof cur === "string" ? cur : "");
  };

  const commitChipEdit = async () => {
    if (!editingChip || !editSaveTarget || !savePositioningMut?.mutateAsync) return;
    const fieldPath = chipFieldPath(editingChip.source);
    const nextPositioning = setNested(editSaveTarget.raw, fieldPath, editValue.trim());
    try {
      await savePositioningMut.mutateAsync({
        kind: editSaveTarget.kind,
        id: editSaveTarget.id,
        positioning: nextPositioning,
      });
      await trpcUtils?.scope?.active?.invalidate?.();
      setEditingChip(null);
      setEditValue("");
    } catch (e: any) {
      setErrorMsg(lang === "en" ? `Couldn't save: ${e?.message ?? e}` : `儲存失敗：${e?.message ?? e}`);
    }
  };

  // ── Determine effective tier for running (tab || task.tier) ──────────────
  const effectiveTier = (task: FBTaskCard): "30s" | "60s" | "99s" => {
    if (activeTier !== "all") return activeTier;
    const t = task.tier as any;
    if (t === "60s" || t === "99s" || t === "30s") return t;
    return "30s";
  };

  // ── handleRun (same logic as QuickTask30sPage, tier = effectiveTier) ─────
  const handleRun = async () => {
    if (!activeTask) return;
    const tier = effectiveTier(activeTask);
    const primaryRequired = (activeTask.inputs?.[0] as any)?.required !== false;
    const hasDerive = !!(activeTask.primary_input as any)?.derive
      || !!(activeTask.contextSources && activeTask.contextSources.length > 0);
    if (!primaryAnswer.trim() && activeTask.primary_input?.key && primaryRequired && !hasDerive) {
      // 2026-07-07 (CJ「開始做按下去沒反應」— live repro): the errorMsg card
      // renders at the BOTTOM of the scrollable ModalBody, below the fold on
      // laptop screens, so this validation read as a silent no-op. Toast it
      // and scroll the question input into view so the user sees what's asked.
      const msg = lang === "en" ? "Answer the question first, then we'll make it." : "請先回答這個問題再生成";
      setErrorMsg(msg);
      showToastGlobal(msg);
      try {
        const el = document.querySelector<HTMLElement>("[data-primary-question]");
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
      } catch { /* non-fatal */ }
      return;
    }
    setRunning(true);
    setErrorMsg(null);
    setCountdownStart(Date.now());
    // 2026-07-20 (CJ QA): this attempt's ticket. closeTask() bumps the ref,
    // so a cancelled attempt resolves silently — no navigation, no state.
    const mySeq = ++runSeqRef.current;
    const isStale = () => runSeqRef.current !== mySeq;
    // Cancelled attempt resolving late: archive the output so it never
    // shows up in Projects (取消 = 死掉), and say so quietly.
    const discardCancelledOutput = (oid: number | null | undefined) => {
      if (oid) { try { deleteOutputMut?.mutate?.({ id: Number(oid) }); } catch { /* best-effort */ } }
      showToastGlobal(lang === "en"
        ? "Cancelled task discarded."
        : "已取消的任務已捨棄。");
    };

    try {
      // Squad tasks (99s campaign workflows)
      if (activeTask.kind === "squad" && (activeTask as any).squad_slug) {
        if (runSquadAutoMut) {
          const r = await runSquadAutoMut.mutateAsync({
            squadSlug: (activeTask as any).squad_slug,
            topic: primaryAnswer || activeTask.label,
            brandId: brandId ?? undefined,
          });
          if (isStale()) { if ((r as any).outputId) discardCancelledOutput((r as any).outputId); return; }
          if ((r as any).outputId) {
            closeTask();
            navigate(`/run/${(r as any).outputId}`);
            return;
          }
          setErrorMsg(lang === "en"
            ? "Squad ran but the output ID didn't come back. Try again or contact support."
            : "Squad 執行成功但 outputId 未回傳，請重試或回報。");
          return;
        }
        setErrorMsg(lang === "en" ? "Squad auto-run isn't available right now." : "Squad 自動執行 mutation 暫不可用");
        return;
      }

      // Orchestra path (30s / 60s / 99s)
      const inputKey = activeTask.primary_input?.key ?? "topic";
      const tierMut =
        tier === "60s" ? runOrchestra60Mut :
        tier === "99s" ? runOrchestra99Mut :
        runOrchestraMut;

      if (tierMut) {
        const r = await tierMut.mutateAsync({
          taskId: activeTask.id,
          inputs: { [inputKey]: primaryAnswer },
          brandId: brandId ?? undefined,
          productId: taskProductId,
          eventId: taskEventId,
        });
        if (isStale()) { if ((r as any).outputId) discardCancelledOutput((r as any).outputId); return; }

        if ((r as any).outputId) {
          const oid = (r as any).outputId;
          // Hold-for-images: wait for full post before navigating
          if ((tier === "60s" || HOLD_FOR_IMAGES.has(activeTask.id)) && holdUtils?.output?.getById?.fetch) {
            const deadline = Date.now() + 95_000;
            while (Date.now() < deadline) {
              await new Promise((res) => setTimeout(res, 3000));
              if (isStale()) { discardCancelledOutput(oid); return; }
              try {
                const o: any = await holdUtils.output.getById.fetch({ id: oid });
                if (o?.progress && o.progress !== "caption_ready") break;
              } catch { /* transient */ }
            }
          }
          if (isStale()) { discardCancelledOutput(oid); return; }
          closeTask();
          navigate(`/run/${oid}`);
          return;
        }

        const hasErrors = r.errors && r.errors.length > 0;
        const hasAnyCaption = (r.variants ?? []).some((v: any) => (v?.caption ?? "").trim().length > 0);
        const errorPreview = hasErrors ? r.errors.slice(0, 2).join(" · ").slice(0, 200) : "";
        setErrorMsg(
          hasErrors && !hasAnyCaption
            ? (lang === "en"
                ? `The AI specialist failed to write any content. Try a different task. Detail: ${errorPreview}`
                : `這位 AI 專家目前無法產出文案，請改試其他任務。詳情：${errorPreview}`)
            : hasErrors
            ? (lang === "en"
                ? "AI is a bit busy — hit Make it again."
                : "AI 暫時忙不過來，再按一次「立即產出」就好。")
            : (lang === "en"
                ? "Captions wrote OK but persistence failed — please contact support."
                : `文案寫出來了但沒存進資料庫（task: ${activeTask.id}），請聯絡客服。`)
        );
        return;
      }

      setErrorMsg(lang === "en"
        ? "This task isn't ready yet."
        : "這個任務還在開發中，請改試其他任務。");
    } catch (e: any) {
      if (!isStale()) setErrorMsg(e?.message ?? String(e));
    } finally {
      // Only the CURRENT attempt may reset run state — a cancelled attempt
      // resolving late must not clobber a newer run the user has started.
      if (!isStale()) {
        setRunning(false);
        setCountdownStart(null);
      }
    }
  };

  // ── Progress / countdown ──────────────────────────────────────────────────
  const activeTierForProgress = activeTask ? effectiveTier(activeTask) : "30s";
  const expectedSec =
    activeTierForProgress === "60s" ? 90 :
    activeTask && HOLD_FOR_IMAGES.has(activeTask.id) ? 90 :
    activeTierForProgress === "99s" ? 100 : 30;
  const progressPct = Math.min(100, (tickMs / (expectedSec * 1000)) * 100);

  // Render-time onboarding redirect (must be after all hooks)
  if (needsOnboardingRedirect) return <Navigate to="/brands" replace />;

  // Redirect unknown platform params
  if (!ROUTE_TO_PLATFORM[routeParam]) return <Navigate to="/tasks/fb" replace />;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ─── HERO ──────────────────────────────────────────────────────── */}
      <div className="relative pt-8 pb-4 px-6 text-center">
        <div className="relative z-10 flex flex-col items-center text-center max-w-[1100px] mx-auto">

          {/* Platform eyebrow */}
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm"
              style={{ background: meta.bg }}
            >
              <FontAwesomeIcon icon={meta.icon} className="text-sm" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-default-500">
              {lang === "en" ? meta.label : meta.labelZh}
            </p>
          </div>

          {/* Hero title — plain color (no gradient-text; gradient clip is unreliable cross-browser) */}
          <h1
            className="font-bold tracking-tight leading-tight mb-2"
            style={{
              fontSize: "clamp(1.45rem, 2.8vw, 2rem)",
              color: "#0f0f0e",
            }}
          >
            {lang === "en" ? meta.heroEn : meta.heroZh}
          </h1>

          {/* Platform sub-headline — differentiation copy */}
          <p
            className="mb-3 text-default-500"
            style={{ fontSize: 14, lineHeight: 1.65, maxWidth: 580 }}
          >
            <span style={{ color: meta.bg, fontWeight: 600 }}>▸ </span>
            {lang === "en" ? meta.subEn : meta.subZh}
            {brandId && (
              <span style={{ fontStyle: "italic", color: "#9ca3af" }}>
                {lang === "en"
                  ? ` · Using ${brandName ?? "your brand"}'s positioning`
                  : ` · 以 ${brandName ?? "你的品牌"} 定位為骨架`}
              </span>
            )}
          </p>

          {/* Search */}
          <div className="w-full mb-5" style={{ maxWidth: 740 }}>
            <Input
              size="lg"
              radius="lg"
              variant="flat"
              placeholder={lang === "en" ? "Search tasks or keywords…" : "搜尋任務或關鍵字…"}
              value={searchQuery}
              onValueChange={setSearchQuery}
              isClearable
              onClear={() => setSearchQuery("")}
              startContent={
                <FontAwesomeIcon icon={faMagnifyingGlass} className="text-default-400 shrink-0" style={{ fontSize: 16 }} />
              }
              classNames={{
                base: "overflow-hidden rounded-[18px]",
                inputWrapper: "h-14 bg-white shadow-md border border-default-100 rounded-[18px] data-[focus=true]:shadow-lg",
                input: "text-medium",
              }}
            />
          </div>

          {/* ── Format tiles (FB) / Format tiles (IG) / Tier tabs (other) ── */}
          {platform === "facebook" ? (
            <div className="w-full" style={{ maxWidth: 860 }}>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {FORMAT_TABS.map((tab) => {
                  const active = activeFormat === tab.id;
                  const count = formatCounts[tab.id] ?? 0;
                  if (tab.id !== "all" && count === 0) return null;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveFormat(tab.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap"
                      style={
                        active
                          ? { background: "#171717", color: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }
                          : { background: "white", color: "#525252", border: "1px solid #E5E5E5" }
                      }
                    >
                      {lang === "en" ? tab.labelEn : tab.label}
                      {tab.id !== "all" && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums font-semibold"
                          style={{
                            background: active ? "rgba(255,255,255,0.18)" : "#F5F5F5",
                            color: active ? "rgba(255,255,255,0.85)" : "#737373",
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : platform === "instagram" ? (
            <div className="w-full" style={{ maxWidth: 860 }}>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {IG_FORMAT_TABS.map((tab) => {
                  const active = activeIGFormat === tab.id;
                  const count = igFormatCounts[tab.id] ?? 0;
                  if (tab.id !== "all" && count === 0) return null;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveIGFormat(tab.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap"
                      style={
                        active
                          ? { background: "#171717", color: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }
                          : { background: "white", color: "#525252", border: "1px solid #E5E5E5" }
                      }
                    >
                      {lang === "en" ? tab.labelEn : tab.label}
                      {tab.id !== "all" && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums font-semibold"
                          style={{
                            background: active ? "rgba(255,255,255,0.18)" : "#F5F5F5",
                            color: active ? "rgba(255,255,255,0.85)" : "#737373",
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : platform === "linkedin" ? (
            <div className="w-full" style={{ maxWidth: 860 }}>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {LI_FORMAT_TABS.map((tab) => {
                  const active = activeLIFormat === tab.id;
                  const count = liFormatCounts[tab.id] ?? 0;
                  if (tab.id !== "all" && count === 0) return null;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveLIFormat(tab.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap"
                      style={
                        active
                          ? { background: "#171717", color: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }
                          : { background: "white", color: "#525252", border: "1px solid #E5E5E5" }
                      }
                    >
                      {lang === "en" ? tab.labelEn : tab.label}
                      {tab.id !== "all" && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums font-semibold"
                          style={{
                            background: active ? "rgba(255,255,255,0.18)" : "#F5F5F5",
                            color: active ? "rgba(255,255,255,0.85)" : "#737373",
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : platform === "youtube" ? (
            <div className="w-full" style={{ maxWidth: 860 }}>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {YT_FORMAT_TABS.map((tab) => {
                  const active = activeYTFormat === tab.id;
                  const count = ytFormatCounts[tab.id] ?? 0;
                  if (tab.id !== "all" && count === 0) return null;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveYTFormat(tab.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap"
                      style={
                        active
                          ? { background: "#171717", color: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }
                          : { background: "white", color: "#525252", border: "1px solid #E5E5E5" }
                      }
                    >
                      {lang === "en" ? tab.labelEn : tab.label}
                      {tab.id !== "all" && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums font-semibold"
                          style={{
                            background: active ? "rgba(255,255,255,0.18)" : "#F5F5F5",
                            color: active ? "rgba(255,255,255,0.85)" : "#737373",
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : platform === "tiktok" ? (
            <div className="w-full" style={{ maxWidth: 860 }}>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {TT_FORMAT_TABS.map((tab) => {
                  const active = activeTTFormat === tab.id;
                  const count = ttFormatCounts[tab.id] ?? 0;
                  if (tab.id !== "all" && count === 0) return null;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTTFormat(tab.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap"
                      style={
                        active
                          ? { background: "#171717", color: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }
                          : { background: "white", color: "#525252", border: "1px solid #E5E5E5" }
                      }
                    >
                      {lang === "en" ? tab.labelEn : tab.label}
                      {tab.id !== "all" && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums font-semibold"
                          style={{
                            background: active ? "rgba(255,255,255,0.18)" : "#F5F5F5",
                            color: active ? "rgba(255,255,255,0.85)" : "#737373",
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : platform === "email" ? (
            <div className="w-full" style={{ maxWidth: 860 }}>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {EM_FORMAT_TABS.map((tab) => {
                  const active = activeEMFormat === tab.id;
                  const count = emFormatCounts[tab.id] ?? 0;
                  if (tab.id !== "all" && count === 0) return null;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveEMFormat(tab.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap"
                      style={
                        active
                          ? { background: "#171717", color: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }
                          : { background: "white", color: "#525252", border: "1px solid #E5E5E5" }
                      }
                    >
                      {lang === "en" ? tab.labelEn : tab.label}
                      {tab.id !== "all" && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums font-semibold"
                          style={{
                            background: active ? "rgba(255,255,255,0.18)" : "#F5F5F5",
                            color: active ? "rgba(255,255,255,0.85)" : "#737373",
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : platform === "pr" ? (
            <div className="w-full" style={{ maxWidth: 860 }}>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {PR_FORMAT_TABS.map((tab) => {
                  const active = activePRFormat === tab.id;
                  const count = prFormatCounts[tab.id] ?? 0;
                  if (tab.id !== "all" && count === 0) return null;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActivePRFormat(tab.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap"
                      style={
                        active
                          ? { background: "#171717", color: "white", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }
                          : { background: "white", color: "#525252", border: "1px solid #E5E5E5" }
                      }
                    >
                      {lang === "en" ? tab.labelEn : tab.label}
                      {tab.id !== "all" && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums font-semibold"
                          style={{
                            background: active ? "rgba(255,255,255,0.18)" : "#F5F5F5",
                            color: active ? "rgba(255,255,255,0.85)" : "#737373",
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {TIER_TABS.map((tab) => {
                const active = activeTier === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTier(tab.id)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all"
                    style={
                      active
                        ? { background: tab.accent, color: "white", boxShadow: `0 2px 12px ${tab.accent}55` }
                        : { background: "white", color: "#525252", border: "1px solid #E5E5E5" }
                    }
                  >
                    {tab.id !== "all" && (
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: active ? "rgba(255,255,255,0.7)" : tab.accent }}
                      />
                    )}
                    {lang === "en" ? tab.labelEn : tab.labelZh}
                  </button>
                );
              })}
            </div>
          )}

          {/* Task count micro-label */}
          <div className="mt-3 text-tiny text-default-400">
            {lang === "en"
              ? `${visibleTasks.length} of ${totalForPlatform} tasks`
              : `${visibleTasks.length} / ${totalForPlatform} 個任務`}
            {brandName && (
              <span className="ml-2">
                · {lang === "en" ? "Brand:" : "品牌腦："}<span className="font-medium text-default-600">{brandName}</span>
              </span>
            )}
          </div>
          {/* 2026-07-20 (CJ): failed catalog fetch is now visible + retryable
              instead of a silent 0/0. */}
          {strategyTopic && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              border: "1.5px solid #2A2630", background: "#F7F6F3", borderRadius: 12,
              padding: "10px 16px", marginBottom: 14, fontSize: 13,
            }}>
              <span>
                <b>{lang === "en" ? "Strategy topic loaded: " : "策略題目已帶入："}</b>
                「{strategyTopic}」
                <span style={{ color: "#8A8494", marginLeft: 8, fontSize: 12 }}>
                  {lang === "en" ? "Open any task — it autofills." : "點任一任務卡，題目會自動填入"}
                </span>
              </span>
              <button onClick={() => setStrategyTopic(null)}
                      style={{ border: "none", background: "none", color: "#8A8494", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                {lang === "en" ? "Clear" : "清除"}
              </button>
            </div>
          )}
          {catalogFailed && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-warning-300 bg-warning-50 px-3 py-2 max-w-xl mx-auto">
              <p className="text-tiny text-warning-800 flex-1 text-left">
                {lang === "en"
                  ? "Task list failed to load — this is a network hiccup, not missing tasks."
                  : "任務清單載入失敗——這是連線問題，不是沒有任務。"}
              </p>
              <button
                onClick={() => listQuery?.refetch?.()}
                className="text-tiny font-semibold px-3 py-1 rounded-md bg-warning-500 text-white hover:bg-warning-600 transition shrink-0"
              >
                {lang === "en" ? "Reload" : "重新載入"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 推薦起點 row removed — it duplicated the grid and pushed tiles below fold */}

      {/* ─── Task grid ─────────────────────────────────────────────────── */}
      <div className="max-w-[1200px] mx-auto px-6 pb-20 mt-2">
        {totalForPlatform === 0 ? (
          <Card>
            <CardBody className="text-center text-default-500 py-12">
              <FontAwesomeIcon icon={faBolt} className="text-3xl mb-2 text-default-300" />
              <p className="font-semibold mb-1">
                {lang === "en" ? `${meta.label} tasks loading…` : `${meta.labelZh} 任務準備中`}
              </p>
            </CardBody>
          </Card>
        ) : visibleTasks.length === 0 ? (
          <Card>
            <CardBody className="text-center text-default-500 py-12">
              <FontAwesomeIcon icon={faMagnifyingGlass} className="text-2xl mb-2 text-default-300" />
              <p>
                {searchQuery.trim()
                  ? (lang === "en" ? `No tasks match "${searchQuery}"` : `沒有匹配 "${searchQuery}" 的任務`)
                  : (lang === "en" ? "No tasks in this tier yet — coming soon." : "這個層級還沒有任務，即將上線")}
              </p>
            </CardBody>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-lg tracking-tight">
                  {lang === "en" ? "Tasks" : "精選任務"}
                </h2>
                <p className="text-tiny text-default-400 mt-0.5">
                  {lang === "en" ? "Tap to make — answer one quick question first." : "按下即產出，先回答 1 個關鍵問題"}
                </p>
              </div>
              <Chip size="sm" variant="flat" color="secondary">
                {lang === "en" ? `${visibleTasks.length} tasks` : `${visibleTasks.length} 件`}
              </Chip>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {visibleTasks.map((task, idx) => {
                const pal = CARD_PALETTES[idx % CARD_PALETTES.length];
                const agentName = task.agent?.name ?? "AI Agent";
                const avatarSrc = task.agent?.avatarUrl || dicebear(agentName);
                const taskTier = task.tier as string;
                const accent = tierAccent(taskTier);

                return (
                  <button
                    key={task.id}
                    onClick={() => openTask(task)}
                    className="flex flex-col rounded-2xl overflow-hidden text-left transition hover:scale-[1.02] hover:shadow-lg"
                    style={{ border: "1px solid rgba(0,0,0,0.07)", background: "white" }}
                  >
                    {/* Card top — gradient bg + agent avatar centered (matches QuickTask30sPage) */}
                    <div
                      className="flex items-center justify-center relative"
                      style={{ height: 130, background: `linear-gradient(135deg, ${pal.from} 0%, ${pal.to} 100%)` }}
                    >
                      <Avatar
                        src={avatarSrc}
                        size="lg"
                        isBordered
                        color="default"
                        className="w-20 h-20 ring-2 ring-white/60"
                      />
                      {/* Deliverable badge — top right (no duration labels) */}
                      <span
                        className="absolute top-2 right-2 text-tiny font-bold px-2 py-0.5 rounded-full text-white shadow-sm"
                        style={{ background: accent, fontSize: 9, letterSpacing: "0.06em" }}
                      >
                        {tierLabel(taskTier, lang)}
                      </span>
                      {/* Last-used badge — bottom right, only when used before */}
                      {(() => {
                        const days = getLastUsedDays(task.id);
                        if (days === null) return null;
                        return (
                          <span
                            className="absolute bottom-2 right-2 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ background: "rgba(0,0,0,0.55)", color: "#fff", letterSpacing: "0.03em" }}
                          >
                            {days === 0 ? (lang === "en" ? "today" : "今天用過") : `${days}d ago`}
                          </span>
                        );
                      })()}
                      {/* Platform icon — top left */}
                      <div
                        className="absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: meta.bg }}
                      >
                        <FontAwesomeIcon icon={meta.icon} className="text-white" style={{ fontSize: 9 }} />
                      </div>
                    </div>

                    {/* Card body */}
                    <div className="p-3 flex flex-col gap-1 flex-1">
                      <p className="text-small font-semibold leading-tight line-clamp-2">
                        {lang === "en" ? (task.label_en ?? task.label) : task.label}
                      </p>
                      <p className="text-tiny text-default-500 line-clamp-2">
                        {lang === "en" ? (task.description_en ?? task.description) : task.description}
                      </p>
                      {(task as any).methodology && (
                        <span className="text-[10px] text-default-400 italic">📚 {(task as any).methodology}</span>
                      )}
                      <div className="mt-auto pt-2 flex items-center gap-2 border-t border-default-100">
                        <Avatar src={avatarSrc} size="sm" className="w-5 h-5" />
                        <span className="text-tiny font-medium text-default-700 truncate">{agentName}</span>
                      </div>
                      {/* 60s team stack */}
                      {(task as any).team && (task as any).team.length > 1 && (
                        <div className="flex items-center gap-1.5 -mt-1">
                          <div className="flex -space-x-2">
                            {((task as any).team as Array<{ id: number; name: string; avatarUrl: string | null }>)
                              .slice(0, 4)
                              .map((m) => (
                                <Avatar key={m.id} src={m.avatarUrl || dicebear(m.name)} size="sm" className="w-5 h-5 ring-1 ring-white" title={m.name} />
                              ))}
                          </div>
                          <span className="text-[10px] text-default-500">
                            {lang === "en" ? `${(task as any).team.length} collaborators` : `${(task as any).team.length} 位協作`}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ─── Task modal (intake + running countdown) ───────────────────── */}
      <Modal
        isOpen={!!activeTask}
        onClose={closeTask}
        size="2xl"
        scrollBehavior="inside"
        backdrop="blur"
        classNames={{
          base: "max-h-[90vh]",
          body: "py-3 px-4",
          footer: "border-t border-default-100 bg-white py-2 px-4",
          header: "py-2 px-3 bg-white border-b border-default-100",
          closeButton: "text-default-400 hover:bg-default-100",
        }}
      >
        <ModalContent>
          {activeTask && (
            <>
              <ModalHeader className="flex flex-col items-stretch gap-0 py-2 px-3 border-b border-default-100">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-default-800 truncate font-medium">
                      {lang === "en"
                        ? (activeTask.label_en ?? activeTask.label)
                        : (activeTask.label_zh ?? activeTask.label)}
                      {activeTask.agent && (
                        <span className="text-default-500 ml-2 font-normal">· {activeTask.agent.name}</span>
                      )}
                    </p>
                  </div>
                  {/* Deliverable badge in modal header (no duration labels) */}
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shadow-sm shrink-0"
                    style={{ background: tierAccent(effectiveTier(activeTask)) }}
                  >
                    {tierLabel(effectiveTier(activeTask), lang)}
                  </span>
                </div>
              </ModalHeader>

              <ModalBody>
                {/* 2026-06-16: per-task entity picker. Brand by default; the
                    user can switch to a specific product or event for THIS run.
                    Selecting one re-runs the context resolution so the chips
                    below + the generated content use that entity's positioning. */}
                {brandId && (modalProducts.length > 0 || modalEvents.length > 0) && (
                  <div className="mb-3">
                    <p className="text-tiny text-default-500 mb-1.5">
                      {lang === "en" ? "Generate for" : "這次要為哪個對象產出"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setModalEntity({ kind: "brand", id: null })}
                        className={`text-xs px-2.5 py-1 rounded-full border transition ${
                          modalEntity.kind === "brand"
                            ? "bg-neutral-900 text-white border-neutral-900"
                            : "bg-white text-default-700 border-default-300 hover:border-default-500"
                        }`}
                      >
                        {lang === "en" ? "Brand" : "品牌"}{brandName ? ` · ${brandName}` : ""}
                      </button>
                      {modalProducts.map((p: any) => (
                        <button
                          key={`p-${p.id}`}
                          onClick={() => setModalEntity({ kind: "product", id: p.id })}
                          className={`text-xs px-2.5 py-1 rounded-full border transition ${
                            modalEntity.kind === "product" && modalEntity.id === p.id
                              ? "bg-neutral-900 text-white border-neutral-900"
                              : "bg-white text-default-700 border-default-300 hover:border-default-500"
                          }`}
                        >
                          {lang === "en" ? "Product · " : "產品 · "}{p.name}
                        </button>
                      ))}
                      {modalEvents.map((e: any) => (
                        <button
                          key={`e-${e.id}`}
                          onClick={() => setModalEntity({ kind: "event", id: e.id })}
                          className={`text-xs px-2.5 py-1 rounded-full border transition ${
                            modalEntity.kind === "event" && modalEntity.id === e.id
                              ? "bg-neutral-900 text-white border-neutral-900"
                              : "bg-white text-default-700 border-default-300 hover:border-default-500"
                          }`}
                        >
                          {lang === "en" ? "Event · " : "活動 · "}{e.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Brand assets empty hint */}
                {textAssetsEmpty && brandId && (
                  <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
                    <span className="text-base leading-none mt-0.5">💡</span>
                    <div className="flex-1 leading-relaxed">
                      {lang === "en" ? (
                        <>
                          <span className="font-medium">This brand's word assets are empty.</span>
                          {" "}Pop into{" "}
                          <a href={`/brands?b=${brandId}&cat=copy`} target="_blank" rel="noreferrer" className="underline font-medium hover:text-amber-700">
                            Brand → Words
                          </a>
                          {" "}and click Auto-fill. Output will be far more on-brand.
                        </>
                      ) : (
                        <>
                          <span className="font-medium">這個品牌的「文字」資產還是空的。</span>
                          {" "}先到{" "}
                          <a href={`/brands?b=${brandId}&cat=copy`} target="_blank" rel="noreferrer" className="underline font-medium hover:text-amber-700">
                            品牌 → 文字
                          </a>
                          {" "}按「自動填寫」，AI 產出會明顯貼合品牌語氣。
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Context chips */}
                {(() => {
                  // 2026-05-27 (CJ「modal chip 仍抓 SoWork」): scope-aware DEFAULT_SOURCES.
                  // Product uses segment ids: core / audience / value / competition / strategy / marketing.
                  // Brand uses: goldenCircle / audience / voice / differentiation / values / tagline.
                  // When product/event scope is active, use the correct paths so chips read
                  // from the product's own positioning segments, not the brand's.
                  const isProductScope = !!(brandCtx?.product);
                  const isEventScope   = !!(brandCtx?.event);
                  const BRAND_SOURCES = [
                    "brand.name",
                    "brand.positioning.audience.primary",
                    "brand.positioning.voice.archetypes",
                    "brand.positioning.voice.tone",
                    "brand.positioning.voice.forbidden",
                    "brand.positioning.goldenCircle.why",
                  ];
                  const PRODUCT_SOURCES = [
                    "brand.name",                                   // displayName = product name
                    "brand.positioning.audience.primary",           // product.audience.primary
                    "brand.positioning.core.coreStatement",         // product.core.coreStatement
                    "brand.positioning.marketing.tone",             // product.marketing.tone
                    "brand.positioning.competition.uniqueUsp",      // product.competition.uniqueUsp
                    "brand.positioning.value.userFeeling",          // product.value.userFeeling
                  ];
                  const EVENT_SOURCES = [
                    "brand.name",                                          // displayName = event name
                    "brand.positioning.audience.primaryAudience",          // event.audience.primaryAudience
                    "brand.positioning.smp.singleMindedProposition",       // event.smp.singleMindedProposition
                    "brand.positioning.messaging.coreMessage",             // event.messaging.coreMessage
                    "brand.positioning.creative.coreTranslation",          // event.creative.coreTranslation
                  ];
                  const DEFAULT_SOURCES =
                    isProductScope ? PRODUCT_SOURCES :
                    isEventScope   ? EVENT_SOURCES   :
                    BRAND_SOURCES;
                  const sources = (activeTask.contextSources && activeTask.contextSources.length > 0)
                    ? activeTask.contextSources
                    : DEFAULT_SOURCES;
                  const chips = brandCtx ? buildContextChips(brandCtx, sources) : [];
                  const anyContent = chips.some((c: any) => c.hasContent);
                  // Is a chip inline-editable? Only string-typed (or empty)
                  // segment fields; arrays/objects route to the full editor.
                  const isEditable = (source: string): boolean => {
                    if (!editSaveTarget) return false;
                    const v = getNested(editSaveTarget.raw, chipFieldPath(source));
                    return v == null || typeof v === "string";
                  };
                  // Render nothing only if there's truly nothing to show or edit.
                  if (!anyContent && chips.every((c: any) => !isEditable(c.source))) return null;
                  const shownMissing = chips.filter((c: any) => !c.hasContent && c.source !== "brand.name").slice(0, 4);
                  const renderChip = (c: any, missing: boolean) => {
                    const editable = isEditable(c.source) && c.source !== "brand.name";
                    const base: React.CSSProperties = {
                      fontSize: 11, padding: "3px 8px", borderRadius: 4, fontWeight: 500,
                      ...(missing
                        ? { background: "transparent", color: "#A3A3A3", border: "1px dashed #D4D4D4" }
                        : { background: "#171717", color: "#FFFFFF" }),
                      ...(editable ? { cursor: "pointer" } : {}),
                    };
                    if (!editable) {
                      return <span key={c.source} title={c.source} style={base}>{c.label}</span>;
                    }
                    return (
                      <button
                        key={c.source}
                        title={lang === "en" ? "Click to edit / rewrite" : "點擊編輯／改寫"}
                        style={base}
                        onClick={() => openChipEditor(c)}
                      >
                        {c.label}{missing ? " ＋" : " ✎"}
                      </button>
                    );
                  };
                  return (
                    <div className="mb-3 rounded-lg px-3 py-2.5" style={{ background: "#FAFAF9", border: "1px solid #171717" }}>
                      <p style={{ fontSize: 9, fontWeight: 700, color: "#525252", letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 6 }}>
                        {(() => {
                          const entityName = brandCtx?.brand?.name ?? brandName ?? (lang === "en" ? "your brand" : "你的品牌");
                          return lang === "en"
                            ? `Context · from ${entityName} · click a chip to edit`
                            : `Context · 來自 ${entityName} · 點任一項可改寫`;
                        })()}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {chips.filter((c: any) => c.hasContent).map((c: any) => renderChip(c, false))}
                        {shownMissing.map((c: any) => renderChip(c, true))}
                      </div>

                      {/* Inline editor for the selected chip */}
                      {editingChip && (() => {
                        const fieldPath = chipFieldPath(editingChip.source);
                        const siblings = (CHIP_SIBLING_CANDIDATES[fieldPath] ?? [])
                          .map((sp) => ({ path: sp, val: getNested(editSaveTarget?.raw, sp) }))
                          .filter((s) => typeof s.val === "string" && s.val.trim().length > 0);
                        return (
                          <div className="mt-2.5 pt-2.5" style={{ borderTop: "1px solid #E5E5E5" }}>
                            <p className="text-tiny text-default-600 mb-1">
                              {(lang === "en" ? "Editing: " : "編輯：") + editingChip.label.split(" · ")[0]}
                            </p>
                            {siblings.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1.5">
                                <span className="text-[10px] text-default-400 self-center">
                                  {lang === "en" ? "Pick:" : "可選用："}
                                </span>
                                {siblings.map((s) => (
                                  <button
                                    key={s.path}
                                    onClick={() => setEditValue(s.val)}
                                    className="text-[10px] px-2 py-0.5 rounded-full border border-default-300 bg-white text-default-600 hover:border-default-500"
                                    title={s.val}
                                  >
                                    {s.val.length > 24 ? s.val.slice(0, 24) + "…" : s.val}
                                  </button>
                                ))}
                              </div>
                            )}
                            <Textarea
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              minRows={2}
                              autoFocus
                              placeholder={lang === "en" ? "Type or rewrite…" : "輸入或改寫…"}
                            />
                            <p className="text-[10px] text-default-400 mt-1">
                              {lang === "en"
                                ? `Saves to this ${editSaveTarget?.kind ?? "brand"}'s positioning.`
                                : `會更新此${editSaveTarget?.kind === "product" ? "產品" : editSaveTarget?.kind === "event" ? "活動" : "品牌"}的定位。`}
                            </p>
                            <div className="flex gap-2 mt-1.5">
                              <Button size="sm" color="secondary"
                                isLoading={savePositioningMut?.isPending}
                                onPress={commitChipEdit}>
                                {lang === "en" ? "Save" : "儲存"}
                              </Button>
                              <Button size="sm" variant="flat"
                                onPress={() => { setEditingChip(null); setEditValue(""); }}>
                                {lang === "en" ? "Cancel" : "取消"}
                              </Button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}

                {/* Primary question input */}
                {activeTask.primary_input && (
                  <div className="space-y-2" data-primary-question>
                    <p className="text-small font-medium">{activeTask.primary_question}</p>
                    {activeTask.primary_input.type === "textarea" ? (
                      <Textarea
                        placeholder={activeTask.primary_input.placeholder ?? ""}
                        value={primaryAnswer}
                        onChange={(e) => setPrimaryAnswer(e.target.value)}
                        minRows={3}
                        autoFocus
                      />
                    ) : (
                      <Input
                        placeholder={activeTask.primary_input.placeholder ?? ""}
                        value={primaryAnswer}
                        onChange={(e) => setPrimaryAnswer(e.target.value)}
                        autoFocus
                      />
                    )}
                    {polishInputMut && !running && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="flat"
                          color="secondary"
                          isLoading={polishing}
                          isDisabled={polishing || !primaryAnswer.trim()}
                          onPress={handlePolish}
                          startContent={!polishing && <FontAwesomeIcon icon={faWandMagicSparkles} />}
                        >
                          {polishing
                            ? (lang === "en" ? "Polishing…" : "潤稿中…")
                            : (lang === "en" ? "AI polish my brief" : "✨ AI 潤稿")}
                        </Button>
                        <span className="text-tiny text-default-400">
                          {lang === "en"
                            ? "Tidies your input — facts kept, never invented."
                            : "幫你整理輸入（保留事實、不會捏造）"}
                        </span>
                      </div>
                    )}
                    {polishErr && <p className="text-tiny text-danger-500">{polishErr}</p>}
                  </div>
                )}

                {/* Running carousel */}
                {running && (() => {
                  const tier = effectiveTier(activeTask);
                  const stagesNow = orchestraStages && orchestraStages.length > 0
                    ? orchestraStages
                    : synthesizeStages(tickMs, tier, lang);
                  const elapsedText =
                    (tier === "60s" || tier === "99s")
                      ? `${(tickMs / 1000).toFixed(0)}s · ${lang === "en" ? "researching → writing → rendering" : "策略 → 文案 → 出圖中"}`
                      : `${(tickMs / 1000).toFixed(1)}s / ${expectedSec}s`;
                  const accent = tierAccent(tier);
                  const agentRoster: Array<{ id?: number; name: string; title?: string; avatarUrl?: string | null; role?: string }> = [];
                  const cap = agentMeta ?? activeTask.agent;
                  if (cap) agentRoster.push({ id: cap.id, name: cap.name, title: cap.title, avatarUrl: cap.avatarUrl, role: lang === "en" ? "Writing caption" : "撰寫文案" });
                  if (imageAgentMeta) agentRoster.push({ id: imageAgentMeta.id, name: imageAgentMeta.name, title: imageAgentMeta.title, avatarUrl: imageAgentMeta.avatarUrl, role: lang === "en" ? "Visual direction" : "視覺方向" });
                  return (
                    <RunningAgentCarousel
                      agents={agentRoster.length > 0 ? agentRoster : [{ name: "Agent", role: lang === "en" ? "Working" : "處理中" }]}
                      stages={stagesNow}
                      accentColor={accent}
                      progressPct={progressPct}
                      elapsedText={elapsedText}
                    />
                  );
                })()}

                {/* Error message */}
                {errorMsg && (
                  <Card className="bg-warning-50 border border-warning-200 mt-4">
                    <CardBody className="text-warning-800 text-small">{errorMsg}</CardBody>
                  </Card>
                )}
              </ModalBody>

              <ModalFooter>
                <Button variant="light" onPress={closeTask} startContent={<FontAwesomeIcon icon={faXmark} />}>
                  {t("cancel")}
                </Button>
                <Button
                  color="primary"
                  onPress={handleRun}
                  isLoading={running}
                  isDisabled={running}
                  startContent={!running && <FontAwesomeIcon icon={faPaperPlane} />}
                >
                  {running ? t("qt_run_busy") : t("qt_run_btn")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}

export default function PlatformTaskPage() {
  const { platform = "fb" } = useParams<{ platform: string }>();
  return (
    <PlatformPageErrorBoundary platform={platform}>
      <PlatformTaskPageInner />
    </PlatformPageErrorBoundary>
  );
}
