import React, { useEffect, useRef, useState } from "react";
import { Check, Copy, Info, LoaderCircle, ShieldCheck } from "lucide-react";
import { trpc } from "../../../lib/trpc";
import CompliancePanel, { type ComplianceReport } from "../CompliancePanel";
import { Card, ErrorNote, SectionTitle, cx } from "../ui";
import type { Pack, RepRow } from "./content-types";

type Market = "US" | "TW";

const PRESETS: Record<Market, Array<{ label: string; text: string }>> = {
  US: [
    {
      label: "Hype, fake stat, wrong price",
      text: "ExpertHub is the best platform in Taiwan — guaranteed ROI! 80% of our clients doubled revenue. Way cheaper than Microsoft. Only $299/month. Sign up at https://experthub.asus.com",
    },
    {
      label: "#1 claim, unapproved price",
      text: "Excited to share Zynkr — the #1 AI sales tool, risk-free, just NT$9,900/year!",
    },
    {
      label: "Clean post, cited stat",
      text: "I work at ASUS. Only 7.4% of Taiwan SMBs have adopted or are planning AI, per the 2025 SME White Paper — a diagnosis is the easiest first step.",
    },
  ],
  TW: [
    {
      label: "Hype, fake stat, wrong price",
      text: "全台最便宜的電子簽核！保證三個月營收成長 50%，每月只要 NT$499，比中華電信划算，快到 https://experthub.asus.com/smb 報名",
    },
    {
      label: "Absolute claims",
      text: "閃電下單是業界第一的點餐系統，零風險導入，一定能幫你省下人力！",
    },
    {
      label: "Clean post, cited stat",
      text: "我在華碩 ExpertHub 服務。台灣有超過 98% 的企業是中小企業，數位轉型可以從一次免費診斷開始。",
    },
  ],
};

const MAX_CHARS = 5000;

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Non-secure origins (e.g. a LAN IP at the booth) have no Clipboard API.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }
}

export default function ContentChecker({ packs }: { packs: Pack[] }) {
  const reps = trpc.hub.admin.reps.useQuery(undefined, { staleTime: 60_000 });
  const repList: RepRow[] = reps.data ?? [];

  const [repId, setRepId] = useState<number | null>(null);
  const [text, setText] = useState(PRESETS.US[0].text);
  const [presetIdx, setPresetIdx] = useState<number | null>(0);
  const [checked, setChecked] = useState<{ repId: number; text: string } | null>(null);
  const [copied, setCopied] = useState<"idle" | "ok" | "failed">("idle");
  const resultRef = useRef<HTMLDivElement>(null);

  const check = trpc.hub.rep.checkDraft.useMutation({
    onSuccess: () => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
  });

  useEffect(() => {
    if (repId != null || !repList.length) return;
    const preferred = repList.find((r) => r.avatarSeed === "priya") ?? repList.find((r) => r.market === "US") ?? repList[0];
    setRepId(preferred.id);
  }, [repList, repId]);

  const rep = repList.find((r) => r.id === repId) ?? null;
  const market: Market = rep?.market === "TW" ? "TW" : "US";
  const presets = PRESETS[market];
  const pack = packs.find((p) => p.market === market);

  // If the box still holds a preset when the market flips, swap to the same preset in that market's language.
  const lastMarket = useRef<Market>(market);
  useEffect(() => {
    if (lastMarket.current === market) return;
    lastMarket.current = market;
    if (presetIdx != null) setText(PRESETS[market][presetIdx].text);
  }, [market, presetIdx]);

  useEffect(() => {
    if (copied === "idle") return;
    const t = window.setTimeout(() => setCopied("idle"), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const canRun = Boolean(repId && text.trim() && !check.isPending);
  const run = () => {
    if (!repId || !text.trim()) return;
    setCopied("idle");
    setChecked({ repId, text });
    check.mutate({ repId, text });
  };

  const result = check.data;
  const stale = Boolean(result && checked && !check.isPending && (checked.repId !== repId || checked.text !== text));
  const usReps = repList.filter((r) => r.market === "US");
  const twReps = repList.filter((r) => r.market !== "US");
  const repLabel = (r: RepRow) => `${r.name} · ${r.market}`;

  return (
    <Card className="min-w-0" pad={false}>
      <div id="checker" className="scroll-mt-28 p-5 sm:p-6">
        <SectionTitle
          title="Compliance checker — try to break it"
          hint="Paste any draft. The checker enforces disclosure, approved prices, no absolute claims, sourced statistics, no competitor comparisons and tracked links — and fixes what it can."
        />

        <div className="mt-4 grid gap-6 xl:grid-cols-2">
          {/* Input */}
          <div className="min-w-0 space-y-4">
            <div>
              <label htmlFor="checker-rep" className="text-[12px] font-medium text-stone-700">
                Post as
              </label>
              <select
                id="checker-rep"
                value={repId ?? ""}
                disabled={!repList.length}
                onChange={(e) => {
                  setRepId(Number(e.target.value));
                }}
                className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2.5 py-2 text-[16px] text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-200 sm:text-[14px]"
              >
                {!repList.length ? <option value="">{reps.isLoading ? "Loading reps…" : "No reps found"}</option> : null}
                {usReps.length ? (
                  <optgroup label="United States">
                    {usReps.map((r) => (
                      <option key={r.id} value={r.id}>
                        {repLabel(r)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {twReps.length ? (
                  <optgroup label="Taiwan">
                    {twReps.map((r) => (
                      <option key={r.id} value={r.id}>
                        {repLabel(r)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
              {reps.error ? (
                <div className="mt-2">
                  <ErrorNote error={reps.error} />
                </div>
              ) : pack ? (
                <p className="mt-1 text-[12px] text-stone-500">
                  Checked against <span className="text-stone-700">{pack.name}</span>
                </p>
              ) : null}
            </div>

            <div>
              <div className="text-[12px] font-medium text-stone-700">Try a preset</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {presets.map((p, i) => (
                  <button
                    key={p.label}
                    type="button"
                    aria-pressed={presetIdx === i && text === p.text}
                    onClick={() => {
                      setText(p.text);
                      setPresetIdx(i);
                    }}
                    className={cx(
                      "rounded-full border px-2.5 py-1 text-[12px]",
                      presetIdx === i && text === p.text
                        ? "border-stone-900 bg-stone-900 text-white"
                        : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11.5px] text-stone-500">
                {market === "US" ? "US presets are in English." : "Taiwan presets are in Traditional Chinese."}
              </p>
            </div>

            <div>
              <label htmlFor="checker-text" className="text-[12px] font-medium text-stone-700">
                Draft
              </label>
              <textarea
                id="checker-text"
                value={text}
                maxLength={MAX_CHARS}
                rows={7}
                placeholder="Paste or type a post draft…"
                onChange={(e) => {
                  setText(e.target.value);
                  setPresetIdx(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canRun) {
                    e.preventDefault();
                    run();
                  }
                }}
                className="mt-1 block w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-2 text-[16px] leading-relaxed text-stone-900 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-200 sm:text-[14px]"
              />
              <div className="mt-1 flex items-center justify-between gap-2 text-[11.5px] text-stone-500">
                <button
                  type="button"
                  onClick={() => {
                    setText("");
                    setPresetIdx(null);
                  }}
                  className="rounded px-1 py-0.5 hover:bg-stone-100 hover:text-stone-800"
                  disabled={!text}
                >
                  Clear
                </button>
                <span className="tabular-nums">
                  {text.length.toLocaleString("en-US")} / {MAX_CHARS.toLocaleString("en-US")}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={run}
              disabled={!canRun}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-stone-900 px-4 py-2.5 text-[14px] font-medium text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {check.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
              {check.isPending ? "Checking…" : "Check against policy"}
            </button>
          </div>

          {/* Result */}
          <div ref={resultRef} className="min-w-0 scroll-mt-28" aria-live="polite" aria-busy={check.isPending}>
            {check.error ? (
              <ErrorNote error={check.error} />
            ) : result ? (
              <div className={cx("space-y-3 transition-opacity", check.isPending && "opacity-50")}>
                {stale ? (
                  <div className="flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-[12px] text-stone-600">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>The draft or rep changed since this check. Run it again to update the result.</span>
                  </div>
                ) : null}
                <CompliancePanel report={result.compliance as ComplianceReport} before={result.original} after={result.fixed} />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <button
                    type="button"
                    onClick={async () => setCopied((await copyToClipboard(result.fixed)) ? "ok" : "failed")}
                    className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-[13px] font-medium text-stone-800 hover:bg-stone-50"
                  >
                    {copied === "ok" ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                    {copied === "ok" ? "Copied" : copied === "failed" ? "Copy failed — select the text" : "Copy compliant version"}
                  </button>
                  <span className="min-w-0 break-all text-[12px] text-stone-500">
                    Tracked link: <span className="font-mono text-stone-700">{result.trackedLink}</span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-stone-300 px-6 py-10 text-center">
                {check.isPending ? (
                  <>
                    <LoaderCircle className="h-5 w-5 animate-spin text-stone-500" aria-hidden />
                    <p className="text-[13px] text-stone-600">Checking against {pack?.name ?? "policy"}…</p>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-5 w-5 text-stone-400" aria-hidden />
                    <p className="max-w-xs text-[13px] text-stone-500">
                      Results show here: each rule, what was caught, and the compliant version ready to post.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
