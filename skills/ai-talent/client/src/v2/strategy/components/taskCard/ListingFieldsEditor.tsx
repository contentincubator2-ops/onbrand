/**
 * ListingFieldsEditor — 商品頁卡要交付哪些欄位、各欄的字數上限。
 *
 * 2026-10-04（CJ「要寫 momoshop 產品介紹、蝦皮賣場」）。字數上限讓用戶自己填，留空＝不驗：
 * 平台的字數規定會變，我們沒有逐一查證，不替用戶寫死一個可能已經過期的數字。
 * 「待補資料」那一欄由系統固定放在最後（模型不知道的事實列在那裡而不是編出來），不能刪。
 */
import React from "react";
import { Button, Input } from "@heroui/react";
import { AddIcon, DeleteIcon } from "../../../platform/components/icons";

export type ListingKind = "text" | "bullets" | "long";
export interface ListingFieldDraft { key?: string; label: string; kind: ListingKind; maxChars: string }

export const DEFAULT_LISTING_DRAFT: ListingFieldDraft[] = [
  { key: "title", label: "商品標題", kind: "text", maxChars: "" },
  { key: "bullets", label: "賣點條列", kind: "bullets", maxChars: "" },
  { key: "specs", label: "規格資訊", kind: "bullets", maxChars: "" },
  { key: "description", label: "商品描述", kind: "long", maxChars: "" },
  { key: "keywords", label: "搜尋關鍵字", kind: "text", maxChars: "" },
];

/** 後端存的欄位 → 編輯用的草稿（去掉「待補資料」，那一欄由系統固定補上）。 */
export function draftFromFields(fields: Array<{ key: string; label: string; kind: ListingKind; maxChars?: number }> | undefined | null): ListingFieldDraft[] {
  const list = (fields ?? []).filter((f) => f.key !== "todo");
  if (list.length === 0) return DEFAULT_LISTING_DRAFT.map((f) => ({ ...f }));
  return list.map((f) => ({ key: f.key, label: f.label, kind: f.kind, maxChars: f.maxChars ? String(f.maxChars) : "" }));
}

/** 草稿 → 送給後端的欄位（空標題丟掉、上限轉數字）。 */
export function fieldsFromDraft(draft: ListingFieldDraft[]) {
  return draft
    .filter((f) => f.label.trim())
    .map((f) => {
      const n = parseInt(f.maxChars, 10);
      return { ...(f.key ? { key: f.key } : {}), label: f.label.trim(), kind: f.kind, ...(Number.isFinite(n) && n > 0 ? { maxChars: n } : {}) };
    });
}

const KIND_LABEL: Record<ListingKind, { zh: string; en: string }> = {
  text: { zh: "一行文字", en: "One line" },
  bullets: { zh: "條列", en: "Bullets" },
  long: { zh: "段落", en: "Paragraphs" },
};

export default function ListingFieldsEditor({ value, onChange, en }: {
  value: ListingFieldDraft[];
  onChange: (next: ListingFieldDraft[]) => void;
  en: boolean;
}) {
  const set = (i: number, patch: Partial<ListingFieldDraft>) => onChange(value.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="space-y-2">
      <p className="text-small font-medium">{en ? "Fields on the product page" : "商品頁的欄位"}</p>
      <p className="text-tiny text-default-500">
        {en
          ? "Each run delivers these fields, one block each. Fill in a platform's character limit if it has one (leave blank for no limit) — nothing is cut for you; over-limit fields are flagged."
          : "每次執行會交付這幾個欄位，一欄一塊。平台有字數上限的話填在右邊（留空＝不限）——系統不會替你截斷，超過的欄位會標紅。"}
      </p>
      {value.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input size="sm" className="flex-1" value={f.label}
            placeholder={en ? "Field name" : "欄位名稱"}
            onValueChange={(v) => set(i, { label: v.replace(/[【】\n]/g, "").slice(0, 12) })} />
          <select
            value={f.kind}
            onChange={(e) => set(i, { kind: e.target.value as ListingKind })}
            className="h-8 rounded-lg border border-default-200 bg-white px-2 text-[12.5px]"
            aria-label={en ? "Field type" : "欄位型態"}
          >
            {(Object.keys(KIND_LABEL) as ListingKind[]).map((k) => <option key={k} value={k}>{en ? KIND_LABEL[k].en : KIND_LABEL[k].zh}</option>)}
          </select>
          <Input size="sm" className="w-24" inputMode="numeric" value={f.maxChars}
            placeholder={en ? "Max chars" : "字數上限"}
            onValueChange={(v) => set(i, { maxChars: v.replace(/\D/g, "").slice(0, 4) })} />
          <Button size="sm" variant="light" isIconOnly isDisabled={value.length <= 1}
            onPress={() => onChange(value.filter((_, j) => j !== i))}>
            <DeleteIcon size={14} className="text-danger-500" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="flat" startContent={<AddIcon size={14} />} isDisabled={value.length >= 9}
          onPress={() => onChange([...value, { label: "", kind: "text", maxChars: "" }])}>
          {en ? "Add a field" : "加一個欄位"}
        </Button>
        <span className="text-tiny text-default-400">
          {en ? "“Facts still needed” is always added last." : "最後一欄固定是「待補資料」：AI 不知道的事實列在那裡，不會亂編。"}
        </span>
      </div>
    </div>
  );
}
