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
import React from "react";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { Button, Chip, Textarea, Spinner } from "@heroui/react";
import {
  Upload, FileText, Trash2, Wand2, ClipboardPaste, AlertTriangle, Check, ChevronLeft,
} from "lucide-react";

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
interface ProposeResult {
  docId: string; docName: string; sectionCount: number;
  proposals: Proposal[];
  unmapped: { index: number; heading: string; chars: number }[];
  missing: PromptField[];
  total: number;
}

const ACCEPT = ".docx,.pptx,.pdf,.md,.markdown,.txt,.html,.htm";

function renderValue(v: any): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    if (v.length && typeof v[0] === "object") {
      return v.map((p: any) => `「${p.ours}」（取代：${p.generic || "—"}）`).join("\n");
    }
    return v.join(" · ");
  }
  return String(v ?? "");
}

export default function PositioningDocPanel({
  scopeMode, scopeId, scopeName,
}: {
  scopeMode: Scope;
  scopeId: number | null;
  scopeName: string;
}) {
  const { lang } = useLang();
  const en = lang === "en";
  const scopeLabel = scopeMode === "brand" ? (en ? "brand" : "品牌")
                   : scopeMode === "product" ? (en ? "product" : "產品")
                   : (en ? "campaign" : "活動");

  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [pasteText, setPasteText] = React.useState("");
  const [reading, setReading] = React.useState<{ name: string; sections: { level: number; heading: string; body: string }[] } | null>(null);
  const [review, setReview] = React.useState<ProposeResult | null>(null);
  const [accepted, setAccepted] = React.useState<Set<string>>(new Set());
  const [inject, setInject] = React.useState<Set<number>>(new Set());
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  const coverageQuery = (trpc as any).positioningDocs?.coverage?.useQuery?.(
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
      setBusy(null);
    },
    onError: (e: any) => { setError(e?.message ?? "對映失敗"); setBusy(null); },
  }) ?? null;

  const applyMut = (trpc as any).positioningDocs?.apply?.useMutation?.({
    onSuccess: () => { setReview(null); setBusy(null); coverageQuery.refetch?.(); },
    onError: (e: any) => { setError(e?.message ?? "套用失敗"); setBusy(null); },
  }) ?? null;

  if (!scopeId) {
    return <div className="p-8 text-center text-default-500">{en ? "Pick a scope first" : `請先選擇${scopeLabel}`}</div>;
  }

  const docs: DocSummary[] = coverageQuery.data?.docs ?? [];
  const filled: PromptField[] = coverageQuery.data?.filled ?? [];
  const missing: PromptField[] = coverageQuery.data?.missing ?? [];
  const total = coverageQuery.data?.total ?? 0;
  const applied = coverageQuery.data?.applied ?? null;

  async function post(url: string, init: RequestInit): Promise<any> {
    const r = await fetch(url, { credentials: "include", ...init });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.detail ? `${j.error}：${j.detail}` : (j?.error ?? `HTTP ${r.status}`));
    return j;
  }

  async function onFile(file: File) {
    setError(null); setBusy("upload");
    try {
      await post("/api/positioning-doc/upload", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-brand-id": String(scopeId),
          "x-scope": scopeMode,
          "x-scope-id": String(scopeId),
          "x-filename": encodeURIComponent(file.name),
        },
        body: file,
      });
      coverageQuery.refetch?.();
    } catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function onPaste() {
    setError(null); setBusy("paste");
    try {
      await post("/api/positioning-doc/paste", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brandId: scopeId, scope: scopeMode, scopeId,
          title: `貼上的${scopeLabel}定位`, text: pasteText,
        }),
      });
      setPasteText(""); setPasteOpen(false);
      coverageQuery.refetch?.();
    } catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setBusy(null); }
  }

  async function onRead(doc: DocSummary) {
    setError(null); setBusy(`read:${doc.id}`);
    try {
      const j = await post(
        `/api/positioning-doc/doc?brandId=${scopeId}&scope=${scopeMode}&scopeId=${scopeId}&docId=${doc.id}`,
        { method: "GET" },
      );
      setReading({ name: doc.name, sections: j.doc.sections });
    } catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setBusy(null); }
  }

  async function onDelete(doc: DocSummary) {
    setError(null); setBusy(`del:${doc.id}`);
    try {
      await post(`/api/positioning-doc/${scopeId}/${scopeMode}/${scopeId}/${doc.id}`, { method: "DELETE" });
      coverageQuery.refetch?.();
    } catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setBusy(null); }
  }

  // ── 讀文件：照用戶自己的標題階層呈現，不套我們的表格 ─────────────────────
  if (reading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="light" startContent={<ChevronLeft size={14} />} onPress={() => setReading(null)}>
            {en ? "Back" : "返回"}
          </Button>
          <p className="text-small font-semibold">{reading.name}</p>
          <Chip size="sm" variant="flat">{reading.sections.length} {en ? "sections" : "節"}</Chip>
        </div>
        <div className="rounded-medium border border-divider bg-content1 p-5 flex flex-col gap-4">
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

  // ── 對映審核 ───────────────────────────────────────────────────────────
  if (review) {
    const overwriteCount = review.proposals.filter((p) => accepted.has(p.path) && p.overwrites != null).length;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="light" startContent={<ChevronLeft size={14} />} onPress={() => setReview(null)}>
            {en ? "Cancel" : "取消"}
          </Button>
          <p className="text-small font-semibold">{review.docName}</p>
          <Chip size="sm" color="success" variant="flat">
            {en ? `${review.proposals.length} of ${review.total} fields found` : `${review.total} 格裡對到 ${review.proposals.length} 格`}
          </Chip>
          {overwriteCount > 0 && (
            <Chip size="sm" color="warning" variant="flat" startContent={<AlertTriangle size={12} />}>
              {en ? `${overwriteCount} will overwrite existing values` : `${overwriteCount} 格會覆蓋現有內容`}
            </Chip>
          )}
        </div>

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
                className={`rounded-medium border p-3 flex gap-3 cursor-pointer transition-colors ${
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
                      <Chip size="sm" color="warning" variant="flat" startContent={<AlertTriangle size={11} />}>
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
          <div className="rounded-medium border border-divider bg-content1 p-4">
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
                    {u.heading}（{u.chars} 字）
                  </Chip>
                );
              })}
            </div>
          </div>
        )}

        {review.missing.length > 0 && (
          <div className="rounded-medium border border-warning-200 bg-warning-50/50 p-4">
            <p className="text-small font-semibold text-warning-800">
              {en ? `Your document doesn't cover these ${review.missing.length} fields` : `你的文件裡找不到這 ${review.missing.length} 格`}
            </p>
            <p className="text-tiny text-warning-700 mt-0.5 mb-2">
              {en
                ? "Not an error — but these are read on every task run, so here's what stays missing."
                : "不是錯誤 —— 但這幾格每次跑任務都會被讀，所以先講清楚缺了會少什麼。"}
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

        <div className="flex gap-2">
          <Button
            color="primary" size="sm"
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
              });
            }}
          >
            {en ? `Write ${accepted.size} fields` : `寫入 ${accepted.size} 格`}
          </Button>
          <Button size="sm" variant="flat" onPress={() => setReview(null)}>{en ? "Cancel" : "取消"}</Button>
        </div>
      </div>
    );
  }

  // ── 主畫面 ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-medium font-semibold">{en ? "Your own positioning document" : `你自己的${scopeLabel}定位文件`}</p>
        <p className="text-small text-default-700 mt-1">
          {en
            ? "Upload the positioning you already have, in whatever format you wrote it. It's kept verbatim and shown by your own structure — you don't have to answer our questions."
            : `上傳你已經在用的${scopeLabel}定位，格式照你自己的。原文會逐字保留、按你自己的段落呈現 —— 不需要把我們設的題目填完。`}
        </p>
      </div>

      {error && (
        <div className="rounded-medium border border-danger-200 bg-danger-50 px-3 py-2 text-tiny text-danger-700">
          {error}
        </div>
      )}

      {/* 落差表 —— 這是「不填完題目會不會影響結果」的誠實答案 */}
      <div className="rounded-medium border border-divider bg-content1 p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-small font-semibold">{en ? "What the engine actually reads" : "引擎真正讀得到的欄位"}</p>
          <Chip size="sm" color={missing.length === 0 ? "success" : filled.length ? "warning" : "default"} variant="flat">
            {filled.length} / {total}
          </Chip>
          {coverageQuery.isLoading && <Spinner size="sm" />}
        </div>
        <p className="text-tiny text-default-500 mt-1">
          {en
            ? "Every task run builds a brand prefix from these paths only. A missing one never errors — the task still runs, the output just gets more generic."
            : "每次跑任務組給 AI 的品牌前綴只會讀這幾格。缺格不會報錯、任務照跑 —— 只是那篇的內容會比較通用。"}
        </p>
        {missing.length > 0 && (
          <ul className="flex flex-col gap-1 mt-3">
            {missing.map((f) => (
              <li key={f.path} className="text-tiny text-default-700 flex gap-2">
                <span className="text-warning-600 shrink-0">●</span>
                <span><span className="font-semibold">{f.label}</span>　{f.cost}</span>
              </li>
            ))}
          </ul>
        )}
        {filled.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {filled.map((f) => (
              <Chip key={f.path} size="sm" variant="flat" color="success" startContent={<Check size={11} />}>
                {f.label}
              </Chip>
            ))}
          </div>
        )}
        {applied?.injectedContext && (
          <p className="text-tiny text-default-500 mt-3">
            {en ? "Plus " : "另外還有 "}
            {applied.injectedContext.length}
            {en ? " chars of extra context from " : " 字的補充脈絡來自「"}
            {applied.name}{en ? "" : "」"}
          </p>
        )}
      </div>

      {/* 上傳 / 貼上 */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          ref={fileRef} type="file" accept={ACCEPT} className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
        />
        <Button
          size="sm" color="primary" startContent={<Upload size={14} />}
          isLoading={busy === "upload"} onPress={() => fileRef.current?.click()}
        >
          {en ? "Upload a document" : "上傳文件"}
        </Button>
        <Button size="sm" variant="flat" startContent={<ClipboardPaste size={14} />} onPress={() => setPasteOpen((v) => !v)}>
          {en ? "Paste text" : "直接貼上"}
        </Button>
        <span className="text-tiny text-default-400">.docx / .pptx / .pdf / .md / .txt / .html</span>
      </div>

      {pasteOpen && (
        <div className="flex flex-col gap-2">
          <Textarea
            minRows={6} value={pasteText} onValueChange={setPasteText}
            placeholder={en ? "Paste your positioning here — headings and paragraphs are kept." : "把你的定位貼在這裡 —— 標題與段落會照原樣保留。"}
          />
          <div className="flex gap-2">
            <Button size="sm" color="primary" isLoading={busy === "paste"} isDisabled={pasteText.trim().length < 40} onPress={() => void onPaste()}>
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
        <div className="rounded-medium border border-dashed border-divider p-8 text-center">
          <FileText size={22} className="mx-auto text-default-400" />
          <p className="text-small text-default-600 mt-2">
            {en ? `No document yet for ${scopeName}.` : `${scopeName} 還沒有上傳過定位文件。`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {docs.map((d) => (
            <div key={d.id} className="rounded-medium border border-divider bg-content1 p-3 flex gap-3 items-start">
              <FileText size={16} className="mt-0.5 text-default-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-small font-semibold truncate">{d.name}</span>
                  <Chip size="sm" variant="flat">{d.kind}</Chip>
                  <span className="text-tiny text-default-400">{d.chars} 字 · {d.outline.length} 節</span>
                  {d.appliedAt && (
                    <Chip size="sm" color="success" variant="flat" startContent={<Check size={11} />}>
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
                  size="sm" variant="flat" color="primary" startContent={<Wand2 size={13} />}
                  isLoading={busy === `map:${d.id}`}
                  onPress={() => { setBusy(`map:${d.id}`); setError(null); proposeMut?.mutate({ scope: scopeMode, scopeId, docId: d.id }); }}
                >
                  {en ? "Map fields" : "對映欄位"}
                </Button>
                <Button size="sm" variant="light" isIconOnly isLoading={busy === `del:${d.id}`} onPress={() => void onDelete(d)}>
                  <Trash2 size={14} className="text-danger-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
