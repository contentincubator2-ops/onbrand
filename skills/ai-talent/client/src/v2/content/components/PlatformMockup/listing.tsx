import React from "react";
import { Card, CardBody, Button } from "@heroui/react";
import { faStore } from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader } from "./shared";
import { useLang } from "../../../../lib/i18n";
import { showToastGlobal } from "../../../platform/components/Toast";
import {
  parseListingCaption, plainValue, todoItems, listingCsv, downloadTextFile, TODO_FIELD_KEY,
  type ListingRow,
} from "../../lib/listingParse";

/**
 * ListingMockup — 商品頁（電商賣場／官網商品頁）成品：一個欄位一張卡。
 *
 * 2026-10-04（CJ「要寫 momoshop 產品介紹、蝦皮賣場」）。貼進平台時是一個欄位一個欄位貼的，
 * 所以預覽也是一欄一欄：每欄各自有「複製」與字數；有上限的欄位超標就標出來
 * （系統不會替用戶截斷——標題切在半句話上比超標更糟，由用戶自己決定怎麼改）。
 *
 * 顏色只傳達狀態（超標＝紅、模型沒寫出來／有待補資料＝黃），不拿來裝飾。
 */
export function ListingMockup({ title, variantLabel, liveCaption, liveListing }: MockupFields) {
  const { lang } = useLang();
  const en = lang === "en";
  const fields = liveListing?.fields ?? [];
  const rows = React.useMemo(() => parseListingCaption(liveCaption ?? "", fields as any), [liveCaption, fields]);
  const todo = todoItems(rows.find((r) => r.key === TODO_FIELD_KEY));
  const content = rows.filter((r) => r.key !== TODO_FIELD_KEY);
  const missing = content.filter((r) => r.value == null);
  const over = content.filter((r) => r.over);

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); showToastGlobal(en ? `Copied ${what}` : `已複製${what}`); }
    catch { showToastGlobal(en ? "Couldn't copy" : "複製失敗"); }
  };
  const copyAll = () => copy(content.map((r) => `${r.label}\n${plainValue(r)}`).join("\n\n"), en ? "everything" : "全部欄位");
  const exportCsv = () => {
    const name = (title || variantLabel || "listing").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40);
    downloadTextFile(`${name}.csv`, listingCsv([{ name: title || variantLabel || "", fields: content }]));
  };

  return (
    <div className="w-full max-w-[640px] mx-auto">
      <MockupHeader icon={faStore} label={en ? "Product listing" : "商品頁"} variantLabel={variantLabel} />
      <Card shadow="lg" radius="lg" className="border border-divider">
        <CardBody className="p-5 gap-4">
          {(missing.length > 0 || over.length > 0) && (
            <div className="rounded-lg border border-warning-300 bg-warning-50 px-3 py-2 text-[12.5px] leading-relaxed text-warning-800">
              {missing.length > 0 && (
                <p>{en ? `Not written: ${missing.map((r) => r.label).join(", ")}. Regenerate, or fill it in yourself.`
                  : `沒寫出來：${missing.map((r) => r.label).join("、")}。可以重新產生，或自己補上。`}</p>
              )}
              {over.length > 0 && (
                <p>{en ? `Over the limit: ${over.map((r) => `${r.label} ${r.length}/${r.maxChars}`).join(", ")}. Shorten before pasting — nothing was cut for you.`
                  : `超過上限：${over.map((r) => `${r.label} ${r.length}／${r.maxChars}`).join("、")}。貼進平台前請縮短——系統沒有替你截斷。`}</p>
              )}
            </div>
          )}

          {content.map((r) => <FieldBlock key={r.key} row={r} en={en} onCopy={() => copy(plainValue(r), r.label)} />)}

          {todo.length > 0 && (
            <div className="rounded-lg border border-warning-300 bg-warning-50 px-3 py-2.5">
              <p className="text-[12px] font-semibold text-warning-800">{en ? "Facts you still need to supply" : "還需要你補的資料"}</p>
              <ul className="mt-1 space-y-0.5 text-[13px] text-warning-900">
                {todo.map((t, i) => <li key={i}>・{t}</li>)}
              </ul>
              <p className="mt-1 text-[11.5px] text-warning-700">
                {en ? "These weren't in your input or brand data, so the AI left them out instead of guessing."
                  : "這些不在你的輸入或品牌資料裡，AI 沒有猜，而是留空。"}
              </p>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button size="sm" variant="bordered" onPress={copyAll}>{en ? "Copy all" : "複製全部"}</Button>
            <Button size="sm" variant="flat" onPress={exportCsv}>{en ? "Download CSV" : "下載 CSV"}</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function FieldBlock({ row, en, onCopy }: { row: ListingRow; en: boolean; onCopy: () => void }) {
  const empty = row.value == null;
  const counter = row.maxChars ? `${row.length}／${row.maxChars}` : `${row.length}`;
  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-default-800">{row.label}</h3>
        <div className="flex items-center gap-2">
          {!empty && (
            <span className={`text-[11.5px] tabular-nums ${row.over ? "font-semibold text-danger" : "text-default-400"}`}>
              {counter}{en ? " chars" : " 字"}
            </span>
          )}
          <button type="button" disabled={empty} onClick={onCopy}
            className="rounded-md border border-divider px-2 py-0.5 text-[11.5px] text-default-600 hover:border-default-400 disabled:opacity-40">
            {en ? "Copy" : "複製"}
          </button>
        </div>
      </div>
      {empty ? (
        <p className="mt-1 rounded-md border border-dashed border-warning-300 px-3 py-2 text-[12.5px] text-warning-700">
          {en ? "Not written" : "沒寫出來"}
        </p>
      ) : (
        <div className={`mt-1 whitespace-pre-wrap rounded-md border px-3 py-2 text-[13.5px] leading-relaxed ${row.over ? "border-danger-300 bg-danger-50" : "border-divider bg-default-50"}`}>
          {row.kind === "bullets"
            ? plainValue(row).split("\n").map((l, i) => <div key={i}>・{l}</div>)
            : row.value}
        </div>
      )}
    </section>
  );
}
