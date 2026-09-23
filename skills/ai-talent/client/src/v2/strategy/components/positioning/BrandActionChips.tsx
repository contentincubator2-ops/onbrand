/**
 * BrandActionChips — kicker-row action chip: 定案.
 *
 * 2026-09-23 (CJ「header太亂了…移除試寫功能」)：原本這裡是 試寫 + 定案
 * 兩顆 chip，試寫會展開一個 6-情境測試面板（BrandTestPanel）。試寫整組
 * 拿掉了——按鈕、展開面板、跟這裡無關的其它呼叫者都確認過沒有（grep
 * 全庫只有 BrandsPage.tsx 這一個 render 點），所以連同 BrandTestPanel
 * 元件一起刪除，不留死碼。伺服器端的 positioningJobs.runTestBattery
 * procedure 保留未刪——只是現在沒有 UI 呼叫它了。
 *
 * 現在只剩 定案：確認 + bulk-lock 定位/文字/視覺。
 */
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { CheckCircle2 } from "lucide-react";

interface Props {
  brandId: number | null;
}

/** Just the chip row (controlled). */
export function BrandActionChipsRow({
  brandId, status,
}: Props & { status: "full"|"interim"|"empty" }) {
  const { lang } = useLang();
  const utils = trpc.useUtils();
  // 2026-05-27: use theater.lockTabs (bulk, now exists on server).
  // Previous code tried to ?? fallback to theater.lockTab, but tRPC proxy is
  // always truthy for any path, so the fallback never triggered and the call
  // to the non-existent theater.lockTabs caused "No procedure found" errors.
  const lockTabsMut = (trpc as any).theater?.lockTabs?.useMutation?.({
    onSuccess: () => utils.theater?.getTabLocks?.invalidate?.(),
  });

  const handleLock = async () => {
    if (!brandId) return;
    if (!confirm(lang === "en"
      ? "Lock Positioning / Copy / Visual tabs?\nAfter locking:\n· Editors become read-only\n· This becomes the single source of truth everywhere\nYou can unlock anytime."
      : "確定要鎖定 定位 / 文字 / 視覺 三個頁籤？\n鎖定後：\n· 編輯欄變成唯讀\n· 全平台都會用這份做為單一真相\n隨時可以解鎖。")) return;
    try {
      await lockTabsMut?.mutateAsync?.({ brandId, tabs: ["positioning", "copy", "visual"] });
    } catch (e: any) {
      alert((lang === "en" ? "Lock failed: " : "鎖定失敗：") + String(e?.message ?? e));
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleLock}
        className="flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-full transition text-white"
        style={{ background: status === "full" ? "#10B981" : "#9CA3AF" }}
        disabled={!brandId || status !== "full"}
        title={status !== "full"
          ? (lang === "en" ? "Finish full positioning before locking" : "等完整定位完成後才可定案")
          : (lang === "en" ? "Lock Positioning / Copy / Visual at once" : "一次鎖定 定位 / 文字 / 視覺")}
      >
        <CheckCircle2 size={11} /> {lang === "en" ? "Lock in" : "定案"}
      </button>
    </div>
  );
}

/**
 * Read positioning status for the chip row (small hook for parent).
 *
 * BUG-3 fix (2026-05-28): was hardcoded to entityKind:"brand" — products
 * and events always showed "empty" status even when fully positioned.
 * Now accepts entityKind + entityId so scope-aware callers can pass the
 * correct entity.
 */
export function usePositioningStatus(
  entityKind: "brand" | "product" | "event",
  entityId: number | null,
): { status: "full"|"interim"|"empty"; isRunning: boolean } {
  const cur = (trpc as any).positioningJobs?.getCurrent?.useQuery?.(
    { entityKind, entityId: entityId ?? 0 },
    { enabled: !!entityId, refetchInterval: 6_000 },
  );
  const data = (cur?.data as any) ?? null;
  const status = (data?.source as "full" | "interim" | "empty" | undefined) ?? "empty";
  const job = (trpc as any).positioningJobs?.getStatus?.useQuery?.(
    { entityKind, entityId: entityId ?? 0 },
    { enabled: !!entityId, refetchInterval: 4_000 },
  );
  const isRunning = (job?.data as any)?.status === "running";
  return { status, isRunning };
}
