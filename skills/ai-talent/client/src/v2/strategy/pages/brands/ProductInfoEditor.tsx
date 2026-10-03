/**
 * 產品基本資料編輯。
 */
import React, { useState } from "react";
import { trpc } from "../../../../lib/trpc";
import { Spinner, Input, Textarea, Button } from "@heroui/react";
import { CheckIcon } from "../../../platform/components/icons";

// 2026-05-18 (CJ「產品基本資料東西太少，右下也沒有 +新增選單管理」):
// real product editor — name / SKU / URL / positioning + re-analyze.
// Mirrors the brand BrandBasicEditor. Persists into product.upsert
// (positioning JSON carries summary/website/sku — no schema migration).
export function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-default-500 mb-1.5">{label}</div>
      {children}
    </div>
  );
}

export function ProductInfoEditor({ productId, brandName, en }: { productId: number; brandName: string | null; en: boolean }) {
  const q = (trpc as any).product?.get?.useQuery(
    { id: productId },
    { enabled: !!productId, refetchOnWindowFocus: false },
  );
  const upsertM = (trpc as any).product?.upsert?.useMutation?.({ onSuccess: () => q?.refetch?.() });
  const startPositioningM = (trpc as any).positioningJobs?.start?.useMutation?.();

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [website, setWebsite] = useState("");
  const [usp, setUsp] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [recalDone, setRecalDone] = useState(false);

  React.useEffect(() => {
    const p = q?.data;
    if (!p) return;
    setName(p.name ?? "");
    const pos = (typeof p.positioning === "string" ? safeParse(p.positioning) : p.positioning) ?? {};
    setSku(pos.sku ?? "");
    setWebsite(pos.website ?? "");
    // summary may have an appended 「官方網址：…」 line — show only the USP part
    setUsp(String(pos.summary ?? "").replace(/\n?官方網址：.*$/s, "").trim());
  }, [q?.data]);

  function safeParse(s: string): any { try { return JSON.parse(s); } catch { return {}; } }

  async function handleSave() {
    if (!productId || !upsertM?.mutateAsync) return;
    const p = q?.data;
    const existingPositioning = (typeof p?.positioning === "string"
      ? safeParse(p.positioning)
      : p?.positioning) ?? {};
    const w = website.trim();
    const summary = [usp.trim(), w ? `官方網址：${w}` : ""].filter(Boolean).join("\n");
    await upsertM.mutateAsync({
      id: productId,
      brandId: p?.brandId ?? undefined,
      slug: p?.slug ?? String(productId),
      name: name.trim() || (p?.name ?? "未命名產品"),
      // 2026-08-21: spread existing positioning so imageUrl / price /
      // pipeline segments survive an edit. Cleared fields are sent as null
      // (not undefined) — the server's merge drops undefined keys, so null
      // is the only way for the user to actually clear a value.
      positioning: {
        ...existingPositioning,
        summary: summary || null,
        website: w || null,
        sku: sku.trim() || null,
      },
    });
    setSavedAt(Date.now());
  }

  async function handleRecalibrate() {
    if (!productId) return;
    await handleSave();
    await startPositioningM?.mutateAsync?.({ entityKind: "product", entityId: productId, lang: "zh-TW" });
    setRecalDone(true);
  }

  if (q?.isLoading) {
    return <div className="mt-4 flex justify-center"><Spinner size="sm" /></div>;
  }

  return (
    <div className="bg-default-50 rounded-xl border border-default-200 p-5">
      <FieldRow label={en ? "Belongs to brand" : "所屬品牌"}>
        <div className="text-sm text-default-700 px-1">{brandName ?? "—"}</div>
      </FieldRow>
      <FieldRow label={en ? "Product name" : "產品名稱"}>
        <Input size="sm" value={name} onChange={(e) => setName(e.target.value)} />
      </FieldRow>
      <FieldRow label={en ? "SKU (optional)" : "SKU 型號（可選）"}>
        <Input size="sm" value={sku} onChange={(e) => setSku(e.target.value)} placeholder={en ? "e.g. OB-PRO-2026" : "例：OB-PRO-2026"} />
      </FieldRow>
      <FieldRow label={en ? "Product URL" : "產品網址"}>
        <Input size="sm" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://onbrand.sowork.ai" />
        <p className="text-tiny text-default-400 mt-1">{en ? "The AI re-reads this page when you re-analyze." : "按「重新分析」時 AI 會重讀這個頁面"}</p>
      </FieldRow>
      <FieldRow label={en ? "Positioning / USP" : "產品定位 / USP"}>
        <Textarea minRows={3} value={usp} onChange={(e) => setUsp(e.target.value)}
          placeholder={en ? "What makes this product different — the AI treats this as ground truth." : "這個產品的核心差異——AI 會把這段當成事實依據。"} />
      </FieldRow>
      <div className="flex flex-wrap items-center gap-3 mt-2">
        <Button size="sm" color="primary" isLoading={upsertM?.isPending}
          isDisabled={!productId || upsertM?.isPending} onPress={handleSave}>
          {en ? "Save" : "儲存"}
        </Button>
        <Button size="sm" variant="flat" color="secondary" isLoading={startPositioningM?.isPending}
          isDisabled={!productId || startPositioningM?.isPending} onPress={handleRecalibrate}
          title={en ? "Re-reads the product URL and rebuilds positioning" : "重新讀取產品頁，重建產品定位"}>
          {en ? "Re-analyze (re-read product page)" : "重新分析（重讀產品頁）"}
        </Button>
        {savedAt && !upsertM?.isPending && (
          <span className="text-tiny text-success-600 inline-flex items-center gap-1"><CheckIcon size={10} />{en ? "Saved" : "已儲存"}</span>
        )}
        {recalDone && !startPositioningM?.isPending && (
          <span className="text-tiny text-secondary-600">
            {en ? "Re-analysis started — updates in the background." : "已開始重新分析 — 會在背景更新產品定位"}
          </span>
        )}
      </div>
    </div>
  );
}
