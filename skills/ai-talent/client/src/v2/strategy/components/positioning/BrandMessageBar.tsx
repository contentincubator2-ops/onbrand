/**
 * BrandMessageBar — read-only message bar in /30s search-bar style.
 *
 * One job: show the brand's current single-sentence message
 * (full pipeline USP / interim positioning / tagline) with a small
 * status pill on the left and a 🔄 regenerate icon on the right.
 *
 * 2026-05-07 — buttons (測試 / 定案) extracted to BrandActionChips so
 * the bar stays clean and matches /30s search-bar visuals.
 */
import { trpc } from "../../../../lib/trpc";
import { RefreshCw } from "lucide-react";

interface Props { brandId: number | null }

export default function BrandMessageBar({ brandId }: Props) {
  const cur = (trpc as any).positioningJobs?.getCurrent?.useQuery?.(
    { entityKind: "brand", entityId: brandId ?? 0 },
    { enabled: !!brandId, refetchInterval: 6_000 },
  );
  const data = (cur?.data as any) ?? null;
  const status = (data?.source as "full" | "interim" | "empty" | undefined) ?? "empty";

  const job = (trpc as any).positioningJobs?.getStatus?.useQuery?.(
    { entityKind: "brand", entityId: brandId ?? 0 },
    { enabled: !!brandId, refetchInterval: 4_000 },
  );
  const jobData = job?.data as any;
  const isRunning = jobData?.status === "running";

  const utils = trpc.useUtils();
  const interimMut = (trpc as any).positioningJobs?.runInterim?.useMutation?.({
    onSuccess: () => utils.positioningJobs?.getCurrent?.invalidate?.(),
  });
  const startMut = (trpc as any).positioningJobs?.start?.useMutation?.();

  const message = data?.usp || data?.positioning || data?.tagline || "";
  const placeholder = "等待品牌定位產生中…";

  const pillColor = status === "full" ? { bg: "#D1FAE5", fg: "#047857", label: "完整定位 ✓" }
                  : status === "interim" ? { bg: "#FEF3C7", fg: "#92400E", label: isRunning ? "暫時定位（全本進行中）" : "暫時定位" }
                  : { bg: "#F3F4F6", fg: "#6B7280", label: "等待產生" };

  const handleRegenerate = () => {
    if (!brandId) return;
    interimMut?.mutate?.({ entityKind: "brand", entityId: brandId });
    startMut?.mutate?.({ entityKind: "brand", entityId: brandId, lang: "zh-TW" });
  };

  return (
    <div className="w-full" style={{ maxWidth: 800 }}>
      <div
        className="flex items-center gap-3 px-5 bg-white rounded-[20px] border border-default-100 shadow-md"
        style={{ height: 64 }}
      >
        <span
          className="text-[12px] font-semibold px-2.5 py-1 rounded-full shrink-0 tracking-wide"
          style={{ background: pillColor.bg, color: pillColor.fg }}
        >
          {pillColor.label}
        </span>
        <div className="flex-1 min-w-0 text-sm text-default-800 truncate" title={message || placeholder}>
          {message || <span className="text-default-400 italic">{placeholder}</span>}
        </div>
        <button
          onClick={handleRegenerate}
          className="text-default-400 hover:text-default-700 transition shrink-0 p-1"
          title="重新產生暫時定位"
          disabled={!brandId}
        >
          <RefreshCw size={14} className={interimMut?.isPending ? "animate-spin" : ""} />
        </button>
      </div>
    </div>
  );
}
