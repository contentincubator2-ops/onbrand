/**
 * CampaignBasisPanel — 活動頁右邊的「策略依據」（舊的 11 段活動定位，精簡版）。
 *
 * 2026-09-30（CJ「在總監對話底下的策略依據，可以改成一個跳出頁面嗎，或是可以替代右邊的
 * 行事曆，讓用戶還是可以透過跟總監的互動，進行修改和討論。並且可以再縮小」）：
 *   · 不做跳出視窗——那會蓋住左邊的對話。改成右邊在「企劃」與「策略依據」之間切換
 *     （控制列上，企劃草稿旁邊），左邊照常跟總監談。
 *   · 總監在對話裡改的格子直接出現在這裡（剛改的那幾格標「剛改」）；使用者也可以點一格
 *     自己改，離開就存。表格（得獎案例、管道配置、旅程）只讀——它們有自己的產生流程，
 *     要重跑到完整頁面。
 */
import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { EVENT_SEGMENTS } from "../../lib/positioningSchema";
import { shortTitle, toText, fromText, sameValue, type BasisPatch, type BasisValue } from "../../lib/campaign/campaignBasis";

/** 系統自己填、或只是索引用的欄位，不顯示。 */
const HIDDEN = new Set(["brief.eventType", "brief.relatedProducts", "guidelines.sourceWarning"]);

export default function CampaignBasisPanel({ raw, editable, recent, locked, en, onSave, onOpenFull }: {
  /** 11 段原樣（表格也在）。 */
  raw: Record<string, any>;
  /** 能改的格子目前的值（路徑 → 值）。 */
  editable: Record<string, BasisValue | null>;
  /** 剛被總監改過的格子。 */
  recent: Set<string>;
  locked: boolean;
  en: boolean;
  onSave: (patch: BasisPatch) => void;
  onOpenFull: () => void;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const boxRef = React.useRef<HTMLDivElement>(null);

  // 總監改了東西：捲到第一個剛改的格子。
  React.useEffect(() => {
    const first = [...recent][0];
    if (!first) return;
    boxRef.current?.querySelector(`[data-path="${first}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [recent]);

  const commit = (path: string, list: boolean) => {
    const v = fromText(draft, list);
    setEditing(null);
    if (!sameValue(v, editable[path])) onSave({ [path]: v });
  };

  const empty = EVENT_SEGMENTS.every((s) => !raw?.[s.id]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-5 pt-4 pb-3 flex items-start gap-3 shrink-0 border-b border-divider bg-content1">
        <div className="min-w-0">
          <p className="text-medium font-bold">{L("策略依據", "Strategy basis")}</p>
          <p className="text-tiny text-default-500">
            {locked
              ? L("企劃已定稿，策略依據跟著鎖住。", "The plan is locked, and so is its basis.")
              : L("跟左邊的策略總監說要改哪裡，他會直接改在這裡；也可以點一格自己改。", "Ask the director on the left to change anything here, or click a field to edit it yourself.")}
          </p>
        </div>
        <button type="button" onClick={onOpenFull}
          className="ml-auto shrink-0 text-tiny text-default-500 hover:text-foreground flex items-center gap-1.5 pt-0.5">
          {L("完整頁面", "Full page")}<FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-[10px]" />
        </button>
      </div>

      <div ref={boxRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {empty && (
          <p className="text-small text-default-500 mb-3">{L("這檔活動的策略依據還是空的。可以請總監幫你寫，或到完整頁面自動填寫。", "Nothing here yet — ask the director, or auto-fill it on the full page.")}</p>
        )}
        <div className="grid gap-3 xl:grid-cols-2 items-start">
          {EVENT_SEGMENTS.map((seg) => {
            const fields = seg.fields.filter((f) => !HIDDEN.has(`${seg.id}.${f.key}`));
            const tables = fields.filter((f) => f.type === "tableRows");
            const plain = fields.filter((f) => f.type !== "tableRows");
            if (!plain.length && !tables.some((f) => Array.isArray(raw?.[seg.id]?.[f.key]) && raw[seg.id][f.key].length)) return null;
            return (
              <section key={seg.id} className="rounded-xl bg-content1 border border-divider px-3.5 py-3 flex flex-col gap-2 min-w-0">
                <p className="text-small font-bold">
                  <span className="text-default-400 tabular-nums mr-1.5">{seg.num}</span>{en && seg.titleEn ? seg.titleEn : shortTitle(seg.title)}
                </p>
                {plain.map((f) => {
                  const path = `${seg.id}.${f.key}`;
                  const can = path in editable && !locked;
                  const value: BasisValue | null = path in editable ? editable[path] ?? null : raw?.[seg.id]?.[f.key] ?? null;
                  const list = f.type === "array";
                  const isNew = recent.has(path);
                  return (
                    <div key={path} data-path={path}
                      className={`rounded-lg px-2 py-1 -mx-2 transition-colors ${isNew ? "bg-default-200" : ""} ${can && editing !== path ? "hover:bg-default-100 cursor-text" : ""}`}
                      onClick={() => { if (can && editing !== path) { setEditing(path); setDraft(toText(value)); } }}>
                      <p className="text-[11px] text-default-500 flex items-center gap-1.5">
                        {f.label.replace(/[（(][^）)]*[）)]/g, "").trim() || f.label}
                        {isNew && <span className="text-[10px] font-semibold text-foreground">{L("剛改", "Updated")}</span>}
                      </p>
                      {editing === path ? (
                        <textarea autoFocus value={draft} rows={list ? 3 : 2}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => commit(path, list)}
                          onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }}
                          placeholder={list ? L("一行一項", "One per line") : ""}
                          style={{ fieldSizing: "content" } as React.CSSProperties}
                          className="w-full resize-none rounded-md border border-default-300 bg-background px-2 py-1 text-small outline-none focus:border-foreground" />
                      ) : value == null || (Array.isArray(value) && !value.length) ? (
                        <p className="text-small text-default-300">—</p>
                      ) : Array.isArray(value) ? (
                        <ul className="text-small leading-relaxed list-disc pl-4">{value.map((v, i) => <li key={i}>{String(v)}</li>)}</ul>
                      ) : (
                        <p className="text-small leading-relaxed whitespace-pre-line">{String(value)}</p>
                      )}
                    </div>
                  );
                })}
                {tables.map((f) => {
                  const rows: any[] = Array.isArray(raw?.[seg.id]?.[f.key]) ? raw[seg.id][f.key] : [];
                  if (!rows.length) return null;
                  const cols = (f.columns ?? []).slice(0, 3);
                  return (
                    <div key={f.key} className="flex flex-col gap-1">
                      {rows.slice(0, 6).map((r, i) => (
                        <p key={i} className="text-tiny text-default-600 leading-snug">
                          {cols.map((c) => String(r?.[c.key] ?? "")).filter(Boolean).join("｜")}
                        </p>
                      ))}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
