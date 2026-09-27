/**
 * CalendarPage — 日曆（排程 & 發布管理）
 *
 * 2026-06-01 (CJ「七日發布台的用戶體驗有問題，全部都修改好，不知道如何發布」)
 *
 * Complete UX overhaul:
 * - Default view: 七日 (7-day week strip showing today + next 6 days)
 * - Toggle to: 月曆 (full month grid, secondary)
 * - Each empty day slot has a "＋ 新增貼文" button → platform picker → task page
 * - Scheduled posts are directly cancellable + reschedulable from the calendar
 * - "如何發布" onboarding strip explains the 3-step flow, dismissible
 * - calendarRouter.range used with proper loading/error states (no silent fail)
 * - calendarRouter.schedule / reschedule / cancel mutations exposed
 */
import React, { useMemo, useState, useRef, useEffect } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import CalendarTabs from "../components/CalendarTabs";
import { trpc } from "../../../lib/trpc";
import type { ShellOutletCtx } from "../../app/shell/ShellLayout";
import {
  ChevronLeft, ChevronRight, X, Sparkles,
  Plus, ExternalLink, Clock, CheckCircle2,
  AlertCircle, LayoutGrid, CalendarDays, Info,
  RefreshCw, Trash2, Loader2,
} from "lucide-react";
import { useLang } from "../../../lib/i18n";
import { getFestivalHintEn } from "../lib/festivalI18n";
import {
  getCalendarPublishPayload,
  getPlanningPublishWarning,
} from "../lib/strategyContentEnvelope";

/* ── Platform metadata ────────────────────────────────────────── */
const PLATFORMS: Array<{
  key: string; label: string; color: string; route: string;
}> = [
  { key: "fb",       label: "Facebook",  color: "#1877F2", route: "/tasks/fb" },
  { key: "ig",       label: "Instagram", color: "#E1306C", route: "/tasks/ig" },
  { key: "li",       label: "LinkedIn",  color: "#0A66C2", route: "/tasks/li" },
  { key: "yt",       label: "YouTube",   color: "#FF0000", route: "/tasks/yt" },
  { key: "tt",       label: "TikTok",    color: "#000000", route: "/tasks/tt" },
  { key: "email",    label: "Email",     color: "#0EA5E9", route: "/tasks/email" },
  { key: "pr",       label: "PR",        color: "#525252", route: "/tasks/pr" },
];

const PLATFORM_COLOR: Record<string, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.key, p.color])
);
// Also handle long keys returned from DB
const PLATFORM_COLOR_FULL: Record<string, string> = {
  facebook: "#1877F2", instagram: "#E1306C", youtube: "#FF0000",
  tiktok: "#000000", linkedin: "#0A66C2", threads: "#000000",
  email: "#0EA5E9", press: "#525252", brand: "#7C3AED",
  ...PLATFORM_COLOR,
};

function getPlatformColor(p: string): string {
  return PLATFORM_COLOR_FULL[p?.toLowerCase()] ?? "#7C3AED";
}

function getPlatformLabel(p: string): string {
  const map: Record<string, string> = {
    fb: "Facebook", ig: "Instagram", li: "LinkedIn",
    yt: "YouTube", tt: "TikTok", email: "Email", pr: "PR",
    facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn",
    youtube: "YouTube", tiktok: "TikTok", press: "PR",
  };
  return map[p?.toLowerCase()] ?? p ?? "—";
}

/* ── Date helpers ─────────────────────────────────────────────── */
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function formatLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ═══════════════════════════════════════════════════════════════ */
export default function CalendarPage() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const ctx = useOutletContext<ShellOutletCtx>();
  const brandId = (ctx?.brandId as number | null) ?? null;
  const brandName = useMemo(() => {
    const list = (ctx?.brands ?? []) as Array<{ id: number; name: string }>;
    return list.find((b) => b?.id === brandId)?.name
      ?? (lang === "en" ? "All brands" : "全部品牌");
  }, [ctx, brandId, lang]);

  // View mode: "week" (7-day) vs "month"
  const [view, setView] = useState<"week" | "month">("week");

  // Dismissible onboarding strip
  const [showHowTo, setShowHowTo] = useState(() => {
    try { return !localStorage.getItem("cal_howto_dismissed"); } catch { return true; }
  });
  const dismissHowTo = () => {
    setShowHowTo(false);
    try { localStorage.setItem("cal_howto_dismissed", "1"); } catch {}
  };

  // Week cursor: start of the displayed 7-day range (defaults to today)
  const todayRef = useRef(new Date());
  const today = todayRef.current;
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Month cursor
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // 7 days for week view
  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Query window (slightly wider than view to avoid re-fetch on view toggle)
  const queryFrom = view === "week"
    ? weekDays[0]
    : new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const queryTo = view === "week"
    ? addDays(weekDays[6], 1)
    : new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);

  const rangeQ = (trpc as any).calendar?.range?.useQuery?.(
    {
      from: queryFrom.toISOString(),
      to: queryTo.toISOString(),
      brandId: brandId ?? undefined,
    },
    { refetchOnWindowFocus: false, staleTime: 20_000, keepPreviousData: true },
  );

  const items: any[] = rangeQ?.data ?? [];
  const isLoading = rangeQ?.isLoading ?? false;
  const isError = rangeQ?.isError ?? false;

  const byDay = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const it of items) {
      const d = new Date(it.at);
      const k = dayKey(d);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    return m;
  }, [items]);

  // Cancel + reschedule + publish mutations
  const cancelMut = (trpc as any).calendar?.cancel?.useMutation?.({
    onSuccess: () => rangeQ?.refetch?.(),
  });
  const rescheduleMut = (trpc as any).calendar?.reschedule?.useMutation?.({
    onSuccess: () => rangeQ?.refetch?.(),
  });
  const publishMut = (trpc as any).calendar?.publish?.useMutation?.({
    onSuccess: (_r: any, _vars: any) => {
      rangeQ?.refetch?.();
    },
  });

  // Facebook connect flow — uses Pipedream SDK iframe (NOT window.open popup).
  // connect.html requires iframe context; popup throws "Must be inside iframe".
  const fbConnectUrlMut = (trpc as any).publish?.getFacebookConnectUrl?.useMutation?.();
  const fbPagesMut      = (trpc as any).publish?.getFacebookPages?.useMutation?.();
  const setFbPageMut    = (trpc as any).publish?.setBrandFacebookPage?.useMutation?.({
    onSuccess: () => rangeQ?.refetch?.(),
  });
  const [fbPages, setFbPages] = useState<Array<{ id: string; name: string; category: string }>>([]);
  const [fbPickerBrandId, setFbPickerBrandId] = useState<number | null>(null);

  // bundle.social connect path. Which backend owns Facebook is decided by the
  // server (PUBLISH_PROVIDER_FACEBOOK); the browser just follows.
  const bundleProvidersQ    = (trpc as any).bundleConnect?.getProviders?.useQuery?.();
  const bundleConnectUrlMut = (trpc as any).bundleConnect?.getConnectUrl?.useMutation?.();
  const bundleStatusMut     = (trpc as any).bundleConnect?.getConnectionStatus?.useMutation?.();
  const usesBundleForFacebook = bundleProvidersQ?.data?.facebook === "bundle";

  // Pipedream opens its OAuth popup inside connectAccount(). Keep both the SDK
  // and one-time Connect token warm so the actual button click can call it
  // synchronously while the browser's user activation is still valid.
  type FacebookConnectToken = {
    token: string;
    expiresAt: number;
    oauthAppId: string | null;
  };
  type FacebookPage = {
    id: string;
    name: string;
    category: string;
    publishReady?: boolean;
    permissionError?: string;
  };
  type FacebookPagesCache = {
    pages: FacebookPage[];
    connectedAccountCount: number;
    checkedAt: number;
  };
  const pdCreateClientRef = useRef<any>(null);
  const pdFacebookTokensRef = useRef<Record<number, FacebookConnectToken>>({});
  const pdFacebookPagesRef = useRef<Record<number, FacebookPagesCache | undefined>>({});
  const pdFacebookPrefetchingRef = useRef<Record<number, boolean>>({});
  // Portal links expire, so cache one per brand and mint a fresh one after use.
  const bundleConnectUrlRef = useRef<Record<number, string | undefined>>({});

  useEffect(() => {
    import("@pipedream/sdk/browser")
      .then((m) => { pdCreateClientRef.current = m.createFrontendClient; })
      .catch(() => { /* retried by prefetchFacebookConnect */ });
  }, []);

  const prefetchFacebookConnect = React.useCallback(async (calBrandId: number) => {
    if (pdFacebookPrefetchingRef.current[calBrandId]) return;

    // bundle.social: warm a portal URL so the click can call window.open()
    // synchronously and keep the browser's user activation (no popup block).
    if (usesBundleForFacebook) {
      if (bundleConnectUrlRef.current[calBrandId]) return;
      pdFacebookPrefetchingRef.current[calBrandId] = true;
      try {
        const r = await bundleConnectUrlMut?.mutateAsync?.({
          brandId: calBrandId,
          platform: "facebook",
          redirectUrl: window.location.href,
        });
        if (r?.url) bundleConnectUrlRef.current[calBrandId] = r.url;
      } finally {
        pdFacebookPrefetchingRef.current[calBrandId] = false;
      }
      return;
    }
    const cached = pdFacebookTokensRef.current[calBrandId];
    const pageCache = pdFacebookPagesRef.current[calBrandId];
    const pagesChecked = !!pageCache && Date.now() - pageCache.checkedAt < 10_000;
    if (pdCreateClientRef.current && cached?.expiresAt - Date.now() > 60_000 && pagesChecked) return;

    pdFacebookPrefetchingRef.current[calBrandId] = true;
    try {
      const [sdk, response, existing] = await Promise.all([
        pdCreateClientRef.current
          ? Promise.resolve(null)
          : import("@pipedream/sdk/browser"),
        cached?.expiresAt - Date.now() > 60_000
          ? Promise.resolve(null)
          : fbConnectUrlMut?.mutateAsync?.({ brandId: calBrandId }),
        pagesChecked
          ? Promise.resolve(null)
          : fbPagesMut?.mutateAsync?.({
              brandId: calBrandId,
              waitForPropagation: false,
            }).catch(() => null),
      ]);
      if (sdk) pdCreateClientRef.current = sdk.createFrontendClient;
      if (response?.token) {
        pdFacebookTokensRef.current[calBrandId] = {
          token: response.token,
          expiresAt: response.expiresAt
            ? new Date(response.expiresAt).getTime()
            : Date.now() + 300_000,
          oauthAppId: response.oauthAppId ?? null,
        };
      }
      if (existing) {
        pdFacebookPagesRef.current[calBrandId] = {
          pages: existing.pages ?? [],
          connectedAccountCount: existing.connectedAccountCount ?? 0,
          checkedAt: Date.now(),
        };
      }
    } finally {
      pdFacebookPrefetchingRef.current[calBrandId] = false;
    }
  }, [fbConnectUrlMut, fbPagesMut, usesBundleForFacebook, bundleConnectUrlMut]);

  const connectFacebookFromCalendar = React.useCallback((calBrandId: number) => {
    // bundle.social hosts the whole OAuth + Page-picking UI, so there is no
    // local page picker on this path — open the portal and poll for the result.
    if (usesBundleForFacebook) {
      const url = bundleConnectUrlRef.current[calBrandId];
      if (!url) {
        void prefetchFacebookConnect(calBrandId).catch((err: any) => {
          alert(err?.message ?? String(err));
        });
        alert(lang === "en"
          ? "Preparing the Facebook connect link — please try again in a moment."
          : "正在準備 Facebook 連接連結，請稍候 1–2 秒再點一次。");
        return;
      }
      // Portal links are single-use; drop it so the next click mints a fresh one.
      delete bundleConnectUrlRef.current[calBrandId];
      window.open(url, "_blank", "noopener");

      void (async () => {
        for (let i = 0; i < 20; i++) {
          await new Promise<void>((res) => setTimeout(res, 3000));
          try {
            const s = await bundleStatusMut?.mutateAsync?.({
              brandId: calBrandId,
              platform: "facebook",
            });
            if (s?.connected) {
              rangeQ?.refetch?.();
              alert(lang === "en"
                ? `Facebook connected${s.accountName ? `: ${s.accountName}` : ""}.`
                : `Facebook 已連接${s.accountName ? `：${s.accountName}` : ""}。`);
              return;
            }
          } catch { /* keep polling until the loop ends */ }
        }
      })();
      return;
    }

    const pageCache = pdFacebookPagesRef.current[calBrandId];
    const publishablePages = (pageCache?.pages ?? [])
      .filter((page) => page.publishReady !== false);
    if (publishablePages.length > 0) {
      setFbPages(publishablePages);
      setFbPickerBrandId(calBrandId);
      return;
    }

    const createFrontendClient = pdCreateClientRef.current;
    const cached = pdFacebookTokensRef.current[calBrandId];
    const pageCheckFresh = !!pageCache && Date.now() - pageCache.checkedAt < 10_000;
    if (
      !createFrontendClient
      || !cached
      || cached.expiresAt - Date.now() < 30_000
      || !pageCheckFresh
      || pdFacebookPrefetchingRef.current[calBrandId]
    ) {
      void prefetchFacebookConnect(calBrandId).catch((err: any) => {
        alert(err?.message ?? String(err));
      });
      alert(lang === "en"
        ? "Checking your existing Facebook connection — please try again in a moment."
        : "正在檢查既有 Facebook 授權，請稍候 1–2 秒再點一次。");
      return;
    }

    // Do not repeat the managed Pipedream OAuth loop: its Meta app can list
    // Pages but lacks pages_read_engagement / pages_manage_posts. Once a custom
    // OAuth app is configured, allow one replacement authorization.
    if (pageCache.connectedAccountCount > 0 && !cached.oauthAppId) {
      const hasVisibleButUnpublishablePage = pageCache.pages.length > 0;
      alert(lang === "en"
        ? hasVisibleButUnpublishablePage
          ? "Facebook is connected, but the authorization only allows listing Pages and cannot publish. Please contact support to enable the approved Meta OAuth app."
          : "Facebook is authorized, but this account does not expose any managed Pages. Check your Page access in Meta Business Settings, then try again."
        : hasVisibleButUnpublishablePage
          ? "Facebook 已連接，但目前授權只能列出粉專，沒有讀取／發布權限。請聯絡客服啟用核准的 Meta OAuth 應用程式。"
          : "Facebook 已授權，但此帳號目前沒有可管理的粉專。請先到 Meta 商業設定確認粉專存取權，再重試。");
      return;
    }

    const pd = createFrontendClient({
      externalUserId: `sowork-brand-${calBrandId}`,
      tokenCallback: async () => ({
        token: cached.token,
        expiresAt: new Date(cached.expiresAt),
        connectLinkUrl: "",
      } as any),
    });
    pd.connectAccount({
      token: cached.token,
      app: "facebook_pages",
      oauthAppId: cached.oauthAppId ?? undefined,
      onSuccess: async () => {
        delete pdFacebookTokensRef.current[calBrandId];
        delete pdFacebookPagesRef.current[calBrandId];
        // Poll getFacebookPages with backoff — Pipedream may take 5-20s to propagate
        let lastPages: FacebookPage[] = [];
        let lastConnectedAccountCount = 1;
        for (let i = 0; i < 10; i++) {
          await new Promise<void>(res => setTimeout(res, i === 0 ? 1500 : 2000));
          try {
            const pages = await fbPagesMut?.mutateAsync?.({
              brandId: calBrandId,
              waitForPropagation: false,
            });
            lastPages = pages?.pages ?? [];
            lastConnectedAccountCount = pages?.connectedAccountCount ?? 1;
            const readyPages = lastPages
              .filter((page: FacebookPage) => page.publishReady !== false);
            pdFacebookPagesRef.current[calBrandId] = {
              pages: lastPages,
              connectedAccountCount: lastConnectedAccountCount,
              checkedAt: Date.now(),
            };
            if (readyPages.length > 0) {
              setFbPages(readyPages);
              setFbPickerBrandId(calBrandId);
              return;
            }
          } catch { /* keep retrying */ }
        }
        pdFacebookPagesRef.current[calBrandId] = {
          pages: lastPages,
          connectedAccountCount: lastConnectedAccountCount,
          checkedAt: Date.now(),
        };
        alert(lang === "en"
          ? "Facebook authorization completed, but Meta still did not grant Page read / publish permissions. Check the custom OAuth app permissions and reconnect."
          : "Facebook 授權完成，但 Meta 仍未授予粉專讀取／發布權限。請檢查自訂 OAuth 應用程式權限後重新連接。");
      },
      onError: (err: any) => {
        delete pdFacebookTokensRef.current[calBrandId];
        void prefetchFacebookConnect(calBrandId).catch(() => {});
        alert(lang === "en" ? `Authorization failed: ${err?.message ?? "Unknown error"}` : `授權失敗：${err?.message ?? "未知錯誤"}`);
      },
      onClose: ({ successful }: any) => {
        if (!successful) {
          delete pdFacebookTokensRef.current[calBrandId];
          void prefetchFacebookConnect(calBrandId).catch(() => {});
        }
      },
    });
  }, [lang, fbPagesMut, prefetchFacebookConnect, usesBundleForFacebook, bundleStatusMut, rangeQ]);

  // Platform picker modal state
  const [pickerDate, setPickerDate] = useState<Date | null>(null);

  // Reschedule popover state
  const [rescheduleId, setRescheduleId] = useState<number | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState<string>("");

  const monthLabel = monthCursor.toLocaleDateString(
    lang === "en" ? "en-US" : "zh-TW",
    { year: "numeric", month: "long" },
  );

  // Build month grid (42 cells)
  const monthDays = useMemo(() => {
    const firstWeekday = monthCursor.getDay();
    const result: Array<{ date: Date; inMonth: boolean }> = [];
    for (let i = firstWeekday; i > 0; i--) {
      const d = new Date(monthCursor);
      d.setDate(d.getDate() - i);
      result.push({ date: d, inMonth: false });
    }
    const daysInMonth = new Date(
      monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0
    ).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      result.push({ date: new Date(monthCursor.getFullYear(), monthCursor.getMonth(), i), inMonth: true });
    }
    while (result.length < 42) {
      const last = result[result.length - 1]!.date;
      const d = new Date(last);
      d.setDate(d.getDate() + 1);
      result.push({ date: d, inMonth: false });
    }
    return result;
  }, [monthCursor]);

  const weekLabel = (() => {
    const s = weekDays[0];
    const e = weekDays[6];
    const fmt = (d: Date) => d.toLocaleDateString(lang === "en" ? "en-US" : "zh-TW", { month: "short", day: "numeric" });
    return `${fmt(s)} – ${fmt(e)}`;
  })();

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFA" }}>
      {/* 2026-09-27：行事曆合一——跟「當月規劃」共用同一組分頁。 */}
      <CalendarTabs />
      {/* ── Hero header ──────────────────────────────────────────── */}
      <div className="pt-8 pb-4 px-6 text-center">
        <div className="flex flex-col items-center max-w-[1100px] mx-auto">
          <p className="text-[12px] font-semibold uppercase tracking-[0.25em] text-default-600 mb-2">
            {lang === "en" ? "PUBLISHING · CONTENT CALENDAR" : "日曆 · 排程 & 發布管理"}
          </p>
          <h1
            className="font-semibold tracking-tight leading-tight"
            style={{
              fontSize: "clamp(1.5rem, 2.5vw, 2rem)",
              background: "#171717",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {lang === "en" ? "Content Calendar" : "日曆"}
          </h1>
          <p className="mt-2 text-default-500" style={{ fontSize: 13 }}>
            {lang === "en"
              ? `${brandName} — schedule, track, and publish across platforms`
              : `${brandName}｜排程、追蹤、跨平台發布，一個頁面全搞定`}
          </p>
        </div>
      </div>

      {/* ── How-to-publish strip ──────────────────────────────────── */}
      {showHowTo && (
        <div className="max-w-[1100px] mx-auto px-6 mb-5">
          <div
            className="rounded-xl px-5 py-4 relative"
            style={{ background: "#F7F6F4", border: "1px solid #a7f3d0" }}
          >
            <button
              onClick={dismissHowTo}
              className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/60 flex items-center justify-center text-default-500 hover:bg-white"
            >
              <X size={12} />
            </button>
            <div className="flex items-center gap-2 mb-3">
              <Info size={14} className="text-emerald-700" />
              <span className="text-[12px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                {lang === "en" ? "HOW TO PUBLISH A POST" : "如何發布一篇貼文"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                {
                  step: "1",
                  zh: "選平台，跑任務",
                  en: "Pick a platform & run a task",
                  desc_zh: "點下方「＋ 新增貼文」選平台，AI 幫你生成貼文草稿",
                  desc_en: "Click「＋ New post」below, pick a platform, AI drafts your post",
                  color: "#7c3aed",
                },
                {
                  step: "2",
                  zh: "在結果頁確認內容",
                  en: "Review the result",
                  desc_zh: "AI 生成完成後，結果頁可編輯文案、選擇圖片",
                  desc_en: "After AI finishes, review and edit the caption on the output page",
                  color: "#0ea5e9",
                },
                {
                  step: "3",
                  zh: "按「排程」或「立即發布」",
                  en: "Schedule or Publish now",
                  desc_zh: "點結果頁上方的「排程發布」→ 選日期時間 → 貼文會出現在這裡",
                  desc_en: "Click「Schedule」on the output page → pick date/time → appears here",
                  color: "#10b981",
                },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-3">
                  <div
                    className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold text-white mt-0.5"
                    style={{ background: s.color }}
                  >
                    {s.step}
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-default-900">
                      {lang === "en" ? s.en : s.zh}
                    </p>
                    <p className="text-[12px] text-default-500 mt-0.5 leading-relaxed">
                      {lang === "en" ? s.desc_en : s.desc_zh}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Festival nudge ────────────────────────────────────────── */}
      <FestivalNudgeBanner brandId={brandId} navigate={navigate} lang={lang} />

      {/* ── View toggle + navigation bar ─────────────────────────── */}
      <div className="max-w-[1100px] mx-auto px-6 mb-4 flex items-center justify-between gap-4">
        {/* View toggle */}
        <div
          className="flex items-center rounded-lg overflow-hidden"
          style={{ border: "1px solid #D4D4D4", background: "white" }}
        >
          {[
            { key: "week", icon: <CalendarDays size={13} />, label: lang === "en" ? "7-day" : "七日" },
            { key: "month", icon: <LayoutGrid size={13} />, label: lang === "en" ? "Month" : "月曆" },
          ].map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key as any)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors"
              style={{
                background: view === v.key ? "#171717" : "transparent",
                color: view === v.key ? "white" : "#525252",
              }}
            >
              {v.icon}{v.label}
            </button>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          {view === "week" ? (
            <>
              <button
                onClick={() => setWeekStart((s) => addDays(s, -7))}
                className="w-7 h-7 rounded border border-default-300 hover:border-default-900 flex items-center justify-center"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="text-[13px] font-semibold text-default-900 min-w-[150px] text-center tabular-nums">
                {weekLabel}
              </span>
              <button
                onClick={() => setWeekStart((s) => addDays(s, 7))}
                className="w-7 h-7 rounded border border-default-300 hover:border-default-900 flex items-center justify-center"
              >
                <ChevronRight size={13} />
              </button>
              <button
                onClick={() => {
                  const d = new Date(today);
                  d.setHours(0, 0, 0, 0);
                  setWeekStart(d);
                }}
                className="ml-1 px-2.5 py-1 text-[12px] border border-default-300 rounded hover:border-default-900"
              >
                {lang === "en" ? "Today" : "今天"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
                className="w-7 h-7 rounded border border-default-300 hover:border-default-900 flex items-center justify-center"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="text-[13px] font-semibold text-default-900 min-w-[110px] text-center">
                {monthLabel}
              </span>
              <button
                onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
                className="w-7 h-7 rounded border border-default-300 hover:border-default-900 flex items-center justify-center"
              >
                <ChevronRight size={13} />
              </button>
              <button
                onClick={() => setMonthCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
                className="ml-1 px-2.5 py-1 text-[12px] border border-default-300 rounded hover:border-default-900"
              >
                {lang === "en" ? "Today" : "今天"}
              </button>
            </>
          )}
        </div>

        {/* Legend */}
        <div className="hidden md:flex items-center gap-3 text-[12px] text-default-600">
          <span className="flex items-center gap-1.5">
            <Clock size={11} className="text-default-400" />
            {lang === "en" ? "Scheduled" : "待發布"}
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={11} className="text-emerald-600" />
            {lang === "en" ? "Published" : "已發布"}
          </span>
          <span className="flex items-center gap-1.5">
            <AlertCircle size={11} className="text-amber-500" />
            {lang === "en" ? "Failed" : "失敗"}
          </span>
        </div>
      </div>

      {/* ── Loading / Error states ────────────────────────────────── */}
      {isError && (
        <div className="max-w-[1100px] mx-auto px-6 mb-4">
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-lg"
            style={{ background: "#fef2f2", border: "1px solid #fecaca" }}
          >
            <AlertCircle size={14} className="text-red-500 shrink-0" />
            <p className="text-[12px] text-red-700 flex-1">
              {lang === "en"
                ? "Failed to load calendar data."
                : "載入行事曆資料失敗。"}
            </p>
            <button
              onClick={() => rangeQ?.refetch?.()}
              className="flex items-center gap-1 px-3 py-1 rounded text-[12px] font-medium text-red-700 hover:bg-red-100"
            >
              <RefreshCw size={11} />
              {lang === "en" ? "Retry" : "重試"}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ── WEEK VIEW ─────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {view === "week" && (
        <div className="max-w-[1100px] mx-auto px-6 pb-12">
          {isLoading ? (
            <WeekSkeleton />
          ) : (
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid #D4D4D4", background: "white" }}
            >
              {/* Day header row */}
              <div className="grid grid-cols-7" style={{ borderBottom: "1px solid #D4D4D4" }}>
                {weekDays.map((d, i) => {
                  const isT = isSameDay(d, today);
                  const isPast = d < today && !isT;
                  const weekdayLabel = d.toLocaleDateString(
                    lang === "en" ? "en-US" : "zh-TW", { weekday: "short" }
                  );
                  const dayItems = byDay.get(dayKey(d)) ?? [];
                  return (
                    <div
                      key={i}
                      className="px-3 py-2.5 text-center"
                      style={{
                        borderRight: i < 6 ? "1px solid #E5E5E5" : undefined,
                        background: isT ? "#171717" : "transparent",
                      }}
                    >
                      <p
                        className="text-[12px] font-semibold uppercase tracking-[0.15em] mb-1"
                        style={{ color: isT ? "rgba(255,255,255,0.7)" : isPast ? "#a3a3a3" : "#525252" }}
                      >
                        {weekdayLabel}
                      </p>
                      <p
                        className="text-[18px] font-bold tabular-nums leading-none"
                        style={{ color: isT ? "white" : isPast ? "#a3a3a3" : "#171717" }}
                      >
                        {d.getDate()}
                      </p>
                      <p
                        className="text-[12px] mt-0.5"
                        style={{ color: isT ? "rgba(255,255,255,0.55)" : "#a3a3a3" }}
                      >
                        {d.toLocaleDateString(lang === "en" ? "en-US" : "zh-TW", { month: "short" })}
                      </p>
                      {dayItems.length > 0 && (
                        <div
                          className="mt-1.5 mx-auto w-5 h-1 rounded-full"
                          style={{ background: isT ? "rgba(255,255,255,0.4)" : "#7c3aed" }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Day content columns */}
              <div className="grid grid-cols-7" style={{ minHeight: 420 }}>
                {weekDays.map((d, i) => {
                  const isT = isSameDay(d, today);
                  const isPast = d < today && !isT;
                  const dayItems = byDay.get(dayKey(d)) ?? [];
                  return (
                    <div
                      key={i}
                      className="flex flex-col"
                      style={{
                        borderRight: i < 6 ? "1px solid #E5E5E5" : undefined,
                        background: isT ? "rgba(124,58,237,0.02)" : isPast ? "#fafafa" : "white",
                        minHeight: 420,
                      }}
                    >
                      {/* Posts */}
                      <div className="flex-1 p-2 flex flex-col gap-1.5">
                        {dayItems.length === 0 && !isLoading && (
                          <div className="flex-1 flex flex-col items-center justify-center py-6">
                            <p className="text-[12px] text-default-300 text-center leading-relaxed">
                              {isPast
                                ? (lang === "en" ? "No posts" : "無發布記錄")
                                : (lang === "en" ? "Nothing\nscheduled" : "尚無排程")}
                            </p>
                          </div>
                        )}
                        {dayItems.map((it: any, j: number) => (
                          <PostPill
                            key={j}
                            item={it}
                            lang={lang}
                            navigate={navigate}
                            onCancel={(id) => cancelMut?.mutateAsync?.({ id })}
                            onReschedule={(id, at) => {
                              setRescheduleId(id);
                              setRescheduleAt(formatLocalDatetimeInput(new Date(at)));
                            }}
                            onPublish={(id, contentKind) => publishMut?.mutateAsync?.(
                              getCalendarPublishPayload(id, contentKind),
                            )}
                            onConnectFacebook={connectFacebookFromCalendar}
                            onPrefetchFacebook={prefetchFacebookConnect}
                            rescheduling={rescheduleId === it.id}
                          />
                        ))}
                      </div>
                      {/* Add post button */}
                      {!isPast && (
                        <div className="p-2 pt-0">
                          <button
                            onClick={() => setPickerDate(d)}
                            className="w-full py-2 rounded-lg text-[12px] font-medium flex items-center justify-center gap-1 transition-colors"
                            style={{
                              border: "1px dashed #D4D4D4",
                              color: "#a3a3a3",
                              background: "transparent",
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.borderColor = "#7c3aed";
                              (e.currentTarget as HTMLButtonElement).style.color = "#7c3aed";
                              (e.currentTarget as HTMLButtonElement).style.background = "rgba(124,58,237,0.04)";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.borderColor = "#D4D4D4";
                              (e.currentTarget as HTMLButtonElement).style.color = "#a3a3a3";
                              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                            }}
                          >
                            <Plus size={11} />
                            {lang === "en" ? "New post" : "新增貼文"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ── MONTH VIEW ────────────────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {view === "month" && (
        <div className="max-w-[1100px] mx-auto px-6 pb-12">
          {isLoading && (
            <div className="flex justify-center py-16">
              <Loader2 size={22} className="animate-spin text-default-400" />
            </div>
          )}
          {!isLoading && items.length === 0 && (
            <div
              className="flex items-center gap-4 px-5 py-4 rounded-xl mb-4"
              style={{ border: "1px dashed #D4D4D4", background: "#fafafa" }}
            >
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-default-700 mb-0.5">
                  {lang === "en" ? "No posts scheduled this month" : "本月尚無排程或發布記錄"}
                </p>
                <p className="text-[12px] text-default-400">
                  {lang === "en"
                    ? "Run a task → click \"Schedule\" on the result page → appears here."
                    : "跑任務 → 在結果頁按「排程」→ 選日期 → 貼文自動出現在這裡。"}
                </p>
              </div>
              <button
                className="shrink-0 px-4 py-2 rounded-lg text-[12px] font-semibold bg-default-900 text-white hover:bg-default-700"
                onClick={() => navigate("/tasks/fb")}
              >
                {lang === "en" ? "→ Start a task" : "→ 去跑任務"}
              </button>
            </div>
          )}
          {!isLoading && (
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid #D4D4D4", background: "white" }}
            >
              {/* Day-of-week header */}
              <div className="grid grid-cols-7" style={{ borderBottom: "1px solid #D4D4D4" }}>
                {(lang === "en"
                  ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
                  : ["日", "一", "二", "三", "四", "五", "六"]
                ).map((dw) => (
                  <div
                    key={dw}
                    className="text-[12px] font-semibold uppercase tracking-[0.18em] text-default-500 py-2 px-3 border-r border-default-200 last:border-r-0"
                  >
                    {dw}
                  </div>
                ))}
              </div>
              {/* Cells */}
              <div className="grid grid-cols-7" style={{ minHeight: 540 }}>
                {monthDays.map((dc, i) => {
                  const k = dayKey(dc.date);
                  const cellItems = byDay.get(k) ?? [];
                  const isT = isSameDay(dc.date, today);
                  const isPast = dc.date < today && !isT;
                  return (
                    <div
                      key={i}
                      className="border-r border-b border-default-100 last:border-r-0 p-1.5 relative flex flex-col"
                      style={{
                        minHeight: 88,
                        background: dc.inMonth ? (isT ? "rgba(124,58,237,0.02)" : "white") : "#FAFAFA",
                        opacity: dc.inMonth ? 1 : 0.45,
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className="text-[12px] font-semibold tabular-nums"
                          style={{
                            color: isT ? "white" : "#525252",
                            background: isT ? "#171717" : "transparent",
                            borderRadius: 4,
                            padding: isT ? "1px 5px" : "1px 2px",
                          }}
                        >
                          {dc.date.getDate()}
                        </span>
                        {cellItems.length > 2 && (
                          <span className="text-[12px] text-default-500 font-medium">
                            +{cellItems.length - 2}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5 flex-1">
                        {cellItems.slice(0, 2).map((it: any, j: number) => {
                          const color = getPlatformColor(it.platform);
                          const isPublished = it.kind === "published";
                          const isFailed = it.status === "failed";
                          const dot = isPublished ? "#10b981" : isFailed ? "#f59e0b" : "#525252";
                          return (
                            <button
                              key={j}
                              onClick={() => navigate(`/run/${it.outputId}`)}
                              className="w-full text-left text-[12px] truncate px-1.5 py-0.5 rounded flex items-center gap-1 hover:bg-default-100"
                              title={`${it.brandName ?? ""}・${it.preview ?? it.missionTitle ?? ""}`}
                              style={{ borderLeft: `2px solid ${color}` }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
                              <span className="truncate">{String(it.preview || it.missionTitle || "—")}</span>
                            </button>
                          );
                        })}
                      </div>
                      {/* Add button for future / today cells */}
                      {dc.inMonth && !isPast && (
                        <button
                          onClick={() => setPickerDate(dc.date)}
                          className="mt-auto w-full py-0.5 rounded text-[12px] text-default-300 hover:text-violet-600 hover:bg-violet-50 flex items-center justify-center gap-0.5 transition-colors"
                        >
                          <Plus size={9} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Platform picker modal ─────────────────────────────────── */}
      {pickerDate && (
        <PlatformPickerModal
          date={pickerDate}
          lang={lang}
          brandId={brandId}
          navigate={navigate}
          onClose={() => setPickerDate(null)}
        />
      )}

      {/* ── Reschedule modal ──────────────────────────────────────── */}
      {rescheduleId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[15px] font-semibold mb-4">
              {lang === "en" ? "Reschedule post" : "修改排程時間"}
            </h2>
            <input
              type="datetime-local"
              value={rescheduleAt}
              onChange={(e) => setRescheduleAt(e.target.value)}
              min={formatLocalDatetimeInput(new Date())}
              className="w-full px-3 py-2 rounded-lg border border-default-300 text-sm mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setRescheduleId(null)}
                className="flex-1 py-2 rounded-lg border border-default-300 text-[13px] text-default-700"
              >
                {lang === "en" ? "Cancel" : "取消"}
              </button>
              <button
                onClick={async () => {
                  if (!rescheduleAt) return;
                  await rescheduleMut?.mutateAsync?.({
                    id: rescheduleId!,
                    scheduledAt: new Date(rescheduleAt).toISOString(),
                  });
                  setRescheduleId(null);
                }}
                disabled={rescheduleMut?.isLoading}
                className="flex-1 py-2 rounded-lg bg-violet-600 text-white text-[13px] font-semibold disabled:opacity-60"
              >
                {rescheduleMut?.isLoading
                  ? (lang === "en" ? "Saving…" : "儲存中…")
                  : (lang === "en" ? "Confirm" : "確認修改")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Facebook Page Picker (after OAuth) ────────────────────── */}
      {fbPickerBrandId !== null && fbPages.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => { setFbPickerBrandId(null); setFbPages([]); }}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[15px] font-semibold mb-1">
              {lang === "en" ? "Select Facebook Page to bind" : "選擇要綁定的粉絲團"}
            </h2>
            <p className="text-[12px] text-default-500 mb-4">
              {lang === "en"
                ? "After binding, click「Publish now」again to post."
                : "綁定後，再次點「立即發布」即可發文。"}
            </p>
            <div className="space-y-2">
              {fbPages.map((p) => (
                <button
                  key={p.id}
                  onClick={async () => {
                    try {
                      await setFbPageMut?.mutateAsync?.({
                        brandId: fbPickerBrandId!,
                        fbPageId: p.id,
                        fbPageName: p.name,
                      });
                    } catch { /* non-fatal */ }
                    setFbPickerBrandId(null);
                    setFbPages([]);
                    rangeQ?.refetch?.();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg border border-default-200 hover:border-blue-400 hover:bg-blue-50 text-[13px]"
                >
                  <span className="font-medium">{p.name}</span>
                  {p.category && <span className="ml-2 text-[12px] text-default-400">{p.category}</span>}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setFbPickerBrandId(null); setFbPages([]); }}
              className="mt-4 w-full py-2 rounded-lg border border-default-200 text-[13px] text-default-600"
            >
              {lang === "en" ? "Cancel" : "取消"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── PostPill ─────────────────────────────────────────────────── */
function PostPill({
  item, lang, navigate, onCancel, onReschedule, onPublish,
  onConnectFacebook, onPrefetchFacebook, rescheduling,
}: {
  item: any;
  lang: "zh-TW" | "en";
  navigate: (to: string) => void;
  onCancel: (id: number) => void;
  onReschedule: (id: number, at: string) => void;
  onPublish?: (id: number, contentKind?: unknown) => Promise<void>;
  onConnectFacebook?: (brandId: number) => void;
  onPrefetchFacebook?: (brandId: number) => Promise<void>;
  rescheduling: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const color = getPlatformColor(item.platform);
  const isPublished = item.kind === "published";
  const isFailed = item.status === "failed";
  const isPending = item.kind === "scheduled" && !isFailed;

  const StatusIcon = isPublished
    ? CheckCircle2
    : isFailed
    ? AlertCircle
    : Clock;
  const statusColor = isPublished ? "#10b981" : isFailed ? "#f59e0b" : "#525252";

  const publishedTime = item.at
    ? new Date(item.at).toLocaleTimeString(lang === "en" ? "en-US" : "zh-TW", {
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <div
      className="rounded-lg overflow-hidden transition-shadow"
      style={{ border: `1px solid ${color}22`, background: `${color}08` }}
    >
      {/* Main row */}
      <button
        className="w-full text-left p-2 flex items-start gap-2"
        onClick={() => setExpanded((e) => !e)}
      >
        <div
          className="shrink-0 w-1 self-stretch rounded-full mt-0.5"
          style={{ background: color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            <StatusIcon size={9} style={{ color: statusColor }} />
            <span className="text-[12px] font-semibold" style={{ color: statusColor }}>
              {isPublished
                ? (lang === "en" ? "Published" : "已發布")
                : isFailed
                ? (lang === "en" ? "Failed" : "失敗")
                : (lang === "en" ? "Scheduled" : "待發布")}
            </span>
            <span className="text-[12px] text-default-400 ml-auto">
              {getPlatformLabel(item.platform)}
            </span>
          </div>
          <p className="text-[12px] text-default-900 font-medium truncate leading-tight">
            {String(item.preview || item.missionTitle || "—")}
          </p>
          {publishedTime && (
            <p className="text-[12px] text-default-400 mt-0.5">{publishedTime}</p>
          )}
        </div>
      </button>

      {/* Expanded actions */}
      {expanded && (
        <div
          className="px-3 pb-2.5 pt-1 flex flex-wrap items-center gap-1.5"
          style={{ borderTop: `1px solid ${color}22` }}
        >
          <button
            onClick={() => navigate(`/run/${item.outputId}`)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-medium bg-white border border-default-200 hover:border-default-500 text-default-700"
          >
            <ExternalLink size={9} />
            {lang === "en" ? "View" : "查看"}
          </button>
          {isPending && (
            <>
              {/* Publish to platform — calls calendar.publish → Pipedream webhook */}
              {onPublish && (
                <button
                  onClick={async () => {
                    const platformLabel = getPlatformLabel(item.platform);
                    const planningWarning = item.contentKind === "planning"
                      ? getPlanningPublishWarning("planningArtifacts", "publish", lang === "en" ? "en" : "zh")
                      : null;
                    if (!confirm(planningWarning ?? (lang === "en"
                      ? `Publish to ${platformLabel} now? This will post immediately.`
                      : `確定立即發布到 ${platformLabel}？發布後無法撤回。`))) return;
                    setPublishing(true);
                    setPublishError(null);
                    try {
                      await onPublish(item.id, item.contentKind);
                    } catch (e: any) {
                      const msg: string = e?.message ?? String(e);
                      // Show friendly inline error; raw TRPC error contains the server message
                      setPublishError(msg.replace(/^TRPCClientError:\s*/i, ""));
                      if (
                        item.brandId
                        && (msg.includes("粉專") || msg.includes("Facebook") || msg.includes("未連接"))
                        && onPrefetchFacebook
                      ) {
                        void onPrefetchFacebook(item.brandId).catch(() => {});
                      }
                    } finally {
                      setPublishing(false);
                    }
                  }}
                  disabled={publishing}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-semibold text-white disabled:opacity-50"
                  style={{ background: publishing ? "#525252" : "#171717" }}
                >
                  {publishing
                    ? (lang === "en" ? "Publishing…" : "發布中…")
                    : (lang === "en" ? "Publish now" : "立即發布")}
                </button>
              )}
              {publishError && (
                <div className="w-full mt-1 px-2 py-1.5 rounded-lg text-[12px] leading-relaxed space-y-1.5"
                  style={{ background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412" }}>
                  <p>⚠️ {publishError}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {/* FB connect button — shown when error mentions missing page connection */}
                    {(publishError.includes("粉專") || publishError.includes("Facebook") || publishError.includes("未連接")) &&
                      onConnectFacebook && item.brandId && (
                      <button
                        onClick={() => { setPublishError(null); onConnectFacebook(item.brandId); }}
                        onMouseEnter={() => {
                          if (onPrefetchFacebook) void onPrefetchFacebook(item.brandId).catch(() => {});
                        }}
                        onFocus={() => {
                          if (onPrefetchFacebook) void onPrefetchFacebook(item.brandId).catch(() => {});
                        }}
                        className="px-2 py-1 rounded text-[12px] font-semibold text-white"
                        style={{ background: "#1877F2" }}
                      >
                        🔗 {lang === "en" ? "Connect Facebook" : "連接 Facebook"}
                      </button>
                    )}
                    <button
                      onClick={() => navigate(`/run/${item.outputId}`)}
                      className="px-2 py-1 rounded text-[12px] font-medium bg-white border border-orange-300 text-orange-800"
                    >
                      {lang === "en" ? "View post →" : "查看貼文 →"}
                    </button>
                  </div>
                </div>
              )}
              <button
                onClick={() => onReschedule(item.id, item.at)}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-medium bg-white border border-violet-200 hover:border-violet-500 text-violet-700"
              >
                <RefreshCw size={9} />
                {lang === "en" ? "Reschedule" : "改時間"}
              </button>
              <button
                onClick={async () => {
                  if (!confirm(lang === "en" ? "Cancel this scheduled post?" : "確定取消這則排程？")) return;
                  setCancelling(true);
                  try { await onCancel(item.id); } finally { setCancelling(false); }
                }}
                disabled={cancelling}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-medium bg-white border border-red-200 hover:border-red-400 text-red-600 disabled:opacity-50"
              >
                <Trash2 size={9} />
                {cancelling
                  ? (lang === "en" ? "…" : "…")
                  : (lang === "en" ? "Cancel" : "取消排程")}
              </button>
            </>
          )}
          {item.externalUrl && (
            <a
              href={item.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-medium bg-emerald-50 border border-emerald-200 text-emerald-700 hover:border-emerald-500"
            >
              <ExternalLink size={9} />
              {lang === "en" ? "Live link" : "查看原文"}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/* ── PlatformPickerModal ──────────────────────────────────────── */
function PlatformPickerModal({
  date, lang, brandId, navigate, onClose,
}: {
  date: Date;
  lang: "zh-TW" | "en";
  brandId: number | null;
  navigate: (to: string) => void;
  onClose: () => void;
}) {
  const dateStr = toDateStr(date);
  const displayDate = date.toLocaleDateString(lang === "en" ? "en-US" : "zh-TW", {
    month: "long", day: "numeric", weekday: "short",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid #E5E5E5" }}>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-default-500 mb-0.5">
              {lang === "en" ? "NEW POST" : "新增貼文"}
            </p>
            <h2 className="text-[15px] font-semibold text-default-900">
              {lang === "en" ? `Posting on ${displayDate}` : `${displayDate} 發布`}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-default-500 hover:bg-default-100"
          >
            <X size={14} />
          </button>
        </div>

        {/* Platform grid */}
        <div className="px-6 py-5">
          <p className="text-[12px] text-default-500 mb-4">
            {lang === "en"
              ? "Choose a platform — AI will draft the post for you."
              : "選擇平台，AI 會幫你生成貼文草稿，完成後回到這裡排程。"}
          </p>
          <div className="grid grid-cols-4 gap-3">
            {PLATFORMS.map((p) => (
              <button
                key={p.key}
                onClick={() => {
                  const brandParam = brandId ? `&b=${brandId}` : "";
                  navigate(`${p.route}?date=${dateStr}${brandParam}`);
                  onClose();
                }}
                className="flex flex-col items-center gap-2 p-3 rounded-xl hover:scale-105 transition-transform"
                style={{ border: `1px solid ${p.color}33`, background: `${p.color}08` }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold"
                  style={{ background: p.color }}
                >
                  {p.label.slice(0, 2)}
                </div>
                <span
                  className="text-[12px] font-medium text-center leading-tight"
                  style={{ color: p.color }}
                >
                  {p.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <div className="px-6 pb-5">
          <p className="text-[12px] text-default-400 text-center">
            {lang === "en"
              ? "After AI generates the post, click \"Schedule\" on the result page to save it here."
              : "AI 生成完成後，在結果頁按「排程發布」→ 選擇時間 → 貼文就會出現在這裡。"}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── WeekSkeleton ─────────────────────────────────────────────── */
function WeekSkeleton() {
  return (
    <div
      className="rounded-xl overflow-hidden animate-pulse"
      style={{ border: "1px solid #E5E5E5", background: "white" }}
    >
      <div className="grid grid-cols-7 border-b border-default-100">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="px-3 py-3 text-center border-r border-default-100 last:border-r-0">
            <div className="h-2 w-8 bg-default-100 rounded mx-auto mb-2" />
            <div className="h-5 w-6 bg-default-200 rounded mx-auto" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7" style={{ minHeight: 320 }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="p-2 border-r border-default-100 last:border-r-0">
            {Array.from({ length: Math.floor(Math.random() * 2) }).map((_, j) => (
              <div key={j} className="h-12 rounded-lg bg-default-100 mb-2" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── FestivalNudgeBanner ──────────────────────────────────────── */
function FestivalNudgeBanner({
  brandId, navigate, lang,
}: { brandId: number | null; navigate: (to: string) => void; lang: "zh-TW" | "en" }) {
  const utils = (trpc as any).useUtils?.() ?? null;
  const upcomingQ = (trpc as any).festival?.upcoming?.useQuery?.(
    { windowDays: 45, limit: 3, minPriority: 3 },
    { refetchOnWindowFocus: false, staleTime: 5 * 60_000 },
  );
  const dismissMut = (trpc as any).festival?.dismiss?.useMutation?.({
    onSuccess: () => utils?.festival?.upcoming?.invalidate?.(),
  });

  const items: any[] = upcomingQ?.data ?? [];
  if (upcomingQ?.isLoading || items.length === 0) return null;

  return (
    <div className="max-w-[1100px] mx-auto px-6 mb-4">
      <div
        className="rounded-xl px-4 py-3"
        style={{
          background: "#F7F6F4 100%)",
          border: "1px solid #D4D4D4",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={13} className="text-default-700" strokeWidth={2} />
          <span className="text-[12px] font-semibold uppercase tracking-[0.22em] text-default-600">
            {lang === "en" ? "UPCOMING · Holidays & festivals" : "UPCOMING · 接下來的節慶"}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {items.map((f: any) => {
            const days = Number(f.daysAway);
            const urgent = days <= 14;
            return (
              <div
                key={f.id}
                className="flex items-center gap-3 py-2 px-3 bg-white rounded-lg"
                style={{ border: "1px solid #E5E5E5" }}
              >
                <span style={{ fontSize: 20 }}>{f.emoji ?? "🎉"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-default-900">
                      {String(lang === "en" ? (f.name_en ?? f.name_zh ?? "") : (f.name_zh ?? ""))}
                    </span>
                    <span className="text-[12px] text-default-500 tabular-nums">
                      {new Date(f.date).toLocaleDateString(
                        lang === "en" ? "en-US" : "zh-TW",
                        { month: "short", day: "numeric" }
                      )}
                      {" · "}
                      <span style={{ color: urgent ? "#B91C1C" : "#525252", fontWeight: urgent ? 600 : 400 }}>
                        {days === 0
                          ? (lang === "en" ? "Today" : "今天")
                          : lang === "en" ? `in ${days} days` : `${days} 天後`}
                      </span>
                    </span>
                  </div>
                  {(() => {
                    const hint = lang === "en" ? getFestivalHintEn(f.slug) : f.contentHint;
                    if (!hint || typeof hint !== "string") return null;
                    return (
                      <p
                        className="text-[12px] mt-0.5 line-clamp-1 text-default-500 italic"
                        style={{ fontFamily: '"Source Serif Pro","Noto Serif TC",Georgia,serif' }}
                      >
                        {hint}
                      </p>
                    );
                  })()}
                </div>
                <button
                  onClick={() => {
                    const fname = lang === "en" ? (f.name_en ?? f.name_zh) : f.name_zh;
                    const hintForTopic = lang === "en" ? getFestivalHintEn(f.slug) : f.contentHint;
                    const topic = `${fname} (${new Date(f.date).toLocaleDateString(lang === "en" ? "en-US" : "zh-TW", { month: "short", day: "numeric" })})${hintForTopic ? " — " + hintForTopic : ""}`;
                    const brandParam = brandId ? `&b=${brandId}` : "";
                    navigate(`/tasks/fb?topic=${encodeURIComponent(topic)}${brandParam}`);
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold"
                  style={{ background: "#171717", color: "white" }}
                >
                  {lang === "en" ? "Prep 5 posts →" : "幫我準備 5 篇 →"}
                </button>
                <button
                  onClick={() => dismissMut?.mutateAsync?.({ festivalId: f.id })}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-default-500 hover:bg-default-100"
                  title={lang === "en" ? "Don't remind me about this" : "這個節慶不要提醒"}
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
