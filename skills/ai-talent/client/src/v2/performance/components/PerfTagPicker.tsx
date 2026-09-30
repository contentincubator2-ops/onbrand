/**
 * PerfTagPicker — 產出頁的「成效標籤」：這篇對哪個族群、講哪個 USP（或品牌自訂的任何維度）。
 *
 * 2026-09-29（CJ「從目標族群出發，看不同族群溝通哪個 USP 效果好」）。
 * 標籤存在 mission_outputs.metadata.perfTags；貼文發布後粉專回填會帶著它進 perf_facts，
 * 所以這一篇的觸及／互動會自動落在成效層矩陣的對應格子。
 * 下面的連結欄位把標籤寫進 utm_content，訂單匯出檔帶著 UTM 就能把營收也歸回同一格。
 */
import React from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faCheck } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../lib/trpc";

function utmContent(tags: Record<string, string>) {
  return Object.entries(tags).filter(([, v]) => v).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}.${v}`).join("~");
}

export default function PerfTagPicker({ outputId, platform }: { outputId: number; platform?: string }) {
  const perf = (trpc as any).performance;
  const q = perf?.outputTags?.useQuery ? perf.outputTags.useQuery({ outputId }, { enabled: outputId > 0, refetchOnWindowFocus: false }) : { data: undefined };
  const save = perf?.tagOutput?.useMutation ? perf.tagOutput.useMutation() : null;
  const [tags, setTags] = React.useState<Record<string, string>>({});
  const [url, setUrl] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => { if (q.data?.tags) setTags(q.data.tags); }, [q.data]);

  const dims: { key: string; label: string; values: { code: string; label: string }[] }[] = q.data?.dims ?? [];
  if (!q.data?.brandId) return null;

  const set = (k: string, v: string) => {
    const next = { ...tags };
    if (v) next[k] = v; else delete next[k];
    setTags(next);
    save?.mutate({ outputId, tags: next });
  };

  let tagged = "";
  if (url.trim()) {
    try {
      const u = new URL(url.trim());
      u.searchParams.set("utm_source", platform || "social");
      u.searchParams.set("utm_medium", "social");
      const c = utmContent(tags);
      if (c) u.searchParams.set("utm_content", c);
      tagged = u.toString();
    } catch { tagged = ""; }
  }

  return (
    <div className="rounded-lg border border-neutral-200 p-2.5">
      <div className="mb-1.5 text-[12.5px] font-medium text-neutral-800">成效標籤</div>
      {dims.length === 0 ? (
        <p className="m-0 text-[12.5px] leading-relaxed text-neutral-500">
          還沒有族群／USP。到 <Link to={`/performance/overview?b=${q.data.brandId}`} className="underline">成效層</Link> 從範本開始，就能在這裡標。
        </p>
      ) : (
        <div className="space-y-1.5">
          {dims.map((d) => (
            <select key={d.key} value={tags[d.key] ?? ""} onChange={(e) => set(d.key, e.target.value)}
              className="w-full rounded-md border border-neutral-200 px-2 py-1 text-[12.5px]">
              <option value="">{d.label}：未標</option>
              {d.values.map((v) => <option key={v.code} value={v.code}>{d.label}：{v.label}</option>)}
            </select>
          ))}
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="貼商品頁網址，產生帶標籤的連結"
            className="w-full rounded-md border border-neutral-200 px-2 py-1 text-[12.5px]" />
          {tagged && (
            <button type="button" onClick={async () => { await navigator.clipboard.writeText(tagged); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="flex w-full items-center gap-1.5 truncate rounded-md bg-neutral-50 px-2 py-1 text-left text-[12px] text-neutral-700" title={tagged}>
              <FontAwesomeIcon icon={copied ? faCheck : faCopy} /> <span className="truncate">{tagged}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
