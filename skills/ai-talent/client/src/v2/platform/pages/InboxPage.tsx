/**
 * /inbox — 待確認事項：AI 主動做好、等你點頭的事。
 *
 * 2026-10-07（CJ「整個要有 instinct 的主動性」）。事件怎麼來的見
 * server/gateway/proactive/。這一頁只做三件事：看、照做、不用。
 *
 * 每一則都帶著成品（排好的一週、卡住的那篇稿），不是「提醒你該去做」；
 * 所以卡片上直接列內容，按鈕最多三顆：照做／去看／不用。
 * 需要到別頁處理的（審核、核准）只給「去看」——那邊處理完，這一則會自己消失。
 */
import { useNavigate } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { IllustratedEmpty } from "../components/EmptyIllustration";
import { showToastGlobal } from "../components/Toast";
import { ChevronLeftIcon, ChevronRightIcon, DoneIcon, WarningIcon } from "../components/icons";
import { HelpTip } from "../components/HelpTip";
import { friendlyError } from "../lib/friendlyError";

interface WeekItem { date: string; platform: string; topic: string; format: string }
interface InboxItem {
  id: number; brandId: number; brandName: string; kind: string; urgency: "normal" | "urgent";
  title: string; body: string; navUrl: string; createdAtIso: string;
  weekItems: WeekItem[]; lead: string;
  actions: { approve: boolean; open: boolean };
}

const PLATFORM_SHORT: Record<string, string> = {
  facebook: "FB", instagram: "IG", threads: "Threads", line: "LINE", tiktok: "TikTok", email: "Email", website: "Web",
};
const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];
const WEEKDAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(ymd: string, isEn: boolean): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  const md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return isEn ? `${WEEKDAY_EN[d.getUTCDay()]} ${md}` : `${md}（${WEEKDAY_ZH[d.getUTCDay()]}）`;
}

export default function InboxPage() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const isEn = lang === "en";
  const utils = (trpc as any).useUtils?.() ?? null;

  const inbox = (trpc as any).proactive.inbox.useQuery(undefined, { refetchInterval: 60_000 });
  const items: InboxItem[] = inbox.data?.items ?? [];

  const act = (trpc as any).proactive.act.useMutation({
    onSuccess: (r: { changed: number; already: boolean }, v: { action: "approve" | "dismiss" }) => {
      if (r.already) showToastGlobal(isEn ? "Already handled" : "這一則已經處理過了");
      else if (v.action === "approve") showToastGlobal(isEn ? `Scheduled ${r.changed} posts for the week` : `這週 ${r.changed} 篇已排定`);
      else showToastGlobal(isEn ? "Dismissed" : "好，這則不用");
      inbox.refetch();
      utils?.proactive?.count?.invalidate?.();
      utils?.planner?.invalidate?.();
    },
    onError: (e: any) => showToastGlobal(friendlyError(e, isEn ? "That didn't go through. Please try again." : "沒有成功，再試一次。"), "error"),
  });

  const brands = Array.from(new Set(items.map((i) => i.brandName).filter(Boolean)));
  const multiBrand = brands.length > 1;

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
            ? `${items.length} item${items.length === 1 ? "" : "s"}${multiBrand ? ` across ${brands.length} brands` : ""}`
            : `${items.length} 件${multiBrand ? `，跨 ${brands.length} 個品牌` : ""}`}
        </p>
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

      <div className="mt-4 flex flex-col gap-3">
        {items.map((it) => {
          const busy = act.isPending && act.variables?.id === it.id;
          return (
            <article key={it.id} className="rounded-xl border border-default-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-default-600">
                {it.urgency === "urgent" && (
                  <span className="inline-flex items-center gap-1 font-semibold text-rose-600">
                    <WarningIcon size={14} />
                    {isEn ? "Urgent" : "急件"}
                  </span>
                )}
                {it.brandName && <span className="font-medium text-default-800">{it.brandName}</span>}
              </div>

              <h2 className="mt-1.5 text-[15px] font-semibold text-default-900">{it.title}</h2>

              {it.kind === "week_plan_ready" ? (
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
              ) : (
                it.body && <p className="mt-1 whitespace-pre-line text-[14px] text-default-700">{it.body}</p>
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
                    className="inline-flex items-center gap-1 rounded-lg border border-default-300 px-3 py-1.5 text-[14px] font-medium text-default-700 hover:bg-default-50"
                  >
                    {it.actions.approve ? (isEn ? "Adjust first" : "先調整") : (isEn ? "Open" : "去處理")}
                    <ChevronRightIcon size={14} />
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act.mutate({ id: it.id, action: "dismiss" })}
                  className="ml-auto rounded-lg px-3 py-1.5 text-[14px] text-default-500 hover:bg-default-50 hover:text-default-800 disabled:opacity-50"
                >
                  {it.kind === "week_plan_ready" ? (isEn ? "Not this week" : "這週不用") : (isEn ? "Dismiss" : "知道了")}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
