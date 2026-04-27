/**
 * ProjectSyncModal — fronts the Pipedream-driven asset sync flow.
 *
 *   [pick params] → [start sync] → [polling progress] → [done]
 *
 * Pipedream Connect handles OAuth on the workflow side. Our UI just
 * collects whatever input the workflow needs (page URL, folder ID, etc),
 * triggers the workflow via tRPC, and polls progress.
 *
 * If the corresponding PIPEDREAM_WEBHOOK_* env is not set on the server,
 * the job will land in 'failed' immediately with a helpful errorMsg —
 * we surface that text so the operator knows which workflow to wire.
 */
import React, { useEffect, useMemo, useState } from "react";
import { trpc } from "../../../lib/trpc";

export type SyncSource =
  | "facebook" | "instagram" | "youtube" | "website"
  | "google-drive" | "onedrive" | "dropbox";

interface ParamField {
  key: string;
  label: string;
  placeholder: string;
  hint?: string;
  required?: boolean;
}

interface SourceSpec {
  id: SyncSource;
  label: string;
  blurb: string;
  fields: ParamField[];
}

const SPECS: Record<SyncSource, SourceSpec> = {
  "facebook": {
    id: "facebook", label: "Facebook 粉絲團",
    blurb: "從 Facebook 粉絲團抓取貼文、圖片、影片，作為素材庫。",
    fields: [
      { key: "pageUrl", label: "粉絲團網址", placeholder: "https://www.facebook.com/yourpage", required: true },
      { key: "limit",   label: "抓取數量",  placeholder: "50", hint: "最近 N 篇貼文" },
    ],
  },
  "instagram": {
    id: "instagram", label: "Instagram 帳號",
    blurb: "抓取 Instagram 圖文與限時動態（需要先在 Pipedream 連接帳號）。",
    fields: [
      { key: "username", label: "帳號名稱", placeholder: "yourbrand", required: true },
      { key: "limit",    label: "抓取數量", placeholder: "30" },
    ],
  },
  "youtube": {
    id: "youtube", label: "YouTube 頻道",
    blurb: "抓取頻道影片清單、縮圖、描述。",
    fields: [
      { key: "channel", label: "頻道網址或 ID", placeholder: "@yourchannel 或 UCxxxxx", required: true },
      { key: "limit",   label: "抓取數量",     placeholder: "20" },
    ],
  },
  "website": {
    id: "website", label: "官網 / 部落格",
    blurb: "爬取官網或部落格，收集品牌素材、文章內文與圖片。",
    fields: [
      { key: "url",        label: "網站網址",  placeholder: "https://yourbrand.com", required: true },
      { key: "maxPages",   label: "最大頁數",  placeholder: "30" },
    ],
  },
  "google-drive": {
    id: "google-drive", label: "Google Drive",
    blurb: "同步整個資料夾到專案。OAuth 授權由 Pipedream Connect 處理。",
    fields: [
      { key: "folderId", label: "資料夾 ID",  placeholder: "1AbCDeFgHiJk... (Drive URL 末段)", required: true },
    ],
  },
  "onedrive": {
    id: "onedrive", label: "OneDrive",
    blurb: "同步 OneDrive 資料夾。",
    fields: [
      { key: "folderPath", label: "資料夾路徑", placeholder: "/Brand/Assets", required: true },
    ],
  },
  "dropbox": {
    id: "dropbox", label: "Dropbox",
    blurb: "同步 Dropbox 資料夾。",
    fields: [
      { key: "folderPath", label: "資料夾路徑", placeholder: "/brand/assets", required: true },
    ],
  },
};

type Phase = "form" | "running" | "done" | "error";

export default function ProjectSyncModal({
  open, source, brandId, onClose, onComplete,
}: {
  open: boolean;
  source: SyncSource | null;
  brandId?: number | null;
  onClose: () => void;
  onComplete?: (jobId: number) => void;
}) {
  const [params, setParams] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>("form");
  const [jobId, setJobId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const startMutation = (trpc as any).projectSync.start.useMutation();

  const statusQuery = (trpc as any).projectSync.status.useQuery(
    { jobId: jobId ?? 0 },
    {
      enabled: jobId != null && (phase === "running"),
      refetchInterval: 1500,
      refetchOnWindowFocus: false,
    }
  );

  // Reset state on open/source change
  useEffect(() => {
    if (open) {
      setParams({});
      setPhase("form");
      setJobId(null);
      setErrorMsg(null);
    }
  }, [open, source]);

  // React to status updates
  useEffect(() => {
    const d = statusQuery.data;
    if (!d) return;
    if (d.status === "done") {
      setPhase("done");
      onComplete?.(d.id);
    } else if (d.status === "failed") {
      setPhase("error");
      setErrorMsg(d.errorMsg ?? "同步失敗");
    }
  }, [statusQuery.data]);

  if (!open || !source) return null;
  const spec = SPECS[source];

  const submit = async () => {
    setErrorMsg(null);
    // Required field check
    for (const f of spec.fields) {
      if (f.required && !(params[f.key] ?? "").trim()) {
        setErrorMsg(`請填寫「${f.label}」`);
        return;
      }
    }
    try {
      const res = await startMutation.mutateAsync({
        source: spec.id,
        params,
        brandId: brandId ?? null,
      });
      if (!res?.jobId) throw new Error("後端沒有回傳 jobId");
      setJobId(res.jobId);
      setPhase("running");
      if (res.ok === false) {
        // Pipedream not configured — status query will pick up the failed row
      }
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-[520px] rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.25)] overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-divider">
          <div className="text-[0.62rem] tracking-[0.18em] uppercase text-default-400">
            從雲端 / 網路同步
          </div>
          <div className="mt-0.5 text-[1.05rem] text-foreground">{spec.label}</div>
          <div className="mt-1 text-[0.78rem] text-default-500 leading-snug">{spec.blurb}</div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 min-h-[180px]">
          {phase === "form" && (
            <div className="space-y-3">
              {spec.fields.map((f) => (
                <div key={f.key}>
                  <label className="block text-[0.72rem] tracking-[0.06em] text-foreground mb-1">
                    {f.label}{f.required && <span className="text-[#D14] ml-0.5">*</span>}
                  </label>
                  <input
                    type="text"
                    value={params[f.key] ?? ""}
                    onChange={(e) => setParams((p) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 text-[0.86rem] bg-white border border-divider rounded-lg focus:outline-none focus:border-foreground transition"
                  />
                  {f.hint && (
                    <div className="mt-1 text-[0.66rem] text-default-500">{f.hint}</div>
                  )}
                </div>
              ))}
              {errorMsg && (
                <div className="px-3 py-2 text-[0.78rem] text-[#D14] bg-[#FEE] border border-[#FCC] rounded">
                  {errorMsg}
                </div>
              )}
            </div>
          )}

          {phase === "running" && (
            <div className="text-center py-6">
              <div className="inline-flex items-center gap-2 text-[0.86rem] text-foreground">
                <span className="inline-block w-2 h-2 rounded-full bg-foreground animate-pulse" />
                透過 Pipedream 同步中…
              </div>
              <div className="mt-3 max-w-[320px] mx-auto">
                <div className="h-1.5 bg-divider rounded-full overflow-hidden">
                  <div
                    className="h-full bg-foreground transition-all duration-500"
                    style={{ width: `${statusQuery.data?.progressPct ?? 5}%` }}
                  />
                </div>
                <div className="mt-2 text-[0.7rem] text-default-500">
                  已同步 {statusQuery.data?.assetCount ?? 0} 個資產
                </div>
              </div>
            </div>
          )}

          {phase === "done" && (
            <div className="text-center py-6">
              <div className="text-[2rem]">✓</div>
              <div className="mt-1 text-[0.92rem] text-foreground font-medium">同步完成</div>
              <div className="mt-1 text-[0.78rem] text-default-500">
                共匯入 {statusQuery.data?.assetCount ?? 0} 個資產到你的專案
              </div>
            </div>
          )}

          {phase === "error" && (
            <div className="py-2">
              <div className="px-3 py-2 text-[0.78rem] text-[#D14] bg-[#FEE] border border-[#FCC] rounded leading-relaxed">
                <div className="font-medium mb-1">同步失敗</div>
                <div className="break-all">{errorMsg ?? "未知錯誤"}</div>
              </div>
              <div className="mt-3 text-[0.7rem] text-default-500 leading-relaxed">
                若是 Pipedream workflow 未設定，請於後端 .env 加入 <code className="px-1 bg-divider/30 rounded">PIPEDREAM_WEBHOOK_{spec.id.toUpperCase().replace("-", "_")}</code>，
                指向你建立的 Pipedream 工作流 HTTP trigger URL。
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-divider flex items-center justify-end gap-2">
          {phase === "form" && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-[0.78rem] text-default-500 hover:text-foreground transition"
              >
                取消
              </button>
              <button
                onClick={submit}
                disabled={startMutation.isPending}
                className="px-4 py-2 text-[0.78rem] bg-foreground text-white hover:bg-foreground/90 disabled:opacity-50 rounded-full transition"
              >
                {startMutation.isPending ? "啟動中…" : "開始同步"}
              </button>
            </>
          )}
          {(phase === "running") && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-[0.78rem] text-default-500 hover:text-foreground transition"
            >
              在背景繼續
            </button>
          )}
          {(phase === "done" || phase === "error") && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-[0.78rem] bg-foreground text-white hover:bg-foreground/90 rounded-full transition"
            >
              關閉
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
