/**
 * 文字分頁（語氣、用詞、CTA、鉤子庫）。
 */
import { type EditableCard } from "../../components/assets/CustomCardEditor";
import { useLang } from "../../../../lib/i18n";
import { trpc } from "../../../../lib/trpc";
import React, { useState } from "react";
import CopyAssetBoard, { COPY_ASSETS } from "../../components/assets/CopyAssetBoard";
import { faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { CheckIcon } from "../../../platform/components/icons";
import { StrategyToolIcon } from "./tabChrome";

export function CopyTabInline({
  brandId, brandAssets, fullPositioning, locked, customCards, onEditCustomCard, onDeleteCustomCard,
}: {
  brandId: number | null;
  brandAssets: Record<string, any>;
  fullPositioning: Record<string, any>;
  locked: boolean;
  // 2026-09-26：鎖定改由上方那條既有的鎖定列負責，所以這裡不再收 onLockToggle——
  // 留著一個永遠不會被呼叫的 callback，只會讓下一個人以為這裡按了會鎖定
  // （PositioningTopRow 2026-09-24 已經踩過同一個坑）。
  /** 2026-09-26（CJ「新增的任務卡，也可以由用戶自行定義卡片名稱和內容」）：
   *  跟品牌頁同一份自訂卡片（positioning 的 customSegments），不是另一套。 */
  customCards?: { id: string; title: string; fields: { key: string; label: string; value: string }[] }[];
  onEditCustomCard?: (card: EditableCard | null) => void;
  onDeleteCustomCard?: (segmentId: string) => void;
}) {
  const { lang } = useLang();
  const utils = (trpc as any).useUtils?.() ?? null;
  const saveMut = (trpc as any).scope?.savePositioning?.useMutation
    ? (trpc as any).scope.savePositioning.useMutation({
        onSuccess: () => utils?.scope?.active?.invalidate?.(),
      })
    : null;
  const bulkMut = (trpc as any).brandKnowledge?.bulkSuggestEmptyAssets?.useMutation?.();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkFillingKeys, setBulkFillingKeys] = useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<{ filled: number; sources: string[] } | null>(null);
  const [bulkErr, setBulkErr] = useState<string | null>(null);

  // Local working draft per asset key — keeps inputs responsive while a
  // 800ms debounce flushes to the server.
  const [drafts, setDrafts] = useState<Record<string, any>>(brandAssets);
  React.useEffect(() => { setDrafts((d) => ({ ...brandAssets, ...d })); /* server > local on first load only */ }, [brandId]); // eslint-disable-line
  // Whenever server data changes (fresh fetch), merge in only keys we
  // haven't locally edited yet (avoid clobbering user typing).
  const dirtyRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    setDrafts((d) => {
      const next = { ...d };
      for (const k of Object.keys(brandAssets)) {
        if (!dirtyRef.current.has(k)) next[k] = brandAssets[k];
      }
      return next;
    });
  }, [brandAssets]);

  const timersRef = React.useRef<Record<string, any>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // 2026-09-26：使用者自己加的文字卡片。存在 positioning._assetCards（跟
  // _assets 同一層），所以不需要新欄位也不必改 schema。
  const addedCopyCards: string[] = Array.isArray((fullPositioning as any)?._assetCards)
    ? ((fullPositioning as any)._assetCards as any[]).filter((k) => typeof k === "string")
    : [];
  const addCopyCard = (key: string) => {
    if (locked || !brandId || addedCopyCards.includes(key)) return;
    const merged = { ...fullPositioning, _assetCards: [...addedCopyCards, key] };
    saveMut?.mutate?.({ kind: "brand", id: brandId, positioning: merged });
  };

  /**
   * 2026-09-26（CJ「任務卡上，要增加刪除的按鈕」）：刪掉一張預設卡。
   *
   * **內容一定要一起清掉**：顯示規則是「有內容的一定看得見」（CopyAssetBoard
   * .visibleKeys），只把 key 從 _assetCards 拿掉的話，那張卡下一秒又自己回來，
   * 看起來像刪除壞了。所以確認訊息要先講明這件事——有內容的卡片刪掉就是真的
   * 刪掉那幾條。
   */
  const deleteCopyCard = (key: string) => {
    if (locked || !brandId) return;
    const hadContent = !isEmpty(key);
    const msg = hadContent
      ? (lang === "en"
          ? "Delete this card? Everything written in it will be removed."
          : "確定要刪除這張卡片嗎？裡面寫的內容會一起刪掉。")
      : (lang === "en" ? "Remove this card?" : "確定要移除這張卡片嗎？");
    if (!confirm(msg)) return;
    dirtyRef.current.add(key);
    setDrafts((d) => ({ ...d, [key]: null }));
    const merged = {
      ...fullPositioning,
      _assets: { ...(fullPositioning._assets ?? {}), [key]: null },
      _assetCards: addedCopyCards.filter((k) => k !== key),
    };
    saveMut?.mutate?.({ kind: "brand", id: brandId, positioning: merged }, {
      onSuccess: () => dirtyRef.current.delete(key),
    });
  };

  const updateAsset = (key: string, next: any) => {
    if (locked || !brandId) return;
    dirtyRef.current.add(key);
    setDrafts((d) => ({ ...d, [key]: next }));
    // Debounced flush
    if (timersRef.current[key]) clearTimeout(timersRef.current[key]);
    setSavingKey(key);
    timersRef.current[key] = setTimeout(() => {
      const merged = {
        ...fullPositioning,
        _assets: { ...(fullPositioning._assets ?? {}), [key]: next },
      };
      saveMut?.mutate?.({ kind: "brand", id: brandId, positioning: merged }, {
        onSuccess: () => { setSavingKey(null); dirtyRef.current.delete(key); },
        onError:   () => setSavingKey(null),
      });
    }, 800);
  };

  // Detect empty asset keys (for the global "自動填寫所有空欄" button).
  const isEmpty = (k: string): boolean => {
    const v = drafts[k];
    if (!v) return true;
    if (typeof v.text === "string" && v.text.trim().length > 0) return false;
    if (Array.isArray(v.items) && v.items.filter((x: any) => typeof x === "string" && x.trim()).length > 0) return false;
    if (Array.isArray(v.pairs) && v.pairs.filter((p: any) => p?.from?.trim() && p?.to?.trim()).length > 0) return false;
    return true;
  };
  const allCopyKeys = COPY_ASSETS.map((a) => a.key);
  const emptyKeys = allCopyKeys.filter(isEmpty);

  const handleBulkAutoFill = async () => {
    if (!brandId || locked || bulkBusy || emptyKeys.length === 0) return;
    setBulkErr(null); setBulkResult(null); setBulkBusy(true);
    setBulkFillingKeys(new Set(emptyKeys));
    try {
      const r = await bulkMut?.mutateAsync?.({ brandId, emptyKeys });
      if (!r?.ok) { setBulkErr(lang === "en" ? "Auto-fill failed (no server response)" : "自動填寫失敗（伺服器無回應）"); return; }
      // Merge all results into drafts and persist in ONE save.
      const updates: Record<string, any> = {};
      for (const [k, payload] of Object.entries(r.results ?? {})) {
        updates[k] = (payload as any).value;
        // Mark filled keys dirty so server-state refresh doesn't clobber them.
        dirtyRef.current.add(k);
      }
      const nextDrafts = { ...drafts, ...updates };
      setDrafts(nextDrafts);
      if (saveMut && Object.keys(updates).length > 0) {
        const merged = {
          ...fullPositioning,
          _assets: { ...(fullPositioning._assets ?? {}), ...updates },
        };
        saveMut.mutate({ kind: "brand", id: brandId, positioning: merged }, {
          onSuccess: () => {
            // Now safe to clear dirty flag — server has the values.
            for (const k of Object.keys(updates)) dirtyRef.current.delete(k);
          },
        });
      }
      setBulkResult({ filled: Object.keys(updates).length, sources: r.sources ?? [] });

      // Surface per-field failures (the silent-fail bug from 2026-05-07)
      const errCount = Object.keys(r.errors ?? {}).length;
      const warnings: string[] = [];
      if (!r.hasRealContent) {
        warnings.push(lang === "en"
          ? "No website / FB found — results may be off. Add a website / social links in Settings, then retry."
          : "找不到官網 / FB — 結果可能不準。請到「設定」補上 website / socialLinks 後重試。");
      }
      if (errCount > 0) {
        const firstFew = Object.entries(r.errors ?? {}).slice(0, 3)
          .map(([k, msg]) => `${k}: ${msg}`).join(" | ");
        warnings.push(lang === "en"
          ? `${errCount} field(s) failed (${firstFew}${errCount > 3 ? " …" : ""})`
          : `${errCount} 個欄位失敗（${firstFew}${errCount > 3 ? " …" : ""}）`);
      }
      if (warnings.length > 0) setBulkErr(warnings.join("\n"));
    } catch (e: any) {
      setBulkErr(String(e?.message ?? e));
    } finally {
      setBulkBusy(false);
      setBulkFillingKeys(new Set());
    }
  };

  if (!brandId) {
    return <div className="p-8 text-center text-default-700">{lang === "en" ? "Pick a brand first" : "請先選擇品牌"}</div>;
  }

  return (
    <div style={{ padding: "16px 28px 32px", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* 2026-09-26（CJ「自動填寫等功能，也變成 chips 就好」）：原本是一顆黑色
          大按鈕＋另一顆鎖定按鈕分站兩端。改成跟品牌頁同一顆 StrategyToolIcon
          的 pill —— 同一種動作在站上只有一種長相。 */}
      <div className="flex items-center gap-2 flex-wrap">
        <StrategyToolIcon
          active={bulkBusy}
          onClick={() => { if (!bulkBusy && !locked && emptyKeys.length > 0) void handleBulkAutoFill(); }}
          icon={faWandMagicSparkles}
          label={bulkBusy
            ? (lang === "en" ? `Auto-filling (${bulkFillingKeys.size})…` : `自動填寫中（${bulkFillingKeys.size}）…`)
            : emptyKeys.length === 0
              ? (lang === "en" ? "All filled" : "全部已填寫")
              : (lang === "en" ? `Auto-fill ${emptyKeys.length}` : `自動填寫 ${emptyKeys.length} 欄`)}
          title={locked
            ? (lang === "en" ? "Locked — unlock to edit" : "已鎖定，解鎖才能編輯")
            : emptyKeys.length === 0
              ? (lang === "en" ? "Every card already has content" : "每張卡都有內容了")
              : (lang === "en"
                  ? `Fill the remaining ${emptyKeys.length} cards from website / FB`
                  : `根據官網 / FB 自動填寫剩下的 ${emptyKeys.length} 張卡`)}
        />
        {/* 鎖定不放在這裡：上方那條「文字 尚未鎖定／鎖定文字」的列已經是
            同一個動作。同一件事給兩顆按鈕，使用者會以為它們不一樣。 */}
        <span className="text-tiny text-default-500">
          {savingKey ? (lang === "en" ? "Saving…" : "儲存中…") : (lang === "en" ? "Auto-save on" : "自動儲存")}
        </span>
      </div>

      {(bulkErr || bulkResult) && (
        <div className={`text-xs px-3 py-2 rounded-lg whitespace-pre-line ${
          bulkErr && !bulkResult ? "bg-amber-50 text-amber-800" :
          bulkErr ? "bg-amber-50 text-amber-800" :
          "bg-emerald-50 text-emerald-800"
        }`}>
          {bulkResult && <div><CheckIcon size={11} /> {lang === "en"
            ? `Filled ${bulkResult.filled} fields${bulkResult.sources.length > 0 ? ` (sources: ${bulkResult.sources.join(" + ")})` : ""}`
            : `已填入 ${bulkResult.filled} 個欄位${bulkResult.sources.length > 0 ? `（來源：${bulkResult.sources.join(" + ")}）` : ""}`}</div>}
          {bulkErr && <div>{bulkErr}</div>}
        </div>
      )}

      {/* 2026-09-26（CJ「改成跟品牌頁面相同格式的任務卡格式」＋「一開始，只要
          出現推薦用詞、禁用詞與縮寫對照就好，其他的欄位，都提供新增的卡片的
          選項」）：原本一次攤開 4 組 11 張圖磚。十一個空欄位擺在眼前，使用者
          不知道從哪格開始，結果一格都不填。改成預設三張＋自己加。
          顯示規則見 CopyAssetBoard.visibleKeys——已經有內容的卡片一定看得見，
          不然既有品牌會以為資料不見了。 */}
      <CopyAssetBoard
        brandId={brandId}
        drafts={drafts}
        added={addedCopyCards}
        onChange={updateAsset}
        onAddCard={addCopyCard}
        readOnly={locked}
        fillingKeys={bulkFillingKeys}
        lang={lang}
        customCards={customCards ?? []}
        onEditCustomCard={onEditCustomCard}
        onDeleteCard={deleteCopyCard}
        onDeleteCustomCard={onDeleteCustomCard}
      />
    </div>
  );
}
