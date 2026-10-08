/**
 * 側邊欄的入口定義：各層 rail 要列哪些項目。
 */
import React from "react";
import { isStrategyPreviewEmail, isPersonaPreviewEmail } from "../../platform/lib/shellContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ICON, ShareIcon } from "../../platform/components/icons";
import { publishSettingsUrl } from "../../platform/lib/publishSettingsUrl";
import { faBoxOpen, faFont, faPaintBrush, faMicrophone, faCircleInfo, faChartLine, faDatabase, faFileLines, faCalendarDays, faFolderOpen, faBullhorn, faEnvelope, faGlobe, faBookBookmark } from "@fortawesome/free-solid-svg-icons";
import { faFacebook, faInstagram, faThreads, faLine, faTiktok } from "@fortawesome/free-brands-svg-icons";

export interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  matchPrefix?: string;
  /** 2026-09-27：內容層可自行加入的入口 id（跟 server navPrefsRouter.NAV_ITEM_IDS 同一份）。 */
  id?: string;
  /** 2026-09-27：內容層 rail 分兩段——user＝這個品牌自己加的、fixed＝專案／行事曆／活動。 */
  group?: "top" | "user" | "fixed";
  /** 2026-09-27：挑選清單分組：通路 or 工具。 */
  kind?: "channel" | "tool";
  /** 這些路徑也算這個入口（行事曆合一：/calendar 與 /tasks/calendar）。 */
  alsoMatch?: string[];
  /** 2026-09-30：圖示下方的短標籤（側欄 64px 放不下「Facebook」）。沒給就用 label。 */
  short?: string;
  /** 2026-05-11 — hover tooltip explaining when this tier is for.
   *  Reviewer:「30s / 60s / 99s 的差異我看不清楚」. */
  tooltip?: string;
  /** 2026-08-20 — 策略 rail only. Those entries all live on /brands/edit and
   *  differ only by the `cat` query param, but active-state matching runs on
   *  pathname alone, so every one of them would light up at once. When set,
   *  the item is active iff the current `cat` equals this value. */
  catKey?: string;
  /** 2026-09-30：記憶空間快滿／超載時，圖示右上角亮狀態點。 */
  /** near／over：記憶快滿／超載；review：有東西等用戶回來確認（法規審查重點萃取好了）。 */
  alert?: "near" | "over" | "review";
}

// 2026-05-26 (CJ「左欄改成平台優先」): replace tier-first nav (30s/60s/99s)
// with platform icons. Users pick the *platform* first; speed is shown as
// a badge on each task card inside the platform page.
// Brand Strategy + Research Analysis removed per CJ direction; Brand Brain kept.
/**
 * CatalogPlatform → /tasks 路由。用來把品牌任務包宣告的頻道換算成側邊欄項目。
 * 這份要跟 PlatformTaskPage 的 ROUTE_TO_PLATFORM 對得起來（方向相反）。
 */
export const CHANNEL_TO_TASK_ROUTE: Record<string, string> = {
  facebook: "/tasks/fb",
  instagram: "/tasks/ig",
  linkedin: "/tasks/li",
  youtube: "/tasks/yt",
  tiktok: "/tasks/tt",
  x: "/tasks/x",
  email: "/tasks/email",
  pr: "/tasks/pr",
  website: "/tasks/web",
  threads: "/tasks/threads",
  line: "/tasks/line",
  case: "/tasks/case",
  calendar: "/tasks/calendar",
};

/**
 * @param allowedTaskRoutes 這個品牌可見的 /tasks 路由。null = 沒有客製包，
 *   顯示全部（今天的行為）。非 null 時，不在名單裡的頻道整個不渲染 ——
 *   建設公司的側邊欄不該出現 TikTok。非 /tasks 的項目一律不受影響。
 */
export function buildNavItems(lang: "zh-TW" | "en", userEmail?: string | null, currentPath?: string, allowedTaskRoutes?: Set<string> | null, userNavItems?: string[], customChannels?: { id: string; name: string; preset?: string | null }[]): NavItem[] {
  const en = lang === "en";
  const isStrategyPreview = isStrategyPreviewEmail(userEmail);
  const isPersonaPreview = isPersonaPreviewEmail(userEmail);

  // 2026-08-20 (CJ「參考 DEV 環境，將品牌大腦獨立成一個策略區」): 品牌大腦's
  // own tile strip (定位 / 產品 / 活動 / 文字 / 視覺 / 工具 / 基本資料) is
  // promoted to the left rail as the 策略 workspace. Same sections, same
  // `cat` param, same page — only the entry point moves, so BrandsPage
  // itself needs no change and every existing deep link still works.
  //
  // Brand/product/event scope ids are injected by the nav click handler, so
  // these `to` values deliberately carry only `cat`.
  if (isStrategyPreview && currentPath?.startsWith("/brands")) {
    // Ordered by what the entry IS, not alphabetically: the first three are
    // the three positioning SCOPES — 品牌 / 產品 / 活動 — i.e. "which thing
    // am I positioning". Everything after is brand-level ASSET that supports
    // whichever scope is active.
    return [
      { to: "/brands/edit?cat=positioning", catKey: "positioning", label: en ? "Brand" : "品牌", icon: <FontAwesomeIcon icon={ICON.brand} />,
        tooltip: en ? "Brand positioning" : "品牌定位" },
      { to: "/brands/edit?cat=products", catKey: "products", label: en ? "Products" : "產品", icon: <FontAwesomeIcon icon={faBoxOpen} />,
        tooltip: en ? "Product cards & positioning" : "產品卡片與定位" },
      { to: "/brands/edit?cat=events", catKey: "events", label: en ? "Campaigns" : "活動", icon: <FontAwesomeIcon icon={ICON.campaign} />,
        tooltip: en ? "Campaign cards & positioning" : "活動卡片與定位" },
      { to: "/brands/edit?cat=copy", catKey: "copy", label: en ? "Copy" : "文字", icon: <FontAwesomeIcon icon={faFont} />,
        tooltip: en ? "Voice, terms, CTA and hook libraries" : "語氣 / 用詞 / CTA / 鉤子庫" },
      { to: "/brands/edit?cat=visual", catKey: "visual", label: en ? "Visual" : "視覺", icon: <FontAwesomeIcon icon={faPaintBrush} />,
        tooltip: en ? "Logo / palette / fonts" : "Logo / 色票 / 字型" },
      // 2026-09-26（CJ「將工具拿掉、指令庫拿掉、隱藏知識庫」）：「工具」整個從 rail 拿掉。
      // 知識庫只是藏起來，資料保留；2026-09-29 起沒有任何 AI 讀取它。
      // 2026-10-02（CJ「移除策略層當中的會議頁面」）：當時一併加的「會議」也拿掉了。
      // 2026-09-30（CJ「策略層加一個 mission tray，是法規……agent 寫文章前要審查」）：
      // 用戶自己加的法規來源，每條一張卡；啟用中的每一篇產文動筆前都會讀、逐條審查。
      { to: "/brands/edit?cat=regulations", catKey: "regulations", label: en ? "Regulations" : "法規", icon: <FontAwesomeIcon icon={ICON.regulation} />,
        tooltip: en ? "Regulations every draft is checked against" : "寫文前要審查的法規" },
      // 2026-10-03（CJ「不同平台的定位不同…增加一個 mission tray，呈現方式參考品牌頁面」）：
      // 七個平台各自的角色（對誰說、說什麼、不說什麼）；只有發在該平台的任務會讀。
      { to: "/brands/edit?cat=channels", catKey: "channels", label: en ? "Channels" : "通路", icon: <FontAwesomeIcon icon={ICON.message} />,
        tooltip: en ? "Each platform's role in the brand" : "每個平台在品牌裡的角色" },
      // 2026-09-29（CJ「在策略端增加一個 mission tray，是檢查大腦」）：品牌大腦記住了
      // 什麼、還能記多少——跟每篇產文讀的是同一份。
      // 2026-09-30（CJ「重新想這個 mission tray 的名字，目的在管理記憶」→「名稱就叫做『記憶』」）：
      // 跟手機管理儲存空間同一個心智模型；快滿／超載時圖示上亮狀態點（見 memoryAlert）。
      { to: "/brands/edit?cat=brain", catKey: "brain", label: en ? "Memory" : "記憶", icon: <FontAwesomeIcon icon={ICON.brainCheck} />,
        tooltip: en ? "What the AI remembers — and cleanup when it's full" : "AI 記住了什麼、滿了怎麼清" },
      // 2026-08-21 (CJ「加一個人設的task tray...用戶可以自己新創agent，自己
      // 命名，並且決定這個Agent語調的應用範圍」): user-created persona
      // agents — trained from pasted text / article links / video links,
      // each scoped to a subset of the 8 AI-指令庫 platforms. 2026-08-22:
      // stays gated to isPersonaPreview while still being shaken out —
      // see isPersonaPreviewEmail's comment above.
      ...(isPersonaPreview ? [
        { to: "/brands/edit?cat=persona", catKey: "persona", label: en ? "Persona" : "人設", icon: <FontAwesomeIcon icon={faMicrophone} />,
          tooltip: en ? "Custom persona agents" : "自訂人設 Agent" },
      ] : []),
      { to: "/brands/edit?cat=info", catKey: "info", label: en ? "Info" : "基本資料", icon: <FontAwesomeIcon icon={faCircleInfo} />,
        tooltip: en ? "Name / industry / market" : "名稱 / 產業 / 市場" },
      { to: publishSettingsUrl(null), catKey: "publish", label: en ? "Platform auth" : "平台授權", icon: <ShareIcon />,
        tooltip: en ? "Connect social accounts" : "連接社群帳號" },
    ];
  }

  // 2026-09-08：成效 rail 原本也被 isPrivate 守著 —— 非 sowork 帳號在 /performance
  // 看到的是內容 rail。成效 9/7 已對所有人開放，rail 跟著開。
  if (currentPath?.startsWith("/performance")) {
    return [
      { to: "/performance/overview", label: en ? "Overview" : "總覽", icon: <FontAwesomeIcon icon={faChartLine} />, matchPrefix: "/performance/overview", tooltip: en ? "Cross-platform overview" : "跨平台總覽" },
      { to: "/performance/meta", label: "Meta", icon: <FontAwesomeIcon icon={faFacebook} />, matchPrefix: "/performance/meta", tooltip: "Meta Ads" },
      { to: "/performance/google", label: "Google", icon: <FontAwesomeIcon icon={ICON.google} />, matchPrefix: "/performance/google", tooltip: "Google Ads" },
      { to: "/performance/shopline", label: "SHOPLINE", icon: <FontAwesomeIcon icon={ICON.store} />, matchPrefix: "/performance/shopline", tooltip: "SHOPLINE / Ecommerce" },
      { to: "/performance/91app", label: "91APP", icon: <FontAwesomeIcon icon={ICON.store} />, matchPrefix: "/performance/91app", tooltip: "91APP / Ecommerce" },
      { to: "/performance/ga", label: "GA", icon: <FontAwesomeIcon icon={faChartLine} />, matchPrefix: "/performance/ga", tooltip: "GA / Website" },
      { to: "/performance/attribution", label: en ? "Attribution" : "歸因", icon: <FontAwesomeIcon icon={faDatabase} />, matchPrefix: "/performance/attribution", tooltip: en ? "Attribution" : "整合歸因" },
      // 2026-08-13 (CJ「新的任務 tray，稱為粉絲團月報，是 dev 底下大家都有的」)
      { to: "/performance/fanpage_monthly", label: en ? "FB Monthly" : "粉絲團月報", icon: <FontAwesomeIcon icon={faFileLines} />, matchPrefix: "/performance/fanpage_monthly", tooltip: en ? "Fanpage monthly report" : "上傳自己的月報版型，找出可自動填的欄位" },
      // 2026-09-30：活動企劃的目標 vs 真的發出去的貼文（成效層「活動」tray）。
      { to: "/performance/campaign", label: en ? "Campaigns" : "活動", icon: <FontAwesomeIcon icon={ICON.campaign} />, matchPrefix: "/performance/campaign", tooltip: en ? "Campaign plan vs what was actually posted" : "活動企劃 vs 真的發出去的貼文" },
    ];
  }

  // 2026-09-27（CJ「左邊的 mission tray 要做大改變：除了專案、行事曆、活動以外，所有的
  // mission tray 變成使用者自己可以加入，自己選要加 facebook、instagram 或其他通路……
  // 功能都有了，但使用體驗還是很反直覺」）：原本 16 個入口一字排開。現在分兩段——
  //   上段：這個品牌自己加的（navPrefs，預設 Facebook＋Instagram），可增刪排序
  //   下段：固定的專案、行事曆（排程與發布＋當月規劃合一）、活動
  // 首頁頁籤 9/27 已拿掉；品牌大腦在策略層（isStrategyPreview 現在恆為 true）。
  const catalog = navCatalog(lang, allowedTaskRoutes, customChannels);
  const byId = new Map(catalog.map((c) => [c.id!, c]));
  const userItems = (userNavItems ?? []).map((id) => byId.get(id)).filter(Boolean) as NavItem[];
  // 2026-09-27（CJ「用本週企劃取代行事曆」「登入後直接落在本週企劃」）：本週企劃排第一，
  // 已排程／已發布與活動企劃的格子都在它的週曆上；/calendar 轉到 /planner。
  // 2026-09-30 CJ：順序改成 本週企劃（最上）→ 各平台 → ＋ → 靈感、專案、活動。
  const top: NavItem[] = [
    { to: "/planner", label: en ? "This week" : "本週企劃", icon: <FontAwesomeIcon icon={faCalendarDays} />, group: "top",
      matchPrefix: "/planner", alsoMatch: ["/calendar"],
      tooltip: en ? "Plan the week with your content director" : "跟內容總監排這一週" },
  ];
  const fixed: NavItem[] = [
    // 2026-09-29 CJ：七日發布台改成靈感舞台；舊的 /theater 轉址到 /inspiration。
    { to: "/inspiration", label: en ? "Idea stage" : "靈感舞台", short: en ? "Ideas" : "靈感", icon: <FontAwesomeIcon icon={ICON.ideas} />, matchPrefix: "/inspiration", group: "fixed",
      tooltip: en ? "Agents pitch angles; pick one to write" : "幾位 agent 各想切角，挑一個開始寫" },
    { to: "/projects", label: en ? "Projects" : "專案", icon: <FontAwesomeIcon icon={faFolderOpen} />, group: "fixed",
      tooltip: en ? "Everything you've produced, by project" : "你產出過的內容，依專案整理" },
    // 2026-09-25（CJ「在內容層增加活動的 mission tray」）：卡片由策略層的宣傳企劃長出來。
    { to: "/campaigns", label: en ? "Campaigns" : "活動", icon: <FontAwesomeIcon icon={faBullhorn} />, matchPrefix: "/campaigns", group: "fixed",
      tooltip: en ? "Write out a campaign plan, post by post" : "照活動企劃一篇一篇寫" },
  ];
  return [...top, ...userItems.map((it) => ({ ...it, group: "user" as const })), ...fixed];
}

/**
 * 內容層可以自行加入的入口（挑選清單的內容）。任務包限定頻道的品牌只列包裡有的；
 * 案例只在包裡有 case 時列——全域目錄沒有案例卡，沒有包的品牌加了也是空頁。
 */
export function navCatalog(lang: "zh-TW" | "en", allowedTaskRoutes?: Set<string> | null, customChannels?: { id: string; name: string; preset?: string | null }[]): NavItem[] {
  const en = lang === "en";
  // 2026-09-29 CJ：內容通路只留 FB／IG／Threads／LINE／TikTok／電子報／官網。LinkedIn／
  // YouTube／新聞稿／X 拿掉（server planGate.HIDDEN_CONTENT_PLATFORMS 同一份決定）；
  // Threads、LINE 是為台灣市場加的。
  const all: NavItem[] = [
    { id: "fb", kind: "channel", to: "/tasks/fb", label: "Facebook", short: "FB", icon: <FontAwesomeIcon icon={faFacebook} />, matchPrefix: "/tasks/fb",
      tooltip: en ? "Facebook posts, ads, stories, live copy" : "Facebook 貼文 / 廣告 / 限時 / 直播文案" },
    { id: "ig", kind: "channel", to: "/tasks/ig", label: "Instagram", short: "IG", icon: <FontAwesomeIcon icon={faInstagram} />, matchPrefix: "/tasks/ig",
      tooltip: en ? "Instagram captions, Reels, carousel, Stories" : "IG 貼文 / Reels / 輪播 / 限時動態" },
    { id: "threads", kind: "channel", to: "/tasks/threads", label: "Threads", icon: <FontAwesomeIcon icon={faThreads} />, matchPrefix: "/tasks/threads",
      tooltip: en ? "Threads posts and threads" : "Threads 串文 / 短貼文" },
    { id: "line", kind: "channel", to: "/tasks/line", label: "LINE", icon: <FontAwesomeIcon icon={faLine} />, matchPrefix: "/tasks/line",
      tooltip: en ? "LINE Official Account broadcasts" : "LINE 官方帳號群發訊息" },
    { id: "tt", kind: "channel", to: "/tasks/tt", label: "TikTok", icon: <FontAwesomeIcon icon={faTiktok} />, matchPrefix: "/tasks/tt",
      tooltip: en ? "TikTok hooks, scripts, hashtags, bio" : "TikTok 開場鉤子 / 腳本 / 主題標籤" },
    { id: "email", kind: "channel", to: "/tasks/email", label: en ? "Email" : "電子報", icon: <FontAwesomeIcon icon={faEnvelope} />, matchPrefix: "/tasks/email",
      tooltip: en ? "Email newsletters, welcome series, promo emails" : "電子報 / 歡迎信 / 促銷郵件序列" },
    { id: "web", kind: "channel", to: "/tasks/web", label: en ? "Website" : "官網", icon: <FontAwesomeIcon icon={faGlobe} />, matchPrefix: "/tasks/web",
      tooltip: en ? "Long-form articles, brand columns, case studies, product page copy" : "官網長文 / 品牌專欄 / 案例深度 / 產品頁文案" },
    { id: "case", kind: "tool", to: "/tasks/case", label: en ? "Cases" : "案例", icon: <FontAwesomeIcon icon={faBookBookmark} />, matchPrefix: "/tasks/case",
      tooltip: en ? "Case library, filed by standard" : "依標準建檔的案例庫" },
    // 2026-09-30 CJ：靈感舞台改成固定入口（＋ 下方），不再是可自選項目；
    // 存過 "theater" 的品牌設定在 userNavItems 會被濾掉，不用搬資料。
  ];
  const builtin = all.filter((it) => {
    if (!it.to.startsWith("/tasks/")) return true;
    if (it.id === "case") return !!allowedTaskRoutes?.has(it.to);
    return !allowedTaskRoutes || allowedTaskRoutes.has(it.to);
  });
  // 2026-10-04（CJ「用戶也可自己增加 mission tray，例如蝦皮、momo、網紅合作」）：用戶自己加的通路。
  // 不受任務包的 allowedTaskRoutes 過濾 —— 那是「包宣告了哪些內建通路」，自訂通路是用戶自己的。
  // 2026-10-06（CJ「目前的網紅合作，跟我們規劃的參考靈感牆的設計不相同，回到任務卡的設計概念了」）：
  // 網紅合作不是任務卡頁——點了直接進「網紅切角」（/influencers，版面照靈感舞台）。
  const custom: NavItem[] = (customChannels ?? []).map((c) => (c.preset === "influencer"
    ? {
      id: c.id, kind: "channel" as const, to: "/influencers", label: c.name, short: c.name.slice(0, 4),
      icon: <FontAwesomeIcon icon={ICON.people} />, matchPrefix: "/influencers", alsoMatch: [`/tasks/${c.id}`],
      tooltip: en ? "Read each creator's links; one angle each" : "讀每位網紅的連結，一人配一個切角",
    }
    : {
      id: c.id, kind: "channel" as const, to: `/tasks/${c.id}`, label: c.name, short: c.name.slice(0, 4),
      icon: <FontAwesomeIcon icon={ICON.store} />, matchPrefix: `/tasks/${c.id}`,
      tooltip: en ? "A tray you added" : "你自己加的 mission tray",
    }));
  return [...builtin, ...custom];
}
