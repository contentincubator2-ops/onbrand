/**
 * FestivalGlobalNudge — thin top-bar prompt rendered by ShellLayout.
 *
 * 2026-05-11 (CJ「下週是中秋節，要不要先準備 5 篇？」). Shows ONLY when
 * an upcoming high-priority festival (priority ≥ 4) is within 7 days
 * AND the user hasn't dismissed it. Slim, dismissable, links to
 * /calendar for the full nudge experience.
 *
 * Designed to not get in the way:
 *  - Auto-hides if no eligible festival
 *  - Per-festival dismiss (server-side via festival.dismiss)
 *  - Subtle gradient bar at the very top, beneath the brand pill
 */
import { useNavigate } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { Sparkles, X } from "lucide-react";
import { useLang } from "../../lib/i18n";

export default function FestivalGlobalNudge() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const utils = (trpc as any).useUtils?.() ?? null;
  // Only show the single most-urgent festival within 7 days, priority ≥ 4.
  const upcomingQ = (trpc as any).festival?.upcoming?.useQuery?.(
    { windowDays: 7, limit: 1, minPriority: 4 },
    { refetchOnWindowFocus: false, staleTime: 5 * 60_000 },
  );
  const dismissMut = (trpc as any).festival?.dismiss?.useMutation?.({
    onSuccess: () => utils?.festival?.upcoming?.invalidate?.(),
  });

  const f: any = (upcomingQ?.data ?? [])[0];
  if (!f) return null;

  const days = Number(f.daysAway);
  const urgent = days <= 3;

  return (
    <div
      style={{
        position: "fixed",
        top: 0, left: 70, right: 0,
        zIndex: 30,
        background: urgent
          ? "linear-gradient(135deg, #FEF2F2 0%, #FFFBEB 100%)"
          : "linear-gradient(135deg, rgba(124,58,237,0.10) 0%, rgba(0,180,188,0.10) 100%)",
        borderBottom: `1px solid ${urgent ? "#FCA5A5" : "#D4D4D4"}`,
        fontSize: 12,
      }}
    >
      <div
        className="max-w-[1400px] mx-auto px-6 flex items-center gap-3"
        style={{ height: 36 }}
      >
        <Sparkles size={12} strokeWidth={2} style={{ color: urgent ? "#B91C1C" : "#7C3AED" }} />
        <span style={{ fontSize: 18 }}>{f.emoji ?? "🎉"}</span>
        <span className="font-medium text-default-900 truncate flex-1 min-w-0">
          {String(lang === "en" ? (f.name_en ?? f.name_zh ?? "") : (f.name_zh ?? ""))}
          <span
            className="ml-2"
            style={{
              color: urgent ? "#B91C1C" : "#525252",
              fontWeight: urgent ? 600 : 400,
            }}
          >
            {days === 0
              ? (lang === "en" ? "It's today!" : "今天就是！")
              : (lang === "en" ? `${days} ${days === 1 ? "day" : "days"} away` : `還有 ${days} 天`)}
          </span>
          <span className="ml-2 text-default-700 hidden sm:inline">
            — {lang === "en" ? "want to prep some posts?" : "要不要先準備內容？"}
          </span>
        </span>
        <button
          onClick={() => {
            const topic = `${f.name_zh}${f.contentHint ? " — " + f.contentHint : ""}`;
            // 2026-07-17: /99s tier route was removed 2026-05-27 (404) —
            // tasks are platform-first now.
            navigate(`/tasks/fb?topic=${encodeURIComponent(topic)}`);
          }}
          className="px-3 py-1 rounded text-[11px] font-semibold whitespace-nowrap"
          style={{ background: "#171717", color: "white" }}
        >
          {lang === "en" ? "Prep it for me →" : "幫我準備 →"}
        </button>
        <button
          onClick={() => dismissMut?.mutateAsync?.({ festivalId: f.id })}
          className="w-6 h-6 rounded flex items-center justify-center text-default-600 hover:bg-black/5"
          title={lang === "en" ? "Don't remind me about this one" : "這個節慶不要提醒"}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
