/**
 * EventProductScopePicker — 這檔活動搭配什麼：單一產品／多個產品聯合／純品牌。
 *
 * 2026-09-30（CJ「在新增活動的過程中，要讓用戶可以選擇，該活動是搭配哪個產品
 * 或是好幾個產品聯合或是 純品牌活動」）。
 *
 * 一排 chip 就回答完三種情況，不另外做「活動種類」的單選再展開產品清單：
 *   · 點一個產品＝單一產品活動
 *   · 點好幾個＝聯合活動
 *   · 點「純品牌活動」＝不主打產品（跟產品互斥）
 * 都沒點＝還沒選。選取規則在 lib/eventProductScope.ts（有測試）。
 *
 * 新增活動視窗與宣傳企劃頁用的是同一個元件——同一個問題不該有兩種長相。
 */
import { Chip } from "@heroui/react";
import { HelpTip } from "../../../platform/components/HelpTip";
import {
  toggleProduct, toggleBrandOnly, scopeSummary, type ProductScopeValue,
} from "../../lib/eventProductScope";

export default function EventProductScopePicker({ products, value, onChange, en, isDisabled }: {
  products: Array<{ id: number; name: string }>;
  value: ProductScopeValue;
  onChange: (next: ProductScopeValue) => void;
  en: boolean;
  isDisabled?: boolean;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const summary = scopeSummary(value, en);
  const sorted = [...products].sort((a, b) => a.id - b.id);   // 兩個入口的來源排序不同，這裡統一
  const pick = (next: ProductScopeValue) => { if (!isDisabled) onChange(next); };
  // HeroUI 的 default solid 只比 flat 深一階灰，選了跟沒選幾乎看不出來——這一排的重點就是
  // 「選了哪幾個」，所以選取態用前景色反白（中性色，不是裝飾色）。
  const chipClass = (on: boolean) =>
    `${isDisabled ? "opacity-60" : "cursor-pointer"} ${on ? "bg-foreground text-background" : ""}`;

  return (
    <div data-testid="event-product-scope">
      <p className="text-tiny text-default-500 mb-2 flex items-center gap-1">
        {L("這檔活動搭配", "This campaign features")}
        <HelpTip>
          {L("選一個產品＝單一產品活動；選好幾個＝聯合活動；不主打任何產品就選「純品牌活動」。企劃與每一篇文案都會照這個寫。",
             "Pick one product for a single-product campaign, several for a joint one, or “Brand campaign” if no product leads. The plan and every post follow this.")}
        </HelpTip>
        {summary && <span className="text-default-700 font-medium ml-1">{summary}</span>}
      </p>
      <div className="flex gap-1.5 flex-wrap items-center">
        <Chip size="sm" color="default" className={chipClass(value.scope === "brand")}
          variant={value.scope === "brand" ? "solid" : "flat"}
          aria-pressed={value.scope === "brand"} data-scope-chip="brand"
          onClick={() => pick(toggleBrandOnly(value))}>
          {L("純品牌活動", "Brand campaign")}
        </Chip>
        {products.length > 0 && <span className="text-default-300 select-none" aria-hidden>|</span>}
        {sorted.map((p) => {
          const on = value.scope === "products" && value.productIds.includes(p.id);
          return (
            <Chip key={p.id} size="sm" color="default" className={chipClass(on)}
              variant={on ? "solid" : "flat"} aria-pressed={on} data-scope-chip={`product-${p.id}`}
              onClick={() => pick(toggleProduct(value, p.id))}>
              {p.name}
            </Chip>
          );
        })}
        {products.length === 0 && (
          <span className="text-tiny text-default-500">
            {L("這個品牌還沒有產品", "This brand has no products yet")}
          </span>
        )}
      </div>
    </div>
  );
}
