/**
 * BrandMessageBar — repurposes BrandsPage's old search slot.
 *
 * Shows the current "single sentence brand message" (full pipeline USP /
 * positioning if available, else interim quick-pulse line). Two buttons
 * to the right:
 *   🧪 測試 — opens lite sandbox (placeholder route for now)
 *   ✅ 定案 — bulk-locks 定位 / 文字 / 視覺 tabs (single confirm dialog)
 *
 * Status pill on the left:
 *   · interim — yellow chip "暫時定位"
 *   · full    — green chip "完整定位 ✓"
 *   · empty   — gray chip "等待產生"
 */
import { useNavigate } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { FlaskConical, CheckCircle2, RefreshCw } from "lucide-react";

interface Props {
  brandId: number | null;
}

export default function BrandMessageBar({ brandId }: Props) {
  const navigate = useNavigate();

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

  const lockTabsMut = (trpc as any).theater?.lockTabs?.useMutation?.({
    onSuccess: () => utils.theater?.getTabLocks?.invalidate?.(),
  }) ?? (trpc as any).theater?.lockTab?.useMutation?.({
    onSuccess: () => utils.theater?.getTabLocks?.invalidate?.(),
  });

  const message = data?.usp || data?.positioning || data?.tagline || "";
  const placeholder = "等待品牌定位產生中…";

  const pillColor = status === "full" ? { bg: "#D1FAE5", fg: "#047857", label: "完整定位 ✓" }
                  : status === "interim" ? { bg: "#FEF3C7", fg: "#92400E", label: isRunning ? "暫時定位（全本進行中）" : "暫時定位" }
                  : { bg: "#F3F4F6", fg: "#6B7280", label: "等待產生" };

  const handleTest = () => {
    if (!brandId) return;
    // Lite sandbox not yet built — for now jump to /theater for the brand
    // (full sandbox playground deferred to a follow-up wave)
    navigate(`/theater?brandId=${brandId}`);
  };

  const handleLock = async () => {
    if (!brandId) return;
    if (!confirm("確定要鎖定 定位 / 文字 / 視覺 三個 tab？\n鎖定後：\n· 編輯欄變成唯讀\n· 全平台都會用這份做為單一真相\n隨時可以解鎖。")) return;
    try {
      // Try a single-call API first; fall back to per-tab if not available
      if ((trpc as any).theater?.lockTabs) {
        await lockTabsMut?.mutateAsync?.({ brandId, tabs: ["positioning", "copy", "visual"] });
      } else {
        for (const tab of ["positioning", "copy", "visual"] as const) {
          await lockTabsMut?.mutateAsync?.({ brandId, tab, locked: true });
        }
      }
    } catch (e: any) {
      alert("鎖定失敗：" + String(e?.message ?? e));
    }
  };

  const handleRegenerate = () => {
    if (!brandId) return;
    interimMut?.mutate?.({ entityKind: "brand", entityId: brandId });
    startMut?.mutate?.({ entityKind: "brand", entityId: brandId, lang: "zh-TW" });
  };

  return (
    <div className="w-full" style={{ maxWidth: 800 }}>
      <div
        className="flex items-center gap-3 px-4 bg-white rounded-[20px] border border-default-100 shadow-md"
        style={{ height: 56 }}
      >
        <span
          className="text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0 tracking-wide"
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
        <button
          onClick={handleTest}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition shrink-0"
          style={{ background: "#EEF2FF", color: "#4338CA" }}
          disabled={!brandId}
        >
          <FlaskConical size={13} /> 測試
        </button>
        <button
          onClick={handleLock}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition shrink-0 text-white"
          style={{ background: status === "full" ? "#10B981" : "#9CA3AF" }}
          disabled={!brandId || status !== "full"}
          title={status !== "full" ? "等完整定位完成後才可定案" : "一次鎖定 定位 / 文字 / 視覺"}
        >
          <CheckCircle2 size={13} /> 定案
        </button>
      </div>
    </div>
  );
}
