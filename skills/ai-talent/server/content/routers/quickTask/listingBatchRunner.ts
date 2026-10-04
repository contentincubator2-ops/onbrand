/**
 * listingBatchRunner — 批次產出的背景 worker。
 *
 * 每個商品各自走一次 runSingleTask（同一條扣點／方案閘門／必填檢查／產出落地的路徑），
 * 兩條並行：一條的話 30 個商品要等十幾分鐘，再多會撞供應商的併發限制
 *（生圖併發曾經是 99s 預算爆掉的真凶，見 llm cascade 記錄）。
 *
 * 行為準則：
 *   - 扣點是逐筆的：點數不夠時**暫停**（剩下的留在 queued），不是把剩下的全標失敗——
 *     補點數或下個週期之後按「繼續」就從原處接著跑。
 *   - 單筆失敗只標那一筆（附原因），不影響其他筆；用戶可以單筆重試。
 *   - 伺服器重啟會讓 in-process 的 worker 消失，所以不自動續跑（續跑會替用戶自己沒看到的
 *     東西再扣一次點）——由用戶在審核頁按「繼續」。進行中的殭屍項目由 isStaleRunning 判定。
 */
import { TRPCError } from "@trpc/server";
import { runSingleTask } from "./runProcedures";
import { getBatch, updateBatch, deriveStatus, type BatchItem } from "../../core/catalog/listingBatch";

const CONCURRENCY = 2;
const active = new Set<string>();

const keyOf = (brandId: number, batchId: string) => `${brandId}:${batchId}`;

export function isBatchActive(brandId: number, batchId: string): boolean {
  return active.has(keyOf(brandId, batchId));
}

/** 領下一筆 queued 的項目（標成 running）。批次被取消或暫停就回 null。 */
async function claimNext(brandId: number, ownerId: number, batchId: string): Promise<BatchItem | null> {
  const claimed = await updateBatch<BatchItem | null>(brandId, ownerId, batchId, (b) => {
    if (b.status === "cancelled" || b.pausedReason) return { batch: b, result: null };
    const idx = b.items.findIndex((i) => i.state === "queued");
    if (idx < 0) return { batch: b, result: null };
    const item: BatchItem = { ...b.items[idx]!, state: "running", startedAt: new Date().toISOString(), error: null };
    return { batch: { ...b, status: "running", items: b.items.map((x, i) => (i === idx ? item : x)) }, result: item };
  });
  return claimed ?? null;
}

async function settle(
  brandId: number, ownerId: number, batchId: string, itemId: string,
  patch: Partial<BatchItem>, pause?: string,
): Promise<void> {
  await updateBatch(brandId, ownerId, batchId, (b) => {
    const items = b.items.map((i) => (i.id === itemId ? { ...i, ...patch, finishedAt: new Date().toISOString() } : i));
    const next = { ...b, items, pausedReason: pause ?? b.pausedReason };
    return { batch: { ...next, status: deriveStatus(next) }, result: null };
  });
}

async function runItem(brandId: number, ownerId: number, batchId: string, cardId: string, item: BatchItem): Promise<{ paused?: string }> {
  try {
    const result: any = await runSingleTask(ownerId, {
      taskId: cardId,
      inputs: item.inputs,
      brandId,
      productId: item.productId,
    });
    const outputId = Number(result?.outputId);
    if (!result?.ok || !Number.isFinite(outputId) || outputId <= 0) {
      const why = Array.isArray(result?.errors) && result.errors.length ? String(result.errors[0]) : "沒有產出內容";
      await settle(brandId, ownerId, batchId, item.id, { state: "failed", error: why.slice(0, 300) });
      return {};
    }
    await settle(brandId, ownerId, batchId, item.id, { state: "done", outputId, error: null });
    return {};
  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 300);
    // 點數不足／當日成本上限（FORBIDDEN）：暫停整批，這一筆放回 queued，補了之後從這裡接著跑。
    if (e instanceof TRPCError && e.code === "FORBIDDEN") {
      await settle(brandId, ownerId, batchId, item.id, { state: "queued", error: null, startedAt: undefined }, msg);
      return { paused: msg };
    }
    console.warn(`[listingBatch] ${batchId} item ${item.id} failed:`, msg);
    await settle(brandId, ownerId, batchId, item.id, { state: "failed", error: msg });
    return {};
  }
}

/** 啟動（或接續）一個批次的 worker。已經在跑就什麼都不做。立刻回傳，工作在背景。 */
export function kickBatch(brandId: number, ownerId: number, batchId: string): void {
  const key = keyOf(brandId, batchId);
  if (active.has(key)) return;
  active.add(key);
  void (async () => {
    try {
      const batch = await getBatch(brandId, batchId);
      if (!batch) return;
      // 重新啟動：清掉暫停原因與殭屍 running（它們的點數已經扣過，用戶要重試得自己按）。
      await updateBatch(brandId, ownerId, batchId, (b) => {
        const items = b.items.map((i) => (i.state === "running"
          ? { ...i, state: "failed" as const, error: "中斷（伺服器重啟或逾時），可以單筆重試", finishedAt: new Date().toISOString() }
          : i));
        const next = { ...b, pausedReason: null, items };
        return { batch: { ...next, status: next.status === "cancelled" ? "cancelled" as const : "running" as const }, result: null };
      });
      const loop = async () => {
        for (;;) {
          const item = await claimNext(brandId, ownerId, batchId);
          if (!item) return;
          const r = await runItem(brandId, ownerId, batchId, batch.cardId, item);
          if (r.paused) return;
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, () => loop()));
    } catch (e) {
      console.error(`[listingBatch] worker ${batchId} crashed:`, (e as Error)?.message);
    } finally {
      try {
        await updateBatch(brandId, ownerId, batchId, (b) => ({ batch: { ...b, status: deriveStatus(b) }, result: null }));
      } catch { /* 收尾失敗不影響已寫入的結果 */ }
      active.delete(key);
    }
  })();
}
