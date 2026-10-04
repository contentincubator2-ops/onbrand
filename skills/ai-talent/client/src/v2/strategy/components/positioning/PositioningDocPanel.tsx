/**
 * PositioningDocPanel — 上傳「你自己格式」的品牌／產品／活動定位文件。
 *
 * 2026-09-01 (CJ「原文存檔後，按照用戶有的內容呈現品牌定位，不一定要填完我們
 * 設定的題目」)。
 *
 * ── 為什麼畫面長這樣 ──────────────────────────────────────────────────
 * 「照用戶的內容呈現」與「產出品質不掉」是兩件會打架的事：任務執行前組給 LLM
 * 的品牌前綴是逐格硬讀固定路徑的，缺格不報錯、任務照跑，只是那篇貼文變得通用。
 * 所以這一頁把兩件事分開擺：
 *
 *   1. 「我的文件」照文件本來的標題階層呈現 —— 那是用戶的東西，不是我們的表格。
 *   2. 「引擎讀得到的欄位」單獨列一張落差表，每一格寫清楚缺了會少什麼。
 *
 * 用戶可以選擇不補，但不該在不知情的情況下被降級 —— 這就是月報那個
 * 「版型體檢報告」的同一個主張：先誠實講哪些能自動、哪些不行。
 *
 * 對映一律是「提案 → 用戶勾選 → 才寫入」。定位是所有任務的上游，靜靜寫錯一格
 * 會污染每一張卡。
 */
import { IllustratedEmpty } from "../../../platform/components/EmptyIllustration";
import React from "react";
import { trpc } from "../../../../lib/trpc";
import { useLang, tr } from "../../../../lib/i18n";
import { Button, Chip, Textarea } from "@heroui/react";
import { CheckIcon, ChevronLeftIcon, DeleteIcon, GenerateIcon, PasteIcon, TextIcon, UploadIcon, WarningIcon } from "../../../platform/components/icons";
import { HelpTip } from "../../../platform/components/HelpTip";
import ConvertingToAIFormat from "./ConvertingToAIFormat";

type Scope = "brand" | "product" | "event";

interface PromptField { path: string; label: string; cost: string; shape: "text" | "list" | "pairs" }
interface DocSummary {
  id: string; name: string; kind: string; chars: number; uploadedAt: string;
  outline: { level: number; heading: string; chars: number }[];
  appliedAt: string | null;
}
interface Proposal {
  path: string; label: string; shape: PromptField["shape"];
  value: any; fromHeading: string; quote: string; overwrites: any;
}
interface SuggestedSegment {
  title: string; fromHeading: string;
  fields: { label: string; value: string }[];
}
interface ProposeResult {
  docId: string; docName: string; sectionCount: number;
  proposals: Proposal[];
  unmapped: { index: number; heading: string; chars: number }[];
  missing: PromptField[];
  suggestedSegments: SuggestedSegment[];
  total: number;
}
interface CustomSegment {
  id: string; title: string;
  fields: { key: string; label: string; value: string }[];
  createdAt: string; sourceDocId: string | null;
}

const ACCEPT = ".docx,.doc,.pptx,.ppt,.xlsx,.pdf,.md,.markdown,.txt,.html,.htm";

function renderValue(v: any): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    if (v.length && typeof v[0] === "object") {
      return v.map((p: any) => tr(`"${p.ours}" (replaces: ${p.generic || "—"})`, `「${p.ours}」（取代：${p.generic || "—"}）`)).join("\n");
    }
    return v.join(" · ");
  }
  return String(v ?? "");
}

export default function PositioningDocPanel({
  scopeMode, scopeId, scopeName, brandId, onBackToOverview,
}: {
  scopeMode: Scope;
  scopeId: number | null;
  scopeName: string;
  /** 2026-10-03：產品／活動的上傳要帶「所屬品牌」做權限檢查；品牌 scope 可省略（＝scopeId）。
   *  先前一律把 scopeId 當 brandId 送，產品 id 對不上品牌 → 後端回 Not found。 */
  brandId?: number | null;
  /** 2026-09-23（CJ「我寫入四格後，也沒有儲存或回到品牌頁面的按鈕。會迷路」）：
   *  寫入完成後的出口。沒傳的話完成畫面只會少那顆按鈕，不會壞。 */
  onBackToOverview?: () => void;
}) {
  const { lang } = useLang();
  const en = lang === "en";
  // 2026-10-04（CJ「用戶上傳自己的定位資料後，請用用戶的資料完全取代掉原來的產品定位」）：
  // 產品寫入＝取代。文件對到的格寫進去，其餘格清空（舊內容備份在 _replacedBackup）；
  // 品牌／活動維持逐格合併。
  const replaceMode = scopeMode === "product";
  const ownerBrandId = scopeMode === "brand" ? scopeId : (brandId ?? scopeId);
  const scopeLabel = scopeMode === "brand" ? (en ? "brand" : "品牌")
                   : scopeMode === "product" ? (en ? "product" : "產品")
                   : (en ? "campaign" : "活動");

  const [busy, setBusy] = React.useState<string | null>(null);
  const [convertLabel, setConvertLabel] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [pasteText, setPasteText] = React.useState("");
  const [reading, setReading] = React.useState<{ name: string; sections: { level: number; heading: string; body: string }[] } | null>(null);
  const [review, setReview] = React.useState<ProposeResult | null>(null);
  const [accepted, setAccepted] = React.useState<Set<string>>(new Set());
  const [inject, setInject] = React.useState<Set<number>>(new Set());
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  const coverageQuery = (trpc as any).positioningDocs?.coverage?.useQuery(
    { scope: scopeMode, scopeId: scopeId ?? 0 },
    { enabled: !!scopeId, refetchOnWindowFocus: false },
  ) ?? { data: null, isLoading: false, refetch: () => {} };

  const proposeMut = (trpc as any).positioningDocs?.propose?.useMutation?.({
    onSuccess: (r: ProposeResult) => {
      setReview(r);
      // 預設全勾 —— 提案已經只含「文件裡真的有」的格，逐一手動打勾是白工。
      // 會覆蓋既有值的那幾格另外標紅，讓用戶只需要盯那些。
      setAccepted(new Set(r.proposals.map((p) => p.path)));
      setInject(new Set(r.unmapped.map((u) => u.index)));
      setCreatedTitles(new Set());
      setBusy(null);
    },
    onError: (e: any) => { setError(e?.message ?? tr("Mapping failed", "對映失敗")); setBusy(null); },
  }) ?? null;

  // 2026-09-23（CJ「會迷路」）：原本寫入成功只是 setReview(null) 靜靜跳回主
  // 畫面——沒有任何「寫進去了」的回饋，也沒有出口。改成先停在一個完成畫面，
  // 明講寫了幾格、其餘幾格維持原樣，並給兩條路（回總覽 / 留下來再上傳）。
  const [doneInfo, setDoneInfo] = React.useState<{ written: number; missing: number; total: number; injected: number } | null>(null);
  const applyMut = (trpc as any).positioningDocs?.applyMapping?.useMutation?.({
    onSuccess: () => {
      setDoneInfo({
        written: review ? review.proposals.filter((p) => accepted.has(p.path)).length : accepted.size,
        missing: review?.missing.length ?? 0,
        total: review?.total ?? 0,
        injected: inject.size,
      });
      setReview(null); setBusy(null); coverageQuery.refetch?.();
    },
    onError: (e: any) => { setError(e?.message ?? tr("Apply failed", "套用失敗")); setBusy(null); },
  }) ?? null;

  // 2026-09-23（CJ「品牌定位…也可以自訂新增欄位，或是輸入 chatgpt 對不同產品或品牌的討論」）：
  // propose() 對套不進固定欄位、但自成一塊的內容提議開新卡；使用者逐張確認才真的建立。
  const [createdTitles, setCreatedTitles] = React.useState<Set<string>>(new Set());
  const createSegmentMut = (trpc as any).positioningDocs?.createCustomSegment?.useMutation?.({
    onSuccess: (_r: any, vars: any) => { setCreatedTitles((prev) => new Set(prev).add(vars.title)); setBusy(null); coverageQuery.refetch?.(); },
    onError: (e: any) => { setError(e?.message ?? tr("Failed to create card", "建立卡片失敗")); setBusy(null); },
  }) ?? null;
  const removeSegmentMut = (trpc as any).positioningDocs?.removeCustomSegment?.useMutation?.({
    onSuccess: () => { setBusy(null); coverageQuery.refetch?.(); },
    onError: (e: any) => { setError(e?.message ?? tr("Delete failed", "刪除失敗")); setBusy(null); },
  }) ?? null;

  if (!scopeId) {
    return <div className="p-8 text-center text-default-500">{en ? "Pick a scope first" : `請先選擇${scopeLabel}`}</div>;
  }

  const docs: DocSummary[] = coverageQuery.data?.docs ?? [];
  const customSegments: CustomSegment[] = coverageQuery.data?.customSegments ?? [];

  async function post(url: string, init: RequestInit): Promise<any> {
    const r = await fetch(url, { credentials: "include", ...init });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.detail ? `${j.error}：${j.detail}` : (j?.error ?? `HTTP ${r.status}`));
    return j;
  }

  // 2026-10-03（CJ「解析過程增加動畫：正在轉換成AI格式」）：上傳／貼上成功後直接接著
  // 做欄位對映，整段（抽取 → 對映）用同一個動畫蓋住，不再停在「文件清單」等用戶自己
  // 再按一次「對映欄位」。對映失敗時文件仍在清單裡，可手動重試。
  function startConvert(docId: string, label: string) {
    setConvertLabel(label);
    setBusy(`map:${docId}`);
    proposeMut?.mutate({ scope: scopeMode, scopeId, docId });
  }

  async function onFile(file: File) {
    setError(null); setBusy("upload"); setConvertLabel(file.name);
    try {
      const j = await post("/api/positioning-doc/upload", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-brand-id": String(ownerBrandId),
          "x-scope": scopeMode,
          "x-scope-id": String(scopeId),
          "x-filename": encodeURIComponent(file.name),
        },
        body: file,
      });
      coverageQuery.refetch?.();
      if (j?.docId) startConvert(j.docId, file.name); else setBusy(null);
    } catch (e: any) { setError(String(e?.message ?? e)); setBusy(null); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  }

  async function onPaste() {
    setError(null); setBusy("paste"); setConvertLabel("");
    try {
      const j = await post("/api/positioning-doc/paste", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brandId: ownerBrandId, scope: scopeMode, scopeId,
          title: `貼上的${scopeLabel}定位`, text: pasteText,
        }),
      });
      setPasteText(""); setPasteOpen(false);
      coverageQuery.refetch?.();
      if (j?.docId) startConvert(j.docId, ""); else setBusy(null);
    } catch (e: any) { setError(String(e?.message ?? e)); setBusy(null); }
  }

  async function onRead(doc: DocSummary) {
    setError(null); setBusy(`read:${doc.id}`);
    try {
      const j = await post(
        `/api/positioning-doc/doc?brandId=${ownerBrandId}&scope=${scopeMode}&scopeId=${scopeId}&docId=${doc.id}`,
        { method: "GET" },
      );
      setReading({ name: doc.name, sections: j.doc.sections });
    } catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setBusy(null); }
  }

  async function onDelete(doc: DocSummary) {
    setError(null); setBusy(`del:${doc.id}`);
    try {
      await post(`/api/positioning-doc/${ownerBrandId}/${scopeMode}/${scopeId}/${doc.id}`, { method: "DELETE" });
      coverageQuery.refetch?.();
    } catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setBusy(null); }
  }

  // ── 轉換中：上傳／貼上／對映期間整頁換成動畫 ─────────────────────────────
  if (busy === "upload" || busy === "paste" || busy?.startsWith("map:")) {
    return <ConvertingToAIFormat fileName={convertLabel} />;
  }

  // ── 讀文件：照用戶自己的標題階層呈現，不套我們的表格 ─────────────────────
  if (reading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="light" startContent={<ChevronLeftIcon size={14} />} onPress={() => setReading(null)}>
            {en ? "Back" : "返回"}
          </Button>
          <p className="text-small font-semibold">{reading.name}</p>
          <Chip size="sm" variant="flat">{reading.sections.length} {en ? "sections" : "節"}</Chip>
        </div>
        <div className="rounded-2xl border border-divider bg-content1 p-5 flex flex-col gap-4">
          {reading.sections.map((s, i) => (
            <div key={i}>
              {s.heading && (
                <p
                  className="font-semibold text-default-900"
                  style={{ fontSize: `${Math.max(13, 19 - s.level * 2)}px`, marginLeft: (s.level - 1) * 12 }}
                >
                  {s.heading}
                </p>
              )}
              {s.body && (
                <p className="text-small text-default-700 whitespace-pre-wrap mt-1" style={{ marginLeft: (s.level - 1) * 12 }}>
                  {s.body}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── 寫入完成 ───────────────────────────────────────────────────────────
  // 2026-09-23（CJ「我寫入四格後，也沒有儲存或回到品牌頁面的按鈕。會迷路」）：
  // 「寫入」就是儲存（applyMapping 直接寫進 positioning，沒有第二個儲存步驟），
  // 所以這裡要做的不是再加一顆儲存鈕，而是講清楚「已經存好了」並給出口。
  if (doneInfo) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-success-200 bg-success-50/60 p-5">
          <div className="flex items-center gap-2">
            <CheckIcon size={16} className="text-success-700" />
            <p className="text-medium font-semibold text-success-800">
              {doneInfo.written > 0
                ? (en ? `Saved — ${doneInfo.written} fields written` : `已寫入並存檔：${doneInfo.written} 格`)
                : (en ? `Saved — extra context only` : `已存檔：這次沒有寫入欄位，只留了補充脈絡`)}
            </p>
          </div>
          <p className="text-small text-default-700 mt-2">
            {en
              ? `These ${doneInfo.written} fields are now part of your ${scopeLabel} brain — every task run reads them from here on. `
                + (doneInfo.missing > 0
                    ? (replaceMode
                        ? `The other ${doneInfo.missing} of ${doneInfo.total} weren't in this document, so they are now empty.`
                        : `The other ${doneInfo.missing} of ${doneInfo.total} weren't in this document and were left untouched.`)
                    : "")
              : `這 ${doneInfo.written} 格已經存進${scopeLabel}大腦，之後每次跑任務都會讀到。`
                + (doneInfo.missing > 0
                    ? (replaceMode
                        ? `${doneInfo.total} 格裡其餘的 ${doneInfo.missing} 格這份文件沒有寫到，已清空——產品定位現在完全以你的文件為準。`
                        : `${doneInfo.total} 格裡其餘的 ${doneInfo.missing} 格這份文件沒有寫到，維持原樣沒有被動到——不用現在處理。`)
                    : "")}
          </p>
          {doneInfo.injected > 0 && (
            <p className="text-tiny text-default-600 mt-1.5">
              {en
                ? `Plus ${doneInfo.injected} section(s) kept as extra context for the prompt.`
                : `另外有 ${doneInfo.injected} 段內容以「補充脈絡」的形式留下來，一樣會進 prompt。`}
            </p>
          )}
          <div className="flex gap-2 mt-4 flex-wrap">
            {onBackToOverview && (
              <Button color="primary" size="sm" onPress={() => { setDoneInfo(null); onBackToOverview(); }}>
                {en ? "Back to positioning overview" : "回到定位總覽"}
              </Button>
            )}
            <Button size="sm" variant="flat" onPress={() => setDoneInfo(null)}>
              {en ? "Stay here — upload another" : "留在這裡，再上傳一份"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── 對映審核 ───────────────────────────────────────────────────────────
  if (review) {
    const overwriteCount = review.proposals.filter((p) => accepted.has(p.path) && p.overwrites != null).length;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="light" startContent={<ChevronLeftIcon size={14} />} onPress={() => setReview(null)}>
            {en ? "Cancel" : "取消"}
          </Button>
          <p className="text-small font-semibold">{review.docName}</p>
          <Chip size="sm" color="success" variant="flat">
            {en ? `${review.proposals.length} of ${review.total} fields found` : `${review.total} 格裡對到 ${review.proposals.length} 格`}
          </Chip>
          {overwriteCount > 0 && (
            <Chip size="sm" color="warning" variant="flat" startContent={<WarningIcon size={12} />}>
              {en ? `${overwriteCount} will overwrite existing values` : `${overwriteCount} 格會覆蓋現有內容`}
            </Chip>
          )}
        </div>

        {replaceMode && (
          <div className="rounded-2xl border border-warning-200 bg-warning-50/60 px-4 py-3 text-small text-warning-800">
            {en
              ? `Writing replaces this product's current positioning: only the ${accepted.size} fields ticked below will remain; everything else is cleared (photos, preferred / forbidden words and promotion periods are kept).`
              : `寫入後會用你的文件取代這個產品現有的定位：只留下下面勾選的 ${accepted.size} 格，其餘欄位會清空（產品照片、常用／禁用詞彙、推廣時間不受影響）。`}
          </div>
        )}

        <p className="text-tiny text-default-500">
          {en
            ? "Every value below is quoted from your document — nothing was invented. Untick anything you don't want written."
            : "下面每一格都是從你的文件裡摘出來的，沒有任何一句是系統編的。不想寫進去的取消勾選即可。"}
        </p>

        <div className="flex flex-col gap-2">
          {review.proposals.map((p) => {
            const on = accepted.has(p.path);
            return (
              <label
                key={p.path}
                className={`rounded-2xl border p-3 flex gap-3 cursor-pointer transition-colors ${
                  on ? "border-primary-300 bg-primary-50/40" : "border-divider bg-content1 opacity-60"
                }`}
              >
                <input
                  type="checkbox" checked={on} className="mt-1"
                  onChange={() => setAccepted((prev) => {
                    const next = new Set(prev);
                    if (next.has(p.path)) next.delete(p.path); else next.add(p.path);
                    return next;
                  })}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-small font-semibold">{p.label}</span>
                    <span className="text-tiny text-default-400">{p.path}</span>
                    {p.fromHeading && <Chip size="sm" variant="flat">{en ? "from" : "來自"}「{p.fromHeading}」</Chip>}
                    {p.overwrites != null && (
                      <Chip size="sm" color="warning" variant="flat" startContent={<WarningIcon size={11} />}>
                        {en ? "overwrites" : "會覆蓋現有內容"}
                      </Chip>
                    )}
                  </div>
                  <p className="text-small text-default-800 whitespace-pre-wrap mt-1">{renderValue(p.value)}</p>
                  {p.overwrites != null && (
                    <p className="text-tiny text-warning-700 mt-1 line-clamp-2">
                      {en ? "current: " : "目前是："}{renderValue(p.overwrites)}
                    </p>
                  )}
                </div>
              </label>
            );
          })}
        </div>

        {review.unmapped.length > 0 && (
          <div className="rounded-2xl border border-divider bg-content1 p-4">
            <p className="text-small font-semibold">{en ? "Sections with no matching field" : "對不到欄位的段落"}</p>
            <p className="text-tiny text-default-500 mt-0.5 mb-2">
              {en
                ? "These have no slot in our schema. Tick them to feed them into the prompt as extra context anyway (capped at ~4,000 chars)."
                : "這些內容我們沒有對應的欄位可以放。勾起來的話會整段當補充脈絡餵進 prompt（總量上限約 4,000 字），你有但我們沒問到的東西就不會白上傳。"}
            </p>
            <div className="flex flex-wrap gap-2">
              {review.unmapped.map((u) => {
                const on = inject.has(u.index);
                return (
                  <Chip
                    key={u.index} size="sm"
                    variant={on ? "solid" : "bordered"}
                    color={on ? "primary" : "default"}
                    className="cursor-pointer"
                    onClick={() => setInject((prev) => {
                      const next = new Set(prev);
                      if (next.has(u.index)) next.delete(u.index); else next.add(u.index);
                      return next;
                    })}
                  >
                    {en ? `${u.heading} (${u.chars} chars)` : `${u.heading}（${u.chars} 字）`}
                  </Chip>
                );
              })}
            </div>
          </div>
        )}

        {review.suggestedSegments.length > 0 && (
          <div className="rounded-2xl border border-primary-200 bg-primary-50/40 p-4">
            <p className="text-small font-semibold text-primary-800">
              {en ? "This looks like its own topic — new cards?" : "這幾段看起來是獨立的主題 — 要開新卡嗎？"}
            </p>
            <p className="text-tiny text-default-600 mt-0.5 mb-3">
              {en
                ? "This content doesn't fit any existing field. Each proposed card below is quoted verbatim from your document, same as the fields above — nothing invented."
                : "這些內容套不進任何現有欄位。下面每張提議卡片的內容都是逐字引用你的文件，跟上面的欄位一樣沒有任何一句是編的。"}
            </p>
            <div className="flex flex-col gap-3">
              {review.suggestedSegments.map((s, i) => {
                const done = createdTitles.has(s.title);
                return (
                  <div key={i} className={`rounded-2xl border p-3 ${done ? "border-success-300 bg-success-50/40" : "border-divider bg-content1"}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-small font-semibold">{s.title}</span>
                      {s.fromHeading && <Chip size="sm" variant="flat">{en ? "from" : "來自"}「{s.fromHeading}」</Chip>}
                      {done && (
                        <Chip size="sm" color="success" variant="flat" startContent={<CheckIcon size={11} />}>
                          {en ? "created" : "已建立"}
                        </Chip>
                      )}
                    </div>
                    <ul className="mt-1.5 flex flex-col gap-0.5">
                      {s.fields.map((f, j) => (
                        <li key={j} className="text-tiny text-default-700">
                          <span className="font-semibold">{f.label}：</span>{f.value}
                        </li>
                      ))}
                    </ul>
                    {!done && (
                      <Button
                        size="sm" className="mt-2" color="primary"
                        isLoading={busy === `newcard:${i}`}
                        onPress={() => {
                          setBusy(`newcard:${i}`);
                          createSegmentMut?.mutate({
                            scope: scopeMode, scopeId, docId: review.docId,
                            title: s.title, fields: s.fields,
                          });
                        }}
                      >
                        {en ? "Create this card" : "建立這張卡"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {review.missing.length > 0 && (
          <div className="rounded-2xl border border-warning-200 bg-warning-50/50 p-4">
            {/* 2026-09-23（CJ「你列出了16格，但卻說只要補充四格，這樣數字對不上」）：
                16 跟 4 其實是同一個 20 格的兩半（對到 4 + 沒對到 16），但畫面上
                一個寫在黃框標題、一個寫在按鈕，中間沒有任何一句把關係講出來，
                所以看起來像兩個互相矛盾的數字。這裡把算式直接寫出來。 */}
            <p className="text-small font-semibold text-warning-800">
              {en
                ? `The other ${review.missing.length} of ${review.total} aren't in this document`
                : `${review.total} 格裡，另外這 ${review.missing.length} 格文件裡沒有寫到`}
            </p>
            <p className="text-tiny text-warning-700 mt-0.5 mb-2">
              {en
                ? `${review.proposals.length} found + ${review.missing.length} not found = ${review.total} fields the engine reads. `
                  + "Not an error, and nothing to do right now — these stay exactly as they are. Two ways to fill them later: upload another document that covers them, or run the SoWork positioning method from the overview."
                : `對到 ${review.proposals.length} 格 ＋ 沒對到 ${review.missing.length} 格 ＝ 這個${scopeLabel}的 ${review.total} 格。`
                  + "不是錯誤。" + (replaceMode ? "這幾格寫入後會是空的，之後可以在產品視窗手動補。" : "這幾格會維持原樣、不會被清掉。") + "之後要補有兩條路：再上傳一份有寫到的文件，或回總覽用 SoWork 定位法自動產生。"}
            </p>
            <ul className="flex flex-col gap-1">
              {review.missing.map((f) => (
                <li key={f.path} className="text-tiny text-warning-800">
                  <span className="font-semibold">{f.label}</span>　{f.cost}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 2026-09-23：按鈕上的數字要跟上面的黃框對得起來，所以把「其餘幾格不動」
            寫在同一行，而不是讓使用者自己去減。 */}
        <div className="flex gap-2 items-center flex-wrap">
          <Button
            size="sm" radius="full" className="bg-neutral-900 text-white font-semibold"
            isLoading={busy === "apply"}
            isDisabled={accepted.size === 0 && inject.size === 0}
            onPress={() => {
              setBusy("apply");
              applyMut?.mutate({
                scope: scopeMode, scopeId,
                docId: review.docId,
                accepted: review.proposals
                  .filter((p) => accepted.has(p.path))
                  .map((p) => ({ path: p.path, value: p.value })),
                injectSections: [...inject],
                replace: replaceMode,
              });
            }}
          >
            {en ? `Write ${accepted.size} fields` : `寫入 ${accepted.size} 格`}
          </Button>
          <Button size="sm" variant="flat" onPress={() => setReview(null)}>{en ? "Cancel" : "取消"}</Button>
          <span className="text-tiny text-default-500">
            {en
              ? `Writing ${accepted.size} of ${review.total}; the other ${review.total - accepted.size} ${replaceMode ? "will be cleared." : "stay as they are."}`
              : `${review.total} 格中寫入 ${accepted.size} 格，其餘 ${review.total - accepted.size} 格${replaceMode ? "會清空。" : "維持原樣。"}`}
          </span>
        </div>
      </div>
    );
  }

  // ── 主畫面 ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-medium font-semibold flex items-center gap-1.5">
          {en ? "Your own positioning document" : `你自己的${scopeLabel}定位文件`}
          <HelpTip>
            {en
              ? "Upload the positioning you already have, in any format — or paste a whole ChatGPT / Claude / Gemini conversation. It's kept verbatim and shown by your own structure."
              : `上傳你已經在用的${scopeLabel}定位，格式照你自己的——或貼上跟 ChatGPT / Claude / Gemini 討論過的整段對話。原文會逐字保留、按你自己的段落呈現。`}
          </HelpTip>
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-danger-200 bg-danger-50 px-3 py-2 text-tiny text-danger-700">
          {error}
        </div>
      )}

      {/* 2026-09-23：使用者自己開的定位卡片（從文件/對話串裡提議、確認建立的），跟固定
          欄位一樣真的會進 prompt（見 brandContext.pushCustomSegments）。 */}
      {customSegments.length > 0 && (
        <div className="rounded-2xl border border-divider bg-content1 p-4">
          <p className="text-small font-semibold">{en ? "Your own cards" : "你自己的卡片"}</p>
          <p className="text-tiny text-default-500 mt-0.5 mb-3">
            {en ? "These are read on every task run too." : "每次跑任務都會被讀到。"}
          </p>
          <div className="flex flex-col gap-2">
            {customSegments.map((s) => (
              <div key={s.id} className="rounded-2xl border border-divider p-3 flex gap-3 items-start">
                <div className="min-w-0 flex-1">
                  <span className="text-small font-semibold">{s.title}</span>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {s.fields.map((f) => (
                      <li key={f.key} className="text-tiny text-default-700">
                        <span className="font-semibold">{f.label}：</span>{f.value}
                      </li>
                    ))}
                  </ul>
                </div>
                <Button
                  size="sm" variant="light" isIconOnly className="shrink-0"
                  isLoading={busy === `rmseg:${s.id}`}
                  onPress={() => { setBusy(`rmseg:${s.id}`); setError(null); removeSegmentMut?.mutate({ scope: scopeMode, scopeId, segmentId: s.id }); }}
                >
                  <DeleteIcon size={14} className="text-danger-500" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 上傳 / 貼上 */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          ref={fileRef} type="file" accept={ACCEPT} className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
        />
        <Button
          size="sm" radius="full" className="bg-neutral-900 text-white font-semibold" startContent={<UploadIcon size={14} />}
          isLoading={busy === "upload"} onPress={() => fileRef.current?.click()}
        >
          {en ? "Upload a document" : "上傳文件"}
        </Button>
        <Button size="sm" radius="full" variant="flat" startContent={<PasteIcon size={14} />} onPress={() => setPasteOpen((v) => !v)}>
          {en ? "Paste text" : "直接貼上"}
        </Button>
        <span className="text-tiny text-default-400">.docx / .doc / .pptx / .ppt / .xlsx / .pdf{en ? " (incl. scans)" : "（含掃描檔）"} / .md / .txt / .html</span>
      </div>

      {pasteOpen && (
        <div className="flex flex-col gap-2">
          <Textarea
            minRows={6} value={pasteText} onValueChange={setPasteText}
            placeholder={en
              ? "Paste your positioning here — a document, or a whole AI chat log. Headings and paragraphs are kept."
              : "把你的定位貼在這裡 —— 可以是一份文件，也可以是整段 AI 對話紀錄。標題與段落會照原樣保留。"}
          />
          <div className="flex gap-2">
            <Button size="sm" radius="full" className="bg-neutral-900 text-white font-semibold" isLoading={busy === "paste"} isDisabled={pasteText.trim().length < 40} onPress={() => void onPaste()}>
              {en ? "Save" : "儲存"}
            </Button>
            <Button size="sm" variant="light" onPress={() => { setPasteOpen(false); setPasteText(""); }}>
              {en ? "Cancel" : "取消"}
            </Button>
          </div>
        </div>
      )}

      {/* 文件清單 */}
      {docs.length === 0 ? (
        <IllustratedEmpty
          kind="folder"
          size="sm"
          title={en ? "No positioning documents yet" : "還沒收到任何定位文件"}
          // 2026-10-04：上方工具列已有「上傳文件」，空狀態不再重複放第二顆。
        />
      ) : (
        <div className="flex flex-col gap-2">
          {docs.map((d) => (
            <div key={d.id} className="rounded-2xl border border-divider bg-content1 p-3 flex gap-3 items-start">
              <TextIcon size={16} className="mt-0.5 text-default-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-small font-semibold truncate">{d.name}</span>
                  <Chip size="sm" variant="flat">{d.kind}</Chip>
                  <span className="text-tiny text-default-400">{en ? `${d.chars} chars · ${d.outline.length} sections` : `${d.chars} 字 · ${d.outline.length} 節`}</span>
                  {d.appliedAt && (
                    <Chip size="sm" color="success" variant="flat" startContent={<CheckIcon size={11} />}>
                      {en ? "applied" : "已套用"}
                    </Chip>
                  )}
                </div>
                <p className="text-tiny text-default-500 mt-1 line-clamp-1">
                  {d.outline.slice(0, 6).map((o) => o.heading).join(" · ")}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="light" isLoading={busy === `read:${d.id}`} onPress={() => void onRead(d)}>
                  {en ? "Read" : "看內容"}
                </Button>
                <Button
                  size="sm" variant="flat" color="primary" startContent={<GenerateIcon size={13} />}
                  isLoading={busy === `map:${d.id}`}
                  onPress={() => { setError(null); startConvert(d.id, d.name); }}
                >
                  {en ? "Map fields" : "對映欄位"}
                </Button>
                <Button size="sm" variant="light" isIconOnly isLoading={busy === `del:${d.id}`} onPress={() => void onDelete(d)}>
                  <DeleteIcon size={14} className="text-danger-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
