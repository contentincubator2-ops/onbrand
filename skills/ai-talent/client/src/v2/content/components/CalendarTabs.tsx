/**
 * CalendarTabs — 「行事曆」的兩個分頁：排程與發布（/calendar）｜當月規劃（/tasks/calendar）。
 *
 * 2026-09-27（CJ「左邊的 mission tray 除了專案、行事曆、活動以外都變成自己加」→ 兩個行事曆
 * 「合併成一個」）：側欄只留一個「行事曆」入口，兩頁頂端放同一組分頁。
 *
 * 「當月規劃」只有品牌任務包裡有 calendar 頻道時才有卡——沒有包的品牌那頁是空的，所以
 * 那時不顯示這組分頁（只剩一個分頁就不必給選擇）。
 */
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";

export default function CalendarTabs() {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const ctx = useOutletContext<{ brandId: number | null } | undefined>();
  const brandId = ctx?.brandId ?? null;
  const navQ = (trpc as any).quickTask?.brandNav?.useQuery?.(
    { brandId: brandId ?? undefined },
    { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 300_000 },
  ) ?? { data: null };
  const channels: Array<{ key: string }> = (navQ.data as any)?.channels ?? [];
  const hasPlanning = channels.some((c) => c.key === "calendar");
  if (!hasPlanning) return null;

  const tabs = [
    { to: "/calendar", label: en ? "Schedule & published" : "排程與發布" },
    { to: "/tasks/calendar", label: en ? "Monthly plan" : "當月規劃" },
  ];
  const b = new URLSearchParams(search).get("b");
  return (
    <div className="flex justify-center pt-5">
      <div className="inline-flex rounded-full border border-neutral-200 bg-white p-1">
        {tabs.map((t) => {
          const active = pathname.startsWith(t.to);
          return (
            <button
              key={t.to}
              type="button"
              onClick={() => navigate(b ? `${t.to}?b=${b}` : t.to)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition ${active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-neutral-900"}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
