/**
 * channelMeta — 通路的顯示資料：圖示、中英文名稱、任務頁路由。
 *
 * 2026-09-26（CJ「保持 notion style 一致性」）：這份表原本在活動企劃頁與活動
 * 日曆各寫了一份，而且都帶著品牌色（#1877F2 之類）。設計系統寫得很明白：
 *
 *   「Workspace (FB/IG/LI/YT/TT) 不再用 6 種色 → 全部 default chip + brand FA
 *     icon 區分」「沒有 hex 直接寫色（除了真實品牌 logo / 用戶上傳）」
 *
 * 用色來分平台會讓畫面上同時出現五六個 accent，違反「一個畫面最多 2 個 accent」
 * 那條；而且顏色在這裡不傳達狀態——它只是分類，分類用圖示就夠了。所以這裡**只有
 * 圖示與名稱，沒有顏色**，狀態（已寫 / 未寫）才由 success / default 表達。
 */
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faFacebookF, faInstagram, faLinkedinIn, faYoutube, faTiktok, faXTwitter, faThreads, faLine,
} from "@fortawesome/free-brands-svg-icons";
import { faEnvelope, faBullhorn, faGlobe } from "@fortawesome/free-solid-svg-icons";

export interface ChannelMeta {
  icon: IconDefinition;
  /** 對應 /tasks/:platform 的路由片段。 */
  route: string;
  zh: string;
  en: string;
}

export const CHANNEL_META: Record<string, ChannelMeta> = {
  facebook:  { icon: faFacebookF,  route: "fb",    zh: "Facebook",  en: "Facebook" },
  instagram: { icon: faInstagram,  route: "ig",    zh: "Instagram", en: "Instagram" },
  threads:   { icon: faThreads,    route: "threads", zh: "Threads", en: "Threads" },
  line:      { icon: faLine,       route: "line",  zh: "LINE",      en: "LINE" },
  linkedin:  { icon: faLinkedinIn, route: "li",    zh: "LinkedIn",  en: "LinkedIn" },
  youtube:   { icon: faYoutube,    route: "yt",    zh: "YouTube",   en: "YouTube" },
  tiktok:    { icon: faTiktok,     route: "tt",    zh: "TikTok",    en: "TikTok" },
  x:         { icon: faXTwitter,   route: "x",     zh: "X",         en: "X" },
  email:     { icon: faEnvelope,   route: "email", zh: "電子報",     en: "Email" },
  pr:        { icon: faBullhorn,   route: "pr",    zh: "新聞稿",     en: "PR" },
  website:   { icon: faGlobe,      route: "web",   zh: "官網",       en: "Website" },
};

export function channelLabel(id: string, en: boolean): string {
  const m = CHANNEL_META[id];
  return m ? (en ? m.en : m.zh) : id;
}

/** 這個通路的任務頁路由片段；不認得就退回 fb（任務頁自己還會再判一次平台）。 */
export function channelRoute(id: string): string {
  return CHANNEL_META[id]?.route ?? "fb";
}
