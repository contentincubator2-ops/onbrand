/**
 * /media/photo/:channel — Upload a photo and get brand-aligned copy.
 * Supports fb | ig | tiktok | youtube channels.
 */
import React, { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { Upload, Copy, ChevronLeft, Loader2 } from "lucide-react";

type Channel = "fb" | "ig" | "tiktok" | "youtube";

function channelToApiPlatform(channel: string): string {
  switch (channel) {
    case "ig":      return "instagram";
    case "tiktok":  return "tiktok";
    case "youtube": return "youtube";
    default:        return "fb";
  }
}

function channelToLabel(channel: string): string {
  switch (channel) {
    case "ig":      return "IG 貼文";
    case "tiktok":  return "TikTok 文案";
    case "youtube": return "YouTube 標題＋說明";
    default:        return "FB 貼文";
  }
}

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export default function PhotoCopyPage() {
  const { channel = "fb" } = useParams<{ channel: Channel }>();
  const navigate = useNavigate();

  const [file, setFile]               = useState<File | null>(null);
  const [previewUrl, setPreviewUrl]   = useState<string | null>(null);
  const [sizeError, setSizeError]     = useState<string | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(null);
  const [resultCopy, setResultCopy]   = useState<string | null>(null);
  const [copied, setCopied]           = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const brandsQuery = (trpc as any).brand?.list?.useQuery?.();
  const brands: { id: number; name: string }[] = brandsQuery?.data ?? [];

  const mutation = (trpc as any).mediaCopy?.runPhoto?.useMutation?.({
    onSuccess: (data: any) => {
      setResultCopy(data?.copy ?? "");
    },
  });

  function handleFileChange(f: File | null) {
    setSizeError(null);
    setResultCopy(null);
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setSizeError("檔案超過 10MB 上限，請選擇較小的圖片。");
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0] ?? null;
    handleFileChange(f);
  }

  function handleGenerate() {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target!.result as string;
      const base64 = dataUrl.split(",")[1];
      mutation?.mutate({
        imageBase64: base64,
        mimeType: file.type,
        platform: channelToApiPlatform(channel),
        brandId: selectedBrandId ?? undefined,
      });
    };
    reader.readAsDataURL(file);
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
          照片產出文案 — {channelToLabel(channel)}
        </h1>
      </div>

      <div className="space-y-6">
        {/* Step 1 — Upload */}
        <section className="bg-white border border-neutral-200 rounded-xl p-6">
          <p className="text-sm font-medium text-neutral-700 mb-3">步驟 1 — 上傳照片</p>

          {/* Drop zone */}
          <div
            className="border-2 border-dashed border-neutral-300 rounded-lg p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-neutral-400 transition-colors"
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="preview"
                className="max-h-48 rounded-lg object-contain"
              />
            ) : (
              <>
                <Upload size={32} className="text-neutral-400" />
                <p className="text-sm text-neutral-500">點擊或拖曳上傳照片</p>
                <p className="text-xs text-neutral-400">JPEG / PNG / WebP / GIF，最大 10 MB</p>
              </>
            )}
            {previewUrl && (
              <p className="text-xs text-neutral-500 mt-1">{file?.name}</p>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
          {sizeError && (
            <p className="mt-2 text-sm text-red-600">{sizeError}</p>
          )}
        </section>

        {/* Step 2 — Brand */}
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

        {/* Step 3 — Generate */}
        <button
          onClick={handleGenerate}
          disabled={!file || isLoading}
          className="w-full py-3 px-4 bg-neutral-900 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-800 transition-colors"
        >
          {isLoading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              產出中…
            </>
          ) : (
            "產出文案"
          )}
        </button>

        {/* API error */}
        {apiError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {String((apiError as any)?.message ?? "發生錯誤，請稍後再試。")}
          </p>
        )}

        {/* Step 4 — Result */}
        {resultCopy !== null && (
          <section className="bg-white border border-neutral-200 rounded-xl p-6">
            <p className="text-sm font-medium text-neutral-700 mb-3">產出結果</p>
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
