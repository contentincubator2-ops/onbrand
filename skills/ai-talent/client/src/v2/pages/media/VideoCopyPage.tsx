/**
 * /media/video/:channel — Enter a YouTube URL and get brand-aligned copy.
 */
import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { Video, Copy, ChevronLeft, Loader2 } from "lucide-react";

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

export default function VideoCopyPage() {
  const { channel = "youtube" } = useParams<{ channel: string }>();
  const navigate = useNavigate();

  const [youtubeUrl, setYoutubeUrl]       = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(null);
  const [resultCopy, setResultCopy]       = useState<string | null>(null);
  const [videoTitle, setVideoTitle]       = useState<string | null>(null);
  const [videoAuthor, setVideoAuthor]     = useState<string | null>(null);
  const [copied, setCopied]               = useState(false);

  const brandsQuery = (trpc as any).brand?.list?.useQuery?.();
  const brands: { id: number; name: string }[] = brandsQuery?.data ?? [];

  const mutation = (trpc as any).mediaCopy?.runVideo?.useMutation?.({
    onSuccess: (data: any) => {
      setResultCopy(data?.copy ?? "");
      setVideoTitle(data?.videoTitle ?? null);
      setVideoAuthor(data?.videoAuthor ?? null);
    },
  });

  function handleGenerate() {
    if (!youtubeUrl.trim()) return;
    mutation?.mutate({
      youtubeUrl: youtubeUrl.trim(),
      platform: channelToApiPlatform(channel),
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
          影片產出文案 — {channelToLabel(channel)}
        </h1>
      </div>

      <div className="space-y-6">
        {/* Step 1 — YouTube URL */}
        <section className="bg-white border border-neutral-200 rounded-xl p-6">
          <label className="text-sm font-medium text-neutral-700 mb-3 flex items-center gap-2">
            <Video size={16} className="text-neutral-400" />
            步驟 1 — YouTube 影片連結
          </label>
          <input
            type="url"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="mt-2 w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300"
          />
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
          disabled={!youtubeUrl.trim() || isLoading}
          className="w-full py-3 px-4 bg-neutral-900 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-800 transition-colors"
        >
          {isLoading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              分析中…
            </>
          ) : (
            "分析影片並產出文案"
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
            {(videoTitle || videoAuthor) && (
              <p className="text-xs text-neutral-500 mb-3">
                影片：{videoTitle ?? ""}
                {videoAuthor ? ` by ${videoAuthor}` : ""}
              </p>
            )}
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
