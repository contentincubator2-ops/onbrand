/**
 * /media/doc — Upload a document, extract text, and rewrite in brand tone.
 */
import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { FileText, Copy, ChevronLeft, Loader2 } from "lucide-react";

const MAX_CHARS = 10_000;

function isTxtFile(file: File): boolean {
  return (
    file.type === "text/plain" ||
    file.name.toLowerCase().endsWith(".txt")
  );
}

export default function DocRewritePage() {
  const navigate = useNavigate();

  const [file, setFile]                   = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState<string>("");
  const [pasteText, setPasteText]         = useState<string>("");
  const [needsPaste, setNeedsPaste]       = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(null);
  const [resultCopy, setResultCopy]       = useState<string | null>(null);
  const [copied, setCopied]               = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const brandsQuery = (trpc as any).brand?.list?.useQuery?.();
  const brands: { id: number; name: string }[] = brandsQuery?.data ?? [];

  const mutation = (trpc as any).mediaCopy?.runDoc?.useMutation?.({
    onSuccess: (data: any) => {
      setResultCopy(data?.copy ?? "");
    },
  });

  async function handleFileChange(f: File | null) {
    setExtractedText("");
    setPasteText("");
    setNeedsPaste(false);
    setResultCopy(null);
    if (!f) return;
    setFile(f);

    if (isTxtFile(f)) {
      const text = await f.text();
      setExtractedText(text);
      setNeedsPaste(false);
    } else {
      // PDF / DOC / DOCX — offer paste fallback
      setNeedsPaste(true);
    }
  }

  function activeText(): string {
    return needsPaste ? pasteText : extractedText;
  }

  function handleGenerate() {
    const text = activeText().trim();
    if (!text) return;
    mutation?.mutate({
      docText: text.slice(0, MAX_CHARS),
      brandId: selectedBrandId ?? undefined,
    });
  }

  function handleCopy() {
    if (!resultCopy) return;
    navigator.clipboard.writeText(resultCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const isLoading = mutation?.isPending ?? mutation?.isLoading ?? false;
  const apiError  = mutation?.error;
  const charCount = activeText().length;
  const trimWarning = charCount > MAX_CHARS;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <ChevronLeft size={16} />
          返回
        </button>
        <h1 className="text-xl font-semibold text-neutral-900">
          文件改寫（品牌調性）
        </h1>
      </div>

      <div className="space-y-6">
        {/* Step 1 — File upload */}
        <section className="bg-white border border-neutral-200 rounded-xl p-6">
          <p className="text-sm font-medium text-neutral-700 mb-3 flex items-center gap-2">
            <FileText size={16} className="text-neutral-400" />
            步驟 1 — 上傳文件
          </p>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 border border-neutral-200 rounded-lg text-sm text-neutral-600 hover:text-neutral-900 hover:border-neutral-400 transition-colors"
          >
            <FileText size={15} />
            選擇檔案
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".txt,.pdf,.doc,.docx"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
          {file && (
            <p className="mt-2 text-xs text-neutral-500">{file.name}</p>
          )}

          {/* Paste fallback for non-TXT */}
          {needsPaste && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800 mb-3">
                請先將檔案轉換為 .txt 格式，或直接貼上文字：
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="在此貼上文章內容…"
                className="w-full min-h-[160px] border border-amber-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-y bg-white"
              />
            </div>
          )}
        </section>

        {/* Step 3 — Preview extracted / pasted text */}
        {activeText() && (
          <section className="bg-white border border-neutral-200 rounded-xl p-6">
            <p className="text-sm font-medium text-neutral-700 mb-2">
              擷取的文字{" "}
              <span className="font-normal text-neutral-400">
                （{charCount.toLocaleString()} 字）
              </span>
            </p>
            {trimWarning && (
              <p className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1">
                文件較長，AI 將擷取前 10,000 字處理
              </p>
            )}
            <pre className="text-xs text-neutral-600 bg-neutral-50 border border-neutral-100 rounded-lg p-4 max-h-48 overflow-auto whitespace-pre-wrap">
              {activeText().slice(0, 500)}
              {activeText().length > 500 ? "\n…（略）" : ""}
            </pre>
          </section>
        )}

        {/* Step 4 — Brand */}
        <section className="bg-white border border-neutral-200 rounded-xl p-6">
          <p className="text-sm font-medium text-neutral-700 mb-3">步驟 2 — 選擇品牌語氣</p>
          <select
            className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-300"
            value={selectedBrandId ?? ""}
            onChange={(e) =>
              setSelectedBrandId(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">（不選則使用通用語氣）</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </section>

        {/* Step 5 — Generate */}
        <button
          onClick={handleGenerate}
          disabled={!activeText().trim() || isLoading}
          className="w-full py-3 px-4 bg-neutral-900 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-800 transition-colors"
        >
          {isLoading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              改寫中…
            </>
          ) : (
            "改寫文件"
          )}
        </button>

        {/* API error */}
        {apiError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {String((apiError as any)?.message ?? "發生錯誤，請稍後再試。")}
          </p>
        )}

        {/* Step 6 — Result */}
        {resultCopy !== null && (
          <section className="bg-white border border-neutral-200 rounded-xl p-6">
            <p className="text-sm font-medium text-neutral-700 mb-3">改寫結果</p>
            <textarea
              value={resultCopy}
              onChange={(e) => setResultCopy(e.target.value)}
              className="min-h-[200px] w-full border border-neutral-200 rounded-lg p-4 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300 resize-y"
            />
            <button
              onClick={handleCopy}
              className="mt-3 flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 border border-neutral-200 rounded-lg px-3 py-2 transition-colors"
            >
              <Copy size={14} />
              {copied ? "已複製！" : "複製"}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
