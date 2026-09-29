/**
 * THEATER_CAST — 內容企劃台 agent roster (CJ approved 2026-05-07).
 *
 * 20 distinct people, zero overlap:
 *   - 1 chief strategist (Claire Hsu)
 *   - 6 platforms × 3 roles (lead / writer / image_director) = 18
 *   - 1 shared QA reviewer (Chun-Hao Chen)
 *
 * All IDs verified `isAvailable=1` in agents table (2026-05-06 DB probe via
 * admin-find-theater-cast.yml). avatarUrl is fetched at runtime via
 * trpc.agents.getMany so the actual photos render in the brain bar's
 * line-art portrait frame.
 */

export type TheaterRole = "chief" | "lead" | "writer" | "image" | "qa";
export type TheaterPlatform =
  | "facebook"
  | "instagram"
  | "youtube"
  | "threads"
  | "line"
  | "blog";

export interface CastMember {
  id: number;
  name: string;
  title: string;
  role: TheaterRole;
  platform: TheaterPlatform | null; // null for chief / qa
}

/** Platform display metadata + the canonical mockup variant for Theater cells.
 *
 * 2026-05-10 (CJ direction「icon 要該社群平台或 NOTION B&W」):
 * - `iconKey` references FontAwesome brand icons (faFacebook, faInstagram...)
 *   so the platform IS recognizable by its real logo SHAPE.
 * - Component renders icon in neutral B&W (text-neutral-700/900) rather
 *   than the brand color, so it fits Notion-style monochrome aesthetic.
 * - `accent` kept for places that genuinely need brand color (e.g. mockup
 *   internals where users expect FB blue).
 * - `emoji` removed — replaced everywhere with FontAwesome brand icon.
 */
export const PLATFORM_META: Record<
  TheaterPlatform,
  {
    label: string;
    short: string;
    accent: string;
    /** FontAwesome brand-icon name — reverse-lookup in TheaterPage to actual import */
    iconKey: "facebook" | "instagram" | "youtube" | "threads" | "line" | "blog";
    /** PlatformMockup variant key — see PlatformMockup/index.tsx switch. */
    mockup: { platform: string; format: string; label: string };
  }
> = {
  facebook:  {
    label: "Facebook", short: "FB", accent: "#1877F2", iconKey: "facebook",
    mockup: { platform: "facebook", format: "feed", label: "Facebook 貼文" },
  },
  instagram: {
    label: "Instagram", short: "IG", accent: "#E1306C", iconKey: "instagram",
    mockup: { platform: "instagram", format: "feed", label: "Instagram 貼文" },
  },
  youtube:   {
    label: "YouTube", short: "YT", accent: "#FF0000", iconKey: "youtube",
    mockup: { platform: "youtube", format: "video-card", label: "YouTube 影片卡" },
  },
  threads:   {
    label: "Threads", short: "Threads", accent: "#000000", iconKey: "threads",
    mockup: { platform: "threads", format: "post", label: "Threads 貼文" },
  },
  line:      {
    label: "LINE", short: "LINE", accent: "#06C755", iconKey: "line",
    mockup: { platform: "line", format: "broadcast", label: "LINE 廣播" },
  },
  blog:      {
    label: "Blog 長文", short: "Blog", accent: "#F97316", iconKey: "blog",
    mockup: { platform: "web", format: "blog", label: "Web Blog" },
  },
};

export const THEATER_CAST: CastMember[] = [
  // ── 總策畫 ──────────────────────────────────────────────────────
  { id: 180159, name: "Claire Hsu",      title: "Social Media Brand Strategist",            role: "chief",  platform: null },

  // ── Facebook ───────────────────────────────────────────────────
  { id: 239182, name: "Phoebe Yang",     title: "Editorial Calendar Lead",                  role: "lead",   platform: "facebook" },
  { id: 60021,  name: "Tina Ji",         title: "FB/IG Social Copywriter",                  role: "writer", platform: "facebook" },
  { id: 39,     name: "Tom Hsu",         title: "Marketing Designer",                       role: "image",  platform: "facebook" },

  // ── Instagram ──────────────────────────────────────────────────
  { id: 227632, name: "劉淑芬",          title: "KOL Strategy Director — IG × 科技",       role: "lead",   platform: "instagram" },
  { id: 229985, name: "許怡君",          title: "Hook Copywriter — IG × 科技",             role: "writer", platform: "instagram" },
  { id: 180165, name: "Anna Tseng",      title: "Visual Content Strategy Director",        role: "image",  platform: "instagram" },

  // ── YouTube ────────────────────────────────────────────────────
  { id: 24,     name: "Janet Chang",     title: "YouTube Channel Strategist",               role: "lead",   platform: "youtube" },
  { id: 30013,  name: "Eric Chen",       title: "YT SEO Content Writer",                    role: "writer", platform: "youtube" },
  { id: 210220, name: "Yu-Cheng Chang",  title: "Senior Motion Graphics Designer",          role: "image",  platform: "youtube" },

  // ── Threads ────────────────────────────────────────────────────
  { id: 229385, name: "林志明",          title: "Threads Content Specialist — 科技",       role: "lead",   platform: "threads" },
  { id: 60022,  name: "Kevin Huang",     title: "LINE/Threads Social Copywriter",           role: "writer", platform: "threads" },
  { id: 210021, name: "Iris Wu",         title: "E-commerce Visual Designer",               role: "image",  platform: "threads" },

  // ── LINE ───────────────────────────────────────────────────────
  { id: 180237, name: "Wendy Kao",       title: "LINE Platform Marketing Director",         role: "lead",   platform: "line" },
  { id: 180238, name: "David Tsai",      title: "Official Account Marketing Manager",       role: "writer", platform: "line" },
  { id: 60071,  name: "Zeyu Yang",       title: "Brand Visual Copy Integration",            role: "image",  platform: "line" },

  // ── Blog 長文 ──────────────────────────────────────────────────
  { id: 25,     name: "Kevin Lee",       title: "SEO Strategist (E-commerce)",              role: "lead",   platform: "blog" },
  { id: 37,     name: "Eric Chu",        title: "SEO Content Writer",                       role: "writer", platform: "blog" },
  { id: 210015, name: "Tina Shih",       title: "SaaS Landing Page Designer",               role: "image",  platform: "blog" },

  // ── QA ─────────────────────────────────────────────────────────
  { id: 210207, name: "Chun-Hao Chen",   title: "Senior Social Media Editor",               role: "qa",     platform: null },
];

/**
 * 2026-09-29（CJ：內容通路只剩 FB／IG／TikTok／電子報／官網）：YouTube 從
 * 七日發布台拿掉。型別、PLATFORM_META 與 cast 資料保留（舊的持久化 run 還
 * 查得到），畫面上只列 VISIBLE_THEATER_PLATFORMS，讀進來的 activePlatforms
 * 一律過 sanitizeTheaterPlatforms。
 */
export const HIDDEN_THEATER_PLATFORMS: ReadonlySet<TheaterPlatform> = new Set<TheaterPlatform>(["youtube"]);
export const VISIBLE_THEATER_PLATFORMS: TheaterPlatform[] = (Object.keys(PLATFORM_META) as TheaterPlatform[])
  .filter((p) => !HIDDEN_THEATER_PLATFORMS.has(p));
export const DEFAULT_THEATER_PLATFORMS: TheaterPlatform[] = ["facebook", "instagram"];

/** 過濾掉隱藏／未知平台；過濾完是空的就回預設（FB＋IG）。 */
export function sanitizeTheaterPlatforms(list: unknown): TheaterPlatform[] {
  if (!Array.isArray(list)) return [...DEFAULT_THEATER_PLATFORMS];
  const out = list.filter(
    (p): p is TheaterPlatform =>
      typeof p === "string" && p in PLATFORM_META && !HIDDEN_THEATER_PLATFORMS.has(p as TheaterPlatform),
  );
  return out.length > 0 ? out : [...DEFAULT_THEATER_PLATFORMS];
}

/** Lookup helpers. */
export function getChief(): CastMember {
  return THEATER_CAST.find((m) => m.role === "chief")!;
}
export function getQA(): CastMember {
  return THEATER_CAST.find((m) => m.role === "qa")!;
}
export function getPlatformLead(p: TheaterPlatform): CastMember {
  return THEATER_CAST.find((m) => m.platform === p && m.role === "lead")!;
}
export function getPlatformWriter(p: TheaterPlatform): CastMember {
  return THEATER_CAST.find((m) => m.platform === p && m.role === "writer")!;
}
export function getPlatformImage(p: TheaterPlatform): CastMember {
  return THEATER_CAST.find((m) => m.platform === p && m.role === "image")!;
}
export function castIds(): number[] {
  return THEATER_CAST.map((m) => m.id);
}
