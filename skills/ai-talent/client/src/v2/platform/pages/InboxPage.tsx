/**
 * /inbox — 待確認事項：AI 主動做好、等你點頭的事。
 *
 * 2026-10-07（CJ「整個要有 instinct 的主動性」）。事件怎麼來的見
 * server/gateway/proactive/。這一頁只做三件事：看、照做、不用。
 *
 * 每一則都帶著成品（排好的一週、想好的檔期方向、卡住的那篇稿），不是「提醒你該去做」；
 * 所以卡片上直接列內容，按鈕最多三顆：照做／去處理／不用。
 * 需要到別頁處理的（審核、核准、開活動）只給「去處理」——那邊處理完，這一則會自己消失。
 *
 * 多個品牌時依品牌分組（代理商老闆一次看完所有客戶）；只有一個品牌就不分組。
 * 「這類不用再提醒」收在頁尾的通知設定；連續三則都按不用時才主動問一次。
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { IllustratedEmpty } from "../components/EmptyIllustration";
import { showToastGlobal } from "../components/Toast";
import { ChevronLeftIcon, ChevronRightIcon, DoneIcon, WarningIcon } from "../components/icons";
import { HelpTip } from "../components/HelpTip";
import { friendlyError } from "../lib/friendlyError";

type Kind = "week_plan_ready" | "review_overdue" | "publish_unapproved" | "festival_node";
type PrefKind = Kind | "digest";

interface WeekItem { date: string; platform: string; topic: string; format: string }
interface InboxItem {
  id: number; brandId: number; brandName: string; kind: Kind; urgency: "normal" | "urgent";
  title: string; body: string; navUrl: string; createdAtIso: string;
  weekItems: WeekItem[]; lead: string;
  festival: { name: string; date: string; angle: string; ideas: string[] } | null;
  actions: { approve: boolean; open: boolean };
}

const PLATFORM_SHORT: Record<string, string> = {
  facebook: "FB", instagram: "IG", threads: "Threads", line: "LINE", tiktok: "TikTok", email: "Email", website: "Web",
};
const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];
const WEEKDAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 通知設定裡每一類的名稱。 */
const KIND_LABEL: Record<PrefKind, { zh: string; en: string }> = {
  week_plan_ready:    { zh: "每週先排好的內容", en: "Weekly plan drafted for you" },
  festival_node:      { zh: "節慶檔期的方向", en: "Directions for upcoming dates" },
  review_overdue:     { zh: "等我審核太久的稿", en: "Drafts waiting on my review" },
  publish_unapproved: { zh: "快到發布時間還沒核准的貼文", en: "Posts due soon but not approved" },
  digest:             { zh: "每日彙整信", en: "Daily summary email" },
};
const PREF_ORDER: PrefKind[] = ["week_plan_ready", "festival_node", "review_overdue", "publish_unapproved", "digest"];

function dayLabel(ymd: string, isEn: boolean): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  const md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return isEn ? `${WEEKDAY_EN[d.getUTCDay()]} ${md}` : `${md}（${WEEKDAY_ZH[d.getUTCDay()]}）`;
}

/** 依品牌分組，急件多的品牌在前；組內順序照伺服器給的（急件在前、新的在前）。 */
export function groupByBrand<T extends { brandId: number; brandName: string; urgency: string }>(items: T[]): Array<{ brandId: number; brandName: string; items: T[] }> {
  const groups = new Map<number, { brandId: number; brandName: string; items: T[] }>();
  for (const it of items) {
    const g = groups.get(it.brandId) ?? { brandId: it.brandId, brandName: it.brandName, items: [] };
    g.items.push(it);
    groups.set(it.brandId, g);
  }
  const urgent = (g: { items: T[] }) => g.items.filter((i) => i.urgency === "urgent").length;
  return [...groups.values()].sort((a, b) => urgent(b) - urgent(a) || b.items.length - a.items.length);
}

export default function InboxPage() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const isEn = lang === "en";
  const utils = (trpc as any).useUtils?.() ?? null;
  const [askMute, setAskMute] = useState<Kind | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);

  const inbox = (trpc as any).proactive.inbox.useQuery(undefined, { refetchInterval: 60_000 });
  const prefs = (trpc as any).proactive.prefs.useQuery(undefined, { enabled: showPrefs || askMute !== null });
  const items: InboxItem[] = inbox.data?.items ?? [];
  const groups = groupByBrand(items);
  const multiBrand = groups.length > 1;
  const label = (k: PrefKind) => (isEn ? KIND_LABEL[k].en : KIND_LABEL[k].zh);

  const act = (trpc as any).proactive.act.useMutation({
    onSuccess: (r: { changed: number; already: boolean; kind: Kind; suggestMute: boolean }, v: { action: "approve" | "dismiss" }) => {
      if (r.already) showToastGlobal(isEn ? "Already handled" : "這一則已經處理過了");
      else if (v.action === "approve") showToastGlobal(isEn ? `Scheduled ${r.changed} posts for the week` : `這週 ${r.changed} 篇已排定`);
      else showToastGlobal(isEn ? "Dismissed" : "好，這則不用");
      if (r.suggestMute) setAskMute(r.kind);
      inbox.refetch();
      utils?.proactive?.count?.invalidate?.();
      utils?.planner?.invalidate?.();
    },
    onError: (e: any) => showToastGlobal(friendlyError(e, isEn ? "That didn't go through. Please try again." : "沒有成功，再試一次。"), "error"),
  });

  const mute = (trpc as any).proactive.setMuted.useMutation({
    onSuccess: (_r: unknown, v: { kind: PrefKind; muted: boolean }) => {
      showToastGlobal(v.muted
        ? (isEn ? `Turned off: ${label(v.kind)}` : `已關閉：${label(v.kind)}`)
        : (isEn ? `Turned on: ${label(v.kind)}` : `已開啟：${label(v.kind)}`));
      setAskMute(null);
      prefs.refetch?.();
    },
    onError: (e: any) => showToastGlobal(friendlyError(e, isEn ? "Couldn't save. Please try again." : "沒存成功，再試一次。"), "error"),
  });

  const dismissLabel = (k: Kind) => {
    if (k === "week_plan_ready") return isEn ? "Not this week" : "這週不用";
    if (k === "festival_node") return isEn ? "Skip this year" : "今年不做";
    return isEn ? "Dismiss" : "知道了";
  };
  const openLabel = (it: InboxItem) => {
    if (it.actions.approve) return isEn ? "Adjust first" : "先調整";
    if (it.kind === "festival_node") return isEn ? "Start planning" : "開始企劃";
    return isEn ? "Open" : "去處理";
  };

  const card = (it: InboxItem) => {
    const busy = act.isPending && act.variables?.id === it.id;
    return (
      <article key={it.id} className="rounded-xl border border-default-200 bg-white p-4">
        {(it.urgency === "urgent" || (!multiBrand && it.brandName)) && (
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[13px] text-default-600">
            {it.urgency === "urgent" && (
              <span className="inline-flex items-center gap-1 font-semibold text-rose-600">
                <WarningIcon size={14} />
                {isEn ? "Urgent" : "急件"}
              </span>
            )}
            {!multiBrand && it.brandName && <span className="font-medium text-default-800">{it.brandName}</span>}
          </div>
        )}

        <h3 className="text-[15px] font-semibold text-default-900">{it.title}</h3>

        {it.kind === "week_plan_ready" && (
          <>
            {it.lead && <p className="mt-1 text-[14px] text-default-700">{it.lead}</p>}
            <ul className="mt-2 divide-y divide-default-100 rounded-lg border border-default-200">
              {it.weekItems.map((w, i) => (
                <li key={i} className="flex items-baseline gap-3 px-3 py-2 text-[14px]">
                  <span className="w-[5.5rem] shrink-0 tabular-nums text-default-600">{dayLabel(w.date, isEn)}</span>
                  <span className="w-14 shrink-0 text-default-600">{PLATFORM_SHORT[w.platform] ?? w.platform}</span>
                  <span className="min-w-0 flex-1 text-default-900">{w.topic}</span>
                  {w.format && <span className="shrink-0 text-[13px] text-default-500">{w.format}</span>}
                </li>
              ))}
            </ul>
          </>
        )}

        {it.kind === "festival_node" && it.festival && (
          <>
            <p className="mt-1 text-[14px] text-default-700">
              <span className="tabular-nums text-default-600">{dayLabel(it.festival.date, isEn)}</span>
              <span className="mx-2 text-default-300">|</span>
              {it.festival.angle}
            </p>
            <ul className="mt-2 divide-y divide-default-100 rounded-lg border border-default-200">
              {it.festival.ideas.map((idea, i) => (
                <li key={i} className="px-3 py-2 text-[14px] text-default-900">{idea}</li>
              ))}
            </ul>
          </>
        )}

        {it.kind !== "week_plan_ready" && it.kind !== "festival_node" && it.body && (
          <p className="mt-1 whitespace-pre-line text-[14px] text-default-700">{it.body}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {it.actions.approve && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act.mutate({ id: it.id, action: "approve" })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-default-900 px-3 py-1.5 text-[14px] font-medium text-white hover:bg-default-800 disabled:opacity-50"
            >
              <DoneIcon size={15} />
              {isEn ? "Schedule this week" : "排定這週"}
            </button>
          )}
          {it.actions.open && it.navUrl && (
            <button
              type="button"
              onClick={() => navigate(it.navUrl)}
              className={it.actions.approve
                ? "inline-flex items-center gap-1 rounded-lg border border-default-300 px-3 py-1.5 text-[14px] font-medium text-default-700 hover:bg-default-50"
                : "inline-flex items-center gap-1 rounded-lg bg-default-900 px-3 py-1.5 text-[14px] font-medium text-white hover:bg-default-800"}
            >
              {openLabel(it)}
              <ChevronRightIcon size={14} />
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => act.mutate({ id: it.id, action: "dismiss" })}
            className="ml-auto rounded-lg px-3 py-1.5 text-[14px] text-default-500 hover:bg-default-50 hover:text-default-800 disabled:opacity-50"
          >
            {dismissLabel(it.kind)}
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1 text-[14px] text-default-500 hover:text-default-800"
      >
        <ChevronLeftIcon size={16} />
        {isEn ? "Back" : "返回"}
      </button>

      <h1 className="flex items-center gap-2 text-2xl font-bold text-default-900">
        {isEn ? "Waiting on you" : "待確認事項"}
        <HelpTip>
          {isEn
            ? "Things your team has already prepared. Confirm and they move forward; nothing is published without your approval."
            : "團隊已經先做好的事。你確認了才會往下走；沒有你核准，不會有東西發出去。"}
        </HelpTip>
      </h1>
      {items.length > 0 && (
        <p className="mt-1 text-[14px] text-default-600">
          {isEn
            ? `${items.length} item${items.length === 1 ? "" : "s"}${multiBrand ? ` across ${groups.length} brands` : ""}`
            : `${items.length} 件${multiBrand ? `，跨 ${groups.length} 個品牌` : ""}`}
        </p>
      )}

      {askMute && (
        <div role="status" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-default-200 bg-default-50 px-4 py-3 text-[14px] text-default-800">
          <span className="min-w-0 flex-1">
            {isEn
              ? `You've dismissed "${label(askMute)}" three times in a row. Turn it off?`
              : `「${label(askMute)}」你連續三次都說不用。以後這一類不用再準備？`}
          </span>
          <button type="button" disabled={mute.isPending} onClick={() => mute.mutate({ kind: askMute, muted: true })}
            className="rounded-full bg-default-900 px-3 py-1 text-[13px] font-semibold text-white disabled:opacity-50">
            {isEn ? "Turn off" : "不用再準備"}
          </button>
          <button type="button" onClick={() => setAskMute(null)} className="rounded-full border border-default-300 px-3 py-1 text-[13px] font-semibold">
            {isEn ? "Keep it" : "先留著"}
          </button>
        </div>
      )}

      {inbox.isError && !inbox.isLoading && (
        <p role="alert" className="mt-4 flex items-center gap-3 rounded-xl border border-default-200 px-4 py-3 text-[14px] text-default-800">
          {isEn ? "The list didn't load." : "清單沒載入。"}
          <button type="button" onClick={() => inbox.refetch()} className="rounded-full border border-default-300 px-3 py-1 text-[13px] font-semibold">
            {isEn ? "Retry" : "重試"}
          </button>
        </p>
      )}

      {inbox.isLoading && (
        <p role="status" aria-live="polite" className="py-10 text-center text-[14px] text-default-600">
          {isEn ? "Loading…" : "載入中…"}
        </p>
      )}

      {!inbox.isLoading && !inbox.isError && items.length === 0 && (
        <IllustratedEmpty kind="review" title={isEn ? "Nothing is waiting on you" : "現在沒有等你確認的事"} />
      )}

      {multiBrand ? (
        <div className="mt-5 flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.brandId} aria-label={g.brandName}>
              <h2 className="mb-2 flex items-baseline gap-2 text-[15px] font-semibold text-default-900">
                {g.brandName || (isEn ? "Unnamed brand" : "未命名品牌")}
                <span className="text-[13px] font-normal text-default-500">
                  {isEn ? `${g.items.length} item${g.items.length === 1 ? "" : "s"}` : `${g.items.length} 件`}
                </span>
              </h2>
              <div className="flex flex-col gap-3">{g.items.map(card)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">{items.map(card)}</div>
      )}

      <div className="mt-8 border-t border-default-200 pt-4">
        <button
          type="button"
          aria-expanded={showPrefs}
          onClick={() => setShowPrefs((v) => !v)}
          className="text-[14px] font-medium text-default-600 hover:text-default-900"
        >
          {isEn ? "What gets prepared for me" : "要替我準備哪些事"}
        </button>
        {showPrefs && (
          <ul className="mt-3 divide-y divide-default-100 rounded-xl border border-default-200 bg-white">
            {PREF_ORDER.map((k) => {
              const muted = !!(prefs.data?.kinds as Array<{ kind: PrefKind; muted: boolean }> | undefined)?.find((p) => p.kind === k)?.muted;
              return (
                <li key={k} className="flex items-center gap-3 px-4 py-3 text-[14px]">
                  <span className="min-w-0 flex-1 text-default-900">{label(k)}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!muted}
                    aria-label={label(k)}
                    disabled={prefs.isLoading || mute.isPending}
                    onClick={() => mute.mutate({ kind: k, muted: !muted })}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${muted ? "bg-default-300" : "bg-default-900"}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${muted ? "left-0.5" : "left-[1.375rem]"}`} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
