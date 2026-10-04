/**
 * ListingBatchModal — 商品頁批次產出的開場：挑卡、挑商品、貼表格、看預估點數、開始。
 *
 * 2026-10-05。一張卡＝一種寫法，產品是資料：這裡把同一張卡套到 N 個商品上。
 * 開始之前一定先「估算」——整批是逐筆扣點的，用戶要先看到會花多少、夠不夠。
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Textarea } from "@heroui/react";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { toastWithUpgrade } from "../../../platform/lib/upgradeToast";

interface Quote {
  count: number; labels: string[]; ignoredColumns: string[]; truncated: boolean; note: string | null;
  perRun: number; total: number; balance: number; unlimited: boolean; enough: boolean;
}

export default function ListingBatchModal({ isOpen, onClose, brandId, channelId, channelLabel }: {
  isOpen: boolean; onClose: () => void; brandId: number; channelId: string; channelLabel: string;
}) {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();

  const cardsQ = (trpc as any).brandTaskCard.list.useQuery(
    { brandId, channel: channelId },
    { enabled: isOpen, refetchOnWindowFocus: false },
  );
  const productsQ = (trpc as any).product.list.useQuery(
    { brandId },
    { enabled: isOpen, refetchOnWindowFocus: false },
  );
  const batchesQ = (trpc as any).listingBatch.list.useQuery(
    { brandId, channelId },
    { enabled: isOpen, refetchOnWindowFocus: false },
  );
  const cards = useMemo(
    () => ((cardsQ.data as any[]) ?? []).filter((c) => c.status === "ready" && c.format === "listing"),
    [cardsQ.data],
  );
  const products = ((productsQ.data as any[]) ?? []) as Array<{ id: number; name: string }>;

  const [cardId, setCardId] = useState<string>("");
  const [picked, setPicked] = useState<number[]>([]);
  const [table, setTable] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState<"quote" | "create" | null>(null);

  useEffect(() => { if (isOpen) { setQuote(null); setBusy(null); } }, [isOpen]);
  useEffect(() => { if (!cardId && cards[0]) setCardId(cards[0].id); }, [cards, cardId]);
  // 改了任何輸入，之前估的就作廢（不能拿舊的估算去開始）。
  useEffect(() => { setQuote(null); }, [cardId, picked, table]);

  const quoteMut = (trpc as any).listingBatch.quote.useMutation({
    onSuccess: (r: Quote) => { setQuote(r); setBusy(null); },
    onError: (e: any) => { toastWithUpgrade(e?.message ?? "估算失敗", en); setBusy(null); },
  });
  const createMut = (trpc as any).listingBatch.create.useMutation({
    onSuccess: (r: { batchId: string }) => { setBusy(null); onClose(); navigate(`/batch/${r.batchId}`); },
    onError: (e: any) => { toastWithUpgrade(e?.message ?? "建立失敗", en); setBusy(null); },
  });

  const body = { brandId, cardId, productIds: picked, table };
  const hasInput = picked.length > 0 || table.trim().length > 0;
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const statusText = (s: string) => (en
    ? ({ running: "Writing", paused: "Paused", done: "Finished", cancelled: "Cancelled" } as any)[s]
    : ({ running: "進行中", paused: "已暫停", done: "已完成", cancelled: "已取消" } as any)[s]) ?? s;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span>{en ? `Batch write · ${channelLabel}` : `批次產出・${channelLabel}`}</span>
          <span className="text-tiny font-normal text-default-500">
            {en ? "One card, many products. You review each one before anything is exported."
              : "同一張卡套到很多個商品上。每一份都要你逐筆看過、核准，才會匯出。"}
          </span>
        </ModalHeader>
        <ModalBody className="gap-5">
          {cardsQ.isLoading ? <p className="text-small text-default-400">{en ? "Loading…" : "載入中…"}</p>
            : cards.length === 0 ? (
              <p className="rounded-medium border border-dashed border-default-300 px-3 py-4 text-small text-default-600">
                {en ? "This tray has no product-page card yet. Add one first (paste a finished listing as the example)."
                  : "這個 tray 還沒有上架的商品頁任務卡。先新增一張（貼上一份理想的商品頁當範例），再回來批次寫。"}
              </p>
            ) : (
              <>
                <section className="space-y-2">
                  <p className="text-small font-medium">{en ? "1. Which card?" : "1. 用哪張卡？"}</p>
                  <div className="flex flex-wrap gap-2">
                    {cards.map((c) => (
                      <button key={c.id} type="button" onClick={() => setCardId(c.id)}
                        className={`rounded-full border px-3 py-1 text-[13px] ${cardId === c.id ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"}`}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-small font-medium">{en ? "2. Which products?" : "2. 寫哪些商品？"}</p>
                    {products.length > 0 && (
                      <button type="button" className="text-tiny text-default-500 hover:text-default-900"
                        onClick={() => setPicked(picked.length === products.length ? [] : products.map((p) => p.id))}>
                        {picked.length === products.length ? (en ? "Clear" : "全部取消") : (en ? "Select all" : "全選")}
                      </button>
                    )}
                  </div>
                  {products.length > 0 ? (
                    <div className="grid max-h-40 gap-1 overflow-y-auto rounded-medium border border-divider p-2 sm:grid-cols-2">
                      {products.map((p) => (
                        <label key={p.id} className="flex cursor-pointer items-center gap-2 text-[13px]">
                          <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                          <span className="truncate">{p.name}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-tiny text-default-400">{en ? "No products in this brand yet — paste them below." : "這個品牌還沒有產品——直接貼在下面。"}</p>
                  )}
                  <p className="pt-1 text-tiny text-default-500">
                    {en ? "Or paste product names (one per line), or copy a table from Excel / Google Sheets: the first row is the column names, and a column whose name matches one of the card's extra fields (specs, price…) is filled in for you."
                      : "或貼上商品名稱（一行一個），或從 Excel／Google 試算表複製整張表：第一列是欄位名，欄名跟這張卡的額外欄位（規格、價格…）對得上的，就會自動帶入。"}
                  </p>
                  <Textarea minRows={4} maxRows={10} value={table} onValueChange={setTable}
                    placeholder={en ? "Product\tSpecs / size / ingredients\tPrice and promotion\nGinger tea\t10 sachets\t$299" : "商品名稱\t規格／尺寸／成分\t價格與優惠\n薑母茶\t10 入\t$299"} />
                </section>

                {quote && (
                  <section className="space-y-2 rounded-medium border border-divider bg-default-50 p-3">
                    <p className="text-small font-semibold">
                      {en ? `${quote.count} products` : `共 ${quote.count} 個商品`} · {quote.unlimited
                        ? (en ? "unlimited plan" : "不限點數的方案")
                        : (en ? `${quote.total} points (${quote.perRun} each), you have ${quote.balance}` : `預估 ${quote.total} 點（每個 ${quote.perRun} 點），你有 ${quote.balance} 點`)}
                    </p>
                    {!quote.enough && (
                      <p className="text-tiny text-warning-700">
                        {en ? "Not enough points for all of them. It will write as many as you can afford, then pause — continue after your points refill."
                          : "點數不夠寫完全部。會先寫到點數用完為止，然後暫停——點數補了之後再按「繼續」。"}
                      </p>
                    )}
                    {quote.note && <p className="text-tiny text-warning-700">{quote.note}</p>}
                    {quote.ignoredColumns.length > 0 && (
                      <p className="text-tiny text-warning-700">
                        {en ? `Ignored columns (no matching field on this card): ${quote.ignoredColumns.join(", ")}`
                          : `這幾欄對不上這張卡的欄位，沒有帶入：${quote.ignoredColumns.join("、")}`}
                      </p>
                    )}
                    {quote.truncated && <p className="text-tiny text-warning-700">{en ? "Only the first 50 products are used." : "最多一次 50 個商品，超過的沒有放進來。"}</p>}
                    <p className="text-tiny text-default-500">{quote.labels.slice(0, 12).join("、")}{quote.labels.length > 12 ? "…" : ""}</p>
                  </section>
                )}
              </>
            )}

          {(batchesQ.data as any[] | undefined)?.length ? (
            <section className="space-y-1.5">
              <p className="text-small font-medium">{en ? "Recent batches" : "最近的批次"}</p>
              <ul className="divide-y divide-divider rounded-medium border border-divider">
                {(batchesQ.data as any[]).map((b) => (
                  <li key={b.id}>
                    <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-default-50"
                      onClick={() => { onClose(); navigate(`/batch/${b.id}`); }}>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{b.name}</span>
                      <span className="text-tiny tabular-nums text-default-500">
                        {en ? `${b.counts.approved}/${b.counts.total} approved` : `已核准 ${b.counts.approved}／${b.counts.total}`}
                      </span>
                      <span className="rounded-full border border-divider px-2 py-0.5 text-tiny text-default-600">{statusText(b.status)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </ModalBody>
        <ModalFooter className="gap-2">
          <Button variant="flat" size="sm" onPress={onClose}>{en ? "Close" : "關閉"}</Button>
          {!quote ? (
            <Button color="primary" size="sm" isDisabled={!cardId || !hasInput} isLoading={busy === "quote"}
              onPress={() => { setBusy("quote"); quoteMut.mutate(body); }}>
              {en ? "Estimate" : "估算點數"}
            </Button>
          ) : (
            <Button color="primary" size="sm" isDisabled={quote.count === 0} isLoading={busy === "create"}
              onPress={() => { setBusy("create"); createMut.mutate(body); }}>
              {en ? `Start writing ${quote.count}` : `開始寫 ${quote.count} 個`}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
