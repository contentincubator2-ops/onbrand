/**
 * VendorFinder — 產出旁邊的「找合作對象」。
 *
 * 2026-10-01（CJ「在網紅或臉書經營的實際產出旁邊…用 AI 幫忙查出可以合作的廠商，可以自己
 * 接洽聯繫」→「就開始做 AI 搜尋，先不做報價紀錄」）。規則在 server/content/core/vendorFinder.ts：
 * 先搜公開網頁，再只從搜尋結果整理；網址對不上搜尋結果的丟掉。不給價格，系統不替人聯繫。
 *
 * 兩個動作都是使用者自己做：打開官網／聯絡頁，或用自己的信箱開一封帶著這篇內容的草稿。
 */
import React from "react";
import { Button, Input, Spinner } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faEnvelope, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../lib/trpc";

/** 跟 server 的 vendorKindFor 同一條規則：網紅卡、異業合作卡、標了廣告的貼文。 */
export function vendorKindOf(taskId: string | null | undefined, paid: boolean): string | null {
  const id = String(taskId ?? "");
  if (id.startsWith("kl-")) return "kol_agency";
  if (id.startsWith("cb-")) return "cobrand_partner";
  return paid ? "ad_agency" : null;
}

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

export default function VendorFinder({ outputId, taskId, caption, title, en }: {
  outputId: number; taskId: string | null | undefined; caption: string; title?: string; en: boolean;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const ctxQ = (trpc as any).vendor.context.useQuery({ outputId, taskId: taskId ?? null }, { refetchOnWindowFocus: false, staleTime: 10 * 60_000 });
  const [query, setQuery] = React.useState("");
  React.useEffect(() => { if (ctxQ.data?.query) setQuery((q) => q || ctxQ.data.query); }, [ctxQ.data?.query]);
  const searchMut = (trpc as any).vendor.search.useMutation();
  const kind = ctxQ.data?.kind ?? null;

  if (ctxQ.isLoading) return <p className="text-[12px] text-default-500">{L("載入中…", "Loading…")}</p>;
  if (!kind) return <p className="text-[12px] text-default-500">{L("這篇不需要找合作對象。", "Nothing to source for this one.")}</p>;

  const vendors: any[] = searchMut.data?.vendors ?? [];
  // 用自己的信箱開草稿：主旨是這篇的標題，內文是這篇內容（mailto 太長會被截，留 1,500 字）。
  const mailto = `mailto:?subject=${encodeURIComponent(title || L("合作邀請", "Collaboration"))}&body=${encodeURIComponent(caption.slice(0, 1500))}`;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-tiny font-semibold">{L(`找${ctxQ.data.label}`, `Find: ${ctxQ.data.label}`)}</p>
        <p className="text-[12px] text-default-500 leading-relaxed">{L(
          "AI 依公開網頁搜尋，只列搜尋結果裡找得到的公司，並附出處。名單與資訊請自行確認；系統不會替你聯繫任何人，也不估價格。",
          "Searched from public web pages; each company comes with its source. Please verify. We never contact anyone for you and don't estimate prices.")}</p>
      </div>
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (query.trim().length >= 2) searchMut.mutate({ outputId, kind, query: query.trim() }); }}>
        <Input size="sm" variant="bordered" radius="md" value={query} onValueChange={setQuery} aria-label={L("搜尋什麼", "Search for")} />
        <Button size="sm" type="submit" color="primary" radius="md" isLoading={searchMut.isPending} isDisabled={query.trim().length < 2}
          startContent={!searchMut.isPending ? <FontAwesomeIcon icon={faMagnifyingGlass} /> : undefined}>{L("搜尋", "Search")}</Button>
      </form>
      {searchMut.isPending && <p className="text-[12px] text-default-500 flex items-center gap-2"><Spinner size="sm" />{L("搜尋公開網頁、整理中，大約 20–40 秒…", "Searching the web… about 20–40s")}</p>}
      {searchMut.error && <p className="text-[12px] text-danger">{String(searchMut.error.message).slice(0, 200)}</p>}
      {searchMut.data && !vendors.length && (
        <p className="text-[12px] text-default-500">{L("這次沒找到有出處的公司。換個關鍵字試試（例如加上領域或平台）。", "No sourced companies found. Try different keywords.")}</p>
      )}
      {vendors.map((v) => (
        <div key={v.name + (v.website ?? "")} className="rounded-lg border border-default-200 px-3 py-2 flex flex-col gap-1">
          <p className="text-small font-semibold">{v.name}</p>
          {v.what && <p className="text-[12px] text-default-600">{v.what}</p>}
          {v.why && <p className="text-[12px] text-default-500">{L("為什麼適合：", "Why: ")}{v.why}</p>}
          <div className="flex items-center gap-3 flex-wrap pt-0.5">
            {v.website && (
              <a href={v.website} target="_blank" rel="noreferrer" className="text-[12px] text-default-700 hover:text-foreground flex items-center gap-1">
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-[10px]" />{host(v.website)}
              </a>
            )}
            {v.contactUrl && (
              <a href={v.contactUrl} target="_blank" rel="noreferrer" className="text-[12px] text-default-700 hover:text-foreground flex items-center gap-1">
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-[10px]" />{L("聯絡頁", "Contact page")}
              </a>
            )}
            {(v.sources ?? []).map((s: string, i: number) => (
              <a key={s} href={s} target="_blank" rel="noreferrer" className="text-[11px] text-default-400 hover:text-default-700">
                {L(`出處${i + 1}`, `Source ${i + 1}`)}
              </a>
            ))}
          </div>
        </div>
      ))}
      {vendors.length > 0 && (
        <a href={mailto} className="self-start text-[12px] text-default-700 hover:text-foreground flex items-center gap-1.5">
          <FontAwesomeIcon icon={faEnvelope} />{L("用自己的信箱開一封草稿（內文是這篇）", "Open a draft in your own mail app")}
        </a>
      )}
    </div>
  );
}
